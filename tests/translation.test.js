import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translationPlan, answerPlan, handFixedAfter } from '../js/translation.js';

const saved = {
  from: 'pt',
  title: { pt: 'Passagem em pé', en: 'Standing pass' },
  note: { pt: 'Tragam água', en: 'Bring water' },
};
const copy = (week) => JSON.parse(JSON.stringify(week));
const plan = (draft, options = {}) => translationPlan({ saved, draft, from: 'pt', to: 'en', ...options });

test('an empty original clears its translation', () => {
  const draft = copy(saved);
  draft.note.pt = '';
  assert.equal(plan(draft, { handFixed: ['note'], edited: ['note'] }).note, 'clear');
});

test('a translation changed in the open editor is kept as typed', () => {
  const draft = copy(saved);
  draft.title.en = 'Standing guard pass';
  draft.title.pt = 'Passagem de guarda em pé';
  assert.equal(plan(draft, { edited: ['title'] }).title, 'keepEdited');
});

test('an editor opened but left unchanged does not count as a correction', () => {
  const draft = copy(saved);
  draft.title.pt = 'Passagem de guarda em pé';
  assert.equal(plan(draft, { edited: ['title'] }).title, 'translate');
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
