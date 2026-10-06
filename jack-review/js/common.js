/* === Korean Practice — Common Utilities === */

const App = (() => {
  let vocabData = null;
  let audioManifest = null;
  const audioBasePath = 'audio/tts/';

  /* --- Data Loading --- */
  async function loadVocab() {
    if (vocabData) return vocabData;
    const resp = await fetch('data/vocab.json');
    vocabData = await resp.json();
    return vocabData;
  }

  /* --- TTS with Pre-generated Audio + Web Speech API Fallback --- */
  async function loadAudioManifest() {
    try {
      const resp = await fetch(audioBasePath + 'manifest.json');
      if (resp.ok) {
        audioManifest = await resp.json();
        console.log(`Loaded ${Object.keys(audioManifest).length} audio files`);
      }
    } catch (e) {
      console.log('No pre-generated audio, using Web Speech API');
    }
  }

  let currentSpeakAudio = null;

  function speak(text) {
    // Stop any previous playback
    if (currentSpeakAudio) { currentSpeakAudio.pause(); currentSpeakAudio = null; }
    speechSynthesis.cancel();

    // Exact match in manifest
    if (audioManifest && audioManifest[text]) {
      const audio = new Audio(audioBasePath + audioManifest[text]);
      currentSpeakAudio = audio;
      audio.play().catch(() => speakWebAPI(text));
      return;
    }

    // For sentences: try sequential word playback from manifest
    if (audioManifest && text.includes(' ')) {
      const words = text.split(/\s+/);
      const audioWords = words.filter(w => audioManifest[w]);
      // Use sequential playback if >50% of words have audio
      if (audioWords.length > words.length * 0.5) {
        speakSequential(words, 0);
        return;
      }
    }

    speakWebAPI(text);
  }

  function speakSequential(words, idx) {
    if (idx >= words.length) return;
    const word = words[idx];
    if (audioManifest && audioManifest[word]) {
      const audio = new Audio(audioBasePath + audioManifest[word]);
      currentSpeakAudio = audio;
      audio.onended = () => speakSequential(words, idx + 1);
      audio.play().catch(() => {
        speakWebAPI(word);
        setTimeout(() => speakSequential(words, idx + 1), 600);
      });
    } else {
      speakWebAPI(word);
      setTimeout(() => speakSequential(words, idx + 1), 600);
    }
  }

  function speakWebAPI(text) {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'ko-KR';
    utter.rate = 0.85;
    const voices = speechSynthesis.getVoices();
    const ko = voices.find(v => v.lang.startsWith('ko'));
    if (ko) utter.voice = ko;
    speechSynthesis.speak(utter);
  }

  /* --- Korean Particle Helpers --- */
  function hasJongseong(char) {
    if (!char) return false;
    const code = char.charCodeAt(0);
    if (code < 0xAC00 || code > 0xD7AF) return false;
    return (code - 0xAC00) % 28 !== 0;
  }

  function particleIGa(word) {
    return hasJongseong(word[word.length - 1]) ? '이' : '가';
  }

  function particleEulReul(word) {
    return hasJongseong(word[word.length - 1]) ? '을' : '를';
  }

  /* --- Block Animation --- */
  function pulseBlock(el) {
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
  }

  /* --- Romanization Toggle --- */
  function initRomToggle() {
    if (document.getElementById('vocab-tabs')) return; // Vocabulary owns this toggle.
    const btn = document.getElementById('toggle-rom');
    if (!btn) return;
    const stored = localStorage.getItem('jack-review:showRom');
    if (stored === 'false') {
      document.body.classList.add('hide-rom');
      btn.textContent = 'Aa Show Romanization';
      btn.classList.remove('active');
    } else {
      btn.classList.add('active');
    }
    btn.addEventListener('click', () => {
      const hidden = document.body.classList.toggle('hide-rom');
      btn.textContent = hidden ? 'Aa Show Romanization' : 'Aa Hide Romanization';
      btn.classList.toggle('active', !hidden);
      localStorage.setItem('jack-review:showRom', !hidden);
    });
  }

  /* --- English Toggle --- */
  function initEnToggle() {
    const btn = document.getElementById('toggle-en');
    if (!btn) return;
    const stored = localStorage.getItem('jack-review:showEn');
    if (stored === 'false') {
      document.body.classList.add('hide-en');
      btn.textContent = 'EN Show English';
      btn.classList.remove('active');
    } else {
      btn.classList.add('active');
    }
    btn.addEventListener('click', () => {
      const hidden = document.body.classList.toggle('hide-en');
      btn.textContent = hidden ? 'EN Show English' : 'EN Hide English';
      btn.classList.toggle('active', !hidden);
      localStorage.setItem('jack-review:showEn', !hidden);
    });
  }

  /* --- Response Tracking (Batch Mode) --- */
  const WEBHOOK_URL = ''; // Teacher sync is disabled until its destination is verified.
  const STORAGE_KEY = 'jack-review:koreanPracticeResponses';
  const PENDING_KEY = 'jack-review:koreanPracticePending';
  const MASTERY_KEY = 'jack-review:koreanPracticeMastery';
  let studentName = '';
  let sessionId = Date.now().toString(36);

  function trackResponse(kr, en, status, category, source) {
    if (!studentName && vocabData) studentName = vocabData.student || '';
    const entry = {
      timestamp: new Date().toISOString(),
      student: studentName,
      word_kr: kr,
      word_en: en,
      status: status,
      category: category || '',
      source: source || 'flashcard',
      session_id: sessionId
    };

    // Save to full history
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    stored.push(entry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    // Add to pending batch queue
    const pending = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
    pending.push(entry);
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));

    // Update mastery
    updateMastery(kr, status);

    // Flush if pending > 20
    if (pending.length >= 20) flushBatch();
  }

  function flushBatch() {
    if (!WEBHOOK_URL) return;
    const pending = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
    if (pending.length === 0) return;

    // Try sendBeacon first (works during page unload)
    if (navigator.sendBeacon) {
      const sent = navigator.sendBeacon(WEBHOOK_URL, JSON.stringify(pending));
      if (sent) {
        localStorage.setItem(PENDING_KEY, '[]');
        return;
      }
    }

    // Fallback to fetch
    fetch(WEBHOOK_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(pending)
    }).then(() => {
      localStorage.setItem(PENDING_KEY, '[]');
    }).catch(() => { /* keep pending for retry */ });
  }

  // Auto-flush triggers
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushBatch();
  });
  window.addEventListener('beforeunload', () => flushBatch());
  setInterval(flushBatch, 5 * 60 * 1000); // every 5 minutes

  /* --- Mastery API --- */
  function updateMastery(kr, status) {
    const mastery = JSON.parse(localStorage.getItem(MASTERY_KEY) || '{}');
    const prev = mastery[kr] || { status: null, count: 0, lastSeen: null };
    mastery[kr] = {
      status: status,
      count: prev.count + 1,
      lastSeen: new Date().toISOString()
    };
    localStorage.setItem(MASTERY_KEY, JSON.stringify(mastery));
  }

  function getWordMastery() {
    return JSON.parse(localStorage.getItem(MASTERY_KEY) || '{}');
  }

  function getWeakWords() {
    const mastery = getWordMastery();
    return Object.keys(mastery).filter(kr =>
      mastery[kr].status === 'dont_know' || mastery[kr].status === 'unsure'
    );
  }

  function getResponses() {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  }

  function exportResponses() {
    const data = getResponses();
    if (data.length === 0) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (studentName || 'student') + '_responses_' + new Date().toISOString().slice(0,10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  /* --- Init --- */
  async function init() {
    if ('speechSynthesis' in window) {
      speechSynthesis.getVoices();
    }
    await loadAudioManifest();
    initRomToggle();
    initEnToggle();
    // Pre-load student name
    try {
      const d = await loadVocab();
      studentName = d.student || '';
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* --- Build Card Pool (for Learn/Quiz pages) --- */
  async function buildCardPool() {
    const data = await loadVocab();
    const pool = [];
    const cats = new Map();
    const seen = new Set();
    function catMap(c) {
      return { food: 'Food & Drink', drink: 'Food & Drink', weather: 'Weather',
        activity: 'Activities', person: 'People', thing: 'Objects' }[c] || 'Other';
    }
    function add(kr, rom, en, cat) {
      if (!kr || seen.has(kr)) return;
      seen.add(kr);
      const card = { kr, rom: rom || '', en: en || '', category: cat };
      pool.push(card);
      if (!cats.has(cat)) cats.set(cat, []);
      cats.get(cat).push(card);
    }
    if (!data.flashcards?.exclusive) {
    const a = data.action || {};
    (a.times || []).forEach(t => add(t.kr, t.rom, t.en, 'Time'));
    (a.places || []).forEach(p => add(p.kr, p.rom, p.en, 'Places'));
    (a.objects || []).forEach(o => add(o.kr, o.rom, o.en, catMap(o.category)));
    (a.verbs || []).forEach(v => {
      add(v.present, v.presentRom, v.en + ' (present)', 'Verbs');
      add(v.past, v.pastRom, v.pastEn + ' (past)', 'Verbs');
      add(v.future, v.futureRom, v.futureEn + ' (future)', 'Verbs');
    });
    const d = data.describe || {};
    (d.subjects || []).forEach(s => add(s.kr, s.rom, s.en, catMap(s.category)));
    (d.adjectives || []).forEach(x => add(x.kr, x.rom, x.en, 'Adjectives'));
    (d.adverbs || []).forEach(x => add(x.kr, x.rom, x.en, 'Adverbs'));
    }
    const fc = data.flashcards || {};
    (fc.categories || []).forEach(cat => {
      (cat.cards || []).forEach(c => add(c.kr, c.rom, c.en, cat.name));
    });
    if (typeof Storage !== 'undefined' && Storage.getUserWords) {
      try { (await Storage.getUserWords()).forEach(w => add(w.kr, w.rom, w.en, w.category || 'My Words')); } catch(e) {}
    }
    return { allCards: pool, categories: cats };
  }

  /* --- Toast --- */
  function showToast(msg) {
    let t = document.getElementById('app-toast');
    if (!t) { t = document.createElement('div'); t.id = 'app-toast'; t.className = 'app-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
  }

  return {
    loadVocab,
    speak,
    hasJongseong,
    particleIGa,
    particleEulReul,
    pulseBlock,
    trackResponse,
    getResponses,
    exportResponses,
    getWordMastery,
    getWeakWords,
    flushBatch,
    buildCardPool,
    showToast
  };
})();

