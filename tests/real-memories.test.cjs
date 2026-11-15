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
const artifact = { id: 7, nookId: 42, creatorId: 5, type: 'text', title: 'A real afternoon', description: 'First line\nSecond line', mediaStorageKey: null, createdAt: '2026-01-01T12:00:00Z', updatedAt: '2026-01-01T12:00:00Z' };
const nook = { id: 42, name: 'Our real Nook', role: 'member', description: null };
const member = { id: 90, nookId: 42, userId: 5, role: 'member', user: { id: 5, name: 'Real Writer', email: 'PRIVATE@example.com' } };
const contribution = { id: 8, artifactId: 7, authorId: 5, type: 'text', content: 'My perspective', audioStorageKey: null, originalTranscript: null, sourceLanguage: null, processingStatus: null, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt };
const photo = { type: 'image/png', size: 32, name: 'moment.png' };
const flush = () => new Promise(resolve => setImmediate(resolve));

test('memory adapters use strict schemas, numeric paths, authenticated requests and confirmed 201 identities', async () => {
 const original = global.fetch; const api = loader()('@/lib/frontend/real-memories'); const calls = [];
 global.fetch = async (url,options) => { calls.push({ url,...options }); const body = JSON.parse(options.body); return Response.json(url.endsWith('/contributions') ? {contribution:{...contribution,content:body.content}} : {artifact:{...artifact,...body,description:body.description??null}}, {status:201}); };
 try {
  const saved = await api.createRealArtifact(42,{type:'text',title:' A real afternoon ',description:' A story\nkept close '});
  assert.equal(saved.artifact.id,7); assert.equal(calls[0].url,'/api/nooks/42/artifacts'); assert.equal(calls[0].credentials,'same-origin');
  assert.deepEqual(JSON.parse(calls[0].body),{type:'text',title:'A real afternoon',description:'A story\nkept close'});
  for(const input of [{type:'recipe',title:'Hi'},{type:'text',title:' '},{type:'letter',title:'a'.repeat(201)},{type:'text',title:'Title',description:'a'.repeat(10001)},{type:'text',title:'Title',creatorId:5}]) await assert.rejects(api.createRealArtifact(42,input));
  await assert.rejects(api.createRealArtifact('rivera-family',{type:'photo',title:'Hi'})); assert.equal(calls.length,1);
  await api.createRealArtifact(42,{type:'letter',title:'Letter',description:'a'.repeat(10000)});
  await api.createWrittenContribution(42,7,{type:'text',content:' My perspective '});
  assert.deepEqual(JSON.parse(calls.at(-1).body),{type:'text',content:'My perspective'}); assert.equal(calls.at(-1).url,'/api/nooks/42/artifacts/7/contributions');
  for(const input of [{type:'audio'},{type:'text',content:' '},{type:'text',content:'a'.repeat(20001)},{type:'text',content:'Hi',authorId:5}])await assert.rejects(api.createWrittenContribution(42,7,input));
  for(const [status,value] of [[200,{artifact}],[201,{artifact:{...artifact,id:'7'}}],[201,{artifact:{...artifact,nookId:99}}],[400,{}],[401,{}],[403,{}],[404,{}],[409,{}],[413,{}],[415,{}],[503,{}]]) {
   global.fetch=async()=>Response.json(value,{status}); await assert.rejects(api.createRealArtifact(42,{type:'text',title:artifact.title,description:artifact.description}),error=>error.status===status);
  }
  global.fetch=async()=>{throw new Error('lost');}; await assert.rejects(api.createRealArtifact(42,{type:'photo',title:'Photo'}),error=>error.uncertain);
 } finally { global.fetch=original; }
});

test('photo validation and upload recovery preserve the saved artifact identity and completed attachments', async () => {
 let uploads=0; let fail=true; let attached=false; let wrongNook=false;
 const api=loader({
  '@/lib/frontend/nook-api':{...loader()('@/lib/frontend/nook-api'),nookRequest:async()=>({artifact:{...artifact,type:'photo',nookId:wrongNook?99:42,mediaStorageKey:attached?'opaque-key':null}})},
  '@/lib/frontend/media-client':{uploadPrivateMedia:async(path,file)=>{uploads++;assert.equal(path,'/api/nooks/42/artifacts/7/media');assert.equal(file,photo);if(fail)throw new Error('upload failed');return{media:{url:path,contentType:file.type,byteSize:file.size},cleanupPending:true};}}
 })('@/lib/frontend/real-memories');
 for(const type of ['image/jpeg','image/png','image/webp'])assert.equal(api.validatePhoto({...photo,type,size:5000000}),null);
 for(const type of ['image/heic','image/svg+xml','image/gif'])assert.match(api.validatePhoto({...photo,type}),/JPEG/);
 assert.match(api.validatePhoto({...photo,size:5000001}),/5,000,000/); assert.match(api.validatePhoto(null),/Choose/);
 await assert.rejects(api.attachSavedPhoto(42,7,photo),/upload failed/); fail=false;
 assert.deepEqual(await api.attachSavedPhoto(42,7,photo),{alreadyAttached:false,cleanupPending:true}); assert.equal(uploads,2);
 attached=true; assert.equal((await api.attachSavedPhoto(42,7,photo)).alreadyAttached,true);assert.equal(uploads,2);
 wrongNook=true;await assert.rejects(api.attachSavedPhoto(42,7,photo));assert.equal(uploads,2);
 assert.equal(api.realMemoryHref(42,7),'/circles/42/memories/7');assert.throws(()=>api.realMemoryHref(42,'sample'));
 assert.equal(api.memoryAuthor(5,42,[member]),'Real Writer'); assert.equal(api.memoryAuthor(5,99,[member]),'Former member');
});

function hookReact() {
 const slots=[];let cursor=0;const cleanups=[];
 return { reset(){cursor=0;}, unmount(){cleanups.forEach(fn=>fn?.());}, react:{...React,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],value=>slots[i]=typeof value==='function'?value(slots[i]):value];},useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},useEffect(effect){const i=cursor++;if(!(i in slots)){slots[i]=true;cleanups.push(effect());}}} };
}
function nodes(tree, predicate, found=[]) {
 if(!tree||typeof tree!=='object')return found;
 if(Array.isArray(tree)){tree.forEach(item=>nodes(item,predicate,found));return found;}
 if(predicate(tree))found.push(tree);
 nodes(tree.props?.children,predicate,found);return found;
}
function createHarness(api) {
 const h=hookReact(); const visits=[];const mutations=[];
 const load=loader({react:h.react,'next/navigation':{useRouter:()=>({push:path=>visits.push(path)})},swr:{useSWRConfig:()=>({mutate:async key=>mutations.push(key)})},'@/components/solibra/use-nook-data':{useNookData:()=>({data:{nook}})},'@/lib/frontend/real-memories':{...loader()('@/lib/frontend/real-memories'),...api}});
 const Component=load('@/components/solibra/create-memory').CreateMemory;
 return {...h,visits,mutations,render(){h.reset();return Component({nookId:42,viewerId:5});}};
}
const input=(tree,tag)=>nodes(tree,node=>node.type===tag)[0];

test('create form retains confirmed artifact after failed upload; retries upload without creating another memory',async()=>{
 let creates=0,uploads=0,fail=true;let release;
 const h=createHarness({createRealArtifact:async()=>{creates++;await new Promise(resolve=>release=resolve);return{artifact:{...artifact,type:'photo'}};},attachSavedPhoto:async(n,a,file)=>{uploads++;assert.equal(a,7);assert.equal(n,42);if(fail)throw new Error('Storage unavailable');return{cleanupPending:true,alreadyAttached:false};}});
 let tree=h.render(); nodes(tree,node=>node.type==='input'&&node.props.maxLength===200)[0].props.onChange({target:{value:'Photo title'}});
 nodes(tree,node=>node.type?.name==='PhotoSelection')[0].props.onChange(photo);
 tree=h.render(); const submit=()=>input(h.render(),'form').props.onSubmit({preventDefault(){}});
 submit();submit();assert.equal(creates,1);release();await flush();
 tree=h.render();assert.equal(uploads,1);assert.equal(h.visits.length,0);assert.equal(nodes(tree,node=>node.type?.name==='SolibraEmote'&&node.props.variant==='celebrate').length,0);
 assert.ok(nodes(tree,node=>node.type==='a'||node.props?.href).some(node=>node.props.href==='/circles/42/memories/7'));
 fail=false;nodes(tree,node=>node.type==='button'&&node.props.children==='Retry photograph upload')[0].props.onClick();await flush();
 assert.equal(creates,1);assert.equal(uploads,2);assert.deepEqual(h.visits,['/circles/42/memories/7']);assert.equal(nodes(h.render(),node=>node.type?.name==='SolibraEmote'&&node.props.variant==='celebrate').length,1);assert.ok(h.mutations.every(key=>key[1]===5));h.unmount();
});

test('text and letter creation validate bodies, preserve failed drafts and show only confirmed success',async()=>{
 for(const type of ['text','letter']){
  let calls=0,fail=true;
  const h=createHarness({createRealArtifact:async(n,body)=>{calls++;assert.equal(body.type,type);if(fail)throw new Error('Unavailable');return{artifact:{...artifact,type}};}});
  let tree=h.render();nodes(tree,node=>node.type==='input'&&node.props.type==='radio'&&node.props.value===type)[0].props.onChange();
  tree=h.render();
  nodes(tree,node=>node.type==='input'&&node.props.maxLength===200)[0].props.onChange({target:{value:'Our story'}});
  const submit=()=>input(h.render(),'form').props.onSubmit({preventDefault(){}});
  submit();await flush();assert.equal(calls,0);
  input(h.render(),'textarea').props.onChange({target:{value:'Our written recollection'}});submit();await flush();
  assert.equal(calls,1);assert.equal(input(h.render(),'textarea').props.value,'Our written recollection');assert.equal(nodes(h.render(),node=>node.type?.name==='SolibraEmote'&&node.props.variant==='celebrate').length,0);
  fail=false;submit();await flush();assert.equal(calls,2);assert.ok(nodes(h.render(),node=>node.props?.href==='/circles/42/memories/7').length);assert.equal(nodes(h.render(),node=>node.type?.name==='SolibraEmote'&&node.props.variant==='celebrate').length,1);h.unmount();
 }
});

function detailResources(overrides={}) {return{
 '/api/nooks/42':{data:{nook}},'/api/nooks/42/artifacts/7':{data:{artifact}},'/api/nooks/42/members':{data:{members:[member]}},'/api/nooks/42/artifacts/7/contributions':{data:{contributions:[contribution]}},...overrides
};}
function detailsLoader(resources,extra={}) {return loader({
 'next/link':{default:({children,...props})=>React.createElement('a',props,children)},swr:{useSWRConfig:()=>({mutate:async()=>{}})},
 '@/components/solibra/use-nook-data':{useNookData:(path,viewer)=>{assert.equal(viewer,5);return resources[path]||{};}},...extra
});}
test('real details show authorized text, private media paths, actual attribution, transcripts only when returned',()=>{
 const audio={...contribution,id:10,type:'audio',content:null,audioStorageKey:'PRIVATE_STORAGE_KEY',originalTranscript:'Actual source transcript',sourceLanguage:'es',processingStatus:'completed'};
 const resources=detailResources({'/api/nooks/42/artifacts/7':{data:{artifact:{...artifact,type:'photo',mediaStorageKey:'PRIVATE_PHOTO_KEY'}}},'/api/nooks/42/artifacts/7/contributions':{data:{contributions:[contribution,audio,{...audio,id:11,audioStorageKey:null,originalTranscript:null,processingStatus:'draft'},{...contribution,id:999,artifactId:88,content:'WRONG ARTIFACT'}]}}});
 const Component=detailsLoader(resources)('@/components/solibra/real-memory-details').RealMemoryDetails;
 const html=renderToStaticMarkup(React.createElement(Component,{nookId:42,artifactId:7,viewerId:5}));
 for(const expected of ['A real afternoon','Real Writer','My perspective','Actual source transcript','Original transcript','/api/nooks/42/artifacts/7/media?v=','/contributions/10/media?v=','Recording unavailable','not available yet'])assert.ok(html.includes(expected),expected);
 for(const forbidden of ['PRIVATE_PHOTO_KEY','PRIVATE_STORAGE_KEY','PRIVATE@example','WRONG ARTIFACT','Sofía','Elena','/contributions/11/media'])assert.ok(!html.includes(forbidden),forbidden);
 assert.ok(!html.includes('Attach photograph')); // attached media cannot be replaced in this UI
});

test('details suppress cached private content on permission/read errors and reject cross-Nook artifact identity',()=>{
 const NookRequestError=loader()('@/lib/frontend/nook-api').NookRequestError;
 for(const path of ['/api/nooks/42','/api/nooks/42/artifacts/7','/api/nooks/42/members','/api/nooks/42/artifacts/7/contributions']){
  const resources=detailResources();resources[path]={...resources[path],error:new NookRequestError(404,'Access ended')};
  const Component=detailsLoader(resources)('@/components/solibra/real-memory-details').RealMemoryDetails;
  const html=renderToStaticMarkup(React.createElement(Component,{nookId:42,artifactId:7,viewerId:5}));assert.ok(!html.includes(artifact.title));assert.ok(!html.includes(contribution.content));assert.ok(!html.includes('<img'));
 }
 const resources=detailResources({'/api/nooks/42/artifacts/7':{data:{artifact:{...artifact,nookId:99}}}});
 const Component=detailsLoader(resources)('@/components/solibra/real-memory-details').RealMemoryDetails;
 assert.ok(renderToStaticMarkup(React.createElement(Component,{nookId:42,artifactId:7,viewerId:5})).includes('could not be verified'));
});

test('only artifact creator or Nook owner sees missing-photo attachment controls',()=>{
 for(const [creatorId,role,allowed] of [[5,'member',true],[6,'owner',true],[6,'member',false]]){
  const resources=detailResources({'/api/nooks/42':{data:{nook:{...nook,role}}},'/api/nooks/42/artifacts/7':{data:{artifact:{...artifact,creatorId,type:'photo'}}}});
  const Component=detailsLoader(resources)('@/components/solibra/real-memory-details').RealMemoryDetails;
  const html=renderToStaticMarkup(React.createElement(Component,{nookId:42,artifactId:7,viewerId:5}));assert.equal(html.includes('Attach photograph'),allowed);assert.ok(html.includes('No photograph is attached'));
 }
});

test('written perspectives require review, retain failures, and share uses same-Nook numeric artifact without persona fields',async()=>{
 const h=hookReact();let writes=0,fail=true;const shared=[];const mutations=[];
 const resources=detailResources();for(const value of Object.values(resources))value.mutate=async()=>{};
 const load=detailsLoader(resources,{react:h.react,swr:{useSWRConfig:()=>({mutate:async key=>mutations.push(key)})},'@/lib/frontend/real-memories':{...loader()('@/lib/frontend/real-memories'),createWrittenContribution:async(n,a,body)=>{writes++;assert.equal(n,42);assert.equal(a,7);assert.deepEqual(body,{type:'text',content:'New perspective'});if(fail)throw new Error('Unknown outcome');return{contribution:{...contribution,id:12,content:body.content}};}},'@/lib/frontend/real-messages':{sendNookMessage:async(n,body)=>{shared.push({n,body});return{message:{id:22,senderId:5}};}}});
 const Component=load('@/components/solibra/real-memory-details').RealMemoryDetails;const render=()=>{h.reset();return Component({nookId:42,artifactId:7,viewerId:5});};
 nodes(render(),node=>node.type==='button'&&node.props.children==='Add your perspective')[0].props.onClick();
 input(render(),'textarea').props.onChange({target:{value:'New perspective'}});
 const submit=()=>input(render(),'form').props.onSubmit({preventDefault(){}});
 submit();assert.equal(writes,0);submit();await flush();assert.equal(writes,1);assert.equal(input(render(),'textarea').props.value,'New perspective');
 fail=false;submit();await flush();assert.equal(writes,2);assert.equal(input(render(),'textarea').props.value,'');
 nodes(render(),node=>node.type==='button'&&node.props.children==='Share in group conversation')[0].props.onClick();
 input(render(),'form').props.onSubmit({preventDefault(){}});await flush();assert.equal(shared.length,1);assert.equal(shared[0].n,42);assert.equal(shared[0].body.artifactId,7);assert.deepEqual(Object.keys(shared[0].body).sort(),['artifactId','content']);assert.ok(mutations.some(key=>key[0]==='/api/nooks/42/messages'&&key[1]===5));h.unmount();
});

test('numeric memory routes authenticate and key account/resource state while demo routes remain isolated',async()=>{
 let guarded=0;const missing=()=>{throw new Error('NOT_FOUND');};
 const load=loader({'next/navigation':{notFound:missing,redirect:()=>{}},'@/lib/auth/require-profile-user':{requireProfileUser:async()=>{guarded++;return{id:5};}},'@/components/solibra/real-memory-details':{RealMemoryDetails:()=>null},'@/components/solibra/memory-details':{MemoryDetails:()=>null}});
 const Route=load('@/app/(library)/circles/[circleId]/memories/[memoryId]/page').default;
 const result=await Route({params:Promise.resolve({circleId:'42',memoryId:'7'}),searchParams:Promise.resolve({})});assert.equal(result.key,'5:42:7');assert.equal(guarded,1);
 for(const [circleId,memoryId]of [['42','sample'],['rivera-family','7'],['0','7'],['-1','7']])await assert.rejects(Route({params:Promise.resolve({circleId,memoryId}),searchParams:Promise.resolve({})}),/NOT_FOUND/);
 const demo=await Route({params:Promise.resolve({circleId:'rivera-family',memoryId:'sundays-in-her-kitchen'}),searchParams:Promise.resolve({})});assert.ok(demo);assert.equal(guarded,1);
 const New=load('@/app/(library)/circles/[circleId]/memories/new/page').default;
 const created=await New({params:Promise.resolve({circleId:'42'})});assert.equal(created.key,'5:42');await assert.rejects(New({params:Promise.resolve({circleId:'rivera-family'})}),/NOT_FOUND/);
});

test('conversation artifact reads are disabled for plain text and failed history; links use verified same-Nook artifacts',()=>{
 for(const [messages,error,expected] of [[[],null,false],[[{id:1,nookId:42,senderId:5,content:'Hi',artifactId:null,createdAt:artifact.createdAt}],null,false],[[{id:1,nookId:42,senderId:5,content:'Look',artifactId:7,createdAt:artifact.createdAt}],null,true],[[{id:1,nookId:42,artifactId:7}],new Error('Denied'),false]]){
  const paths=[];
  const resources={...detailResources(),'/api/nooks':{data:{nooks:[nook]}},'/api/nooks/42/messages':{data:{messages},error},'/api/nooks/42/artifacts':{data:{artifacts:[artifact]}}};
  const load=detailsLoader(resources,{'@/components/solibra/use-nook-data':{useNookData:path=>{paths.push(path);return resources[path]||{};}},'@/components/solibra/use-conversation-viewport':{useConversationViewport(){}},'@/components/solibra/window-memories':{WindowMemories:()=>null},'@/components/solibra/use-message-composer':{useMessageComposer:()=>({draft:'',pending:false,error:null,notice:''})}});
  const Component=load('@/components/solibra/real-conversation').RealConversation;const html=renderToStaticMarkup(React.createElement(Component,{nookId:42,viewerId:5}));assert.equal(paths.includes('/api/nooks/42/artifacts'),expected);if(expected)assert.ok(html.includes('/circles/42/memories/7'));
 }
});

test('confirmed-write lock prevents repeats and ignores late results after account/resource unmount',async()=>{
 const h=hookReact();const hook=loader({react:h.react})('@/components/solibra/use-confirmed-write').useConfirmedWrite;
 const render=()=>{h.reset();return hook();};let release,calls=0,confirmed=0;
 const operation=async()=>{calls++;return new Promise(resolve=>release=resolve);};
 const first=render().run(operation,()=>confirmed++);await render().run(operation,()=>confirmed++);assert.equal(calls,1);assert.equal(render().pending,true);
 h.unmount();release({id:7});await first;assert.equal(confirmed,0);
});

test('local photo preview URLs are revoked on cleanup, never persisted as resource URLs',()=>{
 const h=hookReact();const create=URL.createObjectURL,revoke=URL.revokeObjectURL;const revoked=[];
 URL.createObjectURL=()=> 'blob:local-preview';URL.revokeObjectURL=value=>revoked.push(value);
 try {
  const Photo=loader({react:h.react})('@/components/solibra/photo-attachment').PhotoSelection;
  h.reset();Photo({file:photo,onChange(){}});h.reset();const tree=Photo({file:photo,onChange(){}});
  assert.equal(nodes(tree,node=>node.type==='img')[0].props.src,'blob:local-preview');h.unmount();assert.deepEqual(revoked,['blob:local-preview']);
 } finally {URL.createObjectURL=create;URL.revokeObjectURL=revoke;}
});
