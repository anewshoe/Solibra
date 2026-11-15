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

test('WebM duration finalization preserves every cluster byte for 10, 30, 60 and 120 second recordings',async()=>{
 const {finalizeWebmDuration}=loader()('@/lib/voice/webm-duration');
 // EBML header, unknown-size segment, Info.TimestampScale, and sample cluster bytes.
 const prefix=Uint8Array.from([0x1a,0x45,0xdf,0xa3,0x80,0x18,0x53,0x80,0x67,0xff,0x15,0x49,0xa9,0x66,0x87,0x2a,0xd7,0xb1,0x83,0x0f,0x42,0x40]);
 const blocks=Uint8Array.from([0x1f,0x43,0xb6,0x75,0x84,1,2,3,4]);
 for(const seconds of [10,30,60,120]){
   const blob=new Blob([prefix,blocks],{type:'audio/webm;codecs=opus'});const fixed=await finalizeWebmDuration(blob,seconds*1000);assert.equal(fixed.size,blob.size+11);const bytes=new Uint8Array(await fixed.arrayBuffer());assert.deepEqual(bytes.slice(-blocks.length),blocks);assert.equal(new DataView(bytes.buffer).getFloat64(prefix.length+3),seconds*1000);
 }
});
test('non-WebM, unsupported and indexed containers pass through rather than risking audio corruption',async()=>{
 const {finalizeWebmDuration}=loader()('@/lib/voice/webm-duration');for(const type of ['audio/mp4','audio/webm']){const blob=new Blob(['not a recorder header'],{type});assert.equal(await finalizeWebmDuration(blob,30000),blob);}
 const indexed=new Blob([Uint8Array.from([0x18,0x53,0x80,0x67,0xff,0x11,0x4d,0x9b,0x74,0x80,0x15,0x49,0xa9,0x66,0x80])],{type:'audio/webm'});assert.equal(await finalizeWebmDuration(indexed,30000),indexed);
});

