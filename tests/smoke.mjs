// Opens the site in a real browser and uses it the way a visitor would: the sidebar and its fold, Curriculum home, a technique,
// search, progress, the tree, sharing, the lesson builder and method from the account menu, past weeks and theme,
// previous / next and swiping in a technique (tests/smoke-usability.mjs: what a technique's sheet and search show), notes, the "new" dot on This week, the belt filter, the cookie bar and
// Google Analytics (answered here, never the real one), the kids' class (tests/smoke-kids.mjs), the TV screen of the games on the TV (tests/smoke-tv.mjs), the privacy page and "Clear this browser", a prepared next week taking over on its date, the site's data arriving late while someone types, uses a menu, has the focus somewhere or has started on the first page,
// the back button, the phone's bottom bar and part switcher, both languages, the admin page, robots.txt and the "noai"
// tags; on the published site also the X-Robots-Tag headers, and that the tests' ?emulators= address does nothing
// there. A page that fails to load fails here.
//   npm run smoke -- http://localhost:8000      (needs: npm ci)
//   npm run smoke:real                           this checkout's code at https://sistemaguarda.com, before it is published
// With --code-from <folder>, the browser opens the address given, but every file of the site (pages, code, styles, data,
// images, robots.txt) comes from that folder, answered as Firebase Hosting would answer once it is published (see
// tests/checkout.mjs), headers from its firebase.json included. Firebase's own paths (/__/) and the real sign-in and
// database still answer from the internet: signed out, only reading.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { checkout } from './checkout.mjs';
import { kidsSteps } from './smoke-kids.mjs';
import { tvSteps } from './smoke-tv.mjs';
import { usabilitySteps } from './smoke-usability.mjs';
import { routeAnalytics, hits as analyticsHits } from './analytics-fake.mjs';
import { problems, step, until } from './browser.mjs';

const options = process.argv.slice(2);
const codeFromAt = options.indexOf('--code-from');
const codeFrom = codeFromAt >= 0 ? options.splice(codeFromAt, 2)[1] : null;
const address = (options[0] || 'http://localhost:8000').replace(/\/$/, '');
const published = !/localhost|127\.0\.0\.1/.test(address);
const fromCheckout = codeFrom ? await checkout(codeFrom) : null;
const origin = new URL(address).origin;
const browser = await chromium.launch({ channel: process.env.SMOKE_BROWSER || 'chrome' });
// Not the site's fault: no icon file, no Firebase settings in a local preview, a video removed from YouTube.
const expectedMisses = /favicon\.ico|\/__\/firebase\/|ytimg\.com/;

// One of the site's files, as the browser would get it (from the checkout under --code-from).
async function get(path) {
  if (!fromCheckout) return fetch(address + path);
  const { status, headers, body } = await fromCheckout(new URL(path, address).pathname);
  return new Response(body, { status, headers });
}

async function open(path, locale, device = {}, prepare = async () => {}) {
  const context = await browser.newContext({ locale, ...device });
  if (fromCheckout) {
    await context.route((url) => url.origin === origin && !url.pathname.startsWith('/__/'),
      async (route) => route.fulfill(await fromCheckout(new URL(route.request().url()).pathname)));
  }
  await prepare(context);
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

// On the published site the account, the week and the videos arrive a moment after the page shows, and the page is
// drawn again then, often while someone is already using it. This opens a page that waits for them until release():
// made-up Firebase settings, the Firebase code held back, and a database that holds only what `stored` gives, in the
// database's own form ({ 'site/media': fields }); anything else is "nothing stored". `kept`: what this browser
// already keeps ({ localStorage key: value }) when the page opens.
// release() returns once the page has been drawn again for all three (the header is drawn three more times).
// page.reads: the documents the page asked the database for.
// The Firebase code itself still comes from www.gstatic.com, so these steps need an internet connection.
const firestoreValue = (value) => (typeof value === 'string' ? { stringValue: value }
  : typeof value === 'boolean' ? { booleanValue: value }
  : Array.isArray(value) ? { arrayValue: { values: value.map(firestoreValue) } }
  : { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, firestoreValue(inner)])) } });
const firestoreFields = (value) => firestoreValue(value).mapValue.fields;

// `config`: more Firebase settings, such as a measurementId (Google Analytics switched on). page.analytics: the
// requests made to Google Analytics' hosts (see routeAnalytics). page.releaseNow(): let the Firebase code through
// without waiting for the redraws (for the admin page, which has no #appTitle).
async function openLate(path, locale, device = {}, { stored = {}, kept = {}, config = {} } = {}) {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  let noSdk;
  const sdkMissing = new Promise((resolve) => { noSdk = resolve; });
  const reads = [];
  const analytics = [];
  const page = await open(path, locale, device, async (context) => {
    await context.addInitScript((entries) => { for (const [key, value] of entries) localStorage.setItem(key, value); }, Object.entries(kept));
    await context.route('**/__/firebase/init.json', (route) => route.fulfill({ json: { apiKey: 'made-up', projectId: 'demo-late', appId: '1:1:web:1', ...config } }));
    await routeAnalytics(context, analytics, config.measurementId);
    await context.route('https://www.gstatic.com/firebasejs/**', async (route) => {
      await held;
      const response = await route.fetch().catch((error) => error);
      if (response instanceof Error || !response.ok()) {
        noSdk(response instanceof Error ? response.message.split('\n')[0] : `HTTP ${response.status()}`);
        return route.abort();
      }
      return route.fulfill({ response });
    });
    await context.route(/firestore\.googleapis\.com/, (route) => {
      const documents = JSON.parse(route.request().postData() || '{}').documents || [];
      reads.push(...documents.map((name) => name.split('/documents/')[1]));
      const now = new Date().toISOString();
      route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: documents.map((name) => {
        const fields = Object.entries(stored).find(([where]) => name.endsWith(`/documents/${where}`))?.[1];
        return fields ? { found: { name, fields, createTime: now, updateTime: now }, readTime: now } : { missing: name, readTime: now };
      }) });
    });
  });
  page.reads = reads;
  page.analytics = analytics;
  page.releaseNow = () => release();
  page.release = async () => {
    await page.evaluate(() => {
      window.headerDrawn = 0;
      new MutationObserver((changes) => { window.headerDrawn += changes.length; }).observe(document.getElementById('appTitle'), { childList: true });
    });
    release();
    await Promise.race([
      page.waitForFunction(() => window.headerDrawn >= 3),
      sdkMissing.then((why) => { throw new Error(`no internet connection? The Firebase code could not be loaded from www.gstatic.com (${why}); this step needs it`); }),
    ]);
  };
  return page;
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

await step('"Show on the TV" opens from a technique with this page\'s address, and ?tv draws the page large', async () => {
  await page.locator(`main [data-technique="${id}"]`).first().click();
  await page.locator('#panel [data-tv]').click();
  const sheet = page.locator('#tvSheet');
  await sheet.waitFor();
  assert.match(await sheet.locator('.tv-address').textContent(), new RegExp(`#t-${id}$`));
  await page.keyboard.press('Escape');
  await sheet.waitFor({ state: 'hidden' });
  assert.ok(await page.locator('#panel').isVisible(), 'Escape closes only the TV sheet');
  await page.locator('#panelClose').click();
  const tvPage = await open('/?tv#curriculum', 'en-US');
  await tvPage.waitForFunction(() => document.documentElement.classList.contains('tv'));
  await tvPage.context().close();
});

await step('"Where to go" is subdivided by what the next move does, one group open at a time', async () => {
  await page.locator('#sidebar a[href="#top"]').click();
  await page.locator('main [data-technique="top-base"]').click();
  const tabs = page.locator('#panel .gtab');
  assert.ok((await tabs.count()) > 1, 'more than one group');
  const first = await page.locator('#panel [role="tabpanel"] [data-technique]').first().getAttribute('data-technique');
  await tabs.nth(1).click();
  assert.equal(await tabs.nth(1).getAttribute('aria-selected'), 'true');
  const second = await page.locator('#panel [role="tabpanel"] [data-technique]').first().getAttribute('data-technique');
  assert.notEqual(second, first, 'the open group shows its own techniques');
  await page.locator('#panelClose').click();
});

await step('search finds a technique by a word in its description', async () => {
  const guard = await (await get('/data/content.json')).json();
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
  assert.ok((await page.locator('main .mstep').first().boundingBox()).height > 60, 'the method steps stand as cards, not as the panel\u2019s round buttons');
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

  await step('the published site ignores the tests\' ?emulators= address: the real sign-in and database, nobody signed in', async () => {
    const hosts = [];
    const person = encodeURIComponent(JSON.stringify({ sub: 'made-up', email: 'made-up@example.com', name: 'Made Up' }));
    const visit = await open(`/?emulators=${person}&firestore=8080&auth=9099#curriculum`, 'en-US', {}, async (context) => {
      context.on('request', (request) => hosts.push(new URL(request.url()).host));
    });
    await visit.locator('#accountMenu #signIn').waitFor({ state: 'attached', timeout: 20000 });
    await until(() => hosts.includes('firestore.googleapis.com'), 'a read from the real database');
    assert.deepEqual(hosts.filter((host) => /^(127\.0\.0\.1|localhost)(:|$)/.test(host)), [], 'nothing asks this computer');
    assert.doesNotMatch(await visit.locator('#account').getAttribute('aria-label'), /Made Up/, 'nobody is signed in');
    await visit.context().close();
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
  // The address changes first; the page follows when the browser reports the change, a moment later.
  await phone.locator(`#partMenu a[href="${href}"][aria-current="page"]`).waitFor({ state: 'attached' });
  assert.equal(new URL(phone.url()).hash, href);
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
  // A database with no class this week, so the first page is Curriculum (the real one may have a week, which would
  // make This week the first page of a visit that opens after it arrived).
  const phone = await openLate('/', 'en-US', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await phone.release();
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

await step('on a phone: swiping an open technique moves to the next one and back, and Back closes it', async () => {
  const phone = await open('/#top', 'en-US', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const part = phone.url();
  await phone.locator('main .tech').first().tap();
  const first = await phone.locator('#panel [data-favorite]').getAttribute('data-favorite');
  // Real touches, through the browser itself, so the browser's own swipe-to-go-back gets its chance too.
  const touchscreen = await phone.context().newCDPSession(phone);
  const title = await phone.locator('#panelTitle').boundingBox();
  const swipe = async (fromX, toX, redraw = false) => {
    const y = title.y + title.height / 2;
    await touchscreen.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fromX, y }] });
    // The sheet redrawing under the finger, as it does when a diagram arrives: the touched title is replaced by a copy.
    if (redraw) await phone.evaluate(() => { const title = document.querySelector('#panelTitle'); title.replaceWith(title.cloneNode(true)); });
    for (let i = 1; i <= 8; i++) await touchscreen.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: fromX + ((toX - fromX) * i) / 8, y }] });
    await touchscreen.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await phone.waitForTimeout(400);
  };
  const position = async () => (await phone.locator('#panel .step-count').textContent()).trim().split(' ')[0];
  await swipe(330, 80);
  assert.notEqual(await phone.locator('#panel [data-favorite]').getAttribute('data-favorite'), first);
  assert.equal(await position(), '2');
  await swipe(150, 330);
  assert.ok(await phone.locator('#panel').isVisible(), 'swiping back keeps the technique open');
  assert.equal(await position(), '1');
  assert.equal(new URL(phone.url()).hash, `#t-${first}`);
  await swipe(330, 80, true);
  assert.equal(await position(), '2', 'a swipe counts even when the sheet redraws under the finger');
  await swipe(150, 330);
  assert.equal(await position(), '1');
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

await step('the site arriving late keeps a note being typed', async () => {
  const visit = await openLate('/#top', 'en-US');
  await visit.locator('main .tech').first().click();
  const noted = await visit.locator('#noteBox').getAttribute('data-note');
  await visit.locator('#noteBox').click();
  await visit.keyboard.type('Hips low');
  await visit.release();
  assert.equal(await visit.evaluate(() => document.activeElement.id), 'noteBox', 'the note box keeps the focus');
  await visit.keyboard.type(', elbows in');
  assert.ok(await visit.locator('#panel').isVisible(), 'the technique stays open');
  assert.equal(await visit.locator('#noteBox').inputValue(), 'Hips low, elbows in');
  await visit.locator('#panelClose').click();
  await visit.reload();
  await visit.locator(`main [data-technique="${noted}"]`).first().click();
  assert.equal(await visit.locator('#noteBox').inputValue(), 'Hips low, elbows in', 'and is kept');
});

await step('on a phone: the site arriving late keeps the part menu open, and a tap outside it still opens nothing', async () => {
  const phone = await openLate('/#top', 'en-US', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await phone.locator('main .tech').first().waitFor();
  await phone.locator('#partButton').tap();
  await phone.release();
  const point = await phone.evaluate(() => {
    const menuBottom = document.getElementById('partMenu').getBoundingClientRect().bottom;
    const chip = [...document.querySelectorAll('main .tech')].map((tech) => tech.getBoundingClientRect())
      .find((box) => box.top > menuBottom + 4 && box.bottom < window.innerHeight - 80);
    return { x: chip.left + 10, y: chip.top + chip.height / 2 };
  });
  await phone.touchscreen.tap(point.x, point.y);
  assert.ok(!(await phone.locator('#panel').isVisible()), 'a tap outside the menu opens nothing under it');
  assert.ok(!(await phone.locator('#partMenu').isVisible()), 'and closes the menu');
});

await step('on a phone: the site arriving late keeps the part menu open and its parts work', async () => {
  const phone = await openLate('/#top', 'en-US', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await phone.locator('main .tech').first().waitFor();
  await phone.locator('#partButton').click();
  await phone.release();
  assert.ok(await phone.locator('#partMenu').isVisible(), 'the part menu stays open');
  assert.equal(await phone.locator('#partButton').getAttribute('aria-expanded'), 'true');
  assert.ok(await phone.evaluate(() => document.getElementById('partMenu').contains(document.activeElement)), 'the focus stays in the menu');
  const other = phone.locator('#partMenu a:not([aria-current])').first();
  const href = await other.getAttribute('href');
  await other.click({ timeout: 5000 });
  await phone.waitForFunction((hash) => location.hash === hash, href);
});

await step('the site arriving late with a video for the open technique leaves the focus where it was', async () => {
  const technique = 'top-base';
  const visit = await openLate('/#top', 'en-US', {}, { stored: { 'site/media': firestoreFields({ techniques: { [technique]: { video: 'dQw4w9WgXcQ' } } }) } });
  await visit.locator(`main [data-technique="${technique}"]`).first().click();
  const mark = `[data-progress="${technique}:learning"]`;
  await visit.locator(`#panel ${mark}`).focus();
  assert.equal(await visit.locator('#panel [data-play]').count(), 0, 'no video before the site arrives');
  await visit.release();
  await visit.locator('#panel [data-play]').waitFor();
  assert.ok(await visit.evaluate((selector) => document.activeElement.matches(`#panel ${selector}`), mark), 'the focus stays on the progress mark');
  await visit.keyboard.press('Space');
  assert.ok(await visit.locator('#panel').isVisible(), 'so the next key presses the mark and does not close the technique');
  assert.equal(await visit.locator(`#panel ${mark}`).getAttribute('aria-pressed'), 'true');
});

await step('a note typed in another tab leaves a video playing here, and still shows here', async () => {
  const technique = 'top-base';
  const visit = await openLate('/#top', 'en-US', {}, { stored: { 'site/media': firestoreFields({ techniques: { [technique]: { video: 'dQw4w9WgXcQ' } } }) } });
  await visit.context().route(/youtube-nocookie\.com|youtube\.com/, (route) => route.fulfill({ contentType: 'text/html', body: '<p>player</p>' }));
  await visit.release();
  await visit.locator(`main [data-technique="${technique}"]`).first().click();
  await visit.locator('#panel [data-play]').click();
  await visit.locator('#panel iframe').evaluate((player) => { player.dataset.playing = 'yes'; });
  const other = await visit.context().newPage();
  await other.goto(`${address}/#top`);
  const elsewhere = other.locator(`main [data-technique]:not([data-technique="${technique}"])`).first();
  const noted = await elsewhere.getAttribute('data-technique');
  await elsewhere.click();
  await other.locator(`#noteBox[data-note="${noted}"]`).click();
  await other.keyboard.type('abc');
  await visit.waitForFunction((id) => JSON.parse(localStorage.getItem('sg-notes') || '{}')[id] === 'abc', noted);
  assert.equal(await visit.locator('#panel iframe[data-playing="yes"]').count(), 1, 'the video keeps playing');
  assert.equal(await visit.locator('#panel [data-play]').count(), 0, 'and is not put back behind its play button');
  // A note on this technique, typed in the other tab, still shows here, and the video still plays.
  await other.locator('#panelClose').click();
  await other.locator(`main [data-technique="${technique}"]`).first().click();
  await other.locator('#noteBox').click();
  await other.keyboard.type('Base wide');
  await visit.waitForFunction(() => document.getElementById('noteBox').value === 'Base wide');
  assert.equal(await visit.locator('#panel iframe[data-playing="yes"]').count(), 1, 'the video keeps playing');
  await visit.context().close();
});

await step('the site arriving late and changing the page leaves the focus on the same control', async () => {
  // A class this week (a new link in the navigation) and a minimum belt in this part (a mark on the move):
  // the sidebar, the bottom bar, the page and the account menu are all drawn again with something new in them.
  const technique = 'top-base';
  const stored = {
    'site/week': firestoreFields({ weekOf: '2026-11-23', title: { pt: 'Postura', en: 'Posture' }, note: { pt: '', en: '' }, techniques: [technique] }),
    'site/media': firestoreFields({ techniques: { [technique]: { minBelt: 'blue' } } }),
  };
  const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
  for (const [selector, device, changed] of [
    ['#sidebar a[href="#top"]', {}, '#sidebar a[href="#semana"]'],
    [`main [data-technique="${technique}"]`, {}, `main [data-technique="${technique}"] .belt`],
    ['#accountMenu [data-theme-choice="light"]', {}, '#accountMenu #signIn'],
    ['#bottomBar a[href="#meu"]', phone, '#bottomBar a[href="#semana"]'],
  ]) {
    const visit = await openLate('/#top', 'en-US', device, { stored });
    await visit.locator('main .tech').first().waitFor();
    if (selector.startsWith('#accountMenu')) await visit.locator('#account').click();
    await visit.locator(selector).focus();
    await visit.release();
    await visit.locator(changed).waitFor({ state: 'attached' });
    assert.ok(await visit.evaluate((wanted) => document.activeElement.matches(wanted), selector), `the focus stays on ${selector}`);
    if (selector.startsWith('#accountMenu')) assert.ok(await visit.locator('#accountMenu').isVisible(), 'the account menu stays open');
    await visit.context().close();
  }
});

await step('on a phone: a week arriving after the person started leaves the first page alone; This week waits in the navigation', async () => {
  const stored = { 'site/week': firestoreFields({ weekOf: '2026-11-23', title: { pt: 'Postura', en: 'Posture' }, note: { pt: '', en: '' }, techniques: ['top-base'] }) };
  const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
  const firstPageShown = (visit) => visit.evaluate(() => ({ hash: location.hash, heading: document.querySelector('main h2')?.textContent }));
  const curriculum = { hash: '', heading: 'Curriculum' };
  // Into a part, Back, then Search: the week arrives with the focus in the search box.
  let visit = await openLate('/', 'en-US', phone, { stored });
  await visit.locator('main .part-card').first().tap();
  await visit.locator('main .spine').waitFor();
  await visit.goBack();
  await visit.locator('main .part-card').first().waitFor();
  await visit.locator('#bottomBar [data-search-button]').tap();
  await visit.release();
  await visit.locator('#bottomBar a[href="#semana"]').waitFor();
  assert.deepEqual(await firstPageShown(visit), curriculum, 'Curriculum stays, with This week in the bottom bar');
  assert.equal(await visit.evaluate(() => document.activeElement.id), 'search', 'and the focus stays in the search box');
  await visit.locator('main .part-card').first().tap({ timeout: 5000 });
  await visit.locator('main .spine').waitFor();
  await visit.context().close();
  // The week arrives inside a part: Back returns to the Curriculum the person left, and This week opens when tapped.
  visit = await openLate('/', 'en-US', phone, { stored });
  await visit.locator('main .part-card').first().tap();
  await visit.locator('main .spine').waitFor();
  await visit.release();
  await visit.goBack();
  await visit.locator('main .part-card').first().waitFor({ timeout: 5000 });
  assert.deepEqual(await firstPageShown(visit), curriculum, 'Back returns to Curriculum');
  await visit.locator('#bottomBar a[href="#semana"]').tap();
  await visit.locator('main .week-title', { hasText: 'Posture' }).waitFor();
  await visit.context().close();
  // Nothing touched yet: the visit opens on This week, as before.
  visit = await openLate('/', 'en-US', phone, { stored });
  await visit.locator('main .part-card').first().waitFor();
  await visit.release();
  await visit.locator('main .week-title', { hasText: 'Posture' }).waitFor();
  assert.equal(new URL(visit.url()).hash, '');
  await visit.context().close();
});

await step('a technique opened before the site is online shows its diagram once it is, read once', async () => {
  // This browser's copy of the site's media is old but says the technique has a diagram, so the sheet has a place
  // for it before the database is there; the database says so too.
  const technique = 'top-base';
  const techniques = { [technique]: { diagram: true } };
  const image = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
  const visit = await openLate(`/#t-${technique}`, 'en-US', {}, {
    stored: { 'site/media': firestoreFields({ techniques }), [`diagrams/${technique}`]: firestoreFields({ image }) },
    kept: { 'sg-site-media': JSON.stringify({ at: 0, value: { techniques } }) },
  });
  await visit.locator('#panelDiagram').waitFor({ state: 'attached' });
  await visit.release();
  await visit.locator('#panelDiagram img').waitFor({ timeout: 5000 });
  await visit.locator('#panelClose').click();
  await visit.locator(`main [data-technique="${technique}"]`).first().click();
  await visit.locator('#panelDiagram img').waitFor({ timeout: 5000 });
  // Another technique, without a diagram: nothing more is read.
  await visit.locator('#panel [data-step="1"]').click();
  await visit.waitForFunction((hash) => location.hash !== hash, `#t-${technique}`);
  await visit.waitForTimeout(300);
  assert.deepEqual(visit.reads.filter((name) => name.startsWith('diagrams/')), [`diagrams/${technique}`], 'the diagram is read once, and no other');
});

await step('the site arriving late shows the lesson plan the settings hold', async () => {
  // This browser was signed in before, and the account turns out to be signed out: its lesson leaves the device.
  // site/week arrives too, so the page really is drawn again.
  const week = { weekOf: '2026-11-23', title: { pt: 'Postura', en: 'Posture' }, note: { pt: '', en: '' }, techniques: ['top-base'] };
  const visit = await openLate('/#lesson', 'en-US', {}, { stored: { 'site/week': firestoreFields(week) }, kept: { 'sg-account': 'someone-signed-in-before' } });
  await visit.locator('#selMod').waitFor();
  const parts = await visit.locator('#selMod option').evaluateAll((options) => options.map((option) => option.value));
  await visit.selectOption('#selMod', parts[1]);
  await visit.selectOption('#selMod', parts[0]);
  await visit.selectOption('#selDur', '90');
  await visit.locator('#plan .meta', { hasText: '90 min' }).waitFor();
  await visit.release();
  await visit.locator('#sidebar a[href="#semana"]').waitFor();
  const lesson = await visit.evaluate(() => JSON.parse(localStorage.getItem('sg-settings')).lesson || null);
  assert.equal(lesson, null, 'the lesson left this device');
  assert.equal(await visit.locator('#selDur').inputValue(), '60', 'the length shown is the one the settings hold');
  assert.match(await visit.locator('#plan .meta').textContent(), /^60 min$/, 'and so is the plan');
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
  const seen = await visit.evaluate(() => JSON.parse(localStorage.getItem('sg-settings')).seenWeek);
  assert.match(seen, /^2026-11-23:[0-9a-z]+$/, 'kept with the settings, short enough for the account');
  await visit.locator('#sidebar a[href="#curriculum"]').click();
  await visit.reload();
  await visit.locator('#sidebar a[href="#semana"]').waitFor();
  assert.equal(await dot.count(), 0, 'and stays gone');
});

await step('a minimum belt an admin set shows on its technique, and "up to my belt" hides it; Everything shows all again', async () => {
  const visit = await open('/#top', 'en-US');
  await visit.locator('main .tech').first().waitFor();
  assert.equal(await visit.locator('main .tech .belt').count(), 0, 'no minimum belt set: no belt marks');
  assert.equal(await visit.locator('main .belt-hint, main .belt-filter').count(), 0, 'and no belt filter');
  // What site/media would hold after an admin set two minimum belts (kept in this browser like the real copy).
  await visit.evaluate(() => localStorage.setItem('sg-site-media', JSON.stringify({ at: Date.now(), value: {
    techniques: { 'top-biceps-grips': { minBelt: 'blue' }, 'top-break-the-grip': { minBelt: 'white' } } } })));
  await visit.reload();
  await visit.locator('main .tech').first().waitFor();
  const all = await visit.locator('main .tech').count();
  assert.equal(await visit.locator('main .tech .belt').count(), 2, 'only the techniques with a minimum are marked');
  assert.equal(await visit.locator('main [data-technique="top-biceps-grips"] .belt').getAttribute('aria-label'), 'Minimum belt: Blue belt');
  assert.ok(await visit.locator('main .belt-hint').isVisible(), 'a hint to pick a belt');
  assert.match(await visit.locator('main .belt-hint').textContent(), /menu at the top right/, 'signed out there is no photo to point at');
  await visit.locator('main [data-technique="top-biceps-grips"]').click();
  await visit.locator('#panel .from', { hasText: 'Minimum belt: Blue belt' }).waitFor();
  await visit.locator('#panelClose').click();
  await visit.locator('#account').click();
  await visit.locator('[data-belt-choice="white"]').click();
  assert.equal(await visit.locator('[data-belt-choice="white"]').getAttribute('aria-checked'), 'true');
  assert.equal(await visit.locator('[data-belt-choice="blue"]').getAttribute('aria-checked'), 'false', 'a screen reader hears the others as not chosen');
  await visit.keyboard.press('Escape');
  await visit.locator('main [data-belt-filter="mine"][aria-pressed="true"]').waitFor();
  assert.equal(await visit.locator('main [data-belt-filter="all"]').getAttribute('aria-pressed'), 'false');
  assert.equal(await visit.locator('main .tech').count(), all - 1, 'only the blue-belt technique is hidden');
  assert.equal(await visit.locator('main [data-technique="top-biceps-grips"]').count(), 0);
  assert.equal(await visit.locator('main [data-technique="top-break-the-grip"]').count(), 1, 'a white-belt minimum stays');
  await visit.locator('main [data-belt-filter="all"]').click();
  assert.equal(await visit.locator('main .tech').count(), all);
  await visit.reload();
  await visit.locator('main [data-belt-filter="mine"][aria-pressed="true"]').waitFor();
});

// ---- Google Analytics and the cookie bar (js/analytics.js) ----
// Its id comes from the site's Firebase settings; here a made-up one, and Google Analytics itself is answered by
// routeAnalytics(), so nothing reaches the real one.
const measurementId = 'G-MADEUP123';
const withAnalytics = { config: { measurementId } };
const hits = (visit) => analyticsHits(visit.analytics);
const analyticsCookies = async (visit) => (await visit.context().cookies()).filter((cookie) => cookie.name.startsWith('_ga'));
const online = (visit) => visit.locator('#accountMenu #signIn').waitFor({ state: 'attached' });
const consentCommands = (visit) => visit.evaluate(() => (window.dataLayer || []).map((command) => Array.from(command)).filter(([kind]) => kind === 'consent').map(([, , settings]) => settings));

await step('without Google Analytics switched on: no cookie bar, no "Cookies" in the menu, nothing sent', async () => {
  const visit = await openLate('/#top', 'en-US');
  await visit.release();
  await visit.locator('main .tech').first().click();
  await visit.waitForTimeout(500);
  assert.ok(await visit.locator('#cookieBar').isHidden(), 'no cookie bar');
  assert.equal(await visit.locator('#accountMenu #cookieChoice').count(), 0, 'no "Cookies" in the account menu');
  assert.deepEqual(visit.analytics.map((request) => request.url), []);
  assert.deepEqual(await analyticsCookies(visit), []);
});

await step('a page opened for the television does not ask about cookies and counts nothing', async () => {
  const tv = await openLate('/?tv#curriculum', 'en-US', undefined, withAnalytics);
  await tv.release();
  await online(tv);
  await tv.locator('main .part-card').first().waitFor();
  await tv.waitForTimeout(500);
  assert.ok(await tv.locator('#cookieBar').isHidden(), 'no cookie bar on the television');
  assert.deepEqual(tv.analytics.map((request) => request.url), [], 'and nothing goes to Google Analytics');
  assert.deepEqual(await analyticsCookies(tv), []);
});

await step('on a phone, with Google Analytics switched on: the bar asks first, above the bottom bar; nothing is sent before a choice or after "Reject"', async () => {
  const phone = await openLate('/#top', 'en-US', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, withAnalytics);
  await phone.release();
  const bar = phone.locator('#cookieBar');
  await bar.waitFor();
  assert.match(await bar.textContent(), /Google Analytics/);
  assert.equal(await bar.locator('[data-cookies="accepted"]').textContent(), 'Accept');
  assert.equal(await bar.locator('[data-cookies="rejected"]').textContent(), 'Reject');
  assert.equal(await bar.locator('a[href="#privacy"]').count(), 1, 'a link to the privacy page');
  const [barBox, bottomBox] = [await bar.boundingBox(), await phone.locator('#bottomBar').boundingBox()];
  assert.ok(barBox.y + barBox.height <= bottomBox.y + 0.5, `the bar sits above the bottom bar, not over it (${JSON.stringify([barBox, bottomBox])})`);
  // Not a dialog: the site works around it.
  await phone.locator('main .tech').first().tap();
  await phone.locator('#panelClose').tap();
  await phone.locator('#bottomBar a[href="#curriculum"]').tap();
  await phone.locator('main .part-card').first().waitFor();
  await phone.waitForTimeout(500);
  assert.deepEqual(phone.analytics.map((request) => request.url), [], 'nothing goes to Google Analytics before a choice');
  assert.deepEqual(await analyticsCookies(phone), [], 'and no _ga cookie');
  assert.equal(await phone.evaluate(() => 'dataLayer' in window || 'gtag' in window), false, "Google Analytics' code is not even loaded");
  assert.ok(!(await phone.evaluate(async () => (await indexedDB.databases()).map((database) => database.name))).includes('firebase-installations-database'), 'nor its install id');
  await bar.locator('[data-cookies="rejected"]').tap();
  assert.ok(await bar.isHidden(), 'the bar goes away');
  await phone.locator('main .part-card').first().tap();
  await phone.locator('main .tech').first().tap();
  await phone.reload();
  await online(phone);
  await phone.waitForTimeout(800);
  assert.ok(await bar.isHidden(), 'and stays away after a reload');
  assert.deepEqual(phone.analytics.map((request) => request.url), [], 'nothing is sent after "Reject"');
  assert.deepEqual(await analyticsCookies(phone), []);
  await phone.goto(`${address}/#curriculum`);
  await phone.locator('#account').tap();
  await phone.locator('#accountMenu #cookieChoice').tap();
  await bar.waitFor();
  assert.equal(await bar.locator('[data-cookies="rejected"]').getAttribute('aria-pressed'), 'true', '"Cookies" shows the choice made');
  assert.equal(await bar.locator('[data-cookies="accepted"]').getAttribute('aria-pressed'), 'false');
  assert.match(await bar.textContent(), /Now: rejected/);
  await bar.locator('[data-cookies="rejected"]').tap();
  assert.ok(await bar.isHidden());
  assert.deepEqual(phone.analytics.map((request) => request.url), []);
});

await step('after "Accept": a page view for the part and for each technique opened, nothing personal and no ads; "Reject" from the menu stops it and deletes the cookies', async () => {
  const visit = await openLate('/#top', 'en-US', {}, withAnalytics);
  await visit.release();
  await visit.fill('#search', 'secret search words');
  await visit.fill('#search', '');
  await visit.locator('#cookieBar [data-cookies="accepted"]').click();
  assert.ok(await visit.locator('#cookieBar').isHidden());
  await until(() => hits(visit).some((hit) => hit.en === 'page_view' && hit.page_location.endsWith('/#top')), 'a page view for #top');
  const technique = 'top-base';
  await visit.locator(`main [data-technique="${technique}"]`).first().click();
  await until(() => hits(visit).some((hit) => hit.page_location.endsWith(`/#t-${technique}`)), 'a page view for the technique');
  const opened = hits(visit).find((hit) => hit.page_location.endsWith(`/#t-${technique}`));
  assert.equal(opened.en, 'page_view');
  assert.equal(opened.page_title, (await visit.locator('#panelTitle').textContent()).trim());
  assert.equal(hits(visit).filter((hit) => hit.en === 'page_view').length, 2, 'one page view each');
  for (const hit of hits(visit)) {
    assert.equal(hit.tid, measurementId);
    for (const key of ['user_id', 'uid', 'email', 'name']) assert.equal(hit[key], undefined, `no ${key}`);
    assert.doesNotMatch(JSON.stringify(hit), /@|secret search/, 'no email, no search words');
    assert.equal(hit.allow_google_signals, false);
    assert.equal(hit.allow_ad_personalization_signals, false);
  }
  const consents = await consentCommands(visit);
  assert.ok(consents.length && consents.every((consent) => consent.ad_storage === 'denied' && consent.ad_user_data === 'denied' && consent.ad_personalization === 'denied'), 'advertising stays denied');
  assert.ok((await analyticsCookies(visit)).length, 'gtag.js may set its cookies now');
  await visit.locator('#panelClose').click();
  const beforeReload = hits(visit).length;
  await visit.reload();
  await until(() => hits(visit).length > beforeReload, 'a page view after a reload: "Accept" is remembered');
  assert.ok(await visit.locator('#cookieBar').isHidden());
  await visit.locator('#account').click();
  await visit.locator('#accountMenu #cookieChoice').click();
  assert.equal(await visit.locator('#cookieBar [data-cookies="accepted"]').getAttribute('aria-pressed'), 'true');
  await visit.locator('#cookieBar [data-cookies="rejected"]').click();
  assert.deepEqual(await analyticsCookies(visit), [], 'the _ga cookies are deleted');
  assert.equal(await visit.evaluate((id) => window[`ga-disable-${id}`], measurementId), true, 'collection is switched off');
  assert.equal((await consentCommands(visit)).at(-1).analytics_storage, 'denied');
  const sent = visit.analytics.length;
  await visit.locator('main .tech').nth(1).click();
  await visit.locator('#panelClose').click();
  await visit.locator('#sidebar a[href="#curriculum"]').click();
  await visit.locator('main .part-card').first().waitFor();
  await visit.waitForTimeout(800);
  assert.equal(visit.analytics.length, sent, 'nothing more is sent');
  await visit.reload();
  await online(visit);
  await visit.locator('main .part-card').first().click();
  await visit.locator('main .tech').first().click();
  await visit.waitForTimeout(800);
  assert.equal(visit.analytics.length, sent, 'nor after a reload');
  assert.deepEqual(await analyticsCookies(visit), []);
  assert.ok(await visit.locator('#cookieBar').isHidden());
});

await step('"Reject" in one tab stops the counting in another tab of the same browser too', async () => {
  const first = await openLate('/#top', 'en-US', {}, withAnalytics);
  await first.release();
  await first.locator('#cookieBar [data-cookies="accepted"]').click();
  const second = await first.context().newPage();
  await second.goto(`${address}/#curriculum`);
  await until(() => hits(first).some((hit) => hit.page_location.endsWith('/#curriculum')), 'a page view from the second tab');
  await first.locator('#account').click();
  await first.locator('#accountMenu #cookieChoice').click();
  await first.locator('#cookieBar [data-cookies="rejected"]').click();
  assert.deepEqual(await analyticsCookies(first), [], 'the _ga cookies are deleted');
  await second.waitForTimeout(300);
  const sent = first.analytics.length;
  await second.locator('main .part-card').first().click();
  await second.locator('main .tech').first().click();
  await second.locator('#panelClose').click();
  await second.locator('main .tech').nth(1).click();
  await second.waitForTimeout(800);
  assert.equal(first.analytics.length, sent, 'the other tab sends nothing more');
  assert.deepEqual(await analyticsCookies(second), [], 'nor sets its cookies again');
  assert.equal(await second.evaluate((id) => window[`ga-disable-${id}`], measurementId), true, 'its collection is switched off');
  // And the other way: "Accept" in one tab is followed by the other one.
  await first.locator('#account').click();
  await first.locator('#accountMenu #cookieChoice').click();
  await first.locator('#cookieBar [data-cookies="accepted"]').click();
  await second.locator('#panelClose').click();
  await second.locator('main .tech').nth(2).click();
  await until(() => first.analytics.length > sent, 'the other tab counting again after "Accept"');
});

await step('"Reject" pressed while the Google Analytics code is still loading: it is never started, nothing goes to Google', async () => {
  const visit = await openLate('/#top', 'en-US', {}, withAnalytics);
  let arrived;
  const loaded = new Promise((resolve) => { arrived = resolve; });
  await visit.context().route('**/firebase-analytics.js', async (route) => {
    await visit.waitForTimeout(2500); // a slow phone
    await route.fallback();
    arrived();
  });
  await visit.release();
  await visit.locator('#cookieBar [data-cookies="accepted"]').click();
  await visit.locator('#account').click();
  await visit.locator('#accountMenu #cookieChoice').click();
  await visit.locator('#cookieBar [data-cookies="rejected"]').click();
  await loaded;
  await visit.locator('main .tech').first().click();
  await visit.waitForTimeout(1500);
  assert.deepEqual(visit.analytics.map((request) => request.url), [], 'no request to Google Analytics, Tag Manager or Firebase installations');
  assert.deepEqual(await analyticsCookies(visit), []);
  assert.ok(!(await visit.evaluate(async () => (await indexedDB.databases()).map((database) => database.name))).includes('firebase-installations-database'), 'no install id kept');
});

await step('"Clear this browser" forgets the cookie choice, so the bar asks again', async () => {
  const visit = await openLate('/#privacy', 'en-US', {}, withAnalytics);
  await visit.release();
  await visit.locator('#cookieBar [data-cookies="rejected"]').click();
  assert.ok(await visit.locator('#cookieBar').isHidden());
  await visit.locator('[data-delete-data="ask"]').click();
  await visit.locator('[data-delete-data="yes"]').click();
  await visit.locator('#cookieBar [data-cookies="accepted"][aria-pressed="false"]').waitFor();
  assert.equal(await visit.evaluate(() => localStorage.getItem('sg-cookies')), null);
  assert.deepEqual(visit.analytics.map((request) => request.url), []);
});

await step('a Portuguese browser gets the cookie bar in Portuguese', async () => {
  const visit = await openLate('/#top', 'pt-BR', {}, withAnalytics);
  await visit.release();
  const bar = visit.locator('#cookieBar');
  await bar.waitFor();
  assert.match(await bar.textContent(), /Podemos contar as visitas com o Google Analytics\?/);
  assert.equal(await bar.locator('[data-cookies="accepted"]').textContent(), 'Aceitar');
  assert.equal(await bar.locator('[data-cookies="rejected"]').textContent(), 'Recusar');
  assert.equal(await bar.locator('a[href="#privacy"]').textContent(), 'Saiba mais');
  await visit.locator('#account').click();
  assert.equal((await visit.locator('#accountMenu #cookieChoice').textContent()).trim(), 'Cookies');
});

await step('the admin page counts nothing, even in a browser that accepted', async () => {
  const admin = await openLate('/admin.html', 'en-US', {}, { ...withAnalytics, kept: { 'sg-cookies': 'accepted' } });
  admin.releaseNow();
  await admin.locator('main :is(p, form, h2)').first().waitFor();
  await admin.waitForTimeout(1500);
  assert.deepEqual(admin.analytics.map((request) => request.url), []);
});

await usabilitySteps({ open, step });
await kidsSteps({ open, openLate, step, hits, analyticsCookies, online, withAnalytics });
await tvSteps({ open, step, routeAnalytics, measurementId });

await step('the privacy page opens from the sidebar and the account menu, and says coaches see progress, not notes', async () => {
  const visit = await open('/#curriculum', 'en-US');
  await visit.locator('#sidebar a[href="#privacy"]').click();
  await visit.locator('main h2', { hasText: 'Privacy and your data' }).waitFor();
  assert.equal(await visit.locator('#sidebar a[href="#privacy"]').getAttribute('aria-current'), 'page');
  const words = await visit.locator('main').textContent();
  assert.match(words, /coaches and the site's administrators can see/i);
  assert.match(words, /except your notes/);
  assert.match(words, /no tracking/i);
  assert.match(words, /may not be collected to train AI systems/);
  assert.match(words, /Visitor statistics and cookies/);
  assert.match(words, /Only the people who run the site see these numbers/);
  assert.match(words, /keeps the details of each visit for 14 months/);
  assert.match(words, /optional and off until you accept/);
  assert.match(words, /What this browser keeps either way/);
  // The kids' class: what is kept, that coaches approve it, no age asked, a parent sets it up, visits not counted.
  assert.match(words, /For the kids class/);
  assert.match(words, /challenges the child said they did/);
  assert.match(words, /Coaches see and approve/);
  assert.match(words, /never asks for an age or a birth date/);
  assert.match(words, /parent or guardian should set up a child’s account/);
  assert.match(words, /Each child signs in with a Google account of their own/);
  assert.match(words, /visits are not counted/);
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
  assert.match(await visit.locator('main').textContent(), /Estatísticas de visitas e cookies/);
  assert.match(await visit.locator('main').textContent(), /Para a turma kids[\s\S]*não pergunta a idade nem a data de nascimento[\s\S]*pai, mãe ou responsável[\s\S]*as visitas não são contadas/);
  assert.match(await visit.locator('main').textContent(), /opcional e fica desligado até você aceitar/);
  assert.match(await visit.locator('main').textContent(), /guarda os detalhes de cada visita por 14 meses/);
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

await step('AI crawlers are asked to stay out; search engines may list the pages', async () => {
  const response = await get('/robots.txt');
  assert.equal(response.status, 200, 'robots.txt is published');
  const robots = (await response.text()).replace(/\r\n/g, '\n');
  for (const bot of ['GPTBot', 'ClaudeBot', 'CCBot', 'Google-Extended', 'PerplexityBot', 'Bytespider', 'Applebot-Extended', 'Meta-ExternalAgent']) {
    assert.match(robots, new RegExp(`^User-agent: ${bot}$`, 'm'), bot);
  }
  assert.doesNotMatch(robots, /^User-agent: (Googlebot|Bingbot|DuckDuckBot|Applebot)$/im, 'search engines are not refused');
  assert.match(robots, /^Content-Signal: search=yes, ai-train=no, ai-input=no$/m);
  assert.match(robots, /User-agent: \*\n(?:.*\n)*?Disallow: \/data\/\nDisallow: \/admin\.html\nAllow: \/\n/);
  for (const [path, words] of [['/', 'noai, noimageai'], ['/admin.html', 'noindex, noai, noimageai']]) {
    const html = await (await get(path)).text();
    assert.ok(html.includes(`<meta name="robots" content="${words}">`), `${path} asks for ${words}`);
  }
  // The headers come from firebase.json, so only the published site sends them; with --code-from, the checkout's.
  if (published) {
    const tag = async (path) => (await get(path)).headers.get('x-robots-tag');
    assert.equal(await tag('/'), 'noai, noimageai');
    assert.equal(await tag('/admin.html'), 'noindex, noai, noimageai');
    assert.equal(await tag('/data/content.json'), 'noindex, noai, noimageai');
  }
});

await browser.close();

if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
  process.exit(1);
}
console.log('\nThe site works.');
