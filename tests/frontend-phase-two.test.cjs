// Run with: node --test tests/frontend-phase-two.test.cjs
// Frontend relationship and failure-recovery checks. No provider success is mocked.
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

test('all fixture request, artifact, voice and canonical audio links agree', () => {
  const load = loader();
  const data = load('@/lib/fixtures/conversations');
  for (const message of data.fixtureMessages) {
    if (message.kind === 'text') continue;
    assert.ok(data.getArtifact(message.circleId, message.artifactId));
    if (message.kind === 'voice') {
      const contribution = data.fixtureContributions.find((item) => item.contributionId === message.contributionId);
      assert.equal(contribution.circleId, message.circleId);
      assert.equal(contribution.artifactId, message.artifactId);
    }
  }
  assert.equal(data.memoryHref('rivera-family', 'elenas-original-story'), '/circles/rivera-family/memories/sundays-in-her-kitchen');
  assert.equal(data.getArtifact('wrong-nook', data.PRIMARY_ARTIFACT_ID), undefined);
});

test('story requests cannot point at missing or cross-Nook artifacts', () => {
  const { demoReducer, initialDemoState } = loader()('@/lib/frontend/demo-state');
  const request = { kind: 'request', messageId: 'new-request', circleId: 'rivera-family', threadId: 'elena', senderId: 'sofia', recipientId: 'elena', artifactId: 'missing', prompt: 'A story?', provenance: 'temporary', createdAt: '2026-11-14' };
  assert.equal(demoReducer(initialDemoState, { type: 'message', message: request }), initialDemoState);
  const valid = { ...request, artifactId: 'sundays-in-her-kitchen' };
  const state = demoReducer(initialDemoState, { type: 'message', message: valid });
  assert.equal(state.messages.at(-1).artifactId, valid.artifactId);
  assert.equal(demoReducer(state, { type: 'message', message: valid }), state);
});

test('a temporary recording and its message attach atomically to the matching story request', () => {
  const load = loader();
  const { demoReducer, initialDemoState } = load('@/lib/frontend/demo-state');
  const { fixtureRequestId } = load('@/lib/fixtures/conversations');
  const contribution = { contributionId: 'preview-voice', circleId: 'rivera-family', artifactId: 'sundays-in-her-kitchen', requestMessageId: fixtureRequestId, authorId: 'elena', provenance: 'temporary', transcript: 'An original story', originalLanguage: 'te', translations: {}, durationMs: 1000, audioUrl: 'blob:local-preview', createdAt: '2026-11-14' };
  const message = { kind: 'voice', messageId: 'preview-message', contributionId: contribution.contributionId, circleId: contribution.circleId, artifactId: contribution.artifactId, threadId: 'elena', senderId: 'elena', provenance: 'temporary', createdAt: contribution.createdAt };
  const action = { type: 'contribution', contribution, message };
  const state = demoReducer(initialDemoState, action);
  assert.equal(state.messages.at(-1).contributionId, state.contributions.at(-1).contributionId);
  assert.equal(state.contributions.at(-1).requestMessageId, fixtureRequestId);
  assert.equal(demoReducer(state, action), state, 'double activation must not create another contribution');
  for (const changed of [{ circleId: 'abuelas-kitchen' }, { artifactId: 'abuelas-tortilla-recipe' }, { authorId: 'sofia' }]) {
    const altered = { ...contribution, ...changed };
    assert.equal(demoReducer(initialDemoState, { ...action, contribution: altered, message: { ...message, circleId: altered.circleId, artifactId: altered.artifactId } }), initialDemoState);
  }
});

test('translation updates preserve original audio, original language, and artifact references', () => {
  const { demoReducer, initialDemoState } = loader()('@/lib/frontend/demo-state');
  const original = { ...initialDemoState.contributions[0], audioUrl: 'blob:temporary-original', audioBlob: new Blob(['retained audio']) };
  const before = { ...initialDemoState, contributions: [original] };
  const state = demoReducer(before, { type: 'translation', contributionId: original.contributionId, targetLanguage: 'te', translation: 'A target-language test value' });
  const updated = state.contributions[0];
  for (const key of ['transcript', 'originalLanguage', 'audioUrl', 'artifactId', 'circleId']) assert.equal(updated[key], original[key]);
  assert.equal(updated.translations.en, original.translations.en);
  assert.equal(updated.audioBlob, original.audioBlob);
  assert.equal(updated.translations.te, 'A target-language test value');
});

function hookHarness() {
  const slots = []; let cursor = 0;
  const cleanups = [];
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (value) => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useEffect(effect) { const i = cursor++; if (!(i in slots)) { slots[i] = true; cleanups.push(effect()); } }
  };
  const recorder = { status: 'stopped', audioBlob: new Blob(['test original audio'], { type: 'audio/mp4' }), audioUrl: 'blob:original-recording', mimeType: 'audio/mp4', elapsedMs: 1000,
    discardRecording() { this.audioBlob = null; this.audioUrl = null; this.status = 'idle'; },
    startRecording() { this.discardRecording(); this.status = 'recording'; }
  };
  const hook = loader({ react, '@/hooks/useAudioRecorder': { useAudioRecorder: () => recorder } })('@/components/solibra/voice/use-voice-preview').useVoicePreview;
  return { recorder, render() { cursor = 0; return hook(); }, unmount() { cleanups.forEach((cleanup) => cleanup?.()); } };
}

test('recording UI retains a partial transcript/audio and retries translation without another upload', async () => {
  const h = hookHarness();
  const realFetch = global.fetch;
  const oldWindow = Object.getOwnPropertyDescriptor(global, 'window');
  Object.defineProperty(global, 'window', { configurable: true, value: { setTimeout, clearTimeout } });
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, ...options });
    return calls.length === 1 ? Response.json({ error: 'Translation unavailable', stage: 'translation', transcript: 'Original Telugu test input', originalLanguage: 'te', targetLanguage: 'en' }, { status: 502 }) : Response.json({ error: 'Still unavailable' }, { status: 503 });
  };
  try {
    const audio = h.recorder.audioBlob;
    await h.render().process();
    assert.equal(h.render().transcript.transcript, 'Original Telugu test input');
    assert.equal(h.render().transcript.originalLanguage, 'te');
    assert.equal(h.recorder.audioBlob, audio);
    assert.equal(h.recorder.audioUrl, 'blob:original-recording');
    h.render().setTargetLanguage('fr'); await h.render().process();
    assert.equal(calls[0].url, '/api/voice/process');
    assert.equal(calls[0].body.get('audio').size, audio.size);
    assert.equal(calls[1].url, '/api/voice/translate');
    assert.deepEqual(JSON.parse(calls[1].body), { transcript: 'Original Telugu test input', originalLanguage: 'te', targetLanguage: 'fr' });
    assert.equal(calls[1].credentials, 'same-origin');
    assert.equal(h.render().transcript.transcript, 'Original Telugu test input');
    assert.equal(h.recorder.audioUrl, 'blob:original-recording');
  } finally { h.unmount(); global.fetch = realFetch; if (oldWindow) Object.defineProperty(global, 'window', oldWindow); else delete global.window; }
});

test('recording UI prevents duplicate processing and ignores a cancelled late response', async () => {
  const h = hookHarness(); const realFetch = global.fetch;
  const oldWindow = Object.getOwnPropertyDescriptor(global, 'window');
  Object.defineProperty(global, 'window', { configurable: true, value: { setTimeout, clearTimeout } });
  let resolve; let calls = 0;
  global.fetch = () => { calls++; return new Promise((done) => { resolve = done; }); };
  try {
    const first = h.render().process(); await h.render().process(); assert.equal(calls, 1);
    h.render().cancelProcessing();
    resolve(Response.json({ error: 'Late failure', stage: 'translation', transcript: 'Stale text', originalLanguage: 'es', targetLanguage: 'en' }, { status: 502 }));
    await first;
    assert.equal(h.render().transcript, null); assert.equal(h.render().error, null); assert.equal(h.render().submitting, false);
    assert.equal(h.recorder.audioUrl, 'blob:original-recording');
  } finally { h.unmount(); global.fetch = realFetch; if (oldWindow) Object.defineProperty(global, 'window', oldWindow); else delete global.window; }
});

test('authentication errors preserve the local recording and expose sign-in recovery', async () => {
  const h = hookHarness(); const realFetch = global.fetch;
  const oldWindow = Object.getOwnPropertyDescriptor(global, 'window');
  Object.defineProperty(global, 'window', { configurable: true, value: { setTimeout, clearTimeout } });
  global.fetch = async () => Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await h.render().process(); assert.equal(h.render().needsSignIn, true); assert.match(h.render().error, /Sign in/);
    assert.equal(h.recorder.audioUrl, 'blob:original-recording'); assert.ok(h.recorder.audioBlob);
  } finally { h.unmount(); global.fetch = realFetch; if (oldWindow) Object.defineProperty(global, 'window', oldWindow); else delete global.window; }
});

test('description display has a fallback and only verified numeric owner resources expose editing', () => {
  const load = loader();
  const { NookDescription } = load('@/components/solibra/nook-description');
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const render = (description, nook) => renderToStaticMarkup(React.createElement(NookDescription, { description, editor: nook ? { nook, save: async () => { throw new Error('Not connected'); } } : undefined }));
  assert.match(render('  '), /A little space for your shared memories/);
  assert.doesNotMatch(render('A shared story'), /Edit description/);
  assert.doesNotMatch(render('A shared story', { id: 42, role: 'member' }), /Edit description/);
  assert.doesNotMatch(render('A shared story', { id: 'rivera-family', role: 'owner' }), /Edit description/);
  assert.match(render('A shared story', { id: 42, role: 'owner' }), /Edit description/);
});
