const fs = require('node:fs'), assert = require('node:assert/strict'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(root + '/data/vocab.json'));
assert.equal(data.student, 'Alice');
const cards = data.flashcards.categories.flatMap(x => x.cards);
assert.ok(cards.length > 0);
assert.equal(new Set(cards.map(x => x.id)).size, cards.length, 'Unique stable card IDs');
for (const card of cards) {
  assert.ok(card.kr && card.en && card.id, JSON.stringify(card));
  assert.equal(typeof card.rom, 'string');
  assert.ok(!/[<>]/.test(card.kr));
}
assert.ok(Array.isArray(data.patterns) && data.patterns.length > 0);
assert.equal(new Set(data.patterns.map(p => p.id)).size, data.patterns.length);
for (const pattern of data.patterns) {
  assert.ok(pattern.pattern && pattern.en && pattern.explanation);
  assert.ok(pattern.examples.length > 0, pattern.pattern);
  for (const example of pattern.examples) assert.ok(example.ko && example.en, pattern.pattern);
}
function walk(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    assert.ok(!/^(lessonRefs|sourceUrl|sourceId|documentId|transcript|observations|performance|studentId|classroomId|documentedAt)$/.test(key), 'Private metadata: ' + key);
    if (typeof item === 'string') assert.ok(!/drive\.google\.com|notion\.so|preply\.com|classroom\/|https?:\/\//.test(item), 'Private/external data link');
    walk(item);
  }
}
walk(data);
const questions = JSON.parse(fs.readFileSync(root + '/data/questions.json'));
walk(questions); assert.equal(questions.sections.length, 3);
const allQuestions = questions.sections.flatMap(section => { assert.equal(section.questions.length, 20); return section.questions; });
assert.equal(new Set(allQuestions.map(q => q.id)).size, 60);
assert.equal(new Set(allQuestions.map(q => q.ko)).size, 60);
for (const question of allQuestions) { assert.ok(question.ko.endsWith('?')); assert.ok(!/[A-Za-z]/.test(question.ko)); }

for (const file of fs.readdirSync(root).filter(name => name.endsWith('.html'))) {
  const html = fs.readFileSync(root + '/' + file, 'utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(x => x[1]);
  assert.equal(new Set(ids).size, ids.length, 'Unique element IDs in ' + file);
  for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    const url = match[1]; if (/^(https?:|data:)/.test(url)) continue;
    const target = path.resolve(root, url.split('?')[0]);
    assert.ok(target.startsWith(root + path.sep)); assert.ok(fs.existsSync(target), file + ' missing ' + target);
  }
  for (const asset of [...html.matchAll(/(?:src|href)="((?:js|css)\/[^"?]+)([^"]*)"/g)]) assert.match(asset[2], /^\?v=/, 'Versioned asset in ' + file);
}
console.log(JSON.stringify({result: 'pass', cards: cards.length, patterns: data.patterns.length, pages: fs.readdirSync(root).filter(x => x.endsWith('.html')).length, privacy: 'educational allowlist; no private source metadata'}, null, 2));
