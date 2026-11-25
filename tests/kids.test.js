import { test } from 'node:test';
import assert from 'node:assert/strict';
import { challengeStatus, levelOf, kidsProgress, kidsSummary } from '../js/kids-progress.js';

const game = {
  worlds: [{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }, { id: 'w4', alwaysOpen: true }],
  challenges: [
    { id: 'a', world: 'w1', xp: 10 }, { id: 'b', world: 'w1', xp: 10 }, { id: 'c', world: 'w1', xp: 10 },
    { id: 'd', world: 'w2', xp: 15 }, { id: 'e', world: 'w2', xp: 15 },
    { id: 'f', world: 'w3', xp: 20 },
    { id: 'g', world: 'w4', xp: 20 },
  ],
};
const levels = [{ xp: 0, n: 'Cub' }, { xp: 40, n: 'Little tiger' }, { xp: 100, n: 'Ninja' }];

test('a challenge is to do, waiting for the coach, done, or to try again', () => {
  assert.equal(challengeStatus(undefined, undefined), 'todo');
  assert.equal(challengeStatus(5, undefined), 'waiting');
  assert.equal(challengeStatus(5, { status: 'approved', claim: 5 }), 'done');
  assert.equal(challengeStatus(undefined, { status: 'approved', claim: 5 }), 'done', 'approved stays done');
  assert.equal(challengeStatus(5, { status: 'again', claim: 5 }), 'again', 'the coach sent this claim back');
  assert.equal(challengeStatus(9, { status: 'again', claim: 5 }), 'waiting', 'claimed again after being sent back');
  assert.equal(challengeStatus(undefined, { status: 'again', claim: 5 }), 'again');
  assert.equal(challengeStatus(5, { status: 'something', claim: 5 }), 'waiting');
});

test('the level is the highest one reached, with the next one to aim for', () => {
  assert.deepEqual(levelOf(levels, 0), { index: 0, level: levels[0], next: levels[1] });
  assert.equal(levelOf(levels, 39).index, 0);
  assert.equal(levelOf(levels, 40).index, 1);
  assert.deepEqual(levelOf(levels, 500), { index: 2, level: levels[2], next: null });
});

test('only approved challenges give XP; claims alone give nothing', () => {
  const claims = { a: 1, b: 2, d: 3 };
  assert.equal(kidsProgress(game, claims, {}).xp, 0);
  const approvals = { a: { status: 'approved', claim: 1 }, b: { status: 'again', claim: 2 }, g: { status: 'approved', claim: 0 } };
  const progress = kidsProgress(game, claims, approvals);
  assert.equal(progress.xp, 30);
  assert.deepEqual(progress.statuses, { a: 'done', b: 'again', c: 'todo', d: 'waiting', e: 'todo', f: 'todo', g: 'done' });
});

test('a world opens after 2 challenges of the world before are done; the first and the always-open ones from the start', () => {
  const approved = (...ids) => Object.fromEntries(ids.map((id) => [id, { status: 'approved', claim: 1 }]));
  const open = (approvals, options) => Object.fromEntries(Object.entries(kidsProgress(game, {}, approvals, options).worlds).map(([id, world]) => [id, world.open]));
  assert.deepEqual(open({}), { w1: true, w2: false, w3: false, w4: true });
  assert.deepEqual(open(approved('a')), { w1: true, w2: false, w3: false, w4: true }, 'one is not enough');
  assert.deepEqual(open(approved('a', 'b')), { w1: true, w2: true, w3: false, w4: true });
  assert.deepEqual(open(approved('a', 'b', 'd', 'e')), { w1: true, w2: true, w3: true, w4: true });
  assert.deepEqual(open(approved('d', 'e')), { w1: true, w2: false, w3: false, w4: true }, 'a closed world does not open the next one');
  assert.deepEqual(open({}, { allOpen: true }), { w1: true, w2: true, w3: true, w4: true });
  const oneChallenge = { worlds: [{ id: 'x' }, { id: 'y' }], challenges: [{ id: 'only', world: 'x', xp: 5 }, { id: 'next', world: 'y', xp: 5 }] };
  assert.equal(kidsProgress(oneChallenge, {}, approved('only')).worlds.y.open, true, 'a world with one challenge needs just that one');
  assert.deepEqual(kidsProgress(game, {}, approved('a', 'b')).worlds.w1, { open: true, done: 2, total: 3 });
});

test('the coach\'s summary counts what is done and what waits', () => {
  assert.deepEqual(kidsSummary(game, { a: 1, f: 2 }, { a: { status: 'approved', claim: 1 } }), { done: 1, waiting: 1, xp: 10 });
  assert.deepEqual(kidsSummary(game, undefined, undefined), { done: 0, waiting: 0, xp: 0 });
});
