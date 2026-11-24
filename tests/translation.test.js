import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translationPlan, answerPlan, handFixedAfter, writtenIn, writtenAfter, translationLabel } from '../js/translation.js';

const saved = {
  from: 'pt',
  title: { pt: 'Passagem em pé', en: 'Standing pass' },
  note: { pt: 'Tragam água', en: 'Bring water' },
};
const copy = (week) => JSON.parse(JSON.stringify(week));
const plan = (draft, options = {}) => translationPlan({ saved, draft, from: 'pt', to: 'en', ...options });

test('an original the admin emptied clears its translation', () => {
  const draft = copy(saved);
  draft.note.pt = '';
  assert.equal(plan(draft, { handFixed: ['note'] }).note, 'clear');
});

test('text in only the other language is kept when the writing language is empty', () => {
  const onlyPt = { from: 'pt', title: { pt: 'Raspagem', en: '' }, note: { pt: 'Tragam água', en: '' } };
  const draft = copy(onlyPt);
  assert.deepEqual(translationPlan({ saved: onlyPt, draft, from: 'en', to: 'pt' }), { title: 'keep', note: 'keep' });
});

test('a translation the admin changed is kept as typed', () => {
  const draft = copy(saved);
  draft.title.en = 'Standing guard pass';
  draft.title.pt = 'Passagem de guarda em pé';
  assert.equal(plan(draft).title, 'keepEdited');
});

test('text typed before switching the writing language is kept, not translated over', () => {
  const draft = copy(saved);
  draft.title.pt = 'Passagem de guarda';
  draft.title.en = 'Guard pass';
  assert.equal(translationPlan({ saved, draft, from: 'en', to: 'pt' }).title, 'keepEdited');
});

test('a translation left as saved does not count as a correction', () => {
  const draft = copy(saved);
  draft.title.pt = 'Passagem de guarda em pé';
  assert.equal(plan(draft).title, 'translate');
});

test('nothing changed keeps the translation', () => {
  assert.deepEqual(plan(copy(saved)), { title: 'keep', note: 'keep' });
  assert.deepEqual(plan(copy(saved), { handFixed: ['title'] }), { title: 'keep', note: 'keep' });
});

test('a changed original is translated again', () => {
  const draft = copy(saved);
  draft.note.pt = 'Tragam água e faixa';
  assert.equal(plan(draft).note, 'translate');
});

test('a missing translation is translated, even when the original did not change', () => {
  const draft = copy(saved);
  draft.title.en = '';
  assert.equal(plan(draft).title, 'translate');
  assert.equal(plan(draft, { handFixed: ['title'] }).title, 'translate');
});

test('a changed original with a hand-fixed translation asks first', () => {
  const draft = copy(saved);
  draft.title.pt = 'Passagem de guarda em pé';
  assert.deepEqual(plan(draft, { handFixed: ['title'] }), { title: 'ask', note: 'keep' });
});

test('a new week with nothing saved translates everything typed', () => {
  const draft = { title: { pt: 'Raspagem', en: '' }, note: { pt: '', en: '' } };
  assert.deepEqual(translationPlan({ saved: {}, draft, from: 'pt', to: 'en' }), { title: 'translate', note: 'clear' });
});

test('a week saved before hand fixes existed counts as nothing hand-fixed', () => {
  const draft = copy(saved);
  draft.title.pt = 'Passagem de guarda em pé';
  assert.equal(translationPlan({ saved, draft, from: 'pt', to: 'en', handFixed: undefined }).title, 'translate');
});

test('after switching language, the original counts as changed only if it differs from what was saved', () => {
  const unchanged = translationPlan({ saved, draft: copy(saved), from: 'en', to: 'pt', handFixed: ['title'] });
  assert.deepEqual(unchanged, { title: 'keep', note: 'keep' });

  const draft = copy(saved);
  draft.title.en = 'Standing guard pass';
  assert.equal(translationPlan({ saved, draft, from: 'en', to: 'pt' }).title, 'translate');
  assert.equal(translationPlan({ saved, draft, from: 'en', to: 'pt', handFixed: ['title'] }).title, 'ask');
});

test('the answer to the question replaces every ask', () => {
  const asked = { title: 'ask', note: 'keep' };
  assert.deepEqual(answerPlan(asked, 'translate'), { title: 'translate', note: 'keep' });
  assert.deepEqual(answerPlan(asked, 'keep'), { title: 'keep', note: 'keep' });
});

test('hand fixes are added by an edit, kept by keep, dropped by clear and translate', () => {
  assert.deepEqual(handFixedAfter({ title: 'keepEdited', note: 'keep' }, []), ['title']);
  assert.deepEqual(handFixedAfter({ title: 'keep', note: 'keep' }, ['title', 'note']), ['title', 'note']);
  assert.deepEqual(handFixedAfter({ title: 'translate', note: 'clear' }, ['title', 'note']), []);
  assert.deepEqual(handFixedAfter({ title: 'keep', note: 'keep' }), []);
});

// ---- the label beside a translation must be true ----

test('a week saved from Portuguese: its English is labelled translated automatically', () => {
  assert.equal(translationLabel(saved, 'title', 'Standing pass', 'en'), 'translatedAutomatically');
  assert.equal(translationLabel({ ...saved, handFixed: ['title'] }, 'title', 'Standing pass', 'en'), 'yourCorrection');
  assert.equal(translationLabel(saved, 'title', 'Standing guard pass', 'en'), 'yourCorrection', 'typed just now');
});

test('writing in the other language, the original shows with no label', () => {
  assert.equal(translationLabel(saved, 'title', 'Passagem em pé', 'pt'), '');
});

test('saved from a language whose field was empty: the other language is the original, not a translation', () => {
  // Written in Portuguese first; later saved from English with the note left empty in English.
  const mixed = { from: 'en', title: { pt: 'Raspagem', en: 'Sweep' }, note: { pt: 'Tragam água', en: '' } };
  assert.equal(writtenIn(mixed, 'note'), 'pt');
  assert.equal(translationLabel(mixed, 'note', 'Tragam água', 'pt'), '');
  assert.equal(writtenIn(mixed, 'title'), 'en');
  assert.equal(translationLabel(mixed, 'title', 'Raspagem', 'pt'), 'translatedAutomatically');
});

test('each field remembers the language it was typed in, across saves from either language', () => {
  // Saved from English: the English title was typed, the Portuguese one translated.
  const first = { from: 'en', title: { pt: 'Passagem', en: 'Pass' }, note: { pt: '', en: '' }, written: { title: 'en' } };
  // Saved again from Portuguese without changing anything: the English is still the original.
  const again = writtenAfter({ saved: first, draft: copy(first), from: 'pt', to: 'en' });
  assert.deepEqual(again, { title: 'en' });
  const second = { ...first, from: 'pt', written: again };
  assert.equal(translationLabel(second, 'title', 'Pass', 'en'), '');
  assert.equal(translationLabel(second, 'title', 'Passagem', 'pt'), 'translatedAutomatically');
});

test('an original changed now was written in the language the admin writes in', () => {
  const draft = copy(saved);
  draft.title.pt = 'Passagem de guarda';
  assert.deepEqual(writtenAfter({ saved, draft, from: 'pt', to: 'en' }), { title: 'pt', note: 'pt' });
  draft.note = { pt: '', en: 'Bring water' };
  assert.equal(writtenAfter({ saved, draft, from: 'pt', to: 'en' }).note, 'en');
  draft.note = { pt: '', en: '' };
  assert.equal(writtenAfter({ saved, draft, from: 'pt', to: 'en' }).note, undefined);
  const missing = copy(saved);
  missing.title.en = '';
  assert.equal(writtenAfter({ saved: { ...saved, written: { title: 'en' } }, draft: missing, from: 'pt', to: 'en' }).title, 'pt', 'translated again from Portuguese');
});

test('nothing is claimed for text whose history is unknown (an old past week reused)', () => {
  const past = { title: { pt: 'Raspagem', en: 'Sweep' }, note: {} };
  assert.equal(translationLabel(past, 'title', 'Sweep', 'en'), '');
  assert.equal(translationLabel(past, 'title', 'Sweeps', 'en'), 'yourCorrection');
});

test('correcting the original through "Edit translation" does not make the automatic translation a correction', () => {
  // Written in Portuguese, English translated automatically.
  const first = { from: 'pt', title: { pt: 'A', en: 'en:A' }, note: { pt: '', en: '' }, written: { title: 'pt' }, handFixed: [] };
  // Now writing in English, the admin edits the Portuguese line (the original) to "A2".
  const draft = { ...copy(first), title: { pt: 'A2', en: 'en:A' } };
  const steps = translationPlan({ saved: first, draft, from: 'en', to: 'pt', handFixed: [] });
  assert.equal(steps.title, 'keepEdited');
  const handFixed = handFixedAfter(steps, [], { saved: first, to: 'pt' });
  assert.deepEqual(handFixed, []);
  const second = { ...draft, from: 'en', handFixed, written: writtenAfter({ saved: first, draft, from: 'en', to: 'pt' }) };
  // Back to writing in Portuguese: the English line is still the automatic one.
  assert.equal(translationLabel(second, 'title', 'en:A', 'en'), 'translatedAutomatically');
  // A real correction of the translation still counts, and an earlier one is not forgotten.
  assert.deepEqual(handFixedAfter(steps, [], { saved: first, to: 'en' }), ['title']);
  assert.deepEqual(handFixedAfter(steps, ['title'], { saved: first, to: 'pt' }), ['title']);
});
