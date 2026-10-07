'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createHash, webcrypto} = require('node:crypto');
const {test} = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../js/common.js'), 'utf8');
const sha = v => createHash('sha256').update(v).digest('hex');
const text = '\uD559\uAD50';
const bytes = Buffer.from('ID3' + 'fake unit test audio only'.repeat(20));

function fixture(value = text) {
  const key = sha(JSON.stringify(['edge-tts', 'ko-KR-SunHiNeural', '+0%', '+0%', '+0Hz', value]));
  const entry = {text: value, text_sha256: sha(value), request_sha256: key,
    file: key + '.mp3', audio_sha256: sha(bytes), receipt: key + '.provenance.json'};
  const proof = {...entry, schema_version: 1, source_kind: 'edge_generation', provider: 'edge-tts', reviewed_public: true,
    voice: 'ko-KR-SunHiNeural', rate: '+0%', volume: '+0%', pitch: '+0Hz',
    client_version: 'unit-test', generated_at: '2026-10-07T00:00:00Z', generator_sha256: 'a'.repeat(64)};
  const proofBytes = Buffer.from(JSON.stringify(proof));
  entry.receipt_sha256 = sha(proofBytes);
  return {entry, proof, proofBytes, manifest: {schema_version: 2, entries: {[value]: entry}}};
}

function harness(options = {}) {
  const f = options.fixture || fixture();
  const manifest = options.manifest || f.manifest;
  const fetches = [], played = [], revoked = [], elements = new Map(), listeners = {};
  const makeElement = () => ({textContent: '', classList: {add() {}, remove() {}, contains() { return false; }}});
  const document = {readyState: 'loading', addEventListener: (name, fn) => { listeners[name] = fn; },
    getElementById: id => elements.get(id) || null, createElement: makeElement,
    body: {appendChild: el => elements.set(el.id, el)}};
  class Audio {
    constructor(url) { this.url = url; played.push(this); }
    play() { return options.rejectPlay ? Promise.reject(new Error('decode failed')) : Promise.resolve(); }
    pause() { this.paused = true; }
  }
  const response = value => ({ok: true, json: async () => value,
    arrayBuffer: async () => { const b = Buffer.from(value); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); }});
  const sandbox = {document, Audio, Blob, TextEncoder, TextDecoder, crypto: webcrypto,
    URL: {createObjectURL: () => 'blob:test', revokeObjectURL: url => revoked.push(url)},
    console, setTimeout: () => 0, localStorage: {getItem: () => null},
    fetch: async url => {
      fetches.push(url);
      if (options.fetch) { const result = await options.fetch(url); if (result) return result; }
      if (url === 'data/vocab.json') return response({});
      if (url.endsWith('manifest.json')) {
        if (options.missingManifest) throw new Error('offline');
        return response(manifest);
      }
      if (url.endsWith('.provenance.json')) {
        if (options.missingProof) return {ok: false};
        return response(options.badProof ? Buffer.from('{}') : f.proofBytes);
      }
      if (url.endsWith('.mp3')) {
        if (options.missingAudio) return {ok: false};
        return response(options.badAudio ? Buffer.from('bad') : bytes);
      }
      throw new Error('Unexpected request ' + url);
    }};
  Object.defineProperty(sandbox, 'speechSynthesis', {get() { throw new Error('Forbidden device voice access'); }});
  Object.defineProperty(sandbox, 'SpeechSynthesisUtterance', {get() { throw new Error('Forbidden utterance'); }});
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source + '\nglobalThis.app = App;', sandbox);
  return {app: sandbox.app, played, fetches, revoked, elements, listeners};
}

test('no device voice or sequential fallback remains, including init', async () => {
  assert.doesNotMatch(source, /speechSynthesis|SpeechSynthesisUtterance|speakSequential|speakWebAPI/);
  const h = harness();
  await h.listeners.DOMContentLoaded();
});

test('verified exact text plays one local blob and cleans up', async () => {
  const h = harness();
  assert.equal((await h.app.speak(text)).status, 'playing');
  assert.equal(h.played.length, 1);
  assert.equal(h.played[0].url, 'blob:test');
  h.played[0].onended();
  assert.equal(h.revoked.length, 1);
});

test('reviewed repository-lineage assets play without pretending to be new generation', async () => {
  const f = fixture();
  f.entry.file = '0001_legacy.mp3';
  Object.assign(f.proof, {source_kind: 'repository_lineage', file: f.entry.file,
    source_commit: 'b'.repeat(40), original_text: text, original_file: f.entry.file,
    original_audio_sha256: f.entry.audio_sha256, source_manifest_sha256: 'c'.repeat(64),
    duration_seconds: 1.5, utterance_verified_by_listening: false});
  delete f.proof.generated_at;
  delete f.proof.client_version;
  f.proofBytes = Buffer.from(JSON.stringify(f.proof));
  f.entry.receipt_sha256 = sha(f.proofBytes);
  const h = harness({fixture: f});
  assert.equal((await h.app.speak(text)).status, 'playing');
  assert.equal(h.played.length, 1);
});

test('invalid inherited mapping cannot play', async () => {
  const f = fixture();
  f.proof.source_kind = 'repository_lineage';
  f.proofBytes = Buffer.from(JSON.stringify(f.proof));
  f.entry.receipt_sha256 = sha(f.proofBytes);
  const h = harness({fixture: f});
  assert.equal((await h.app.speak(text)).status, 'unavailable');
  assert.equal(h.played.length, 0);
});

for (const [name, options] of Object.entries({offline: {missingManifest: true},
  legacy: {manifest: {[text]: 'legacy.mp3'}}, missingProof: {missingProof: true},
  badProof: {badProof: true}, missingAudio: {missingAudio: true}, badAudio: {badAudio: true},
  rejectedPlayback: {rejectPlay: true}})) {
  test(name + ' is explicitly unavailable, no fallback', async () => {
    const h = harness(options);
    assert.equal((await h.app.speak(text)).status, 'unavailable');
    assert.match(h.elements.get('app-toast').textContent, /unavailable/);
    assert.ok(h.played.length <= (options.rejectPlay ? 1 : 0));
  });
}

test('full missing sentence never plays its available words, nor trimmed text', async () => {
  const h = harness();
  for (const value of [text + ' ' + text, text + ' ', '__proto__', '']) {
    assert.equal((await h.app.speak(value)).status, 'unavailable');
  }
  assert.equal(h.played.length, 0);
  assert.deepEqual(h.fetches, ['audio/tts/manifest.json']);
});

test('decode error after play reports unavailable and releases blob', async () => {
  const h = harness();
  await h.app.speak(text);
  h.played[0].onerror();
  assert.match(h.elements.get('app-toast').textContent, /unavailable/);
  assert.equal(h.revoked.length, 1);
});

test('new request cancels pending earlier audio instead of playing it later', async () => {
  let release, entered;
  const started = new Promise(r => { entered = r; });
  const gate = new Promise(r => { release = r; });
  const h = harness({fetch: async url => { if (url.endsWith('.mp3')) { entered(); await gate; } }});
  const first = h.app.speak(text);
  await started;
  assert.equal((await h.app.speak('missing')).status, 'unavailable');
  release();
  assert.equal((await first).status, 'cancelled');
  assert.equal(h.played.length, 0);
});

test('every v2 manifest entry has exact text, receipts, settings and file hashes', () => {
  const root = path.join(__dirname, '../audio/tts');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  if (manifest.schema_version !== 2) return; // Legacy is unavailable, never certified.
  for (const [value, e] of Object.entries(manifest.entries)) {
    assert.equal(e.text, value);
    assert.equal(e.text_sha256, sha(value));
    const proofBytes = fs.readFileSync(path.join(root, e.receipt));
    assert.equal(sha(proofBytes), e.receipt_sha256);
    const p = JSON.parse(proofBytes);
    for (const field of ['text', 'text_sha256', 'request_sha256', 'file', 'audio_sha256']) assert.equal(e[field], p[field]);
    assert.equal(p.provider, 'edge-tts');
    assert.equal(p.voice, 'ko-KR-SunHiNeural');
    assert.equal(e.request_sha256, sha(JSON.stringify(['edge-tts', p.voice, p.rate, p.volume, p.pitch, value])));
    assert.equal(sha(fs.readFileSync(path.join(root, e.file))), e.audio_sha256);
  }
});

test('all current core card and polite texts have exact audio entries', () => {
  const root = path.join(__dirname, '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'audio/tts/manifest.json'), 'utf8'));
  const vocab = JSON.parse(fs.readFileSync(path.join(root, 'data/vocab.json'), 'utf8'));
  const required = new Set(vocab.flashcards.categories.flatMap(c => c.cards.flatMap(w => [w.kr, w.polite].filter(Boolean))));
  const missing = [...required].filter(value => !Object.hasOwn(manifest.entries || {}, value));
  assert.deepEqual(missing, []);
});
