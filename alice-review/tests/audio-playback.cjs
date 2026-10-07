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
    console, atob: value => Buffer.from(value, 'base64').toString('binary'), setTimeout: () => 0, localStorage: {getItem: () => null},
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

// Full real-asset coverage and exact hashes are checked separately in audio-coverage.cjs.

function packedFixture() {
  const f = fixture();
  const pack = {schema_version: 1, encoding: 'base64', files: {[f.entry.file]: bytes.toString('base64'), [f.entry.receipt]: f.proofBytes.toString('base64')}};
  const packBytes = Buffer.from(JSON.stringify(pack)); f.entry.bundle = 'pack-synthetic.json'; f.entry.bundle_sha256 = sha(packBytes);
  return {f, pack, packBytes};
}

function shardedFixture(f = fixture(), parts = [f.manifest.entries]) {
  const files = new Map(), entries = Object.assign({}, ...parts);
  const manifest = {schema_version: 3, entry_count: Object.keys(entries).length,
    entries_sha256: sha(JSON.stringify(entries)), parts: parts.map((part, index) => {
      const bytes = Buffer.from(JSON.stringify({schema_version: 1, entries: part}));
      const hash = sha(bytes), file = 'manifest-part-' + String(index + 1).padStart(2, '0') + '-' + hash + '.json';
      files.set(file, bytes); return {file, sha256: hash, entry_count: Object.keys(part).length};
    })};
  const fetch = async url => {
    if (!url.includes('manifest-part-')) return null;
    const bytes = files.get(path.basename(url));
    return bytes ? {ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)} : {ok: false};
  };
  return {fixture: f, manifest, fetch, files};
}

test('schema-3 manifest reconstructs exact entries from verified parts and caches them', async () => {
  const f = fixture(), second = fixture('친구');
  const options = shardedFixture(f, [f.manifest.entries, second.manifest.entries]);
  const h = harness(options);
  assert.equal((await h.app.speak(text)).status, 'playing');
  assert.equal((await h.app.speak(text)).status, 'playing');
  assert.equal(h.fetches.filter(url => url.includes('manifest-part-')).length, 2);
  assert.equal(h.fetches.filter(url => url.endsWith('/manifest.json')).length, 1);
});

for (const mutation of ['tampered', 'missing', 'duplicateEntry', 'duplicatePart', 'wrongCount', 'wrongTotal', 'wrongAggregate', 'unsafePath']) {
  test('schema-3 ' + mutation + ' manifest is unavailable with no partial playback', async () => {
    const options = shardedFixture();
    const part = options.manifest.parts[0];
    if (mutation === 'tampered') options.files.set(part.file, Buffer.from('{}'));
    if (mutation === 'missing') options.files.delete(part.file);
    if (mutation === 'duplicateEntry') {
      const second = {...part, file: part.file.replace('part-01-', 'part-02-')};
      options.manifest.parts.push(second); options.files.set(second.file, options.files.get(part.file));
    }
    if (mutation === 'duplicatePart') options.manifest.parts.push({...part});
    if (mutation === 'wrongCount') part.entry_count++;
    if (mutation === 'wrongTotal') options.manifest.entry_count++;
    if (mutation === 'wrongAggregate') options.manifest.entries_sha256 = '0'.repeat(64);
    if (mutation === 'unsafePath') part.file = '../' + part.file;
    const h = harness(options);
    assert.equal((await h.app.speak(text)).status, 'unavailable');
    assert.equal(h.played.length, 0);
    assert.equal(h.fetches.filter(url => url.endsWith('.mp3') || url.endsWith('.provenance.json')).length, 0);
    if (mutation === 'unsafePath') assert.deepEqual(h.fetches, ['audio/tts/manifest.json']);
  });
}
test('verified audio pack preserves exact bytes and is fetched once', async () => {
  const {f, packBytes} = packedFixture();
  const h = harness({fixture: f, fetch: async url => url.endsWith('pack-synthetic.json') ? {ok: true, arrayBuffer: async () => packBytes.buffer.slice(packBytes.byteOffset, packBytes.byteOffset + packBytes.byteLength)} : null});
  assert.equal((await h.app.speak(text)).status, 'playing'); assert.equal((await h.app.speak(text)).status, 'playing');
  assert.equal(h.fetches.filter(url => url.endsWith('pack-synthetic.json')).length, 1);
  assert.equal(h.fetches.filter(url => url.endsWith('.mp3') || url.endsWith('.provenance.json')).length, 0);
});
test('tampered audio pack is never played', async () => {
  const {f} = packedFixture(), bad = Buffer.from('{}');
  const h = harness({fixture: f, fetch: async url => url.endsWith('pack-synthetic.json') ? {ok: true, arrayBuffer: async () => bad.buffer.slice(bad.byteOffset, bad.byteOffset + bad.byteLength)} : null});
  assert.equal((await h.app.speak(text)).status, 'unavailable'); assert.equal(h.played.length, 0);
});
test('packed MP3 still needs its individual audio checksum', async () => {
  const {f, pack} = packedFixture(); pack.files[f.entry.file] = Buffer.from('not the original audio').toString('base64');
  const changed = Buffer.from(JSON.stringify(pack)); f.entry.bundle_sha256 = sha(changed);
  const h = harness({fixture: f, fetch: async url => url.endsWith('pack-synthetic.json') ? {ok: true, arrayBuffer: async () => changed.buffer.slice(changed.byteOffset, changed.byteOffset + changed.byteLength)} : null});
  assert.equal((await h.app.speak(text)).status, 'unavailable'); assert.equal(h.played.length, 0);
});
