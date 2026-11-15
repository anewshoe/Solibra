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

const nook = { id: 42, name: 'Sunday table', description: null, role: 'owner', createdAt: '2026-11-14', updatedAt: '2026-11-14' };
const invitation = { id: 7, nookId: 42, email: 'elena@example.com', role: 'member', invitedBy: 1, invitedAt: '2026-11-14', status: 'pending' };

test('typed adapter uses existing authenticated contracts and requires 201 plus positive numeric IDs', async () => {
  const realFetch = global.fetch; const calls = [];
  const api = loader()('@/lib/frontend/nooks-client');
  global.fetch = async (url, options) => { calls.push({ url, ...options }); return Response.json(url === '/api/nooks' ? { nook } : { invitation }, { status: 201 }); };
  try {
    assert.equal((await api.createNook({ name: ' Sunday table ', description: null })).nook.id, 42);
    assert.equal((await api.inviteNookMember(42, { email: 'elena@example.com', role: 'member' })).invitation.id, 7);
    assert.equal(calls[0].url, '/api/nooks'); assert.deepEqual(JSON.parse(calls[0].body), { name: 'Sunday table', description: null });
    assert.equal(calls[1].url, '/api/nooks/42/invitations'); assert.equal(calls[1].credentials, 'same-origin');
    assert.deepEqual(JSON.parse(calls[1].body), { email: 'elena@example.com', role: 'member' });
    await assert.rejects(api.inviteNookMember('rivera-family', { email: 'elena@example.com' }));
    assert.equal(calls.length, 2);
    for (const name of ['', ' ', 'a'.repeat(101)]) await assert.rejects(api.createNook({ name }));
    await assert.rejects(api.createNook({ name: 'Valid', description: 'a'.repeat(2001) }));
    assert.equal(calls.length, 2);
    for (const [status, body] of [[200, { nook }], [201, { nook: { ...nook, id: '42' } }], [401, { error: { code: 'UNAUTHENTICATED', message: 'Unauthorized' } }], [403, { error: { code: 'FORBIDDEN', message: 'Owners only' } }]]) {
      global.fetch = async () => Response.json(body, { status });
      await assert.rejects(api.createNook({ name: 'Valid' }), err => err instanceof api.NookApiError && err.status === status);
    }
    global.fetch = async () => Response.json({ invitation: { ...invitation, nookId: 99 } }, { status: 201 });
    await assert.rejects(api.inviteNookMember(42, { email: invitation.email }), err => err.uncertain);
    global.fetch = async () => { throw new Error('Connection lost'); };
    await assert.rejects(api.createNook({ name: 'Valid' }), err => err.uncertain && /may have completed/.test(err.message));
  } finally { global.fetch = realFetch; }
});

function harness(api) {
  const slots = []; let cursor = 0;
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useEffect() {}
  };
  const realApi = loader()('@/lib/frontend/nooks-client');
  const Component = loader({ react, '@/lib/frontend/nooks-client': { ...realApi, ...api }, '@/components/solibra/shell': { Mascot: () => null } })('@/components/solibra/create-nook').CreateNookWorkflow;
  function nodes(element) { return !element || typeof element !== 'object' ? [] : [element, ...[element.props?.children].flat(Infinity).flatMap(nodes)]; }
  const render = () => { cursor = 0; return nodes(Component()); };
  return {
    input(id, value) { render().find(el => el.props?.id === id).props.onChange({ target: { value } }); },
    submit() { render().find(el => el.type === 'form').props.onSubmit({ preventDefault() {} }); },
    click(text) { const item = render().find(el => el.props?.children === text && el.props.onClick); assert.ok(item, text); return item.props.onClick(); },
    has(text) { return render().some(el => el.props?.children === text); },
    tree: render,
    error: realApi.NookApiError
  };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('workflow validates, retains fields on Back, guards duplicate creation, and can skip invites', async () => {
  let resolve; let calls = 0;
  const h = harness({ createNook: () => { calls++; return new Promise(done => { resolve = done; }); } });
  h.submit(); assert.ok(h.has('Give your Nook a name, up to 100 characters.'));
  h.input('nook-name', 'a'.repeat(101)); h.submit(); assert.equal(calls, 0);
  h.input('nook-name', 'Sunday table'); h.input('nook-description', 'Our shared recipes'); h.submit();
  h.click('Back / Edit'); assert.equal(h.tree().find(el => el.props?.id === 'nook-description').props.value, 'Our shared recipes');
  h.submit(); h.click('Create Nook'); h.click('Creating…'); assert.equal(calls, 1);
  resolve({ nook }); await flush(); assert.ok(h.has('Skip for now')); assert.ok(h.has('Invite your people'));
  assert.equal(h.tree().find(el => el.props?.children === 'Skip for now').props.href, '/');
});

test('creation errors preserve review data; invitation retry preserves the created Nook and completed invites', async () => {
  let creationCalls = 0; let inviteCalls = 0;
  const h = harness({ createNook: async () => { if (++creationCalls === 1) throw new Error('Unavailable'); return { nook }; }, inviteNookMember: async () => { if (++inviteCalls === 1) throw new Error('Unavailable'); return { invitation }; } });
  h.input('nook-name', 'Sunday table'); h.submit(); h.click('Create Nook'); await flush();
  assert.ok(h.has('Unable to create your Nook. Your entries are still here.')); h.click('Create Nook'); await flush();
  h.click('Invite your people'); h.input('invite-email', 'invalid'); h.submit(); assert.ok(h.has('Enter a valid email address, up to 255 characters.'));
  h.input('invite-email', ' ELENA@example.com '); h.submit();
  h.input('invite-email', 'elena@example.com'); h.submit(); assert.ok(h.has('That email is already on your list.'));
  const submitInvites = h.tree().find(el => el.props?.children === 'Create pending invitations').props.onClick; submitInvites(); submitInvites(); await flush(); assert.equal(inviteCalls, 1);
  assert.ok(h.has('Invitation not confirmed')); assert.ok(h.has('Finish / Return to Library'));
  h.click('Retry invitation'); await flush(); assert.equal(inviteCalls, 2); assert.equal(creationCalls, 2);
  assert.ok(h.has('Invitation created · Pending · #7'));
  assert.ok(!h.has('Retry invitation')); assert.ok(!h.has('Create pending invitations'));
});

test('optional description clears to null, cancel is available, and queued invitees can be removed without requests', async () => {
  let payload; let writes = 0;
  const h = harness({ createNook: async data => { payload = data; return { nook }; }, inviteNookMember: async () => { writes++; return { invitation }; } });
  assert.equal(h.tree().find(el => el.props?.children === 'Cancel').props.href, '/');
  h.input('nook-name', 'Sunday table'); h.input('nook-description', 'x'.repeat(2001)); h.submit();
  assert.ok(h.has('Keep your description to 2,000 characters or fewer.'));
  h.input('nook-description', '   '); h.submit(); h.click('Create Nook'); await flush(); assert.equal(payload.description, null);
  h.click('Invite your people'); h.input('invite-email', invitation.email); h.submit();
  const remove = h.tree().find(el => el.props?.['aria-label'] === `Remove ${invitation.email}`); assert.ok(remove); remove.props.onClick();
  assert.ok(!h.has('Create pending invitations')); assert.ok(h.has('Finish / Return to Library')); assert.equal(writes, 0);
});
