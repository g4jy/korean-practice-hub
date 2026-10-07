// Verify all built-in audio requests against exact Edge metadata and file hashes.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const {collect} = require('./builders.cjs');
const root = path.resolve(__dirname, '..');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
(async () => {
  const data = JSON.parse(fs.readFileSync(root + '/data/vocab.json'));
  const result = await collect(data), texts = new Set(result.texts);
  const questions = JSON.parse(fs.readFileSync(root + '/data/questions.json'));
  for (const section of questions.sections) for (const question of section.questions) { texts.add(question.ko); if (question.answerKo) texts.add(question.answerKo); }
  const dir = root + '/audio/tts', manifest = JSON.parse(fs.readFileSync(dir + '/manifest.json'));
  assert.equal(manifest.schema_version, 3);
  assert.ok(Array.isArray(manifest.parts) && manifest.parts.length > 0);
  const entries = Object.create(null), partNames = new Set();
  for (const part of manifest.parts) {
    assert.match(part.file, /^manifest-part-[0-9]{2}-[a-f0-9]{64}\.json$/);
    assert.ok(part.file.endsWith('-' + part.sha256 + '.json'));
    assert.ok(!partNames.has(part.file), 'Duplicate manifest part'); partNames.add(part.file);
    const raw = fs.readFileSync(dir + '/' + part.file);
    assert.ok(raw.length < 250000); assert.equal(sha(raw), part.sha256);
    const shard = JSON.parse(raw); assert.equal(shard.schema_version, 1);
    assert.equal(Object.keys(shard.entries).length, part.entry_count);
    for (const [text, entry] of Object.entries(shard.entries)) {
      assert.ok(!Object.hasOwn(entries, text), 'Duplicate manifest entry'); entries[text] = entry;
    }
  }
  assert.equal(Object.keys(entries).length, manifest.entry_count);
  assert.equal(sha(JSON.stringify(entries)), manifest.entries_sha256);
  manifest.entries = entries;
  assert.equal(Object.keys(manifest.entries).length, texts.size, 'Only required reviewed clips belong in the release');
  const packs = new Map();
  function readBytes(entry, name) {
    if (!entry.bundle) return fs.readFileSync(dir + '/' + name);
    assert.match(entry.bundle, /^pack-[a-zA-Z0-9_-]+\.json$/);
    if (!packs.has(entry.bundle)) {
      const raw = fs.readFileSync(dir + '/' + entry.bundle); assert.equal(sha(raw), entry.bundle_sha256);
      const pack = JSON.parse(raw); assert.equal(pack.schema_version, 1); assert.equal(pack.encoding, 'base64');
      packs.set(entry.bundle, pack.files);
    }
    const encoded = packs.get(entry.bundle)[name]; assert.equal(typeof encoded, 'string');
    return Buffer.from(encoded, 'base64');
  }
  let generated = 0, inherited = 0;
  for (const text of texts) {
    const entry = manifest.entries[text]; assert.ok(entry, 'Missing exact Edge audio: ' + text);
    assert.equal(entry.text, text); assert.equal(entry.text_sha256, sha(text));
    assert.match(entry.file, /^[a-zA-Z0-9_-]+\.mp3$/); assert.equal(entry.receipt, entry.request_sha256 + '.provenance.json');
    const bytes = readBytes(entry, entry.file), proofBytes = readBytes(entry, entry.receipt);
    assert.equal(sha(bytes), entry.audio_sha256); assert.equal(sha(proofBytes), entry.receipt_sha256);
    const proof = JSON.parse(proofBytes); assert.equal(proof.schema_version, 1); assert.match(proof.generator_sha256, /^[a-f0-9]{64}$/); assert.equal(proof.provider, 'edge-tts'); assert.equal(proof.reviewed_public, true);
    assert.equal(proof.voice, 'ko-KR-SunHiNeural'); assert.equal(proof.rate, '+0%'); assert.equal(proof.volume, '+0%'); assert.equal(proof.pitch, '+0Hz');
    for (const key of ['text', 'text_sha256', 'request_sha256', 'file', 'audio_sha256']) assert.equal(proof[key], entry[key]);
    assert.equal(sha(JSON.stringify(['edge-tts',proof.voice,proof.rate,proof.volume,proof.pitch,text])), entry.request_sha256);
    if (proof.source_kind === 'edge_generation') { generated++; assert.ok(proof.client_version && proof.generated_at); }
    else { inherited++; assert.equal(proof.source_kind, 'repository_lineage'); }
  }
  console.log(JSON.stringify({result:'pass',required:texts.size,verified:texts.size,observedEdgeGeneration:generated,repositoryLineage:inherited,missing:0,packs:packs.size,manifestParts:partNames.size},null,2));
})().catch(error=>{console.error(error);process.exit(1)});
