// The kids' class in tests/smoke.mjs, signed out: "I train in", the Kids page, the navigation it hides, the kids' belts,
// a challenge opening its technique, Google Analytics staying off, and an adult's visit costing nothing more.
// tools: what smoke.mjs uses itself (open, openLate, step, hits, analyticsCookies, online, withAnalytics).
import assert from 'node:assert/strict';

const kidsSettings = JSON.stringify({ language: 'en', audience: 'kids' });
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

export async function kidsSteps({ open, openLate, step, hits, analyticsCookies, online, withAnalytics }) {
  await step('"Kids class" shows the worlds and hides the adult curriculum; a challenge opens its technique; "Adult class" brings it back', async () => {
    const visit = await open('/#curriculum', 'en-US');
    const kidsFile = [];
    visit.on('request', (request) => { if (request.url().includes('/data/kids.json')) kidsFile.push(request.url()); });
    await visit.locator('main .part-card').first().waitFor();
    assert.equal(await visit.locator('#sidebar a[href="#kids"]').count(), 0, 'no Kids page for the adult class');
    await visit.locator('#account').click();
    assert.equal(await visit.locator('[data-audience-choice="adult"]').getAttribute('aria-checked'), 'true', 'the adult class is the default');
    assert.equal(await visit.locator('#accountMenu [data-belt-choice]').count(), 5, 'the adult belts');
    assert.equal(kidsFile.length, 0, 'an adult never loads the kids\' challenges');
    await visit.locator('[data-audience-choice="kids"]').click();
    await visit.locator('main .world').first().waitFor();
    assert.equal(new URL(visit.url()).hash, '#kids');
    assert.equal(await visit.locator('main .world').count(), 8, 'eight worlds');
    assert.equal(await visit.locator('#accountMenu [data-belt-choice]').count(), 13, 'the kids\' belts');
    assert.equal(await visit.locator('#accountMenu [data-belt-choice="gray-white"]').getAttribute('aria-label'), 'Gray-white belt');
    assert.ok(await visit.locator('#accountMenu').isVisible(), 'the menu stays open');
    await visit.keyboard.press('Escape');
    for (const hidden of ['#curriculum', '#semana', '#top']) assert.equal(await visit.locator(`#sidebar a[href="${hidden}"]`).count(), 0, `no ${hidden} in the sidebar`);
    assert.equal(await visit.locator('#sidebar a[href="#kids"]').getAttribute('aria-current'), 'page');
    const first = visit.locator('main .world').first();
    assert.match(await first.textContent(), /Breakfall ninja/);
    assert.match(await visit.locator('main .world').nth(1).textContent(), /Do 2 challenges in the world before/, 'the second world opens later');
    assert.match(await visit.locator('main .world').last().textContent(), /Little coach[\s\S]*To do/, 'the last world is always open');
    assert.equal(await visit.locator('main [data-claim]').count(), 0, 'no "I did it" without signing in');
    const technique = first.locator('[data-technique]').first();
    const id = await technique.getAttribute('data-technique');
    await technique.click();
    await visit.locator(`#panel [data-favorite="${id}"]`).waitFor();
    assert.equal(new URL(visit.url()).hash, `#t-${id}`, 'the site\'s own technique sheet');
    await visit.locator('#panelClose').click();
    await visit.reload();
    await visit.locator('main .world').first().waitFor();
    assert.equal(await visit.locator('#sidebar a[href="#curriculum"]').count(), 0, 'the choice stays after a reload');
    await visit.locator('#account').click();
    await visit.locator('[data-belt-choice="yellow-black"]').click();
    await visit.locator('[data-audience-choice="adult"]').click();
    await visit.locator('main .part-card').first().waitFor();
    assert.equal(await visit.locator('#accountMenu [data-belt-choice]').count(), 5);
    assert.equal(await visit.evaluate(() => JSON.parse(localStorage.getItem('sg-settings')).belt), '', 'a kids\' belt is cleared for the adult class');
    assert.equal(await visit.locator('#sidebar a[href="#kids"]').count(), 0);
    await visit.locator('[data-audience-choice="both"]').click();
    await visit.locator('#sidebar a[href="#kids"]').waitFor();
    assert.equal(await visit.locator('#sidebar a[href="#curriculum"]').count(), 1, 'both: the curriculum and Kids');
    await visit.context().close();
  });

  await step('on a phone with "Kids class": the bottom bar has Kids, My tree and Search, and nothing runs sideways', async () => {
    const visit = await open('/', 'en-US', phone, (context) => context.addInitScript((kept) => localStorage.setItem('sg-settings', kept), kidsSettings));
    await visit.locator('main .world').first().waitFor();
    assert.equal(new URL(visit.url()).hash, '', 'the Kids page is the first page');
    assert.deepEqual((await visit.locator('#bottomBar .nav-label').allInnerTexts()).map((label) => label.trim()), ['Kids', 'My tree', 'Search']);
    assert.ok(await visit.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'nothing sideways');
    await visit.locator('main .world [data-technique]').first().tap();
    await visit.locator('#panelClose').tap();
    await visit.context().close();
  });

  await step('"Kids class": Google Analytics stays off and there is no cookie bar, even in a browser that accepted', async () => {
    const visit = await openLate('/#kids', 'en-US', {}, { ...withAnalytics, kept: { 'sg-cookies': 'accepted', 'sg-settings': kidsSettings } });
    await visit.release();
    await online(visit);
    await visit.locator('main .world [data-technique]').first().click();
    await visit.locator('#panelClose').click();
    await visit.waitForTimeout(800);
    assert.ok(await visit.locator('#cookieBar').isHidden(), 'no cookie bar');
    assert.equal(await visit.locator('#accountMenu #cookieChoice').count(), 0, 'no "Cookies" in the menu');
    assert.deepEqual(visit.analytics.map((request) => request.url), [], 'nothing goes to Google Analytics');
    assert.deepEqual(await analyticsCookies(visit), []);
    assert.equal(await visit.evaluate(() => localStorage.getItem('sg-cookies')), 'accepted', 'the cookie choice itself is kept');
    assert.match(await visit.locator('main').textContent(), /sign in with Google \(ask a grown-up\)/, 'signed out: how to tell the coach');
    assert.equal(await visit.locator('main [data-claim]').count(), 0, 'and no "I did it"');
    assert.ok(!visit.reads.some((path) => path.startsWith('approvals/')), 'nothing to read signed out');
  });

  await step('switching to "Kids class" stops the counting at once and deletes the cookies; back to "Adult class" counts again', async () => {
    const visit = await openLate('/#top', 'en-US', {}, { ...withAnalytics, kept: { 'sg-cookies': 'accepted' } });
    await visit.release();
    await online(visit);
    const until = async (check) => { for (let tries = 0; tries < 100 && !check(); tries++) await visit.waitForTimeout(100); assert.ok(check()); };
    await until(() => hits(visit).length > 0);
    assert.ok((await analyticsCookies(visit)).length, 'counted as an adult');
    assert.ok(!visit.reads.some((path) => path.startsWith('approvals/')), 'an adult\'s visit reads no answers');
    await visit.locator('#account').click();
    await visit.locator('[data-audience-choice="kids"]').click();
    await visit.locator('main .world').first().waitFor();
    assert.deepEqual(await analyticsCookies(visit), [], 'the _ga cookies are deleted');
    const sent = visit.analytics.length;
    await visit.keyboard.press('Escape');
    await visit.locator('main .world [data-technique]').first().click();
    await visit.locator('#panelClose').click();
    await visit.waitForTimeout(800);
    assert.equal(visit.analytics.length, sent, 'nothing more is sent');
    assert.ok(await visit.locator('#cookieBar').isHidden());
    await visit.locator('#account').click();
    await visit.locator('[data-audience-choice="adult"]').click();
    await visit.locator('main .part-card').first().waitFor();
    await until(() => visit.analytics.length > sent);
  });
}
