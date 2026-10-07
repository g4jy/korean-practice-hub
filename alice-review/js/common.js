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

  /* --- Exact local Edge audio, never device voices or word splicing. --- */
  let manifestPromise = null;
  async function loadAudioManifest() {
    if (!manifestPromise) {
      manifestPromise = (async () => {
        try {
          const response = await fetch(audioBasePath + 'manifest.json', {cache: 'no-cache'});
          if (!response.ok) return;
          const manifest = await response.json();
          if (manifest.schema_version === 2 && manifest.entries && typeof manifest.entries === 'object') {
            audioManifest = manifest.entries;
          } else if (manifest.schema_version === 3) {
            if (!Array.isArray(manifest.parts) || !manifest.parts.length || manifest.parts.length > 64 ||
                !Number.isSafeInteger(manifest.entry_count) || manifest.entry_count < 1 ||
                !/^[a-f0-9]{64}$/.test(manifest.entries_sha256)) throw new Error('Invalid audio manifest index');
            const names = new Set();
            const parts = await Promise.all(manifest.parts.map(async part => {
              if (!/^manifest-part-[0-9]{2}-[a-f0-9]{64}\.json$/.test(part.file) ||
                  !/^[a-f0-9]{64}$/.test(part.sha256) || !part.file.endsWith('-' + part.sha256 + '.json') ||
                  !Number.isSafeInteger(part.entry_count) || part.entry_count < 1 || names.has(part.file)) throw new Error('Invalid audio manifest part');
              names.add(part.file);
              const shardResponse = await fetch(audioBasePath + part.file, {cache: 'force-cache'});
              if (!shardResponse.ok) throw new Error('Missing audio manifest part');
              const bytes = await shardResponse.arrayBuffer();
              if (bytes.byteLength > 250 * 1024 || await audioSHA256(bytes) !== part.sha256) throw new Error('Audio manifest checksum mismatch');
              const shard = JSON.parse(new TextDecoder().decode(bytes));
              if (shard.schema_version !== 1 || !shard.entries || typeof shard.entries !== 'object' ||
                  Array.isArray(shard.entries) || Object.keys(shard.entries).length !== part.entry_count) throw new Error('Invalid audio manifest part data');
              return shard.entries;
            }));
            const entries = Object.create(null);
            for (const part of parts) for (const [text, entry] of Object.entries(part)) {
              if (Object.hasOwn(entries, text)) throw new Error('Duplicate audio manifest entry');
              entries[text] = entry;
            }
            if (Object.keys(entries).length !== manifest.entry_count ||
                await audioSHA256(JSON.stringify(entries)) !== manifest.entries_sha256) throw new Error('Incomplete audio manifest');
            audioManifest = entries;
          }
        } catch (_) { /* Missing or legacy evidence is unavailable. */ }
      })();
    }
    return manifestPromise;
  }

  let currentSpeakAudio = null;
  let currentAudioURL = null;
  let speakRequest = 0;

  function stopAudio() {
    if (currentSpeakAudio) {
      currentSpeakAudio.onended = null;
      currentSpeakAudio.onerror = null;
      currentSpeakAudio.pause();
      currentSpeakAudio = null;
    }
    if (currentAudioURL) { URL.revokeObjectURL(currentAudioURL); currentAudioURL = null; }
  }

  async function audioSHA256(value) {
    const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
  }

  // Storage packs preserve exact MP3/provenance bytes; they never join spoken segments.
  const bundleCache = new Map();
  async function audioFileBytes(entry, name) {
    if (!entry.bundle) {
      const response = await fetch(audioBasePath + name, {cache: 'no-cache'});
      if (!response.ok) throw new Error('Missing audio file');
      return response.arrayBuffer();
    }
    if (!/^pack-[a-zA-Z0-9_-]+\.json$/.test(entry.bundle) || !/^[a-f0-9]{64}$/.test(entry.bundle_sha256)) throw new Error('Invalid audio pack');
    const cacheKey = entry.bundle + ':' + entry.bundle_sha256;
    if (!bundleCache.has(cacheKey)) {
      const pending = (async () => {
        const response = await fetch(audioBasePath + entry.bundle, {cache: 'force-cache'});
        if (!response.ok) throw new Error('Missing audio pack');
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength > 2 * 1024 * 1024 || await audioSHA256(bytes) !== entry.bundle_sha256) throw new Error('Audio pack checksum mismatch');
        const pack = JSON.parse(new TextDecoder().decode(bytes));
        if (pack.schema_version !== 1 || pack.encoding !== 'base64' || !pack.files || typeof pack.files !== 'object' || Array.isArray(pack.files)) throw new Error('Invalid audio pack data');
        return pack.files;
      })();
      bundleCache.set(cacheKey, pending);
      while (bundleCache.size > 8) bundleCache.delete(bundleCache.keys().next().value);
      pending.catch(() => { if (bundleCache.get(cacheKey) === pending) bundleCache.delete(cacheKey); });
    }
    const pending = bundleCache.get(cacheKey);
    bundleCache.delete(cacheKey); bundleCache.set(cacheKey, pending);
    const files = await pending, encoded = Object.hasOwn(files, name) ? files[name] : null;
    if (typeof encoded !== 'string' || encoded.length > 2 * 1024 * 1024 || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('Missing packed audio file');
    const binary = atob(encoded), bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function verifiedAudio(text) {
    const entry = audioManifest && Object.hasOwn(audioManifest, text) ? audioManifest[text] : null;
    if (!entry || entry.text !== text || entry.text_sha256 !== await audioSHA256(text)) throw new Error('Missing exact audio');
    const key = entry.request_sha256;
    if (!/^[a-f0-9]{64}$/.test(key) || !/^[a-zA-Z0-9_-]+\.mp3$/.test(entry.file) || entry.receipt !== key + '.provenance.json') throw new Error('Invalid audio path');
    const proofBytes = await audioFileBytes(entry, entry.receipt);
    if (await audioSHA256(proofBytes) !== entry.receipt_sha256) throw new Error('Provenance checksum mismatch');
    const proof = JSON.parse(new TextDecoder().decode(proofBytes));
    if (proof.schema_version !== 1 || proof.provider !== 'edge-tts' || proof.reviewed_public !== true ||
        !/^[a-f0-9]{64}$/.test(proof.generator_sha256)) throw new Error('Unverified source');
    if (proof.source_kind === 'repository_lineage') {
      // Inherited assets have source-code/blob lineage, not new service receipts.
      if (!/^[a-f0-9]{40}$/.test(proof.source_commit) || proof.original_audio_sha256 !== entry.audio_sha256 ||
          proof.original_text !== text || proof.original_file !== entry.file ||
          !/^[a-f0-9]{64}$/.test(proof.source_manifest_sha256) || !(proof.duration_seconds > 0)) throw new Error('Invalid inherited evidence');
    } else if (proof.source_kind !== 'edge_generation' || entry.file !== key + '.mp3' ||
               !proof.client_version || !proof.generated_at) throw new Error('Invalid generation evidence');
    for (const field of ['text', 'text_sha256', 'request_sha256', 'file', 'audio_sha256']) {
      if (proof[field] !== entry[field]) throw new Error('Provenance mismatch');
    }
    if (proof.voice !== 'ko-KR-SunHiNeural' || proof.rate !== '+0%' || proof.volume !== '+0%' || proof.pitch !== '+0Hz') throw new Error('Unsupported settings');
    const request = ['edge-tts', proof.voice, proof.rate, proof.volume, proof.pitch, text];
    if (await audioSHA256(JSON.stringify(request)) !== key) throw new Error('Request mismatch');
    const bytes = await audioFileBytes(entry, entry.file);
    if (!bytes.byteLength || await audioSHA256(bytes) !== entry.audio_sha256) throw new Error('Audio checksum mismatch');
    return new Blob([bytes], {type: 'audio/mpeg'});
  }

  async function speak(text) {
    const request = ++speakRequest;
    stopAudio();
    try {
      if (typeof text !== 'string' || !text.length) throw new Error('Empty audio');
      await loadAudioManifest();
      const blob = await verifiedAudio(text);
      if (request !== speakRequest) return {status: 'cancelled'};
      currentAudioURL = URL.createObjectURL(blob);
      const audio = new Audio(currentAudioURL);
      currentSpeakAudio = audio;
      audio.onended = () => { if (request === speakRequest) stopAudio(); };
      audio.onerror = () => {
        if (request === speakRequest) { stopAudio(); showToast('Exact audio unavailable for this text.'); }
      };
      await audio.play();
      return {status: request === speakRequest ? 'playing' : 'cancelled'};
    } catch (_) {
      if (request !== speakRequest) return {status: 'cancelled'};
      stopAudio();
      showToast('Exact audio unavailable for this text.');
      return {status: 'unavailable'};
    }
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
    const stored = localStorage.getItem('alice-review:showRom');
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
      localStorage.setItem('alice-review:showRom', !hidden);
    });
  }

  /* --- English Toggle --- */
  function initEnToggle() {
    const btn = document.getElementById('toggle-en');
    if (!btn) return;
    const stored = localStorage.getItem('alice-review:showEn');
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
      localStorage.setItem('alice-review:showEn', !hidden);
    });
  }

  /* --- Local-only response history shared across every study mode --- */
  const WEBHOOK_URL = ''; // No collector is enabled or contacted.
  async function trackResponse(card, status, source) {
    return Storage.rateWord(card, status, source || 'flashcard');
  }
  function flushBatch() { /* Private learner data stays on this device. */ }
  function getWordMastery() { return typeof Storage !== 'undefined' && typeof Storage.cachedMastery === 'function' ? Storage.cachedMastery() : {}; }
  function getWeakWords() {
    return Object.entries(getWordMastery()).filter(([,m]) => m.status === 'dont_know' || m.status === 'unsure').map(([id]) => id);
  }
  async function getResponses() { return (await Storage.snapshot()).history; }
  async function exportResponses() { return Storage.exportJSON(); }
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  /* --- Init --- */
  async function init() {
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
    if (typeof Storage !== 'undefined' && typeof Storage.init === 'function') await Storage.init();
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
    if (typeof Storage !== 'undefined' && typeof Storage.getUserWords === 'function') (await Storage.getUserWords()).forEach(w => add(w, w.category || 'My Words'));
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


