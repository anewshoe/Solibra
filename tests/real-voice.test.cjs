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

const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
const contribution={id:8,artifactId:7,authorId:5,type:'audio',content:null,audioStorageKey:'opaque-private-key',originalTranscript:'Recuerdo',sourceLanguage:'es',processingStatus:'completed',createdAt:'2026-11-15',updatedAt:'2026-11-15'};
const translation={id:1,contributionId:8,sourceLanguage:'es',targetLanguage:'fr',translatedText:'Souvenir',createdAt:'2026-11-15'};
const blob=new Blob([Uint8Array.from([0x1a,0x45,0xdf,0xa3,...Array(28).fill(0)])],{type:'audio/webm;codecs=opus'});

test('voice save retains confirmed IDs through contribution and upload failures without duplicate records',async()=>{
 let artifacts=0,contributions=0,uploads=0,failContribution=true,failUpload=true,attached=false;
 const base=loader()('@/lib/frontend/real-memories');
 const api=loader({'@/lib/frontend/real-memories':{...base,createAudioContribution:async(n,a)=>{contributions++;assert.equal(n,42);assert.equal(a,7);if(failContribution)throw new base.MemoryWriteError(400,'Retry contribution');return{contribution:{...contribution,audioStorageKey:null}};}},'@/lib/frontend/nook-api':{...loader()('@/lib/frontend/nook-api'),nookRequest:async()=>({contribution:{...contribution,audioStorageKey:attached?'key':null}})},'@/lib/frontend/media-client':{uploadPrivateMedia:async(path,file)=>{uploads++;assert.equal(path,'/api/nooks/42/artifacts/7/contributions/8/media');assert.equal(file,blob);if(failUpload)throw new Error('Failed upload');attached=true;return{media:{url:path,byteSize:blob.size,contentType:'audio/webm'},cleanupPending:true};}}})('@/lib/frontend/persisted-voice-client');
 const flow=new api.VoiceSaveFlow(42,5);const create=async()=>{artifacts++;return{id:7,nookId:42,creatorId:5,type:'audio'};};
 await assert.rejects(flow.save(blob,create,()=>{}));assert.equal(flow.artifactId,7);assert.equal(flow.contributionId,undefined);assert.equal(flow.saved,false);
 failContribution=false;await assert.rejects(flow.save(blob,create,()=>{}));assert.equal(flow.contributionId,8);assert.equal(flow.saved,false);
 failUpload=false;await flow.save(blob,create,()=>{});assert.equal(artifacts,1);assert.equal(contributions,2);assert.equal(uploads,2);assert.equal(flow.saved,true);await flow.save(blob,create,()=>{});assert.equal(uploads,2);
 const recovered=new api.VoiceSaveFlow(42,5,7,8);await recovered.save(blob,undefined,()=>{});assert.equal(uploads,2);assert.equal(recovered.saved,true);
});

test('unknown creation results block automatic repeats and existing-artifact perspectives never create an artifact',async()=>{
 const base=loader()('@/lib/frontend/real-memories');let calls=0;
 const api=loader({'@/lib/frontend/real-memories':{...base,createAudioContribution:async()=>{calls++;throw new base.MemoryWriteError(0,'Unknown',true);}}})('@/lib/frontend/persisted-voice-client');
 const flow=new api.VoiceSaveFlow(42,5,7);await assert.rejects(flow.save(blob,undefined,()=>{}));assert.equal(flow.artifactId,7);assert.equal(flow.uncertainStage,'contribution');await flow.save(blob,undefined,()=>{});assert.equal(calls,1);
 const fresh=new api.VoiceSaveFlow(42,5);let creates=0;await assert.rejects(fresh.save(blob,async()=>{creates++;throw new base.MemoryWriteError(0,'Unknown',true);},()=>{}));await fresh.save(blob,async()=>{creates++;},()=>{});assert.equal(creates,1);assert.equal(fresh.uncertainStage,'artifact');
});

test('audio validation uses actual container, MIME normalization, and private-media size limits',async()=>{
 const api=loader()('@/lib/frontend/persisted-voice-client');assert.equal((await api.validateRecording(blob)).contentType,'audio/webm');
 for(const value of [new Blob([new Uint8Array(32)],{type:'audio/webm'}),new Blob([new Uint8Array(32)],{type:'video/webm'}),new Blob([new Uint8Array(4194305)],{type:'audio/webm'})])await assert.rejects(api.validateRecording(value));
});

test('persisted process preserves partial transcripts and translation retry sends JSON only to translations',async()=>{
 const original=global.fetch;const api=loader()('@/lib/frontend/persisted-voice-client');const calls=[];
 global.fetch=async(path,options)=>{calls.push({path,...options});if(path.endsWith('/process'))return Response.json({stage:'translation',status:502,contribution,error:{message:'Translation failed'}},{status:502});return Response.json({contribution,translation,cached:true});};
 try {
  await assert.rejects(api.processSavedVoice(42,7,8,'fra',false),error=>error.contribution.originalTranscript==='Recuerdo');
  assert.deepEqual(JSON.parse(calls[0].body),{targetLanguage:'fr',reprocess:false});assert.equal(calls[0].credentials,'same-origin');
  const result=await api.processSavedVoice(42,7,8,'fr',true);assert.equal(result.translation.translatedText,'Souvenir');assert.equal(calls[1].path,'/api/nooks/42/artifacts/7/contributions/8/translations');assert.deepEqual(JSON.parse(calls[1].body),{targetLanguage:'fr'});assert.ok(!(calls[1].body instanceof FormData));
  for(const status of [401,403,404,409,413,415,422,503]){global.fetch=async()=>Response.json({error:{message:'failure'}},{status});await assert.rejects(api.processSavedVoice(42,7,8,'fr',false),error=>error.status===status);}
  global.fetch=async()=>Response.json({stage:'translation',status:502,contribution:{...contribution,artifactId:99}},{status:502});await assert.rejects(api.processSavedVoice(42,7,8,'fr',false),error=>!error.contribution);
  let attempts=0;global.fetch=async()=>{attempts++;throw new Error('Offline');};await assert.rejects(api.processSavedVoice(42,7,8,'fr',false),error=>error.uncertain);assert.equal(attempts,1);
 }finally{global.fetch=original;}
});

test('saved translations load lazily, stay scoped, and generation controls follow author/owner permissions',()=>{
 for(const [viewer,role,allowed]of [[5,'member',true],[6,'owner',true],[6,'member',false]]){
  const calls=[];const load=loader({swr:{useSWRConfig:()=>({mutate:async()=>{}})},'@/components/solibra/use-nook-data':{useNookData:(path,id)=>{calls.push([path,id]);if(!path)return {};return path?.endsWith('/translations')?{data:{translations:[translation]},mutate:async()=>{}}:{data:{contribution},mutate:async()=>{}};}}});
  const {SavedVoice,canManageVoice}=load('@/components/solibra/voice/saved-voice');assert.equal(canManageVoice(viewer,5,role),allowed);
  let html=renderToStaticMarkup(React.createElement(SavedVoice,{contribution,nookId:42,artifactId:7,viewerId:viewer,authorName:'Actual Writer',canManage:allowed}));assert.ok(calls.every(([path])=>path===null));assert.ok(!html.includes('Souvenir'));
  calls.length=0;html=renderToStaticMarkup(React.createElement(SavedVoice,{contribution,nookId:42,artifactId:7,viewerId:viewer,authorName:'Actual Writer',canManage:allowed,initialLanguage:'fr',initiallyExpanded:true}));assert.ok(calls.every(([path,id])=>path?.includes('/contributions/8')&&id===viewer));assert.ok(html.includes('Souvenir'));assert.ok(html.includes('Recuerdo'));assert.ok(!html.includes('opaque-private-key'));assert.equal(html.includes('Target translation language'),allowed);assert.ok(html.includes('/contributions/8/media?v='));
 }
});

function hookReact(){const slots=[];const effects=[];let cursor=0;return{reset(){cursor=0;},slots,effects,react:{...React,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],value=>slots[i]=typeof value==='function'?value(slots[i]):value];},useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},useEffect(fn,deps){const i=cursor++;if(!slots[i]||JSON.stringify(slots[i].deps)!==JSON.stringify(deps)){slots[i]?.cleanup?.();slots[i]={deps,cleanup:fn()};}}}};}
function nodes(tree,predicate,out=[]){if(!tree||typeof tree!=='object')return out;if(Array.isArray(tree)){tree.forEach(n=>nodes(n,predicate,out));return out;}if(predicate(tree))out.push(tree);nodes(tree.props?.children,predicate,out);return out;}
test('private audio resets failures when URL changes and explicit retry reloads authorized media',()=>{
 const h=hookReact();const Component=loader({react:h.react})('@/components/solibra/private-recording').PrivateRecording;const render=src=>{h.reset();return Component({src,label:'Saved voice'});};
 let tree=render('/api/nooks/42/artifacts/7/contributions/8/media');let audio=nodes(tree,n=>n.type==='audio')[0];let loads=0,paused=0;
 audio.props.ref.current={load(){loads++;},pause(){paused++;},removeAttribute(){}};audio.props.onError();tree=render('/api/nooks/42/artifacts/7/contributions/8/media');nodes(tree,n=>n.type==='button')[0].props.onClick();assert.equal(loads,1);assert.ok(paused>0);
 audio=nodes(tree,n=>n.type==='audio')[0];audio.props.onError();render('/api/nooks/42/artifacts/7/contributions/9/media');tree=render('/api/nooks/42/artifacts/7/contributions/9/media');assert.equal(nodes(tree,n=>n.type==='button').length,0);assert.ok(nodes(tree,n=>n.type==='audio')[0].props.src.endsWith('/9/media'));
});

test('partial processing updates the displayed saved source and the next action retries translation only',async()=>{
 const h=hookReact();const api=loader()('@/lib/frontend/persisted-voice-client');let current={...contribution,originalTranscript:null,sourceLanguage:null,processingStatus:'draft'};let translations=[];const calls=[];
 const load=loader({react:h.react,swr:{useSWRConfig:()=>({mutate:async()=>{}})},'@/components/solibra/use-nook-data':{useNookData:path=>path?.endsWith('/translations')?{data:{translations},mutate:async(value)=>{if(value){const next=typeof value==='function'?value({translations}):value;translations=next.translations;}}}:{data:{contribution:current},mutate:async value=>{if(value)current=value.contribution;}}},'@/lib/frontend/persisted-voice-client':{...api,processSavedVoice:async(n,a,c,language,translationOnly)=>{calls.push(translationOnly);if(!translationOnly)throw new api.VoiceProcessingError(502,'Translation failed',contribution);return{contribution,translation,cached:false};}}});
 const Component=load('@/components/solibra/voice/saved-voice').SavedVoice;const render=()=>{h.reset();return Component({contribution:current,nookId:42,artifactId:7,viewerId:5,authorName:'Actual Writer',canManage:true,initiallyExpanded:true,initialLanguage:'fr'});};
 nodes(render(),n=>n.type==='button'&&n.props.children==='Transcribe & Translate')[0].props.onClick();await new Promise(resolve=>setImmediate(resolve));assert.equal(current.originalTranscript,'Recuerdo');
 nodes(render(),n=>n.type==='button'&&n.props.children==='Retry translation')[0].props.onClick();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(calls,[false,true]);assert.equal(translations[0].translatedText,'Souvenir');
});
