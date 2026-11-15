// Actual routes, JWT tickets, SQL and validation; no Neon or storage network calls.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { getTableName } = require('drizzle-orm');
const { PgDialect } = require('drizzle-orm/pg-core');
const dialect = new PgDialect();
const root = path.resolve(__dirname, '..');
const cache = new Map();
let current, accounts, memberships, objects, calls, failure, dbFailure, ambiguousCommit;
const oldKey = 'users/1/avatars/objects/11111111-1111-4111-8111-111111111111.png';
const date = new Date('2026-01-01T00:00:00Z');
function load(file) {
  file = path.resolve(root, file);
  if (!fs.existsSync(file) && file.endsWith('.ts') && fs.existsSync(file+'x')) file += 'x';
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const source = ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const local = name => {
    if (name === 'server-only') return {};
    if (name === '@/lib/db/drizzle') return { db };
    if (name === '@/lib/db/queries') return { getUser: async () => current ? accounts.find(a => a.id === current && !a.deletedAt) : null };
    if (name === '@/lib/media/storage') return { storage, UPLOAD_SECONDS:120 };
    if (name.startsWith('@/')) return load(name.slice(2)+'.ts');
    if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name)+'.ts');
    return require(name);
  };
  new Function('require','module','exports',source)(local,module,module.exports);
  return module.exports;
}
const db = {
  select(fields) { return query('select',fields); },
  update(table) { return query('update',undefined,table); },
  async transaction(fn) {
    const snapshot=structuredClone(accounts);
    try { const result=await fn(db); if(ambiguousCommit){ambiguousCommit=false;throw Error('ambiguous commit');} return result; }
    catch(error){ if(error.message!=='ambiguous commit')accounts=snapshot; throw error; }
  }
};
function query(op,fields,table) {
  let condition,values;
  const q={ from(t){table=t;return q;},innerJoin(){return q;},where(c){condition=c;return q;},for(){return q;},limit(){return q;},set(v){values=v;return q;},
    then(resolve,reject){return Promise.resolve().then(()=>{
      const sql=dialect.sqlToQuery(condition), params=sql.params;
      if(op==='update') { if(dbFailure)throw Error('private SQL must never escape'); const row=accounts.find(a=>a.id===params[0]); Object.assign(row,values);return []; }
      if(getTableName(table)==='team_members') {
        assert.match(sql.sql,/avatar_viewer/); assert.match(sql.sql,/"role" in/);
        const [owner,viewer]=params;
        return memberships.some(a=>a.userId===owner&&['owner','member'].includes(a.role)&&memberships.some(b=>b.userId===viewer&&a.teamId===b.teamId&&['owner','member'].includes(b.role)))?[{id:1}]:[];
      }
      const row=accounts.find(a=>a.id===params[0]&&(!sql.sql.includes('is null')||!a.deletedAt));
      return row ? [structuredClone(fields ? {key:row.avatarStorageKey} : row)] : [];
    }).then(resolve,reject); }
  };return q;
}
const storage={
  async signUpload(key,type,size){calls.push(['sign',key,type,size]);return {url:'https://storage.invalid',fields:{key}};},
  async head(key){calls.push(['head',key]);if(failure==='head')throw Error('secret');const o=objects.get(key);if(!o)throw new (load('lib/nooks/errors.ts').NookError)(404,'NOT_FOUND','Missing image');return {contentType:o.type,byteSize:o.bytes.length};},
  async copy(source,key){calls.push(['copy',source,key]);if(failure==='copy')throw Error('secret');objects.set(key,structuredClone(objects.get(source)));},
  async get(key,range){calls.push(['get',key]);const bytes=objects.get(key).bytes;return new ReadableStream({start(c){c.enqueue(range?bytes.subarray(0,32):bytes);c.close();}});},
  async remove(key){calls.push(['remove',key]);if(failure==='remove')throw Error('secret');objects.delete(key);}
};
const service=load('lib/avatars/service.ts');
const tickets=load('lib/avatars/tickets.ts');
const types=load('lib/avatars/types.ts');
function image(type='image/png') {const bytes=new Uint8Array(64);if(type==='image/png')bytes.set([137,80,78,71,13,10,26,10]);if(type==='image/jpeg')bytes.set([255,216,255]);if(type==='image/webp'){bytes.set(Buffer.from('RIFF'));bytes.set(Buffer.from('WEBP'),8);}return {type,bytes};}
test.beforeEach(()=>{
  process.env.AUTH_SECRET='unit-test-only-avatar-secret';current=1;calls=[];failure=null;dbFailure=false;ambiguousCommit=false;
  accounts=[1,2,3].map(id=>({id,name:`User ${id}`,email:`u${id}@example.test`,passwordHash:'PRIVATE',avatarStorageKey:null,updatedAt:date,createdAt:date,deletedAt:null}));
  memberships=[{userId:1,teamId:10,role:'owner'},{userId:2,teamId:10,role:'member'}];objects=new Map();
});
async function upload(type='image/png') { const {upload}=await service.initiateAvatar(1,{contentType:type,byteSize:64}); objects.set(upload.fields.key,image(type));return upload; }
async function route(file,method,body) {
  return load(file)[method](new Request('http://localhost/api/profile/avatar',{method,...(method==='GET'?{}:{headers:{'Content-Type':'application/json'},body:method==='DELETE'?undefined:JSON.stringify(body)})}),{params:Promise.resolve({userId:'1'})});
}
test('signed-out callers cannot authorize, finalize, delete or retrieve avatars',async()=>{
  current=null;
  for(const [file,method] of [['app/api/profile/avatar/route.ts','POST'],['app/api/profile/avatar/route.ts','DELETE'],['app/api/profile/avatar/complete/route.ts','POST'],['app/api/users/[userId]/avatar/route.ts','GET']])assert.equal((await route(file,method,{})).status,401);
  assert.equal(calls.length,0);
});
test('cross-origin writes and caller-selected user IDs, URLs and keys are rejected',async()=>{
  const file='app/api/profile/avatar/route.ts';
  const response=await load(file).POST(new Request('http://localhost/api/profile/avatar',{method:'POST',headers:{origin:'https://other.invalid'}}));assert.equal(response.status,403);
  for(const extra of [{userId:2},{storageKey:oldKey},{url:'https://other.invalid/photo'}])assert.equal((await route(file,'POST',{contentType:'image/png',byteSize:64,...extra})).status,400);
  const auth=await upload();await assert.rejects(service.completeAvatar(2,auth.uploadToken),e=>e.status===400);assert.equal(accounts[1].avatarStorageKey,null);
});
test('JPEG, PNG and WebP finalize to the current account and survive new sessions',async()=>{
  for(const type of ['image/jpeg','image/png','image/webp']){
    const auth=await upload(type), result=await service.completeAvatar(1,auth.uploadToken);
    assert.match(accounts[0].avatarStorageKey,/^users\/1\/avatars\/objects\//);assert.match(result.avatarUrl,/^\/api\/users\/1\/avatar\?v=/);assert.equal(result.cleanupPending,false);
    current=null;current=1;const response=await service.retrieveAvatar(current,1);assert.equal(response.headers.get('Content-Type'),type);assert.equal((await response.arrayBuffer()).byteLength,64);
  }
});
test('SVG, empty, oversized and contradictory image data cannot become avatars',async()=>{
  for(const input of [{contentType:'image/svg+xml',byteSize:64},{contentType:'image/png',byteSize:0},{contentType:'image/png',byteSize:2_000_001}])await assert.rejects(service.initiateAvatar(1,input),e=>e.status===400);
  assert.equal(calls.length,0);
  const auth=await upload();objects.set(auth.fields.key,image('image/jpeg'));await assert.rejects(service.completeAvatar(1,auth.uploadToken),e=>e.status===415);assert.equal(accounts[0].avatarStorageKey,null);
  assert.equal(types.avatarUploadSchema.safeParse({contentType:'image/png',byteSize:2_000_000}).success,true);
});
test('private retrieval permits self and current shared members, denying unrelated and removed users',async()=>{
  accounts[0].avatarStorageKey=oldKey;objects.set(oldKey,image());
  for(const viewer of [1,2]){const response=await service.retrieveAvatar(viewer,1);assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');}
  const before=calls.length;await assert.rejects(service.retrieveAvatar(3,1),e=>e.status===404);assert.equal(calls.length,before);
  memberships=[];await assert.rejects(service.retrieveAvatar(2,1),e=>e.status===404);
  memberships=[{userId:1,teamId:99,role:'member'},{userId:2,teamId:99,role:'member'}];assert.equal((await service.retrieveAvatar(2,1)).status,200);
  accounts[0].deletedAt=new Date();await assert.rejects(service.retrieveAvatar(2,1),e=>e.status===404);
});
test('missing avatars and invalid namespaces fail without exposing arbitrary bucket objects',async()=>{
  await assert.rejects(service.retrieveAvatar(1,1),e=>e.status===404);
  accounts[0].avatarStorageKey='users/2/avatars/objects/11111111-1111-4111-8111-111111111111.png';await assert.rejects(service.retrieveAvatar(1,1),e=>e.status===409);assert.equal(calls.length,0);
});
test('successful replacement associates a new immutable key before cleaning old objects',async()=>{
  accounts[0].avatarStorageKey=oldKey;objects.set(oldKey,image());const auth=await upload();const result=await service.completeAvatar(1,auth.uploadToken);
  assert.notEqual(accounts[0].avatarStorageKey,oldKey);assert.equal(objects.has(oldKey),false);assert.equal(objects.has(auth.fields.key),false);assert.equal(result.cleanupPending,false);
  // Replaying the staging policy cannot mutate the published immutable copy.
  objects.set(auth.fields.key,image('image/jpeg'));assert.equal(objects.get(accounts[0].avatarStorageKey).type,'image/png');
});
test('copy and database failures preserve the old photo and sanitize errors',async()=>{
  accounts[0].avatarStorageKey=oldKey;objects.set(oldKey,image());const auth=await upload();
  failure='copy';await assert.rejects(service.completeAvatar(1,auth.uploadToken),e=>e.status===503&&!e.message.includes('secret'));assert.equal(accounts[0].avatarStorageKey,oldKey);
  failure=null;dbFailure=true;await assert.rejects(service.completeAvatar(1,auth.uploadToken),e=>e.status===503);assert.equal(accounts[0].avatarStorageKey,oldKey);assert.equal(objects.has(oldKey),true);
});
test('stale, tampered, expired and session-substituted tickets cannot overwrite a newer avatar',async()=>{
  const first=await upload(),second=await upload();await service.completeAvatar(1,second.uploadToken);const key=accounts[0].avatarStorageKey;
  await assert.rejects(service.completeAvatar(1,first.uploadToken),e=>e.status===409);
  await assert.rejects(service.completeAvatar(1,first.uploadToken+'x'),e=>e.status===400);
  const {SignJWT}=require('jose'),{createHmac}=require('node:crypto');
  const secret=createHmac('sha256',process.env.AUTH_SECRET).update('solibra-avatar-upload-v1').digest();
  const payload=await tickets.readAvatarTicket(first.uploadToken);
  const expired=await new SignJWT(payload).setProtectedHeader({alg:'HS256'}).setIssuer('solibra').setAudience('avatar-upload').setExpirationTime(1).sign(secret);
  await assert.rejects(service.completeAvatar(1,expired),e=>e.status===400);
  const session=await new SignJWT({user:{id:1}}).setProtectedHeader({alg:'HS256'}).sign(new TextEncoder().encode(process.env.AUTH_SECRET));await assert.rejects(service.completeAvatar(1,session),e=>e.status===400);assert.equal(accounts[0].avatarStorageKey,key);
});
test('deletion clears the reference and invalidates an outstanding upload even when already empty',async()=>{
  const pending=await upload();await service.deleteAvatar(1);await assert.rejects(service.completeAvatar(1,pending.uploadToken),e=>e.status===409);
  const auth=await upload();await service.completeAvatar(1,auth.uploadToken);const key=accounts[0].avatarStorageKey;
  const result=await service.deleteAvatar(1);assert.equal(result.avatarUrl,null);assert.equal(accounts[0].avatarStorageKey,null);assert.equal(objects.has(key),false);
});
test('cleanup failure leaves a valid new photo, or a cleared reference after deletion',async()=>{
  accounts[0].avatarStorageKey=oldKey;objects.set(oldKey,image());const auth=await upload();failure='remove';
  const result=await service.completeAvatar(1,auth.uploadToken);assert.equal(result.cleanupPending,true);assert.notEqual(accounts[0].avatarStorageKey,oldKey);
  assert.equal((await service.deleteAvatar(1)).cleanupPending,true);assert.equal(accounts[0].avatarStorageKey,null);
});
test('ambiguous commit never removes a candidate that actually became current',async()=>{
  const auth=await upload();ambiguousCommit=true;await assert.rejects(service.completeAvatar(1,auth.uploadToken),e=>e.status===503);assert.ok(objects.has(accounts[0].avatarStorageKey));
});
test('authenticated user serialization returns avatar routes and never private keys or hashes',()=>{
  accounts[0].avatarStorageKey=oldKey;const result=load('lib/frontend/account.ts').withoutPasswordHash(accounts[0]);
  assert.equal(Object.hasOwn(result,'avatarStorageKey'),false);assert.equal(Object.hasOwn(result,'passwordHash'),false);assert.match(result.avatarUrl,/^\/api\/users\/1\/avatar/);
  accounts[0].avatarStorageKey=null;assert.equal(load('lib/frontend/account.ts').withoutPasswordHash(accounts[0]).avatarUrl,null);
});

test('avatar helper uses same-origin session auth, credential-free storage POST and file-last multipart',async()=>{
  const original=global.fetch;const requests=[];
  global.fetch=async(url,options)=>{
    requests.push({url,options});
    if(requests.length===1)return Response.json({upload:{url:'https://storage.invalid',fields:{key:'temporary',policy:'restricted'},uploadToken:'ticket'}});
    if(requests.length===2)return new Response(null,{status:204});
    return Response.json({avatarUrl:'/api/users/1/avatar?v=2',cleanupPending:false});
  };
  try{
    const client=load('lib/frontend/avatar-client.ts');const file=new File([image().bytes],'untrusted-name.png',{type:'image/png'});
    const result=await client.uploadAvatar(file);assert.equal(result.avatarUrl,'/api/users/1/avatar?v=2');
    assert.deepEqual(requests.map(r=>r.url),['/api/profile/avatar','https://storage.invalid','/api/profile/avatar/complete']);
    assert.equal(requests[0].options.credentials,'same-origin');assert.equal(requests[1].options.credentials,'omit');assert.equal(requests[2].options.credentials,'same-origin');
    assert.equal([...requests[1].options.body.keys()].at(-1),'file');assert.deepEqual(JSON.parse(requests[2].options.body),{uploadToken:'ticket'});
    await assert.rejects(client.uploadAvatar(new File(['svg'],'x.svg',{type:'image/svg+xml'})));assert.equal(requests.length,3);
  }finally{global.fetch=original;}
});

test('avatar UI retains initials with no photo and renders the authorized URL when present',()=>{
  const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
  const Avatar=load('components/solibra/account-avatar.tsx').AccountAvatar;
  const fallback=renderToStaticMarkup(React.createElement(Avatar,{name:'Alice Reader',email:'a@example.test'}));assert.match(fallback,/AR/);assert.doesNotMatch(fallback,/\/api\/users/);
  // Radix intentionally waits for browser image load; its fallback remains safe on the server.
  const element=Avatar({name:'Alice Reader',email:'a@example.test',avatarUrl:'/api/users/1/avatar?v=1'});
  assert.equal(element.props.children[0].props.src,'/api/users/1/avatar?v=1');assert.equal(element.props.children[1].props.children,'AR');
});
