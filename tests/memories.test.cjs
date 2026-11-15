// Memory API tests execute actual routes, services, authorization, and SQL expressions.
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
const service = load('lib/memories/service.ts');
const contracts = load('lib/memories/types.ts');
const { memoryResourceId } = load('lib/memories/http.ts');
const { getTableConfig } = require('drizzle-orm/pg-core');
const now = new Date('2026-01-01T00:00:00Z');
const artifact = {
  id: 20, nookId: 10, creatorId: 1, type: 'photo', title: 'Weekend trip',
  description: null, mediaStorageKey: null, createdAt: now, updatedAt: now
};
const contribution = {
  id: 30, artifactId: 20, authorId: 2, type: 'text', content: 'I remember the rain.',
  audioStorageKey: null, originalTranscript: null, sourceLanguage: null,
  processingStatus: null, createdAt: now, updatedAt: now
};
const message = {
  id: 40, nookId: 10, senderId: 2, content: 'Remember this?', artifactId: 20, createdAt: now
};
const prefix = '/api/nooks/10';
const endpoints = [
  ['app/api/nooks/[nookId]/artifacts/route.ts', 'GET', '/artifacts'],
  ['app/api/nooks/[nookId]/artifacts/route.ts', 'POST', '/artifacts', { type: 'photo', title: 'Weekend trip' }],
  ['app/api/nooks/[nookId]/artifacts/[artifactId]/route.ts', 'GET', '/artifacts/20'],
  ['app/api/nooks/[nookId]/artifacts/[artifactId]/contributions/route.ts', 'GET', '/artifacts/20/contributions'],
  ['app/api/nooks/[nookId]/artifacts/[artifactId]/contributions/route.ts', 'POST', '/artifacts/20/contributions', { type: 'text', content: contribution.content }],
  ['app/api/nooks/[nookId]/artifacts/[artifactId]/contributions/[contributionId]/route.ts', 'GET', '/artifacts/20/contributions/30'],
  ['app/api/nooks/[nookId]/messages/route.ts', 'GET', '/messages'],
  ['app/api/nooks/[nookId]/messages/route.ts', 'POST', '/messages', { content: message.content, artifactId: 20 }]
];

async function call(endpoint, body = endpoint[3], ids = {}) {
  const [file, method, suffix] = endpoint;
  return load(file)[method](new Request(`http://localhost${prefix}${suffix}`, {
    method,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  }), { params: Promise.resolve({ nookId: '10', artifactId: '20', contributionId: '30', ...ids }) });
}

function scripted(steps) {
  const pending = [...steps];
  const writes = [];
  const dialect = new PgDialect();
  const transactions = { commits: 0, rollbacks: 0 };
  const builder = (op, table) => {
    let where, values, lock;
    let order = [];
    const query = {
      from(value) { table = value; return query; },
      where(value) { where = value; return query; },
      limit() { return query; },
      orderBy(...value) { order = value; return query; },
      for(value) { lock = value; return query; },
      values(value) { values = value; return query; },
      returning() { return query; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          const step = pending.shift();
          assert.ok(step, `Unexpected ${op} on ${getTableName(table)}`);
          assert.equal(op, step.op ?? 'select');
          assert.equal(getTableName(table), step.table);
          if (step.params) assert.deepEqual(dialect.sqlToQuery(where).params, step.params);
          if (step.scopedColumn) assert.ok(dialect.sqlToQuery(where).sql.includes(step.scopedColumn));
          if (step.lock) assert.equal(lock, step.lock);
          if (step.ordered) {
            assert.deepEqual(order.map((value) => dialect.sqlToQuery(value).sql), [
              `"${step.table}"."created_at" asc`, `"${step.table}"."id" asc`
            ]);
          }
          if (step.error) throw step.error;
          if (op !== 'select') writes.push({ table: getTableName(table), values });
          return step.rows ?? [];
        }).then(resolve, reject);
      }
    };
    return query;
  };
  const api = {
    select: () => builder('select'), insert: (table) => builder('insert', table),
    async transaction(callback) {
      const start = writes.length;
      try { const result = await callback(api); transactions.commits++; return result; }
      catch (error) { writes.splice(start); transactions.rollbacks++; throw error; }
    }
  };
  database = api;
  return { writes, transactions, done: () => assert.equal(pending.length, 0, 'Expected queries consumed') };
}
function access(userId = 2, role = 'member') {
  return [
    { table: 'teams', params: [10], rows: [{ id: 10 }], lock: 'share' },
    { table: 'team_members', params: [10, userId], rows: role ? [{ userId, teamId: 10, role }] : [] }
  ];
}
const parent = () => ({ table: 'artifacts', rows: [artifact], params: [20, 10], scopedColumn: '"nook_id"' });

test('all eight memory operations reject unauthenticated requests without querying the database', async () => {
  currentUser = null;
  const fixture = scripted([]);
  for (const endpoint of endpoints) {
    const response = await call(endpoint);
    assert.equal(response.status, 401, endpoint.slice(0, 2).join(' '));
    assert.equal((await response.json()).error.code, 'UNAUTHENTICATED');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  }
  fixture.done();
});

test('every memory route denies nonmembers and removed members before private-resource lookup', async () => {
  for (const userId of [3, 2]) {
    currentUser = { id: userId };
    for (const endpoint of endpoints) {
      const fixture = scripted(access(userId, null));
      const response = await call(endpoint);
      assert.equal(response.status, 404, endpoint.slice(0, 2).join(' '));
      assert.deepEqual(await response.json(), { error: { code: 'NOT_FOUND', message: 'Nook not found.' } });
      assert.equal(fixture.writes.length, 0);
      fixture.done();
    }
  }
});

test('missing Nooks and inaccessible Nooks use the same non-enumerating error', async () => {
  currentUser = { id: 2 };
  const fixture = scripted([{ table: 'teams', params: [10], rows: [], lock: 'share' }]);
  const response = await call(endpoints[0]);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: { code: 'NOT_FOUND', message: 'Nook not found.' } });
  fixture.done();
});

test('members and owners can create artifacts; the creator is the authenticated user and creation is audited', async () => {
  for (const [userId, role] of [[1, 'owner'], [2, 'member']]) {
    currentUser = { id: userId };
    const fixture = scripted([...access(userId, role),
      { op: 'insert', table: 'artifacts', rows: [{ ...artifact, creatorId: userId }] },
      { op: 'insert', table: 'activity_logs' }
    ]);
    const response = await call(endpoints[1]);
    assert.equal(response.status, 201);
    const { artifact: result } = await response.json();
    assert.equal(result.id, 20);
    assert.equal(result.creatorId, userId);
    assert.equal(result.mediaStorageKey, null);
    assert.equal(result.createdAt, now.toISOString());
    assert.deepEqual(fixture.writes[0].values, {
      nookId: 10, creatorId: userId, type: 'photo', title: 'Weekend trip', description: null
    });
    assert.equal(fixture.writes[1].values.action, 'CREATE_ARTIFACT');
    assert.equal(fixture.transactions.commits, 1);
    fixture.done();
  }
});

test('artifact lists are Nook-scoped and stable chronological; individual retrieval scopes both IDs', async () => {
  currentUser = { id: 2 };
  const list = scripted([...access(), {
    table: 'artifacts', rows: [artifact], params: [10], ordered: true, scopedColumn: '"nook_id"'
  }]);
  assert.equal((await (await call(endpoints[0])).json()).artifacts[0].id, 20);
  list.done();
  const get = scripted([...access(), parent()]);
  assert.equal((await (await call(endpoints[2])).json()).artifact.id, 20);
  get.done();
});

test('artifact and contribution IDs from another Nook cannot bypass parent authorization', async () => {
  currentUser = { id: 2 };
  for (const endpoint of [endpoints[2], endpoints[3], endpoints[4], endpoints[5], endpoints[7]]) {
    const fixture = scripted([...access(), { ...parent(), rows: [] }]);
    const response = await call(endpoint);
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.message, 'Nook artifact not found.');
    assert.equal(fixture.writes.length, 0);
    fixture.done();
  }
});

test('text contributions use the authenticated author, correct artifact, and atomic activity log', async () => {
  currentUser = { id: 2 };
  const fixture = scripted([...access(), parent(),
    { op: 'insert', table: 'contributions', rows: [contribution] },
    { op: 'insert', table: 'activity_logs' }
  ]);
  const response = await call(endpoints[4]);
  assert.equal(response.status, 201);
  const result = (await response.json()).contribution;
  assert.equal(result.artifactId, 20);
  assert.equal(result.authorId, 2);
  assert.deepEqual(fixture.writes[0].values, {
    artifactId: 20, authorId: 2, type: 'text', content: contribution.content, processingStatus: null
  });
  assert.equal(fixture.writes[1].values.action, 'SUBMIT_CONTRIBUTION');
  fixture.done();
});

test('audio contributions can be created as drafts without uploads or provider calls', async () => {
  currentUser = { id: 2 };
  const fixture = scripted([...access(), parent(), {
    op: 'insert', table: 'contributions', rows: [{ ...contribution, type: 'audio', content: null, processingStatus: 'draft' }]
  }, { op: 'insert', table: 'activity_logs' }]);
  const response = await call(endpoints[4], { type: 'audio' });
  assert.equal(response.status, 201);
  const result = (await response.json()).contribution;
  assert.equal(result.processingStatus, 'draft');
  assert.equal(result.audioStorageKey, null);
  assert.equal(result.originalTranscript, null);
  assert.equal(fixture.writes[0].values.content, null);
  fixture.done();
});

test('list/retrieve contributions require the correct parent artifact and scope child ID', async () => {
  currentUser = { id: 2 };
  const list = scripted([...access(), parent(), {
    table: 'contributions', rows: [contribution], params: [20], ordered: true
  }]);
  assert.equal((await (await call(endpoints[3])).json()).contributions[0].id, 30);
  list.done();
  const get = scripted([...access(), parent(), {
    table: 'contributions', rows: [contribution], params: [30, 20], scopedColumn: '"artifact_id"'
  }]);
  assert.equal((await (await call(endpoints[5])).json()).contribution.id, 30);
  get.done();
  const wrongArtifact = scripted([...access(), parent(), { table: 'contributions', rows: [], params: [30, 20] }]);
  const response = await call(endpoints[5]);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.message, 'Nook contribution not found.');
  wrongArtifact.done();
});

test('messages use the authenticated sender and validate a same-Nook artifact before inserting', async () => {
  currentUser = { id: 2 };
  const fixture = scripted([...access(), parent(), { op: 'insert', table: 'messages', rows: [message] }]);
  const response = await call(endpoints[7]);
  assert.equal(response.status, 201);
  assert.equal((await response.json()).message.senderId, 2);
  assert.deepEqual(fixture.writes[0].values, { nookId: 10, senderId: 2, content: message.content, artifactId: 20, type:'text', processingStatus:null });
  fixture.done();
});

test('messages without artifact references need no artifact; lists use chronological order plus ID tie-break', async () => {
  currentUser = { id: 2 };
  const create = scripted([...access(), { op: 'insert', table: 'messages', rows: [{ ...message, artifactId: null }] }]);
  assert.equal((await call(endpoints[7], { content: 'Hello' })).status, 201);
  assert.equal(create.writes[0].values.artifactId, null);
  create.done();
  const list = scripted([...access(), { table: 'messages', rows: [message, { ...message, id: 41 }], params: [10], ordered: true }]);
  const response = await call(endpoints[6]);
  assert.deepEqual((await response.json()).messages.map((m) => m.id), [40, 41]);
  list.done();
});

test('API validation rejects spoofed identities, URLs/storage keys, reserved pipeline fields, and contradictory content', async () => {
  currentUser = { id: 2 };
  const fixture = scripted([]);
  const cases = [
    [endpoints[1], { type: 'photo', title: 'x', creatorId: 99 }],
    [endpoints[1], { type: 'photo', title: 'x', nookId: 99 }],
    [endpoints[1], { type: 'photo', title: 'x', mediaStorageKey: 'nooks/99/private.jpg' }],
    [endpoints[1], { type: 'photo', title: 'x', mediaUrl: 'https://public.example/photo.jpg' }],
    [endpoints[1], { type: 'video', title: 'x' }],
    [endpoints[1], { type: 'text', title: '   ' }],
    [endpoints[4], { type: 'text' }], [endpoints[4], { type: 'text', content: '   ' }],
    [endpoints[4], { type: 'audio', content: 'contradictory' }],
    [endpoints[4], { type: 'audio', originalTranscript: 'untrusted' }],
    [endpoints[4], { type: 'audio', processingStatus: 'completed' }],
    [endpoints[4], { type: 'text', content: 'x', authorId: 99 }],
    [endpoints[7], { content: 'Hello', senderId: 99 }],
    [endpoints[7], { content: ' ' }], [endpoints[7], { content: 'x', artifactId: 0 }]
  ];
  for (const [endpoint, body] of cases) assert.equal((await call(endpoint, body)).status, 400, JSON.stringify(body));
  for (const id of ['0', '-1', '1e2', '2147483648']) {
    assert.throws(() => memoryResourceId(id));
    assert.equal((await call(endpoints[0], undefined, { nookId: id })).status, 400);
  }
  assert.equal(contracts.createContributionSchema.safeParse({ type: 'text', content: 'x'.repeat(20_001) }).success, false);
  assert.equal(contracts.createMessageSchema.safeParse({ content: 'x'.repeat(5001) }).success, false);
  fixture.done();
});

test('a failed activity insert propagates failure and rolls back the memory transaction (scripted DB)', async () => {
  const fixture = scripted([...access(), {
    op: 'insert', table: 'artifacts', rows: [artifact]
  }, { op: 'insert', table: 'activity_logs', error: new Error('audit failure') }]);
  await assert.rejects(service.createArtifact(2, 10, { type: 'photo', title: 'x' }), /audit failure/);
  assert.equal(fixture.transactions.rollbacks, 1);
  assert.equal(fixture.transactions.commits, 0);
  assert.equal(fixture.writes.length, 0);
  fixture.done();
});

test('schema declares private media checks, relationship constraints, and chronological indexes', () => {
  const configs = Object.fromEntries(['artifacts', 'contributions', 'messages', 'translations']
    .map((name) => [name, getTableConfig(schema[name])]));
  const fk = configs.messages.foreignKeys.find((f) => f.getName() === 'messages_artifact_nook_fk').reference();
  assert.deepEqual(fk.columns.map((c) => c.name), ['artifact_id', 'nook_id']);
  assert.deepEqual(fk.foreignColumns.map((c) => c.name), ['id', 'nook_id']);
  for (const table of ['artifacts', 'contributions', 'messages']) assert.equal(configs[table].indexes.length, 1);
  assert.equal(configs.translations.uniqueConstraints.length, 1);
  assert.deepEqual(configs.translations.uniqueConstraints[0].columns.map((c) => c.name),
    ['contribution_id', 'source_language', 'target_language']);
  assert.ok(configs.contributions.checks.some((c) => c.name === 'contributions_content_check'));
  assert.ok(configs.artifacts.checks.some((c) => c.name === 'artifacts_media_key_check'));
  assert.equal(configs.artifacts.columns.find((c) => c.name === 'media_storage_key').notNull, false);
});

test('migration preserves previous tables and introduces only four memory models', () => {
  const previous = JSON.parse(fs.readFileSync(path.join(root, 'lib/db/migrations/meta/0002_snapshot.json')));
  const next = JSON.parse(fs.readFileSync(path.join(root, 'lib/db/migrations/meta/0003_snapshot.json')));
  assert.equal(next.prevId, previous.id);
  for (const [name, table] of Object.entries(previous.tables)) assert.deepEqual(next.tables[name], table);
  assert.equal(Object.keys(next.tables).length - Object.keys(previous.tables).length, 4);
  const migration = fs.readFileSync(path.join(root, 'lib/db/migrations/0003_memory_backend.sql'), 'utf8');
  assert.doesNotMatch(migration, /\b(DROP|DELETE|TRUNCATE)\b(?! no action)/i);
  assert.equal((migration.match(/CREATE TABLE/g) ?? []).length, 4);
});

