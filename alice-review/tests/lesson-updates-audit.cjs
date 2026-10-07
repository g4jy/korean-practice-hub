// Synthetic inputs only. Transaction faults are simulated, not authenticated delivery.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const root = path.resolve(__dirname, '..');
const L = require('../js/lesson-updates.js');
const at = '2026-01-01T10:00:00.000Z', ts = Date.parse(at);
const uuid = '83a0d5e5-dfc8-4fb7-a15a-7cf45c4c1122';
const word = {id: uuid, kr: '\ud14c\uc2a4\ud2b8', en: 'synthetic sense'};
const base = () => ({version: 2, mastery: {[uuid]: {known: true, b: 5, lastLearningAt: ts-1}}, words: [], lessons: {}, observations: {}, history: []});
const pkg = () => ({schema: 'korean-lesson-update/v1', app: 'alice-review-korean', learnerId: 'alice-b', lessonId: 'synthetic', revision: 1, documentedAt: at,
  vocabulary: [], observations: [{id: 'synthetic:observation', wordId: uuid, observedForm: word.kr, status: 'unsure', observedAt: at}]});
const clone = x => JSON.parse(JSON.stringify(x));

for (const [field, value] of [['learnerId','other'],['app','other'],['schema','lesson_flashcard_update.v1']]) {
  test('reject wrong contract identity: '+field, () => assert.throws(() => L.validate({...pkg(), [field]: value})));
}
for (const field of ['transcript','sourceUrl','studentId','credentials','evidence','privateNotes']) {
  for (const target of ['package','vocabulary','observation']) {
    test('reject unsupported/private field '+target+'.'+field, () => {
      const p = pkg();
      if (target === 'package') p[field] = 'synthetic';
      else if (target === 'vocabulary') p.vocabulary = [{...word, [field]: 'synthetic'}];
      else p.observations[0][field] = 'synthetic';
      assert.throws(() => L.validate(p), /Unsupported/);
    });
  }
}
test('same UUID cannot replace its English sense', () => {
  const p = pkg(); p.vocabulary = [{...word, en: 'different sense'}];
  assert.throws(() => L.plan(base(), p, [word]), /different meaning/);
});
test('same UUID cannot replace its Korean form', () => {
  const p = pkg(); p.vocabulary = [{...word, kr: 'different form'}];
  assert.throws(() => L.plan(base(), p, [word]), /different Korean/);
});
test('UUID preserved verbatim for vocabulary, mastery, observation and history', () => {
  const s = base(), p = pkg(); p.vocabulary = [word]; L.plan(s, p, [word]);
  assert.equal(s.words[0].id, uuid); assert.deepEqual(Object.keys(s.mastery), [uuid]);
  assert.equal(s.history[0].event.wordId, uuid);
});
test('unknown learning time cannot downgrade old Known', () => {
  for (const time of [undefined, 0, null]) {
    const s = base(); s.mastery[uuid].lastLearningAt = time;
    assert.equal(L.plan(s,pkg(),[word]).applied.length,0); assert.equal(s.mastery[uuid].known,true);
  }
});
test('observation equal to last actual learning time can override', () => {
  const s = base(); s.mastery[uuid].lastLearningAt = ts;
  assert.equal(L.plan(s,pkg(),[word]).applied.length,1);
});
test('unchanged observations and newer learning survive revisions', () => {
  const s = base(), p = pkg(); L.plan(s,p,[word]); s.mastery[uuid].known=true; s.mastery[uuid].lastLearningAt=ts+1;
  p.revision++; L.plan(s,p,[word]); assert.equal(s.mastery[uuid].known,true); assert.equal(s.history.length,1);
});
test('stable observation ID cannot change status in a new revision', () => {
  const s=base(),p=pkg(); L.plan(s,p,[word]); p.revision++; p.observations[0].status='dont_know';
  assert.throws(()=>L.plan(s,p,[word]),/status stable/);
});
test('observations applied by source time, not lexical ID', () => {
  const s=base(),p=pkg(); s.mastery={};
  p.observations=[{...p.observations[0],id:'a-new',status:'dont_know'}, {...p.observations[0],id:'z-old',observedAt:'2026-01-01T09:00:00.000Z'}];
  L.plan(s,p,[word]); assert.equal(s.mastery[uuid].status,'dont_know'); assert.equal(s.history[0].event.id,'z-old');
});
test('unknown/unassessed and duplicate events do not become weak ratings', () => {
  const p=pkg(); p.observations[0].status='unknown'; assert.throws(()=>L.validate(p));
  p.observations[0].status='unsure'; p.observations.push({...p.observations[0]}); assert.throws(()=>L.validate(p),/Duplicate/);
});
test('homographs require explicit target; unresolved can resolve without changing ID', () => {
  const s=base(),p=pkg(); p.vocabulary=[word,{...word,id:'sense:b',en:'second sense'}]; delete p.observations[0].wordId;
  assert.equal(L.plan(s,p,[]).unresolved.length,1); assert.equal(s.mastery[uuid].known,true);
  p.revision++; p.observations[0].wordId='sense:b'; L.plan(s,p,[]);
  assert.equal(s.mastery[uuid].known,true); assert.equal(s.mastery['sense:b'].known,false);
});

// A deliberately small serialized transaction double: stage writes and fail before commit.
function fakeIDB(faults) {
  const records=new Map(); let queue=Promise.resolve();
  const db={transaction() {
    let release; const prior=queue; queue=new Promise(r=>release=r);
    let cancelled=false, staged=new Map();
    const tx={error:null, objectStore:()=>({
      get(key) { const req={}; prior.then(()=>setTimeout(()=>{
        if(cancelled)return;
        req.result=records.has(key)?clone(records.get(key)):undefined; req.onsuccess?.();
        setTimeout(()=>{
          if(cancelled)return;
          if(staged.size && faults.commit) { faults.commit=false; tx.abort(); return; }
          for(const [k,v] of staged)records.set(k,v);
          tx.oncomplete?.(); release();
        },0);
      },0)); return req; },
      put(value,key) { staged.set(key,clone(value)); }
    }), abort() { cancelled=true; setTimeout(()=>{tx.onabort?.();release();},0); }};
    return tx;
  }};
  return {open() {const req={};setTimeout(()=>{req.result=db;req.onsuccess?.();},0);return req;}};
}
async function context({idb=false,initial={},faults={},locks=true}={}) {
  const ls=new Map(Object.entries(initial).map(([k,v])=>[k,JSON.stringify(v)]));
  let lockQueue=Promise.resolve();
  const ctx={console,Date,Map,Set,JSON,Math,Promise,Object,encodeURIComponent,setTimeout,
    indexedDB:idb?fakeIDB(faults):{open(){throw Error('disabled');}},
    navigator:locks?{locks:{request(name,fn){const r=lockQueue.then(fn);lockQueue=r.catch(()=>{});return r;}}}:{},
    localStorage:{getItem:k=>ls.get(k)||null,setItem(k,v){if(faults.local){faults.local=false;throw Error('quota');}ls.set(k,v);}}};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(root+'/js/storage.js','utf8')+'\n'+fs.readFileSync(root+'/js/lesson-updates.js','utf8'),ctx);
  const call=code=>vm.runInContext(code,ctx);
  await call('Storage.init()');
  return {call,ls,faults,snapshot:async()=>clone(await call('Storage.snapshot()')),
    apply:p=>call(`LessonUpdates.apply(${JSON.stringify(p)},${JSON.stringify([word])})`),
    restore:data=>call(`Storage.importJSON({text:async()=>${JSON.stringify(JSON.stringify(data))}})`)};
}
for(const idb of [false,true]) {
  test((idb?'IDB':'localStorage')+' failed commit preserves state and retry applies exactly once',async()=>{
    const faults={},c=await context({idb,faults}); const before=await c.snapshot();
    faults[idb?'commit':'local']=true;
    await assert.rejects(c.apply(pkg())); assert.deepEqual(await c.snapshot(),before);
    await c.apply(pkg()); await c.apply(pkg());
    const s=await c.snapshot(); assert.equal(s.history.length,1);assert.equal(Object.keys(s.lessons).length,1);
  });
  test((idb?'IDB':'localStorage')+' invalid late event rolls back earlier word and mastery changes',async()=>{
    const c=await context({idb}),p=pkg(); const before=await c.snapshot();
    p.vocabulary=[word];p.observations.push({...p.observations[0],id:'z-invalid',wordId:'missing'});
    await assert.rejects(c.apply(p),/Unknown word ID/); assert.deepEqual(await c.snapshot(),before);
  });
  test((idb?'IDB':'localStorage')+' concurrent duplicate imports commit once',async()=>{
    const c=await context({idb});await Promise.all([c.apply(pkg()),c.apply(pkg())]);
    assert.equal((await c.snapshot()).history.length,1);
  });
  test((idb?'IDB':'localStorage')+' async mutations rejected without partial state',async()=>{
    const c=await context({idb}),before=await c.snapshot();
    await assert.rejects(c.call('Storage.change(async s=>{s.words.push({id:"bad"})})'),/synchronous/);
    assert.deepEqual(await c.snapshot(),before);
  });
}
test('fallback without transaction/locks fails closed',async()=>assert.rejects(context({locks:false}),/Safe local writes/));
test('untimed legacy Known and original legacy responses preserved',async()=>{
  const old={'alice-review_srs':{[word.kr]:{known:true,b:5}},'alice-review:koreanPracticeResponses':[{id:'legacy-uuid',timestamp:at,status:'know'}]};
  const c=await context({initial:old}); const m=await c.call('Storage.getMastery()');
  const id='ko:'+encodeURIComponent(word.kr); assert.equal(m[id].known,true);assert.equal(m[id].lastLearningAt,0);
  assert.equal(JSON.parse(c.ls.get('alice-review:koreanPracticeResponses'))[0].id,'legacy-uuid');
  assert.equal((await c.snapshot()).history.length,1);
  assert.equal((await c.snapshot()).history[0].id,'legacy-uuid');
});
test('legacy migration keeps existing UUID keys and explicit IDs usable',async()=>{
  for(const key of [uuid,word.kr]) {
    const old={'alice-review_srs':{[key]:{id:uuid,kr:word.kr,known:true,b:5,t:ts}}};
    const c=await context({initial:old});const m=await c.call('Storage.getMastery()');
    assert.deepEqual(Object.keys(m),[uuid]);assert.equal(m[uuid].known,true);
  }
});
test('migration generated history IDs do not collide with preserved IDs',async()=>{
  const c=await context({initial:{'alice-review:koreanPracticeResponses':[{status:'know'},{id:'legacy:0',status:'unsure'}]}});
  const h=(await c.snapshot()).history;assert.equal(h[1].id,'legacy:0');assert.equal(new Set(h.map(e=>e.id)).size,2);
});
test('new answers timestamp learning and keep UUID',async()=>{
  const c=await context();await c.call(`Storage.rateWord(${JSON.stringify(word)},'know','quiz',{quiz:true})`);
  const s=await c.snapshot();assert.ok(s.mastery[uuid].lastLearningAt>ts);assert.equal(s.history[0].wordId,uuid);assert.ok(s.history[0].timestamp);
});
test('backup word same UUID/different meaning rejected atomically',async()=>{
  const c=await context();await c.call(`Storage.addWord(${JSON.stringify(word)})`);const before=await c.snapshot();
  const incoming=clone(before);incoming.words[0].en='different sense';incoming.mastery[uuid]={known:false,b:0,t:ts};
  await assert.rejects(c.restore({app:'alice-review-korean',version:2,state:incoming}),/conflicts/);assert.deepEqual(await c.snapshot(),before);
});
test('conflicting lesson revision rejected through backup path',async()=>{
  const c=await context();await c.apply(pkg());const before=await c.snapshot(),incoming=clone(before);
  const changed=pkg();changed.observations[0].status='dont_know';incoming.lessons.synthetic.signature=JSON.stringify(L.validate(changed));
  await assert.rejects(c.restore({app:'alice-review-korean',version:2,state:incoming}),/Conflicting lesson/);assert.deepEqual(await c.snapshot(),before);
});
test('backup lesson cannot smuggle another learner signature',async()=>{
  const c=await context();await c.apply(pkg());const incoming=await c.snapshot(),p=pkg();p.learnerId='other';incoming.lessons.synthetic.signature=JSON.stringify(p);
  await assert.rejects(c.restore({app:'alice-review-korean',version:2,state:incoming}),/different identity/);
});
test('backup cannot retarget an observation at a higher revision',async()=>{
  const c=await context();await c.apply(pkg());const before=await c.snapshot(),incoming=clone(before);
  const o=Object.values(incoming.observations)[0];o.revision++;o.event.wordId='sense:other';
  await assert.rejects(c.restore({app:'alice-review-korean',version:2,state:incoming}),/Conflicting observation/);assert.deepEqual(await c.snapshot(),before);
});
test('backup same history ID cannot change response meaning',async()=>{
  const c=await context();await c.call(`Storage.rateWord(${JSON.stringify(word)},'know')`);const before=await c.snapshot(),incoming=clone(before);
  incoming.history[0].word_en='different meaning';
  await assert.rejects(c.restore({app:'alice-review-korean',version:2,state:incoming}),/Conflicting history/);assert.deepEqual(await c.snapshot(),before);
});
test('identical lesson applied on two devices can merge despite local receipt metadata',async()=>{
  const c=await context();await c.apply(pkg());const incoming=await c.snapshot();incoming.history[0].appliedAt='2026-01-02T00:00:00Z';
  await c.restore({app:'alice-review-korean',version:2,state:incoming});assert.equal((await c.snapshot()).history.length,1);
});
test('addWord rejects sense collision and prototype IDs',async()=>{
  const c=await context();await c.call(`Storage.addWord(${JSON.stringify(word)})`);
  await assert.rejects(c.call(`Storage.addWord(${JSON.stringify({...word,en:'wrong'})})`),/different meaning/);
  await assert.rejects(c.call(`Storage.rateWord(${JSON.stringify({...word,id:'__proto__'})},'know')`),/Invalid word ID/);
});

