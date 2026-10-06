/* === Korean Practice — Common Utilities === */

const App = (() => {
  let vocabData = null;
  let audioManifest = null;
  const audioBasePath = 'audio/tts/';

  /* --- Data Loading --- */
  async function loadVocab() {
    if (vocabData) return vocabData;
    const resp = await fetch('data/vocab.json', {cache: 'no-cache'});
    if (!resp.ok) throw new Error('Vocabulary could not be loaded');
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

  /* --- Local-only response history shared across every study mode --- */
  const WEBHOOK_URL = ''; // No collector is enabled or contacted.
  async function trackResponse(card, status, source) {
    return Storage.rateWord(card, status, source || 'flashcard');
  }
  function flushBatch() { /* Private learner data stays on this device. */ }
  function getWordMastery() { return typeof Storage !== 'undefined' ? Storage.cachedMastery() : {}; }
  function getWeakWords() {
    return Object.entries(getWordMastery()).filter(([,m]) => m.status === 'dont_know' || m.status === 'unsure').map(([id]) => id);
  }
  async function getResponses() { return (await Storage.snapshot()).history; }
  async function exportResponses() { return Storage.exportJSON(); }
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

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
      // Dataset loaded for this page.
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
    if (typeof Storage !== 'undefined') await Storage.init();
    const byId = new Map();
    function add(word, category) {
      if (!word.kr) return;
      const id = word.id || 'ko:' + encodeURIComponent(word.kr.normalize('NFC').trim());
      byId.set(id, {...(byId.get(id) || {}), ...word, id, rom: word.rom || '', en: word.en || '', category: category || word.category || 'Other'});
    }
    if (!data.flashcards?.exclusive) {
      const a = data.action || {}, d = data.describe || {};
      (a.times || []).forEach(w => add(w, 'Time'));
      (a.places || []).forEach(w => add(w, 'Places'));
      (a.objects || []).forEach(w => add(w, w.category));
      (a.verbs || []).forEach(v => ['present','past','future'].forEach(t => add({kr:v[t],rom:v[t+'Rom'],en:v.en}, 'Verbs')));
      (d.subjects || []).forEach(w => add(w, w.category));
      (d.adjectives || []).forEach(w => add(w, 'Adjectives'));
      (d.adverbs || []).forEach(w => add(w, 'Adverbs'));
    }
    (data.flashcards?.categories || []).forEach(cat => (cat.cards || []).forEach(w => add(w, cat.name)));
    if (typeof Storage !== 'undefined') (await Storage.getUserWords()).forEach(w => add(w, w.category || 'My Words'));
    const allCards = [...byId.values()], categories = new Map();
    for (const c of allCards) { if (!categories.has(c.category)) categories.set(c.category, []); categories.get(c.category).push(c); }
    return {allCards, categories};
  }

  /* --- Toast --- */
  function showToast(msg) {
    let t = document.getElementById('app-toast');
    if (!t) { t = document.createElement('div'); t.id = 'app-toast'; t.className = 'app-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
  }

  return {
    escapeHTML,
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

