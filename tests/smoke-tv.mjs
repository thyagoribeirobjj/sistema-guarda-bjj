// The games on the TV in tests/smoke.mjs, signed out: the TV screen loads and shows a code (the same after a reload)
// and its square, fills a 16:9 screen without scrolling, asks nothing about cookies and counts nothing; the
// "Show on the TV" sheet links to it. tools: what smoke.mjs uses itself (open, step, routeAnalytics, measurementId).
import assert from 'node:assert/strict';

const television = { viewport: { width: 1920, height: 1080 } };
const codeLetters = /^[2-9A-HJKMNP-Z]{4}$/;

export async function tvSteps({ open, step, routeAnalytics, measurementId }) {
  await step('the TV screen loads signed out and shows a code, the same after a reload, filling the screen', async () => {
    const tv = await open('/?tv#screen', 'en-US', television);
    const code = tv.locator('.tvs-code');
    await code.waitFor();
    const shown = await code.textContent();
    assert.match(shown, codeLetters);
    assert.ok(await tv.locator('svg.tvs-qr path').count(), 'the pairing square');
    assert.match(await tv.locator('.tvs-how').textContent(), /Run on the TV/);
    assert.equal(await tv.locator('#sidebar').isVisible(), false, 'none of the site around it');
    const fits = await tv.evaluate(() => [document.documentElement.scrollHeight <= innerHeight, document.documentElement.scrollWidth <= innerWidth]);
    assert.deepEqual(fits, [true, true], 'no scrolling');
    const box = await code.boundingBox();
    assert.ok(box.height > 150 && box.y + box.height <= 1080, `readable from across the room (${Math.round(box.height)}px tall)`);
    await tv.reload();
    await code.waitFor();
    assert.equal(await code.textContent(), shown, 'the TV keeps its code');
    await tv.context().close();
  });

  await step('the TV screen asks nothing about cookies and counts nothing, even in a browser that accepted', async () => {
    const analytics = [];
    const tv = await open('/?tv#screen', 'en-US', television, async (context) => {
      await context.addInitScript(() => localStorage.setItem('sg-cookies', 'accepted'));
      await context.route('**/__/firebase/init.json', (route) => route.fulfill({ json: { apiKey: 'made-up', projectId: 'demo-tv', appId: '1:1:web:1', measurementId } }));
      await routeAnalytics(context, analytics, measurementId);
      // The TV listens for a coach; here the database never answers (the step is over long before the TV would
      // give up waiting and say so).
      await context.route(/firestore\.googleapis\.com/, () => {});
    });
    await tv.locator('.tvs-code').waitFor();
    const loaded = () => tv.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name.split('/').pop()));
    await tv.waitForFunction(() => performance.getEntriesByType('resource').some((entry) => entry.name.endsWith('/firebase-firestore.js')));
    await tv.waitForTimeout(1500);
    const files = await loaded();
    assert.ok(!files.includes('firebase-firestore-lite.js') && !files.includes('firebase-auth.js'), 'the TV loads the live database code only, and no sign-in');
    assert.equal(await tv.locator('#cookieBar').isVisible(), false);
    assert.deepEqual(analytics.map((request) => request.url), []);
    assert.deepEqual((await tv.context().cookies()).filter((cookie) => cookie.name.startsWith('_ga')), []);
    await tv.context().close();
  });

  await step('the "Show on the TV" sheet links to the TV screen', async () => {
    const visit = await open('/#top', 'en-US');
    await visit.locator('main [data-technique]').first().click();
    await visit.locator('#panel [data-tv]').click();
    const link = visit.locator('#tvSheet a[data-tv-screen]');
    assert.equal(await link.getAttribute('href'), '/?tv#screen');
    assert.match(await visit.locator('#tvSheet').textContent(), /\/\?tv#screen/);
    await link.click();
    await visit.locator('.tvs-code').waitFor();
    assert.match(await visit.locator('.tvs-code').textContent(), codeLetters);
    await visit.context().close();
  });
}
