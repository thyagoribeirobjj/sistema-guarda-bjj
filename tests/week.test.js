import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localDate, nextMonday, classOf, weekOn, switchOver, worthArchiving, pastEntry, pastWeeksShown, dateProblem, firstStart } from '../js/week.js';

const current = { weekOf: '2026-11-23', title: { pt: 'Passagem', en: 'Passing' }, note: { pt: '', en: '' }, techniques: ['top-base'], from: 'pt', handFixed: [], updatedBy: 'coach@example.com' };
const next = { weekOf: '2026-11-30', title: { pt: 'Raspagem', en: 'Sweeps' }, note: { pt: 'Tragam água', en: 'Bring water' }, techniques: ['bottom-scissor'], from: 'pt', handFixed: [] };
const stored = { ...current, next };

test('a date is written as YYYY-MM-DD in the browser\'s own time zone', () => {
  assert.equal(localDate(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(localDate(new Date(2026, 10, 30, 0, 1)), '2026-11-30');
});

test('a prepared week starts on the next Monday by default', () => {
  assert.equal(nextMonday('2026-11-24'), '2026-11-30'); // Tuesday
  assert.equal(nextMonday('2026-11-29'), '2026-11-30'); // Sunday
  assert.equal(nextMonday('2026-11-30'), '2026-12-07'); // a Monday: the one after
  assert.equal(nextMonday('2026-12-31'), '2027-01-04'); // across a year
});

test('before its start date the prepared week stays hidden', () => {
  const shown = weekOn(stored, '2026-11-29');
  assert.equal(shown.week.title.en, 'Passing');
  assert.equal(shown.week.next, undefined, 'the prepared week is not part of this week');
  assert.equal(shown.week.updatedBy, undefined);
  assert.equal(shown.previous, null);
});

test('on its start date and after, the prepared week is this week and the old one the newest past week', () => {
  for (const today of ['2026-11-30', '2026-12-09']) {
    const shown = weekOn(stored, today);
    assert.equal(shown.week.title.en, 'Sweeps');
    assert.equal(shown.previous.title.en, 'Passing');
  }
});

test('no week at all, or a prepared week with nothing before it', () => {
  assert.deepEqual(weekOn(null, '2026-11-30'), { week: null, previous: null });
  assert.deepEqual(weekOn({ next }, '2026-11-29'), { week: null, previous: null });
  const started = weekOn({ next }, '2026-11-30');
  assert.equal(started.week.title.en, 'Sweeps');
  assert.equal(started.previous, null);
});

test('a prepared week with no start date never takes over', () => {
  assert.equal(weekOn({ ...current, next: { ...next, weekOf: '' } }, '2099-01-01').week.title.en, 'Passing');
  assert.equal(switchOver({ ...current, next: { ...next, weekOf: '' } }, '2099-01-01'), null);
});

test('the switch writes the prepared week as this week and files the old one', () => {
  assert.equal(switchOver(stored, '2026-11-29'), null, 'nothing to do before the date');
  assert.equal(switchOver(current, '2026-11-30'), null, 'nothing prepared');
  const change = switchOver(stored, '2026-11-30');
  assert.deepEqual(change.week, classOf(next));
  assert.equal('next' in change.week, false);
  assert.deepEqual(change.archive, { weekOf: '2026-11-23', title: current.title, note: current.note, techniques: ['top-base'], from: 'pt', handFixed: [] });
});

test('the switch files nothing when there was no old class or it was the same class', () => {
  assert.equal(switchOver({ next }, '2026-11-30').archive, null);
  assert.equal(switchOver({ ...current, next: { ...current, weekOf: '2026-11-30' } }, '2026-11-30').archive, null);
});

test('a new class is worth filing; a corrected date, an empty class or the same class is not', () => {
  assert.equal(worthArchiving(current, next), true);
  assert.equal(worthArchiving(current, { ...next, weekOf: current.weekOf }), false);
  assert.equal(worthArchiving({ weekOf: '2026-11-16', title: {}, techniques: [] }, next), false);
  assert.equal(worthArchiving({}, next), false);
  assert.equal(worthArchiving(current, { ...current, weekOf: '2026-11-30' }), false);
  assert.equal(worthArchiving(current, { ...current, weekOf: '2026-11-30', techniques: ['top-base', 'top-posture'] }), true);
});

test('a past week keeps how it was written, so it can be reused', () => {
  assert.deepEqual(pastEntry({ weekOf: '2026-11-23' }), { weekOf: '2026-11-23', title: {}, note: {}, techniques: [] });
  assert.deepEqual(pastEntry({ ...next, written: { title: 'en' }, updatedBy: 'x' }).written, { title: 'en' });
  assert.equal(pastEntry({ ...next, updatedBy: 'x' }).updatedBy, undefined);
});

test('students see the replaced class first among past weeks, once, and never this week', () => {
  const older = { weekOf: '2026-11-16', title: { en: 'Posture' } };
  const shown = weekOn(stored, '2026-11-30');
  assert.deepEqual(pastWeeksShown([older], shown.week, shown.previous).map((week) => week.weekOf), ['2026-11-23', '2026-11-16']);
  const filed = [{ weekOf: '2026-11-23' }, older];
  assert.deepEqual(pastWeeksShown(filed, shown.week, shown.previous).map((week) => week.weekOf), ['2026-11-23', '2026-11-16']);
  assert.deepEqual(pastWeeksShown([{ weekOf: '2026-11-30' }, ...filed], shown.week, null).map((week) => week.weekOf), ['2026-11-23', '2026-11-16']);
  assert.deepEqual(pastWeeksShown([], null, null), []);
});

test('two classes never share a date: next week starts after today and after this week', () => {
  // Saturday 28 November, this week dated ahead to Monday 30.
  const today = '2026-11-28';
  assert.equal(firstStart(today, '2026-11-30'), '2026-12-07', 'the default is the Monday after this week');
  assert.equal(firstStart(today, '2026-11-23'), '2026-11-30');
  assert.equal(firstStart(today), '2026-11-30');
  assert.equal(dateProblem('next', '2026-11-30', { today, thisWeekOf: '2026-11-30' }), 'startAfterToday', 'the same date as this week');
  assert.equal(dateProblem('next', '2026-11-28', { today, thisWeekOf: '2026-11-23' }), 'startAfterToday', 'today');
  assert.equal(dateProblem('next', '2026-12-07', { today, thisWeekOf: '2026-11-30' }), '');
  assert.equal(dateProblem('week', '2026-11-30', { today, nextWeekOf: '2026-11-30' }), 'beforeNextWeek');
  assert.equal(dateProblem('week', '2026-12-01', { today, nextWeekOf: '2026-11-30' }), 'beforeNextWeek');
  assert.equal(dateProblem('week', '2026-11-29', { today, nextWeekOf: '2026-11-30' }), '');
  assert.equal(dateProblem('week', '2026-11-30', { today }), '', 'no next week prepared');
});
