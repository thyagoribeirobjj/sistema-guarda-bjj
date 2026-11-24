// Uses the site signed in, as made-up students and a made-up coach, against the local Firebase emulators only
// (sign-in and the database). No real Google account, password or key: the emulators accept anyone.
//   npm run signed-in      (starts the emulators, then this file serves the site itself on this computer)
// The site talks to the emulators only when opened from this computer with ?emulators=<made-up person>
// (js/firebase.js); that person is who "Sign in with Google" signs in. The translator is answered here, never called.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { localDate, nextMonday } from '../js/week.js';

const project = 'demo-sistema-guarda';
const firestore = `http://${process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'}`;
const authEmulator = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'}`;
const documents = `${firestore}/v1/projects/${project}/databases/(default)/documents`;
const translatorUrl = 'https://translator.example.test/exec';

const people = {
  student: { sub: 'student-ana', email: 'ana@example.com', email_verified: true, name: 'Ana Test' },
  other: { sub: 'student-bia', email: 'bia@example.com', email_verified: true, name: 'Bia Test' },
  coach: { sub: 'coach-caio', email: 'caio@example.com', email_verified: true, name: 'Caio Coach' },
};

// ---- the site, served from this folder ----
const root = fileURLToPath(new URL('..', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer(async (request, response) => {
  const asked = normalize(decodeURIComponent(new URL(request.url, 'http://localhost').pathname)).replace(/^[\\/]+/, '');
  const path = !asked || /[\\/]$/.test(asked) ? join(asked, 'index.html') : asked;
  try {
    const body = await readFile(join(root, path));
    response.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((done) => server.listen(Number(process.env.PORT || 0), '127.0.0.1', done));
const address = `http://127.0.0.1:${server.address().port}`;

// ---- the database, read and seeded as its owner (the emulator's "Bearer owner" skips the rules) ----
function toValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') return { integerValue: String(value) };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, toValue(inner)])) } };
}

function fromValue(value) {
  if ('mapValue' in value) return fromFields(value.mapValue.fields || {});
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromValue);
  if ('integerValue' in value) return Number(value.integerValue);
  if ('nullValue' in value) return null;
  return Object.values(value)[0];
}

function fromFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fromValue(value)]));
}

const owner = { Authorization: 'Bearer owner' };

async function seed(path, data) {
  const response = await fetch(`${documents}/${path}`, { method: 'PATCH', headers: owner, body: JSON.stringify({ fields: toValue(data).mapValue.fields }) });
  assert.ok(response.ok, `seeding ${path}: ${response.status}`);
}

async function stored(path) {
  const response = await fetch(`${documents}/${path}`, { headers: owner });
  if (response.status === 404) return null;
  assert.ok(response.ok, `reading ${path}: ${response.status}`);
  return fromFields((await response.json()).fields || {});
}

// Waits until the database (or the page) shows what is expected; the site saves in the background.
async function until(check, what, timeout = 10000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      last = await check();
      if (last) return last;
    } catch (error) {
      last = error.message;
    }
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error(`${what} (last seen: ${JSON.stringify(last)})`);
}

// The emulator gives each made-up person a uid of its own on their first sign-in; signing them in here first tells
// us their uid, and the site's "Sign in with Google" then finds the same account.
const uid = {};
async function createAccount(name) {
  const response = await fetch(`${authEmulator}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ postBody: `id_token=${encodeURIComponent(JSON.stringify(people[name]))}&providerId=google.com`, requestUri: 'http://localhost', returnSecureToken: true }),
  });
  assert.ok(response.ok, `creating ${name}: ${response.status}`);
  uid[name] = (await response.json()).localId;
}

async function emptyEmulators() {
  await fetch(`${firestore}/emulator/v1/projects/${project}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`${authEmulator}/emulator/v1/projects/${project}/accounts`, { method: 'DELETE' });
}

// ---- the browser ----
const browser = await chromium.launch({ channel: process.env.SMOKE_BROWSER || 'chrome' });
const problems = [];
const translations = [];
// Not the site's fault: no icon file, a video thumbnail.
const expectedMisses = /favicon\.ico|ytimg\.com/;

async function visitor(person, { locale = 'en-US', today } = {}) {
  const context = await browser.newContext({ locale });
  if (today) await context.clock.setFixedTime(new Date(`${today}T12:00:00`));
  // The translator is answered here: the made-up texts never leave this computer.
  await context.route(translatorUrl, async (route) => {
    const request = JSON.parse(route.request().postData());
    translations.push(request);
    await route.fulfill({ headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json',
      body: JSON.stringify({ texts: request.texts.map((words) => `${request.to.toUpperCase()}: ${words}`) }) });
  });
  await context.route(/script\.google(usercontent)?\.com/, (route) => {
    problems.push(`the real translator was called: ${route.request().url()}`);
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => problems.push(`${person.email}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) problems.push(`${person.email}: ${message.text()}`);
  });
  page.on('response', (response) => {
    // A refusal the step asked for (tryInPage), or one a device gets for an account deleted elsewhere, is the point
    // of that step, not a problem.
    if (response.status() === 403 && page.tryingRefused) return;
    if ([400, 403, 404].includes(response.status()) && page.refusalsExpected) return;
    if (response.status() >= 400 && !expectedMisses.test(response.url())) problems.push(`${person.email}: ${response.status()} ${response.url()}`);
  });
  page.open = async (path = '', hash = '') => {
    await page.goto(`${address}/${path}?emulators=${encodeURIComponent(JSON.stringify(person))}${hash}`);
  };
  return page;
}

async function step(name, run) {
  try {
    await run();
    console.log(`PASS  ${name}`);
  } catch (error) {
    problems.push(`${name}: ${error.message.split('\n')[0]}`);
    console.log(`FAIL  ${name}: ${error.message.split('\n')[0]}`);
  }
}

async function signInOnSite(page) {
  await page.locator('#account').click();
  await page.locator('#accountMenu #signIn').click();
  await page.locator('#account[aria-label*="Test"], #account[aria-label*="Coach"]').waitFor();
}

async function openTechnique(page, id) {
  await page.locator(`main [data-technique="${id}"]`).first().click();
  await page.locator(`#panel [data-favorite="${id}"]`).waitFor();
}

// The site's own database calls, run inside the page as the person signed in there.
async function tryInPage(page, call, ...values) {
  page.tryingRefused = true;
  const result = await page.evaluate(async ([name, args]) => {
    const firebase = await import('/js/firebase.js');
    try {
      await firebase[name](...args);
      return 'allowed';
    } catch (error) {
      return error.code || error.message;
    }
  }, [call, values]);
  page.tryingRefused = false;
  return result;
}

const today = localDate();
const startsOn = nextMonday(today);
const first = 'top-biceps-grips';
const second = 'top-break-the-grip';
const fromOtherDevice = 'top-base';
const noteText = 'Elbows in, hips low (private)';
const noteBeforeSignIn = 'Grip the sleeve (typed signed out)';
const noteBeforeSignOut = 'Posture first (typed just before signing out)';
const oldWeek = { weekOf: '2026-01-05', title: { pt: 'Semana antiga', en: 'Old week' }, note: { pt: '', en: '' }, techniques: [fromOtherDevice], from: 'pt' };
const pastWeek = { weekOf: '2025-12-29', title: { pt: 'Pegadas e postura', en: 'Grips and posture' }, note: { pt: 'Traga água', en: 'Bring water' }, techniques: [first, second] };

await emptyEmulators();
for (const name of Object.keys(people)) await createAccount(name);
await seed(`admins/${people.coach.email}`, { name: 'Caio Coach' });
await seed('site/config', { translatorUrl });
await seed('site/week', oldWeek);
await seed('site/weeks', { weeks: [pastWeek] });
// What the student marked on another device before: the account already holds it.
await seed(`users/${uid.student}`, { email: people.student.email, favorites: [fromOtherDevice], progress: { [fromOtherDevice]: 'done' } });

let student;
let laptop;

await step('marks made before signing in are added to the account on the first sign-in', async () => {
  student = await visitor(people.student);
  await student.open('', '#top');
  await student.locator('#account').waitFor();
  await openTechnique(student, first);
  await student.locator(`[data-favorite="${first}"]`).click();
  await student.locator(`[data-progress="${first}:learning"]`).click();
  await student.locator('#noteBox').fill(noteBeforeSignIn);
  await student.locator('#panelClose').click();
  await signInOnSite(student);
  const account = await until(async () => {
    const user = await stored(`users/${uid.student}`);
    return user?.favorites?.includes(first) && user;
  }, 'the account gets the favorite made before signing in');
  assert.deepEqual([...account.favorites].sort(), [first, fromOtherDevice].sort());
  assert.deepEqual(account.progress, { [first]: 'learning', [fromOtherDevice]: 'done' });
  assert.equal(account.name, 'Ana Test');
  assert.equal(account.email, people.student.email);
  assert.ok(account.seenWeek, 'the class of the week this browser noted is saved to the account');
});

await step('language, theme, favorite, progress, belt and a note are saved to the account', async () => {
  await student.locator('[data-lang="pt"]').first().click();
  await student.locator('#account').click();
  await student.locator('[data-theme-choice="royal"]').click();
  await student.locator('[data-belt-choice="blue"]').click();
  await student.keyboard.press('Escape');
  await openTechnique(student, second);
  await student.locator(`[data-favorite="${second}"]`).click();
  await student.locator(`[data-progress="${second}:done"]`).click();
  await student.locator('#noteBox').fill(noteText);
  await until(async () => {
    const user = await stored(`users/${uid.student}`);
    return user.language === 'pt' && user.theme === 'royal' && user.belt === 'blue' && user.favorites.includes(second) && user.progress[second] === 'done';
  }, 'the account has the language, theme, belt, favorite and progress');
  const notes = await until(async () => {
    const saved = await stored(`users/${uid.student}/private/notes`);
    return saved?.notes?.[second] && saved;
  }, 'the note is saved');
  assert.deepEqual(notes.notes, { [first]: noteBeforeSignIn, [second]: noteText }, 'the note made before signing in joined the account');
  assert.equal(notes.changed, second);
});

await step('they come back after a reload', async () => {
  await student.reload();
  await student.locator(`#panel [data-favorite="${second}"]`).waitFor();
  await until(() => student.evaluate(() => document.documentElement.lang === 'pt-BR' && document.documentElement.dataset.theme === 'royal'), 'Portuguese, royal theme');
  assert.equal(await student.locator(`[data-favorite="${second}"]`).getAttribute('aria-pressed'), 'true');
  assert.equal(await student.locator(`[data-progress="${second}:done"]`).getAttribute('aria-pressed'), 'true');
  assert.equal(await student.locator('#noteBox').inputValue(), noteText);
});

await step('and on another device once signed in, from the account', async () => {
  laptop = await visitor(people.student);
  await laptop.open('', '#meu');
  await laptop.locator('#account').waitFor();
  await signInOnSite(laptop);
  await until(() => laptop.evaluate(() => document.documentElement.lang === 'pt-BR' && document.documentElement.dataset.theme === 'royal'), 'Portuguese, royal theme');
  for (const id of [first, second, fromOtherDevice]) await laptop.locator(`main [data-technique="${id}"]`).first().waitFor();
  const settings = await laptop.evaluate(() => JSON.parse(localStorage.getItem('sg-settings')));
  assert.equal(settings.belt, 'blue');
  assert.deepEqual(settings.progress, { [first]: 'learning', [second]: 'done', [fromOtherDevice]: 'done' });
  // The account's notes arrive slowly: until they do, the box can't be typed in, so nothing replaces them unseen.
  await laptop.route(/documents:batchGet/, async (route) => {
    if (route.request().postData()?.includes('private/notes')) await new Promise((done) => setTimeout(done, 1500));
    await route.continue();
  });
  await openTechnique(laptop, second);
  assert.notEqual(await laptop.locator('#noteBox').getAttribute('readonly'), null, 'read-only while the notes load');
  await until(async () => (await laptop.locator('#noteBox').inputValue()) === noteText, 'the note is read from the account');
  assert.equal(await laptop.locator('#noteBox').getAttribute('readonly'), null, 'then it can be typed in');
  await laptop.unroute(/documents:batchGet/);
  await laptop.locator('#panelClose').click();
});

await step('signing out clears the personal marks from the device, not from the account', async () => {
  // A note typed a moment before signing out still reaches the account.
  await openTechnique(laptop, fromOtherDevice);
  await laptop.locator('#noteBox').fill(noteBeforeSignOut);
  await laptop.locator('#panelClose').click();
  await laptop.locator('#account').click();
  await laptop.locator('#accountMenu #signOut').click();
  await laptop.locator('#accountMenu #signIn').waitFor({ state: 'attached' });
  await until(async () => (await laptop.locator('main [data-technique]').count()) === 0, 'My tree is empty on this device');
  const kept = await laptop.evaluate(() => ({ settings: JSON.parse(localStorage.getItem('sg-settings')), notes: JSON.parse(localStorage.getItem('sg-notes')) }));
  assert.deepEqual(kept.settings.favorites, []);
  assert.deepEqual(kept.settings.progress, {});
  assert.equal(kept.settings.belt, '');
  assert.deepEqual(kept.notes, {});
  assert.equal((await stored(`users/${uid.student}`)).favorites.length, 3, 'the account keeps them');
  assert.equal((await stored(`users/${uid.student}/private/notes`)).notes[fromOtherDevice], noteBeforeSignOut, 'and the note typed just before');
  await laptop.context().close();
});

await step('another student cannot read the first student\'s settings, notes or the list of students', async () => {
  const other = await visitor(people.other);
  await other.open();
  await other.locator('#account').waitFor();
  await signInOnSite(other);
  assert.equal(await tryInPage(other, 'loadUserSettings', uid.student), 'permission-denied');
  assert.equal(await tryInPage(other, 'loadNotes', uid.student), 'permission-denied');
  assert.equal(await tryInPage(other, 'loadStudents'), 'permission-denied');
  assert.equal(await tryInPage(other, 'loadUserSettings', uid.other), 'allowed', 'but can read their own');
  await other.open('admin.html');
  await other.locator('main', { hasText: 'can only view the site' }).waitFor();
  assert.equal(await other.locator('#students').isVisible(), false, 'no Students section');
  await other.context().close();
});

let coach;

await step('a coach sees the Admin link once signed in', async () => {
  // The coach's browser keeps today's date for the whole run, even if it passes midnight.
  coach = await visitor(people.coach, { today });
  await coach.open();
  await coach.locator('#account').waitFor();
  await signInOnSite(coach);
  await coach.locator('#account').click();
  await coach.locator('#accountMenu #adminLink').waitFor();
  await coach.keyboard.press('Escape');
});

await step('the coach saves this week in one language; it is translated and the last week is filed', async () => {
  await coach.open('admin.html');
  await coach.locator('#weekForm').waitFor();
  await coach.locator('[data-writing="pt"]').click();
  await coach.locator('#weekOf').fill(today);
  await coach.locator('#title').fill('Passagem com pegadas');
  await coach.locator('#note').fill('Chegue cedo');
  await coach.locator(`#picks input[value="${fromOtherDevice}"]`).uncheck();
  await coach.locator(`#picks input[value="${first}"]`).check();
  await coach.locator('#weekForm [type="submit"]').click();
  await coach.locator('#status', { hasText: 'Saved' }).waitFor();
  const week = await stored('site/week');
  assert.equal(week.weekOf, today);
  assert.deepEqual(week.title, { pt: 'Passagem com pegadas', en: 'EN: Passagem com pegadas' });
  assert.deepEqual(week.note, { pt: 'Chegue cedo', en: 'EN: Chegue cedo' });
  assert.deepEqual(week.techniques, [first]);
  assert.equal(week.from, 'pt');
  assert.equal(week.updatedBy, people.coach.email);
  assert.ok(translations.length > 0 && translations.every((asked) => asked.email === people.coach.email && asked.idToken), 'the translator was asked by the coach');
  const past = (await stored('site/weeks')).weeks;
  assert.deepEqual(past.map((one) => one.weekOf), [oldWeek.weekOf, pastWeek.weekOf], 'the old class is the newest past week');
  assert.deepEqual(past[0].title, oldWeek.title);
});

let tablet;

await step('a new class gets the dot; looking at it on one device clears it on the others', async () => {
  const seenBefore = (await stored(`users/${uid.student}`)).seenWeek;
  // The week is kept in each browser for a few minutes; this one forgets it so it sees the coach's new class now.
  await student.evaluate(() => localStorage.removeItem('sg-site-week'));
  await student.open('', '#curriculum');
  await student.reload(); // only the link's #part changed, so the page itself wasn't loaded again
  await student.locator('#sidebar .newdot').waitFor();
  await student.locator('#sidebar a[href="#semana"]').click();
  await student.locator('main', { hasText: 'Passagem com pegadas' }).waitFor();
  assert.equal(await student.locator('.newdot').count(), 0, 'looking at it clears the dot');
  await until(async () => {
    const seen = (await stored(`users/${uid.student}`)).seenWeek;
    return seen && seen !== seenBefore;
  }, 'the account notes the class was seen');
  // A device that last saw the old class: once signed in, the account says it was seen.
  tablet = await visitor(people.student);
  await tablet.addInitScript((seen) => {
    if (!localStorage.getItem('sg-settings')) localStorage.setItem('sg-settings', JSON.stringify({ seenWeek: seen }));
  }, seenBefore);
  await tablet.open('', '#curriculum');
  await tablet.locator('#sidebar .newdot').waitFor();
  await signInOnSite(tablet);
  await tablet.locator('#sidebar .newdot').waitFor({ state: 'detached' });
});

async function prepareFromPastWeek() {
  await coach.locator('[data-form="next"]').click();
  assert.equal(await coach.locator('#weekOf').inputValue(), startsOn, 'next Monday by default');
  if (await coach.locator('[data-reuse]').count()) await coach.locator('[data-reuse]').click();
  await coach.locator('#reuseWeek').selectOption({ label: `${pastWeek.weekOf} · ${pastWeek.title.en}` });
  assert.equal(await coach.locator('#title').inputValue(), pastWeek.title.pt);
  assert.equal(await coach.locator('#note').inputValue(), pastWeek.note.pt);
  assert.deepEqual(await coach.locator('#picks input:checked').evaluateAll((boxes) => boxes.map((box) => box.value).sort()), [...pastWeek.techniques].sort());
  await coach.locator('#weekForm [type="submit"]').click();
  await coach.locator('#status', { hasText: 'Saved' }).waitFor();
  await coach.locator('.next-ready').waitFor();
  const week = await stored('site/week');
  assert.equal(week.weekOf, today, 'this week is unchanged');
  assert.equal(week.next.weekOf, startsOn);
  assert.deepEqual(week.next.title, pastWeek.title, 'the past week\'s own words are kept, not translated again');
  assert.deepEqual([...week.next.techniques].sort(), [...pastWeek.techniques].sort());
}

await step('the coach prepares next week, starting from a past week', prepareFromPastWeek);

await step('editing this week keeps the prepared week, and this week cannot be dated on or after its start', async () => {
  const prepared = (await stored('site/week')).next;
  await coach.locator('[data-form="week"]').click();
  await coach.locator('#weekOf').fill(startsOn);
  await coach.locator('#weekForm [type="submit"]').click();
  await coach.locator('#status', { hasText: "before next week's start" }).waitFor();
  assert.equal((await stored('site/week')).weekOf, today, 'nothing saved');
  await coach.locator('#weekOf').fill(today);
  await coach.locator('#note').fill('Chegue cedo e traga água');
  await coach.locator('#weekForm [type="submit"]').click();
  await coach.locator('#status', { hasText: 'Saved' }).waitFor();
  const week = await stored('site/week');
  assert.equal(week.note.pt, 'Chegue cedo e traga água');
  assert.deepEqual(week.next, prepared, 'next week is still prepared, unchanged');
  assert.deepEqual((await stored('site/weeks')).weeks.map((one) => one.weekOf), [oldWeek.weekOf, pastWeek.weekOf], 'the same week edited is not filed');
});

await step('cancelling next week removes it, and it can be prepared again', async () => {
  await coach.locator('[data-form="next"]').click();
  await coach.locator('[data-cancel-next="ask"]').click();
  await coach.locator('[data-cancel-next="yes"]').click();
  await coach.locator('#status', { hasText: 'Next week was removed' }).waitFor();
  const week = await stored('site/week');
  assert.equal(week.next, undefined);
  assert.equal(week.weekOf, today, 'this week stays');
  assert.equal(week.title.pt, 'Passagem com pegadas');
  await prepareFromPastWeek();
});

await step('on its start date students see next week, and the coach\'s visit switches the database', async () => {
  const monday = await visitor(people.coach, { today: startsOn });
  await monday.open('', '#semana');
  await monday.locator('main', { hasText: pastWeek.title.en }).waitFor();
  assert.equal((await stored('site/week')).weekOf, today, 'a student\'s visit changes nothing');
  await monday.open('admin.html');
  await monday.locator('#signIn').click();
  await monday.locator('#status', { hasText: 'prepared week has started' }).waitFor();
  const week = await stored('site/week');
  assert.equal(week.weekOf, startsOn);
  assert.equal(week.next, undefined, 'nothing prepared any more');
  assert.deepEqual(week.title, pastWeek.title);
  const past = (await stored('site/weeks')).weeks;
  assert.deepEqual(past.map((one) => one.weekOf), [today, oldWeek.weekOf, pastWeek.weekOf], 'the replaced class is filed');
  await monday.context().close();
});

await step('the Students list shows the student with the right counts, and never their notes', async () => {
  await coach.open('admin.html');
  await coach.locator('[data-load-students]').click();
  const row = coach.locator(`[data-student="${uid.student}"]`);
  await row.waitFor();
  const facts = await row.locator('.student-facts > span').allInnerTexts();
  assert.match(await row.locator('.student-who').innerText(), /Ana Test\s+ana@example\.com/);
  assert.deepEqual(facts.slice(0, 4).map((fact) => fact.trim()), ['Blue belt', 'Drilling: 1', 'Got it: 2', 'My tree: 3']);
  await row.locator('summary').click();
  await row.locator('.student-marks li').first().waitFor();
  assert.equal(await row.locator('.student-marks li').count(), 3);
  assert.ok(!(await coach.locator('body').textContent()).includes(noteText), 'no notes on the page');
  assert.equal(await tryInPage(coach, 'loadNotes', uid.student), 'permission-denied', 'coaches cannot read notes');
});

await step('"Delete my data" deletes the account\'s settings, notes and sign-in record, and signs out', async () => {
  // Other devices signed in to the same account, to see that none of them can bring anything back.
  const signedInDevice = async () => {
    const device = await visitor(people.student);
    await device.open('', '#meu');
    await device.locator('#account').waitFor();
    await signInOnSite(device);
    await device.locator(`main [data-technique="${first}"]`).first().waitFor();
    return device;
  };
  const phone = await signedInDevice();
  const desk = await signedInDevice();
  await openTechnique(phone, first); // reads the account's notes
  await until(async () => (await phone.locator('#noteBox').inputValue()) === noteBeforeSignIn, 'the phone has the notes');
  await student.open('', '#privacy');
  await student.locator('[data-delete-data="ask"]').click();
  await student.locator('[data-delete-data="yes"]').click();
  await student.locator('#deleteStatus', { hasText: /apagados|deleted/ }).waitFor();
  assert.equal(await stored(`users/${uid.student}`), null);
  assert.equal(await stored(`users/${uid.student}/private/notes`), null);
  await student.locator('#account').click();
  await student.locator('#accountMenu #signIn').waitFor();
  const kept = await student.evaluate(() => JSON.parse(localStorage.getItem('sg-settings')));
  assert.deepEqual(kept.favorites, []);
  assert.deepEqual(kept.progress, {});
  const lookup = await fetch(`${authEmulator}/identitytoolkit.googleapis.com/v1/projects/${project}/accounts:lookup`, {
    method: 'POST', headers: { ...owner, 'Content-Type': 'application/json' }, body: JSON.stringify({ localId: [uid.student] }),
  });
  assert.equal((await lookup.json()).users, undefined, 'the sign-in record is gone too');

  // Still open on the tablet: its next change finds the account gone, writes nothing back and signs out.
  tablet.refusalsExpected = true;
  await tablet.locator('#sidebar a[href="#meu"]').click();
  await tablet.locator(`main [data-technique="${second}"]`).first().click();
  await tablet.locator(`#panel [data-favorite="${second}"]`).click();
  await tablet.locator('#panelClose').click();
  await tablet.locator('#account').click();
  await tablet.locator('#accountMenu #signIn').waitFor();
  // Still open on the phone: a note typed there finds the notes gone and signs out too.
  phone.refusalsExpected = true;
  await phone.locator('#noteBox').fill('Typed after the delete');
  await phone.locator('#panelClose').click();
  await phone.locator('#account').click();
  await phone.locator('#accountMenu #signIn').waitFor();
  // The desk, reloaded: it finds the account gone and signs out.
  desk.refusalsExpected = true;
  await desk.reload();
  await desk.locator('#account').click();
  await desk.locator('#accountMenu #signIn').waitFor();
  for (const device of [tablet, phone, desk]) {
    await until(() => device.evaluate(() => {
      const left = JSON.parse(localStorage.getItem('sg-settings'));
      return !left.favorites.length && !Object.keys(left.progress).length && !left.belt && localStorage.getItem('sg-notes') === '{}';
    }), 'the device forgets the marks and notes');
  }
  await new Promise((done) => setTimeout(done, 1000));
  assert.equal(await stored(`users/${uid.student}`), null, 'nothing was brought back');
  assert.equal(await stored(`users/${uid.student}/private/notes`), null);
});

await browser.close();
server.close();
if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
  process.exit(1);
}
console.log('\nSigned in, the site works.');
