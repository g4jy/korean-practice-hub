/* Fixed reviewed questions, exact Edge recordings, no microphone or network writes. */
(async () => {
  try {
    const response = await fetch('data/questions.json', {cache: 'no-cache'});
    if (!response.ok) throw Error('Questions are unavailable');
    const data = await response.json(), select = document.getElementById('question-set-select');
    for (const [i, section] of data.sections.entries()) {
      const option = document.createElement('option'); option.value = String(i);
      option.textContent = section.title + ' · ' + section.questions.length + ' questions'; select.appendChild(option);
    }
    function listen(text, label) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'tts-btn-large';
      button.textContent = '🔊 ' + label; button.setAttribute('aria-label', 'Listen: ' + text);
      button.addEventListener('click', () => App.speak(text)); return button;
    }
    function render() {
      const section = data.sections[Number(select.value) || 0], list = document.getElementById('review-questions');
      document.getElementById('question-set-note').textContent = section.description || '';
      list.replaceChildren();
      for (const [i, question] of section.questions.entries()) {
        const row = document.createElement('article'); row.className = 'review-question';
        const title = document.createElement('h2'); title.textContent = (i + 1) + '. ' + question.ko;
        const meaning = document.createElement('p'); meaning.className = 'question-en'; meaning.textContent = question.en || '';
        row.append(title, meaning, listen(question.ko, 'Question'));
        if (question.answerKo) {
          const details = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = 'Show a sample answer';
          const answer = document.createElement('p'); answer.className = 'answer-ko'; answer.textContent = question.answerKo;
          const translation = document.createElement('p'); translation.className = 'answer-en'; translation.textContent = question.answerEn || '';
          details.append(summary, answer, translation, listen(question.answerKo, 'Sample answer')); row.appendChild(details);
        }
        list.appendChild(row);
      }
    }
    select.addEventListener('change', render); render();
  } catch (_) { document.getElementById('question-set-note').textContent = 'Questions could not be loaded. Please reload.'; }
})();
