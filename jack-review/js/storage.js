/** Local-only, shared progress for every Jack study mode. No network writes. */
const Storage = (() => {
  const DB_NAME = 'jack-review-korean', STORE = 'progress', STATE_KEY = 'state_v2';
  const LS_STATE = 'jack-review:state_v2', LS_SRS = 'jack-review_srs';
  const LS_WORDS = 'jack-review_user_words', OLD_MASTERY = 'jack-review:koreanPracticeMastery';
  let db = null, initialization = null, cache = null;
  const copy = value => JSON.parse(JSON.stringify(value));
  const wordId = kr => 'ko:' + encodeURIComponent(kr.normalize('NFC').trim());
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const validId = id => typeof id === 'string' && !!id.trim() && !['__proto__', 'constructor', 'prototype'].includes(id);
  const same = (a, b) => {
    const ordered = x => Array.isArray(x) ? x.map(ordered) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, ordered(x[k])])) : x;
    return JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));
  };
  function sameWord(a, b) {
    return a.kr.normalize('NFC').trim() === b.kr.normalize('NFC').trim() && a.en.normalize('NFC').trim() === b.en.normalize('NFC').trim();
  }
  const historyIdentity = e => e.source === 'lesson' ? {source: e.source, lessonId: e.lessonId, revision: e.revision, event: e.event} : e;
  function localChange(write) {
    if (typeof navigator === 'undefined' || !navigator.locks) throw new Error('Safe local writes require browser locks or IndexedDB');
    return navigator.locks.request(LS_STATE, write);
  }
  const readLS = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } };
  const stamp = m => Math.max(m?.lastLearningAt || 0, m?.lastEventAt || 0, m?.t || 0);
  function open() {
    return new Promise((resolve, reject) => {
      if (db) return resolve(db);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
      req.onsuccess = () => { db = req.result; resolve(db); };
      req.onerror = () => reject(req.error);
    });
  }
  function getIDB(key) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly'), req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
      tx.onabort = () => reject(tx.error || new Error('Could not read progress'));
    });
  }
  function empty() { return {version: 2, mastery: {}, words: [], lessons: {}, observations: {}, history: []}; }
  function normalizeLegacy(progress, statuses = {}) {
    const mastery = {};
    for (const kr of new Set([...Object.keys(progress), ...Object.keys(statuses)])) {
      const p = progress[kr] || {}, s = statuses[kr] || {};
      const explicitId = validId(p.id) ? p.id : validId(s.id) ? s.id : null;
      const stableKey = kr.startsWith('ko:') || /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(kr);
      const key = explicitId || (stableKey ? kr : wordId(kr));
      const pTime = Number(p.t) || 0, sTime = Date.parse(s.lastSeen) || 0, time = Math.max(pTime, sTime);
      const statusWins = s.status && (sTime > pTime || (sTime === pTime && typeof p.known !== 'boolean'));
      const known = statusWins ? s.status === 'know' : typeof p.known === 'boolean' ? p.known : p.b >= 3;
      const box = statusWins ? known ? 3 : s.status === 'unsure' ? 1 : 0 : p.known === false ? 0 : Number.isInteger(p.b) ? p.b : known ? 3 : 0;
      const status = known ? 'know' : statusWins ? s.status : box > 0 ? 'unsure' : 'dont_know';
      mastery[key] = {...p, known, status, b: box, t: time, lastLearningAt: time, lastEventAt: time, kr: p.kr || s.kr || kr};
    }
    return mastery;
  }
  async function init() {
    if (initialization) return initialization;
    initialization = (async () => {
      try { await open(); } catch { db = null; }
      let existing = db ? await getIDB(STATE_KEY) : null;
      if (!existing) existing = readLS(LS_STATE, null);
      if (!existing) {
        existing = empty();
        const progress = (db && await getIDB('srs_mastery')) || readLS(LS_SRS, {});
        existing.mastery = normalizeLegacy(progress, readLS(OLD_MASTERY, {}));
        existing.words = ((db && await getIDB('user_words')) || readLS(LS_WORDS, [])).map(w => ({...w, id: w.id || wordId(w.kr)}));
        const responses = readLS('jack-review:koreanPracticeResponses', []), used = new Set(responses.map(e => e.id).filter(validId));
        existing.history = responses.map((e, i) => {
          if (validId(e.id)) return {...e, origin: 'legacy'};
          let id = 'legacy:' + i;
          while (used.has(id)) id = 'legacy:' + id;
          used.add(id);
          return {...e, id, origin: 'legacy'};
        });
      }
      cache = existing;
      if (db) {
        await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, 'readwrite');
          const req = tx.objectStore(STORE).get(STATE_KEY);
          req.onsuccess = () => { if (req.result) cache = req.result; else tx.objectStore(STORE).put(existing, STATE_KEY); };
          tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error || new Error('Could not initialize progress'));
        });
      } else {
        await localChange(() => {
          // Another tab may have completed migration while this tab was opening IDB.
          cache = readLS(LS_STATE, null) || existing;
          localStorage.setItem(LS_STATE, JSON.stringify(cache));
        });
      }
    })();
    try { await initialization; } catch (error) { initialization = null; throw error; }
  }
  function mirror() {
    try { localStorage.setItem(LS_STATE, JSON.stringify(cache)); } catch (e) { if (!db) throw e; }
  }
  async function snapshot() {
    await init();
    cache = (db ? await getIDB(STATE_KEY) : readLS(LS_STATE, cache)) || cache;
    return copy(cache);
  }
  async function change(mutator) {
    await init();
    if (db) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite'), store = tx.objectStore(STORE), req = store.get(STATE_KEY);
        let result, next, failure;
        req.onsuccess = () => {
          try {
            next = copy(req.result || cache); result = mutator(next);
            if (result && typeof result.then === 'function') throw new Error('Progress mutations must be synchronous');
            store.put(next, STATE_KEY);
          }
          catch (e) { failure = e; tx.abort(); }
        };
        tx.oncomplete = () => { cache = next; mirror(); resolve(result); };
        tx.onerror = tx.onabort = () => reject(failure || tx.error || new Error('Could not save progress'));
      });
    }
    const write = () => {
      const next = copy(readLS(LS_STATE, cache)), result = mutator(next);
      if (result && typeof result.then === 'function') throw new Error('Progress mutations must be synchronous');
      localStorage.setItem(LS_STATE, JSON.stringify(next)); cache = next; return result;
    };
    return localChange(write);
  }
  async function getMastery() { return (await snapshot()).mastery; }
  function cachedMastery() { return copy(cache?.mastery || {}); }
  async function getUserWords() { return (await snapshot()).words; }
  async function saveUserWords(words) { return change(s => { s.words = words.map(w => ({...w, id: w.id || wordId(w.kr)})); }); }
  async function addWord(word) {
    const w = {...word, id: word.id || wordId(word.kr)};
    if (!validId(w.id)) throw new Error('Invalid word ID');
    await change(s => {
      const existing = s.words.find(x => x.id === w.id);
      if (existing && !sameWord(existing, w)) throw new Error('Word ID already belongs to a different meaning or form');
      if (!existing) s.words.push(w);
    }); return w;
  }
  async function rateWord(word, status, source = 'words', options = {}) {
    if (!['know', 'unsure', 'dont_know'].includes(status)) throw new Error('Invalid response');
    const id = word.id || wordId(word.kr), now = Date.now();
    if (!validId(id)) throw new Error('Invalid word ID');
    return change(s => {
      const p = s.mastery[id] || {}, ok = status === 'know';
      const b = options.leitner ? (ok ? Math.min((p.b || 0) + 1, 5) : 1) : ok ? Math.max(p.b || 0, 3) : status === 'unsure' ? 1 : 0;
      const masteryStatus = options.leitner && ok && b < 3 ? 'unsure' : status;
      s.mastery[id] = {...p, kr: word.kr, status: masteryStatus, known: masteryStatus === 'know',
        b, t: now, lastLearningAt: now, lastEventAt: now, count: (p.count || 0) + 1};
      if (options.quiz) {
        s.mastery[id].rv = true;
        s.mastery[id][ok ? 'rok' : 'rfail'] = (p[ok ? 'rok' : 'rfail'] || 0) + 1;
      }
      s.history.push({id: 'response:' + now + ':' + Math.random().toString(36).slice(2), wordId: id,
        word_kr: word.kr, word_en: word.en, status, source, timestamp: new Date(now).toISOString()});
      return copy(s.mastery);
    });
  }
  function download(data, filename) {
    const a = document.createElement('a'), url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}));
    a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function exportJSON() {
    download({version: 2, app: 'jack-review-korean', exported: new Date().toISOString(), state: await snapshot()},
      'jack-review-progress-' + new Date().toISOString().slice(0, 10) + '.json');
  }
  async function importJSON(file) {
    const data = JSON.parse(await file.text());
    if (data.app !== 'jack-review-korean') throw new Error('This backup belongs to another app');
    if (![1, 2].includes(data.version) || (data.version === 1 && (!data.progress || typeof data.progress !== 'object'))) throw new Error('Unsupported backup format');
    const incoming = data.version === 2 ? data.state : {mastery: normalizeLegacy(data.progress || {}), words: data.userWords || [], lessons: {}, observations: {}, history: []};
    if (!incoming || !incoming.mastery || Array.isArray(incoming.mastery) || !Array.isArray(incoming.words) || !Array.isArray(incoming.history || [])) throw new Error('Invalid backup file');
    for (const [id, m] of Object.entries(incoming.mastery)) {
      if (!id || ['__proto__', 'constructor', 'prototype'].includes(id) || !m || typeof m !== 'object' || Array.isArray(m)) throw new Error('Invalid progress entry');
      if (m.status != null && !['know', 'unsure', 'dont_know'].includes(m.status)) throw new Error('Invalid progress status');
      if (m.b != null && (!Number.isInteger(m.b) || m.b < 0 || m.b > 5)) throw new Error('Invalid study box');
      for (const key of ['t','lastLearningAt','lastEventAt','lastLessonObservedAt']) if (m[key] != null && (!Number.isFinite(m[key]) || m[key] < 0)) throw new Error('Invalid progress timestamp');
    }
    for (const [id, lesson] of Object.entries(incoming.lessons || {})) {
      if (!validId(id) || !lesson || !Number.isSafeInteger(lesson.revision) || lesson.revision < 1 || typeof lesson.signature !== 'string') throw new Error('Invalid lesson history');
      const signature = JSON.parse(lesson.signature);
      if (signature.schema !== 'korean-lesson-update/v1' || signature.app !== 'jack-review-korean' || signature.learnerId !== 'jack' || signature.lessonId !== id || signature.revision !== lesson.revision) throw new Error('Lesson history belongs to a different identity');
    }
    for (const observation of Object.values(incoming.observations || {})) {
      if (!observation || !observation.event || typeof observation.event.observedForm !== 'string' || !['unsure','dont_know'].includes(observation.event.status)) throw new Error('Invalid observation history');
    }
    for (const event of incoming.history || []) if (!event || typeof event.id !== 'string') throw new Error('Invalid response history');
    for (const w of incoming.words) {
      if (!w || typeof w.kr !== 'string' || !w.kr.trim() || typeof w.en !== 'string' || !w.en.trim()) throw new Error('Invalid backup word');
      for (const key of ['id','rom','polite','category']) if (w[key] != null && typeof w[key] !== 'string') throw new Error('Invalid backup word field');
      if (w.id != null && !validId(w.id)) throw new Error('Invalid backup word ID');
    }
    return change(s => {
      if (Number.isFinite(incoming.lastResetAt)) s.lastResetAt = Math.max(s.lastResetAt || 0, incoming.lastResetAt);
      for (const [id, m] of Object.entries(incoming.mastery)) {
        if (['__proto__', 'constructor', 'prototype'].includes(id)) throw new Error('Invalid word ID');
        if (stamp(m) >= (s.lastResetAt || 0) && (!own(s.mastery, id) || stamp(m) > stamp(s.mastery[id]))) s.mastery[id] = m;
      }
      for (const w of incoming.words) {
        const id = w.id || wordId(w.kr), existing = s.words.find(x => x.id === id);
        if (existing && !sameWord(existing, w)) throw new Error('Backup word ID conflicts with an existing meaning or form');
        if (!existing) s.words.push({...w, id});
      }
      for (const [id, lesson] of Object.entries(incoming.lessons || {})) {
        if (own(s.lessons, id) && lesson.revision === s.lessons[id].revision && lesson.signature !== s.lessons[id].signature) throw new Error('Conflicting lesson revision in backup');
        if (!own(s.lessons, id) || lesson.revision > s.lessons[id].revision) Object.defineProperty(s.lessons, id, {value: lesson, enumerable: true, writable: true, configurable: true});
      }
      for (const [id, o] of Object.entries(incoming.observations || {})) {
        const previous = own(s.observations, id) ? s.observations[id] : null;
        if (previous && (previous.event.observedAt !== o.event.observedAt || previous.event.observedForm !== o.event.observedForm || previous.event.status !== o.event.status || (previous.event.wordId && o.event.wordId && previous.event.wordId !== o.event.wordId))) throw new Error('Conflicting observation identity in backup');
        if (previous?.event.wordId && !o.event.wordId) continue;
        if (!own(s.observations, id) || o.revision > s.observations[id].revision) Object.defineProperty(s.observations, id, {value: o, enumerable: true, writable: true, configurable: true});
      }
      const ids = new Map(s.history.map(e => [e.id, e]));
      for (const e of incoming.history || []) {
        if (ids.has(e.id) && !same(historyIdentity(ids.get(e.id)), historyIdentity(e))) throw new Error('Conflicting history ID in backup');
        if (!ids.has(e.id)) { s.history.push(e); ids.set(e.id, e); }
      }
      return Object.keys(incoming.mastery).length;
    });
  }
  async function clearAll() {
    // Reset only active study ratings. Retain history, added words, and consumed lesson revisions.
    await change(s => { s.history.push({id: 'reset:' + Date.now(), source: 'reset', timestamp: new Date().toISOString(), previous: s.mastery}); s.lastResetAt = Date.now(); s.mastery = {}; });
  }
  return {init, wordId, getMastery, cachedMastery, getUserWords, saveUserWords, addWord, rateWord,
    snapshot, change, exportJSON, importJSON, clearAll};
})();
