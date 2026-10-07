(async () => {
  try {
    const data = await App.loadVocab();
    const count = data.flashcards.categories.reduce((n, c) => n + c.cards.length, 0);
    document.getElementById('curriculum-summary').textContent = data.summary.wordCards + ' words & forms · ' + data.patterns.length + ' patterns & usage';
  } catch (_) { document.getElementById('curriculum-summary').textContent = 'Could not load your review. Please reload.'; }
})();
