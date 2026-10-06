/**
 * IndexedDB storage with localStorage fallback + export/import.
 * Adapted from Yuna TOPIK storage for Jack's practice app.
 * Primary: IndexedDB. Fallback: localStorage.
 */
const Storage = (() => {
  const DB_NAME = 'jack-review-korean';
  const DB_VER = 1;
  const STORE = 'progress';
  const LS_SRS = 'jack-review_srs';
  const LS_WORDS = 'jack-review_user_words';
  const OLD_MASTERY = 'jack-review:koreanPracticeMastery';

  let db = null;

  function open() {
    return new Promise((resolve, reject) => {
      if (db) return resolve(db);
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => { db = req.result; resolve(db); };
      req.onerror = () => reject(req.error);
    });
  }

  async function getIDB(key) {
    const d = await open();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function setIDB(key, val) {
    const d = await open();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(val, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function init() {
    try {
      await open();
      const existing = await getIDB('srs_mastery');
      if (!existing) {
        // Migrate from old localStorage mastery
        const old = localStorage.getItem(OLD_MASTERY);
        if (old) {
          const parsed = JSON.parse(old);
          const migrated = {};
          for (const [kr, data] of Object.entries(parsed)) {
            let box = 0;
            if (data.status === 'know') box = 3;
            else if (data.status === 'unsure') box = 1;
            migrated[kr] = { b: box, t: Date.now() };
          }
          await setIDB('srs_mastery', migrated);
          try { localStorage.setItem(LS_SRS, JSON.stringify(migrated)); } catch (e) {}
          console.log('Migrated', Object.keys(migrated).length, 'words from old mastery');
        }
        // Migrate localStorage fallback if exists
        const lsFallback = localStorage.getItem(LS_SRS);
        if (!old && lsFallback) {
          await setIDB('srs_mastery', JSON.parse(lsFallback));
        }
      }
    } catch (e) {
      console.warn('IndexedDB unavailable, using localStorage fallback', e);
    }
  }

  async function getMastery() {
    try {
      const data = await getIDB('srs_mastery');
      if (data) return data;
    } catch (e) {}
    try { return JSON.parse(localStorage.getItem(LS_SRS) || '{}'); }
    catch { return {}; }
  }

  async function saveMastery(m) {
    try { await setIDB('srs_mastery', m); } catch (e) {}
    try { localStorage.setItem(LS_SRS, JSON.stringify(m)); } catch (e) {}
  }

  async function getUserWords() {
    try {
      const data = await getIDB('user_words');
      if (data) return data;
    } catch (e) {}
    try { return JSON.parse(localStorage.getItem(LS_WORDS) || '[]'); }
    catch { return []; }
  }

  async function saveUserWords(w) {
    try { await setIDB('user_words', w); } catch (e) {}
    try { localStorage.setItem(LS_WORDS, JSON.stringify(w)); } catch (e) {}
  }

  async function exportJSON() {
    const m = await getMastery();
    const uw = await getUserWords();
    const total = Object.keys(m).length;
    const mastered = Object.values(m).filter(v => v.b >= 5).length;
    const blob = new Blob([JSON.stringify({
      version: 1,
      app: 'jack-review-korean',
      exported: new Date().toISOString(),
      stats: { total, mastered, userWords: uw.length },
      progress: m,
      userWords: uw
    }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'jack-review-progress-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const data = JSON.parse(reader.result);
          if (!data.progress || data.app !== 'jack-review-korean') {
            reject(new Error('Invalid backup file'));
            return;
          }
          const current = await getMastery();
          const imported = data.progress;
          const merged = { ...current };
          for (const [k, v] of Object.entries(imported)) {
            if (!merged[k] || (v.b || 0) > (merged[k].b || 0)) {
              merged[k] = v;
            }
          }
          await saveMastery(merged);
          // Merge user words too
          if (data.userWords && data.userWords.length) {
            const curWords = await getUserWords();
            const existing = new Set(curWords.map(w => w.kr));
            const newWords = data.userWords.filter(w => !existing.has(w.kr));
            await saveUserWords([...curWords, ...newWords]);
          }
          resolve(Object.keys(imported).length);
        } catch (e) { reject(e); }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  async function clearAll() {
    await saveMastery({});
    await saveUserWords([]);
  }

  return { init, getMastery, saveMastery, getUserWords, saveUserWords, exportJSON, importJSON, clearAll };
})();

