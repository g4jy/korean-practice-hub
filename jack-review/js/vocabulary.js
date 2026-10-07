/* === Integrated Vocabulary Page — Words / Practice / Quiz === */
function vocabularyState(record) {
  if (record?.known === true || record?.status === 'know') return 'known';
  if (record?.status === 'dont_know' || record?.status === 'unsure') return 'review';
  // Old boolean-only ratings remain usable; absent or unassessed data is not weakness.
  if (record?.status == null && record?.known === false) return 'review';
  return 'unassessed';
}
if (typeof module !== 'undefined' && module.exports) module.exports = {vocabularyState};
if (typeof document !== 'undefined') (async () => {
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

  // Views never create a rating. Only explicit student actions write progress.
  let M = await Storage.getMastery();
  const stateOf = id => vocabularyState(M[id]);
  const isKnown = id => stateOf(id) === 'known';
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
    const counts = {unassessed: 0, review: 0, known: 0};
    allCards.forEach(c => counts[stateOf(c.id)]++);
    $('vocab-stats').innerHTML =
      '<span class="stat-pill stat-unassessed">' + counts.unassessed + ' Unassessed</span>' +
      '<span class="stat-pill stat-dk">' + counts.review + ' Review</span>' +
      '<span class="stat-pill stat-k">' + counts.known + ' Known</span>';
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
    if (currentFilter !== 'all') words = words.filter(c => stateOf(c.id) === currentFilter);
    if (searchQuery) words = words.filter(c =>
      c.kr.includes(searchQuery) || c.en.toLowerCase().includes(searchQuery) ||
      (c.polite && c.polite.includes(searchQuery)) || c.rom.toLowerCase().includes(searchQuery)
    );

    const list = $('word-list');
    if (!words.length) { list.innerHTML = '<p class="word-empty">No words found</p>'; return; }

    list.innerHTML = words.map(w => {
      const state = stateOf(w.id), known = state === 'known';
      const label = {known: 'Known', review: 'Review', unassessed: 'Unassessed'}[state];
      const action = known ? 'Mark for review' : 'Mark as known';
      const tooltip = App.escapeHTML(label + ': ' + w.kr + '. ' + action);
      const krDisplay = w.polite ? w.kr + ' / ' + w.polite : w.kr;
      return '<div class="word-row">' +
        '<div class="word-info">' +
          '<div class="word-top"><span class="word-kr">' + App.escapeHTML(krDisplay) + '</span><span class="word-cat-badge">' + App.escapeHTML(w.category || '') + '</span></div>' +
          '<span class="word-en">' + App.escapeHTML(w.en) + '</span>' +
          (w.rom ? '<span class="word-rom rom-text">' + App.escapeHTML(w.rom) + '</span>' : '') +
        '</div>' +
        '<button class="word-toggle ' + state + '" data-id="' + App.escapeHTML(w.id) + '" title="' + tooltip + '" aria-label="' + tooltip + '">' +
          (known ? '✓' : state === 'review' ? '✗' : '?') +
        '</button>' +
      '</div>';
    }).join('');

    list.querySelectorAll('.word-toggle').forEach(btn => {
      btn.addEventListener('click', async () => {
        const word = allCards.find(w => w.id === btn.dataset.id);
        if (btn.disabled) return;
        btn.disabled = true;
        try { M = await Storage.rateWord(word, isKnown(word.id) ? 'dont_know' : 'know', 'words'); updateStats(); renderWords(); }
        catch (error) { App.showToast('Could not save: ' + error.message); btn.disabled = false; }
      });
    });
  }

  // ========== STUDY (unassessed and review cards) ==========
  let PQ = [], PI = 0, POPEN = false, pKnow = 0, practiceGeneration = 0;

  function updatePracticeInfo() {
    const unassessed = allCards.filter(c => stateOf(c.id) === 'unassessed').length;
    const review = allCards.filter(c => stateOf(c.id) === 'review').length;
    $('practice-info').textContent = unassessed + ' Unassessed / ' + review + ' Review';
    $('go-practice').textContent = 'Study (' + (unassessed + review) + ')';
    $('go-practice').disabled = unassessed + review === 0;
  }

  $('go-practice').addEventListener('click', () => {
    PQ = allCards.filter(c => !isKnown(c.id));
    for (let i = PQ.length - 1; i > 0; i--) { const j = Math.random()*i|0; [PQ[i],PQ[j]]=[PQ[j],PQ[i]]; }
    PI = 0; POPEN = false; pKnow = 0; practiceGeneration++;
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
      $('done-desc').textContent = pKnow + ' words marked Known';
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

  // An explicit review answer is timestamped and appended to history, even for a new card.
  let practiceSaving = false;
  $('btn-dont').addEventListener('click', async () => {
    if (!POPEN || practiceSaving || !PQ[PI]) return;
    practiceSaving = true; const generation = practiceGeneration;
    try { M = await Storage.rateWord(PQ[PI], 'dont_know', 'practice'); if (generation !== practiceGeneration) return; PI++; showPracticeCard(); }
    catch (error) { App.showToast('Could not save: ' + error.message); }
    finally { practiceSaving = false; }
  });
  // "Know now" → promote to Know
  $('btn-know').addEventListener('click', async () => {
    if (!POPEN || practiceSaving || !PQ[PI]) return;
    practiceSaving = true; const generation = practiceGeneration;
    try { M = await Storage.rateWord(PQ[PI], 'know', 'practice'); if (generation !== practiceGeneration) return; pKnow++; PI++; showPracticeCard(); }
    catch (error) { App.showToast('Could not save: ' + error.message); }
    finally { practiceSaving = false; }
  });

  $('practice-back').addEventListener('click', () => {
    practiceGeneration++;
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
  let quizFilter = 'all'; // all, unassessed, review, known
  let quizCat = 'all';
  let RQ = [], RI = 0, RSC = 0, RANS = false, qFlipped = 0, quizGeneration = 0;

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
    if (quizFilter !== 'all') pool = pool.filter(c => stateOf(c.id) === quizFilter);
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
    RI = 0; RSC = 0; qFlipped = 0; quizGeneration++;
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
        RANS = true; const generation = quizGeneration;
        grid.querySelectorAll('.quiz-opt').forEach(x => x.classList.add('off'));
        const previousState = stateOf(w.id);
        const correct = o.id === w.id;
        if (correct) {
          btn.classList.add('ok'); RSC++;
        } else {
          btn.classList.add('bad');
          grid.querySelectorAll('.quiz-opt').forEach(x => {
            if (x.textContent.startsWith(w.kr)) x.classList.add('show');
          });
        }
        try {
          M = await Storage.rateWord(w, correct ? 'know' : 'dont_know', 'quiz', {quiz: true});
          if (previousState !== stateOf(w.id)) qFlipped++;
        }
        catch (error) { App.showToast('Answer was not saved: ' + error.message); }
        if (generation !== quizGeneration) return;
        $('quiz-sc').textContent = RSC;
        $('quiz-tot').textContent = RI + 1;
        App.speak(w.kr);
        setTimeout(() => { if (generation !== quizGeneration) return; RI++; showQuiz(); }, 1000);
      });
      grid.appendChild(btn);
    });
  }

  $('quiz-back').addEventListener('click', () => {
    quizGeneration++;
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

    word.id = Storage.wordId(word.kr);
    await Storage.addWord(word);

    allCards.push(word);
    if (!categories.has('My Words')) categories.set('My Words', []);
    categories.get('My Words').push(word);
    M = await Storage.getMastery();

    $('add-word-form').reset();
    modal.classList.add('hidden');
    App.showToast('Added: ' + word.kr + ' (Unassessed)');
    updateStats(); renderWords(); updatePracticeInfo(); updateQuizInfo();
  });

  // ========== INIT ==========
  updateStats();
  renderWords();
  updatePracticeInfo();
  updateQuizInfo();
})();

