// The games on the TV in tests/signed-in.mjs, against the emulators: TV screens (signed out) and coaches' phones
// (admin page, "Run on the TV"). Pairing (and a wrong code refused), the phone's buttons reaching the TV, two TVs with
// their own clocks, two coaches on one TV, a student refused, a game made in the designer running on the TV, and
// the whole lesson plan running there. tools: what signed-in.mjs uses itself.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The curriculum's games, to know what the TV should say about the one it shows.
const guard = JSON.parse(readFileSync(new URL('../data/content.json', import.meta.url), 'utf8'));
const curriculumGame = (id) => Object.values(guard.modules).flatMap((module) => module.games || []).find((game) => game.id === id);
const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

const television = { viewport: { width: 1280, height: 720 } };
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
// Shown on the TV within a second or two of a press on the phone.
const soon = 2500;

export async function tvSteps({ visitor, step, until, stored, seed, address, people }) {
  const openTv = async () => {
    const tv = await visitor({ email: 'a TV' }, { device: television });
    tv.writes = [];
    tv.on('request', (request) => { if (/\/Write\/|:commit|:batchWrite/.test(request.url())) tv.writes.push(request.url()); });
    await tv.goto(`${address}/?tv&emulators=${encodeURIComponent(JSON.stringify({ sub: 'tv' }))}#screen`);
    await tv.locator('.tvs-code').waitFor();
    tv.code = await tv.locator('.tvs-code').textContent();
    return tv;
  };
  const tvClock = (tv) => tv.locator('#tvsClock').textContent();
  const tvShows = (tv, selector, words, what) => until(async () => {
    const shown = await tv.locator(selector).first().textContent({ timeout: 200 }).catch(() => '(nothing)');
    if (!shown.includes(words)) throw new Error(`${selector}: ${shown}`);
    return true;
  }, what, soon);
  const openRemote = async (person) => {
    const remote = await visitor(person, { device: phone });
    await remote.open('admin.html', '#tv');
    await remote.locator('#signIn').click();
    return remote;
  };
  const pair = async (remote, code, name) => {
    await remote.locator('#tvCode').fill(code);
    await remote.locator('#tvName').fill(name);
    await remote.locator('#pairForm [type="submit"]').click();
  };
  const press = (remote, button) => remote.locator(`[data-remote="${button}"]`).click();

  await seed(`admins/${people.coach2.email}`, { name: 'Duda Coach' });
  let tv;
  let coach;
  let shown; // the curriculum game the first TV shows

  await step('the TV screen shows a code and its square, signed out, and never writes to the database', async () => {
    tv = await openTv();
    assert.match(tv.code, /^[2-9A-HJKMNP-Z]{4}$/);
    assert.ok(await tv.locator('svg.tvs-qr').count());
    await tv.waitForTimeout(1500);
    assert.deepEqual(tv.writes, []);
    assert.equal(await stored(`tv/${tv.code}`), null);
  });

  await step('pairing with a wrong code is refused, and nothing is written', async () => {
    coach = await openRemote(people.coach);
    await coach.locator('#tvCode').waitFor();
    const wrong = tv.code.slice(0, 3) + (tv.code[3] === 'A' ? 'B' : 'A');
    await pair(coach, wrong, 'Front mat');
    await coach.locator('#remoteStatus', { hasText: 'No TV shows that code' }).waitFor();
    assert.equal(await stored(`tv/${wrong}`), null);
  });

  await step('pairing shows the game on the TV, with its name and the get-ready clock', async () => {
    await pair(coach, tv.code.toLowerCase(), 'Front mat');
    const session = await until(() => stored(`tv/${tv.code}`), 'the session is saved');
    shown = curriculumGame(session.show.game);
    assert.ok(shown, 'a curriculum game: the lesson builder’s, or the first');
    await tvShows(tv, '.tvs-title', shown.n.en, 'the TV shows the game');
    assert.equal(await tvClock(tv), clock(shown.ready));
    assert.match(await tv.locator('.tvs-phase').textContent(), /Get ready/);
    assert.match(await tv.locator('.tvs-round').textContent(), new RegExp(`Round 1 of ${shown.rounds}`));
    assert.ok((await tv.locator('.tvs-sides').textContent()).includes(shown.top.en), 'how the top player wins');
    assert.equal(session.name, 'Front mat');
    assert.equal(session.updatedBy, undefined, 'no coach’s email where anyone with the code can read it');
    assert.deepEqual(tv.writes, [], 'the TV still wrote nothing');
  });

  await step('Start, Pause, Next part, +30 s, Back a part and End on the phone show on the TV within a second or two', async () => {
    await press(coach, 'toggle');
    await until(async () => (await tvClock(tv)) !== clock(shown.ready), 'the TV clock runs', soon);
    await press(coach, 'toggle');
    await coach.locator('#remoteToggle', { hasText: 'Resume' }).waitFor({ timeout: soon });
    await tv.waitForTimeout(1200);
    const paused = await tvClock(tv);
    await tv.waitForTimeout(1200);
    assert.equal(await tvClock(tv), paused, 'paused on the TV');
    await press(coach, 'next');
    await tvShows(tv, '.tvs-phase', shown.parts[0].label.en, 'the TV shows the next part');
    assert.equal(await tvClock(tv), clock(shown.parts[0].seconds));
    await press(coach, 'more');
    await tvShows(tv, '#tvsClock', clock(shown.parts[0].seconds + 30), 'the TV shows 30 s more');
    await press(coach, 'back');
    await tvShows(tv, '.tvs-phase', 'Get ready', 'back to the part before');
    await press(coach, 'end');
    await tvShows(tv, '.tvs-how', 'Choose a game', 'the TV waits for the next game');
    assert.equal(await tv.locator('.tvs-name').textContent(), 'Front mat');
  });

  let second;
  await step('a second TV keeps its own clock', async () => {
    await coach.locator('[data-remote-tv]').first().waitFor();
    await coach.selectOption('#remoteShow', 'top-game-hold-the-mount');
    await press(coach, 'show');
    await tvShows(tv, '.tvs-title', 'Hold the mount', 'the first TV shows its game');
    second = await openTv();
    assert.notEqual(second.code, tv.code, 'each TV has its own code');
    await press(coach, 'another');
    await pair(coach, second.code, 'Back mat');
    await second.locator('.tvs-game').waitFor({ timeout: soon });
    await press(coach, 'toggle');
    await until(async () => (await tvClock(second)) < '0:10', 'the second TV runs', soon);
    await tv.waitForTimeout(1500);
    assert.equal(await tvClock(tv), '0:10', 'the first TV stays paused');
    await coach.locator(`[data-remote-tv="${tv.code}"]`).click();
    await coach.locator('#remoteTime', { hasText: '0:10' }).waitFor({ timeout: soon });
    assert.deepEqual(JSON.parse(await coach.evaluate(() => localStorage.getItem('sg-tvs'))).map((each) => each.name), ['Front mat', 'Back mat'], 'the phone remembers both');
  });

  await step('another coach pairs with the same TV, finds its game, and pauses it', async () => {
    await press(coach, 'toggle');
    await until(async () => (await tvClock(tv)) < '0:10', 'the TV runs', soon);
    const other = await openRemote(people.coach2);
    await pair(other, tv.code, 'Front mat');
    await other.locator('#remoteToggle', { hasText: 'Pause' }).waitFor({ timeout: soon });
    assert.equal(await other.locator('#remoteShow').inputValue(), 'top-game-hold-the-mount', 'the game the TV shows, not replaced');
    await press(other, 'toggle');
    await other.locator('#remoteToggle', { hasText: 'Resume' }).waitFor({ timeout: soon });
    await tv.waitForTimeout(1200);
    const paused = await tvClock(tv);
    await tv.waitForTimeout(1200);
    assert.equal(await tvClock(tv), paused, 'the second coach paused it');
    await other.context().close();
  });

  await step('a student cannot control a TV: no remote, and the database refuses', async () => {
    const student = await openRemote(people.other);
    await student.locator('main', { hasText: 'can only view the site' }).waitFor();
    assert.equal(await student.locator('#remote').isVisible(), false);
    student.tryingRefused = true;
    const answer = await student.evaluate(async (code) => {
      const { writeTv } = await import('/js/firebase-tv.js');
      try {
        await writeTv(code, { name: 'Mine', language: 'en', show: null, clock: { running: false, step: 0, left: 0, added: 0 }, beeps: false, stamp: 'x' });
        return 'allowed';
      } catch (error) {
        return error.code || error.message;
      }
    }, tv.code);
    student.tryingRefused = false;
    assert.equal(answer, 'permission-denied');
    assert.equal((await stored(`tv/${tv.code}`)).name, 'Front mat');
    await student.context().close();
  });

  let made = '';
  await step('a game made in the game designer is saved, appears in the lesson builder and runs on the TV', async () => {
    const builder = await coach.context().newPage();
    await builder.goto(`${address}/?emulators=${encodeURIComponent(JSON.stringify(people.coach))}#lesson`);
    await builder.locator('[data-designer="open"]').click();
    await builder.selectOption('#designFrom', 'top-game-hold-the-mount');
    assert.equal(await builder.locator('#designName').inputValue(), 'Hold the mount');
    await builder.locator('#designName').fill('Mount marathon');
    await builder.locator('#designRounds').fill('2');
    await builder.locator('#partSeconds0').fill('45');
    assert.equal(await builder.locator('#designTotal').textContent(), 'Whole game: 1:55');
    await builder.locator('[data-designer="save"]').click();
    await builder.locator('#designStatus', { hasText: 'Saved' }).waitFor();
    const games = (await stored('site/games')).games;
    made = Object.keys(games).find((id) => games[id].n.en === 'Mount marathon');
    assert.match(made || '', /^coach-[a-z0-9]{8}$/);
    assert.equal(games[made].n.pt, 'PT: Mount marathon', 'the other language translated (by the test\'s translator)');
    assert.equal(games[made].rounds, 2);
    assert.equal(games[made].parts[0].seconds, 45);
    assert.equal(await builder.locator(`#selGame option[value="${made}"]`).textContent(), 'Mount marathon · coach’s game');
    // The lesson's game is the new one, for the whole class below.
    await builder.selectOption('#selGame', made);
    await until(() => builder.evaluate((id) => JSON.parse(localStorage.getItem('sg-settings')).lesson?.game === id, made), 'the lesson keeps the game');
    await builder.close();

    await coach.reload();
    await coach.locator('#remoteShow').waitFor();
    await coach.selectOption('#remoteShow', made);
    await press(coach, 'show');
    await tvShows(tv, '.tvs-title', 'Mount marathon', 'the TV shows the coach\'s game');
    assert.match(await tv.locator('.tvs-round').textContent(), /Round 1 of 2/);
    await press(coach, 'next');
    await tvShows(tv, '#tvsClock', '0:45', 'its first part, 45 s');
  });

  // The TV counts on from the coach's last press, not from when it loaded: a reload mid-run keeps the phone's time.
  await step('a TV reloaded while its clock runs shows the same time as the phone', async () => {
    await coach.selectOption('#remoteShow', 'lesson');
    await press(coach, 'show');
    await tvShows(tv, '.tvs-phase', 'Warm-up', 'the plan is on the TV');
    await press(coach, 'toggle');
    const seconds = (text) => text.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);
    await until(async () => seconds(await tvClock(tv)) < 600, 'the TV clock runs', soon);
    await tv.waitForTimeout(8000);
    await tv.reload();
    await tv.locator('#tvsClock').waitFor({ timeout: soon });
    await tv.waitForTimeout(500);
    const [onTv, onPhone] = [seconds(await tvClock(tv)), seconds(await coach.locator('#remoteTime').textContent())];
    assert.ok(onPhone < 595, `the clock ran on the phone (${onPhone} s)`);
    assert.ok(Math.abs(onTv - onPhone) <= 1, `the TV shows ${onTv} s, the phone ${onPhone} s`);
    await press(coach, 'end');
    await tvShows(tv, '.tvs-how', 'Choose a game', 'ended');
  });

  await step('the whole class runs on the TV: each block on the clock, and the game\'s own parts at the game', async () => {
    await coach.selectOption('#remoteShow', 'lesson');
    await press(coach, 'show');
    await tvShows(tv, '.tvs-phase', 'Warm-up', 'the plan starts with the warm-up');
    assert.equal(await tvClock(tv), '10:00');
    assert.match(await tv.locator('.tvs-round').textContent(), /Part 1 of 6/);
    for (const block of ['Concept', 'Techniques']) {
      await press(coach, 'next');
      await tvShows(tv, '.tvs-phase', block, `then ${block}`);
    }
    await press(coach, 'next');
    await tvShows(tv, '.tvs-phase', 'Get ready', 'the game takes over');
    assert.match(await tv.locator('.tvs-title').textContent(), /Mount marathon/);
    for (let press_ = 0; press_ < 4; press_++) await press(coach, 'next');
    await tvShows(tv, '.tvs-phase', 'BJJ chess or live', 'after the game, the plan carries on');
    assert.match(await tv.locator('.tvs-round').textContent(), /Part 5 of 6/);
    await press(coach, 'end');
    await tvShows(tv, '.tvs-how', 'Choose a game', 'ended');
    await coach.context().close();
    await tv.context().close();
    await second.context().close();
  });
}
