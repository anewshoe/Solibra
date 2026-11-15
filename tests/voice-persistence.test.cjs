// Media tests run actual routes, authorization, JWT tickets, SQL, and validation.
// Scripted database results keep this suite entirely separate from Neon.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { getTableName } = require('drizzle-orm');
const { PgDialect } = require('drizzle-orm/pg-core');
const root = path.resolve(__dirname, '..');
const cache = new Map();
let database;
let currentUser = null;
const db = new Proxy({}, { get: (_, key) => (...args) => database[key](...args) });

function load(file) {
  file = path.resolve(root, file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const localRequire = (name) => {
    if (name === 'server-only') return {};
    if (name === './storage' && file.endsWith(path.join('media','service.ts'))) return { storage: storageFake, UPLOAD_SECONDS: 120 };
    if (name === '@/lib/ai/transcribe') return { transcribeAudio: (...args) => transcribeFake(...args), TranscriptionError: FakeProviderError };
    if (name === '@/lib/ai/translate') return { translateTranscript: (...args) => translateFake(...args), TranslationError: FakeProviderError, MAX_TRANSCRIPT_CHARACTERS: 20000 };
    if (name === '@/lib/db/drizzle') return { db };
    if (name === '@/lib/db/queries') return { getUser: async () => currentUser };
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
    if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name) + '.ts');
    return require(name);
  };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename: file })(localRequire, module, module.exports);
  return module.exports;
}

const { getTableColumns } = require('drizzle-orm');
class FakeProviderError extends Error { constructor(message='provider failed',status=502){super(message);this.status=status;} }
let state, activeTransactions=0, transcribeFake, translateFake, providerCalls, storageCalls, storageMissing=false;
const wav=new Uint8Array(64);wav.set(Buffer.from('RIFF'),0);wav.set(Buffer.from('WAVE'),8);
const oldKey='nooks/10/artifacts/20/contributions/30/objects/11111111-1111-4111-8111-111111111111.wav';
const newKey='nooks/10/artifacts/20/contributions/30/objects/22222222-2222-4222-8222-222222222222.wav';
let audioBytes=wav, audioType='audio/wav';
const storageFake={
  async head(){storageCalls++;if(storageMissing)throw new (load('lib/nooks/errors.ts').NookError)(404,'NOT_FOUND','Nook media not found.');return {byteSize:audioBytes.length,contentType:audioType};},
  async get(){storageCalls++;return new ReadableStream({start(c){c.enqueue(audioBytes);c.close();}});},
  async remove(){storageCalls++;},async copy(){storageCalls++;},async signUpload(){throw Error('Not used');}
};
const schema=load('lib/db/schema.ts');
const service=load('lib/voice/persistence.ts');
const media=load('lib/media/service.ts');
const contracts=load('lib/voice/persistence-types.ts');
const {NookError}=load('lib/nooks/errors.ts');
const scope={nookId:10,artifactId:20,contributionId:30};
const signal=()=>new AbortController().signal;
const row=()=>state.contributions[0];
const date=new Date('2026-01-01T00:00:00Z');

function memoryDatabase(){
  const dialect=new PgDialect();let tail=Promise.resolve();
  function query(op,table,selection){
    let where,values,conflict;
    const q={from(t){table=t;return q;},where(v){where=v;return q;},for(){return q;},limit(){return q;},
      orderBy(){return q;},set(v){values=v;return q;},values(v){values=v;return q;},returning(){return q;},
      onConflictDoUpdate(v){conflict=v;return q;},then(resolve,reject){return Promise.resolve().then(()=>{
        const name=getTableName(table),columns=getTableColumns(table);
        const field=col=>Object.keys(columns).find(key=>columns[key].name===col);
        let comparisons=[];
        if(where){const compiled=dialect.sqlToQuery(where);comparisons=[...compiled.sql.matchAll(/"\w+"\."(\w+)" = \$(\d+)/g)]
          .map(m=>[field(m[1]),compiled.params[Number(m[2])-1]]);assert.ok(comparisons.length,'Scoped SQL must be understood by test database');}
        const matches=r=>comparisons.every(([key,value])=>r[key]===value);
        const tableRows=state[name];assert.ok(tableRows,`Unknown table ${name}`);
        if(op==='select'){
          let rows=tableRows.filter(matches);
          if(selection)rows=rows.map(r=>Object.fromEntries(Object.entries(selection).map(([alias,col])=>[alias,r[field(col.name)]])));
          return structuredClone(rows);
        }
        if(op==='update'){
          const result=[];for(const r of tableRows)if(matches(r)){Object.assign(r,values);result.push(structuredClone(r));}return result;
        }
        if(op==='delete'){state[name]=tableRows.filter(r=>!matches(r));return [];}
        const existing=name==='translations'?tableRows.find(r=>r.contributionId===values.contributionId&&r.sourceLanguage===values.sourceLanguage&&r.targetLanguage===values.targetLanguage):null;
        if(existing){assert.ok(conflict,'Duplicate inserts require upsert');Object.assign(existing,conflict.set);return [structuredClone(existing)];}
        const created={id:tableRows.length+1,createdAt:new Date(),...values};tableRows.push(created);return [structuredClone(created)];
      }).then(resolve,reject);}};return q;
  }
  const api={select:fields=>query('select',undefined,fields),update:t=>query('update',t),delete:t=>query('delete',t),insert:t=>query('insert',t),
    async transaction(callback){
      const previous=tail;let release;tail=new Promise(resolve=>{release=resolve;});await previous;
      const snapshot=structuredClone(state);activeTransactions++;
      try{return await callback(api);}catch(error){state=snapshot;throw error;}finally{activeTransactions--;release();}
    }};
  return api;
}
test.beforeEach(()=>{
  state={
    teams:[{id:10},{id:99}],
    team_members:[{id:1,userId:1,teamId:10,role:'member'},{id:2,userId:2,teamId:10,role:'member'},
      {id:4,userId:4,teamId:10,role:'owner'},{id:9,userId:1,teamId:99,role:'owner'}],
    artifacts:[{id:20,nookId:10,creatorId:1,type:'photo',mediaStorageKey:null,updatedAt:date},
      {id:21,nookId:99,creatorId:1,type:'audio',mediaStorageKey:null,updatedAt:date}],
    contributions:[{id:30,artifactId:20,authorId:1,type:'audio',content:null,audioStorageKey:oldKey,
      originalTranscript:null,sourceLanguage:null,processingStatus:'draft',createdAt:date,updatedAt:date}],translations:[]
  };
  currentUser={id:1};providerCalls={transcribe:0,translate:0};storageCalls=0;storageMissing=false;
  audioBytes=wav;audioType='audio/wav';database=memoryDatabase();activeTransactions=0;
  transcribeFake=async()=>{assert.equal(activeTransactions,0,'No DB transaction during ElevenLabs');providerCalls.transcribe++;return {transcript:'A shared memory.',originalLanguage:'spa'};};
  translateFake=async input=>{assert.equal(activeTransactions,0,'No DB transaction during Gemini');providerCalls.translate++;assert.equal(input.transcript,row().originalTranscript);return 'A translated memory.';};
});
function completed(){Object.assign(row(),{originalTranscript:'A shared memory.',sourceLanguage:'es',processingStatus:'completed'});}
function savedTranslation(){state.translations.push({id:1,contributionId:30,sourceLanguage:'es',targetLanguage:'en',translatedText:'Already saved.',createdAt:date});}
const process=(body={targetLanguage:'en'})=>service.runPersistedVoice(1,scope,body,'process',signal());
const translate=(body={targetLanguage:'en'})=>service.runPersistedVoice(1,scope,body,'translation',signal());
const routeBase='app/api/nooks/[nookId]/artifacts/[artifactId]/contributions/[contributionId]';
async function call(path,method='POST',body={targetLanguage:'en'},ids={}){
  return load(routeBase+'/'+path+'/route.ts')[method](new Request('http://localhost/api/nooks/10/artifacts/20/contributions/30/'+path,{
    method,...(method==='GET'?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
  }),{params:Promise.resolve({nookId:'10',artifactId:'20',contributionId:'30',...ids})});
}

test('stored audio is privately loaded, transcribed and translated, then both outputs persist',async()=>{
  const result=await process({targetLanguage:'eng'});
  assert.equal(result.contribution.originalTranscript,'A shared memory.');assert.equal(result.contribution.sourceLanguage,'es');
  assert.equal(result.contribution.processingStatus,'completed');assert.equal(result.translation.targetLanguage,'en');
  assert.equal(result.translation.contributionId,30);assert.equal(result.cached,false);
  assert.deepEqual(providerCalls,{transcribe:1,translate:1});assert.equal(row().audioStorageKey,oldKey);
  assert.equal(state.translations.length,1);assert.ok(storageCalls>0);
});
test('completed processing and translation retries reuse existing saved work without provider calls',async()=>{
  completed();savedTranslation();
  assert.equal((await process()).cached,true);assert.equal((await translate()).cached,true);
  assert.deepEqual(providerCalls,{transcribe:0,translate:0});assert.equal(storageCalls,0);
});
test('translation-only requests use the database transcript without loading or retranscribing audio',async()=>{
  completed();const result=await translate({targetLanguage:'FR-fr'});
  assert.equal(result.translation.targetLanguage,'fr');assert.equal(providerCalls.transcribe,0);
  assert.equal(providerCalls.translate,1);assert.equal(storageCalls,0);
});
test('members may read translations while only the author or a Nook owner may generate them',async()=>{
  completed();savedTranslation();currentUser={id:2};
  const read=await call('translations','GET');assert.equal(read.status,200);assert.equal((await read.json()).translations.length,1);
  assert.equal((await call('process')).status,403);assert.equal((await call('translations')).status,403);
  currentUser={id:4};assert.equal((await call('process')).status,200);
  assert.deepEqual(providerCalls,{transcribe:0,translate:0});
});
test('all endpoints reject missing sessions and cross-origin writes without provider calls',async()=>{
  currentUser=null;
  for(const [path,method] of [['process','POST'],['translations','POST'],['translations','GET']])assert.equal((await call(path,method)).status,401);
  currentUser={id:1};const route=load(routeBase+'/process/route.ts');
  const response=await route.POST(new Request('http://localhost/api',{method:'POST',headers:{origin:'https://outside.example'}}),{params:Promise.resolve({})});
  assert.equal(response.status,403);assert.deepEqual(providerCalls,{transcribe:0,translate:0});
});
test('outsiders, removed members and cross-Nook parent/child IDs cannot access processing or translations',async()=>{
  completed();savedTranslation();
  for(const userId of [3,2]){
    if(userId===2)state.team_members=state.team_members.filter(m=>m.userId!==2);
    currentUser={id:userId};
    for(const [path,method]of[['process','POST'],['translations','POST'],['translations','GET']])assert.equal((await call(path,method)).status,404);
  }
  currentUser={id:1};
  for(const ids of [{nookId:'99'},{artifactId:'21'},{contributionId:'99'}]){
    assert.equal((await call('process','POST',{targetLanguage:'en'},ids)).status,404);
    assert.equal((await call('translations','GET',undefined,ids)).status,404);
  }
  assert.equal(storageCalls,0);assert.deepEqual(providerCalls,{transcribe:0,translate:0});
});
test('caller-selected identities, transcripts, URLs and storage keys are rejected',async()=>{
  for(const body of [{targetLanguage:'en',userId:2},{targetLanguage:'en',audioStorageKey:oldKey},
    {targetLanguage:'en',transcript:'client supplied'},{targetLanguage:'en',audioUrl:'https://outside.example'},
    {targetLanguage:'invalid'},{targetLanguage:'en',reprocess:'true'}])assert.equal((await call('process','POST',body)).status,400);
  assert.equal(contracts.translateContributionSchema.safeParse({targetLanguage:'fra'}).data.targetLanguage,'fr');
  assert.equal(storageCalls,0);
});
test('missing audio, wrong contribution type, unknown provider object and invalid container fail safely',async()=>{
  row().audioStorageKey=null;await assert.rejects(process(),e=>e.status===409);
  row().audioStorageKey=oldKey;row().type='text';await assert.rejects(process(),e=>e.status===415);
  row().type='audio';storageMissing=true;await assert.rejects(process(),e=>e.status===404);
  assert.equal(row().processingStatus,'failed');assert.equal(row().audioStorageKey,oldKey);
  storageMissing=false;audioBytes=new Uint8Array(64);await assert.rejects(process(),e=>e.status===415);
  assert.equal(row().processingStatus,'failed');assert.equal(providerCalls.transcribe,0);
  audioBytes=wav;audioType='image/png';await assert.rejects(process(),e=>e.status===415);
});
test('empty or failed transcription preserves the audio and marks a retryable failed state',async()=>{
  transcribeFake=async()=>({transcript:' ',originalLanguage:'eng'});
  await assert.rejects(process(),e=>e.status===422);assert.equal(row().processingStatus,'failed');
  transcribeFake=async()=>{throw new FakeProviderError('private provider detail');};
  await assert.rejects(process(),e=>e.status===502&&!e.message.includes('private provider'));
  assert.equal(row().audioStorageKey,oldKey);assert.equal(row().originalTranscript,null);assert.equal(state.translations.length,0);
});
test('translation failure preserves the successful transcript and retry avoids ElevenLabs',async()=>{
  translateFake=async()=>{providerCalls.translate++;throw new FakeProviderError();};
  const partial=await process();assert.equal(partial.stage,'translation');assert.equal(partial.status,502);
  assert.equal(partial.contribution.originalTranscript,'A shared memory.');assert.equal(row().processingStatus,'completed');
  assert.equal(state.translations.length,0);
  translateFake=async()=>{providerCalls.translate++;return 'Retry succeeded.';};
  const result=await translate();assert.equal(result.translation.translatedText,'Retry succeeded.');
  assert.deepEqual(providerCalls,{transcribe:1,translate:2});
});
test('translation-only requests cannot generate from a missing source transcript',async()=>{
  await assert.rejects(translate(),e=>e.status===409);assert.deepEqual(providerCalls,{transcribe:0,translate:0});
});
test('normalized languages and undetected language values are persisted without losing original text',async()=>{
  for(const [input,expected]of[['fra-FR','fr'],['tel','te'],['eng','en'],['','und'],['nonsense','und'],['zzz','und']])assert.equal(service.persistedSourceLanguage(input),expected);
  transcribeFake=async()=>({transcript:'A memory with unknown language.',originalLanguage:''});
  translateFake=async input=>{assert.equal(input.originalLanguage,'');return 'Translated unknown source.';};
  await process();assert.equal(row().sourceLanguage,'und');assert.equal(state.translations[0].sourceLanguage,'und');
});
test('concurrent requests yield one provider call and later cache reuse without duplicate translation rows',async()=>{
  completed();let finish,entered;const started=new Promise(resolve=>{entered=resolve;});
  translateFake=async()=>{assert.equal(activeTransactions,0);providerCalls.translate++;entered();return new Promise(resolve=>{finish=resolve;});};
  const first=translate();await started;
  await assert.rejects(translate(),e=>e.status===409);finish('Only translation.');await first;
  assert.equal((await translate()).cached,true);assert.equal(state.translations.length,1);assert.equal(providerCalls.translate,1);
});
test('audio replacement during transcription discards stale results and clears old generated text',async()=>{
  completed();savedTranslation();
  transcribeFake=async()=>{
    assert.equal(activeTransactions,0);
    // Simulate the committed attachment update/invalidation from Task 4's locked operation.
    Object.assign(row(),{audioStorageKey:newKey,originalTranscript:null,sourceLanguage:null,processingStatus:'draft',updatedAt:new Date(Date.now()+5)});
    state.translations=[];return {transcript:'Stale old recording.',originalLanguage:'es'};
  };
  await assert.rejects(process({targetLanguage:'en',reprocess:true}),e=>e.status===409);
  assert.equal(row().originalTranscript,null);assert.equal(row().audioStorageKey,newKey);assert.equal(providerCalls.translate,0);assert.equal(state.translations.length,0);
});
test('real media deletion during Gemini clears transcript/translations and prevents stale reinsertion',async()=>{
  completed();savedTranslation();state.translations=[];
  translateFake=async()=>{assert.equal(activeTransactions,0);await media.deleteMedia(1,scope);return 'Stale translation.';};
  await assert.rejects(translate(),e=>e.status===409);
  assert.equal(row().audioStorageKey,null);assert.equal(row().originalTranscript,null);
  assert.equal(row().sourceLanguage,null);assert.equal(row().processingStatus,null);assert.equal(state.translations.length,0);
});
test('permission removal while a provider runs prevents result persistence and private partial responses',async()=>{
  completed();translateFake=async()=>{state.team_members=state.team_members.filter(m=>m.userId!==1);throw new FakeProviderError();};
  await assert.rejects(translate(),e=>e.status===404);assert.equal(state.translations.length,0);
});
test('fresh processing leases reject duplicates; expired leases recover and cached transcripts avoid transcription',async()=>{
  row().processingStatus='processing';row().updatedAt=new Date();await assert.rejects(process(),e=>e.status===409);
  row().updatedAt=new Date(Date.now()-service.PROCESSING_LEASE_MS-1000);await process();assert.equal(row().processingStatus,'completed');
  completed();row().processingStatus='processing';row().updatedAt=new Date(Date.now()-service.PROCESSING_LEASE_MS-1000);state.translations=[];
  providerCalls.transcribe=0;await translate();assert.equal(providerCalls.transcribe,0);assert.equal(row().processingStatus,'completed');
});
test('an aborted provider operation returns a timeout and recovers its state',async()=>{
  const controller=new AbortController();
  transcribeFake=async()=>{controller.abort();throw Error('aborted');};
  await assert.rejects(service.runPersistedVoice(1,scope,{targetLanguage:'en'},'process',controller.signal),e=>e.status===504);
  assert.equal(row().processingStatus,'failed');assert.equal(row().audioStorageKey,oldKey);
});
test('explicit reprocessing replaces successful source text and invalidates old translations',async()=>{
  completed();savedTranslation();transcribeFake=async()=>({transcript:'A revised source.',originalLanguage:'fra'});
  const result=await process({targetLanguage:'en',reprocess:true});assert.equal(result.contribution.sourceLanguage,'fr');
  assert.equal(state.translations.length,1);assert.equal(state.translations[0].sourceLanguage,'fr');
});

