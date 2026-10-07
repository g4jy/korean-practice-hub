/* Reviewed lesson packages are imported on this device only. No remote collector. */
const LessonUpdates = (() => {
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const normalized = s => s.normalize('NFC').trim();
  function text(value, label, max = 500) {
    if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f]/.test(value)) throw new Error('Invalid ' + label);
    return normalized(value);
  }
  function id(value, label) {
    const x = text(value, label, 250);
    if (['__proto__', 'constructor', 'prototype'].includes(x)) throw new Error('Invalid ' + label);
    return x;
  }
  function keys(object, allowed, label) {
    if (!object || typeof object !== 'object' || Array.isArray(object)) throw new Error('Invalid ' + label);
    for (const k of Object.keys(object)) if (!allowed.includes(k)) throw new Error('Unsupported ' + label + ' field: ' + k);
  }
  function date(value, label) {
    if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('Invalid ' + label);
    return new Date(value).toISOString();
  }
  function validate(input) {
    keys(input, ['schema','app','learnerId','lessonId','revision','documentedAt','vocabulary','observations'], 'package');
    if (input.schema !== 'korean-lesson-update/v1' || input.app !== 'jack-review-korean' || input.learnerId !== 'jack') throw new Error('This is not a Jack lesson update');
    if (!Number.isSafeInteger(input.revision) || input.revision < 1) throw new Error('Revision must be a positive integer');
    if (!Array.isArray(input.vocabulary) || input.vocabulary.length > 1000 || !Array.isArray(input.observations) || input.observations.length > 1000) throw new Error('Invalid package lists');
    const result = {schema: input.schema, app: input.app, learnerId: input.learnerId, lessonId: id(input.lessonId, 'lesson ID'), revision: input.revision,
      documentedAt: date(input.documentedAt, 'documentation time'), vocabulary: [], observations: []};
    const seen = new Set();
    for (const w of input.vocabulary) {
      keys(w, ['id','kr','en','rom','polite','category'], 'vocabulary');
      const word = {id: id(w.id, 'word ID'), kr: text(w.kr, 'Korean word', 100), en: text(w.en, 'English meaning')};
      if (seen.has(word.id)) throw new Error('Duplicate word ID'); seen.add(word.id);
      for (const k of ['rom','polite','category']) if (w[k] != null && w[k] !== '') word[k] = text(w[k], k, 150);
      result.vocabulary.push(word);
    }
    seen.clear();
    for (const o of input.observations) {
      keys(o, ['id','wordId','observedForm','status','observedAt'], 'observation');
      const event = {id: id(o.id, 'observation ID'), observedForm: text(o.observedForm, 'observed form', 100), status: o.status,
        observedAt: date(o.observedAt, 'observation time')};
      if (seen.has(event.id)) throw new Error('Duplicate observation ID'); seen.add(event.id);
      if (!['unsure','dont_know'].includes(event.status)) throw new Error('Only explicit unsure/dont_know observations are accepted');
      if (Date.parse(event.observedAt) > Date.parse(result.documentedAt) + 300000) throw new Error('Observation is later than documentation');
      if (o.wordId != null) event.wordId = id(o.wordId, 'word ID');
      result.observations.push(event);
    }
    result.vocabulary.sort((a,b) => a.id.localeCompare(b.id)); result.observations.sort((a,b) => a.id.localeCompare(b.id));
    return result;
  }
  function plan(state, input, cards) {
    const pkg = validate(input), signature = JSON.stringify(pkg), oldLesson = own(state.lessons, pkg.lessonId) ? state.lessons[pkg.lessonId] : null;
    const summary = {lessonId: pkg.lessonId, revision: pkg.revision, added: [], updated: [], applied: [], preserved: [], unresolved: [], duplicate: false, stale: false};
    if (oldLesson && pkg.revision < oldLesson.revision) { summary.stale = true; return summary; }
    if (oldLesson && pkg.revision === oldLesson.revision) {
      if (signature !== oldLesson.signature) throw new Error('This revision was already applied with different content. Increase the revision number.');
      summary.duplicate = true; return summary;
    }
    const catalog = new Map(cards.map(w => [w.id, w]));
    for (const w of state.words) catalog.set(w.id, w);
    for (const w of pkg.vocabulary) {
      const existing = catalog.get(w.id);
      if (existing && existing.kr !== w.kr) throw new Error('Word ID already belongs to a different Korean form: ' + w.kr);
      if (existing && normalized(existing.en) !== w.en) throw new Error('Word ID already belongs to a different meaning; use a unique sense ID');
      if (existing?._lessonDocumentedAt && Date.parse(existing._lessonDocumentedAt) > Date.parse(pkg.documentedAt)) {
        summary.preserved.push({word: w.kr, reason: 'Newer lesson vocabulary retained'}); continue;
      }
      (existing ? summary.updated : summary.added).push(w.kr);
      const merged = {...existing, ...w, _lessonDocumentedAt: pkg.documentedAt};
      merged.category = merged.category || 'Lesson Words'; merged.rom = merged.rom || '';
      const index = state.words.findIndex(x => x.id === w.id);
      if (index >= 0) state.words[index] = merged; else state.words.push(merged);
      catalog.set(w.id, merged);
    }
    // Event chronology, not lexical ID order, decides the last applicable observation.
    for (const o of [...pkg.observations].sort((a,b) => Date.parse(a.observedAt) - Date.parse(b.observedAt) || a.id.localeCompare(b.id))) {
      const key = JSON.stringify([pkg.lessonId, o.id]), previous = state.observations[key];
      const unchanged = previous && JSON.stringify(previous.event) === JSON.stringify(o);
      if (unchanged) { summary.preserved.push({word: o.observedForm, reason: 'Observation already processed'}); continue; }
      if (previous && (previous.event.observedAt !== o.observedAt || previous.event.observedForm !== o.observedForm)) throw new Error('Keep observation IDs and timestamps stable; use a new ID for a new observation');
      if (previous && previous.event.status !== o.status) throw new Error('Keep observation status stable; use a new ID for a changed observation');
      if (previous?.event.wordId && previous.event.wordId !== o.wordId) throw new Error('A resolved observation cannot be retargeted. Use a new observation ID.');
      if (o.wordId && !catalog.has(o.wordId)) throw new Error('Unknown word ID: ' + o.wordId);
      const entry = {event: o, lessonId: pkg.lessonId, revision: pkg.revision, appliedAt: new Date().toISOString(), applied: false};
      if (!o.wordId) {
        entry.reason = 'Meaning needs teacher review'; summary.unresolved.push(o.observedForm);
      } else {
        const m = state.mastery[o.wordId] || {}, when = Date.parse(o.observedAt), word = catalog.get(o.wordId);
        const unknownLearningTime = (m.known === true || m.status === 'know' || m.b >= 3) && !(Number.isFinite(m.lastLearningAt) && m.lastLearningAt > 0);
        if (unknownLearningTime) {
          entry.reason = 'Known rating has no verified learning timestamp; teacher review needed'; summary.preserved.push({word: word.kr, reason: entry.reason});
        } else if (Math.max(m.lastLearningAt || 0, m.lastLessonObservedAt || 0, state.lastResetAt || 0) > when) {
          entry.reason = 'Newer learning or lesson observation retained'; summary.preserved.push({word: word.kr, reason: entry.reason});
        } else {
          entry.previous = {...m}; entry.applied = true;
          state.mastery[o.wordId] = {...m, kr: word.kr, known: false, status: o.status, b: o.status === 'unsure' ? 1 : 0,
            t: when, lastEventAt: when, lastLessonObservedAt: when, lessonId: pkg.lessonId, observationId: o.id};
          summary.applied.push({word: word.kr, status: o.status});
        }
      }
      state.observations[key] = entry;
      state.history.push({id: 'lesson:' + JSON.stringify([pkg.lessonId, pkg.revision, o.id]), source: 'lesson', ...entry});
    }
    state.lessons[pkg.lessonId] = {revision: pkg.revision, signature, documentedAt: pkg.documentedAt, appliedAt: new Date().toISOString()};
    return summary;
  }
  async function preview(input, cards) { return plan(await Storage.snapshot(), input, cards); }
  async function apply(input, cards) { return Storage.change(state => plan(state, input, cards)); }
  return {validate, plan, preview, apply};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = LessonUpdates;
