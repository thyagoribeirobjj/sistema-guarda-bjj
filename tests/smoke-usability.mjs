// Signed out in tests/smoke.mjs: what a student meets on a part, in search and in a technique's sheet. No stray number
// on a technique, ★ and G with names, "1 technique", name matches first in search, the sheet's top row in reach at
// its end, notes after the drill, the keyboard focus back on the technique once the sheet closes, and "Clear this
// browser" asking above the phone's bottom bar. tools: what smoke.mjs uses itself (open, step).
import assert from 'node:assert/strict';

const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const inBox = (inner, outer) => inner && outer && inner.y >= outer.y - 1 && inner.y + inner.height <= outer.y + outer.height + 1;

export async function usabilitySteps({ open, step }) {
  await step('a part\'s techniques show their names and marks only: no list number, and ★ and G say what they are', async () => {
    const visit = await open('/#top', 'en-US');
    await visit.locator('main .spine .tech').first().waitFor();
    assert.equal(await visit.locator('main .spine .tech .rel').count(), 0, 'no word or number after a name');
    const names = await visit.locator('main .spine .tech').evaluateAll((chips) => chips.map((chip) => chip.textContent.trim()));
    assert.deepEqual(names.filter((name) => /\s\d+$/.test(name)), [], 'no chip ends in a number');
    assert.equal(await visit.locator('main .spine .tech .mine').first().getAttribute('aria-label'), 'Your system');
    assert.equal(await visit.locator('main .spine .tech .gtag').first().getAttribute('aria-label'), 'From the Gracie Jiu-Jitsu book');
    // "Where to go" keeps its word after each technique.
    await visit.locator('main [data-technique="top-standing-pass"]').first().click();
    await visit.locator('#panel .next .rel').first().waitFor();
    await visit.context().close();
  });

  await step('"1 technique", not "1 techniques", in My tree', async () => {
    const visit = await open('/#meu', 'en-US', {}, (context) => context.addInitScript(() => localStorage.setItem('sg-settings', JSON.stringify({ language: 'en', favorites: ['top-base'] }))));
    await visit.locator('main .spine .goal').first().waitFor();
    assert.equal((await visit.locator('main .spine .goal').first().textContent()).trim(), '1 technique');
    await visit.context().close();
  });

  await step('search lists the techniques whose name matches first, before those that only mention the word', async () => {
    const visit = await open('/#top', 'en-US');
    await visit.locator('main .spine').waitFor();
    await visit.fill('#search', 'arm');
    await visit.locator('main .results [data-technique]').first().waitFor();
    assert.equal((await visit.locator('main .results .sect-title').first().textContent()).trim(), 'In the name');
    const first = (await visit.locator('main .results [data-technique]').first().textContent()).trim();
    assert.match(first, /arm/i, `the first result has "arm" in its name (${first})`);
    await visit.fill('#search', 'triangulo');
    await visit.locator('main [data-search-names]').waitFor();
    await visit.context().close();
  });

  await step('on a phone: at the end of a long technique, back, previous / next and close are still in reach; notes come after the drill', async () => {
    const visit = await open('/#top', 'en-US', phone);
    await visit.locator('main .tech').nth(1).tap();
    await visit.locator('#panel [data-step="1"]').waitFor();
    const order = await visit.locator('#panel h5').evaluateAll((headings) => headings.map((heading) => heading.textContent.trim()));
    assert.ok(order.indexOf('My notes') > order.indexOf('How to drill') && order.indexOf('How to drill') > order.indexOf('What it is'), `the order: ${order.join(', ')}`);
    assert.ok(await visit.evaluate(() => {
      const panel = document.getElementById('panel');
      return panel.scrollHeight > panel.clientHeight * 1.5;
    }), 'a sheet longer than the screen');
    await visit.evaluate(() => { const panel = document.getElementById('panel'); panel.scrollTop = panel.scrollHeight; });
    await visit.waitForFunction(() => { const panel = document.getElementById('panel'); return panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 1; });
    const sheet = await visit.locator('#panel').boundingBox();
    for (const control of ['#panelClose', '#panel [data-step="1"]', '#panel [data-step="-1"]']) {
      const box = await visit.locator(control).boundingBox();
      assert.ok(inBox(box, sheet), `${control} is on screen at the end (${JSON.stringify(box)} in ${JSON.stringify(sheet)})`);
      assert.ok(await visit.locator(control).evaluate((button) => {
        const { x, y, width, height } = button.getBoundingClientRect();
        return button.contains(document.elementFromPoint(x + width / 2, y + height / 2));
      }), `${control} is not covered`);
    }
    await visit.locator('#panel [data-step="1"]').tap();
    assert.match(await visit.locator('#panel .step-count').textContent(), /^3 \//, 'and they work there');
    await visit.context().close();
  });

  await step('closing a technique with Escape or × puts the keyboard focus back on it in the page', async () => {
    const visit = await open('/#top', 'en-US');
    const chip = visit.locator('main .spine .tech').nth(3);
    const id = await chip.getAttribute('data-technique');
    await chip.click();
    await visit.locator(`#panel [data-favorite="${id}"]`).waitFor();
    await visit.keyboard.press('Escape');
    await visit.locator('#panel').waitFor({ state: 'hidden' });
    assert.equal(await visit.evaluate(() => document.activeElement?.dataset?.technique), id, 'Escape');
    await visit.keyboard.press('Enter');
    await visit.locator(`#panel [data-favorite="${id}"]`).waitFor();
    await visit.locator('#panel [data-step="1"]').click();
    const next = await visit.locator('#panel [data-favorite]').getAttribute('data-favorite');
    await visit.locator('#panelClose').click();
    await visit.locator('#panel').waitFor({ state: 'hidden' });
    assert.equal(await visit.evaluate(() => document.activeElement?.dataset?.technique), next, '× after moving to the next one');
    await visit.context().close();
  });

  await step('on a phone: "Clear this browser" asks where it can be read, above the bottom bar', async () => {
    const visit = await open('/#privacy', 'en-US', phone);
    await visit.locator('[data-delete-data="ask"]').tap();
    await visit.locator('.privacy .confirm').waitFor();
    const [confirm, bar] = [await visit.locator('.privacy .confirm').boundingBox(), await visit.locator('#bottomBar').boundingBox()];
    assert.ok(confirm.y >= 0 && confirm.y + confirm.height <= bar.y, `the question (${confirm.y}–${confirm.y + confirm.height}) is above the bar (${bar.y})`);
    await visit.locator('[data-delete-data="no"]').tap();
    await visit.context().close();
  });
}
