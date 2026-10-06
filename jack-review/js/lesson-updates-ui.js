(async () => {
  const $ = id => document.getElementById(id);
  let input = null, cards = [], choosing = 0, applying = false;
  function message(text, error = false) { $('update-result').textContent = text; $('update-result').classList.toggle('update-error', error); }
  async function status() {
    const state = await Storage.snapshot(), pending = Object.values(state.observations).filter(x => !x.event.wordId).length;
    $('lesson-status').textContent = Object.keys(state.lessons).length + ' lesson updates saved · ' + pending + ' forms awaiting teacher review';
  }
  function reset() { input = null; $('update-preview').hidden = true; $('apply-update').disabled = true; $('lesson-file').value = ''; }
  function describe(summary) {
    if (summary.duplicate) return 'This exact revision is already saved. No changes will be made.';
    if (summary.stale) return 'A newer revision is already saved. This older file will be skipped.';
    return summary.added.length + ' new words · ' + summary.updated.length + ' existing words · ' + summary.applied.length + ' review status changes · ' + summary.unresolved.length + ' unclear forms';
  }
  function preview(summary) {
    $('update-description').textContent = describe(summary); $('update-list').replaceChildren();
    const lines = [...summary.added.map(w => 'Add: ' + w), ...summary.applied.map(e => 'Review: ' + e.word + ' → ' + (e.status === 'unsure' ? 'Unsure' : 'Don’t know')),
      ...summary.preserved.map(e => 'Keep: ' + e.word + ' (' + e.reason + ')'), ...summary.unresolved.map(w => 'Teacher review needed: ' + w + ' (no word status changed)')];
    for (const line of lines) { const li = document.createElement('li'); li.textContent = line; $('update-list').appendChild(li); }
    $('update-preview').hidden = false; $('apply-update').disabled = summary.duplicate || summary.stale;
  }
  $('lesson-file').onchange = async event => {
    const generation = ++choosing, file = event.target.files[0]; input = null; $('update-preview').hidden = true; message('');
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { message('Choose a lesson JSON file smaller than 2 MB.', true); return; }
    try {
      const candidate = JSON.parse(await file.text());
      const pool = await App.buildCardPool(), summary = await LessonUpdates.preview(candidate, pool.allCards);
      if (generation !== choosing) return; cards = pool.allCards; input = candidate; preview(summary);
    } catch (error) { if (generation === choosing) message('Could not read update: ' + error.message, true); }
  };
  $('apply-update').onclick = async () => {
    if (!input || applying) return; applying = true; $('apply-update').disabled = true; $('lesson-file').disabled = true;
    try {
      const summary = await LessonUpdates.apply(input, cards); reset();
      message(summary.duplicate || summary.stale ? describe(summary) : 'Saved on this device. ' + describe(summary) + '. Open Vocabulary to study.'); await status();
    } catch (error) { message('Nothing was applied: ' + error.message, true); $('apply-update').disabled = false; }
    finally { applying = false; $('lesson-file').disabled = false; }
  };
  $('cancel-update').onclick = () => { if (applying) return; choosing++; reset(); message('Cancelled. No lesson changes applied.'); };
  $('backup-export').onclick = () => Storage.exportJSON().catch(e => message('Export failed: ' + e.message, true));
  $('backup-import').onclick = () => $('backup-file').click();
  $('backup-file').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    try { await Storage.importJSON(file); reset(); await status(); message('Backup merged. Newer progress was preserved.'); }
    catch (error) { message('Import failed: ' + error.message, true); } finally { e.target.value = ''; }
  };
  try { await Storage.init(); await status(); } catch (error) { message('Local storage is unavailable: ' + error.message, true); }
})();
