const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const root = path.resolve(__dirname, '..');
(async () => {
  const foreign = {'jack-review:state_v2': '{"version":2,"mastery":{"private":"untouched"}}', 'jack-review_srs': '{"private":"untouched"}', 'unrelated-setting': 'keep'};
  const values = new Map(Object.entries(foreign)), writes = [];
  const context = {console, Date, Map, Set, JSON, Math, Promise, encodeURIComponent, setTimeout,
    localStorage: {getItem: key => values.get(key) || null, setItem: (key,value) => { writes.push(key); values.set(key,value); }},
    indexedDB: {open() { throw Error('Synthetic no-IDB mode'); }}, navigator: {locks: {request: async (_, fn) => fn()}}};
  vm.createContext(context); vm.runInContext(fs.readFileSync(root + '/js/storage.js', 'utf8'), context);
  await vm.runInContext('Storage.init()', context);
  let state = await vm.runInContext('Storage.snapshot()', context); assert.equal(Object.keys(state.mastery).length, 0);
  await vm.runInContext("Storage.rateWord({id:'ko:test',kr:'테스트',en:'test'},'know','flashcard')", context);
  await vm.runInContext('Storage.clearAll()', context);
  for (const [key,value] of Object.entries(foreign)) assert.equal(values.get(key), value);
  assert.ok(writes.length > 0); assert.ok(writes.every(key => key.startsWith('alice-review')));
  await assert.rejects(vm.runInContext("Storage.importJSON({text:async()=>JSON.stringify({app:'jack-review-korean',version:2,state:{}})})", context));
  for (const file of fs.readdirSync(root + '/js')) {
    const s = fs.readFileSync(root + '/js/' + file, 'utf8');
    assert.ok(!/jack-review|JACK_|learnerId:\s*['"]jack['"]/.test(s), file);
    assert.ok(!/speechSynthesis|SpeechSynthesisUtterance/.test(s), 'No native TTS fallback: ' + file);
  }
  console.log('PASS Alice-only storage/reset/import/submission namespaces; foreign learner state is unchanged; no native TTS');
})().catch(error => { console.error(error); process.exit(1); });
