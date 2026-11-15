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

test('book colors are stable, cover the existing palette, and match miniature books',()=>{
 const load=loader();const {memoryBookAppearance}=load('@/lib/frontend/memory-books');const {NOOK_DOOR_COLORS}=load('@/lib/frontend/nook-colors');
 const colors=new Set();for(let id=1;id<100;id++){const first=memoryBookAppearance(id);assert.deepEqual(first,memoryBookAppearance(id));assert.ok(NOOK_DOOR_COLORS.includes(first.color));colors.add(first.color);}
 assert.equal(colors.size,5);
 const artifact={id:42,nookId:7,title:'Our real memory',type:'text',createdAt:'2026-11-15',mediaStorageKey:null};
 const book=render(load('@/components/solibra/memory-book').MemoryBook,{artifact});
 const mini=render(loader({'@/components/solibra/use-nook-data':{useNookData:()=>({data:{artifacts:[artifact]}})}})('@/components/solibra/window-memories').WindowMemories,{nookId:7,viewerId:5,open:true});
 const expected=`data-book-color="${memoryBookAppearance(42).color}"`;assert.ok(book.includes(expected));assert.ok(mini.includes(expected));assert.ok(book.includes('/circles/7/memories/42'));assert.ok(!mini.includes('<a'));
});

test('window reads are lazy, account-scoped, and hide stale or foreign artifacts on errors',()=>{
 for(const [open,viewer,error,expected]of [[false,5,null,null],[true,undefined,null,null],[true,5,null,'/api/nooks/7/artifacts'],[true,5,new Error('Access ended'),'/api/nooks/7/artifacts']]){
  const calls=[];const Window=loader({'@/components/solibra/use-nook-data':{useNookData:(path,account)=>{calls.push([path,account]);return{data:{artifacts:[{id:1,nookId:7},{id:2,nookId:99}]},error};}}})('@/components/solibra/window-memories').WindowMemories;
  const html=render(Window,{nookId:7,viewerId:viewer,open});assert.deepEqual(calls,[[expected,viewer??null]]);assert.equal((html.match(/class="window-memory-book"/g)||[]).length,open&&viewer&&!error?1:0);assert.ok(!html.includes('<a'));
 }
});

test('each group card is a single real conversation link without a nested control',()=>{
 const Selector=loader({'@/components/solibra/use-nook-data':{useNookData:()=>({data:{nooks:[{id:7,name:'Our people'}]}})}})('@/components/solibra/message-nook-selector').MessageNookSelector;
 const html=render(Selector,{viewerId:5});assert.ok(html.includes('message-group-card'));assert.ok(html.includes('href="/messages/7"'));assert.ok(!html.includes('Open conversation'));assert.ok(!html.includes('<button'));assert.equal((html.match(/<a /g)||[]).length,1);
});

test('signed-out landing has account/demo actions, official branding and no private reads or records',()=>{
 const Library=loader({'@/components/solibra/use-nook-data':{useNookData(){throw new Error('Private read');}},'@/components/solibra/shell':{DesignIcon:()=>null}})('@/components/solibra/library').Library;
 const html=render(Library,{user:null});for(const href of ['/sign-up','/sign-in','/demo'])assert.ok(html.includes(`href="${href}"`));assert.equal((html.match(/<img[^>]+solibra-logo.png/g)||[]).length,1);assert.ok(html.includes('fictional samples'));assert.ok(!html.includes('/api/nooks'));assert.ok(!html.includes('nook-collection'));assert.ok(!html.includes('Rivera'));
});

test('loading placeholders are decorative, reduced-motion safe, and contain no invented records',()=>{
 const load=loader();const {BookSkeletons,WindowSkeletons,PageSkeleton}=load('@/components/solibra/loading');
 const books=render(BookSkeletons,{});assert.equal((books.match(/memory-book-slot/g)||[]).length,5);assert.ok(books.includes('aria-hidden="true"'));assert.ok(!books.includes('<a'));assert.ok(!books.includes('<h3'));
 const windows=render(WindowSkeletons,{});assert.ok(windows.includes('aria-busy="true"'));assert.ok(windows.includes('role="status"'));assert.ok(!windows.includes('<button'));
 const memory=render(PageSkeleton,{kind:'memory',label:'Opening your memory…'});assert.ok(memory.includes('loading-memory'));assert.ok(!memory.includes('Rivera'));assert.ok(!memory.includes('/api/'));
 const css=fs.readFileSync(path.resolve(__dirname,'../components/solibra/ui-polish.css'),'utf8');assert.match(css,/@media\(prefers-reduced-motion: reduce\)[^}]+\.sol-skeleton[^}]+animation: none/s);
});

test('miniature books appear only during initial authorized open-window loading',()=>{
 for(const [open,data,error,count] of [[false,undefined,undefined,0],[true,undefined,undefined,8],[true,{artifacts:[]},undefined,0],[true,undefined,new Error('No access'),0]]) {
  const Mini=loader({'@/components/solibra/use-nook-data':{useNookData:()=>({data,error})}})('@/components/solibra/window-memories').WindowMemories;
  const html=render(Mini,{nookId:7,viewerId:5,open});assert.equal((html.match(/window-memory-book sol-skeleton/g)||[]).length,count);assert.ok(!html.includes('<a'));
 }
});
