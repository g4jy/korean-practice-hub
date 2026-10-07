const assert = require('node:assert/strict');
const {test} = require('node:test');
const {vocabularyState} = require('../js/vocabulary.js');

for (const record of [undefined, null, {}, {b:0}, {b:5}, {t:123}, {status:'unknown'}, {status:'unassessed',known:false}, {status:'unresolved',known:false}]) {
  test('unassessed without an explicit rating: '+JSON.stringify(record), () => {
    const before = JSON.stringify(record);
    assert.equal(vocabularyState(record),'unassessed');
    assert.equal(JSON.stringify(record),before);
  });
}
for (const record of [{known:true}, {status:'know'}, {known:true,status:'unsure'}]) {
  test('preserve Known: '+JSON.stringify(record),()=>assert.equal(vocabularyState(record),'known'));
}
for (const record of [{status:'dont_know'}, {status:'unsure'}, {known:false}, {known:false,status:null}]) {
  test('recorded rating belongs in Review: '+JSON.stringify(record),()=>assert.equal(vocabularyState(record),'review'));
}
test('fresh 135-card pool is unassessed, not review, and creates no records',()=>{
  const mastery={},counts={unassessed:0,review:0,known:0};
  for(let i=0;i<135;i++)counts[vocabularyState(mastery['synthetic:'+i])]++;
  assert.deepEqual(counts,{unassessed:135,review:0,known:0});assert.deepEqual(mastery,{});
});

