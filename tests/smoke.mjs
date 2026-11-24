// Opens the site in a real browser and uses it the way a visitor would: the sidebar and its fold, Curriculum home, a technique,
// search, progress, the tree, sharing, the lesson builder and method from the account menu, past weeks and theme,
// previous / next and swiping in a technique, notes, the "new" dot on This week, the belt filter, the privacy page and
// "Clear this browser", a prepared next week taking over on its date,
// the back button, the phone's bottom bar and part switcher, both languages, the admin page. A page that fails to load fails here.
//   npm run smoke -- http://localhost:8000      (needs: npm install --no-save playwright-core)
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const address = (process.argv[2] || 'http://localhost:8000').replace(/\/$/, '');
const published = !/localhost|127\.0\.0\.1/.test(address);
const browser = await chromium.launch({ channel: process.env.SMOKE_BROWSER || 'chrome' });
const problems = [];
// Not the site's fault: no icon file, no Firebase settings in a local preview, a video removed from YouTube.
const expectedMisses = /favicon\.ico|\/__\/firebase\/|ytimg\.com/;

async function open(path, locale, device = {}) {
  const context = await browser.newContext({ locale, ...device });
  const page = await context.newPage();
  page.on('pageerror', (error) => problems.push(`${path}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) problems.push(`${path}: ${message.text()}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && !expectedMisses.test(response.url())) problems.push(`${path}: ${response.status()} ${response.url()}`);
  });
  page.on('requestfailed', (request) => {
    // A reload or a closed tab cuts requests off; that is not a failure.
    if (request.failure()?.errorText === 'net::ERR_ABORTED' || expectedMisses.test(request.url())) return;
    problems.push(`${path}: could not load ${request.url()} (${request.failure()?.errorText})`);
  });
  await page.goto(address + path);
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

let page;
let firstTab;
let id = '';
let name = '';

await step('the page loads with its sidebar, in English for an English browser', async () => {
  page = await open('/', 'en-US');
  firstTab = page.locator('#sidebar .side-parts a').first();
  await firstTab.waitFor();
  assert.equal(await page.getAttribute('html', 'lang'), 'en');
  assert.equal(await page.locator('#appTitle').textContent(), 'Guard System');
  assert.ok(await page.locator('#sidebar .side-parts a').count() > 4, 'parts of the fight');
  assert.ok(!(await page.locator('#bottomBar').isVisible()), 'no bottom bar on a wide screen');
});

await step('Curriculum home lists the parts and a card opens one', async () => {
  await page.locator('#sidebar a[href="#curriculum"]').click();
  await page.locator('main .part-card').first().waitFor();
  assert.equal(await page.locator('main .part-card').count(), await page.locator('#sidebar .side-parts a').count());
  const card = page.locator('main .part-card').nth(1);
  const href = await card.getAttribute('href');
  await card.click();
  await page.locator('main .spine').waitFor();
  assert.equal(new URL(page.url()).hash, href);
  assert.equal(await page.locator(`#sidebar a[href="${href}"]`).getAttribute('aria-current'), 'page');
});

await step('a part of the fight lists techniques and one opens', async () => {
  // Wait for the part to be on screen before picking from it, then take the id from what actually opened.
  const part = await firstTab.getAttribute('href');
  await firstTab.click();
  await page.locator(`#sidebar a[href="${part}"][aria-current="page"]`).waitFor();
  await page.locator('main .tech').first().click();
  id = await page.locator('#panel [data-favorite]').getAttribute('data-favorite');
  name = (await page.locator('#panelTitle').textContent()).trim();
  assert.ok(name, 'the technique has a name');
});

await step('marking "Got it" shows on the technique and survives a reload', async () => {
  await page.locator(`[data-progress="${id}:done"]`).click();
  assert.equal(await page.locator(`[data-progress="${id}:done"]`).getAttribute('aria-pressed'), 'true');
  await page.locator('#panelClose').click();
  await page.locator('#panel').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => !location.hash.startsWith('#t-'));
  await page.locator(`main [data-technique="${id}"] .ptag`).first().waitFor();
  await page.locator('main .progress').waitFor();
  await page.reload();
  await page.locator(`main [data-technique="${id}"] .ptag`).first().waitFor();
});

await step('search finds a technique by name and says so when nothing matches', async () => {
  await page.fill('#search', name.split(/\s+/)[0].toLowerCase());
  await page.locator(`main .results [data-technique="${id}"]`).first().waitFor();
  await page.fill('#search', 'zzqqxx');
  await page.locator('main .empty').waitFor();
  await page.fill('#search', '');
  await page.locator('main .spine').waitFor();
});

await step('a technique can be added to "My tree"', async () => {
  await page.locator(`main [data-technique="${id}"]`).first().click();
  await page.locator(`[data-favorite="${id}"]`).click();
  assert.equal(await page.locator(`[data-favorite="${id}"]`).getAttribute('aria-pressed'), 'true');
  assert.equal((await page.locator('#sidebar .navcount').textContent()).trim(), '1');
});

await step('an open technique has a share button', async () => {
  if (await page.locator('#panel').isVisible()) await page.locator('#panelClose').click();
  await page.locator(`main [data-technique="${id}"]`).first().click();
  await page.locator(`#panel [data-share="${id}"]`).waitFor();
  await page.locator('#panelClose').click();
});

await step('search finds a technique by a word in its description', async () => {
  const guard = await (await fetch(`${address}/data/content.json`)).json();
  const techniques = Object.values(guard.modules).flatMap((module) => module.stages.flatMap((stage) => stage.items)).filter((item) => item.id);
  const names = techniques.map((item) => `${item.n.pt} ${item.n.en}`.toLowerCase()).join(' ');
  let found;
  for (const technique of techniques) {
    const word = (technique.d?.en || '').toLowerCase().split(/[^a-z]+/).find((part) => part.length >= 7 && !names.includes(part));
    if (word) { found = { id: technique.id, word }; break; }
  }
  assert.ok(found, 'a description has a word no name has');
  await page.fill('#search', found.word);
  await page.locator(`main .results [data-technique="${found.id}"]`).first().waitFor();
  await page.fill('#search', '');
  await page.locator('main .spine').waitFor();
});

await step('Method and the lesson builder open from the account menu', async () => {
  await page.locator('#account').click();
  await page.locator('#accountMenu a[href="#method"]').click();
  await page.locator('main .principles').first().waitFor();
  assert.equal(await page.locator('#accountMenu').isVisible(), false);
  await page.locator('#account').click();
  await page.locator('#accountMenu a[href="#lesson"]').click();
  await page.locator('#selDur').waitFor();
  assert.equal(await page.locator('#sidebar a[href="#lesson"]').getAttribute('aria-current'), 'page');
});

await step('a lesson builder choice survives a reload', async () => {
  await page.locator('#sidebar a[href="#lesson"]').click();
  await page.selectOption('#selDur', '90');
  await page.locator('#plan .meta', { hasText: '90 min' }).waitFor();
  await page.reload();
  assert.equal(await page.locator('#selDur').inputValue(), '90');
});

if (published) {
  await step('the account menu offers sign-in', async () => {
    await page.locator('#account').waitFor({ state: 'visible', timeout: 20000 });
    await page.locator('#account').click();
    await page.locator('#accountMenu #signIn').waitFor();
    assert.match(await page.locator('#accountMenu .menu-hint').textContent(), /coaches see your progress/);
    await page.locator('#accountMenu a[href="#privacy"]').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#account').getAttribute('aria-expanded'), 'false');
  });

  await step('past weeks open on demand', async () => {
    const weekTab = page.locator('#sidebar a[href="#semana"]');
    await weekTab.waitFor({ timeout: 10000 }).catch(() => {});
    if (!(await weekTab.count())) return;
    await weekTab.click();
    await page.locator('[data-past-weeks]').click();
    await page.locator('.past-weeks :is(h3, .note)').first().waitFor();
    assert.equal(await page.locator('.past-weeks .status').count(), 0);
  });
}

await step('a theme can be chosen and survives a reload', async () => {
  await page.locator('#account').click();
  await page.locator('[data-theme-choice="gold"]').click();
  assert.equal(await page.getAttribute('html', 'data-theme'), 'gold');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#account').getAttribute('aria-expanded'), 'false');
  await page.reload();
  await firstTab.waitFor();
  assert.equal(await page.getAttribute('html', 'data-theme'), 'gold');
});

await step('folding the parts away in the sidebar is remembered after a reload', async () => {
  await page.locator('#partsToggle').click();
  assert.ok(!(await page.locator('#sideParts').isVisible()), 'the parts fold away');
  assert.equal(await page.locator('#partsToggle').getAttribute('aria-expanded'), 'false');
  await page.reload();
  await page.locator('#partsToggle').waitFor();
  assert.ok(!(await page.locator('#sideParts').isVisible()), 'still folded after a reload');
  await page.locator('#partsToggle').click();
  await firstTab.waitFor();
});

await step('the back button closes a technique and stays on the site', async () => {
  await firstTab.click();
  const tab = page.url();
  await page.locator('main .tech').first().click();
  await page.locator('#panel').waitFor();
  await page.goBack();
  await page.locator('#panel').waitFor({ state: 'hidden' });
  assert.equal(page.url(), tab);
});

await step('on a phone: the bottom bar, Curriculum, a part, the part switcher, nothing sideways', async () => {
  const phone = await open('/', 'en-US', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const bar = phone.locator('#bottomBar');
  await bar.locator('a[href="#curriculum"]').waitFor();
  assert.ok(!(await phone.locator('#sidebar').isVisible()), 'no sidebar on a phone');
  await bar.locator('a[href="#curriculum"]').click();
  await phone.locator('main .part-card').first().waitFor();
  assert.equal(await bar.locator('a[href="#curriculum"]').getAttribute('aria-current'), 'page');
  assert.ok(!(await phone.locator('#switcher').isVisible()), 'no part switcher on Curriculum home');
  await phone.locator('main .part-card').first().click();
  await phone.locator('main .spine').waitFor();
  await phone.locator('#partButton').click();
  const other = phone.locator('#partMenu a:not([aria-current])').first();
  const href = await other.getAttribute('href');
  const otherName = (await other.textContent()).trim();
  await other.click();
  await phone.waitForFunction((hash) => location.hash === hash, href);
  assert.equal((await phone.locator('#partButton span').textContent()).trim(), otherName);
  assert.ok(!(await phone.locator('#partMenu').isVisible()), 'the part menu closes');
  assert.equal(await bar.locator('a[href="#curriculum"]').getAttribute('aria-current'), 'page');
  const sideways = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(sideways <= 0, `the page scrolls sideways by ${sideways}px`);
  await phone.locator('main .tech').first().click();
  await phone.locator('#panel').waitFor();
  const barCovered = await phone.evaluate(() => {
    const box = document.getElementById('bottomBar').getBoundingClientRect();
    return !document.elementFromPoint(box.left + 10, box.bottom - 10).closest('#bottomBar');
  });
  assert.ok(barCovered, 'the open technique covers the bottom bar');
});

await step('on a phone: Back returns to the first page, Search, closing the part menu, the My tree count', async () => {
  const phone = await open('/', 'en-US', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await phone.locator('main .part-card').first().tap();
  await phone.locator('main .spine').waitFor();
  await phone.goBack();
  await phone.locator('main .part-card').first().waitFor();
  assert.equal(new URL(phone.url()).hash, '', 'back on the first page');
  await phone.locator('#bottomBar [data-search-button]').tap();
  assert.equal(await phone.evaluate(() => document.activeElement.id), 'search');
  await phone.locator('main .part-card').first().tap();
  await phone.locator('#partButton').tap();
  await phone.keyboard.press('Escape');
  assert.ok(!(await phone.locator('#partMenu').isVisible()), 'Escape closes the part menu');
  assert.equal(await phone.evaluate(() => document.activeElement.id), 'partButton');
  await phone.locator('#partButton').tap();
  // A technique below the open menu, so the tap lands on it and not on the menu.
  const point = await phone.evaluate(() => {
    const menuBottom = document.getElementById('partMenu').getBoundingClientRect().bottom;
    const chip = [...document.querySelectorAll('main .tech')].map((tech) => tech.getBoundingClientRect())
      .find((box) => box.top > menuBottom + 4 && box.bottom < window.innerHeight - 80);
    return { x: chip.left + 10, y: chip.top + chip.height / 2 };
  });
  const hash = new URL(phone.url()).hash;
  await phone.touchscreen.tap(point.x, point.y);
  assert.ok(!(await phone.locator('#partMenu').isVisible()), 'a tap outside closes the part menu');
  assert.ok(!(await phone.locator('#panel').isVisible()), 'and opens nothing under it');
  assert.equal(new URL(phone.url()).hash, hash);
  await phone.locator('main .tech').first().tap();
  await phone.locator('#panel [data-favorite]').tap();
  assert.equal((await phone.locator('#bottomBar .navcount').textContent()).trim(), '1');
});

await step('next and previous move through the part; Back still closes the technique in one press', async () => {
  const visit = await open('/#top', 'en-US');
  await visit.locator('main .tech').first().waitFor();
  const part = visit.url();
  const list = await visit.locator('main [data-technique]').evaluateAll((chips) => [...new Set(chips.map((chip) => chip.dataset.technique))]);
  const showing = () => visit.locator('#panel [data-favorite]').getAttribute('data-favorite');
  await visit.locator('main .tech').first().click();
  assert.equal(await showing(), list[0]);
  assert.ok(await visit.locator('#panel [data-step="-1"]').isDisabled(), 'no previous on the first technique');
  await visit.locator('#panel [data-step="1"]').click();
  assert.equal(await showing(), list[1]);
  await visit.keyboard.press('ArrowRight');
  assert.equal(await showing(), list[2]);
  await visit.keyboard.press('ArrowLeft');
  assert.equal(await showing(), list[1]);
  assert.equal((await visit.locator('#panel .step-count').textContent()).trim(), `2 / ${list.length}`);
  await visit.goBack();
  await visit.locator('#panel').waitFor({ state: 'hidden' });
  assert.equal(visit.url(), part);
});

await step('on a phone: swiping an open technique moves to the next one, and Back closes it', async () => {
  const phone = await open('/#top', 'en-US', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const part = phone.url();
  await phone.locator('main .tech').first().tap();
  const first = await phone.locator('#panel [data-favorite]').getAttribute('data-favorite');
  await phone.evaluate(() => {
    const title = document.getElementById('panelTitle');
    const touch = (x) => new Touch({ identifier: 1, target: title, clientX: x, clientY: 300 });
    title.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [touch(300)], changedTouches: [touch(300)] }));
    title.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [touch(140)] }));
  });
  assert.notEqual(await phone.locator('#panel [data-favorite]').getAttribute('data-favorite'), first);
  assert.equal((await phone.locator('#panel .step-count').textContent()).trim().split(' ')[0], '2');
  await phone.goBack();
  await phone.locator('#panel').waitFor({ state: 'hidden' });
  assert.equal(phone.url(), part);
});

await step('a note on a technique stays in this browser while signed out', async () => {
  const visit = await open('/#top', 'en-US');
  await visit.locator('main .tech').first().click();
  const noted = await visit.locator('#noteBox').getAttribute('data-note');
  await visit.fill('#noteBox', 'Hips low, elbows in');
  await visit.locator('#panelClose').click();
  await visit.reload();
  await visit.locator(`main [data-technique="${noted}"]`).first().click();
  assert.equal(await visit.locator('#noteBox').inputValue(), 'Hips low, elbows in');
  assert.match(await visit.locator('#noteStatus').textContent(), /this device/);
});

await step('a new class gets a dot on This week until it is opened; a first visit has none', async () => {
  const visit = await open('/#curriculum', 'en-US');
  await visit.locator('main .part-card').first().waitFor();
  const keepWeek = (title) => visit.evaluate((value) => localStorage.setItem('sg-site-week', JSON.stringify({ at: Date.now(), value })),
    { weekOf: '2026-11-23', title: { pt: title, en: title }, note: {}, techniques: ['top-base'] });
  const dot = visit.locator('#sidebar a[href="#semana"] .newdot');
  await keepWeek('Posture');
  await visit.reload();
  await visit.locator('#sidebar a[href="#semana"]').waitFor();
  assert.equal(await dot.count(), 0, 'no dot on the first visit');
  await keepWeek('Passing');
  await visit.reload();
  await dot.waitFor();
  await visit.locator('#sidebar a[href="#semana"]').click();
  await visit.locator('main .week-title', { hasText: 'Passing' }).waitFor();
  assert.equal(await dot.count(), 0, 'the dot goes once This week is open');
  await visit.locator('#sidebar a[href="#curriculum"]').click();
  await visit.reload();
  await visit.locator('#sidebar a[href="#semana"]').waitFor();
  assert.equal(await dot.count(), 0, 'and stays gone');
});

await step('picking a belt filters a part to that belt and below; Everything shows all again', async () => {
  const visit = await open('/#top', 'en-US');
  await visit.locator('main .tech').first().waitFor();
  const all = await visit.locator('main .tech').count();
  assert.ok(await visit.locator('main .belt-hint').isVisible(), 'a hint to pick a belt');
  await visit.locator('#account').click();
  await visit.locator('[data-belt-choice="white"]').click();
  assert.equal(await visit.locator('[data-belt-choice="white"]').getAttribute('aria-checked'), 'true');
  await visit.keyboard.press('Escape');
  await visit.locator('main [data-belt-filter="mine"][aria-pressed="true"]').waitFor();
  const white = await visit.locator('main .tech').count();
  assert.ok(white > 0 && white < all, `${white} of ${all} techniques shown`);
  assert.equal(await visit.locator('main .tech .belt:not([data-belt="white"])').count(), 0);
  await visit.locator('main [data-belt-filter="all"]').click();
  assert.equal(await visit.locator('main .tech').count(), all);
  await visit.reload();
  await visit.locator('main [data-belt-filter="mine"][aria-pressed="true"]').waitFor();
});

await step('the privacy page opens from the sidebar and the account menu, and says coaches see progress, not notes', async () => {
  const visit = await open('/#curriculum', 'en-US');
  await visit.locator('#sidebar a[href="#privacy"]').click();
  await visit.locator('main h2', { hasText: 'Privacy and your data' }).waitFor();
  assert.equal(await visit.locator('#sidebar a[href="#privacy"]').getAttribute('aria-current'), 'page');
  const words = await visit.locator('main').textContent();
  assert.match(words, /coaches and the site's administrators can see/i);
  assert.match(words, /except your notes/);
  assert.match(words, /no tracking/i);
  await visit.locator('#sidebar a[href="#curriculum"]').click();
  await visit.locator('main .part-card').first().waitFor();
  await visit.locator('#account').click();
  await visit.locator('#accountMenu a[href="#privacy"]').click();
  await visit.locator('main h2', { hasText: 'Privacy and your data' }).waitFor();
  assert.equal(await visit.locator('#accountMenu').isVisible(), false);
});

await step('signed out, "Clear this browser" asks first, then clears the tree, progress, belt and notes', async () => {
  const visit = await open('/#top', 'en-US');
  await visit.locator('main .tech').first().click();
  const marked = await visit.locator('#panel [data-favorite]').getAttribute('data-favorite');
  await visit.locator('#panel [data-favorite]').click();
  await visit.locator(`[data-progress="${marked}:done"]`).click();
  await visit.fill('#noteBox', 'Keep the elbows in');
  await visit.locator('#panelClose').click();
  await visit.goto(`${address}/#privacy`);
  await visit.locator('[data-delete-data="ask"]').click();
  await visit.locator('[data-delete-data="no"]').click();
  assert.equal((await visit.locator('#sidebar .navcount').textContent()).trim(), '1', 'cancel keeps everything');
  await visit.locator('[data-delete-data="ask"]').click();
  await visit.locator('[data-delete-data="yes"]').click();
  await visit.locator('#deleteStatus', { hasText: 'no longer keeps' }).waitFor();
  assert.equal((await visit.locator('#sidebar .navcount').textContent()).trim(), '');
  await visit.reload();
  await visit.goto(`${address}/#t-${marked}`);
  await visit.locator('#panel #noteBox').waitFor();
  assert.equal(await visit.locator('#noteBox').inputValue(), '');
  assert.notEqual(await visit.locator(`[data-progress="${marked}:done"]`).getAttribute('aria-pressed'), 'true');
});

await step('a prepared next week takes over on its start date, not before', async () => {
  const visit = await open('/#curriculum', 'en-US');
  await visit.locator('main .part-card').first().waitFor();
  const keepWeek = (startsOn) => visit.evaluate(([date]) => localStorage.setItem('sg-site-week', JSON.stringify({ at: Date.now(), value: {
    weekOf: '2026-11-23', title: { pt: 'Postura', en: 'Posture' }, note: {}, techniques: ['top-base'],
    next: { weekOf: date, title: { pt: 'Raspagens', en: 'Sweeps' }, note: {}, techniques: ['top-base'] },
  } })), [startsOn]);
  await keepWeek('2999-12-27');
  await visit.goto(`${address}/#semana`);
  await visit.reload();
  await visit.locator('main .week-title').waitFor();
  assert.equal((await visit.locator('main .week-title').textContent()).trim(), 'Posture', 'before the date: this week');
  await keepWeek('2000-01-03');
  await visit.reload();
  await visit.locator('main .week-title').waitFor();
  assert.equal((await visit.locator('main .week-title').textContent()).trim(), 'Sweeps', 'on or after the date: the prepared week');
  const today = await visit.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  await keepWeek(today);
  await visit.reload();
  await visit.locator('main .week-title').waitFor();
  assert.equal((await visit.locator('main .week-title').textContent()).trim(), 'Sweeps', 'on the start date itself');
});

await step('a Portuguese browser gets Portuguese, the privacy page too', async () => {
  const visit = await open('/#privacy', 'pt-BR');
  await visit.locator('main h2', { hasText: 'Privacidade e seus dados' }).waitFor();
  assert.match(await visit.locator('main').textContent(), /menos as anotações/);
  assert.equal(await visit.locator('[data-delete-data="ask"]').textContent(), 'Apagar deste navegador');
});

await step('a Portuguese browser gets Portuguese', async () => {
  const portuguese = await open('/', 'pt-BR');
  await portuguese.locator('#sidebar a').first().waitFor();
  assert.equal(await portuguese.getAttribute('html', 'lang'), 'pt-BR');
  assert.equal(await portuguese.locator('#search').getAttribute('placeholder'), 'Buscar técnica');
  assert.equal(await portuguese.locator('#appTitle').textContent(), 'Sistema Guarda');
});

await step('the admin page loads', async () => {
  const admin = await open('/admin.html', 'en-US');
  await admin.locator('main :is(p, form, h2)').first().waitFor();
});

await browser.close();

if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
  process.exit(1);
}
console.log('\nThe site works.');
