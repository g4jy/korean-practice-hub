/* Reviewed educational patterns; no learner information or remote writes. */
(async () => {
  try {
    const { patterns = [] } = await App.loadVocab();
    const select = document.getElementById('pattern-select');
    let index = 0;
    for (const [i, pattern] of patterns.entries()) {
      const option = document.createElement('option');
      option.value = String(i);
      option.textContent = pattern.pattern + ' · ' + pattern.en;
      select.appendChild(option);
    }
    function render() {
      const pattern = patterns[index];
      if (!pattern) return;
      select.value = String(index);
      document.getElementById('pattern-count').textContent = (index + 1) + ' / ' + patterns.length;
      document.getElementById('pattern-title').textContent = pattern.pattern;
      document.getElementById('pattern-meaning').textContent = pattern.en;
      document.getElementById('pattern-note').textContent = pattern.explanation || '';
      const examples = document.getElementById('pattern-examples');
      examples.replaceChildren();
      for (const example of pattern.examples || []) {
        const row = document.createElement('div'); row.className = 'pattern-example';
        const korean = document.createElement('div'); korean.className = 'kr'; korean.textContent = example.ko;
        const english = document.createElement('div'); english.className = 'en'; english.textContent = example.en;
        row.append(korean, english);
        if (!example.skipAudio) for (const text of example.audioVariants || [example.ko]) {
          const listen = document.createElement('button'); listen.className = 'tts-btn-large';
          listen.textContent = example.audioVariants ? '🔊 ' + text : '🔊 Listen';
          listen.setAttribute('aria-label', 'Listen to ' + text);
          listen.addEventListener('click', () => App.speak(text)); row.appendChild(listen);
        }
        examples.appendChild(row);
      }
    }
    select.addEventListener('change', () => { index = Number(select.value); render(); });
    document.getElementById('pattern-prev').addEventListener('click', () => { index = (index - 1 + patterns.length) % patterns.length; render(); });
    document.getElementById('pattern-next').addEventListener('click', () => { index = (index + 1) % patterns.length; render(); });
    render();
  } catch (error) { App.showToast('Patterns could not be loaded. Please reload.'); }
})();
