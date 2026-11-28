// The lists and limits firestore.rules repeats from the site's code, checked against the code itself, run by
// tests/rules.test.js with its helpers: every theme, belt, kids' belt and class a person can pick saves; a game at
// every limit of js/game-clock.js saves and one past any of them does not; a TV session's fields are the rules' own.
import { readFileSync } from 'node:fs';
import { themes, belts, kidsBelts, audiences } from '../js/content.js';
import { limits, sessionFields, gameProblems } from '../js/game-clock.js';

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const coach = 'coach@example.com';
const text = (length) => ({ pt: 'x'.repeat(length), en: 'x'.repeat(length) });

function gameAt(top) {
  const end = (range) => range[top ? 1 : 0];
  const part = { label: text(top ? limits.label : 1), seconds: end(limits.seconds), say: text(top ? limits.say : 1) };
  return {
    n: text(top ? limits.name : 1), start: text(top ? limits.line : 1), top: text(top ? limits.line : 1), bottom: text(top ? limits.line : 1),
    parts: Array(top ? limits.parts : 1).fill(part), rounds: end(limits.rounds), rest: end(limits.rest), ready: end(limits.ready), switch: top,
  };
}

// Games one step past a limit, each with a name saying which.
function gamesPastLimits() {
  const longest = gameAt(true);
  const part = longest.parts[0];
  const withPart = (change) => ({ ...longest, parts: [{ ...part, ...change }] });
  const ranges = ['rounds', 'rest', 'ready'].flatMap((field) => [
    [`${field} below ${limits[field][0]}`, { ...longest, [field]: limits[field][0] - 1 }],
    [`${field} above ${limits[field][1]}`, { ...longest, [field]: limits[field][1] + 1 }],
  ]);
  return [
    ['a name too long', { ...longest, n: text(limits.name + 1) }],
    ...['start', 'top', 'bottom'].map((field) => [`${field} too long`, { ...longest, [field]: text(limits.line + 1) }]),
    ['too many parts', { ...longest, parts: Array(limits.parts + 1).fill(part) }],
    ['a label too long', withPart({ label: text(limits.label + 1) })],
    ['what a part says too long', withPart({ say: text(limits.say + 1) })],
    ['a part too short', withPart({ seconds: limits.seconds[0] - 1 })],
    ['a part too long', withPart({ seconds: limits.seconds[1] + 1 })],
    ...ranges,
  ];
}

export function listRuleTests({ test, assert, write }) {
  test('every theme, belt, kids\' belt and class the site offers can be saved with the settings', async () => {
    const save = (change) => write('users/student-uid', { email: 'student@example.com', language: 'en', theme: 'dark', favorites: [], ...change }, 'student');
    for (const theme of ['', ...themes]) assert.equal(await save({ theme }), 'allowed', `theme ${theme}`);
    for (const belt of ['', ...belts, ...kidsBelts]) assert.equal(await save({ belt }), 'allowed', `belt ${belt}`);
    for (const audience of audiences) assert.equal(await save({ audience }), 'allowed', `class ${audience}`);
  });

  test('a game at the limits of js/game-clock.js saves; one past any limit does not, there or in the rules', async () => {
    const id = 'coach-ab12cd34';
    const save = (game) => write('site/games', { games: { [id]: game }, changed: id, updatedBy: coach }, 'admin');
    for (const top of [false, true]) {
      assert.deepEqual(gameProblems(gameAt(top)), [], `the game at its ${top ? 'highest' : 'lowest'}`);
      assert.equal(await save(gameAt(top)), 'allowed', `the game at its ${top ? 'highest' : 'lowest'}`);
    }
    for (const [why, game] of gamesPastLimits()) {
      assert.notDeepEqual(gameProblems(game), [], why);
      assert.equal(await save(game), 'denied', why);
    }
  });

  test('a TV session\'s fields are the ones firestore.rules allows, and each one is needed', async () => {
    const listed = rules.match(/function validSession\(\)[\s\S]*?let fields = \[([^\]]*)\]/)[1].match(/'([^']+)'/g).map((name) => name.slice(1, -1));
    assert.deepEqual(listed, [...sessionFields, 'updatedAt']);
    const session = { name: 'Front mat', language: 'en', show: null, clock: { running: false, step: 0, left: 10, added: 0 }, beeps: true, stamp: 'abc' };
    assert.deepEqual(Object.keys(session), sessionFields);
    assert.equal(await write('tv/K7P3N', session, 'admin'), 'allowed');
    for (const field of sessionFields) {
      const without = { ...session };
      delete without[field];
      assert.equal(await write('tv/K7P3N', without, 'admin'), 'denied', `without ${field}`);
    }
  });
}
