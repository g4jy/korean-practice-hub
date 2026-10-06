/* === Quiz Mode — Multiple Choice (standalone page) === */
(async () => {
  await Storage.init();
  let M = await Storage.getMastery();
  const { allCards, categories } = await App.buildCardPool();

  let selectedCat = 'all';
  let batchSize = 25;
  let RQ = [], RI = 0, RSC = 0, RANS = false;
  const $ = id => document.getElementById(id);

  // Build category pills
  const catEl = $('cat-pills');
  const allPill = document.createElement('button');
  allPill.className = 'pill active'; allPill.dataset.cat = 'all'; allPill.textContent = 'All';
  catEl.appendChild(allPill);
  for (const name of categories.keys()) {
    const btn = document.createElement('button');
    btn.className = 'pill'; btn.dataset.cat = name; btn.textContent = name;
    catEl.appendChild(btn);
  }
  catEl.addEventListener('click', e => {
    const p = e.target.closest('.pill'); if (!p) return;
    catEl.querySelectorAll('.pill').forEach(x => x.classList.remove('active'));
    p.classList.add('active'); selectedCat = p.dataset.cat; renderHome();
  });

  $('size-pills').addEventListener('click', e => {
    const p = e.target.closest('.pill'); if (!p) return;
    $('size-pills').querySelectorAll('.pill').forEach(x => x.classList.remove('active'));
    p.classList.add('active'); batchSize = +p.dataset.n; renderHome();
  });

  function getPool() {
    return selectedCat === 'all' ? [...allCards] : [...(categories.get(selectedCat) || [])];
  }

  function renderHome() {
    const pool = getPool();
    const tested = pool.filter(w => M[w.kr] && M[w.kr].rv).length;
    const pct = pool.length ? Math.round(tested / pool.length * 100) : 0;
    $('quiz-pct').textContent = pct + '%';
    $('quiz-bar').style.width = pct + '%';
    $('go-quiz').textContent = 'Start Quiz (' + pool.length + ' words)';
    $('go-quiz').disabled = pool.length < 4;
  }

  $('go-quiz').onclick = startQuiz;
  function startQuiz() {
    let p = getPool();
    if (p.length < 4) return;
    for (let i = p.length-1; i > 0; i--) { const j = Math.random()*i|0; [p[i],p[j]]=[p[j],p[i]]; }
    RQ = batchSize > 0 ? p.slice(0, batchSize) : p;
    RI = 0; RSC = 0;
    $('quiz-screen').classList.remove('hidden');
    $('quiz-home').style.display = 'none';
    showQ();
  }

  function showQ() {
    if (RI >= RQ.length) { showDone(); return; }
    RANS = false;
    const w = RQ[RI];
    $('quiz-word').textContent = w.en;
    $('rc').textContent = RI + 1;
    $('rtt').textContent = RQ.length;
    $('quiz-sc').textContent = RSC;
    $('quiz-tot').textContent = RI;

    // Build 4 options — prefer same-category, exclude same-English
    const catPool = getPool().filter(x => x.kr !== w.kr && x.en !== w.en);
    const fallback = allCards.filter(x => x.kr !== w.kr && x.en !== w.en);
    let pool = catPool.length >= 3 ? [...catPool] : [...fallback];
    const opts = [w];
    while (opts.length < 4 && pool.length) {
      const r = Math.random()*pool.length|0;
      const pk = pool.splice(r,1)[0];
      if (!opts.find(o => o.kr === pk.kr)) opts.push(pk);
    }
    for (let i = opts.length-1; i > 0; i--) { const j = Math.random()*i|0; [opts[i],opts[j]]=[opts[j],opts[i]]; }

    const grid = $('quiz-grid');
    grid.innerHTML = '';
    opts.forEach(o => {
      const btn = document.createElement('button');
      btn.className = 'quiz-opt';
      btn.textContent = o.kr;
      btn.onclick = async () => {
        if (RANS) return;
        RANS = true;
        grid.querySelectorAll('.quiz-opt').forEach(x => x.classList.add('off'));
        if (o.kr === w.kr) {
          btn.classList.add('ok'); RSC++;
          if (!M[w.kr]) M[w.kr] = {};
          M[w.kr].rv = true; M[w.kr].rok = (M[w.kr].rok||0)+1;
        } else {
          btn.classList.add('bad');
          grid.querySelectorAll('.quiz-opt').forEach(x => { if (x.textContent === w.kr) x.classList.add('show'); });
          if (!M[w.kr]) M[w.kr] = {};
          M[w.kr].rv = true; M[w.kr].rfail = (M[w.kr].rfail||0)+1;
        }
        await Storage.saveMastery(M);
        $('quiz-sc').textContent = RSC;
        $('quiz-tot').textContent = RI+1;
        App.speak(w.kr);
        setTimeout(() => { RI++; showQ(); }, 1000);
      };
      grid.appendChild(btn);
    });
  }

  $('quiz-back').onclick = () => { $('quiz-screen').classList.add('hidden'); $('quiz-home').style.display=''; renderHome(); };

  function showDone() {
    $('quiz-screen').classList.add('hidden');
    $('done-screen').classList.remove('hidden');
    const p = RQ.length ? Math.round(RSC/RQ.length*100) : 0;
    $('done-icon').textContent = p >= 80 ? '\uD83C\uDFC6' : '\uD83D\uDCD6';
    $('done-title').textContent = RSC + '/' + RQ.length + ' correct';
    $('done-desc').textContent = p + '%';
  }
  $('done-again').onclick = () => { $('done-screen').classList.add('hidden'); $('quiz-home').style.display=''; startQuiz(); };
  $('done-home').onclick = () => { $('done-screen').classList.add('hidden'); $('quiz-home').style.display=''; renderHome(); };

  renderHome();
})();

