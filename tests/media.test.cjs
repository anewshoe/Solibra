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
    if (name === '@aws-sdk/client-s3') return sdkFake;
    if (name === '@aws-sdk/s3-presigned-post') return { createPresignedPost: async (_client, options) => { policyOptions = options; return { url: 'https://storage.invalid', fields: { key: options.Key } }; } };
    if (name === '@/lib/db/drizzle') return { db };
    if (name === '@/lib/db/queries') return { getUser: async () => currentUser };
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
    if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name) + '.ts');
    return require(name);
  };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename: file })(localRequire, module, module.exports);
  return module.exports;
}

let policyOptions;
let sdkSend = async () => ({});
class Command { constructor(input) { this.input = input; } }
const sdkFake = {
  S3Client: class { constructor(options) { this.options = options; } send(command) { return sdkSend(command.input); } },
  HeadObjectCommand: Command, GetObjectCommand: Command, CopyObjectCommand: Command, DeleteObjectCommand: Command
};
const stored = new Map();
const operations = [];
let failStorage;
const storageFake = {
  async signUpload(key, contentType, byteSize) { operations.push(['sign',key,contentType,byteSize]); return { url:'https://storage.invalid', fields:{key} }; },
  async head(key) {
    operations.push(['head',key]);
    if (failStorage?.('head',key)) throw new (load('lib/nooks/errors.ts').NookError)(503,'INTERNAL_ERROR','Storage unavailable.');
    const row=stored.get(key);
    if(!row) throw new (load('lib/nooks/errors.ts').NookError)(404,'NOT_FOUND','Nook media not found.');
    return { byteSize:row.bytes.length, contentType:row.type };
  },
  async copy(source,key) {
    operations.push(['copy',source,key]);
    if (failStorage?.('copy',key)) throw new (load('lib/nooks/errors.ts').NookError)(503,'INTERNAL_ERROR','Storage unavailable.');
    const row=stored.get(source); stored.set(key,{ bytes:Buffer.from(row.bytes), type:row.type });
  },
  async get(key,range) {
    operations.push(['get',key,range]);
    const row=stored.get(key);
    const match=range && /^bytes=(\d+)-(\d+)$/.exec(range);
    const bytes=match?row.bytes.subarray(Number(match[1]),Number(match[2])+1):row.bytes;
    return new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } });
  },
  async remove(key) {
    operations.push(['remove',key]);
    if(failStorage?.('remove',key)) throw new (load('lib/nooks/errors.ts').NookError)(503,'INTERNAL_ERROR','Storage unavailable.');
    stored.delete(key);
  }
};
const service=load('lib/media/service.ts');
const tickets=load('lib/media/tickets.ts');
const validation=load('lib/media/validation.ts');
const contracts=load('lib/media/types.ts');
const realStorage=load('lib/media/storage.ts');
const {NookError}=load('lib/nooks/errors.ts');
const date=new Date('2026-01-01T00:00:00Z');
const scope={nookId:10,artifactId:20,contributionId:null};
const contributionScope={...scope,contributionId:30};
const start='nooks/10/artifacts/20';
const uuid='11111111-1111-4111-8111-111111111111';
const oldKey=`${start}/objects/${uuid}.png`;
const stage=`${start}/staging/${uuid}.png`;
const artifact={id:20,nookId:10,creatorId:1,type:'photo',mediaStorageKey:null,updatedAt:date};
const contribution={id:30,artifactId:20,authorId:2,type:'audio',audioStorageKey:null,updatedAt:date};
const png=Buffer.alloc(64); Buffer.from([137,80,78,71,13,10,26,10]).copy(png);
const wav=Buffer.alloc(64); wav.write('RIFF',0); wav.write('WAVE',8);
const routes=[
  ['app/api/nooks/[nookId]/artifacts/[artifactId]/media/route.ts','GET'],
  ['app/api/nooks/[nookId]/artifacts/[artifactId]/media/route.ts','POST'],
  ['app/api/nooks/[nookId]/artifacts/[artifactId]/media/route.ts','DELETE'],
  ['app/api/nooks/[nookId]/artifacts/[artifactId]/media/complete/route.ts','POST'],
  ['app/api/nooks/[nookId]/artifacts/[artifactId]/contributions/[contributionId]/media/route.ts','GET'],
  ['app/api/nooks/[nookId]/artifacts/[artifactId]/contributions/[contributionId]/media/route.ts','POST'],
  ['app/api/nooks/[nookId]/artifacts/[artifactId]/contributions/[contributionId]/media/route.ts','DELETE'],
  ['app/api/nooks/[nookId]/artifacts/[artifactId]/contributions/[contributionId]/media/complete/route.ts','POST']
];
const originalEnv={...process.env};
test.beforeEach(()=>{
  stored.clear(); operations.length=0; failStorage=undefined; currentUser=null;
  process.env.AUTH_SECRET='unit-tests-only-no-real-credentials';
});
test.afterEach(()=>{
  for(const key of Object.keys(process.env)) if(!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env,originalEnv);
});
function scripted(steps) {
  const pending=[...steps], writes=[];
  const dialect=new PgDialect();
  function query(op,table) {
    let where,lock,values;
    const q={from(t){table=t;return q;},where(v){where=v;return q;},for(v){lock=v;return q;},
      set(v){values=v;return q;},then(resolve,reject){return Promise.resolve().then(()=>{
        const next=pending.shift(); assert.ok(next,`Unexpected ${op} on ${getTableName(table)}`);
        assert.equal(op,next.op??'select'); assert.equal(getTableName(table),next.table);
        if(next.params) assert.deepEqual(dialect.sqlToQuery(where).params,next.params);
        if(next.lock) assert.equal(lock,next.lock);
        if(next.error) throw next.error;
        if(op==='update') { writes.push(values); operations.push(['db-update',values]); }
        return next.rows??[];
      }).then(resolve,reject);}}; return q;
  }
  const api={select:()=>query('select'), update:t=>query('update',t), async transaction(fn){
    const before=writes.length; try{return await fn(api);}catch(error){writes.splice(before);throw error;}
  }};
  database=api;
  return {writes,done:()=>assert.equal(pending.length,0,'Expected queries consumed')};
}
function access(userId=1,role='member',row=artifact,manage=true,child) {
  return [
    {table:'teams',params:[10],lock:'share',rows:[{id:10}]},
    {table:'team_members',params:[10,userId],rows:role?[{userId,teamId:10,role}]:[]},
    ...(role?[{table:'artifacts',params:[20,10],lock:manage?'update':'share',rows:row?[row]:[]}]:[]),
    ...(child?[{table:'contributions',params:[30,20],lock:manage?'update':'share',rows:[child]}]:[])
  ];
}
async function ticket(overrides={}) {
  return tickets.signTicket({...scope,userId:1,stagingKey:stage,contentType:'image/png',byteSize:64,
    previousKey:null,version:date.toISOString(),...overrides});
}
async function call(route,body,headers={}) {
  const [file,method]=route;
  return load(file)[method](new Request('http://localhost/api/nooks/10/artifacts/20/media',{
    method,headers:{...(body?{'content-type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})
  }),{params:Promise.resolve({nookId:'10',artifactId:'20',contributionId:'30'})});
}

test('all media routes require a session and reject cross-origin mutations before provider access',async()=>{
  const f=scripted([]);
  for(const route of routes) assert.equal((await call(route)).status,401);
  currentUser={id:1};
  assert.equal((await call(routes[1],{contentType:'image/png',byteSize:64},{origin:'https://outside.example'})).status,403);
  assert.equal(operations.length,0); f.done();
});
test('every media operation denies nonmembers and removed members without touching storage',async()=>{
  for(const userId of [2,3]) for(const action of ['init','get','delete','complete']) {
    const f=scripted(access(userId,null));
    const run=action==='init'?()=>service.initiateMediaUpload(userId,scope,{contentType:'image/png',byteSize:64}):
      action==='get'?()=>service.retrieveMedia(userId,scope,null):action==='delete'?()=>service.deleteMedia(userId,scope):
      async()=>service.completeMediaUpload(userId,scope,await ticket({userId}));
    await assert.rejects(run(),e=>e.status===404); f.done();
  }
  assert.equal(operations.length,0);
});
test('known artifact IDs cannot bypass Nook scope; valid membership is checked first',async()=>{
  const f=scripted(access(1,'member',null,false));
  await assert.rejects(service.retrieveMedia(1,scope,null),e=>e.status===404);
  assert.equal(operations.length,0);f.done();
});
test('creator may initiate photo/audio uploads and contribution author may initiate recording uploads',async()=>{
  for(const [target,userId,row,child,contentType] of [
    [scope,1,artifact,null,'image/png'],[scope,1,{...artifact,type:'audio'},null,'audio/wav'],
    [contributionScope,2,artifact,contribution,'audio/webm;codecs=opus']
  ]) {
    const f=scripted(access(userId,'member',row,true,child));
    const result=await service.initiateMediaUpload(userId,target,{contentType,byteSize:64});
    const decoded=await tickets.readTicket(result.upload.uploadToken);
    assert.equal(decoded.userId,userId);assert.equal(decoded.contributionId,target.contributionId);
    assert.equal(result.upload.method,'POST'); assert.equal(f.writes.length,0); f.done();
  }
});
test('ordinary members cannot overwrite or delete others media; Nook owners may moderate it',async()=>{
  for(const operation of ['init','delete']) {
    const f=scripted(access(2));
    await assert.rejects(operation==='init'?service.initiateMediaUpload(2,scope,{contentType:'image/png',byteSize:64}):service.deleteMedia(2,scope),e=>e.status===403);
    f.done();
  }
  const f=scripted(access(2,'owner'));
  assert.ok((await service.initiateMediaUpload(2,scope,{contentType:'image/png',byteSize:64})).upload.uploadToken);f.done();
});
test('resource mismatches and forged stored keys cannot reach provider operations',async()=>{
  for(const row of [{...artifact,type:'text'},{...artifact,mediaStorageKey:'nooks/99/artifacts/20/objects/'+uuid+'.png'},
    {...artifact,mediaStorageKey:'https://outside.example/private.png'}]) {
    const f=scripted(access(1,'member',row));
    await assert.rejects(service.initiateMediaUpload(1,scope,{contentType:'image/png',byteSize:64}),e=>[409,415].includes(e.status));f.done();
  }
  const f=scripted([...access(),{table:'contributions',params:[30,20],lock:'update',rows:[]}]);
  await assert.rejects(service.deleteMedia(1,contributionScope),e=>e.status===404);f.done();assert.equal(operations.length,0);
});
test('successful completion publishes an immutable verified key and retires staging only after DB update',async()=>{
  stored.set(stage,{bytes:png,type:'image/png'});
  const f=scripted([...access(),{op:'update',table:'artifacts',params:[20,10]}]);
  const result=await service.completeMediaUpload(1,scope,await ticket());
  const key=f.writes[0].mediaStorageKey;
  assert.ok(key.includes('/objects/')); assert.notEqual(key,stage); assert.ok(stored.has(key));assert.ok(!stored.has(stage));
  assert.equal(result.media.url,service.mediaUrl(scope));assert.equal(result.cleanupPending,false);
  assert.ok(operations.findIndex(o=>o[0]==='db-update')<operations.findIndex(o=>o[0]==='remove'));
  // A replay of the upload URL changes only staging, never the published copy.
  stored.set(stage,{bytes:Buffer.alloc(64),type:'image/png'}); assert.deepEqual(stored.get(key).bytes,png);f.done();
});
test('contribution audio completion updates the matching audio key without invoking the voice pipeline',async()=>{
  const audioStage=`${start}/contributions/30/staging/${uuid}.wav`;
  stored.set(audioStage,{bytes:wav,type:'audio/wav'});
  const f=scripted([...access(2,'member',artifact,true,contribution),{op:'update',table:'contributions',params:[30,20]}]);
  const token=await ticket({...contributionScope,userId:2,stagingKey:audioStage,contentType:'audio/wav'});
  const result=await service.completeMediaUpload(2,contributionScope,token);
  assert.ok(f.writes[0].audioStorageKey.includes('/contributions/30/objects/'));
  assert.equal(result.media.contentType,'audio/wav');assert.equal('originalTranscript' in f.writes[0],false);f.done();
});
test('finalize tickets reject tampering, another user, wrong resource IDs, expiration, and session-token substitution',async()=>{
  const good=await ticket(); const f=scripted([]);
  for(const [user,target,value] of [[2,scope,good],[1,{...scope,nookId:11},good],[1,contributionScope,good],[1,scope,good+'x']]) {
    await assert.rejects(service.completeMediaUpload(user,target,value),e=>e.status===400);
  }
  const {SignJWT}=require('jose'); const {createHmac}=require('crypto');
  const signingKey=createHmac('sha256',process.env.AUTH_SECRET).update('solibra-private-media-upload-v1').digest();
  const expired=await new SignJWT({}).setProtectedHeader({alg:'HS256'}).setIssuer('solibra').setAudience('private-media-upload').setExpirationTime(1).sign(signingKey);
  await assert.rejects(tickets.readTicket(expired),e=>e.status===400);
  const sessionLike=await new SignJWT({user:{id:1}}).setProtectedHeader({alg:'HS256'}).setExpirationTime('1h').sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  await assert.rejects(tickets.readTicket(sessionLike),e=>e.status===400); f.done();
});
test('a changed resource version prevents stale completion without deleting current media',async()=>{
  const f=scripted(access(1,'member',{...artifact,mediaStorageKey:oldKey}));
  await assert.rejects(service.completeMediaUpload(1,scope,await ticket()),e=>e.status===409);
  assert.equal(operations.length,0);f.done();
});
test('invalid uploaded bytes never attach; invalid candidate and staging are cleaned up',async()=>{
  stored.set(stage,{bytes:Buffer.alloc(64),type:'image/png'});
  const f=scripted([...access(),{table:'artifacts',params:[20,10],rows:[{key:null}]}]);
  await assert.rejects(service.completeMediaUpload(1,scope,await ticket()),e=>e.status===415);
  assert.equal(f.writes.length,0);assert.equal(stored.size,0);f.done();
});
test('provider copy failure and DB update failure do not replace the old reference',async()=>{
  for(const providerFails of [true,false]) {
    stored.clear();stored.set(stage,{bytes:png,type:'image/png'});stored.set(oldKey,{bytes:png,type:'image/png'});
    failStorage=providerFails?(op)=>op==='copy':undefined;
    const f=scripted([...access(1,'member',{...artifact,mediaStorageKey:oldKey}),
      ...(providerFails?[]:[{op:'update',table:'artifacts',params:[20,10],error:new Error('database unavailable')}]),
      {table:'artifacts',params:[20,10],rows:[{key:oldKey}]}]);
    await assert.rejects(service.completeMediaUpload(1,scope,await ticket({previousKey:oldKey})),e=>e.status===503);
    assert.equal(f.writes.length,0);assert.ok(stored.has(oldKey));assert.equal(stored.size,1);f.done();
  }
});
test('failed old-object cleanup is explicitly reported after successful replacement',async()=>{
  stored.set(stage,{bytes:png,type:'image/png'});stored.set(oldKey,{bytes:png,type:'image/png'});
  failStorage=(op,key)=>op==='remove'&&key===oldKey;
  const f=scripted([...access(1,'member',{...artifact,mediaStorageKey:oldKey}),{op:'update',table:'artifacts',params:[20,10]}]);
  const result=await service.completeMediaUpload(1,scope,await ticket({previousKey:oldKey}));
  assert.equal(result.cleanupPending,true);assert.ok(stored.has(oldKey));assert.ok(stored.has(f.writes[0].mediaStorageKey));f.done();
});
test('two Nook members retrieve the same private photo and audio with nosniff, private caching, and Range support',async()=>{
  for(const [type,bytes,extension] of [['image/png',png,'png'],['audio/wav',wav,'wav']]) {
    const key=`${start}/objects/${uuid}.${extension}`;stored.set(key,{bytes,type});
    for(const userId of [1,2]) {
      currentUser={id:userId};
      const f=scripted(access(userId,'member',{...artifact,type:type.startsWith('image')?'photo':'audio',mediaStorageKey:key},false));
      const response=await call(routes[0],undefined,{range:'bytes=0-15'});
      assert.equal(response.status,206);assert.equal(response.headers.get('content-type'),type);
      assert.equal(response.headers.get('content-range'),'bytes 0-15/64');assert.equal(response.headers.get('x-content-type-options'),'nosniff');
      assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('vary'),'Cookie');
      assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes.subarray(0,16));f.done();
    }
  }
});
test('unsatisfiable and multiple ranges return 416 without fetching private bytes',async()=>{
  stored.set(oldKey,{bytes:png,type:'image/png'});
  const f=scripted(access(1,'member',{...artifact,mediaStorageKey:oldKey},false));
  const response=await service.retrieveMedia(1,scope,'bytes=999-');
  assert.equal(response.status,416);assert.equal(response.headers.get('content-range'),'bytes */64');
  assert.equal(operations.some(o=>o[0]==='get'),false);f.done();
  assert.deepEqual(validation.parseMediaRange('bytes=-4',64),{start:60,end:63});
  for(const value of ['bytes=0-1,3-4','bytes=-0','bytes=a-b']) assert.throws(()=>validation.parseMediaRange(value,64));
});
test('authorized deletion clears only the attached key; provider failure remains an error with the DB untouched',async()=>{
  for(const fails of [true,false]) {
    stored.set(oldKey,{bytes:png,type:'image/png'});stored.set('unrelated',{bytes:png,type:'image/png'});
    failStorage=fails?(op)=>op==='remove':undefined;
    const f=scripted([...access(1,'member',{...artifact,mediaStorageKey:oldKey}),
      ...(fails?[]:[{op:'update',table:'artifacts',params:[20,10]}])]);
    if(fails) {await assert.rejects(service.deleteMedia(1,scope),e=>e.status===503);assert.equal(f.writes.length,0);assert.ok(stored.has(oldKey));}
    else {assert.deepEqual(await service.deleteMedia(1,scope),{success:true});assert.equal(f.writes[0].mediaStorageKey,null);assert.equal(stored.has(oldKey),false);}
    assert.ok(stored.has('unrelated'));f.done();
  }
});
test('image and recording limits, MIME aliases, and signatures reject unsupported or contradictory input',()=>{
  assert.equal(validation.validateMedia('photo','image/png',5_000_000).byteSize,5_000_000);
  assert.equal(validation.validateMedia('audio','audio/webm;codecs=opus',4*1024*1024).contentType,'audio/webm');
  for(const [kind,type,size] of [['photo','image/svg+xml',64],['photo','text/html',64],['photo','audio/wav',64],
    ['audio','image/png',64],['photo','image/png',5_000_001],['audio','audio/wav',4*1024*1024+1]]) assert.throws(()=>validation.validateMedia(kind,type,size));
  assert.equal(validation.matchesMediaSignature(png,'image/jpeg'),false);
  assert.equal(contracts.mediaCompleteSchema.safeParse({uploadToken:'x',key:oldKey}).success,false);
  assert.equal(contracts.mediaUploadSchema.safeParse({contentType:'image/png',byteSize:64,key:oldKey}).success,false);
});
test('storage client uses only the approved Ohio endpoint and exact-size private upload policies; provider errors are sanitized',async()=>{
  Object.assign(process.env,{NEON_STORAGE_ENDPOINT:'https://br-unit-test.storage.c-1.us-east-2.aws.neon.tech',
    NEON_STORAGE_REGION:'us-east-2',NEON_STORAGE_ACCESS_KEY_ID:'unit-test-id',NEON_STORAGE_SECRET_ACCESS_KEY:'unit-test-secret',SOLIBRA_MEDIA_BUCKET:'solibra-private'});
  await realStorage.storage.signUpload(stage,'image/png',64);
  assert.equal(policyOptions.Bucket,'solibra-private');assert.equal(policyOptions.Key,stage);assert.equal(policyOptions.Expires,120);
  assert.ok(policyOptions.Conditions.some(c=>c[0]==='content-length-range'&&c[1]===64&&c[2]===64));
  assert.equal(policyOptions.Fields['Cache-Control'],'private, no-store');assert.equal('acl' in policyOptions.Fields,false);
  let sent; sdkSend=async(input)=>{sent=input;throw new Error('sensitive provider request detail');};
  await assert.rejects(realStorage.storage.remove(oldKey),e=>e.status===503&&!e.message.includes('sensitive'));
  assert.equal(sent.Key,oldKey);assert.equal(sent.Bucket,'solibra-private');
  process.env.NEON_STORAGE_ENDPOINT='https://s3.amazonaws.com';assert.throws(()=>realStorage.storageConfig(),e=>e.status===503);
});

test('both members can retrieve contribution audio through the scoped parent path',async()=>{
  const key=`${start}/contributions/30/objects/${uuid}.wav`;
  stored.set(key,{bytes:wav,type:'audio/wav'});
  for(const userId of [1,2]) {
    const f=scripted(access(userId,'member',artifact,false,{...contribution,audioStorageKey:key}));
    const response=await service.retrieveMedia(userId,contributionScope,null);
    assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'audio/wav');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),wav);f.done();
  }
});
test('ambiguous DB state retains the candidate when reference reconciliation fails',async()=>{
  stored.set(stage,{bytes:png,type:'image/png'});
  const f=scripted([...access(),{op:'update',table:'artifacts',error:new Error('commit uncertain')},
    {table:'artifacts',error:new Error('database unreachable')}]);
  await assert.rejects(service.completeMediaUpload(1,scope,await ticket()),e=>e.status===503);
  assert.equal([...stored.keys()].filter(k=>k.includes('/objects/')).length,1);
  assert.equal(stored.has(stage),false);f.done();
});
test('DELETE can be retried after object deletion succeeds but DB clearing fails',async()=>{
  stored.set(oldKey,{bytes:png,type:'image/png'});
  const failed=scripted([...access(1,'member',{...artifact,mediaStorageKey:oldKey}),
    {op:'update',table:'artifacts',error:new Error('database unavailable')}]);
  await assert.rejects(service.deleteMedia(1,scope),e=>e.status===503);
  assert.equal(stored.has(oldKey),false);failed.done();
  const retry=scripted([...access(1,'member',{...artifact,mediaStorageKey:oldKey}),{op:'update',table:'artifacts'}]);
  assert.deepEqual(await service.deleteMedia(1,scope),{success:true});
  assert.equal(retry.writes[0].mediaStorageKey,null);retry.done();
});
test('frontend utility uses session auth only for the app, multipart file-last storage upload, then finalization',async()=>{
  const client=load('lib/frontend/media-client.ts');
  const original=global.fetch;const calls=[];
  const mediaPath=service.mediaUrl(scope);
  global.fetch=async(url,options)=>{
    calls.push([url,options]);
    if(calls.length===1) return Response.json({upload:{url:'https://storage.invalid',fields:{key:stage,policy:'test-policy'},uploadToken:'test-ticket'}});
    if(calls.length===2) return new Response(null,{status:204});
    return Response.json({media:{url:mediaPath,contentType:'image/png',byteSize:64},cleanupPending:false});
  };
  try {
    const result=await client.uploadPrivateMedia(mediaPath,new Blob([png],{type:'image/png'}));
    assert.equal(result.media.url,mediaPath);assert.equal(calls.length,3);
    assert.equal(calls[0][1].credentials,'same-origin');assert.equal(calls[1][1].credentials,'omit');
    assert.equal([...calls[1][1].body.keys()].at(-1),'file');
    assert.equal(calls[1][1].headers,undefined);assert.equal(calls[2][0],mediaPath+'/complete');
    assert.equal(JSON.parse(calls[2][1].body).uploadToken,'test-ticket');
  } finally {global.fetch=original;}
});

