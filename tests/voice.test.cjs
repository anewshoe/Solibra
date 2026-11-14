// Run with: node --test tests/voice.test.cjs
// Transpile project TS with the installed compiler, without adding a test runtime.
// Provider successes are never mocked. Only rejection/failure paths use fakes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function projectLoader(overrides = {}) {
  const cache = new Map();
  return function load(name) {
    if (Object.hasOwn(overrides, name)) return overrides[name];
    if (name === 'server-only') return {};
    if (!name.startsWith('@/')) return require(name);
    if (cache.has(name)) return cache.get(name).exports;
    const file = path.join(root, name.slice(2) + '.ts');
    const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = { exports: {} };
    cache.set(name, module);
    new Function('require', 'module', 'exports', js)(load, module, module.exports);
    return module.exports;
  };
}

const env = { ...process.env };
test.afterEach(() => {
  for (const name of Object.keys(process.env)) if (!(name in env)) delete process.env[name];
  Object.assign(process.env, env);
});

function devEnvironment() {
  process.env.NODE_ENV = 'development';
  process.env.VOICE_DEV_AUTH_BYPASS = 'true';
  process.env.VOICE_DEV_LOOPBACK_ONLY = 'true';
  delete process.env.ELEVENLABS_API_KEY;
  delete process.env.GEMINI_API_KEY;
}

function request(body, headers = {}, url = 'http://localhost:3000/api/voice/process') {
  return new Request(url, { method: 'POST', body, headers: { host: new URL(url).host, ...headers } });
}

function audioForm({ size = 2048, type = 'audio/wav', language = 'en', signature = true } = {}) {
  const bytes = new Uint8Array(size);
  if (signature && size >= 12) {
    bytes.set(Buffer.from('RIFF'), 0);
    bytes.set(Buffer.from('WAVE'), 8);
  }
  const form = new FormData();
  form.append('audio', new Blob([bytes], { type }), 'test.wav');
  form.append('targetLanguage', language);
  return form;
}

function loadRoute(overrides = {}) {
  return projectLoader({ '@/lib/auth/session': { getSession: async () => null }, ...overrides })('@/app/api/voice/process/route');
}

test('language aliases skip translation without needing a Gemini key', async () => {
  delete process.env.GEMINI_API_KEY;
  const load = projectLoader();
  const { translateTranscript } = load('@/lib/ai/translate');
  for (const [originalLanguage, targetLanguage] of [['eng', 'en'], ['spa', 'es'], ['cmn', 'zh']]) {
    assert.equal(await translateTranscript({ transcript: 'unchanged test input', originalLanguage, targetLanguage }), 'unchanged test input');
  }
});

test('bypass is local only, disabled in production, and never loads the database', async () => {
  devEnvironment();
  let databaseLoads = 0;
  const overrides = { '@/lib/auth/session': { getSession: async () => null } };
  Object.defineProperty(overrides, '@/lib/db/queries', { get() { databaseLoads++; throw Error('Database unavailable'); } });
  const { authorizeVoiceRequest } = projectLoader(overrides)('@/lib/voice/access');
  assert.deepEqual(await authorizeVoiceRequest(request(null)), { ok: true });
  delete process.env.VOICE_DEV_LOOPBACK_ONLY;
  assert.equal((await authorizeVoiceRequest(request(null))).status, 401);
  process.env.VOICE_DEV_LOOPBACK_ONLY = 'true';
  for (const headers of [{ host: 'example.com' }, { 'x-forwarded-host': 'example.com' }, { 'x-forwarded-for': '203.0.113.2' }]) {
    assert.equal((await authorizeVoiceRequest(request(null, headers))).status, 401);
  }
  assert.equal((await authorizeVoiceRequest(request(null, {}, 'https://example.com/api/voice/process'))).status, 401);
  process.env.NODE_ENV = 'production';
  assert.equal((await authorizeVoiceRequest(request(null))).status, 401);
  assert.equal(databaseLoads, 0);
});

test('expired or malformed sessions fail closed; a database failure returns 503', async () => {
  process.env.NODE_ENV = 'production';
  for (const expires of ['invalid', new Date(0).toISOString()]) {
    const { authorizeVoiceRequest } = projectLoader({
      '@/lib/auth/session': { getSession: async () => ({ user: { id: 1 }, expires }) },
    })('@/lib/voice/access');
    assert.equal((await authorizeVoiceRequest(request(null))).status, 401);
  }
  const overrides = {
    '@/lib/auth/session': { getSession: async () => ({ user: { id: 1 }, expires: new Date(Date.now() + 60000).toISOString() }) },
  };
  Object.defineProperty(overrides, '@/lib/db/queries', { get() { throw Error('Database unavailable'); } });
  const { authorizeVoiceRequest } = projectLoader(overrides)('@/lib/voice/access');
  assert.equal((await authorizeVoiceRequest(request(null))).status, 503);
});

test('route rejects cross-site and unauthenticated requests before processing', async () => {
  const { POST } = loadRoute();
  devEnvironment();
  assert.equal((await POST(request(audioForm(), { origin: 'https://other.example' }))).status, 403);
  assert.equal((await POST(request(audioForm(), { 'sec-fetch-site': 'cross-site' }))).status, 403);
  process.env.NODE_ENV = 'production';
  assert.equal((await POST(request(audioForm()))).status, 401);
});

test('route validates multipart encoding, fields, language, MIME, size, and container', async () => {
  devEnvironment();
  const { POST } = loadRoute();
  const missing = new FormData();
  missing.append('targetLanguage', 'en');
  const duplicates = audioForm();
  duplicates.append('targetLanguage', 'es');
  const cases = [
    [request('{}', { 'content-type': 'application/json' }), 400],
    [request('broken', { 'content-type': 'multipart/form-data; boundary=missing' }), 400],
    [request(missing), 400], [request(duplicates), 400],
    [request(audioForm({ language: 'unsupported' })), 400],
    [request(audioForm({ type: 'text/plain' })), 415],
    [request(audioForm({ size: 0 })), 400],
    [request(audioForm({ signature: false })), 415],
    [request(audioForm({ size: 15 * 1024 * 1024 + 1 })), 413],
    [request(audioForm(), { 'content-length': String(16 * 1024 * 1024) }), 413],
  ];
  for (const [req, status] of cases) {
    const response = await POST(req);
    assert.equal(response.status, status);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(typeof (await response.json()).error, 'string');
  }
  const stream = new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array(16 * 1024 * 1024));
    controller.close();
  } });
  assert.equal((await POST(new Request('http://localhost:3000/api/voice/process', {
    method: 'POST', body: stream, duplex: 'half',
    headers: { host: 'localhost:3000', 'content-type': 'multipart/form-data; boundary=test' },
  }))).status, 413);
});

test('missing server credentials return controlled errors, never fabricated results', async () => {
  devEnvironment();
  const response = await loadRoute().POST(request(audioForm()));
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.match(body.error, /ELEVENLABS_API_KEY/);
  assert.equal('transcript' in body, false);
  const { translateTranscript, TranslationError } = projectLoader()('@/lib/ai/translate');
  await assert.rejects(translateTranscript({ transcript: 'test input', originalLanguage: 'es', targetLanguage: 'en' }), TranslationError);
});

test('provider failures are sanitized and logged without request/response content', async () => {
  devEnvironment();
  process.env.ELEVENLABS_API_KEY = 'unit-test-key';
  process.env.GEMINI_API_KEY = 'unit-test-key';
  const realFetch = global.fetch;
  const realError = console.error;
  const logs = [];
  global.fetch = async () => new Response(JSON.stringify({ error: { code: 429, message: 'PRIVATE_PROVIDER_BODY' } }), {
    status: 429, headers: { 'content-type': 'application/json' },
  });
  console.error = (...args) => logs.push(args);
  try {
    const load = projectLoader();
    const { transcribeAudio } = load('@/lib/ai/transcribe');
    const { translateTranscript } = load('@/lib/ai/translate');
    await assert.rejects(transcribeAudio({ data: new Uint8Array(1024), filename: 'test.wav', contentType: 'audio/wav' }), /rate limiting/);
    await assert.rejects(translateTranscript({ transcript: 'PRIVATE_TEST_INPUT', originalLanguage: 'es', targetLanguage: 'en' }), /rate limiting/);
    global.fetch = async () => new Response(JSON.stringify({ detail: { status: 'api_key_id_used_as_api_key' } }), {
      status: 400, headers: { 'content-type': 'application/json' },
    });
    await assert.rejects(transcribeAudio({ data: new Uint8Array(1024), filename: 'test.wav', contentType: 'audio/wav' }), /API key ID instead of the secret key/);
    assert.doesNotMatch(JSON.stringify(logs), /PRIVATE_|unit-test-key/);
  } finally {
    global.fetch = realFetch;
    console.error = realError;
  }
});

function recorderHarness({ constructorFails = false, permission } = {}) {
  const names = ['window', 'navigator', 'MediaRecorder'];
  const originals = names.map((name) => Object.getOwnPropertyDescriptor(global, name));
  const timers = new Map();
  const intervals = new Map();
  const instances = [];
  const revoked = [];
  const streams = [];
  let nextId = 1;
  const makeStream = () => {
    const track = { stopped: false, stop() { this.stopped = true; } };
    const stream = { track, getTracks: () => [track] };
    streams.push(stream);
    return stream;
  };
  class Recorder {
    static isTypeSupported(type) { return type === 'audio/mp4'; }
    constructor(stream, options) {
      if (constructorFails) throw new Error('Recorder construction failed');
      this.stream = stream;
      this.mimeType = options?.mimeType ?? 'audio/mp4';
      this.state = 'inactive';
      instances.push(this);
    }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; }
    data() { this.ondataavailable?.({ data: new Blob(['test audio'], { type: this.mimeType }) }); }
    finish() { this.data(); this.onstop?.(); }
  }
  const values = {
    window: {
      setTimeout(fn) { const id = nextId++; timers.set(id, fn); return id; },
      clearTimeout(id) { timers.delete(id); },
      setInterval(fn) { const id = nextId++; intervals.set(id, fn); return id; },
      clearInterval(id) { intervals.delete(id); },
    },
    navigator: { mediaDevices: { getUserMedia: () => permission ? permission(makeStream) : Promise.resolve(makeStream()) } },
    MediaRecorder: Recorder,
  };
  for (const name of names) Object.defineProperty(global, name, { configurable: true, value: values[name] });
  const realCreate = URL.createObjectURL;
  const realRevoke = URL.revokeObjectURL;
  URL.createObjectURL = () => `blob:test-${nextId++}`;
  URL.revokeObjectURL = (url) => revoked.push(url);
  const slots = [];
  const cleanups = [];
  let cursor = 0;
  let mounted = false;
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], (value) => { slots[i] = value; }];
    },
    useRef(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { current: initial };
      return slots[i];
    },
    useCallback: (fn) => fn,
    useEffect(fn) { if (!mounted) cleanups.push(fn()); },
  };
  const { useAudioRecorder } = projectLoader({ react })('@/hooks/useAudioRecorder');
  const render = () => { cursor = 0; const result = useAudioRecorder({ maxDurationMs: 1000 }); mounted = true; return result; };
  return {
    render, timers, intervals, instances, revoked, streams,
    unmount: () => cleanups.forEach((fn) => fn?.()),
    restore() {
      cleanups.forEach((fn) => fn?.());
      names.forEach((name, i) => originals[i]
        ? Object.defineProperty(global, name, originals[i]) : delete global[name]);
      URL.createObjectURL = realCreate;
      URL.revokeObjectURL = realRevoke;
    },
  };
}

test('recorder finalizes asynchronously, selects Safari MP4, and releases URLs on discard', async () => {
  const h = recorderHarness();
  try {
    await h.render().startRecording();
    assert.equal(h.render().status, 'recording');
    h.render().stopRecording();
    assert.equal(h.render().status, 'stopping');
    assert.equal(h.streams[0].track.stopped, true);
    h.instances[0].finish();
    const recording = h.render();
    assert.equal(recording.status, 'stopped');
    assert.equal(recording.audioBlob.type, 'audio/mp4');
    assert.ok(recording.audioBlob.size > 0);
    assert.equal(h.timers.size + h.intervals.size, 0);
    recording.discardRecording();
    assert.deepEqual(h.revoked, [recording.audioUrl]);
    assert.equal(h.render().audioBlob, null);
  } finally { h.restore(); }
});

test('recorder releases streams on startup failure and after cancelled permissions', async () => {
  const failed = recorderHarness({ constructorFails: true });
  try {
    await failed.render().startRecording();
    assert.equal(failed.streams[0].track.stopped, true);
    assert.equal(failed.render().status, 'idle');
    assert.ok(failed.render().error);
  } finally { failed.restore(); }
  let resolvePermission;
  const pending = recorderHarness({ permission: (makeStream) => new Promise((resolve) => {
    resolvePermission = () => resolve(makeStream());
  }) });
  try {
    const start = pending.render().startRecording();
    assert.equal(pending.render().status, 'requesting');
    pending.render().discardRecording();
    resolvePermission();
    await start;
    assert.equal(pending.streams[0].track.stopped, true);
    assert.equal(pending.render().status, 'idle');
    assert.equal(pending.instances.length, 0);
  } finally { pending.restore(); }
});

test('stale recorder events cannot stop a new recording; unmount releases the microphone', async () => {
  const h = recorderHarness();
  try {
    await h.render().startRecording();
    const staleStop = h.instances[0].onstop;
    const staleData = h.instances[0].ondataavailable;
    await h.render().startRecording();
    staleData({ data: new Blob(['old recording']) });
    staleStop();
    assert.equal(h.streams[1].track.stopped, false);
    assert.equal(h.render().status, 'recording');
    assert.equal(h.render().audioBlob, null);
    h.unmount();
    assert.equal(h.streams[1].track.stopped, true);
    assert.equal(h.timers.size + h.intervals.size, 0);
  } finally { h.restore(); }
});

test('recording automatically stops at its configured limit and remains playable', async () => {
  const h = recorderHarness();
  try {
    await h.render().startRecording();
    [...h.timers.values()][0]();
    assert.equal(h.render().status, 'stopping');
    h.instances[0].finish();
    assert.equal(h.render().status, 'stopped');
    assert.match(h.render().notice, /1 second/);
    assert.ok(h.render().audioUrl);
  } finally { h.restore(); }
});
