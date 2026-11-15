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

test('members see private audio and persisted source/translation without sender management controls',()=>{
 const requests=[];const Component=loader({'@/components/solibra/use-nook-data':{useNookData:(path,viewer)=>{requests.push([path,viewer]);return {data:{translations:[{id:1,messageId:30,targetLanguage:'en',translatedText:'Saved translation'}]},mutate:async()=>{}};}}})('@/components/solibra/audio-message').AudioMessage;
 const message={id:30,nookId:10,senderId:1,type:'audio',audioUrl:'/api/nooks/10/messages/30/media',originalTranscript:'Original words',sourceLanguage:'es'};
 const html=render(Component,{message,viewerId:2,canManage:false,onChanged:async()=>{}});
 assert.match(html,/\/api\/nooks\/10\/messages\/30\/media/);assert.match(html,/Original words/);assert.match(html,/Saved translation/);assert.doesNotMatch(html,/Remove recording|Replace recording|Transcribe and translate/);assert.deepEqual(requests,[['/api/nooks/10/messages/30/translations',2]]);
});
test('sender audio UI exposes explicit processing and replacement, with no automatic provider request',()=>{
 const Component=loader({'@/components/solibra/use-nook-data':{useNookData:()=>({data:{translations:[]},mutate:async()=>{}})}})('@/components/solibra/audio-message').AudioMessage;
 const html=render(Component,{message:{id:30,nookId:10,type:'audio',audioUrl:'/api/nooks/10/messages/30/media'},viewerId:1,canManage:true,onChanged:async()=>{}});
 assert.match(html,/Transcribe and translate/);assert.match(html,/Replace recording/);assert.match(html,/Remove recording/);assert.match(html,/<select/);
});

