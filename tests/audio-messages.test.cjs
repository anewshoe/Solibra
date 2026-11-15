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
    if (name === '@/lib/media/storage') return { storage: storageFake, UPLOAD_SECONDS: 120 };
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
const oldKey='nooks/10/messages/30/objects/11111111-1111-4111-8111-111111111111.wav';
const newKey='nooks/10/messages/30/objects/22222222-2222-4222-8222-222222222222.wav';
let audioBytes=wav, audioType='audio/wav';
const storageFake={
  async head(){storageCalls++;if(storageMissing)throw new (load('lib/nooks/errors.ts').NookError)(404,'NOT_FOUND','Nook media not found.');return {byteSize:audioBytes.length,contentType:audioType};},
  async get(_key,range){storageCalls++;const match=range&&/^bytes=(\d+)-(\d+)$/.exec(range);const bytes=match?audioBytes.subarray(Number(match[1]),Number(match[2])+1):audioBytes;return new ReadableStream({start(c){c.enqueue(bytes);c.close();}});},
  async remove(){storageCalls++;},async copy(){storageCalls++;},async signUpload(key){return {url:'https://storage.invalid',fields:{key}};}
};
const schema=load('lib/db/schema.ts');
const service=load('lib/messages/voice.ts');
const media=load('lib/messages/media.ts');
const contracts=load('lib/voice/persistence-types.ts');
const {NookError}=load('lib/nooks/errors.ts');
const scope={nookId:10,messageId:30};
const signal=()=>new AbortController().signal;
const row=()=>state.messages[0];
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
        const existing=name==='message_translations'?tableRows.find(r=>r.messageId===values.messageId&&r.sourceLanguage===values.sourceLanguage&&r.targetLanguage===values.targetLanguage):null;
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
    messages:[{id:30,nookId:10,senderId:1,artifactId:null,type:'audio',content:'',audioStorageKey:oldKey,
      originalTranscript:null,sourceLanguage:null,processingStatus:'draft',createdAt:date,updatedAt:date}],message_translations:[]
  };
  global.process.env.AUTH_SECRET='unit-test-message-secret';currentUser={id:1};providerCalls={transcribe:0,translate:0};storageCalls=0;storageMissing=false;
  audioBytes=wav;audioType='audio/wav';database=memoryDatabase();activeTransactions=0;
  transcribeFake=async()=>{assert.equal(activeTransactions,0,'No DB transaction during ElevenLabs');providerCalls.transcribe++;return {transcript:'A shared memory.',originalLanguage:'spa'};};
  translateFake=async input=>{assert.equal(activeTransactions,0,'No DB transaction during Gemini');providerCalls.translate++;assert.equal(input.transcript,row().originalTranscript);return 'A translated memory.';};
});
function completed(){Object.assign(row(),{originalTranscript:'A shared memory.',sourceLanguage:'es',processingStatus:'completed'});}
function savedTranslation(){state.message_translations.push({id:1,messageId:30,sourceLanguage:'es',targetLanguage:'en',translatedText:'Already saved.',createdAt:date});}
const process=(body={targetLanguage:'en'})=>service.processMessage(1,scope,body,'process',signal());
const translate=(body={targetLanguage:'en'})=>service.processMessage(1,scope,body,'translation',signal());
const routeBase='app/api/nooks/[nookId]/messages/[messageId]';
async function call(path,method='POST',body={targetLanguage:'en'},ids={}){
  return load(routeBase+'/'+path+'/route.ts')[method](new Request('http://localhost/api/nooks/10/messages/30/'+path,{
    method,...(method==='GET'?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
  }),{params:Promise.resolve({nookId:'10',messageId:'30',...ids})});
}

test('audio message transcript and translations persist on the message with no private key in the response',async()=>{
 const result=await process();assert.equal(result.message.id,30);assert.equal(result.message.originalTranscript,'A shared memory.');assert.equal(result.translation.messageId,30);assert.equal(result.translation.targetLanguage,'en');assert.equal(result.message.audioStorageKey,undefined);assert.match(result.message.audioUrl,/nooks\/10\/messages\/30\/media/);assert.equal(row().processingStatus,'completed');
 const again=await process();assert.equal(again.cached,true);assert.deepEqual(providerCalls,{transcribe:1,translate:1});
});
test('translation-only failures preserve source and retry avoids reloading or retranscribing audio',async()=>{
 translateFake=async()=>{providerCalls.translate++;throw new FakeProviderError();};const result=await process();assert.equal(result.stage,'translation');assert.equal(result.message.originalTranscript,'A shared memory.');
 translateFake=async()=>{providerCalls.translate++;return 'French text';};const before=storageCalls;await translate({targetLanguage:'fra'});assert.equal(providerCalls.transcribe,1);assert.equal(storageCalls,before);assert.equal(state.message_translations[0].targetLanguage,'fr');
});
test('only sender or owner may upload or process; members read and outsiders or removed members cannot',async()=>{
 await assert.rejects(service.processMessage(2,scope,{targetLanguage:'en'},'process',signal()),e=>e.status===403);
 await assert.rejects(media.initiateMediaUpload(2,scope,{contentType:'audio/wav',byteSize:64}),e=>e.status===403);
 assert.equal((await media.retrieveMedia(2,scope,null)).status,200);
 for(const user of [3,99]){const before=storageCalls;await assert.rejects(media.retrieveMedia(user,scope,null),e=>e.status===404);assert.equal(storageCalls,before);}
 state.team_members=state.team_members.filter(m=>m.userId!==2);await assert.rejects(media.retrieveMedia(2,scope,null),e=>e.status===404);
 assert.equal((await service.processMessage(4,scope,{targetLanguage:'en'},'process',signal())).message.id,30);
});
test('all message media and processing routes require sessions and validate request identities',async()=>{
 for(const [path,method]of[['media','POST'],['media','GET'],['media','DELETE'],['media/complete','POST'],['process','POST'],['translations','GET'],['translations','POST']]){currentUser=null;assert.equal((await call(path,method)).status,401);}
 currentUser={id:1};assert.equal((await call('process','POST',{targetLanguage:'en',storageKey:oldKey})).status,400);
 assert.equal((await call('translations','GET',undefined,{nookId:'99'})).status,404);
});
test('cross-Nook message IDs and forged storage keys never reach private object operations',async()=>{
 await assert.rejects(media.retrieveMedia(1,{nookId:99,messageId:30},null),e=>e.status===404);
 row().audioStorageKey='nooks/99/messages/30/objects/11111111-1111-4111-8111-111111111111.wav';await assert.rejects(process(),e=>e.status===409);assert.equal(storageCalls,0);
});
test('message upload completion replaces immutable audio and clears old generated text atomically',async()=>{
 completed();savedTranslation();const {upload}=await media.initiateMediaUpload(1,scope,{contentType:'audio/wav',byteSize:64});
 await media.completeMediaUpload(1,scope,upload.uploadToken);assert.notEqual(row().audioStorageKey,oldKey);assert.equal(row().originalTranscript,null);assert.equal(row().sourceLanguage,null);assert.equal(row().processingStatus,'draft');assert.equal(state.message_translations.length,0);
 await assert.rejects(media.completeMediaUpload(1,scope,upload.uploadToken),e=>e.status===409);
});
test('recording deletion invalidates in-flight translation and clears processed text',async()=>{
 completed();translateFake=async()=>{providerCalls.translate++;await media.deleteMedia(1,scope);return 'stale';};await assert.rejects(translate(),e=>e.status===409);assert.equal(row().audioStorageKey,null);assert.equal(row().originalTranscript,null);assert.equal(state.message_translations.length,0);
});
test('replacement during transcription rejects its late results',async()=>{
 transcribeFake=async()=>{const {upload}=await media.initiateMediaUpload(1,scope,{contentType:'audio/wav',byteSize:64});await media.completeMediaUpload(1,scope,upload.uploadToken);return {transcript:'stale',originalLanguage:'en'};};
 await assert.rejects(process(),e=>e.status===409);assert.equal(row().originalTranscript,null);assert.equal(state.message_translations.length,0);
});
test('concurrent uncached requests are leased and later return a single cached translation',async()=>{
 completed();let release,entered;const started=new Promise(r=>entered=r);translateFake=async()=>{providerCalls.translate++;entered();await new Promise(r=>release=r);return 'saved';};const first=translate();await started;await assert.rejects(translate(),e=>e.status===409);release();await first;assert.equal((await translate()).cached,true);assert.equal(providerCalls.translate,1);assert.equal(state.message_translations.length,1);
});
test('invalid audio type, size, signature and missing source are rejected',async()=>{
 for(const data of [{contentType:'image/png',byteSize:64},{contentType:'audio/wav',byteSize:4*1024*1024+1}])await assert.rejects(media.initiateMediaUpload(1,scope,data),e=>[413,415].includes(e.status));
 await assert.rejects(translate(),e=>e.status===409);audioBytes=new Uint8Array(64);await assert.rejects(process(),e=>e.status===415);assert.equal(row().processingStatus,'failed');
});
test('members retrieve full and ranged private bytes with appropriate cache and range headers',async()=>{
 const response=await media.retrieveMedia(2,scope,'bytes=10-19');assert.equal(response.status,206);assert.equal((await response.arrayBuffer()).byteLength,10);
 assert.equal(response.headers.get('Content-Length'),'10');assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal((await media.retrieveMedia(2,scope,'bytes=999-1000')).status,416);
});

