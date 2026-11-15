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
const { renderToStaticMarkup } = require('react-dom/server');
const user = { id:5,name:'A Reader',email:'reader@example.com' };
const first = { id:42,name:'Sunday table',description:'Our real Nook',role:'owner',createdAt:'2026-01-01',updatedAt:'2026-02-01' };
const second = { ...first,id:43,name:'Weekend walks',role:'member',updatedAt:'2026-03-01' };
const render = (Component,props) => renderToStaticMarkup(React.createElement(Component,props));

test('real ID parsing excludes fixture slugs and ambiguous numeric strings; tabs use membership role and actual timestamps', () => {
 const { numericNookId,realNookHref,filterNooks }=loader()('@/lib/frontend/real-nooks');
 for(const id of ['rivera-family','0','-1','42x','01','1e3','1.5','2147483648']) assert.equal(numericNookId(id),null);
 assert.equal(realNookHref(42),'/circles/42');assert.throws(()=>realNookHref('rivera-family'));
 assert.deepEqual(filterNooks([first,second],'my','').map(n=>n.id),[42,43]);
 assert.deepEqual(filterNooks([first,second],'shared','').map(n=>n.id),[43]);
 assert.deepEqual(filterNooks([first,second],'recent','').map(n=>n.id),[43,42]);
 assert.deepEqual(filterNooks([first,second],'my','REAL').map(n=>n.id),[42,43]);
});

test('real windows retain door controls and numeric links without fictional assets or counts', () => {
 const Window=loader()('@/components/solibra/nook-window').NookWindow;
 const html=render(Window,{nook:first,initialOpen:true});
 assert.ok(html.includes('Close Sunday table doors'));assert.ok(html.includes('/circles/42'));assert.ok(html.includes('Owner'));
 assert.ok(!html.includes('38 memories'));assert.ok(!html.includes('<img'));assert.ok(html.includes('nook-door-left'));
});

function dataLoader(responses,extra={}) {
 return loader({
  'next/navigation': { useRouter:()=>({replace(){}}),useSearchParams:()=>new URLSearchParams() },
  '@/components/solibra/use-nook-data': {useNookData:(url,id)=>{assert.equal(id,5);return responses[url] || {};}},
  '@/components/solibra/shell': {DesignIcon:()=>null},
  ...extra
 });
}
test('authenticated Library shows real records only, signed-out state makes no private reads, and failed reads never use demos', () => {
 const api=loader()('@/lib/frontend/nook-api');
 const Library=dataLoader({'/api/nooks':{data:{nooks:[first,second]}},'/api/nook-invitations':{data:{invitations:[]}}})('@/components/solibra/library').Library;
 const html=render(Library,{user});assert.ok(html.includes('A Reader'));assert.ok(html.includes('Sunday table'));assert.ok(!html.includes('Rivera'));assert.ok(!html.includes('Sofía'));assert.ok(!html.includes('family-window'));
 const SignedOut=dataLoader({}, {'@/lib/frontend/nook-api':api,'@/components/solibra/use-nook-data':{useNookData(){throw new Error('Private read while signed out');}}})('@/components/solibra/library').Library;
 const signedOut=render(SignedOut,{user:null});assert.ok(signedOut.includes('/demo'));assert.ok(signedOut.includes('Sign In'));assert.ok(!signedOut.includes('Sunday table'));
 const Failed=dataLoader({'/api/nooks':{error:new api.NookRequestError(403,'No permission')},'/api/nook-invitations':{data:{invitations:[]}}},{'@/lib/frontend/nook-api':api})('@/components/solibra/library').Library;
 const failure=render(Failed,{user});assert.ok(failure.includes('No permission'));assert.ok(!failure.includes('The Rivera family'));
});

test('real interiors use authorized members and artifact metadata; only owner descriptions are editable', () => {
 for (const role of ['owner','member']) {
  const Real=dataLoader({
   '/api/nooks/42':{data:{nook:{...first,role}}},
   '/api/nooks/42/members':{data:{members:[{id:91,nookId:42,userId:8,role:'member',joinedAt:'2026-01-01',user:{id:8,name:'Actual Member',email:'PRIVATE_EMAIL@example.com'}}]}},
   '/api/nooks/42/artifacts':{data:{artifacts:[{id:71,nookId:42,title:'A written memory',description:'Kept together',type:'text',createdAt:'2026-01-01'}]}}
  })('@/components/solibra/real-nook').RealNook;
  const html=render(Real,{nookId:42,viewerId:5});
  assert.ok(html.includes('Sunday table'));assert.ok(html.includes('Actual Member'));assert.ok(html.includes('1 member'));assert.ok(html.includes('A written memory'));assert.ok(html.includes('/circles/42/memories/71'));assert.ok(html.includes('/circles/42/memories/new'));
  assert.equal(html.includes('Edit description'),role==='owner');assert.ok(!html.includes('PRIVATE_EMAIL'));assert.ok(!html.includes('kitchen-memory'));assert.ok(!html.includes('Elena'));assert.ok(!html.includes('<img'));
 }
});

test('inaccessible Nooks hide all cached details; child resource reads wait for Nook verification', () => {
 const api=loader()('@/lib/frontend/nook-api');const {NookRequestError}=api;const paths=[];
 const Real=dataLoader({}, {'@/lib/frontend/nook-api':api,'@/components/solibra/use-nook-data':{useNookData(url){paths.push(url);return url==='/api/nooks/42'?{data:{nook:first},error:new NookRequestError(404,'Unavailable')}:{data:{members:[],artifacts:[]}};}}})('@/components/solibra/real-nook').RealNook;
 const html=render(Real,{nookId:42,viewerId:5});assert.ok(html.includes('Unavailable'));assert.ok(!html.includes('Sunday table'));assert.deepEqual(paths,['/api/nooks/42',null,null]);
});

test('PATCH/accept adapters use numeric IDs and authenticated contracts, preserving distinct HTTP error states', async () => {
 const realFetch=global.fetch;const calls=[];const api=loader()('@/lib/frontend/nook-api');
 global.fetch=async(url,options)=>{calls.push({url,...options});return Response.json(options.method==='PATCH'?{nook:first}:{nookId:42});};
 try {
  await api.saveNookDescription(42,{description:'Changed'});await api.acceptInvitation(42,7);
  assert.equal(calls[0].url,'/api/nooks/42');assert.deepEqual(JSON.parse(calls[0].body),{description:'Changed'});assert.equal(calls[0].credentials,'same-origin');
  assert.equal(calls[1].url,'/api/nooks/42/invitations/7/accept');assert.equal(calls[1].method,'POST');
  await assert.rejects(api.saveNookDescription('rivera-family',{description:'No'}));assert.equal(calls.length,2);
  for(const status of [401,403,404,409]){global.fetch=async()=>Response.json({error:{code:'ERROR',message:'No'}},{status});await assert.rejects(api.nookRequest('/api/nooks/42'),error=>error.status===status);}
  global.fetch=async()=>{throw new Error('Offline');};await assert.rejects(api.nookRequest('/api/nooks'),error=>error.status===0);
 } finally {global.fetch=realFetch;}
});

test('private SWR reads and Nook refreshes are scoped to the authenticated account', async () => {
 let captured;
 const use=loader({swr:{default:(key)=>{captured=key;return{};},mutate:async()=>{}}})('@/components/solibra/use-nook-data').useNookData;
 use('/api/nooks',5);assert.deepEqual(captured,['/api/nooks',5]);use('/api/nooks',null);assert.equal(captured,null);
 const refresh=loader({swr:{mutate:async predicate=>{assert.ok(predicate(['/api/nooks',5]));assert.ok(!predicate(['/api/nooks',6]));assert.ok(!predicate(['/api/nooks/42/members',5]));}}})('@/lib/frontend/nook-cache').refreshNookLists;
 await refresh(5);
});

function harness(Component,props) {
 const slots=[];let cursor=0;
 const react={...React,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},useEffect(){},useId(){return 'field';}};
 function nodes(el){return !el||typeof el!=='object'?[]:[el,...[el.props?.children].flat(Infinity).flatMap(nodes)];}
 return {react,bind(load){Component=load;},tree(){cursor=0;return nodes(Component(props));}};
}

test('accepting an inbox invitation performs no pre-membership Nook lookup, refreshes membership caches and prevents repeat clicks', async () => {
 let resolve;let accepts=0;let refreshed=0;let inboxRefresh=0;
 const h=harness(null,{viewerId:5});
 const Component=loader({react:h.react,'@/components/solibra/use-nook-data':{useNookData(path,id){assert.equal(path,'/api/nook-invitations');assert.equal(id,5);return{data:{invitations:[{id:7,nookId:42,role:'member',status:'pending',invitedAt:'2026-01-01'}]},mutate:async()=>inboxRefresh++};}},'@/lib/frontend/nook-api':{acceptInvitation:(id,invitationId)=>{assert.equal(id,42);assert.equal(invitationId,7);accepts++;return new Promise(done=>resolve=done);}},'@/lib/frontend/nook-cache':{refreshNookLists:async id=>{assert.equal(id,5);refreshed++;}}})('@/components/solibra/invitation-inbox').InvitationInbox;
 h.bind(Component);const click=h.tree().find(el=>el.type==='button'&&el.props.children==='Accept invitation').props.onClick;
 click();click();assert.equal(accepts,1);resolve({nookId:42});await new Promise(done=>setImmediate(done));
 assert.equal(refreshed,1);assert.equal(inboxRefresh,1);assert.ok(h.tree().some(el=>el.props?.href==='/circles/42'));
});

test('description errors retain drafts, and permission loss removes owner editing controls', async () => {
 const props={description:'Old description',editor:{nook:{id:42,role:'owner'},save:async()=>{throw new Error('Denied');}}};
 const h=harness(null,props);h.bind(loader({react:h.react})('@/components/solibra/nook-description').NookDescription);
 h.tree().find(el=>el.type==='button'&&el.props.children==='Edit description').props.onClick();
 h.tree().find(el=>el.type==='textarea').props.onChange({target:{value:'My retained draft'}});
 await h.tree().find(el=>el.type==='form').props.onSubmit({preventDefault(){}});
 assert.equal(h.tree().find(el=>el.type==='textarea').props.value,'My retained draft');
 assert.ok(h.tree().some(el=>el.props?.role==='alert'&&String(el.props.children).includes('draft is still here')));
 props.editor.nook.role='member';assert.ok(!h.tree().some(el=>el.type==='textarea'));assert.ok(h.tree().some(el=>el.props?.role==='alert'));
});

test('bookshelf distinguishes initial loading, cached revalidation, empty and denied states',()=>{
 const api=loader()('@/lib/frontend/nook-api');
 for(const [resource,expected]of [[{},'sol-skeleton'],[{data:{artifacts:[]}},'Your shelf is ready'],[{data:{artifacts:[{id:71,nookId:42,title:'Real words',type:'text',createdAt:'2026-01-01'}]},isValidating:true},'Real words'],[{data:{artifacts:[{title:'PRIVATE STALE'}]},error:new api.NookRequestError(403,'Access ended')},'Access ended']]) {
  const Real=dataLoader({'/api/nooks/42':{data:{nook:first}},'/api/nooks/42/members':{data:{members:[]}},'/api/nooks/42/artifacts':resource},{'@/lib/frontend/nook-api':api})('@/components/solibra/real-nook').RealNook;
  const html=render(Real,{nookId:42,viewerId:5});assert.ok(html.includes(expected));assert.ok(!html.includes('PRIVATE STALE'));if(resource.data)assert.ok(!html.includes('memory-book sol-skeleton'));
 }
});
