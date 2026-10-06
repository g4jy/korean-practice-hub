/* === Learn Mode — Leitner SRS (standalone page) === */
(async () => {
  await Storage.init();
  let M = await Storage.getMastery();
  const { allCards, categories } = await App.buildCardPool();

  const GAPS = [0, 0, 1, 3, 7, 30];
  let selectedCat = 'all';
  let batchSize = 25;
  let LQ = [], LI = 0, LOPEN = false, learnGeneration = 0;

  const box = kr => Number.isInteger(M[kr]?.b) ? Math.max(0, Math.min(5, M[kr].b)) : 0;
  const due = kr => { const m = M[kr]; if (!m || !Number.isFinite(m.t)) return true; return Math.floor((Date.now() - m.t) / 864e5) >= GAPS[m.b] || m.b <= 1; };
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

  // Size pills
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
    const bx = [0,0,0,0,0,0];
    pool.forEach(w => bx[Math.min(box(w.id), 5)]++);
    for (let i = 0; i < 6; i++) $('b'+i).textContent = bx[i];
    const pct = pool.length ? Math.round(bx[5] / pool.length * 100) : 0;
    $('learn-pct').textContent = pct + '%';
    $('learn-bar').style.width = pct + '%';
    const avail = pool.filter(w => box(w.id) < 5).length;
    $('go-learn').textContent = 'Start Learning (' + avail + ' words)';
    $('go-learn').disabled = !avail;
  }

  // Start learning
  $('go-learn').onclick = startLearn;
  function startLearn() {
    const pool = getPool().filter(w => box(w.id) < 5);
    const d = pool.filter(w => box(w.id) > 0 && due(w.id));
    const f = pool.filter(w => box(w.id) === 0);
    let q = [...d, ...f];
    if (batchSize > 0) q = q.slice(0, batchSize);
    if (!q.length) return;
    for (let i = q.length - 1; i > 0; i--) { const j = Math.random()*i|0; [q[i],q[j]]=[q[j],q[i]]; }
    LQ = q; LI = 0; LOPEN = false; learnGeneration++;
    $('study-screen').classList.remove('hidden');
    $('learn-home').style.display = 'none';
    showCard();
  }

  const card = $('learn-card');
  function showCard() {
    if (LI >= LQ.length) { showDone(); return; }
    LOPEN = false;
    card.classList.remove('open');
    $('learn-actions').classList.add('hidden');
    const w = LQ[LI];
    $('learn-cat').textContent = w.category || '';
    $('learn-kr').textContent = w.kr;
    $('learn-en').textContent = w.en;
    $('learn-rom').textContent = w.rom || '';
    $('learn-hint').style.display = '';
    $('lc').textContent = LI + 1;
    $('lt').textContent = LQ.length;
    $('sw-got').style.opacity = 0;
    $('sw-again').style.opacity = 0;
    card.style.transform = ''; card.style.transition = '';
    App.speak(w.kr);
  }

  card.onclick = () => {
    if (LOPEN) return;
    LOPEN = true;
    card.classList.add('open');
    $('learn-actions').classList.remove('hidden');
  };

  let saving = false;
  async function rate(ok) {
    if (saving || !LOPEN || !LQ[LI]) return;
    saving = true; const generation = learnGeneration;
    try {
      const w = LQ[LI];
      M = await Storage.rateWord(w, ok ? 'know' : 'dont_know', 'learn', {leitner: true});
      if (generation !== learnGeneration) return;
      if (!ok) { LQ.splice(Math.min(LI+3,LQ.length),0,{...w}); $('lt').textContent=LQ.length; }
      LI++; showCard();
    } catch (error) { App.showToast('Could not save: ' + error.message); }
    finally { saving = false; }
  }

  $('btn-again').onclick = () => rate(false);
  $('btn-got-it').onclick = () => rate(true);
  $('learn-back').onclick = () => { learnGeneration++; $('study-screen').classList.add('hidden'); $('learn-home').style.display=''; renderHome(); };

  // Swipe
  let sx=0,dr=false,dx=0;
  function s1(x){sx=x;dr=true;dx=0;}
  function s2(x){if(!dr||!LOPEN)return;dx=x-sx;card.style.transform=`translateX(${dx}px) rotate(${dx*.05}deg)`;$('sw-got').style.opacity=dx>20?Math.min(Math.abs(dx)/80,1):0;$('sw-again').style.opacity=dx<-20?Math.min(Math.abs(dx)/80,1):0;}
  function s3(){if(!dr)return;dr=false;if(LOPEN&&Math.abs(dx)>80){const d=dx>0?1:-1,generation=learnGeneration,index=LI,id=LQ[LI]?.id;card.style.transition='transform .18s';card.style.transform=`translateX(${d*300}px) rotate(${d*12}deg)`;setTimeout(()=>{if(generation!==learnGeneration||index!==LI||id!==LQ[LI]?.id)return;card.style.transition='';rate(d>0);},180);}else{card.style.transform='';$('sw-got').style.opacity=0;$('sw-again').style.opacity=0;}}
  card.addEventListener('touchstart',e=>s1(e.touches[0].clientX),{passive:true});
  card.addEventListener('touchmove',e=>s2(e.touches[0].clientX),{passive:true});
  card.addEventListener('touchend',s3);
  card.addEventListener('mousedown',e=>{if(LOPEN){s1(e.clientX);e.preventDefault();}});
  document.addEventListener('mousemove',e=>{if(dr)s2(e.clientX);});
  document.addEventListener('mouseup',s3);

  // Keyboard
  document.addEventListener('keydown',e=>{
    if(!$('study-screen').classList.contains('hidden')){
      if((e.key===' '||e.key==='Enter')&&!LOPEN){e.preventDefault();LOPEN=true;card.classList.add('open');$('learn-actions').classList.remove('hidden');}
      if(e.key==='ArrowLeft'&&LOPEN)rate(false);
      if(e.key==='ArrowRight'&&LOPEN)rate(true);
    }
  });

  // Done
  function showDone() {
    $('study-screen').classList.add('hidden');
    $('done-screen').classList.remove('hidden');
    $('done-icon').textContent = '\uD83D\uDCAA';
    $('done-title').textContent = 'Done!';
    $('done-desc').textContent = 'Studied ' + LQ.length + ' words';
  }
  $('done-again').onclick = () => { $('done-screen').classList.add('hidden'); $('learn-home').style.display=''; startLearn(); };
  $('done-home').onclick = () => { $('done-screen').classList.add('hidden'); $('learn-home').style.display=''; renderHome(); };

  // Export/Import/Reset
  $('srs-export').onclick = () => Storage.exportJSON();
  $('srs-import').onclick = () => $('srs-file-input').click();
  $('srs-file-input').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { await Storage.importJSON(f); location.reload(); }
    catch(err) { App.showToast('Import failed: '+err.message); }
    e.target.value = '';
  };
  $('srs-reset').onclick = async () => {
    if (!confirm('Reset all learning progress?')) return;
    await Storage.clearAll(); M = {}; renderHome(); App.showToast('Progress reset');
  };

  renderHome();
})();

