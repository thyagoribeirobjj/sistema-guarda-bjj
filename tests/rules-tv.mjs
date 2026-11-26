// The rules of the games on the TV (site/games and tv/{code}), run by tests/rules.test.js with its helpers, so they
// share its emulator and its clean start before each test.
const say = (words) => ({ pt: words, en: words });
const game = {
  n: say('Hold the mount'), start: say('Mount'), top: say('30 s in mount'), bottom: say('Reach guard'),
  parts: [{ label: say('Hold or escape'), seconds: 30, say: say('Bottom uses the four escapes.') }],
  rounds: 4, rest: 15, ready: 10, switch: true,
};
const show = { game: 'top-game-hold-the-mount' };
const clock = { running: false, step: 0, left: 10, added: 0 };
const session = (email, change = {}) => ({ name: 'Front mat', language: 'en', show, clock, beeps: true, stamp: 'abc', ...change });
const coach = 'coach@example.com';
const id = 'coach-ab12cd34';

export function tvRuleTests({ test, assert, read, write, remove }) {
  const saveGames = (games, changed, who = 'admin', email = coach) => write('site/games', { games, changed, updatedBy: email }, who);

  test('the coaches\' own games: anyone reads them, only an admin saves them', async () => {
    assert.equal(await read('site/games'), 'allowed');
    assert.equal(await saveGames({ [id]: game }, id, 'student', 'student@example.com'), 'denied');
    assert.equal(await saveGames({ [id]: game }, id, null, ''), 'denied');
    assert.equal(await saveGames({ [id]: game }, id), 'allowed');
    assert.equal(await read('site/games'), 'allowed');
    assert.equal(await saveGames({}, id), 'allowed', 'a game can be deleted');
    assert.equal(await remove('site/games', 'student'), 'denied');
  });

  test('a coach\'s game: one per save, in the clock\'s shape and limits', async () => {
    const other = 'coach-zz99yy88';
    await write('site/games', { games: { [other]: game }, changed: other, updatedBy: coach }, 'setup');
    assert.equal(await saveGames({ [other]: game, [id]: game }, id), 'allowed');
    assert.equal(await saveGames({ [other]: { ...game, rounds: 2 }, [id]: { ...game, rounds: 3 } }, id), 'denied', 'two games changed in one save');
    assert.equal(await saveGames({ [other]: game, [id]: game }, id, 'admin', 'someone@example.com'), 'denied', 'updatedBy is who saves');
    assert.equal(await write('site/games', { games: { [other]: game, [id]: game }, changed: id }, 'admin'), 'denied', 'updatedBy is needed');
    const bad = [
      { ...game, extra: 1 }, { ...game, rounds: 0 }, { ...game, rounds: 21 }, { ...game, rest: 601 }, { ...game, ready: 61 },
      { ...game, switch: 'yes' }, { ...game, parts: [] }, { ...game, parts: Array(7).fill(game.parts[0]) }, { ...game, parts: 'many' },
      { ...game, parts: [{ ...game.parts[0], seconds: 4 }] }, { ...game, parts: [{ ...game.parts[0], seconds: 1801 }] },
      { ...game, parts: [game.parts[0], { label: say('x') }] }, { ...game, n: { pt: 'x'.repeat(81), en: 'x' } }, { ...game, n: { de: 'Spiel' } }, { ...game, n: { pt: 'Só português' } },
      { ...game, parts: [{ ...game.parts[0], say: say('x'.repeat(301)) }] },
    ];
    for (const wrong of bad) assert.equal(await saveGames({ [other]: game, [id]: wrong }, id), 'denied', JSON.stringify(wrong).slice(0, 80));
    assert.equal(await saveGames({ [other]: game, 'top-base': game }, 'top-base'), 'denied', 'a coach\'s game id starts with coach-');
    const longest = { ...game, n: say('x'.repeat(80)), parts: Array(6).fill({ label: say('x'.repeat(60)), seconds: 1800, say: say('x'.repeat(300)) }) };
    const many = Object.fromEntries(Array.from({ length: 49 }, (_, i) => [`coach-many${String(i).padStart(4, '0')}`, game]));
    await write('site/games', { games: many, changed: 'coach-many0000', updatedBy: coach }, 'setup');
    assert.equal(await saveGames({ ...many, [id]: longest }, id), 'allowed', 'the 50th game, with six parts at their longest');
    assert.equal(await saveGames({ ...many, [id]: longest, 'coach-toomany1': game }, 'coach-toomany1'), 'denied', 'a 51st game');
    assert.equal(await write('site/games', { games: { [id]: game }, changed: id, updatedBy: coach }, 'admin'), 'denied', 'the generic site rule does not cover games');
  });

  test('a TV session: anyone can get one by its code; only a coach can list them', async () => {
    await write('tv/K7P3N', session(coach), 'setup');
    assert.equal(await read('tv/K7P3N'), 'allowed');
    assert.equal(await read('tv/K7P3N', 'student'), 'allowed');
    assert.equal(await read('tv'), 'denied', 'signed out (a TV, or anyone)');
    assert.equal(await read('tv', 'student'), 'denied');
    assert.equal(await read('tv', 'unverifiedAdmin'), 'denied');
    assert.equal(await read('tv', 'admin'), 'allowed', 'a coach, to delete old sessions');
  });

  test('only an admin starts, changes and ends a TV session; signed out (the TV itself) never can', async () => {
    assert.equal(await write('tv/K7P3N', session('')), 'denied');
    assert.equal(await write('tv/K7P3N', session('student@example.com'), 'student'), 'denied');
    assert.equal(await write('tv/K7P3N', session('unverified@example.com'), 'unverifiedAdmin'), 'denied');
    assert.equal(await write('tv/K7P3N', session(coach), 'admin'), 'allowed');
    assert.equal(await write('tv/K7P3N', session(coach, { clock: { ...clock, running: true } }), 'admin'), 'allowed');
    assert.equal(await write('tv/K7P3N', session('student@example.com', { show: null }), 'student'), 'denied');
    assert.equal(await remove('tv/K7P3N'), 'denied');
    assert.equal(await remove('tv/K7P3N', 'student'), 'denied');
    assert.equal(await remove('tv/K7P3N', 'admin'), 'allowed');
  });

  test('a TV session has the expected shape and limits, and a TV code\'s letters', async () => {
    const save = (change, code = 'K7P3N') => write(`tv/${code}`, session(coach, change), 'admin');
    assert.equal(await save({ show: null }), 'allowed', 'nothing on the TV yet');
    assert.equal(await save({ show: { lesson: { mod: 'top', dur: '60', items: ['0-0', '1-2'], game: 'coach-ab12cd34' } } }), 'allowed', 'a lesson plan');
    const bad = [
      { extra: 1 }, { name: 'x'.repeat(41) }, { language: 'de' }, { beeps: 'yes' }, { stamp: 'x'.repeat(41) },
      { clock: { ...clock, left: -1 } }, { clock: { ...clock, left: 36001 } }, { clock: { ...clock, step: 301 } }, { clock: { ...clock, running: 'no' } },
      { clock: { running: false, step: 0, left: 10 } }, { clock: { ...clock, extra: 1 } },
      { show: { game: 'x'.repeat(81) } }, { show: { game: 7 } }, { show: {} }, { show: { game: 'top-game-hold-the-mount', extra: 1 } },
      { show: { game: 'top-game-hold-the-mount', lesson: { mod: 'top', dur: '60', items: [], game: '' } } },
      { show: { lesson: { mod: 'top', dur: '45', items: [], game: '' } } }, { show: { lesson: { mod: 'top', dur: '60', items: Array(201).fill('0-0'), game: '' } } },
      { show: { lesson: { mod: 'top', dur: '60', items: [] } } }, { show: { lesson: { mod: 'top', dur: '60', items: [], game: '', note: 'x' } } },
      { updatedBy: 'coach@example.com' },
    ];
    for (const change of bad) assert.equal(await save(change), 'denied', JSON.stringify(change).slice(0, 80));
    for (const code of ['K7P4', 'K7P3NN', 'k7p3n', 'K0P3N', 'KIP3N', 'KLP3N', 'KOP3N']) assert.equal(await save({}, code), 'denied', code);
    const missing = session(coach);
    delete missing.beeps;
    assert.equal(await write('tv/K7P3N', missing, 'admin'), 'denied', 'every field is needed');
  });
}
