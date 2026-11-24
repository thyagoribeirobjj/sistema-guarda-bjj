// Opens the site in a real browser and uses it the way a visitor would: tabs, a technique, search,
// progress, the tree, sharing, the lesson builder, the account menu, past weeks and theme, the back button, both languages, the admin page. A page that fails to load fails here.
//   npm run smoke -- http://localhost:8000      (needs: npm install --no-save playwright-core)
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const address = (process.argv[2] || 'http://localhost:8000').replace(/\/$/, '');
const published = !/localhost|127\.0\.0\.1/.test(address);
const browser = await chromium.launch({ channel: process.env.SMOKE_BROWSER || 'chrome' });
const problems = [];
// Not the site's fault: no icon file, no Firebase settings in a local preview, a video removed from YouTube.
const expectedMisses = /favicon\.ico|\/__\/firebase\/|ytimg\.com/;

async function open(path, locale) {
  const context = await browser.newContext({ locale });
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

await step('the page loads with its tabs, in English for an English browser', async () => {
  page = await open('/', 'en-US');
  firstTab = page.locator('nav a:not([href="#semana"]):not([href="#meu"]):not([href="#lesson"]):not([href="#method"])').first();
  await firstTab.waitFor();
  assert.equal(await page.getAttribute('html', 'lang'), 'en');
  assert.equal(await page.locator('#appTitle').textContent(), 'Guard System');
  assert.ok(await page.locator('nav a').count() > 4, 'tabs');
});

await step('a tab lists techniques and one opens', async () => {
  await firstTab.click();
  const chip = page.locator('main .tech').first();
  id = await chip.getAttribute('data-technique');
  await chip.click();
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
  assert.equal((await page.locator('nav .navcount').textContent()).trim(), '1');
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

await step('a lesson builder choice survives a reload', async () => {
  await page.locator('nav a[href="#lesson"]').click();
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
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#account').getAttribute('aria-expanded'), 'false');
  });

  await step('past weeks open on demand', async () => {
    const weekTab = page.locator('nav a[href="#semana"]');
    await weekTab.waitFor({ timeout: 10000 }).catch(() => {});
    if (!(await weekTab.count())) return;
    await weekTab.click();
    await page.locator('[data-past-weeks]').click();
    await page.locator('.past-weeks :is(h3, .note)').first().waitFor();
    assert.equal(await page.locator('.past-weeks .status').count(), 0);
  });
}

await step('the light/dark switch is reachable and changes the theme', async () => {
  const before = await page.getAttribute('html', 'data-theme');
  if (await page.locator('#account').isVisible()) await page.locator('#account').click();
  await page.locator('#theme').click();
  assert.notEqual(await page.getAttribute('html', 'data-theme'), before);
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

await step('a Portuguese browser gets Portuguese', async () => {
  const portuguese = await open('/', 'pt-BR');
  await portuguese.locator('nav a').first().waitFor();
  assert.equal(await portuguese.getAttribute('html', 'lang'), 'pt-BR');
  assert.equal(await portuguese.locator('#search').getAttribute('placeholder'), 'Buscar técnica');
  assert.equal(await portuguese.locator('#theme').getAttribute('title'), 'Modo claro');
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
