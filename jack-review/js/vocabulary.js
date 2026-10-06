/* === Integrated Vocabulary Page — Words / Practice / Quiz === */
(async () => {
  await Storage.init();
  const vocabData = await App.loadVocab();
  const { allCards, categories } = await App.buildCardPool();

  // Build polite form lookup from vocab data (다 → 요 mapping)
  const politeMap = {};
  (vocabData.action && vocabData.action.verbs || []).forEach(v => {
    // Map dictionary forms to present polite form
    const dict = v.id; // e.g. "gada"
    if (v.present) {
      // Find matching flashcard by English or by checking conjugation patterns
      allCards.forEach(c => {
        if (c.category === 'Verbs' && c.en === v.en + ' (present)') {
          // This card IS the polite form already
        }
      });
      // Store by present form's base: try to find dictionary form in flashcards
      if (v.present && v.past) {
        // We know the dictionary stem; store lookup
        politeMap[v.en] = v.present;
      }
    }
  });
  // Direct kr → polite mapping for verbs we can identify
  const verbPolite = {};
  (vocabData.action && vocabData.action.verbs || []).forEach(v => {
    if (v.present) {
      // Try to find a flashcard with this verb's dictionary form
      allCards.forEach(c => {
        if (c.en && v.en && c.en.toLowerCase().replace('to ', '') === v.en.toLowerCase() && c.category === 'Verbs') {
          verbPolite[c.kr] = v.present;
        }
      });
    }
  });
  // For adjectives from describe data
  const adjPolite = {};
  (vocabData.describe && vocabData.describe.adjectives || []).forEach(a => {
    // describe adjectives kr IS the polite form (e.g. 맛있어요)
    // find matching flashcard by English
    allCards.forEach(c => {
      if (c.category === 'Adjectives' && c.en && a.en && c.en.toLowerCase() === a.en.toLowerCase()) {
        if (c.kr !== a.kr) adjPolite[c.kr] = a.kr;
      }
    });
  });

  // Use the polite forms from Jack's reviewed lesson content.
  const reviewedPolite = new Map((vocabData.flashcards?.categories || []).flatMap(cat => cat.cards || []).map(c => [c.kr, c.polite]));

  // Merge polite forms into cards
  allCards.forEach(c => {
    if (reviewedPolite.get(c.kr)) c.polite = reviewedPolite.get(c.kr);
    if (verbPolite[c.kr]) c.polite = verbPolite[c.kr];
    if (adjPolite[c.kr]) c.polite = adjPolite[c.kr];
  });

  // Simple Know/Don't Know model
  let M = await Storage.getMastery();
  const isKnown = kr => M[kr] && M[kr].known === true;
  const $ = id => document.getElementById(id);

  // Romanization toggle
  let showRom = localStorage.getItem('jack-review:vocabShowRom') !== 'false';
  function updateRomBtn() {
    const btn = $('toggle-rom');
    btn.textContent = showRom ? 'Aa Hide Romanization' : 'Aa Show Romanization';
    btn.classList.toggle('active', showRom);
    document.body.classList.toggle('hide-rom', !showRom);
  }
  $('toggle-rom').addEventListener('click', () => {
    showRom = !showRom;
    localStorage.setItem('jack-review:vocabShowRom', showRom);
    updateRomBtn();
  });
  updateRomBtn();

  // ========== TABS ==========
  let activeTab = 'words';
  $('vocab-tabs').addEventListener('click', e => {
    const tab = e.target.closest('.vocab-tab');
    if (!tab) return;
    activeTab = tab.dataset.tab;
    document.querySelectorAll('.vocab-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.vocab-pane').forEach(p => p.classList.remove('active'));
    $('pane-' + activeTab).classList.add('active');
    if (activeTab === 'practice') updatePracticeInfo();
    if (activeTab === 'quiz') updateQuizInfo();
  });

  // ========== STATS ==========
  function updateStats() {
    const knowCount = allCards.filter(c => isKnown(c.kr)).length;
    const dontKnow = allCards.length - knowCount;
    $('vocab-stats').innerHTML =
      '<span class="stat-pill stat-dk">' + dontKnow + ' Don\'t Know</span>' +
      '<span class="stat-pill stat-k">' + knowCount + ' Know</span>' +
      '<span class="stat-pill stat-all">' + allCards.length + ' Total</span>';
  }

  // ========== WORD LIST ==========
  let currentFilter = 'all';
  let currentCatFilter = 'all';
  let searchQuery = '';

  // Build category filter pills for Words tab
  const catFilterEl = $('cat-filter');
  const allCatBtn = document.createElement('button');
  allCatBtn.className = 'filter-btn active'; allCatBtn.dataset.cat = 'all'; allCatBtn.textContent = 'All';
  catFilterEl.appendChild(allCatBtn);
  for (const name of categories.keys()) {
    const btn = document.createElement('button');
    btn.className = 'filter-btn'; btn.dataset.cat = name; btn.textContent = name;
    catFilterEl.appendChild(btn);
  }
  catFilterEl.addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn'); if (!btn) return;
    currentCatFilter = btn.dataset.cat;
    catFilterEl.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderWords();
  });

  document.querySelector('.vocab-filter').addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn'); if (!btn) return;
    currentFilter = btn.dataset.f;
    document.querySelector('.vocab-filter').querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderWords();
  });

  $('search-input').addEventListener('input', e => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderWords();
  });

  function renderWords() {
    let words = [...allCards];
    if (currentCatFilter !== 'all') words = words.filter(c => c.category === currentCatFilter);
    if (currentFilter === 'know') words = words.filter(c => isKnown(c.kr));
    else if (currentFilter === 'dont-know') words = words.filter(c => !isKnown(c.kr));
    if (searchQuery) words = words.filter(c =>
      c.kr.includes(searchQuery) || c.en.toLowerCase().includes(searchQuery) ||
      (c.polite && c.polite.includes(searchQuery)) || c.rom.toLowerCase().includes(searchQuery)
    );

    const list = $('word-list');
    if (!words.length) { list.innerHTML = '<p class="word-empty">No words found</p>'; return; }

    list.innerHTML = words.map(w => {
      const known = isKnown(w.kr);
      const krDisplay = w.polite ? w.kr + ' / ' + w.polite : w.kr;
      return '<div class="word-row">' +
        '<div class="word-info">' +
          '<div class="word-top"><span class="word-kr">' + krDisplay + '</span><span class="word-cat-badge">' + (w.category || '') + '</span></div>' +
          '<span class="word-en">' + w.en + '</span>' +
          (w.rom ? '<span class="word-rom rom-text">' + w.rom + '</span>' : '') +
        '</div>' +
        '<button class="word-toggle ' + (known ? 'known' : '') + '" data-kr="' + w.kr.replace(/"/g, '&quot;') + '">' +
          (known ? '✓' : '✗') +
        '</button>' +
      '</div>';
    }).join('');

    list.querySelectorAll('.word-toggle').forEach(btn => {
      btn.addEventListener('click', async () => {
        const kr = btn.dataset.kr;
        M[kr] = { ...(M[kr] || {}), known: !isKnown(kr) };
        await Storage.saveMastery(M);
        updateStats(); renderWords();
      });
    });
  }

  // ========== STUDY (only Don't Know words) ==========
  let PQ = [], PI = 0, POPEN = false, pKnow = 0;

  function updatePracticeInfo() {
    const dk = allCards.filter(c => !isKnown(c.kr)).length;
    $('practice-info').innerHTML = 'Study your unknown words. Mark ones you now know.<br><b>' + dk + '</b> words to study';
    $('go-practice').textContent = 'Study Don\'t Know (' + dk + ')';
    $('go-practice').disabled = dk === 0;
  }

  $('go-practice').addEventListener('click', () => {
    PQ = allCards.filter(c => !isKnown(c.kr));
    for (let i = PQ.length - 1; i > 0; i--) { const j = Math.random()*i|0; [PQ[i],PQ[j]]=[PQ[j],PQ[i]]; }
    PI = 0; POPEN = false; pKnow = 0;
    $('practice-screen').classList.remove('hidden');
    showPracticeCard();
  });

  const pCard = $('practice-card');

  function showPracticeCard() {
    if (PI >= PQ.length) {
      $('practice-screen').classList.add('hidden');
      $('done-screen').classList.remove('hidden');
      $('done-icon').textContent = '\uD83D\uDCAA';
      $('done-title').textContent = 'Study Done!';
      $('done-desc').textContent = pKnow + ' words moved to Know';
      return;
    }
    POPEN = false;
    pCard.classList.remove('open');
    $('practice-actions').classList.add('hidden');
    const w = PQ[PI];
    const krDisplay = w.polite ? w.kr + ' / ' + w.polite : w.kr;
    $('p-cat').textContent = w.category || '';
    $('p-kr').textContent = krDisplay;
    $('p-en').textContent = w.en;
    $('p-rom').textContent = w.rom || '';
    $('pc').textContent = PI + 1;
    $('pt').textContent = PQ.length;
    App.speak(w.kr);
  }

  pCard.addEventListener('click', () => {
    if (POPEN) return;
    POPEN = true;
    pCard.classList.add('open');
    $('practice-actions').classList.remove('hidden');
  });

  // "Still don't know" → keep as-is, move to next
  $('btn-dont').addEventListener('click', () => { PI++; showPracticeCard(); });
  // "Know now" → promote to Know
  $('btn-know').addEventListener('click', async () => {
    const w = PQ[PI];
    M[w.kr] = { ...(M[w.kr] || {}), known: true };
    await Storage.saveMastery(M);
    pKnow++; PI++; showPracticeCard();
  });

  $('practice-back').addEventListener('click', () => {
    $('practice-screen').classList.add('hidden');
    updateStats(); updatePracticeInfo(); renderWords();
  });

  // Practice keyboard
  document.addEventListener('keydown', e => {
    if ($('practice-screen').classList.contains('hidden')) return;
    if ((e.key === ' ' || e.key === 'Enter') && !POPEN) {
      e.preventDefault(); POPEN = true; pCard.classList.add('open'); $('practice-actions').classList.remove('hidden');
    }
    if (e.key === 'ArrowLeft' && POPEN) $('btn-dont').click();
    if (e.key === 'ArrowRight' && POPEN) $('btn-know').click();
  });

  // ========== QUIZ ==========
  let quizSize = 25;
  let quizFilter = 'all'; // all, dont-know, know
  let quizCat = 'all';
  let RQ = [], RI = 0, RSC = 0, RANS = false, qFlipped = 0;

  // Build quiz category pills
  const qCatEl = $('quiz-cat');
  const qAllBtn = document.createElement('button');
  qAllBtn.className = 'pill active'; qAllBtn.dataset.cat = 'all'; qAllBtn.textContent = 'All';
  qCatEl.appendChild(qAllBtn);
  for (const name of categories.keys()) {
    const btn = document.createElement('button');
    btn.className = 'pill'; btn.dataset.cat = name; btn.textContent = name;
    qCatEl.appendChild(btn);
  }
  qCatEl.addEventListener('click', e => {
    const p = e.target.closest('.pill'); if (!p) return;
    qCatEl.querySelectorAll('.pill').forEach(x => x.classList.remove('active'));
    p.classList.add('active'); quizCat = p.dataset.cat; updateQuizInfo();
  });

  $('quiz-size').addEventListener('click', e => {
    const p = e.target.closest('.pill'); if (!p) return;
    $('quiz-size').querySelectorAll('.pill').forEach(x => x.classList.remove('active'));
    p.classList.add('active'); quizSize = +p.dataset.n; updateQuizInfo();
  });

  $('quiz-filter').addEventListener('click', e => {
    const p = e.target.closest('.pill'); if (!p) return;
    $('quiz-filter').querySelectorAll('.pill').forEach(x => x.classList.remove('active'));
    p.classList.add('active'); quizFilter = p.dataset.f; updateQuizInfo();
  });

  function getQuizPool() {
    let pool = quizCat === 'all' ? [...allCards] : allCards.filter(c => c.category === quizCat);
    if (quizFilter === 'dont-know') pool = pool.filter(c => !isKnown(c.kr));
    else if (quizFilter === 'know') pool = pool.filter(c => isKnown(c.kr));
    return pool;
  }

  function updateQuizInfo() {
    const pool = getQuizPool();
    $('go-quiz').textContent = 'Start Quiz (' + pool.length + ' words)';
    $('go-quiz').disabled = pool.length < 4;
  }

  $('go-quiz').addEventListener('click', () => {
    let p = getQuizPool();
    if (p.length < 4) return;
    for (let i = p.length-1; i > 0; i--) { const j = Math.random()*i|0; [p[i],p[j]]=[p[j],p[i]]; }
    RQ = quizSize > 0 ? p.slice(0, quizSize) : p;
    RI = 0; RSC = 0; qFlipped = 0;
    $('quiz-screen').classList.remove('hidden');
    showQuiz();
  });

  function showQuiz() {
    if (RI >= RQ.length) {
      $('quiz-screen').classList.add('hidden');
      $('done-screen').classList.remove('hidden');
      const p = RQ.length ? Math.round(RSC/RQ.length*100) : 0;
      $('done-icon').textContent = p >= 80 ? '\uD83C\uDFC6' : '\uD83D\uDCD6';
      $('done-title').textContent = RSC + '/' + RQ.length + ' correct (' + p + '%)';
      $('done-desc').textContent = qFlipped + ' words changed status';
      return;
    }
    RANS = false;
    const w = RQ[RI];
    $('quiz-word').textContent = w.en;
    $('qc').textContent = RI + 1;
    $('qt').textContent = RQ.length;
    $('quiz-sc').textContent = RSC;
    $('quiz-tot').textContent = RI;

    // Distractors from same category if possible
    const catPool = getQuizPool().filter(x => x.kr !== w.kr && x.en !== w.en);
    const fallback = allCards.filter(x => x.kr !== w.kr && x.en !== w.en);
    let src = catPool.length >= 3 ? [...catPool] : [...fallback];
    const opts = [w];
    while (opts.length < 4 && src.length) {
      const r = Math.random()*src.length|0;
      const pk = src.splice(r,1)[0];
      if (!opts.find(o => o.kr === pk.kr)) opts.push(pk);
    }
    for (let i = opts.length-1; i > 0; i--) { const j = Math.random()*i|0; [opts[i],opts[j]]=[opts[j],opts[i]]; }

    const grid = $('quiz-grid');
    grid.innerHTML = '';
    opts.forEach(o => {
      const btn = document.createElement('button');
      btn.className = 'quiz-opt';
      btn.textContent = o.polite ? o.kr + ' / ' + o.polite : o.kr;
      btn.addEventListener('click', async () => {
        if (RANS) return;
        RANS = true;
        grid.querySelectorAll('.quiz-opt').forEach(x => x.classList.add('off'));
        const wasKnown = isKnown(w.kr);
        const correct = o.kr === w.kr;
        if (correct) {
          btn.classList.add('ok'); RSC++;
          if (!wasKnown) { M[w.kr] = { ...(M[w.kr]||{}), known: true }; qFlipped++; }
        } else {
          btn.classList.add('bad');
          grid.querySelectorAll('.quiz-opt').forEach(x => {
            if (x.textContent.startsWith(w.kr)) x.classList.add('show');
          });
          if (wasKnown) { M[w.kr] = { ...(M[w.kr]||{}), known: false }; qFlipped++; }
        }
        await Storage.saveMastery(M);
        $('quiz-sc').textContent = RSC;
        $('quiz-tot').textContent = RI + 1;
        App.speak(w.kr);
        setTimeout(() => { RI++; showQuiz(); }, 1000);
      });
      grid.appendChild(btn);
    });
  }

  $('quiz-back').addEventListener('click', () => {
    $('quiz-screen').classList.add('hidden');
    updateStats(); renderWords(); updateQuizInfo();
  });

  // ========== DONE SCREEN ==========
  $('done-back').addEventListener('click', () => {
    $('done-screen').classList.add('hidden');
    updateStats(); renderWords(); updatePracticeInfo(); updateQuizInfo();
  });

  // ========== ADD WORD ==========
  const modal = $('add-word-modal');
  $('add-word-fab').addEventListener('click', () => modal.classList.remove('hidden'));
  $('modal-close').addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

  $('add-word-form').addEventListener('submit', async e => {
    e.preventDefault();
    const word = {
      kr: $('new-kr').value.trim(),
      en: $('new-en').value.trim(),
      rom: $('new-rom').value.trim().toUpperCase() || '',
      category: 'My Words',
      addedAt: new Date().toISOString(),
      source: 'user'
    };
    if (!word.kr || !word.en) return;
    if (allCards.find(c => c.kr === word.kr)) { App.showToast('Word already exists!'); return; }

    const existing = await Storage.getUserWords();
    existing.push(word);
    await Storage.saveUserWords(existing);

    allCards.push(word);
    if (!categories.has('My Words')) categories.set('My Words', []);
    categories.get('My Words').push(word);
    M[word.kr] = { known: false };
    await Storage.saveMastery(M);

    $('add-word-form').reset();
    modal.classList.add('hidden');
    App.showToast('Added: ' + word.kr + ' (Don\'t Know)');
    updateStats(); renderWords(); updatePracticeInfo(); updateQuizInfo();
  });

  // ========== INIT ==========
  updateStats();
  renderWords();
  updatePracticeInfo();
  updateQuizInfo();
})();

