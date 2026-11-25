import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  gameSteps, showSteps, totalSeconds, gameLength, clockText, startClock, advance, toggle, nextPart, backPart, addTime,
  restart, stepLength, timeLeft, rolesSwitched, gameProblems, clockGame, isOver, caughtUp, freshSlack,
} from '../js/game-clock.js';
import { newCode, isCode, typedCode, codeLetters } from '../js/tv-code.js';

const say = (words) => ({ pt: words, en: words });
const game = {
  n: say('Progressive passing'), start: say('Open guard'), top: say('Side control 3 s'), bottom: say('No pass'),
  parts: [{ label: say('Slow'), seconds: 60, say: say('Slowly') }, { label: say('Fast'), seconds: 30, say: say('Fast') }],
  rounds: 2, rest: 90, ready: 10, switch: true,
};

test('a game is get ready, then each round\'s parts, with a rest between rounds (not after the last)', () => {
  const steps = gameSteps(game);
  assert.deepEqual(steps.map((step) => [step.kind, step.seconds, step.round]), [
    ['ready', 10, 1], ['work', 60, 1], ['work', 30, 1], ['rest', 90, 1], ['work', 60, 2], ['work', 30, 2],
  ]);
  assert.equal(gameLength(game), 280);
  assert.equal(rolesSwitched(steps[1]), false);
  assert.equal(rolesSwitched(steps[4]), true, 'the second round has the roles switched');
  assert.deepEqual(gameSteps({ ...game, ready: 0, rest: 0, rounds: 1 }).map((step) => step.kind), ['work', 'work']);
  assert.equal(rolesSwitched(gameSteps({ ...game, switch: false })[4]), false);
});

test('a lesson plan runs its blocks, with the game\'s own parts in place of the game block', () => {
  const blocks = [{ title: say('Warm-up'), say: say(''), seconds: 600 }, { title: say('Game'), say: say(''), seconds: 900 }, { title: say('Log'), say: say(''), seconds: 180 }];
  const steps = showSteps({ title: say('Class'), blocks, game, gameAt: 1 });
  assert.deepEqual(steps.map((step) => step.kind), ['block', 'ready', 'work', 'work', 'rest', 'work', 'work', 'block']);
  assert.equal(totalSeconds(steps), 600 + 280 + 180);
  assert.deepEqual(showSteps({ title: say('One game'), blocks: [], game, gameAt: 0 }).map((step) => step.kind), gameSteps(game).map((step) => step.kind));
  assert.equal(showSteps({ title: say('No game'), blocks, game: null, gameAt: 1 }).length, 3);
  assert.deepEqual(showSteps(null), []);
});

test('the clock counts down through the steps by itself, and stops at the end', () => {
  const steps = gameSteps(game);
  const paused = startClock(steps);
  assert.deepEqual(paused, { running: false, step: 0, left: 10, added: 0 });
  assert.deepEqual(advance(steps, paused, 100), paused, 'a paused clock stays put');
  const running = toggle(steps, paused);
  assert.equal(running.running, true);
  assert.deepEqual(advance(steps, running, 4), { running: true, step: 0, left: 6, added: 0 });
  assert.deepEqual(advance(steps, running, 10), { running: true, step: 1, left: 60, added: 0 }, 'a step that runs out hands over');
  assert.deepEqual(advance(steps, running, 75), { running: true, step: 2, left: 25, added: 0 });
  const end = advance(steps, running, 1000);
  assert.ok(isOver(steps, end));
  assert.equal(end.running, false);
  assert.equal(timeLeft(steps, end), 0);
  assert.equal(timeLeft(steps, running), 280);
  assert.equal(timeLeft(steps, advance(steps, running, 75)), 25 + 90 + 60 + 30);
});

test('Start / Pause, Next part, Back a part, +30 s and Restart', () => {
  const steps = gameSteps(game);
  const running = { running: true, step: 1, left: 40, added: 0 };
  assert.deepEqual(toggle(steps, running), { ...running, running: false }, 'pause keeps the time left');
  assert.deepEqual(nextPart(steps, running), { running: true, step: 2, left: 30, added: 0 });
  assert.ok(isOver(steps, nextPart(steps, { running: true, step: steps.length - 1, left: 5, added: 0 })), 'next after the last part ends it');
  assert.deepEqual(backPart(steps, running), { running: true, step: 1, left: 60, added: 0 }, 'back goes to the start of this part');
  assert.deepEqual(backPart(steps, { running: true, step: 1, left: 59, added: 0 }), { running: true, step: 0, left: 10, added: 0 }, 'pressed again at once, the part before');
  assert.deepEqual(backPart(steps, { running: false, step: 0, left: 10, added: 0 }), { running: false, step: 0, left: 10, added: 0 }, 'nothing before the first');
  const over = { running: false, step: steps.length, left: 0, added: 0 };
  assert.deepEqual(backPart(steps, over), { running: false, step: steps.length - 1, left: 30, added: 0 }, 'back after the end shows the last part');
  const more = addTime(steps, running);
  assert.deepEqual(more, { running: true, step: 1, left: 70, added: 30 });
  assert.equal(stepLength(steps, more), 90, 'the progress bar counts the added time');
  assert.deepEqual(advance(steps, more, 70), { running: true, step: 2, left: 30, added: 0 }, 'the added time runs out like any other');
  assert.deepEqual(addTime(steps, over), over, 'nothing to add to once it is over');
  assert.deepEqual(restart(steps), startClock(steps));
  assert.deepEqual(toggle(steps, over), { running: true, step: 0, left: 10, added: 0 }, 'Start after the end starts again');
});

test('a TV counts a change from its arrival, but a reload counts on from the coach’s last press', () => {
  // A change while the TV listens: from now, whatever the two clocks say; the gap between them is learned.
  assert.deepEqual(caughtUp({ lag: 30000, skew: null, live: true }), { elapsed: 0, skew: 30000 });
  assert.deepEqual(caughtUp({ lag: 31000, skew: 30000, live: true }), { elapsed: 0, skew: 31000 });
  // Reloaded 20 s after the last press: 20 s already gone, with the TV's clock 30 s ahead of the database's.
  assert.deepEqual(caughtUp({ lag: 50000, skew: 30000, live: false }), { elapsed: 20, skew: 30000 });
  // A new TV knows no gap yet: it trusts the clocks, never counting backwards.
  assert.deepEqual(caughtUp({ lag: 20000, skew: null, live: false }), { elapsed: 20, skew: null });
  assert.deepEqual(caughtUp({ lag: -4000, skew: null, live: false }), { elapsed: 0, skew: null });
  // A change missed while offline arrives late: counted from its save.
  assert.deepEqual(caughtUp({ lag: 30000 + freshSlack + 60000, skew: 30000, live: true }), { elapsed: 65, skew: 30000 });
  // A save without its time yet: from now.
  assert.deepEqual(caughtUp({ lag: NaN, skew: 5, live: false }), { elapsed: 0, skew: 5 });
  // So a running clock reloaded 20 s on shows 20 s less, as the phone does.
  const steps = showSteps({ blocks: [{ title: 'Warm-up', seconds: 600 }] });
  const { elapsed } = caughtUp({ lag: 20000, skew: 0, live: false });
  assert.equal(advance(steps, { running: true, step: 0, left: 599, added: 0 }, elapsed).left, 579);
});

test('the clocks show minutes and seconds, a part of a second as a whole one', () => {
  assert.equal(clockText(0), '0:00');
  assert.equal(clockText(9.2), '0:10');
  assert.equal(clockText(60), '1:00');
  assert.equal(clockText(754), '12:34');
  assert.equal(clockText(-3), '0:00');
});

test('a game is checked against the same limits as the database', () => {
  assert.deepEqual(gameProblems(game), []);
  assert.deepEqual(gameProblems(clockGame({ ...game, id: 'x', d: say('extra'), time: '2 min' })), [], 'only the clock\'s fields are kept');
  assert.ok(gameProblems({ ...game, parts: [] }).length);
  assert.ok(gameProblems({ ...game, rounds: 0 }).length);
  assert.ok(gameProblems({ ...game, rest: 601 }).length);
  assert.ok(gameProblems({ ...game, ready: 1.5 }).length);
  assert.ok(gameProblems({ ...game, switch: 'yes' }).length);
  assert.ok(gameProblems({ ...game, n: { pt: 'x'.repeat(81), en: 'x' } }).length);
  assert.ok(gameProblems({ ...game, parts: [{ ...game.parts[0], seconds: 4 }] }).length);
  assert.ok(gameProblems({ ...game, parts: Array(7).fill(game.parts[0]) }).length);
  assert.ok(gameProblems({ ...game, n: { pt: 'Só português' } }).length, 'both languages');
});

test('a TV code is 4 unmistakable characters whose last one checks the others', () => {
  assert.equal(codeLetters.length, 31);
  assert.doesNotMatch(codeLetters, /[01ILO]/);
  let seed = 7;
  const random = () => { seed = (seed * 17 + 5) % 31; return seed; };
  for (let i = 0; i < 200; i++) {
    const code = newCode(random);
    assert.ok(isCode(code), code);
    // Every single wrong character, and every two side by side swapped, is refused.
    for (let at = 0; at < 4; at++) {
      for (const letter of codeLetters) if (letter !== code[at]) assert.equal(isCode(code.slice(0, at) + letter + code.slice(at + 1)), false, `${code} → ${letter} at ${at}`);
      if (at < 3 && code[at] !== code[at + 1]) assert.equal(isCode(code.slice(0, at) + code[at + 1] + code[at] + code.slice(at + 2)), false);
    }
  }
  assert.equal(typedCode(' k7p-4 '), 'K7P4');
  assert.equal(isCode('ABC'), false);
  assert.equal(isCode('AB0D'), false);
});
