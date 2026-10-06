/* Explicit, learner-initiated teacher submissions. Never uploads a progress backup. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.JackSubmissions = api; api.mount(root); }
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const APP = 'jack-review-korean', LEARNER = 'jack', VERSION = '2026-10-07.1';
  const SOURCES = new Set(['words', 'practice', 'quiz', 'learn', 'flashcard']);
  const STATUSES = {know: 'known', dont_know: 'unknown', unsure: 'unsure'};
  const clone = x => JSON.parse(JSON.stringify(x));
  const cell = value => {
    let text = String(value ?? '').replace(/\u0000/g, '');
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  function rowsFrom(state, cards) {
    const byId = new Map(cards.map((c, i) => [c.id, {...c, no: i + 1}]));
    const latest = new Map();
    for (const event of state.history || []) {
      if (!event || typeof event.id !== 'string' || !event.id.startsWith('response:') ||
          !SOURCES.has(event.source) || !Object.hasOwn(STATUSES, event.status) ||
          !byId.has(event.wordId) || !Number.isFinite(Date.parse(event.timestamp))) continue;
      const previous = latest.get(event.wordId);
      if (!previous || Date.parse(event.timestamp) >= Date.parse(previous.timestamp)) latest.set(event.wordId, event);
    }
    return [...latest.values()].map(e => {
      const card = byId.get(e.wordId);
      return {no: card.no, card_id: card.id, response_id: e.id, status: STATUSES[e.status],
        last_reviewed_at: e.timestamp, last_action: e.source + ':' + e.status,
        korean: card.kr, english: card.en, source: e.source};
    }).sort((a, b) => a.no - b.no);
  }
  function queue(state) {
    if (!state.submissions) state.submissions = {version: 1, appId: APP, learnerId: LEARNER, items: []};
    const q = state.submissions;
    if (q.version !== 1 || q.appId !== APP || q.learnerId !== LEARNER || !Array.isArray(q.items))
      throw Error('This submission queue belongs to another app or cannot be read. Your study data has not changed.');
    return q;
  }
  function payload(rows, id, at, total) {
    return {schemaVersion: 'jack-review-export.v1', submissionId: id, appId: APP, appVersion: VERSION,
      studentKey: LEARNER, exportedAt: at, deckTitle: 'Jack Korean Review',
      summary: {known: rows.filter(x => x.status === 'known').length,
        unknown: rows.filter(x => x.status === 'unknown').length,
        unsure: rows.filter(x => x.status === 'unsure').length, reviewed: rows.length, total},
      rows: clone(rows)};
  }
  function csv(rows) {
    const fields = ['card_id','response_id','status','last_reviewed_at','last_action','korean','english','source'];
    return '\uFEFF' + [fields, ...rows.map(row => fields.map(key => row[key]))]
      .map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
  }
  function createController(options) {
    const {storage, getCards, config} = options;
    const now = options.now || (() => new Date().toISOString());
    const uid = options.uid || (() => 'jack-' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)));
    const fetcher = options.fetch || globalThis.fetch;
    let busy = false;
    const connected = () => config.enabled === true && /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(config.endpoint || '');
    async function inspect() {
      const state = await storage.snapshot();
      return {rows: rowsFrom(state, await getCards()), items: clone(queue(state).items), connected: connected(), busy};
    }
    async function prepare() {
      const cards = await getCards(), at = now();
      return storage.change(state => {
        const q = queue(state), covered = new Set(q.items.flatMap(x => x.payload.rows.map(r => r.response_id)));
        const rows = rowsFrom(state, cards).filter(r => !covered.has(r.response_id));
        const ids = [];
        for (let start = 0; start < rows.length; start += 40) {
          const id = uid();
          if (q.items.some(x => x.id === id)) throw Error('Could not create a unique submission ID. Please retry.');
          q.items.push({id, state: 'pending', attempts: 0, payload: payload(rows.slice(start, start + 40), id, at, cards.length)});
          ids.push(id);
        }
        return ids;
      });
    }
    async function send(retry) {
      if (busy) return {kind: 'busy'};
      busy = true;
      try {
        if (!retry) await prepare();
        if (!connected()) return {kind: 'disconnected', ...(await inspect())};
        const items = (await inspect()).items;
        let processed = 0;
        for (const item of items) {
          const eligible = item.state === 'pending' || (retry && config.idempotent === true && ['unconfirmed','failed','sending'].includes(item.state));
          if (!eligible) continue;
          const claimed = await storage.change(state => {
            const current = queue(state).items.find(x => x.id === item.id);
            if (!current || current.state !== item.state || current.attempts !== item.attempts) return false;
            current.state = 'sending'; current.attempts++; current.attemptedAt = now(); return true;
          });
          if (!claimed) continue;
          let result = 'unconfirmed';
          const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 15000);
          try {
            const response = await fetcher(config.endpoint, {method: 'POST', mode: config.mode === 'no-cors' ? 'no-cors' : 'cors',
              credentials: 'omit', referrerPolicy: 'no-referrer', signal: abort.signal,
              headers: {'Content-Type': 'text/plain;charset=utf-8'}, body: JSON.stringify(item.payload)});
            if (response.type !== 'opaque') {
              if (!response.ok) throw Error('Receiver did not confirm the request');
              const receipt = await response.json();
              if (receipt.ok === true && receipt.submissionId === item.id && receipt.rowCount === item.payload.rows.length) result = 'confirmed';
            }
          } catch { /* A network error can occur after receipt: preserve the same ID and all rows. */ }
          finally { clearTimeout(timer); }
          await storage.change(state => {
            const current = queue(state).items.find(x => x.id === item.id);
            if (current) { current.state = result; current.checkedAt = now(); }
          });
          processed++;
        }
        return {kind: processed ? 'attempted' : 'unchanged', ...(await inspect())};
      } finally { busy = false; }
    }
    return {inspect, prepare, submit: () => send(false), retry: () => send(true),
      csv: async () => csv((await inspect()).rows)};
  }
  function mount(root) {
    async function init() {
      if (typeof Storage === 'undefined' || typeof App === 'undefined') return;
      const header = document.querySelector('.app-header, .page-header');
      if (!header || document.getElementById('teacher-submission')) return;
      const panel = document.createElement('section'); panel.id = 'teacher-submission'; panel.className = 'teacher-submission';
      panel.setAttribute('aria-label', 'Submit review results');
      panel.innerHTML = '<div class="teacher-submit-actions"><button type="button" id="teacher-submit">Submit</button><button type="button" id="teacher-retry" hidden>Retry pending</button><button type="button" id="teacher-download">Download results CSV</button></div><p id="teacher-submit-status" role="status" aria-live="polite"></p><p class="teacher-submit-privacy">When connected, sends only your reviewed words, answers and review times to your teacher. Lesson notes and backups are excluded.</p><details id="teacher-submission-records" hidden><summary>Submission records</summary><ul></ul></details>';
      header.insertAdjacentElement('afterend', panel);
      const controller = createController({storage: Storage, getCards: async () => (await App.buildCardPool()).allCards,
        config: root.JACK_SUBMISSION_CONFIG || {enabled: false}});
      const submit = panel.querySelector('#teacher-submit'), retry = panel.querySelector('#teacher-retry'),
        download = panel.querySelector('#teacher-download'), status = panel.querySelector('#teacher-submit-status');
      let working = false;
      function setBusy(value) { working = value; submit.disabled = retry.disabled = download.disabled = value; }
      async function render(message) {
        const info = await controller.inspect(), pending = info.items.filter(x => x.state !== 'confirmed');
        const pendingRows = pending.reduce((n, x) => n + x.payload.rows.length, 0);
        status.textContent = message || (!info.connected
          ? 'Teacher connection is unavailable. Submit saves a pending copy on this device; download the CSV to send it to your teacher.'
          : pending.length ? pendingRows + ' review results are waiting for a confirmed receipt.' : 'Ready to submit your reviewed words.');
        retry.hidden = !info.connected || !pending.length || !(root.JACK_SUBMISSION_CONFIG?.idempotent === true);
        const records = panel.querySelector('#teacher-submission-records'), list = records.querySelector('ul');
        list.replaceChildren(); records.hidden = !info.items.length;
        for (const item of info.items.slice(-10).reverse()) {
          const li = document.createElement('li');
          const label = item.state === 'confirmed' ? 'Receipt confirmed' : item.state === 'pending' ? 'Saved on this device; not sent' : 'Receipt not confirmed';
          li.textContent = label + ' · ' + item.payload.rows.length + ' results · ID: ' + item.id; list.appendChild(li);
        }
      }
      async function run(isRetry) {
        if (working) return;
        setBusy(true); status.textContent = 'Saving your review results…';
        try {
          const result = await (isRetry ? controller.retry() : controller.submit());
          if (result.kind === 'disconnected') {
            const count = result.items.filter(x => x.state !== 'confirmed').reduce((n,x) => n + x.payload.rows.length, 0);
            await render(count ? count + ' results saved on this device. Not sent: the teacher connection is unavailable. Download the CSV to send it to your teacher.' : 'No reviewed answers yet. Study a word first; nothing was sent.');
          } else if (result.items?.some(x => ['unconfirmed','sending'].includes(x.state))) {
            await render('Receipt is not confirmed. Your results and submission IDs are saved here. Download the CSV or ask your teacher to check before resending.');
          } else if (result.kind === 'attempted') await render('The receiver confirmed your submitted results. Your study progress is still saved on this device.');
          else await render('No new review changes to submit. Existing submission records are shown below.');
        } catch (error) { status.textContent = error.message || 'Could not save results. Nothing has been cleared. Please download your study backup.'; }
        finally { setBusy(false); }
      }
      submit.addEventListener('click', () => run(false)); retry.addEventListener('click', () => run(true));
      download.addEventListener('click', async () => {
        if (working) return; setBusy(true);
        try {
          const info = await controller.inspect();
          if (!info.rows.length) { await render('No reviewed answers to download yet.'); return; }
          const url = URL.createObjectURL(new Blob([csv(info.rows)], {type: 'text/csv;charset=utf-8'}));
          const link = document.createElement('a'); link.href = url; link.download = 'jack-review-results-' + new Date().toISOString().slice(0,10) + '.csv';
          document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
          await render('Results CSV downloaded. Send this file to your teacher; downloading does not submit it.');
        } catch (error) { status.textContent = error.message; } finally { setBusy(false); }
      });
      root.addEventListener('pageshow', () => { if (!working) render().catch(() => {}); });
      await render();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init().catch(() => {}));
    else init().catch(() => {});
  }
  return {rowsFrom, csv, createController, mount};
});
