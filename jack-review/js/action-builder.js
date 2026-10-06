/* === Action Sentence Builder === */

(async () => {
  const data = await App.loadVocab();
  const { subjects, times, places, objects, verbs } = data.action;

  const state = {
    subjectIdx: 0,
    timeIdx: 0,
    placeIdx: 0,
    objectIdx: 0,
    verbIdx: 0,
    showTime: false,
    showPlace: false,
    showObject: false,
    showQuestion: false
  };

  const blocks = {
    subject: document.getElementById('block-subject'),
    time: document.getElementById('block-time'),
    place: document.getElementById('block-place'),
    object: document.getElementById('block-object'),
    verb: document.getElementById('block-verb')
  };

  const subjectSelect = document.getElementById('subject-select');
  const verbSelect = document.getElementById('verb-select');
  subjects.forEach((s, i) => { const option = document.createElement('option'); option.value = i; option.textContent = s.kr + ' · ' + s.en; subjectSelect.appendChild(option); });
  verbs.forEach((v, i) => { const option = document.createElement('option'); option.value = i; option.textContent = v.present + ' · ' + v.en; verbSelect.appendChild(option); });
  subjectSelect.addEventListener('change', () => { state.subjectIdx = Number(subjectSelect.value); update(); });
  verbSelect.addEventListener('change', () => { state.verbIdx = Number(verbSelect.value); update(); });
  blocks.subject.addEventListener('keydown', event => { if (event.target !== blocks.subject) return; if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); blocks.subject.click(); } });

  /* --- Get current tense from time selection (default present) --- */
  function currentTense() {
    if (!state.showTime) return 'present';
    return times[state.timeIdx].tense || 'present';
  }

  /* --- Get current verb --- */
  function currentVerb() {
    return verbs[state.verbIdx];
  }

  /* --- Filter objects compatible with current verb --- */
  function compatibleObjects() {
    const verb = currentVerb();
    // New format: explicit compatible objects list
    if (verb.compatibleObjects && verb.compatibleObjects.length > 0) {
      return objects.filter(o => verb.compatibleObjects.includes(o.kr + App.particleEulReul(o.kr)));
    }
    // Legacy format: objectTypes category matching
    if (!verb.objectTypes || verb.objectTypes.length === 0) return [];
    return objects.filter(o => verb.objectTypes.includes(o.category));
  }

  /* --- Get place particle based on verb --- */
  function placeParticle(place) {
    const verb = currentVerb();
    return verb.placeParticle === 'e' ? place.formE : place.formEseo;
  }

  /* --- Get verb conjugation for current tense --- */
  function conjugatedVerb() {
    const verb = currentVerb();
    const tense = currentTense();
    return {
      kr: verb[tense],
      rom: verb[tense + 'Rom'],
      en: verb[tense + 'En'] || verb.en
    };
  }

  // English agreement follows the selected subject; Korean polite forms stay unchanged.
  function englishVerb(phrase, subject) {
    if (currentTense() !== 'present' || subject.person !== 3 || subject.plural) return phrase;
    const parts = phrase.split(' '), base = parts[0];
    const irregular = {be: 'is', have: 'has', do: 'does', go: 'goes'};
    parts[0] = irregular[base] || (/[^aeiou]y$/.test(base) ? base.slice(0, -1) + 'ies' : /(?:s|x|z|ch|sh)$/.test(base) ? base + 'es' : base + 's');
    return parts.join(' ');
  }

  /* --- Render a block --- */
  function renderBlock(blockEl, kr, rom, en) {
    blockEl.querySelector('.block-kr').textContent = kr;
    blockEl.querySelector('.block-rom').textContent = rom;
    blockEl.querySelector('.block-en').textContent = en;
  }

  /* --- Update all blocks --- */
  function update() {
    const subj = subjects[state.subjectIdx];
    const conj = conjugatedVerb();
    if (compatibleObjects().length === 0) state.showQuestion = false;
    subjectSelect.value = state.subjectIdx; verbSelect.value = state.verbIdx;

    renderBlock(blocks.subject, subj.kr, subj.rom, subj.en);
    renderBlock(blocks.verb, conj.kr, conj.rom, conj.en);

    // Time (optional)
    if (state.showTime && !state.showQuestion) {
      const time = times[state.timeIdx];
      renderBlock(blocks.time, time.kr, time.rom, time.en);
      blocks.time.classList.remove('hidden');
    } else {
      blocks.time.classList.add('hidden');
    }

    // Place (optional)
    if (state.showPlace && !state.showQuestion) {
      const place = places[state.placeIdx];
      const pForm = placeParticle(place);
      renderBlock(blocks.place, pForm.kr, pForm.rom, place.en);
      blocks.place.classList.remove('hidden');
    } else {
      blocks.place.classList.add('hidden');
    }

    // Object (optional, and depends on verb compatibility)
    const compat = compatibleObjects();
    if (state.showQuestion) {
      renderBlock(blocks.object, '무엇을', 'MU-EO-SEUL', 'what');
      blocks.object.classList.remove('hidden');
    } else if (state.showObject && compat.length > 0) {
      if (state.objectIdx >= compat.length) state.objectIdx = 0;
      const obj = compat[state.objectIdx];
      const particle = App.particleEulReul(obj.kr);
      renderBlock(blocks.object, obj.kr + particle, obj.rom, obj.en);
      blocks.object.classList.remove('hidden');
    } else {
      blocks.object.classList.add('hidden');
    }

    updateSentence();
    updateToggleButtons();
  }

  /* --- Build and display full sentence --- */
  function updateSentence() {
    const subj = subjects[state.subjectIdx];
    const conj = conjugatedVerb();
    const verb = currentVerb();
    const compat = compatibleObjects();

    if (state.showQuestion) {
      document.getElementById('full-sentence').textContent = subj.kr + ' 무엇을 ' + conj.kr + '?';
      const auxiliary = subj.person === 3 && !subj.plural ? 'does' : 'do';
      document.getElementById('translation').textContent = 'What ' + auxiliary + ' ' + (subj.en === 'I' ? 'I' : subj.en.toLowerCase()) + ' ' + conj.en + '?';
      return;
    }

    let krParts = [subj.kr];
    let enParts = [subj.en];

    if (state.showTime && !state.showQuestion) {
      const time = times[state.timeIdx];
      krParts.push(time.kr);
      enParts.push(time.en + ',');
    }

    if (state.showPlace && !state.showQuestion) {
      const place = places[state.placeIdx];
      const pForm = placeParticle(place);
      krParts.push(pForm.kr);
      const prep = verb.placeParticle === 'e' ? 'to' : 'at';
      enParts.push(prep + ' ' + place.en + ',');
    }

    if (state.showObject && compat.length > 0) {
      const obj = compat[state.objectIdx] || compat[0];
      const particle = App.particleEulReul(obj.kr);
      krParts.push(obj.kr + particle);
      enParts.push(obj.en);
    }

    krParts.push(conj.kr);
    enParts.push(englishVerb(conj.en, subj));

    document.getElementById('full-sentence').textContent = krParts.join(' ');
    document.getElementById('translation').textContent = enParts.join(' ');
  }

  /* --- Toggle button state --- */
  function updateToggleButtons() {
    const btns = document.querySelectorAll('.element-toggle');
    btns.forEach(btn => {
      const el = btn.dataset.element;
      const active = state['show' + el.charAt(0).toUpperCase() + el.slice(1)];
      btn.classList.toggle('active', active);
      const label = el.charAt(0).toUpperCase() + el.slice(1);

      if (el === 'question') {
        btn.disabled = compatibleObjects().length === 0;
        btn.textContent = state.showQuestion ? '− What question' : '+ What question';
        return;
      }
      if (state.showQuestion) { btn.disabled = true; btn.classList.remove('active'); btn.textContent = '+ ' + label; return; }
      btn.disabled = false;
      // Disable object toggle if verb has no compatible objects
      if (el === 'object') {
        const compat = compatibleObjects();
        if (compat.length === 0) {
          btn.disabled = true;
          btn.classList.remove('active');
          btn.innerHTML = (active ? '- ' : '+ ') + label + ' <small>(N/A)</small>';
          return;
        }
        btn.disabled = false;
      }

      btn.textContent = (active ? '- ' : '+ ') + label;
    });
  }

  /* --- Block click handlers --- */
  blocks.subject.addEventListener('click', () => {
    state.subjectIdx = (state.subjectIdx + 1) % subjects.length;
    App.pulseBlock(blocks.subject);
    update();
  });

  blocks.time.addEventListener('click', () => {
    state.timeIdx = (state.timeIdx + 1) % times.length;
    App.pulseBlock(blocks.time);
    update();
  });

  blocks.place.addEventListener('click', () => {
    state.placeIdx = (state.placeIdx + 1) % places.length;
    App.pulseBlock(blocks.place);
    update();
  });

  blocks.object.addEventListener('click', () => {
    if (state.showQuestion) return;
    const compat = compatibleObjects();
    if (compat.length === 0) return;
    state.objectIdx = (state.objectIdx + 1) % compat.length;
    App.pulseBlock(blocks.object);
    update();
  });

  blocks.verb.addEventListener('click', () => {
    state.verbIdx = (state.verbIdx + 1) % verbs.length;
    App.pulseBlock(blocks.verb);
    update();
  });

  /* --- Add TTS buttons to blocks --- */
  function addTtsBtn(blockEl) {
    const btn = document.createElement('button');
    btn.className = 'block-tts-btn';
    btn.innerHTML = '<svg viewBox="0 0 24 24"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><path d="M15.54 8.46a5 5 0 010 7.07" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="1.5" stroke-linecap="round"/></svg>';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const kr = blockEl.querySelector('.block-kr').textContent;
      App.speak(kr);
    });
    blockEl.appendChild(btn);
  }

  Object.values(blocks).forEach(addTtsBtn);

  /* --- Element toggle buttons --- */
  document.querySelectorAll('.element-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const el = btn.dataset.element;
      const key = 'show' + el.charAt(0).toUpperCase() + el.slice(1);
      state[key] = !state[key];
      update();
    });
  });

  /* --- Speak full sentence --- */
  document.getElementById('speak-btn').addEventListener('click', () => {
    const sentence = document.getElementById('full-sentence').textContent;
    const subject = subjects[state.subjectIdx].kr;
    const predicate = sentence.slice(subject.length).trim();
    if (App.speakSentence) App.speakSentence([subject, predicate]); else App.speak(sentence);
  });

  /* --- Initial render --- */
  update();
})();

