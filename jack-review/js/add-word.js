/* === Add Word Feature (standalone, does not modify flashcard.js) === */
(async () => {
  await Storage.init();
  const fab = document.getElementById('add-word-fab');
  const modal = document.getElementById('add-word-modal');
  const form = document.getElementById('add-word-form');
  if (!fab || !modal || !form) return;

  fab.addEventListener('click', () => { modal.classList.remove('hidden'); renderList(); });
  document.getElementById('modal-close').addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const word = {
      kr: document.getElementById('new-kr').value.trim(),
      en: document.getElementById('new-en').value.trim(),
      rom: document.getElementById('new-rom').value.trim().toUpperCase() || '',
      category: document.getElementById('new-cat').value,
      addedAt: new Date().toISOString(),
      source: 'user'
    };
    if (!word.kr || !word.en) return;
    const existing = await Storage.getUserWords();
    if (existing.find(w => w.kr === word.kr)) { App.showToast('Word already exists!'); return; }
    existing.push(word);
    await Storage.saveUserWords(existing);
    form.reset();
    App.showToast('Added: ' + word.kr);
    renderList();
  });

  async function renderList() {
    const list = document.getElementById('user-words-list');
    const words = await Storage.getUserWords();
    if (!words.length) { list.innerHTML = '<p style="font-size:0.8rem;color:#aaa;text-align:center;padding:12px 0">No custom words yet</p>'; return; }
    list.innerHTML = words.map((w, i) =>
      '<div class="user-word-item"><span class="uw-kr">' + w.kr + '</span><span class="uw-en">' + w.en + '</span><button class="uw-del" data-idx="' + i + '">&times;</button></div>'
    ).join('');
    list.querySelectorAll('.uw-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ws = await Storage.getUserWords();
        const removed = ws.splice(+btn.dataset.idx, 1)[0];
        await Storage.saveUserWords(ws);
        App.showToast('Removed: ' + removed.kr);
        renderList();
      });
    });
  }

  document.getElementById('export-user-words').addEventListener('click', async () => {
    const words = await Storage.getUserWords();
    if (!words.length) { App.showToast('No words to export'); return; }
    const blob = new Blob([JSON.stringify({ student: 'Jack', exported: new Date().toISOString(), words }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'jack-review_new_words_' + new Date().toISOString().slice(0, 10) + '.json';
    a.click(); URL.revokeObjectURL(a.href);
  });
})();

