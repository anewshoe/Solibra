const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function loader(overrides = {}) {
  const cache = new Map();
  function load(name) {
    if (Object.hasOwn(overrides, name)) return overrides[name];
    if (!name.startsWith('@/')) return require(name);
    if (cache.has(name)) return cache.get(name).exports;
    const stem = path.resolve(__dirname, '..', name.slice(2));
    const file = fs.existsSync(`${stem}.ts`) ? `${stem}.ts` : `${stem}.tsx`;
    const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const module = { exports: {} }; cache.set(name, module);
    const requireFromFile = (child) => load(child.startsWith('.') ? '@/' + path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(file), child)).split(path.sep).join('/') : child);
    new Function('require', 'module', 'exports', js)(requireFromFile, module, module.exports);
    return module.exports;
  }
  return load;
}

const React = require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const render=(Component,props)=>renderToStaticMarkup(React.createElement(Component,props));

test('public hero preserves auth destinations and places its only demo link below the auth group',()=>{
  const html=render(loader()('@/components/solibra/public-landing').PublicLanding,{});
  const hero=html.slice(html.indexOf('class="landing-hero"'),html.indexOf('class="landing-features"'));
  assert.match(hero,/href="\/sign-up"/);assert.match(hero,/href="\/sign-in"/);
  assert.match(hero,/Sign In<\/a><\/div><a class="landing-demo-link" href="\/demo"/);
  assert.equal((hero.match(/href="\/demo"/g)||[]).length,1);
  assert.match(html,/A shelf full of possibilities/);assert.match(html,/Click me!/);
});

test('whole preview window repeatedly toggles, restores keyboard focus and contains decorative books only',()=>{
  let open=false,focused=0;
  const load=loader({react:{...React,useState:()=>[open,value=>{open=typeof value==='function'?value(open):value;}],useId:()=> 'preview',useRef:()=>({current:{focus:()=>focused++}})},
    '@/components/solibra/window-memories':{WindowMemories:()=>{throw Error('Private reads must not render');}}});
  const Window=load('@/components/solibra/nook-window').NookWindow;
  const circle=load('@/lib/fixtures/library').sampleCircles[0];
  const flatten=node=>!node||typeof node!=='object'?[]:[node,...React.Children.toArray(node.props?.children).flatMap(flatten)];
  let tree=Window({circle,publicPreview:true});
  let nodes=flatten(tree);assert.equal(tree.props['data-open'],false);
  assert.equal(nodes.find(n=>n.props.id==='preview'&&n.props.className?.includes('nook-interior')).props.hidden,true);
  const books=nodes.filter(n=>n.props.className==='landing-window-book');assert.equal(books.length,3);assert.ok(books.every(book=>book.type==='span'&&!book.props.href&&!book.props.onClick&&!book.props.tabIndex));
  assert.equal(nodes.filter(n=>n.type==='button').length,1);assert.ok(!nodes.some(n=>n.props.className==='landing-window-control'));
  nodes.find(n=>n.props['aria-label']==='Open the demo window').props.onClick();assert.equal(open,true);
  tree=Window({circle,publicPreview:true});nodes=flatten(tree);
  assert.equal(nodes.find(n=>n.type==='button').props['aria-expanded'],true);
  assert.equal(nodes.find(n=>n.props.id==='preview'&&n.props.className?.includes('nook-interior')).props.hidden,false);
  nodes.find(n=>n.type==='button').props.onClick();assert.equal(open,false);
  nodes.find(n=>n.type==='button').props.onClick();assert.equal(open,true);
  tree.props.onKeyDown({key:'Escape'});assert.equal(open,false);assert.equal(focused,1);
});

test('shell renders exactly one header for public and authenticated routes with public navigation on mobile',()=>{
  for(const signedOut of [true,false]){
    const Shell=loader({
      'next/navigation':{usePathname:()=> '/',useRouter:()=>({push(){},refresh(){}})},
      swr:{__esModule:true,default:()=>({data:null}),mutate:async()=>{}},
      '@/app/(login)/actions':{signOut:async()=>{}}
    })('@/components/solibra/shell').SolibraShell;
    const html=render(Shell,{signedOut,children:React.createElement('main',{id:'main-content'})});
    assert.equal((html.match(/<header/g)||[]).length,1);
    if(signedOut){assert.match(html,/landing-navigation/);assert.doesNotMatch(html,/href="\/demo"/);assert.match(html,/href="\/sign-in"/);assert.match(html,/href="\/sign-up"/);assert.doesNotMatch(html,/aria-label="Mobile navigation"/);}
    else {assert.doesNotMatch(html,/landing-navigation/);assert.match(html,/aria-label="Mobile navigation"/);}
  }
});

test('authenticated Library omits the old sunlight overlay while retaining its welcome and collection',()=>{
  const Library=loader({
    'next/navigation':{useSearchParams:()=>new URLSearchParams(),useRouter:()=>({replace(){}})},
    '@/components/solibra/use-nook-data':{useNookData:()=>({data:{nooks:[]}})},
    '@/components/solibra/invitation-inbox':{InvitationInbox:()=>null},
    '@/components/solibra/shell':{DesignIcon:()=>null}
  })('@/components/solibra/library').Library;
  const html=render(Library,{user:{id:1,name:'Reader',email:'reader@example.test'}});
  assert.doesNotMatch(html,/library-sunlight|soft-sunlight/);assert.match(html,/Welcome, Reader/);assert.match(html,/Your private library wall/);
});

