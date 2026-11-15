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
const user = { id: 5, name: null, email: 'reader@example.com', passwordHash: 'PRIVATE_HASH', role: 'owner' };
const form = data => { const result = new FormData(); for (const [key,value] of Object.entries(data)) result.set(key,value); return result; };
const redirect = destination => { throw Object.assign(new Error('Redirect'), { destination }); };

function actionHarness() {
  let rows = []; let validPassword = false; let current = user;
  const writes = []; const sessions = [];
  const { getTableName } = require('drizzle-orm');
  const { PgDialect } = require('drizzle-orm/pg-core');
  const dialect = new PgDialect();
  const db = {
    select() { const query = { from() { return query; }, leftJoin() { return query; }, where() { return query; }, limit: async () => rows }; return query; },
    insert(table) { return { values(value) { writes.push({ kind: 'insert', table: getTableName(table), value }); return { returning: async () => [{ ...user, role: value.role }] }; } }; },
    update(table) { return { set(value) { return { where: async condition => { writes.push({ kind: 'update', table: getTableName(table), value, params: dialect.sqlToQuery(condition).params }); } }; } }; },
    async transaction(callback) { return callback(db); }
  };
  const actions = loader({
    '@/lib/db/drizzle': { db }, '@/lib/db/queries': { getUser: async () => current, getUserWithTeam: async () => ({ teamId: 10 }) },
    '@/lib/auth/session': { comparePasswords: async () => validPassword, hashPassword: async () => 'HASHED', setSession: async value => sessions.push(value.id) },
    'next/navigation': { redirect }, 'next/headers': { cookies: async () => ({ delete() {} }) },
    '@/lib/nooks/service': {
      createNookInTransaction: async (tx, userId) => { assert.equal(tx,db); writes.push({ kind: 'createNook', userId }); return { id: 10 }; },
      acceptNookInvitationInTransaction: async (tx, userId, nookId, invitationId) => { assert.equal(tx,db); writes.push({ kind: 'accept', userId, nookId, invitationId }); return { nookId }; }
    }
  })('@/app/(login)/actions');
  return { actions, writes, sessions, rows(value) { rows = value; }, password(value) { validPassword = value; }, current(value) { current = value; } };
}

test('failed sign-in never returns passwords; successful sign-in retains its existing redirect', async () => {
  const h = actionHarness();
  const input = form({ email: user.email, password: 'valid-password' });
  for (const rows of [[], [{ user, team: { id: 10 } }]]) {
    h.rows(rows); const result = await h.actions.signIn({},input);
    assert.equal(result.email,user.email); assert.match(result.error,/Invalid email or password/); assert.equal(Object.hasOwn(result,'password'), false);
  }
  h.password(true);
  await assert.rejects(h.actions.signIn({},input), error => error.destination === '/');
  assert.deepEqual(h.sessions,[user.id]);
});

test('signup keeps the single initial-Nook or invitation path, then redirects to profile setup', async () => {
  for (const invited of [false,true]) {
    const h = actionHarness();
    if (invited) h.rows([{ id: 9, teamId: 22, email: user.email, role: 'member' }]);
    await assert.rejects(h.actions.signUp({},form({ email:user.email,password:'valid-password',inviteId:invited?'9':'' })), error => error.destination === '/profile/setup');
    assert.equal(h.writes.filter(write => write.kind==='createNook').length,invited?0:1);
    assert.equal(h.writes.filter(write => write.kind==='accept').length,invited?1:0);
    assert.equal(h.writes.filter(write => write.table==='users').length,1);
    assert.deepEqual(h.sessions,[user.id]);
  }
  const h = actionHarness(); h.rows([]);
  const result = await h.actions.signUp({},form({ email:user.email,password:'valid-password',inviteId:'9' }));
  assert.match(result.error,/invitation not found/); assert.equal(h.writes.length,0); assert.equal(h.sessions.length,0);
});

test('account update remains bound to the authenticated user and rejects unsigned writes', async () => {
  const h = actionHarness();
  await h.actions.updateAccount({},form({ name:'A Reader',email:user.email,userId:'999' }));
  const write = h.writes.find(write => write.kind==='update');
  assert.deepEqual(write.params,[user.id]); assert.deepEqual(write.value,{ name:'A Reader',email:user.email });
  h.current(null); await assert.rejects(h.actions.updateAccount({},form({ name:'Wrong',email:user.email })),/not authenticated/);
});

test('profile server guard rejects unsigned requests and returns only profile-safe fields', async () => {
  let current = null;
  const guard = loader({ 'server-only': {}, '@/lib/db/queries': { getUser: async () => current }, 'next/navigation': { redirect } })('@/lib/auth/require-profile-user');
  await assert.rejects(guard.requireProfileUser(),error=>error.destination==='/sign-in'); current=user;
  assert.deepEqual(await guard.requireProfileUser(),{ id:user.id,name:null,email:user.email });
  const helpers = loader()('@/lib/frontend/account');
  assert.equal(helpers.withoutPasswordHash(user).passwordHash,undefined);
  assert.equal(helpers.withoutPasswordHash(null),null);
  assert.equal(helpers.accountInitials(null,user.email),'R'); assert.equal(helpers.accountInitials('  Elena Rivera ',user.email),'ER');
});

test('auth UI retains invite IDs in hidden input and navigation without reflecting password state', () => {
  for (const mode of ['signin','signup']) {
    const Login = loader({
      react: { ...React, useActionState: () => [{ email:user.email,password:'DO_NOT_RENDER',error:'Try again' },()=>{},false], useRef: () => ({ current:null }), useEffect() {} },
      'next/navigation': { useSearchParams: () => new URLSearchParams('inviteId=27') },
      '@/app/(login)/actions': { signIn() {},signUp() {} }, '@/components/solibra/shell': { Mascot: () => null }
    })('@/app/(login)/login').Login;
    const html = renderToStaticMarkup(React.createElement(Login,{mode}));
    assert.ok(html.includes('name="inviteId" value="27"')); assert.ok(html.includes(`${mode==='signin'?'/sign-up':'/sign-in'}?inviteId=27`));
    assert.ok(!html.includes('DO_NOT_RENDER')); assert.ok(html.includes(user.email));
    assert.ok(html.includes(mode==='signin'?'Welcome back to your little library.':'Every story starts somewhere.'));
  }
});

test('shared account form preserves authenticated email outside Settings, refreshes caches, and recovers errors', async () => {
  let callback; let payload; let fail=false; let refreshed=0;
  const Form = loader({
    react: { ...React, useState: initial => [initial,()=>{}], useEffect() {}, useActionState: action => { callback=action; return [{},()=>{},false]; } },
    'next/navigation': { useRouter: () => ({ refresh: () => refreshed++ }) },
    swr: { mutate: async predicate => { assert.ok(predicate('/api/user')); assert.ok(predicate(['/api/user',5])); assert.ok(!predicate('/api/nooks')); } },
    '@/app/(login)/actions': { updateAccount: async (_,data) => { if(fail) throw new Error('Provider failed'); payload=Object.fromEntries(data); return { success:'Updated' }; } },
    '@/components/solibra/account-avatar': { AccountAvatar: () => null }
  })('@/components/solibra/account-form').AccountInformationForm;
  renderToStaticMarkup(React.createElement(Form,{ user,mode:'setup' }));
  assert.ok((await callback({},form({ name:' ',email:user.email }))).fields.name);
  assert.ok((await callback({},form({ name:'x'.repeat(101),email:user.email }))).fields.name);
  assert.ok((await callback({},form({ name:' New Reader ',email:'attacker@example.com' }))).success);
  assert.deepEqual(payload,{name:'New Reader',email:user.email}); assert.equal(refreshed,1);
  fail=true; assert.match((await callback({},form({ name:'Retained',email:user.email }))).error,/entries are still here/);
  renderToStaticMarkup(React.createElement(Form,{ user,mode:'settings' })); fail=false;
  await callback({},form({ name:'Reader',email:'new@example.com' })); assert.equal(payload.email,'new@example.com');
});

test('private member cards show scoped roles and context without email addresses or public profile URLs', () => {
  const { MemberProfileCard } = loader()('@/components/solibra/member-profile');
  const html = renderToStaticMarkup(React.createElement(MemberProfileCard,{ nookName:'Sunday table',membership:{id:2,nookId:42,userId:6,role:'member',joinedAt:'2026-01-01',user:{id:6,name:'Elena Rivera',email:'PRIVATE_EMAIL@example.com'}} }));
  assert.ok(html.includes('Elena Rivera')); assert.ok(html.includes('Member')); assert.ok(html.includes('Sunday table')); assert.ok(html.includes('January 1, 2026')); assert.ok(!html.includes('PRIVATE_EMAIL')); assert.ok(!html.includes('/profile/6'));
});

test('profile renders real scoped membership roles, setup and numeric Nook entry links', () => {
  const Profile = loader({
    'next/navigation': { useRouter: () => ({ replace() {},refresh() {} }) },
    '@/app/(login)/actions': { signOut() {} },
    swr: { default: key => key?.[0] === '/api/user' ? { data:user } : { data:{nooks:[{id:42,name:'Sunday table',description:null,role:'member'}]} }, mutate: async () => {} }
  })('@/components/solibra/profile').Profile;
  const html = renderToStaticMarkup(React.createElement(Profile,{viewerId:5}));
  assert.ok(html.includes('Complete Profile')); assert.ok(html.includes('Sunday table')); assert.ok(html.includes('Member'));
  assert.ok(html.includes('Edit Profile')); assert.ok(!html.includes('/dashboard/general')); assert.ok(!html.includes('/dashboard/security'));
  assert.ok(html.includes('/circles/42')); assert.ok(!html.includes('PRIVATE_HASH'));
});

test('password update and deletion failures never reflect submitted secrets', async () => {
 const h=actionHarness();
 const passwordResult=await h.actions.updatePassword({},form({currentPassword:'secret-old',newPassword:'secret-new',confirmPassword:'secret-new'}));
 assert.ok(passwordResult.error); assert.deepEqual(Object.keys(passwordResult),['error']);
 const deletion=await h.actions.deleteAccount({},form({password:'secret-old'}));
 assert.ok(deletion.error); assert.deepEqual(Object.keys(deletion),['error']);
});
