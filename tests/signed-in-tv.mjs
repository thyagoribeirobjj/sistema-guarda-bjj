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

export async function tvSteps({ visitor, step, until, stored, seed, touch, address, people }) {
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
  const seconds = (text) => text.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);

  await seed(`admins/${people.coach2.email}`, { name: 'Duda Coach' });
  let tv;
  let coach;
  let shown; // the curriculum game the first TV shows

  await step('the TV screen shows a code and its square, signed out, and never writes to the database', async () => {
    tv = await openTv();
    assert.match(tv.code, /^[2-9A-HJKMNP-Z]{5}$/);
    assert.ok(await tv.locator('svg.tvs-qr').count());
    await tv.waitForTimeout(1500);
    assert.deepEqual(tv.writes, []);
    assert.equal(await stored(`tv/${tv.code}`), null);
  });

  await step('opening the remote deletes every session untouched for a day, whichever phone started it; a student cannot list them', async () => {
    const hours = (count) => new Date(Date.now() - count * 60 * 60 * 1000);
    const old = { name: 'Old', language: 'en', show: null, clock: { running: false, step: 0, left: 0, added: 0 }, beeps: true, stamp: 'old' };
    await seed('tv/K7P3N', { ...old, updatedAt: hours(30) });
    await seed('tv/K7P4', { ...old, updatedAt: hours(30) }); // from before codes had 5 characters
    await seed('tv/ABCPS', { ...old, updatedAt: hours(2) });
    const student = await openRemote(people.other);
    await student.locator('main', { hasText: 'can only view the site' }).waitFor();
    student.tryingRefused = true;
    const answer = await student.evaluate(async () => {
      const { listTvs } = await import('/js/firebase-tv.js');
      try {
        await listTvs();
        return 'allowed';
      } catch (error) {
        return error.code || error.message;
      }
    });
    student.tryingRefused = false;
    await student.context().close();
    const remote = await openRemote(people.coach);
    await remote.locator('#tvCode').waitFor();
    await until(async () => (await stored('tv/K7P3N')) === null && (await stored('tv/K7P4')) === null, 'the old sessions are deleted');
    assert.equal((await stored('tv/ABCPS')).name, 'Old', 'one used today is kept');
    await remote.context().close();
    assert.equal(answer, 'permission-denied', 'a student cannot list the TVs');
  });

  await step('pairing with a wrong code is refused, and nothing is written', async () => {
    coach = await openRemote(people.coach);
    await coach.locator('#tvCode').waitFor();
    const wrong = tv.code.slice(0, 4) + (tv.code[4] === 'A' ? 'B' : 'A');
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
    // Three quick presses all count, and the phone, following the TV live, ends on the last, not one in between.
    for (let presses = 0; presses < 3; presses += 1) await press(coach, 'more');
    await tvShows(tv, '#tvsClock', clock(shown.ready + 90), 'the TV shows 90 s more');
    await coach.waitForTimeout(2000);
    assert.equal(await coach.locator('#remoteTime').textContent(), clock(shown.ready + 90), 'the phone shows the same');
    await press(coach, 'end');
    await tvShows(tv, '.tvs-how', 'Choose a game', 'the TV waits for the next game');
    assert.equal(await tv.locator('.tvs-name').textContent(), 'Front mat');
  });

  await step('the phone ignores its own earlier change coming back after a later press', async () => {
    const mount = curriculumGame('top-game-hold-the-mount');
    await coach.selectOption('#remoteShow', mount.id);
    await press(coach, 'show');
    await tvShows(tv, '.tvs-title', 'Hold the mount', 'the TV shows the game');
    await press(coach, 'more');
    await until(async () => (await stored(`tv/${tv.code}`))?.clock.added === 30, 'the first +30 s is saved');
    // The second press shows on the phone at once; its save is held back while the first comes back to the phone, as
    // it can when the database is slow.
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    let saving = false;
    // The held save is refused once it arrives (the session changed since it was read) and is worked out again.
    coach.refusalsExpected = true;
    await coach.route(/documents:commit/, async (route) => {
      saving = true;
      await held;
      return route.continue();
    }, { times: 1 });
    await press(coach, 'more');
    await until(() => saving, 'the second +30 s is on its way');
    await coach.locator('#remoteTime', { hasText: clock(mount.ready + 60) }).waitFor({ timeout: soon });
    await touch(`tv/${tv.code}`);
    await coach.waitForTimeout(2500);
    assert.equal(await coach.locator('#remoteTime').textContent(), clock(mount.ready + 60), 'the phone keeps its later press');
    release();
    await until(async () => (await stored(`tv/${tv.code}`))?.clock.added === 60, 'the second +30 s is saved, once');
    await tvShows(tv, '#tvsClock', clock(mount.ready + 60), 'the TV shows both');
    assert.equal(await coach.locator('#remoteTime').textContent(), clock(mount.ready + 60));
    coach.refusalsExpected = false;
    await press(coach, 'end');
    await tvShows(tv, '.tvs-how', 'Choose a game', 'ended');
  });

  await step('the remote opened with no connection says so instead of "Loading", keeps trying, and carries on by itself', async () => {
    // No connection at all: not even whether this is a coach can be known. Then only the coach check gets through,
    // and the remote itself waits for its TV.
    let blocked = 'everything';
    const handler = (route) => {
      const coachCheck = /documents\/admins\//.test(decodeURIComponent(route.request().postData() || ''));
      return blocked === 'everything' || (blocked === 'all but the coach check' && !coachCheck) ? route.abort('internetdisconnected') : route.continue();
    };
    await coach.context().route(/127\.0\.0\.1:8080/, handler);
    coach.failuresExpected = true;
    try {
      await coach.reload();
      await coach.locator('main', { hasText: 'No internet connection' }).waitFor({ timeout: 10000 });
      assert.equal(await coach.locator('main', { hasText: 'can only view the site' }).count(), 0, 'not taken for a student');
      blocked = 'all but the coach check';
      await coach.locator('#remote', { hasText: 'No internet connection' }).waitFor({ timeout: 15000 });
      await coach.waitForTimeout(2000);
      assert.equal(await coach.locator('#remote', { hasText: 'No internet connection' }).count(), 1, 'still saying so while it waits');
      assert.equal(await coach.locator('#remoteClock').count(), 0, 'and not guessing what the TV shows');
      blocked = '';
      await coach.locator(`[data-remote-tv="${tv.code}"]`).waitFor({ timeout: 30000 });
      assert.equal(await coach.locator('#remote', { hasText: 'No internet connection' }).count(), 0, 'and no longer once it answers');
    } finally {
      blocked = '';
      await coach.context().unroute(/127\.0\.0\.1:8080/, handler);
      coach.failuresExpected = false;
    }
    await coach.selectOption('#remoteShow', 'top-game-hold-the-mount');
    await press(coach, 'show');
    await tvShows(tv, '.tvs-title', 'Hold the mount', 'the remote works again');
    await press(coach, 'end');
    await tvShows(tv, '.tvs-how', 'Choose a game', 'ended');
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

  await step('a phone whose clock is wrong takes in another coach\'s press at the time the TV shows', async () => {
    const other = await visitor(people.coach2, { device: phone });
    // This phone's clock is 100 s ahead of the database's (not a whole number of the game's parts).
    await other.context().addInitScript(() => {
      const real = Date.now;
      Date.now = () => real() + 100000;
    });
    await other.open('admin.html', '#tv');
    await other.locator('#signIn').click();
    await pair(other, tv.code, 'Front mat');
    await other.locator('#remoteToggle', { hasText: 'Resume' }).waitFor({ timeout: soon });
    await press(coach, 'toggle');
    await other.locator('#remoteToggle', { hasText: 'Pause' }).waitFor({ timeout: soon });
    const apart = async () => Math.abs(seconds(await other.locator('#remoteTime').textContent()) - seconds(await tvClock(tv)));
    const before = await tvClock(tv);
    await until(async () => (await tvClock(tv)) !== before, 'the TV runs', soon);
    const round = (text) => /Round (\d+)/.exec(text)?.[1];
    assert.ok(await apart() <= 1, `the phone shows the TV's time (${await other.locator('#remoteTime').textContent()} against ${await tvClock(tv)})`);
    assert.equal(round(await other.locator('#remotePhase').textContent()), round(await tv.locator('.tvs-round').textContent()), 'and its round');
    await press(coach, 'toggle');
    await other.locator('#remoteToggle', { hasText: 'Resume' }).waitFor({ timeout: soon });
    await other.context().close();
  });

  await step('a student cannot control a TV: no remote, and the database refuses', async () => {
    const student = await openRemote(people.other);
    await student.locator('main', { hasText: 'can only view the site' }).waitFor();
    assert.equal(await student.locator('#remote').isVisible(), false);
    student.tryingRefused = true;
    const answer = await student.evaluate(async (code) => {
      const { changeTv } = await import('/js/firebase-tv.js');
      try {
        await changeTv(code, () => ({ name: 'Mine', language: 'en', show: null, clock: { running: false, step: 0, left: 0, added: 0 }, beeps: false, stamp: 'x' }));
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

  await step('a coach\'s game changed in the designer while a TV shows it: the TV and a phone in another browser pick it up within seconds by themselves, the clock carrying on', async () => {
    await press(coach, 'toggle');
    await until(async () => seconds(await tvClock(tv)) < 44, 'the 45 s part runs', soon);
    const otherTv = (await stored(`tv/${second.code}`)).stamp;
    // The designer on a laptop, the remote on a phone: another browser, so no BroadcastChannel between them.
    const builder = await visitor(people.coach);
    await builder.open('', '#lesson');
    await builder.locator('#account').click();
    await builder.locator('#accountMenu #signIn').click();
    await builder.locator('[data-designer="open"]').click();
    await builder.selectOption('#designFrom', made);
    await builder.locator('#designName').fill('Mount marathon, longer');
    await builder.locator('#partSeconds0').fill('90');
    await builder.locator('[data-designer="save"]').click();
    await builder.locator('#designStatus', { hasText: 'Saved' }).waitFor();
    await tvShows(tv, '.tvs-title', 'Mount marathon, longer', 'the TV shows the game as saved, nobody sending it again');
    const onTv = seconds(await tvClock(tv));
    assert.ok(onTv > 45 && onTv < 90, `the part carries on, 90 s long now (${onTv} s left)`);
    await until(async () => Math.abs(seconds(await coach.locator('#remoteTime').textContent()) - seconds(await tvClock(tv))) <= 1, 'the phone shows the same time', soon);
    assert.equal((await stored(`tv/${second.code}`)).stamp, otherTv, 'the other TV, showing another game, is left alone');
    assert.deepEqual(tv.writes, [], 'the TV still wrote nothing');
    await press(coach, 'toggle');
    await builder.context().close();
  });

  await step('a game saved in the designer while a coach presses on the phone: neither is lost, and a laptop clock that is wrong changes nothing', async () => {
    await press(coach, 'toggle');
    await until(async () => (await coach.locator('#remoteToggle').textContent()) === 'Pause', 'the part runs', soon);
    // The laptop's clock is two minutes ahead of the database's.
    const builder = await visitor(people.coach);
    builder.refusalsExpected = true; // its held save, refused once it arrives, and worked out again
    await builder.context().addInitScript(() => {
      const real = Date.now;
      Date.now = () => real() + 120000;
    });
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    let saving = false;
    // The designer's change to the TV is held back after it has read the session, while the coach presses +30 s.
    await builder.context().route(/documents:commit/, async (route) => {
      if (!(route.request().postData() || '').includes(`/tv/${tv.code}`) || saving) return route.continue();
      saving = true;
      await held;
      return route.continue();
    });
    await builder.open('', '#lesson');
    await builder.locator('#account').click();
    await builder.locator('#accountMenu #signIn').click();
    await builder.locator('[data-designer="open"]').click();
    await builder.selectOption('#designFrom', made);
    await builder.locator('#designName').fill('Mount marathon, renamed');
    await builder.locator('[data-designer="save"]').click();
    await until(() => saving, 'the designer is changing the TV');
    await press(coach, 'more');
    await until(async () => (await stored(`tv/${tv.code}`))?.clock.added === 30, 'the coach\'s +30 s is saved');
    release();
    await builder.locator('#designStatus', { hasText: 'Saved' }).waitFor();
    await tvShows(tv, '.tvs-title', 'Mount marathon, renamed', 'the game as saved');
    const session = await stored(`tv/${tv.code}`);
    assert.equal(session.clock.added, 30, 'the coach\'s +30 s is kept');
    assert.equal(session.clock.step, 1, 'the same part: two minutes were not counted');
    await until(async () => Math.abs(seconds(await coach.locator('#remoteTime').textContent()) - seconds(await tvClock(tv))) <= 1, 'the phone shows the same time', soon);
    const onTv = seconds(await tvClock(tv));
    assert.ok(onTv > 60 && onTv <= 120, `the 90 s part with 30 s more carries on (${onTv} s left)`);
    await press(coach, 'toggle');
    await builder.context().close();
  });

  await step('the lesson builder of a coach whose account arrives after the page opened lists the coaches\' games fresh; a student reads nothing more', async () => {
    const now = (await stored('site/games')).games;
    const old = { games: { [made]: { ...now[made], n: { pt: 'Cópia antiga', en: 'Old copy' } }, 'coach-gone0000': { ...now[made], n: { pt: 'Apagado', en: 'Deleted since' } } } };
    const keptOld = (context) => context.addInitScript((value) => {
      if (!sessionStorage.getItem('kept')) localStorage.setItem('sg-site-games', JSON.stringify({ at: Date.now(), value }));
      sessionStorage.setItem('kept', 'yes');
    }, old);
    const gamesRead = (page) => {
      page.gamesReads = 0;
      page.on('request', (request) => { if (/documents(:batchGet|\/site\/games)/.test(request.url()) && (request.postData() || request.url()).includes('site/games')) page.gamesReads += 1; });
    };
    const builder = await visitor(people.coach);
    await keptOld(builder.context());
    gamesRead(builder);
    await builder.open('', '#lesson');
    await builder.locator(`#selGame option[value="${made}"]`).waitFor({ state: 'attached' });
    await builder.locator('#account').click();
    await builder.locator('#accountMenu #signIn').click();
    await builder.locator('[data-designer="open"]').waitFor();
    await until(async () => (await builder.locator(`#selGame option[value="${made}"]`).textContent()) === `${now[made].n.en} · coach’s game`, 'the game as saved now');
    assert.equal(await builder.locator('#selGame option[value="coach-gone0000"]').count(), 0, 'a game deleted since is gone');
    assert.ok(builder.gamesReads >= 1, 'read from the database');
    await builder.context().close();
    const student = await visitor(people.newcomer);
    await keptOld(student.context());
    gamesRead(student);
    await student.open('', '#lesson');
    await student.locator('#account').click();
    await student.locator('#accountMenu #signIn').click();
    await student.locator('#account[aria-label*="Test"]').waitFor();
    await student.waitForTimeout(1500);
    assert.equal(await student.locator(`#selGame option[value="${made}"]`).textContent(), 'Old copy · coach’s game', 'this browser\'s copy of a few minutes ago');
    assert.equal(student.gamesReads, 0, 'no read for a student');
    await student.context().close();
  });

  // The TV counts on from the coach's last press, not from when it loaded: a reload mid-run keeps the phone's time.
  await step('a TV reloaded while its clock runs shows the same time as the phone', async () => {
    await coach.selectOption('#remoteShow', 'lesson');
    await press(coach, 'show');
    await tvShows(tv, '.tvs-phase', 'Warm-up', 'the plan is on the TV');
    await press(coach, 'toggle');
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

  await step('a TV that loses its connection while the clock runs shows the right time when it comes back', async () => {
    await coach.selectOption('#remoteShow', 'lesson');
    await press(coach, 'show');
    await tvShows(tv, '.tvs-phase', 'Warm-up', 'the plan is on the TV');
    await press(coach, 'toggle');
    await until(async () => seconds(await tvClock(tv)) < 600, 'the TV clock runs', soon);
    await tv.context().setOffline(true);
    await tv.waitForTimeout(1000);
    await press(coach, 'more');
    await press(coach, 'more');
    await tv.waitForTimeout(3000);
    const [offline, phoneTime] = [seconds(await tvClock(tv)), seconds(await coach.locator('#remoteTime').textContent())];
    assert.ok(phoneTime - offline > 50, `offline, the TV runs on by itself without the presses (TV ${offline} s, phone ${phoneTime} s)`);
    await tv.waitForTimeout(4000);
    await tv.context().setOffline(false);
    await until(async () => Math.abs(seconds(await tvClock(tv)) - seconds(await coach.locator('#remoteTime').textContent())) <= 1, 'back online, the TV shows the phone\'s time', 20000);
    await press(coach, 'end');
    await tvShows(tv, '.tvs-how', 'Choose a game', 'ended');
  });

  await step('a long techniques block turns its pages on the TV with the clock, the same after a reload, and fits again when the window changes size', async () => {
    const every = Object.values(guard.modules.bottom.stages).flatMap((stage, si) => stage.items.map((_, ii) => `${si}-${ii}`));
    await coach.evaluate(async ([items, game]) => {
      const { changeSettings } = await import('/js/settings.js');
      changeSettings({ lesson: { mod: 'bottom', dur: '60', items, game } });
    }, [every, made]);
    await coach.selectOption('#remoteShow', 'lesson');
    await press(coach, 'show');
    await tvShows(tv, '.tvs-phase', 'Warm-up', 'the plan is on the TV');
    await press(coach, 'next');
    await press(coach, 'next');
    await tvShows(tv, '.tvs-phase', 'Techniques', 'the techniques block');
    const layout = () => tv.evaluate(() => {
      const list = document.getElementById('tvsList');
      const shown = [...list.children].filter((item) => !item.hidden);
      return {
        pages: Number(list.dataset.pages), mark: document.getElementById('tvsPages').hidden ? '' : document.getElementById('tvsPages').textContent,
        columns: list.style.getPropertyValue('--columns'), size: parseFloat(getComputedStyle(list).fontSize), shown: shown.length,
        fits: list.scrollHeight <= list.clientHeight + 1 && list.scrollWidth <= list.clientWidth + 1,
      };
    });
    const first = await layout();
    assert.ok(first.pages > 1, `in pages (${first.pages})`);
    assert.equal(first.mark, `1 / ${first.pages}`);
    assert.ok(first.fits && first.size >= 0.03 * 720 - 0.5, `nothing cut, and large enough (${first.size} px)`);
    // A TV whose fonts arrive after it drew the block fits it again for them. The body's font is swapped for a much
    // wider one (a real one from Google Fonts), so the fit surely changes when it arrives.
    const late = await visitor({ email: 'a TV whose fonts arrive late' }, { device: television });
    let releaseFonts;
    const fontsHeld = new Promise((resolve) => { releaseFonts = resolve; });
    await late.context().route(/fonts\.googleapis\.com\/css2/, async (route) => {
      const wide = await route.fetch({ url: 'https://fonts.googleapis.com/css2?family=Rubik+Mono+One&display=swap' });
      await route.fulfill({ response: wide, body: (await wide.text()).replaceAll('Rubik Mono One', 'Inter') });
    });
    await late.context().route(/fonts\.gstatic\.com/, async (route) => { await fontsHeld; await route.continue(); });
    await late.context().addInitScript((code) => localStorage.setItem('sg-tv-code', code), tv.code);
    await late.goto(`${address}/?tv&emulators=${encodeURIComponent(JSON.stringify({ sub: 'tv' }))}#screen`, { waitUntil: 'domcontentloaded' });
    await late.locator('#tvsList li').first().waitFor();
    const fitNow = () => late.evaluate(() => {
      const list = document.getElementById('tvsList');
      return { columns: list.style.getPropertyValue('--columns'), size: list.style.getPropertyValue('--size'), pages: [...list.children].map((item) => item.dataset.page ?? '').join(',') };
    });
    const fitFresh = () => late.evaluate(async () => {
      (await import('/js/tv-screen-view.js')).fitList();
      const list = document.getElementById('tvsList');
      return { columns: list.style.getPropertyValue('--columns'), size: list.style.getPropertyValue('--size'), pages: [...list.children].map((item) => item.dataset.page ?? '').join(',') };
    });
    const withoutFonts = await fitNow();
    releaseFonts();
    await late.waitForFunction(() => [...document.fonts].some((font) => font.status === 'loaded') && document.fonts.status === 'loaded');
    await until(async () => JSON.stringify(await fitNow()) !== JSON.stringify(withoutFonts), 'the block is fitted again once the fonts arrive', soon);
    const settled = await fitNow();
    assert.deepEqual(settled, await fitFresh(), 'as a fresh drawing would');
    await late.context().close();
    // The phone can't know the TV's pages (the TV never writes): it says how many techniques and when a page turns.
    const paging = await coach.locator('#remotePaging').textContent();
    assert.match(paging, new RegExp(`^${every.length} techniques\\. If they don't all fit on the TV, it shows them in pages\\. Next page turn in [1-8] s\\.$`), paging);
    await press(coach, 'toggle');
    await until(async () => (await layout()).mark === `2 / ${first.pages}`, 'the next page, by itself', 8000 + soon);
    const pageNow = async () => {
      const spent = 20 * 60 - seconds(await coach.locator('#remoteTime').textContent());
      return `${(Math.floor(spent / 8) % first.pages) + 1} / ${first.pages}`;
    };
    await tv.reload();
    await tv.locator('#tvsPages').waitFor({ timeout: soon });
    await until(async () => (await layout()).mark === (await pageNow()), 'after a reload, the page the clock is on', soon);
    // A window made larger: the screen fits itself again at once, as a fresh drawing would.
    await tv.setViewportSize({ width: 1280, height: 1000 });
    await tv.waitForTimeout(500);
    const resized = await layout();
    const fresh = await tv.evaluate(async () => {
      const { fitList } = await import('/js/tv-screen-view.js');
      const list = document.getElementById('tvsList');
      fitList();
      return { pages: Number(list.dataset.pages), columns: list.style.getPropertyValue('--columns'), size: parseFloat(getComputedStyle(list).fontSize) };
    });
    assert.notDeepEqual([fresh.pages, fresh.columns], [first.pages, first.columns], 'the taller window fits differently');
    assert.deepEqual({ pages: resized.pages, columns: resized.columns, size: resized.size }, fresh, 'fitted again after the resize');
    assert.ok(resized.fits, 'nothing cut');
    await tv.setViewportSize(television.viewport);
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
