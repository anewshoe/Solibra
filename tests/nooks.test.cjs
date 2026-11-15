// Unit tests use the real service, route handlers, schemas, and SQL expressions.
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
    if (name === '@/lib/db/drizzle') return { db };
    if (name === '@/lib/db/queries') return { getUser: async () => currentUser };
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
    if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name) + '.ts');
    return require(name);
  };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename: file })(localRequire, module, module.exports);
  return module.exports;
}

const schema = load('lib/db/schema.ts');
const service = load('lib/nooks/service.ts');
const { NookError } = load('lib/nooks/errors.ts');
const { nookBody, nookId, nookResponse } = load('lib/nooks/http.ts');
const contracts = load('lib/nooks/types.ts');
const date = new Date('2026-01-01T00:00:00Z');
const nook = { id: 10, name: 'Shared stories', description: null, createdAt: date, updatedAt: date };
const owner = { id: 1, teamId: 10, userId: 1, role: 'owner', joinedAt: date };
const member = { id: 2, teamId: 10, userId: 2, role: 'member', joinedAt: date };
const invitation = {
  id: 7, teamId: 10, email: 'second@example.com', role: 'member',
  invitedBy: 1, invitedAt: date, status: 'pending'
};

function scripted(steps) {
  const pending = [...steps];
  const writes = [];
  const dialect = new PgDialect();
  const builder = (op, table) => {
    let where;
    let values;
    let locked = false;
    const query = {
      from(value) { table = value; return query; },
      innerJoin() { return query; },
      where(value) { where = value; return query; },
      orderBy() { return query; },
      limit() { return query; },
      for() { locked = true; return query; },
      values(value) { values = value; return query; },
      set(value) { values = value; return query; },
      returning() { return query; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          const step = pending.shift();
          assert.ok(step, `Unexpected ${op} on ${getTableName(table)}`);
          assert.equal(op, step.op ?? 'select');
          assert.equal(getTableName(table), step.table);
          if (step.params) assert.deepEqual(dialect.sqlToQuery(where).params, step.params);
          if (step.lock) assert.equal(locked, true);
          if (op !== 'select') writes.push({ op, table: getTableName(table), values });
          return step.rows ?? [];
        }).then(resolve, reject);
      }
    };
    return query;
  };
  const api = {
    select: () => builder('select'), insert: (t) => builder('insert', t),
    update: (t) => builder('update', t), delete: (t) => builder('delete', t),
    transaction: (callback) => callback(api)
  };
  database = api;
  return { writes, done: () => assert.equal(pending.length, 0, 'All expected queries executed') };
}
const lock = () => ({ table: 'teams', rows: [nook], params: [10], lock: true });
const membership = (userId, rows) => ({ table: 'team_members', rows, params: [10, userId] });
const rejects = (code) => (error) => error instanceof NookError && error.code === code;

test('Nook contracts reject blank names, oversized descriptions, unknown roles and actor spoofing', () => {
  assert.equal(contracts.createNookSchema.safeParse({ name: '  ' }).success, false);
  assert.equal(contracts.createNookSchema.safeParse({ name: 'Nook', userId: 1 }).success, false);
  assert.equal(contracts.createNookSchema.safeParse({ name: 'Nook', description: 'x'.repeat(2001) }).success, false);
  assert.equal(contracts.updateNookSchema.safeParse({}).success, false);
  assert.equal(contracts.inviteNookMemberSchema.safeParse({ email: 'a@example.com', role: 'admin' }).success, false);
  assert.equal(contracts.inviteNookMemberSchema.parse({ email: 'a@example.com' }).role, 'member');
  for (const id of ['0', '-1', '1.5', '1e3', '9007199254740992']) assert.throws(() => nookId(id));
});

test('all exported Nook routes reject unauthenticated requests before database access', async () => {
  currentUser = null;
  const fixture = scripted([]);
  const routes = [
    'app/api/nooks/route.ts', 'app/api/nooks/[nookId]/route.ts',
    'app/api/nooks/[nookId]/members/route.ts', 'app/api/nooks/[nookId]/members/[membershipId]/route.ts',
    'app/api/nooks/[nookId]/invitations/route.ts',
    'app/api/nooks/[nookId]/invitations/[invitationId]/route.ts',
    'app/api/nooks/[nookId]/invitations/[invitationId]/accept/route.ts',
    'app/api/nook-invitations/route.ts'
  ];
  for (const file of routes) for (const [method, handler] of Object.entries(load(file))) {
    const response = await handler(new Request('http://localhost/api/nooks', { method }), {
      params: Promise.resolve({ nookId: '10', invitationId: '7', membershipId: '2' })
    });
    assert.equal(response.status, 401, `${method} ${file}`);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  }
  fixture.done();
});

test('HTTP helper rejects cross-origin writes and malformed bodies; errors expose no internals', async () => {
  currentUser = { id: 1 };
  let called = false;
  const response = await nookResponse(new Request('http://localhost/api/nooks', {
    method: 'POST', headers: { origin: 'https://outsider.example' }
  }), async () => { called = true; });
  assert.equal(response.status, 403);
  assert.equal(called, false);
  await assert.rejects(nookBody(new Request('http://localhost', {
    method: 'POST', body: '{', headers: { 'content-type': 'application/json' }
  }), contracts.createNookSchema), rejects('INVALID_REQUEST'));
  const hidden = await nookResponse(new Request('http://localhost'), async () => {
    throw new NookError(404, 'NOT_FOUND', 'Nook not found.');
  });
  assert.deepEqual(await hidden.json(), { error: { code: 'NOT_FOUND', message: 'Nook not found.' } });
});

test('owner and member can view their Nook; third user gets no private details', async () => {
  for (const [userId, role] of [[1, 'owner'], [2, 'member']]) {
    const fixture = scripted([{ table: 'teams', rows: [{ nook, role }], params: [10, userId] }]);
    const result = await service.getNook(userId, 10);
    assert.equal(result.id, 10);
    assert.equal(result.role, role);
    fixture.done();
  }
  const fixture = scripted([{ table: 'teams', rows: [], params: [10, 3] }]);
  await assert.rejects(service.getNook(3, 10), rejects('NOT_FOUND'));
  fixture.done();
});

test('list Nooks returns multiple memberships without duplicate Nooks', async () => {
  const fixture = scripted([{ table: 'team_members', params: [2], rows: [
    { nook, role: 'member' }, { nook: { ...nook, id: 11 }, role: 'owner' }, { nook, role: 'member' }
  ] }]);
  const result = await service.listNooks(2);
  assert.deepEqual(result.map((n) => n.id), [10, 11]);
  fixture.done();
});

test('Nook and owner membership are created in the same transaction with an audit log', async () => {
  const fixture = scripted([
    { op: 'insert', table: 'teams', rows: [nook] },
    { op: 'insert', table: 'team_members' }, { op: 'insert', table: 'activity_logs' }
  ]);
  assert.equal((await service.createNook(1, { name: nook.name })).role, 'owner');
  assert.deepEqual(fixture.writes[1].values, { teamId: 10, userId: 1, role: 'owner' });
  fixture.done();
});

test('outsiders cannot read membership or invite lists and cannot mutate any Nook resource', async () => {
  const operations = [
    () => service.listNookMembers(3, 10), () => service.listNookInvitations(3, 10),
    () => service.updateNook(3, 10, { name: 'stolen' }),
    () => service.inviteNookMember(3, 10, 'x@example.com', 'owner'),
    () => service.revokeNookInvitation(3, 10, 7),
    () => service.manageNookMember(3, 10, 2),
    () => service.manageNookMember(3, 10, 2, 'owner')
  ];
  for (const operation of operations) {
    const fixture = scripted([lock(), membership(3, [])]);
    await assert.rejects(operation(), rejects('NOT_FOUND'));
    assert.equal(fixture.writes.length, 0);
    fixture.done();
  }
});

test('members cannot manage details, invitations, or roles even if globally marked owner', async () => {
  for (const operation of [
    () => service.updateNook(2, 10, { description: 'changed' }),
    () => service.inviteNookMember(2, 10, 'x@example.com', 'owner'),
    () => service.listNookInvitations(2, 10), () => service.revokeNookInvitation(2, 10, 7),
    () => service.manageNookMember(2, 10, 1), () => service.manageNookMember(2, 10, 2, 'owner')
  ]) {
    const fixture = scripted([lock(), membership(2, [member])]);
    await assert.rejects(operation(), rejects('FORBIDDEN'));
    assert.equal(fixture.writes.length, 0);
    fixture.done();
  }
});

test('owner can update details and is audited', async () => {
  const fixture = scripted([lock(), membership(1, [owner]),
    { op: 'update', table: 'teams', params: [10], rows: [{ ...nook, name: 'New title' }] },
    { op: 'insert', table: 'activity_logs' }
  ]);
  assert.equal((await service.updateNook(1, 10, { name: 'New title' })).name, 'New title');
  fixture.done();
});

test('invitation acceptance is email-bound, scoped to the Nook, and rejects replay or revocation', async () => {
  for (const [email, status, code] of [
    ['third@example.com', 'pending', 'NOT_FOUND'],
    ['second@example.com', 'accepted', 'CONFLICT'],
    ['second@example.com', 'revoked', 'CONFLICT']
  ]) {
    const fixture = scripted([lock(), { table: 'users', rows: [{ email }], params: [2] },
      { table: 'invitations', rows: [{ ...invitation, status }], params: [7, 10], lock: true }
    ]);
    await assert.rejects(service.acceptNookInvitation(2, 10, 7), rejects(code));
    assert.equal(fixture.writes.length, 0);
    fixture.done();
  }
});

test('acceptance adds a member and consumes the invitation without removing other memberships', async () => {
  const fixture = scripted([lock(), { table: 'users', rows: [{ email: 'SECOND@example.com' }], params: [2] },
    { table: 'invitations', rows: [invitation], params: [7, 10], lock: true },
    { table: 'team_members', rows: [], params: [10, 2] },
    { op: 'insert', table: 'team_members' }, { op: 'update', table: 'invitations', params: [7] },
    { op: 'insert', table: 'activity_logs' }
  ]);
  assert.deepEqual(await service.acceptNookInvitation(2, 10, 7), { nookId: 10 });
  assert.deepEqual(fixture.writes[0].values, { teamId: 10, userId: 2, role: 'member' });
  fixture.done();
});

test('an existing owner accepting a member invitation is not duplicated or demoted', async () => {
  const fixture = scripted([lock(), { table: 'users', rows: [{ email: invitation.email }] },
    { table: 'invitations', rows: [invitation] }, { table: 'team_members', rows: [owner] },
    { op: 'update', table: 'invitations' }, { op: 'insert', table: 'activity_logs' }
  ]);
  await service.acceptNookInvitation(1, 10, 7);
  assert.equal(fixture.writes.some((w) => w.table === 'team_members'), false);
  fixture.done();
});

test('last active owner cannot be removed or demoted, including historical duplicate memberships', async () => {
  for (const newRole of [undefined, 'member']) {
    const fixture = scripted([lock(), membership(1, [owner]),
      { table: 'team_members', rows: [{ ...owner, id: 4, role: 'member' }], params: [4, 10] },
      { table: 'team_members', rows: [{ userId: 1 }, { userId: 1 }] }
    ]);
    await assert.rejects(service.manageNookMember(1, 10, 4, newRole), rejects('CONFLICT'));
    assert.equal(fixture.writes.length, 0);
    fixture.done();
  }
});

test('owner cannot target a membership from a different Nook', async () => {
  const fixture = scripted([lock(), membership(1, [owner]),
    { table: 'team_members', rows: [], params: [99, 10] }
  ]);
  await assert.rejects(service.manageNookMember(1, 10, 99, 'owner'), rejects('NOT_FOUND'));
  fixture.done();
});

test('same-origin mutations pass; local hostname normalization and forged proxy headers cannot bypass the guard', async () => {
  currentUser = { id: 1 };
  for (const url of ['http://localhost:3000/api/nooks', 'http://127.0.0.1:3000/api/nooks', 'https://solibra.example/api/nooks', 'https://preview.vercel.app/api/nooks/10/invitations']) {
    let invoked = false;
    const result = await nookResponse(new Request(url, { method: 'POST', headers: { origin: new URL(url).origin, host: new URL(url).host } }), async () => { invoked = true; return { ok: true }; }, 201);
    assert.equal(result.status, 201); assert.equal(invoked, true);
  }
  for (const path of ['/api/nooks', '/api/nooks/10/invitations']) {
    for (const origin of ['https://evil.example', 'null', 'http://127.0.0.1:3000', 'http://localhost:4000', 'https://localhost:3000']) {
      let invoked = false;
      const response = await nookResponse(new Request(`http://localhost:3000${path}`, { method: 'POST', headers: { origin, host: 'localhost:3000', 'x-forwarded-host': origin.replace(/^https?:\/\//, ''), 'x-forwarded-proto': 'https', forwarded: 'host=evil.example;proto=https' } }), async () => { invoked = true; });
      assert.equal(response.status, 403); assert.equal(invoked, false);
    }
  }
  currentUser = null;
  for (const path of ['/api/nooks', '/api/nooks/10/invitations']) {
    const response = await nookResponse(new Request(`http://localhost:3000${path}`, { method: 'POST', headers: { origin: 'http://localhost:3000' } }), async () => { throw new Error('Must not run'); });
    assert.equal(response.status, 401);
  }
});

test('same-origin creation and invitation handlers still validate malformed requests before writes', async () => {
  currentUser = { id: 1 }; const fixture = scripted([]);
  for (const file of ['app/api/nooks/route.ts', 'app/api/nooks/[nookId]/invitations/route.ts']) {
    const response = await load(file).POST(new Request('http://localhost:3000/api/nooks', { method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' }, body: '{}' }), { params: Promise.resolve({ nookId: '10' }) });
    assert.equal(response.status, 400); assert.equal((await response.json()).error.code, 'INVALID_REQUEST');
  }
  fixture.done(); currentUser = null;
});
