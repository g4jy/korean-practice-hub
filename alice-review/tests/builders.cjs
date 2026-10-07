// Exhaustive reachable builder states, using the actual application scripts.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), path = require('node:path');
const root = path.resolve(__dirname, '..');
class El {
  constructor() {
    this.children = []; this.events = {}; this.dataset = {}; this.textContent = ''; this.value = ''; this.disabled = false;
    const classes = new Set(); this.classList = {add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x), toggle: (x, force) => { const yes = force === undefined ? !classes.has(x) : force; yes ? classes.add(x) : classes.delete(x); return yes; }};
  }
  querySelector(s) { this.byName ??= {}; return this.byName[s] ??= new El(); }
  appendChild(x) { this.children.push(x); }
  replaceChildren() { this.children = []; }
  addEventListener(e, f) { this.events[e] = f; }
  setAttribute() {}
  click() { if (!this.disabled) this.events.click?.({target: this, stopPropagation() {}}); }
}
const jong = s => (s.charCodeAt(s.length - 1) - 0xac00) % 28 !== 0;
const particle = (s, a, b) => jong(s) ? a : b;
async function boot(data, file) {
  const els = new Map(), names = file.startsWith('action') ? ['time', 'place', 'object', 'question'] : ['adverb'];
  const toggles = names.map(name => { const el = new El(); el.dataset.element = name; return el; });
  const get = id => { if (!els.has(id)) els.set(id, new El()); return els.get(id); }, calls = [];
  const context = {console, document: {getElementById: get, querySelectorAll: () => toggles, createElement: () => new El()},
    App: {loadVocab: async () => data, particleIGa: s => particle(s, '이', '가'), particleEulReul: s => particle(s, '을', '를'), pulseBlock() {}, speak: s => calls.push(s)}};
  vm.createContext(context); await vm.runInContext(fs.readFileSync(root + '/js/' + file, 'utf8'), context);
  return {get, calls, toggle: name => toggles.find(x => x.dataset.element === name), select(id, i) { const el = get(id); el.value = String(i); el.events.change(); }};
}
async function collect(data) {
  const texts = new Set(), states = {action: 0, describe: 0};
  const add = text => { if (text) { assert.ok(!/undefined|\[object Object\]|NaN/.test(text), text); texts.add(text); } };
  for (const category of data.flashcards.categories) for (const card of category.cards) { add(card.kr); add(card.polite); for (const form of card.politeForms || []) add(form); }
  for (const pattern of data.patterns || []) for (const e of pattern.examples || []) if (!e.skipAudio) for (const text of e.audioVariants || [e.ko]) add(text);
  let b = await boot(data, 'action-builder.js');
  // Direct selectors, then question-mode restoration, exercise the same state as block cycling.
  b.select('subject-select', 2); b.select('verb-select', data.action.verbs.findIndex(v => v.id === '마시다'));
  b.select('place-select', 1); b.select('object-select', 1);
  assert.equal(b.get('full-sentence').textContent, '친구는 학교에서 커피를 마셔요');
  assert.equal(b.get('translation').textContent, 'My friend drinks coffee at school');
  b.toggle('question').click(); assert.equal(b.get('full-sentence').textContent, '친구는 무엇을 마셔요?');
  assert.equal(b.get('place-select').disabled, true); assert.equal(b.get('object-select').disabled, true);
  b.toggle('question').click(); assert.equal(b.get('full-sentence').textContent, '친구는 학교에서 커피를 마셔요');
  b.select('verb-select', data.action.verbs.findIndex(v => v.id === '가다'));
  assert.equal(b.get('full-sentence').textContent, '친구는 학교에 가요');
  assert.equal(b.get('object-select').disabled, true); assert.equal(b.get('object-select').value, '-1');

  const capture = kind => {
    const sentence = b.get('full-sentence').textContent; add(sentence); states[kind]++;
    assert.ok(b.get('translation').textContent.trim(), sentence);
    b.get('speak-btn').click(); assert.equal(b.calls.at(-1), sentence, 'Full phrase must be one exact audio request');
    for (const name of kind === 'action' ? ['subject','time','place','object','verb'] : ['subject','adverb','adjective']) {
      const block = b.get('block-' + name); if (!block.classList.contains('hidden')) add(block.querySelector('.block-kr').textContent);
    }
  };
  function set(name, yes) { const btn = b.toggle(name); if (btn.classList.contains('active') !== yes) btn.click(); }
  for (let si = 0; si < data.action.subjects.length; si++) for (let vi = 0; vi < data.action.verbs.length; vi++) {
    b.select('subject-select', si); b.select('verb-select', vi);
    set('question', false); set('time', false); set('place', false); set('object', false);
    const verb = data.action.verbs[vi];
    const objects = data.action.objects.filter(o => verb.compatibleObjects?.includes(o.kr + particle(o.kr,'을','를')));
    const timeStates = data.action.times.length + 1, placeStates = data.action.places.length + 1, objectStates = objects.length + 1;
    for (let ti = 0; ti < timeStates; ti++) {
      set('time', ti > 0); if (ti > 1) b.get('block-time').click();
      for (let pi = 0; pi < placeStates; pi++) {
        set('place', pi > 0); if (pi > 1) b.get('block-place').click();
        for (let oi = 0; oi < objectStates; oi++) {
          set('object', oi > 0); if (oi > 1) b.get('block-object').click(); capture('action');
        }
      }
    }
    set('question', true); if (!b.toggle('question').disabled) { assert.ok(b.get('full-sentence').textContent.endsWith('?')); capture('action'); }
    set('question', false);
  }
  b = await boot(data, 'describe-builder.js');
  for (let ai = 0; ai < data.describe.adjectives.length; ai++) {
    b.select('adjective-select', ai);
    const count = b.get('subject-select').children.length; assert.ok(count > 0, 'Each adjective needs a compatible subject');
    for (let si = 0; si < count; si++) {
      b.select('subject-select', si); set('adverb', false); capture('describe');
      for (let adi = 0; adi < data.describe.adverbs.length; adi++) { set('adverb', true); if (adi) b.get('block-adverb').click(); capture('describe'); }
    }
  }
  return {texts: [...texts].sort(), states};
}
if (require.main === module) (async () => {
  const data = JSON.parse(fs.readFileSync(root + '/data/vocab.json'));
  const result = await collect(data);
  const questionsPath = root + '/data/questions.json';
  if (fs.existsSync(questionsPath)) {
    const questions = JSON.parse(fs.readFileSync(questionsPath));
    const texts = new Set(result.texts);
    for (const section of questions.sections) for (const q of section.questions) { texts.add(q.ko); if (q.answerKo) texts.add(q.answerKo); }
    result.texts = [...texts].sort(); result.questionCount = questions.sections.reduce((n, s) => n + s.questions.length, 0);
  }
  const output = process.argv[2]; if (output) fs.writeFileSync(output, JSON.stringify({schema: 'alice-edge-inventory/v1', reviewedPublic: true, ...result}, null, 2) + '\n');
  console.log(JSON.stringify({result: 'pass', texts: result.texts.length, states: result.states, output: output || null}, null, 2));
})().catch(error => { console.error(error); process.exit(1); });
module.exports = {collect};
