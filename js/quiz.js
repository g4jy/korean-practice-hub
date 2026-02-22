/* === Situation Quiz === */

(async () => {
  const data = await App.loadVocab();
  if (!data.quiz || !data.quiz.situations) return;

  const situations = data.quiz.situations;
  let order = [];
  let current = 0;
  let score = 0;
  let answered = false;
  let results = [];

  const els = {
    card: document.getElementById('quiz-card'),
    situation: document.getElementById('situation-text'),
    options: document.getElementById('options-container'),
    feedback: document.getElementById('feedback'),
    feedbackIcon: document.getElementById('feedback-icon'),
    feedbackAnswer: document.getElementById('feedback-answer'),
    feedbackRom: document.getElementById('feedback-rom'),
    feedbackExplain: document.getElementById('feedback-explain'),
    nextBtn: document.getElementById('next-btn'),
    progressFill: document.getElementById('progress-fill'),
    progressText: document.getElementById('progress-text'),
    resultsScreen: document.getElementById('results-screen'),
    resultsTitle: document.getElementById('results-title'),
    resultsScore: document.getElementById('results-score'),
    resultsBreakdown: document.getElementById('results-breakdown'),
    retryBtn: document.getElementById('retry-btn')
  };

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function startQuiz() {
    order = shuffle([...Array(situations.length).keys()]);
    current = 0;
    score = 0;
    answered = false;
    results = [];
    els.resultsScreen.classList.add('hidden');
    els.card.classList.remove('hidden');
    renderQuestion();
  }

  function renderQuestion() {
    answered = false;
    const q = situations[order[current]];

    const pct = ((current) / situations.length) * 100;
    els.progressFill.style.width = pct + '%';
    els.progressText.textContent = (current + 1) + ' / ' + situations.length;

    els.situation.textContent = q.situation;

    const shuffledOpts = shuffle(q.options);
    els.options.innerHTML = '';
    shuffledOpts.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'quiz-option';
      btn.textContent = opt;
      btn.addEventListener('click', () => handleAnswer(btn, opt, q));
      els.options.appendChild(btn);
    });

    els.feedback.classList.add('hidden');
    els.nextBtn.classList.add('hidden');
  }

  function handleAnswer(btn, selected, q) {
    if (answered) return;
    answered = true;

    const isCorrect = selected === q.correct;
    if (isCorrect) score++;

    results.push({
      situation: q.situation,
      correct: q.correct,
      selected: selected,
      isCorrect: isCorrect
    });

    const allBtns = els.options.querySelectorAll('.quiz-option');
    allBtns.forEach(b => {
      b.disabled = true;
      if (b.textContent === q.correct) {
        b.classList.add('correct');
      } else if (b === btn && !isCorrect) {
        b.classList.add('wrong');
      }
    });

    els.feedbackIcon.textContent = isCorrect ? '✅' : '❌';
    els.feedbackAnswer.textContent = q.correct + ' — ' + q.correctEn;
    els.feedbackRom.textContent = q.correctRom;
    els.feedbackRom.classList.toggle('hidden', document.body.classList.contains('hide-rom'));
    els.feedbackExplain.textContent = q.explanation;
    els.feedback.classList.remove('hidden');

    App.speak(q.correct);

    els.nextBtn.classList.remove('hidden');
  }

  function showResults() {
    els.card.classList.add('hidden');
    els.resultsScreen.classList.remove('hidden');

    const pct = Math.round((score / situations.length) * 100);
    els.progressFill.style.width = '100%';
    els.progressText.textContent = situations.length + ' / ' + situations.length;

    if (pct === 100) {
      els.resultsTitle.textContent = 'Perfect Score!';
    } else if (pct >= 70) {
      els.resultsTitle.textContent = 'Great Job!';
    } else if (pct >= 50) {
      els.resultsTitle.textContent = 'Good Try!';
    } else {
      els.resultsTitle.textContent = 'Keep Practicing!';
    }

    els.resultsScore.textContent = score + ' / ' + situations.length + ' correct (' + pct + '%)';

    let html = '';
    results.forEach((r, i) => {
      const icon = r.isCorrect ? '✅' : '❌';
      html += '<div class="result-row ' + (r.isCorrect ? 'row-correct' : 'row-wrong') + '">';
      html += '<span class="result-num">' + (i + 1) + '.</span> ';
      html += '<span class="result-icon">' + icon + '</span> ';
      html += '<span class="result-answer">' + r.correct + '</span>';
      if (!r.isCorrect) {
        html += ' <span class="result-yours">(you: ' + r.selected + ')</span>';
      }
      html += '</div>';
    });
    els.resultsBreakdown.innerHTML = html;
  }

  els.nextBtn.addEventListener('click', () => {
    current++;
    if (current >= situations.length) {
      showResults();
    } else {
      renderQuestion();
    }
  });

  els.retryBtn.addEventListener('click', startQuiz);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && answered && !els.nextBtn.classList.contains('hidden')) {
      els.nextBtn.click();
    }
    if (!answered && e.key >= '1' && e.key <= '4') {
      const btns = els.options.querySelectorAll('.quiz-option');
      const idx = parseInt(e.key) - 1;
      if (btns[idx]) btns[idx].click();
    }
  });

  startQuiz();
})();
