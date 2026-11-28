// Uses the site signed in, as made-up students and a made-up coach, against the local Firebase emulators only
// (sign-in and the database). No real Google account, password or key: the emulators accept anyone.
//   npm run signed-in      (starts the emulators, then this file serves the site itself on this computer)
// The site talks to the emulators only when opened from this computer with ?emulators=<made-up person> and the
// emulators' ports (js/firebase.js), taken here from the addresses `firebase emulators:exec` gives; that person is
// who "Sign in with Google" signs in. The translator is answered here, never called.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { localDate, nextMonday } from '../js/week.js';
import { tvSteps } from './signed-in-tv.mjs';
import { coachSteps } from './signed-in-coach.mjs';
import { routeAnalytics, hits } from './analytics-fake.mjs';
import { problems, step, until } from './browser.mjs';

const project = 'demo-sistema-guarda';
const firestore = `http://${process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'}`;
const authEmulator = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'}`;
// The made-up person the site signs in, and the emulators' ports, as js/firebase.js reads them from the address.
const testQuery = (person) => `emulators=${encodeURIComponent(JSON.stringify(person))}&firestore=${new URL(firestore).port}&auth=${new URL(authEmulator).port}`;
const documents = `${firestore}/v1/projects/${project}/databases/(default)/documents`;
const translatorUrl = 'https://translator.example.test/exec';

const people = {
  student: { sub: 'student-ana', email: 'ana@example.com', email_verified: true, name: 'Ana Test' },
  other: { sub: 'student-bia', email: 'bia@example.com', email_verified: true, name: 'Bia Test' },
  newcomer: { sub: 'student-dan', email: 'dan@example.com', email_verified: true, name: 'Dan Test' },
  kid: { sub: 'student-kai', email: 'kai@example.com', email_verified: true, name: 'Kai Test' },
  kidElsewhere: { sub: 'student-eva', email: 'eva@example.com', email_verified: true, name: 'Eva Test' },
  quitter: { sub: 'student-fay', email: 'fay@example.com', email_verified: true, name: 'Fay Test' },
  returner: { sub: 'student-gil', email: 'gil@example.com', email_verified: true, name: 'Gil Test' },
  adult: { sub: 'student-hal', email: 'hal@example.com', email_verified: true, name: 'Hal Test' },
  stuck: { sub: 'student-ivy', email: 'ivy@example.com', email_verified: true, name: 'Ivy Test' },
  fresh: { sub: 'student-jon', email: 'jon@example.com', email_verified: true, name: 'Jon Test' },
  stale: { sub: 'student-kit', email: 'kit@example.com', email_verified: true, name: 'Kit Test' },
  lost: { sub: 'student-lia', email: 'lia@example.com', email_verified: true, name: 'Lia Test' },
  leaver: { sub: 'student-max', email: 'max@example.com', email_verified: true, name: 'Max Test' },
  coach: { sub: 'coach-caio', email: 'caio@example.com', email_verified: true, name: 'Caio Coach' },
  coach2: { sub: 'coach-duda', email: 'duda@example.com', email_verified: true, name: 'Duda Coach' },
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
  if (value instanceof Date) return { timestampValue: value.toISOString() };
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

// Saves a document again just as it is, with a new updatedAt: as if its last change reached everyone once more.
async function touch(path) {
  const { fields } = await (await fetch(`${documents}/${path}`, { headers: owner })).json();
  const response = await fetch(`${documents}/${path}`, { method: 'PATCH', headers: owner, body: JSON.stringify({ fields: { ...fields, updatedAt: { timestampValue: new Date().toISOString() } } }) });
  assert.ok(response.ok, `saving ${path} again: ${response.status}`);
}

// A promise that must settle within a few seconds, or the step fails saying what it waited for.
function within(promise, what, timeout = 10000) {
  return Promise.race([promise, new Promise((_, fail) => setTimeout(() => fail(new Error(`waited for ${what}`)), timeout))]);
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
const translations = [];
// Not the site's fault: no icon file, a video thumbnail.
const expectedMisses = /favicon\.ico|ytimg\.com/;

async function visitor(person, { locale = 'en-US', today, device = {} } = {}) {
  const context = await browser.newContext({ locale, ...device });
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
  return watched(await context.newPage(), person);
}

// Another tab of the same browser: the same person, sign-in and notes kept in this browser.
function anotherTab(page, person) {
  return page.context().newPage().then((tab) => watched(tab, person));
}

function watched(page, person) {
  page.on('pageerror', (error) => problems.push(`${person.email}: ${error.message}`));
  page.on('console', (message) => {
    // A step that makes saving fail on purpose expects the site to report it.
    if (page.failuresExpected) return;
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) problems.push(`${person.email}: ${message.text()}`);
  });
  page.on('response', (response) => {
    // A refusal the step asked for (tryInPage), or one a device gets for an account deleted elsewhere, is the point
    // of that step, not a problem.
    if (response.status() === 403 && page.tryingRefused) return;
    if ([400, 403, 404].includes(response.status()) && page.refusalsExpected) return;
    if (response.status() >= 400 && !expectedMisses.test(response.url())) problems.push(`${person.email}: ${response.status()} ${response.url()}`);
  });
  // The coaches' answers to the kids' challenges read by this page: one for the kids' class, none for an adult.
  page.approvalReads = 0;
  page.on('request', (request) => {
    if (request.url().includes(':batchGet') && (request.postData() || '').includes('/approvals/')) page.approvalReads += 1;
  });
  page.open = async (path = '', hash = '') => {
    await page.goto(`${address}/${path}?${testQuery(person)}${hash}`);
  };
  return page;
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

await step('a note changed on another device is shown, not typed over, when the box is in use while the notes load', async () => {
  const newer = 'Frames first, then hips (changed on the phone)';
  const notesPath = `users/${uid.student}/private/notes`;
  const before = await stored(notesPath);
  const changed = await fetch(`${documents}/${notesPath}?updateMask.fieldPaths=notes&updateMask.fieldPaths=changed`, { method: 'PATCH', headers: owner,
    body: JSON.stringify({ fields: toValue({ notes: { ...before.notes, [fromOtherDevice]: newer }, changed: fromOtherDevice }).mapValue.fields }) });
  assert.ok(changed.ok, `changing the note as the other device: ${changed.status}`);
  // The Firebase code is held back, so the account arrives while the student is already typing in the box,
  // and the account's notes are slow, so they are still being read when the next keys come.
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  await student.route('https://www.gstatic.com/firebasejs/**', async (route) => { await held; await route.continue(); });
  await student.route(/documents:batchGet/, async (route) => {
    if (route.request().postData()?.includes('private/notes')) await new Promise((done) => setTimeout(done, 1500));
    await route.continue();
  });
  try {
    await student.goto('about:blank');
    await student.open('', '#top');
    await student.locator(`main [data-technique="${fromOtherDevice}"]`).first().click();
    await student.locator('#noteBox').click();
    await student.keyboard.type('typed before the account arrived');
    release();
    await student.locator('#account[aria-label*="Test"]').waitFor();
    await student.keyboard.type(' and while its notes load');
    await until(async () => (await student.locator('#noteBox').inputValue()) === newer, 'the note from the other device is shown');
    assert.ok(await student.evaluate(() => document.activeElement.id === 'noteBox' && !document.activeElement.readOnly), 'the box keeps the focus and can be typed in again');
    await new Promise((done) => setTimeout(done, 1500)); // longer than a note waits before it is saved
    assert.equal((await stored(notesPath)).notes[fromOtherDevice], newer, 'the account keeps the newer note');
  } finally {
    // A failure here must not leave the next steps with the Firebase code or the notes held back.
    release();
    await student.unroute('https://www.gstatic.com/firebasejs/**');
    await student.unroute(/documents:batchGet/);
  }
});

await step('a device that joined the account cannot type in a note until it knows who is signed in', async () => {
  // Text typed before then would be replaced by the account's note without ever being shown.
  const kept = await student.evaluate(() => JSON.parse(localStorage.getItem('sg-notes')));
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  // A request held back may be cut off by the page leaving: then there is nothing to let through.
  await student.route('https://www.gstatic.com/firebasejs/**', async (route) => { await held; await route.continue().catch(() => {}); });
  try {
    await student.goto('about:blank');
    await student.open('', '#top');
    await student.locator(`main [data-technique="${fromOtherDevice}"]`).first().click();
    const box = student.locator('#noteBox');
    assert.notEqual(await box.getAttribute('readonly'), null, 'read-only until the account arrives');
    assert.equal(await box.getAttribute('placeholder'), 'Carregando…', 'it says it is loading (the student reads Portuguese)');
    await box.click();
    await student.keyboard.type('typed too early');
    assert.equal(await box.inputValue(), kept[fromOtherDevice], 'nothing typed');
    release();
    await student.locator('#account[aria-label*="Test"]').waitFor();
    await until(async () => (await box.getAttribute('readonly')) === null, 'then it can be typed in');
    assert.equal(await box.inputValue(), kept[fromOtherDevice], 'and shows the note');
  } finally {
    release();
    await student.unroute('https://www.gstatic.com/firebasejs/**');
  }
  // When Firebase can't start, nobody can be signed in on this visit: the box can be typed in.
  student.failuresExpected = true;
  await student.route('https://www.gstatic.com/firebasejs/**', (route) => route.abort());
  try {
    await student.goto('about:blank');
    await student.open('', '#top');
    await student.locator(`main [data-technique="${fromOtherDevice}"]`).first().click();
    await until(async () => (await student.locator('#noteBox').getAttribute('readonly')) === null, 'the box can be typed in when Firebase fails to start');
  } finally {
    await student.unroute('https://www.gstatic.com/firebasejs/**');
    student.failuresExpected = false;
  }
  await student.goto('about:blank');
  await student.open('', '#top');
  await student.locator('#account[aria-label*="Test"]').waitFor();
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

await step('a device that turns out to be signed out shows no one\'s note, even in a box in use, and one key saves none', async () => {
  // This browser was signed in to an account, which left its private note here; at this visit nobody is signed in.
  // The Firebase code is held back, so the sign-out arrives while the technique, and its note box, are open.
  const secret = 'Private note of the account signed in before';
  for (const focused of [true, false]) {
    const device = await visitor(people.other);
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    try {
      await device.context().addInitScript(([account, note]) => {
        if (sessionStorage.getItem('kept')) return;
        sessionStorage.setItem('kept', '1');
        localStorage.setItem('sg-account', account);
        localStorage.setItem('sg-notes-account', account);
        localStorage.setItem('sg-notes', JSON.stringify(note));
      }, [uid.other, { [fromOtherDevice]: secret }]);
      await device.route('https://www.gstatic.com/firebasejs/**', async (route) => { await held; await route.continue(); });
      await device.open('', '#top');
      await device.locator(`main [data-technique="${fromOtherDevice}"]`).first().click();
      assert.equal(await device.locator('#noteBox').inputValue(), secret, 'until the account arrives, the note this browser kept shows');
      if (focused) await device.locator('#noteBox').click();
      release();
      await until(() => device.evaluate(() => localStorage.getItem('sg-account') === null), 'the device learns nobody is signed in');
      await until(async () => (await device.locator('#noteBox').inputValue()) === '', `the ${focused ? 'focused' : 'unfocused'} box no longer shows the note`);
      if (focused) assert.ok(await device.evaluate(() => document.activeElement.id === 'noteBox'), 'the box keeps the focus');
      await device.locator('#noteBox').press('End');
      await device.locator('#noteBox').press('x');
      assert.deepEqual(await device.evaluate(() => JSON.parse(localStorage.getItem('sg-notes'))), { [fromOtherDevice]: 'x' }, 'the next key saves only itself');
    } finally {
      release();
      await device.context().close();
    }
  }
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

await step('a note changed or cleared in another tab shows here, and this tab never writes its older copy back', async () => {
  const notesPath = `users/${uid.other}/private/notes`;
  const tabA = await visitor(people.other);
  await tabA.open('', '#top');
  await tabA.locator('#account').waitFor();
  await signInOnSite(tabA);
  await openTechnique(tabA, first);
  await tabA.locator('#noteBox').fill('Typed in tab A');
  await until(async () => (await stored(notesPath))?.notes?.[first] === 'Typed in tab A', 'tab A saves the note');
  const tabB = await anotherTab(tabA, people.other);
  await tabB.open('', '#top');
  await tabB.locator('#account[aria-label*="Test"]').waitFor();
  await openTechnique(tabB, first);
  await until(async () => (await tabB.locator('#noteBox').inputValue()) === 'Typed in tab A', 'tab B shows the note');
  await tabB.locator('#noteBox').fill('Changed in tab B');
  await until(async () => (await tabA.locator('#noteBox').inputValue()) === 'Changed in tab B', 'tab A shows the note changed in tab B');
  // A note typed in tab A on another technique keeps tab B's change, here and in the account.
  await tabA.locator('#panelClose').click();
  await openTechnique(tabA, second);
  await tabA.locator('#noteBox').fill('Second note, tab A');
  await until(async () => (await stored(notesPath))?.notes?.[second] === 'Second note, tab A', 'tab A saves its other note');
  const local = await tabA.evaluate(() => JSON.parse(localStorage.getItem('sg-notes')));
  assert.deepEqual(local, { [first]: 'Changed in tab B', [second]: 'Second note, tab A' }, 'tab A did not write its older copy back');
  // Tab B saves on its own timer, which can land after tab A's save.
  await until(async () => (await stored(notesPath))?.notes?.[first] === 'Changed in tab B', 'the account keeps the note changed in tab B');
  // Cleared in tab B: tab A shows it gone.
  await tabA.locator('#panelClose').click();
  await openTechnique(tabA, first);
  await tabB.locator('#noteBox').fill('');
  await until(async () => (await tabA.locator('#noteBox').inputValue()) === '', 'tab A shows the note cleared in tab B');
  await until(async () => !(first in ((await stored(notesPath))?.notes || {})), 'the account has it cleared');
  // Typing in tab A that is not saved yet stays when another tab stores this note meanwhile.
  await tabA.locator('#noteBox').click();
  await tabA.keyboard.type('Still typing in A');
  await tabB.evaluate((id) => {
    const notes = JSON.parse(localStorage.getItem('sg-notes'));
    localStorage.setItem('sg-notes', JSON.stringify({ ...notes, [id]: 'Stored by B meanwhile' }));
  }, first);
  await tabA.waitForTimeout(100);
  assert.equal(await tabA.locator('#noteBox').inputValue(), 'Still typing in A', 'the typing in tab A stays');
  assert.ok(await tabA.evaluate(() => document.activeElement.id === 'noteBox'), 'with the focus');
  await until(async () => (await stored(notesPath))?.notes?.[first] === 'Still typing in A', 'and is saved');
  await tabA.context().close();
});

await step('a first sign-in whose first save fails loses nothing: the next visit saves it all', async () => {
  const newcomer = await visitor(people.newcomer);
  await newcomer.open('', '#top');
  await newcomer.locator('#account').waitFor();
  await openTechnique(newcomer, first);
  await newcomer.locator(`[data-favorite="${first}"]`).click();
  await newcomer.locator('#noteBox').fill(noteBeforeSignIn);
  await newcomer.locator('#panelClose').click();
  // Every save fails on this visit (as with no network); reading still works.
  newcomer.failuresExpected = true;
  await newcomer.route(/documents:commit/, (route) => route.abort());
  await signInOnSite(newcomer);
  await until(() => newcomer.evaluate((id) => localStorage.getItem('sg-account') === id, uid.newcomer), 'the browser notes the account');
  await openTechnique(newcomer, second); // reads the account's notes (none yet)
  await new Promise((done) => setTimeout(done, 1500));
  assert.equal(await stored(`users/${uid.newcomer}`), null, 'nothing reached the account');
  await newcomer.unroute(/documents:commit/);
  newcomer.failuresExpected = false;
  await newcomer.locator('#panelClose').click();
  await openTechnique(newcomer, first);
  await newcomer.reload();
  await newcomer.locator(`#panel [data-favorite="${first}"]`).waitFor();
  const account = await until(async () => {
    const user = await stored(`users/${uid.newcomer}`);
    return user?.favorites?.includes(first) && user;
  }, 'the next visit saves the marks made before signing in');
  assert.equal(account.email, people.newcomer.email);
  const notes = await until(async () => (await stored(`users/${uid.newcomer}/private/notes`))?.notes, 'and the note');
  assert.deepEqual(notes, { [first]: noteBeforeSignIn });
  assert.match(await newcomer.locator('#account').getAttribute('aria-label'), /Dan Test/, 'still signed in');
  assert.equal(await newcomer.locator('#noteBox').inputValue(), noteBeforeSignIn);
  await newcomer.context().close();
});

await step('a device that finds the account deleted empties the note box at once, even when signing out fails', async () => {
  const device = await visitor(people.newcomer);
  await device.open('', '#top');
  await device.locator('#account').waitFor();
  await signInOnSite(device);
  await openTechnique(device, first);
  await until(async () => (await device.locator('#noteBox').inputValue()) === noteBeforeSignIn, 'the device has the note');
  // "Delete my data" on another device.
  for (const path of [`users/${uid.newcomer}/private/notes`, `users/${uid.newcomer}`]) {
    const removed = await fetch(`${documents}/${path}`, { method: 'DELETE', headers: owner });
    assert.ok(removed.ok, `deleting ${path}: ${removed.status}`);
  }
  // Signing out can't finish here: the browser's sign-in store refuses to forget the person.
  await device.evaluate(() => { IDBObjectStore.prototype.delete = () => { throw new Error('held back by the test'); }; });
  device.refusalsExpected = true;
  device.failuresExpected = true;
  await device.locator('#noteBox').click();
  await device.keyboard.press('End');
  await device.keyboard.type(' (typed while it was deleted)');
  await until(() => device.evaluate(() => localStorage.getItem('sg-account') === null), 'the device forgets the account');
  await until(async () => (await device.locator('#noteBox').inputValue()) === '', 'the box no longer shows the deleted note');
  assert.ok(await device.evaluate(() => document.activeElement.id === 'noteBox'), 'and keeps the focus');
  await device.keyboard.press('x');
  assert.deepEqual(await device.evaluate(() => JSON.parse(localStorage.getItem('sg-notes'))), { [first]: 'x' }, 'the next key saves only itself');
  await new Promise((done) => setTimeout(done, 1000));
  assert.equal(await stored(`users/${uid.newcomer}/private/notes`), null, 'nothing was brought back');
  await device.context().close();
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
  assert.match(await coach.locator('#status').innerText(), /^Saved\. It shows from \w+day \d+ \w+\.$/, 'when it shows, not "on the site now"');
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

await coachSteps({ coach, step, stored, until, today });

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
  assert.equal(await row.evaluate((fold) => fold.open), false, 'nothing waiting: folded until tapped');
  const facts = await row.locator('.student-facts > span').allInnerTexts();
  assert.match(await row.locator('.student-who').innerText(), /Ana Test\s+ana@example\.com/);
  assert.deepEqual(facts.slice(0, 4).map((fact) => fact.trim()), ['Blue belt', 'Drilling: 1', 'Got it: 2', 'My tree: 3']);
  await row.locator('summary').click();
  await row.locator('.student-marks li').first().waitFor();
  assert.equal(await row.locator('.student-marks li').count(), 3);
  assert.ok(!(await coach.locator('body').textContent()).includes(noteText), 'no notes on the page');
  assert.equal(await tryInPage(coach, 'loadNotes', uid.student), 'permission-denied', 'coaches cannot read notes');
});

// ---- the kids' class: a kid says "I did it", a coach approves or sends it back, and the kid sees it elsewhere ----
let kid;
let kidClaims;
const kidStatus = (page, challenge) => page.locator(`[data-challenge="${challenge}"] .kid-status`).innerText();

await step('a kid picks "Kids class" and says "I did it" on two challenges; both are saved to the account, one read for the answers', async () => {
  kid = await visitor(people.kid);
  await kid.open('', '#curriculum');
  await kid.locator('#account').waitFor();
  await signInOnSite(kid);
  await kid.locator('#account').click();
  await kid.locator('[data-audience-choice="kids"]').click();
  await kid.locator('main [data-claim="rolamento"]').waitFor();
  await kid.keyboard.press('Escape');
  await kid.locator('main [data-claim="rolamento"]').click();
  assert.equal(await kidStatus(kid, 'rolamento'), 'Waiting for coach');
  assert.ok(await kid.evaluate(() => document.activeElement.matches('[data-unclaim="rolamento"]')), 'the focus moves to Undo');
  await kid.locator('main [data-claim="queda-costas"]').click();
  await kid.locator('main [data-claim="camarao"]').click();
  await kid.locator('main [data-unclaim="camarao"]').click();
  assert.equal(await kidStatus(kid, 'camarao'), 'To do', 'Undo takes a claim back');
  const saved = await until(async () => {
    const settings = await stored(`users/${uid.kid}`);
    return settings?.audience === 'kids' && settings.claims?.rolamento && settings.claims['queda-costas'] && !settings.claims.camarao && settings;
  }, 'the class and the claims are saved');
  kidClaims = saved.claims;
  assert.equal(kid.approvalReads, 1, 'the kid reads the answers once');
  assert.equal(student.approvalReads, 0, 'an adult never reads them');
});

await step('a kid cannot approve their own challenge, nor read another kid’s answers', async () => {
  assert.equal(await tryInPage(kid, 'saveApproval', uid.kid, 'rolamento', { status: 'approved', claim: kidClaims.rolamento }), 'permission-denied');
  assert.equal(await tryInPage(kid, 'loadApprovals', uid.student), 'permission-denied');
  assert.equal(await tryInPage(kid, 'loadAllApprovals'), 'permission-denied');
  assert.equal(await stored(`approvals/${uid.kid}`), null, 'nothing was approved');
  assert.equal(await tryInPage(kid, 'loadApprovals', uid.kid), 'allowed', 'but can read their own');
});

await step('the coach approves one challenge and sends the other back from the Students list', async () => {
  await coach.open('admin.html');
  await coach.locator('[data-load-students]').click();
  const row = coach.locator(`[data-student="${uid.kid}"]`);
  await row.waitFor();
  assert.match(await row.locator('.student-facts').innerText(), /Kids class[\s\S]*Kids challenges: 0 done, 2 waiting/);
  assert.equal(await row.evaluate((fold) => fold.open), true, 'a kid with challenges waiting opens by itself');
  const arrow = await row.locator('summary').evaluate((summary) => { const after = getComputedStyle(summary, '::after'); return { content: after.content, width: parseFloat(after.width), turned: after.transform }; });
  assert.ok(arrow.content !== 'none' && arrow.width >= 6 && arrow.turned !== 'none', `the fold has an arrow (${JSON.stringify(arrow)})`);
  await row.locator('[data-kid-challenge="rolamento"] button', { hasText: 'Approve' }).click();
  await until(async () => (await stored(`approvals/${uid.kid}`))?.challenges?.rolamento?.status === 'approved', 'the approval is saved');
  await row.locator('[data-kid-challenge="queda-costas"] button', { hasText: 'Try again' }).click();
  const answers = await until(async () => {
    const saved = await stored(`approvals/${uid.kid}`);
    return saved?.challenges?.['queda-costas']?.status === 'again' && saved;
  }, 'the "Try again" is saved');
  assert.deepEqual(answers.challenges, {
    rolamento: { status: 'approved', claim: kidClaims.rolamento },
    'queda-costas': { status: 'again', claim: kidClaims['queda-costas'] },
  });
  assert.equal(answers.updatedBy, people.coach.email);
  assert.match(await row.locator('.student-facts').innerText(), /Kids challenges: 1 done, 0 waiting/);
  assert.equal(await row.locator('[data-kid-challenge="rolamento"] .kid-status').innerText(), 'Done');
});

await step('the kid\'s page, back in view a few minutes later, shows the coach\'s answers without a reload; sooner, it reads nothing', async () => {
  assert.equal(await kidStatus(kid, 'rolamento'), 'Waiting for coach', 'read before the coach answered');
  const reads = kid.approvalReads;
  const backInView = () => kid.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  // Back in view at once: nothing read (the one read below is the only one).
  await backInView();
  await kid.clock.install();
  await kid.clock.fastForward('03:05');
  await backInView();
  await kid.locator('[data-challenge="rolamento"] .kid-status', { hasText: 'Done' }).waitFor();
  assert.equal(await kidStatus(kid, 'queda-costas'), 'Try again');
  assert.equal(kid.approvalReads, reads + 1, 'one read, for the return after 3 minutes only');
});

await step('on another device the kid sees Done, the XP and "Try again", and can say "I did it" again', async () => {
  const pad = await visitor(people.kid);
  await pad.open();
  await pad.locator('#account').waitFor();
  await signInOnSite(pad);
  await pad.locator('#sidebar a[href="#kids"]').click();
  await pad.locator('main [data-claim="queda-costas"]').waitFor();
  assert.equal(await kidStatus(pad, 'rolamento'), 'Done');
  assert.equal(await kidStatus(pad, 'queda-costas'), 'Try again');
  assert.match(await pad.locator('main .kids-level').innerText(), /Cub · 10 XP[\s\S]*30 XP to Little tiger/);
  assert.equal(await pad.locator('#sidebar a[href="#curriculum"]').count(), 0, 'the account’s class hides the adult curriculum here too');
  assert.equal(pad.approvalReads, 1);
  await pad.locator('main [data-claim="queda-costas"]').click();
  assert.equal(await kidStatus(pad, 'queda-costas'), 'Waiting for coach');
  await until(async () => (await stored(`users/${uid.kid}`)).claims['queda-costas'] > kidClaims['queda-costas'], 'the new claim is saved');
  await pad.context().close();
  await kid.context().close();
});

await step('a kids account signing in where an adult accepted cookies: nothing is counted until its class arrives, nor after', async () => {
  const measurementId = 'G-MADEUP123';
  await seed(`users/${uid.kidElsewhere}`, { email: people.kidElsewhere.email, language: 'en', theme: '', audience: 'kids', favorites: [] });
  const device = await visitor(people.kidElsewhere);
  const requests = [];
  await routeAnalytics(device.context(), requests, measurementId);
  await device.context().addInitScript(() => { if (!localStorage.getItem('sg-cookies')) localStorage.setItem('sg-cookies', 'accepted'); });
  // The account's settings arrive late, while the page is used.
  let release = () => {};
  let held = () => {};
  const holdSettings = () => {
    const asked = new Promise((resolve) => { held = resolve; });
    const answer = new Promise((resolve) => { release = resolve; });
    return { asked, answer };
  };
  let holding = null;
  await device.context().route(/documents:batchGet/, async (route) => {
    if (holding && (route.request().postData() || '').includes(`/users/${uid.kidElsewhere}"`)) {
      held();
      await holding.answer;
    }
    return route.continue();
  });
  const usePage = async () => {
    await device.locator('#sidebar a[href="#top"]').click();
    await device.locator('main [data-technique]').first().click();
    await device.locator('#panelClose').click();
    await device.locator('#sidebar a[href="#fund"]').click();
    await device.waitForTimeout(1500);
  };
  await device.goto(`${address}/?${testQuery(people.kidElsewhere)}&analytics=${measurementId}#curriculum`);
  await until(() => hits(requests).some((hit) => hit.page_location.endsWith('/#curriculum')), 'signed out, as an adult who accepted: counted');
  const before = hits(requests).length;
  holding = holdSettings();
  await device.locator('#account').click();
  await device.locator('#accountMenu #signIn').click();
  await within(holding.asked, 'the page asks for the account\'s settings');
  await usePage();
  release();
  await device.locator('#account[aria-label*="Eva Test"]').waitFor({ timeout: 10000 });
  await device.waitForTimeout(1000);
  assert.deepEqual(hits(requests).slice(before).map((hit) => hit.page_location), [], 'nothing counted once signed in');
  assert.equal(await device.evaluate(() => JSON.parse(localStorage.getItem('sg-settings')).audience), 'kids');

  // The account was switched to the kids class on another device; this browser still keeps "Adult class". Reloaded,
  // it counts nothing before the account says so.
  await device.evaluate(() => localStorage.setItem('sg-settings', JSON.stringify({ ...JSON.parse(localStorage.getItem('sg-settings')), audience: 'adult' })));
  holding = holdSettings();
  await device.reload();
  await within(holding.asked, 'the reloaded page asks for the account\'s settings');
  await usePage();
  release();
  await device.locator('#sidebar a[href="#kids"]').waitFor({ timeout: 10000 });
  await device.waitForTimeout(1000);
  assert.deepEqual(hits(requests).slice(before).map((hit) => hit.page_location), [], 'nothing counted after a reload either');
  assert.deepEqual((await device.context().cookies()).filter((cookie) => cookie.name.startsWith('_ga')), [], 'and no _ga cookie left');
  await device.context().close();
});

await step('an adult who accepted cookies signs in: Google Analytics is switched off until the account\'s class is known, then counts as before', async () => {
  const measurementId = 'G-MADEUP456';
  await seed(`users/${uid.adult}`, { email: people.adult.email, language: 'en', theme: '', audience: 'adult', favorites: [] });
  const device = await visitor(people.adult);
  const requests = [];
  await routeAnalytics(device.context(), requests, measurementId);
  await device.context().addInitScript(() => { if (!localStorage.getItem('sg-cookies')) localStorage.setItem('sg-cookies', 'accepted'); });
  let release = () => {};
  let held = () => {};
  const asked = new Promise((resolve) => { held = resolve; });
  const answer = new Promise((resolve) => { release = resolve; });
  let holding = false;
  await device.context().route(/documents:batchGet/, async (route) => {
    if (holding && (route.request().postData() || '').includes(`/users/${uid.adult}"`)) {
      held();
      await answer;
    }
    return route.continue();
  });
  const switchedOff = () => device.evaluate((id) => window[`ga-disable-${id}`] === true, measurementId);
  await device.goto(`${address}/?${testQuery(people.adult)}&analytics=${measurementId}#curriculum`);
  await until(() => hits(requests).some((hit) => hit.page_location.endsWith('/#curriculum')), 'signed out, as an adult who accepted: counted');
  assert.equal(await switchedOff(), false, 'counting');
  holding = true;
  await device.locator('#account').click();
  await device.locator('#accountMenu #signIn').click();
  await within(asked, 'the page asks for the account\'s settings');
  assert.equal(await switchedOff(), true, 'switched off while the class is not known, so it sends nothing of its own');
  const before = hits(requests).length;
  await device.locator('#sidebar a[href="#top"]').click();
  await device.waitForTimeout(1000);
  assert.equal(hits(requests).length, before, 'and no page is counted');
  release();
  await device.locator('#account[aria-label*="Hal Test"]').waitFor({ timeout: 10000 });
  await until(async () => !(await switchedOff()), 'an adult: switched on again');
  await device.locator('#sidebar a[href="#fund"]').click();
  await until(() => hits(requests).slice(before).some((hit) => hit.page_location.endsWith('/#fund')), 'counted from the next page, as before');
  assert.ok((await device.context().cookies()).some((cookie) => cookie.name.startsWith('_ga')), 'its cookies kept');
  await device.context().close();
});

await step('a claim the account holds as something other than a whole number: the coach\'s Try again, Undo and Approve still save', async () => {
  // An older account may hold such a claim (the rules now refuse a new one); the owner writes it here.
  const response = await fetch(`${documents}/users/${uid.kid}?updateMask.fieldPaths=claims.camarao`, {
    method: 'PATCH', headers: owner, body: JSON.stringify({ fields: { claims: { mapValue: { fields: { camarao: { doubleValue: 1764000000000.5 } } } } } }),
  });
  assert.ok(response.ok, `seeding the odd claim: ${response.status}`);
  await coach.open('admin.html');
  await coach.locator('[data-load-students]').click();
  const row = coach.locator(`[data-student="${uid.kid}"]`);
  assert.equal(await row.evaluate((fold) => fold.open), true, 'challenges waiting: the row is open');
  const answer = row.locator('[data-kid-challenge="camarao"]');
  const saved = (status) => until(async () => (await stored(`approvals/${uid.kid}`))?.challenges?.camarao?.status === status, `"${status}" is saved`);
  await answer.locator('button', { hasText: 'Try again' }).click();
  await saved('again');
  assert.equal(await answer.locator('.kid-status').innerText(), 'Try again');
  assert.equal(await answer.locator('.status').count(), 0, 'no "Couldn\'t save"');
  await answer.locator('button', { hasText: 'Undo' }).click();
  await until(async () => !(await stored(`approvals/${uid.kid}`)).challenges.camarao, 'the answer is taken back');
  await answer.locator('button', { hasText: 'Approve' }).click();
  await saved('approved');
  assert.equal(await answer.locator('.kid-status').innerText(), 'Done');
  assert.equal((await stored(`approvals/${uid.kid}`)).challenges.camarao.claim, 1764000000000);
});

await step('a kid\'s "Delete my data" deletes the coach\'s answers too, and a second press finishes a delete that was cut off', async () => {
  assert.ok(await stored(`approvals/${uid.kid}`), 'the kid has answers to delete');
  const device = await visitor(people.kid);
  let cutOff = 0;
  await device.context().route(/documents:commit/, (route) => {
    const body = route.request().postData() || '';
    if (body.includes('"delete"') && body.includes(`/approvals/${uid.kid}`) && cutOff++ === 0) return route.abort();
    return route.continue();
  });
  await device.open('', '#privacy');
  await device.locator('#account').waitFor();
  await signInOnSite(device);
  device.failuresExpected = true;
  await device.locator('[data-delete-data="ask"]').click();
  await device.locator('[data-delete-data="yes"]').click();
  await device.locator('#deleteStatus', { hasText: "Couldn't delete everything" }).waitFor();
  assert.equal(await stored(`users/${uid.kid}`), null, 'cut off after the settings');
  assert.ok(await stored(`approvals/${uid.kid}`), 'before the answers');
  await device.waitForTimeout(1000);
  assert.equal(await stored(`users/${uid.kid}`), null, 'nothing brought the settings back meanwhile');
  assert.match(await device.locator('#account').getAttribute('aria-label'), /Kai Test/, 'still signed in, to press again');
  await device.locator('[data-delete-data="ask"]').click();
  await device.locator('[data-delete-data="yes"]').click();
  await device.locator('#deleteStatus', { hasText: /deleted/ }).waitFor();
  assert.equal(await stored(`approvals/${uid.kid}`), null, 'the coach\'s answers are gone');
  assert.equal(await stored(`users/${uid.kid}`), null);
  const lookup = await fetch(`${authEmulator}/identitytoolkit.googleapis.com/v1/projects/${project}/accounts:lookup`, {
    method: 'POST', headers: { ...owner, 'Content-Type': 'application/json' }, body: JSON.stringify({ localId: [uid.kid] }),
  });
  assert.equal((await lookup.json()).users, undefined, 'and the sign-in record');
  await device.context().close();
});

// "Delete my data" pressed on a device whose deleting of the coach's answers is cut off (after the settings are gone).
async function deleteCutOff(name) {
  await seed(`approvals/${uid[name]}`, { challenges: {}, changed: '', updatedBy: people.coach.email });
  const device = await visitor(people[name]);
  let cutOff = 0;
  await device.context().route(/documents:commit/, (route) => {
    const body = route.request().postData() || '';
    if (body.includes('"delete"') && body.includes(`/approvals/${uid[name]}`) && cutOff++ === 0) return route.abort();
    return route.continue();
  });
  await device.open('', '#privacy');
  await device.locator('#account').waitFor();
  await signInOnSite(device);
  await until(() => stored(`users/${uid[name]}`), 'the settings are saved');
  device.failuresExpected = true;
  await device.locator('[data-delete-data="ask"]').click();
  await device.locator('[data-delete-data="yes"]').click();
  await device.locator('#deleteStatus', { hasText: "Couldn't delete everything" }).waitFor();
  assert.equal(await stored(`users/${uid[name]}`), null, 'cut off after the settings');
  assert.ok(await stored(`approvals/${uid[name]}`), 'before the answers');
  return device;
}

async function signInRecord(name) {
  const lookup = await fetch(`${authEmulator}/identitytoolkit.googleapis.com/v1/projects/${project}/accounts:lookup`, {
    method: 'POST', headers: { ...owner, 'Content-Type': 'application/json' }, body: JSON.stringify({ localId: [uid[name]] }),
  });
  return (await lookup.json()).users?.[0] || null;
}

await step('"Delete my data" cut off half way, then a reload: the visit finishes it by itself and signs out', async () => {
  const device = await deleteCutOff('quitter');
  // Once the sign-in record is gone, what the page still asks for as that person is refused.
  device.refusalsExpected = true;
  await device.reload();
  await until(async () => (await stored(`approvals/${uid.quitter}`)) === null, 'the coach\'s answers are deleted, nobody pressing again');
  await until(async () => (await signInRecord('quitter')) === null, 'and the sign-in record');
  await device.locator('#account').click();
  await device.locator('#accountMenu #signIn').waitFor();
  assert.equal(await device.evaluate(() => localStorage.getItem('sg-deleting')), null, 'nothing left to finish');
  await device.waitForTimeout(1000);
  assert.equal(await stored(`users/${uid.quitter}`), null, 'nothing was brought back');
  await device.context().close();
});

await step('a cut-off "Delete my data" is never finished for an account used again since', async () => {
  const device = await deleteCutOff('returner');
  // Signed in again on another device, and used: the account's settings are saved anew.
  await seed(`users/${uid.returner}`, { email: people.returner.email, language: 'en', theme: '', favorites: [fromOtherDevice], updatedAt: new Date() });
  device.failuresExpected = false;
  await device.reload();
  await device.locator('#account[aria-label*="Gil Test"]').waitFor();
  await device.waitForTimeout(1500);
  assert.match(await device.locator('#account').getAttribute('aria-label'), /Gil Test/, 'still signed in');
  assert.deepEqual((await stored(`users/${uid.returner}`)).favorites, [fromOtherDevice], 'the settings are kept');
  assert.ok(await stored(`approvals/${uid.returner}`), 'the coach\'s answers are kept');
  assert.ok(await signInRecord('returner'), 'the sign-in record is kept');
  assert.equal(await device.evaluate(() => localStorage.getItem('sg-deleting')), null, 'and this browser no longer asks for it');
  await device.context().close();
});

const signInDeletes = /identitytoolkit\.googleapis\.com\/v1\/accounts:delete/;
// The auth emulator never asks for a fresh sign-in; Google does when the sign-in is old.
const askForFreshSignIn = (route) => route.fulfill({ status: 400, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
  body: JSON.stringify({ error: { code: 400, message: 'CREDENTIAL_TOO_OLD_LOGIN_AGAIN', errors: [] } }) });
const deletionNote = (device) => device.locator('#cookieBar', { hasText: 'could not all be deleted' });
const signedInAs = (device, name) => device.locator(`#account[aria-label*="${people[name].name}"]`).waitFor();
const deletingMark = (device) => device.evaluate(() => JSON.parse(localStorage.getItem('sg-deleting')));

await step('a cut-off "Delete my data" that fails every time is dropped: the person is told how to try again and stays signed in', async () => {
  const device = await deleteCutOff('stuck');
  const refuseAnswers = (route) => ((route.request().postData() || '').includes(`/approvals/${uid.stuck}`) ? route.abort() : route.continue());
  await device.context().route(/documents:commit/, refuseAnswers);
  await device.reload();
  await deletionNote(device).waitFor();
  await signedInAs(device, 'stuck');
  assert.equal(await deletingMark(device), null, 'the request is dropped, so it is never tried in a loop');
  await device.reload();
  await until(() => stored(`users/${uid.stuck}`), 'the next visit starts fresh, signed in');
  await signedInAs(device, 'stuck');
  assert.equal(await deletionNote(device).count(), 0, 'and says nothing more');
  await device.context().unroute(/documents:commit/, refuseAnswers);
  await device.locator('[data-delete-data="ask"]').click();
  await device.locator('[data-delete-data="yes"]').click();
  await device.locator('#deleteStatus', { hasText: /deleted/ }).waitFor();
  assert.equal(await stored(`approvals/${uid.stuck}`), null, 'pressing "Delete my data" again finishes it');
  assert.equal(await signInRecord('stuck'), null);
  await device.context().close();
});

await step('a cut-off "Delete my data" Google wants a fresh sign-in for: it signs out, and the next sign-in finishes it', async () => {
  const device = await deleteCutOff('fresh');
  device.refusalsExpected = true;
  await device.context().route(signInDeletes, askForFreshSignIn);
  await device.reload();
  await until(async () => (await deletingMark(device))?.signInNext, 'it waits for a fresh sign-in');
  await device.locator('#account').click();
  await device.locator('#accountMenu #signIn').waitFor();
  await device.context().unroute(signInDeletes, askForFreshSignIn);
  await device.locator('#accountMenu #signIn').click();
  await until(async () => (await signInRecord('fresh')) === null, 'that sign-in deletes the sign-in record');
  await until(async () => (await deletingMark(device)) === null, 'and nothing is left to finish');
  assert.equal(await stored(`approvals/${uid.fresh}`), null);
  await device.context().close();
});

await step('a cut-off "Delete my data" still refused after that fresh sign-in is dropped, and the person stays signed in', async () => {
  const device = await deleteCutOff('stale');
  device.refusalsExpected = true;
  await device.context().route(signInDeletes, askForFreshSignIn);
  await device.reload();
  await until(async () => (await deletingMark(device))?.signInNext, 'it waits for a fresh sign-in');
  await device.locator('#account').click();
  await device.locator('#accountMenu #signIn').click();
  await deletionNote(device).waitFor();
  await signedInAs(device, 'stale');
  assert.equal(await deletingMark(device), null, 'the request is dropped');
  assert.ok(await signInRecord('stale'), 'the sign-in record is still there, for the person to press again');
  await device.locator('#closeDeletionNote').click();
  await deletionNote(device).waitFor({ state: 'detached' });
  await device.context().close();
});

await step('a request left behind by an account whose sign-in record is gone is cleared', async () => {
  const device = await visitor(people.lost);
  // The sign-in record is deleted, but the answer never reaches the page.
  await device.context().route(signInDeletes, async (route) => { await route.fetch(); await route.abort(); });
  await device.open('', '#privacy');
  await device.locator('#account').waitFor();
  await signInOnSite(device);
  await until(() => stored(`users/${uid.lost}`), 'the settings are saved');
  device.failuresExpected = true;
  device.refusalsExpected = true;
  await device.locator('[data-delete-data="ask"]').click();
  await device.locator('[data-delete-data="yes"]').click();
  await device.locator('#deleteStatus', { hasText: "Couldn't delete everything" }).waitFor();
  assert.equal(await signInRecord('lost'), null, 'the sign-in record is gone');
  assert.ok(await deletingMark(device), 'the page could not tell');
  await device.reload();
  await until(async () => (await deletingMark(device)) === null, 'the next visit, signed out, drops the request');
  await device.locator('#account').click();
  await device.locator('#accountMenu #signIn').waitFor();
  await device.context().close();
});

await step('a "Delete my data" whose last step failed is kept when the person signs out, and their next sign-in finishes it', async () => {
  const device = await visitor(people.leaver);
  await device.open('', '#privacy');
  await device.locator('#account').waitFor();
  await signInOnSite(device);
  await until(() => stored(`users/${uid.leaver}`), 'the settings are saved');
  device.failuresExpected = true;
  const refuse = (route) => route.abort();
  await device.context().route(signInDeletes, refuse);
  await device.locator('[data-delete-data="ask"]').click();
  await device.locator('[data-delete-data="yes"]').click();
  await device.locator('#deleteStatus', { hasText: "Couldn't delete everything" }).waitFor();
  await device.context().unroute(signInDeletes, refuse);
  assert.ok(await signInRecord('leaver'), 'the sign-in record is still there');
  await device.locator('#account').click();
  await device.locator('#accountMenu #signOut').click();
  await device.locator('#account').click();
  await device.locator('#accountMenu #signIn').waitFor();
  assert.ok(await deletingMark(device), 'signing out keeps the request');
  await device.reload();
  await device.locator('#account').waitFor();
  assert.ok(await deletingMark(device), 'and so does the next visit, signed out');
  device.refusalsExpected = true; // what the page still asks for as that person once the sign-in record is gone
  await device.locator('#account').click();
  await device.locator('#accountMenu #signIn').click();
  await until(async () => (await signInRecord('leaver')) === null, 'the next sign-in deletes the sign-in record');
  await until(async () => (await deletingMark(device)) === null, 'and nothing is left to finish');
  await device.context().close();
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
  const pad = await signedInDevice(); // never reads the account's notes before the delete
  const writer = await signedInDevice(); // is typing in a note when it finds the account deleted
  await openTechnique(phone, first); // reads the account's notes
  await until(async () => (await phone.locator('#noteBox').inputValue()) === noteBeforeSignIn, 'the phone has the notes');
  await openTechnique(writer, first);
  await until(async () => (await writer.locator('#noteBox').inputValue()) === noteBeforeSignIn, 'the writer has the notes');
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
  // Still open on a device that never read the notes: a note typed there can't start them again, and it signs out.
  pad.refusalsExpected = true;
  await openTechnique(pad, first);
  await pad.locator('#noteBox').fill('Typed after the delete, notes never read here');
  await pad.locator('#panelClose').click();
  await pad.locator('#account').click();
  await pad.locator('#accountMenu #signIn').waitFor();
  // Still typing on another: its save finds the notes gone and it signs out, and the box it is typing in shows them
  // gone, so the next key does not keep the deleted note on the device (and the next sign-in can't bring it back).
  writer.refusalsExpected = true;
  await writer.locator('#noteBox').click();
  await writer.keyboard.press('End');
  await writer.keyboard.type(' (typed while it was deleted)');
  await until(() => writer.evaluate(() => localStorage.getItem('sg-account') === null), 'the writer signs out');
  await until(async () => (await writer.locator('#noteBox').inputValue()) === '', 'the box being typed in no longer shows the deleted note');
  assert.ok(await writer.evaluate(() => document.activeElement.id === 'noteBox'), 'and keeps the focus');
  await writer.keyboard.press('x');
  assert.deepEqual(await writer.evaluate(() => JSON.parse(localStorage.getItem('sg-notes'))), { [first]: 'x' }, 'the next key saves only itself');
  await writer.keyboard.press('Backspace');
  await writer.locator('#panelClose').click();
  for (const device of [tablet, phone, desk, pad, writer]) {
    await until(() => device.evaluate(() => {
      const left = JSON.parse(localStorage.getItem('sg-settings'));
      return !left.favorites.length && !Object.keys(left.progress).length && !left.belt && localStorage.getItem('sg-notes') === '{}';
    }), 'the device forgets the marks and notes');
  }
  await new Promise((done) => setTimeout(done, 1000));
  assert.equal(await stored(`users/${uid.student}`), null, 'nothing was brought back');
  assert.equal(await stored(`users/${uid.student}/private/notes`), null);
});

await tvSteps({ visitor, step, until, stored, seed, touch, address, people, testQuery, firestoreHost: new URL(firestore).host });

await browser.close();
server.close();
if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
  process.exit(1);
}
console.log('\nSigned in, the site works.');
