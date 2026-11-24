import { test } from 'node:test';
import assert from 'node:assert/strict';
import { studentSummary, studentList, marksByPart } from '../js/roster.js';

const ana = {
  uid: 'a', name: 'Ána Souza', email: 'ana@example.com', belt: 'blue', updatedAt: 2000,
  favorites: ['top-base', 'gone-technique'], progress: { 'top-base': 'done', 'fund-shrimp': 'learning', 'top-posture': 'done', 'gone-technique': 'done', 'top-odd': 'maybe' },
  notes: { 'top-base': 'should never be read' },
};
const bruno = { uid: 'b', name: 'Bruno', email: 'bruno@example.com', updatedAt: 5000, favorites: [], progress: { 'fund-shrimp': 'done' } };
const nameless = { uid: 'c', email: 'zed@example.com' };
const known = (id) => id !== 'gone-technique';

test('a student is counted: drilling, got it, tree, belt and last active', () => {
  assert.deepEqual(studentSummary(ana, known), {
    uid: 'a', name: 'Ána Souza', email: 'ana@example.com', belt: 'blue', learning: 1, done: 2, favorites: 1, lastActive: 2000,
  });
});

test('a student with nothing marked yet, and odd stored values, count as zero', () => {
  assert.deepEqual(studentSummary(nameless), { uid: 'c', name: '', email: 'zed@example.com', belt: '', learning: 0, done: 0, favorites: 0, lastActive: null });
  assert.equal(studentSummary({ uid: 'd', progress: 'x', favorites: 'y', updatedAt: 'z' }).lastActive, null);
});

test('the summary never carries notes', () => {
  assert.equal('notes' in studentSummary(ana), false);
});

test('students sort by name, by last active and by how much they have learned', () => {
  const users = [bruno, nameless, ana];
  assert.deepEqual(studentList(users).map((student) => student.uid), ['a', 'b', 'c']);
  assert.deepEqual(studentList(users, { order: 'active' }).map((student) => student.uid), ['b', 'a', 'c']);
  assert.deepEqual(studentList(users, { order: 'done', known }).map((student) => student.uid), ['a', 'b', 'c']);
  assert.deepEqual(studentList(users, { order: 'nonsense' }).map((student) => student.uid), ['a', 'b', 'c']);
});

test('finding a student by part of a name or email, ignoring accents and case', () => {
  assert.deepEqual(studentList([ana, bruno, nameless], { find: 'ana' }).map((student) => student.uid), ['a']);
  assert.deepEqual(studentList([ana, bruno, nameless], { find: 'SOUZA án' }).map((student) => student.uid), ['a']);
  assert.deepEqual(studentList([ana, bruno, nameless], { find: 'zed' }).map((student) => student.uid), ['c']);
  assert.deepEqual(studentList([ana, bruno, nameless], { find: '  ' }).length, 3);
  assert.deepEqual(studentList([ana, bruno], { find: 'nobody' }), []);
});

test('a student\'s marks are grouped by part of the fight, in the curriculum\'s order and place', () => {
  const places = {
    'fund-shrimp': { moduleKey: 'fund', stageIndex: 0, index: 2 },
    'top-base': { moduleKey: 'top', stageIndex: 1, index: 0 },
    'top-posture': { moduleKey: 'top', stageIndex: 0, index: 3 },
    'top-odd': { moduleKey: 'top', stageIndex: 0, index: 0 },
  };
  const groups = marksByPart(ana, (id) => places[id] || null, ['fund', 'bottom', 'top']);
  assert.deepEqual(groups, [
    { part: 'fund', techniques: [{ id: 'fund-shrimp', progress: 'learning', favorite: false }] },
    { part: 'top', techniques: [
      { id: 'top-posture', progress: 'done', favorite: false },
      { id: 'top-base', progress: 'done', favorite: true },
    ] },
  ]);
  assert.deepEqual(marksByPart(nameless, () => null, ['top']), []);
});
