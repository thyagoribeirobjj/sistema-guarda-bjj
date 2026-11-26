// The games on the TV in tests/smoke.mjs, signed out: the TV screen loads and shows a code (the same after a reload)
// and its square, fills a 16:9 screen without scrolling, asks nothing about cookies and counts nothing; the
// "Show on the TV" sheet links to it. tools: what smoke.mjs uses itself (open, step, routeAnalytics, measurementId).
import assert from 'node:assert/strict';

const television = { viewport: { width: 1920, height: 1080 } };
const screens = [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }];

// Inside a TV screen page: draws, in place of the TV's own screen, the game screen for each show and each of its
// steps (js/tv-screen-view.js, the TV's own CSS), with the sound button and with the "sound is blocked" note, and
// returns what is wrong: words covered by the sound line, cut off, or off the screen. Also the techniques block's
// fit: for each show, the size of type used and how many techniques gave way to "+N more".
async function drawScreens({ named, language }) {
  const { loadContent } = await import('/js/content.js');
  const { settings } = await import('/js/settings.js');
  const { buildShow } = await import('/js/tv-show.js');
  const { showSteps } = await import('/js/game-clock.js');
  const { gameScreen, fitList } = await import('/js/tv-screen-view.js');
  await loadContent();
  settings.language = language;
  const screen = document.createElement('div');
  screen.className = 'tvscreen';
  document.getElementById('tvScreen').replaceWith(screen);
  screen.id = 'tvScreen';
  const view = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  const clip = (rect, node) => {
    let box = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    for (let element = node.parentElement; element && element !== screen; element = element.parentElement) {
      if (getComputedStyle(element).overflow === 'visible') continue;
      const outer = element.getBoundingClientRect();
      box = { left: Math.max(box.left, outer.left), top: Math.max(box.top, outer.top), right: Math.min(box.right, outer.right), bottom: Math.min(box.bottom, outer.bottom) };
    }
    return box;
  };
  const meets = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const problems = [];
  const fits = [];
  for (const show of named) {
    const built = buildShow(show);
    const steps = showSteps(built);
    for (let step = 0; step <= steps.length; step++) {
      for (const sound of ['off', 'blocked']) {
        const position = { running: false, step, left: steps[step]?.seconds ?? 0, added: 0 };
        screen.innerHTML = String(gameScreen({ show: built, steps, position, sound }));
        fitList();
        const where = `${JSON.stringify(show).slice(0, 60)} step ${step} sound ${sound}`;
        const soundLine = screen.querySelector('.tvs-sound, .tvs-sound-note');
        const soundBox = soundLine.getBoundingClientRect();
        if (!meets(soundBox, view) || soundBox.bottom > innerHeight || soundBox.right > innerWidth) problems.push(`${where}: the sound line is off the screen`);
        const walker = document.createTreeWalker(screen.querySelector('.tvs'), NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (!node.textContent.trim() || soundLine.contains(node) || node.parentElement.closest('[hidden]')) continue;
          if (getComputedStyle(node.parentElement).display === 'none') continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const rect of range.getClientRects()) {
            if (!rect.width || !rect.height) continue;
            const seen = clip(rect, node);
            if (seen.right <= seen.left || seen.bottom <= seen.top) continue; // a line the box hides (the say text's last lines)
            if (meets(seen, soundBox)) problems.push(`${where}: the sound line covers "${node.textContent.trim().slice(0, 40)}"`);
            if (seen.bottom > innerHeight + 0.5 || seen.right > innerWidth + 0.5) problems.push(`${where}: "${node.textContent.trim().slice(0, 40)}" is off the screen`);
          }
        }
        const list = screen.querySelector('#tvsList');
        if (list && sound === 'off') {
          if (list.scrollHeight > list.clientHeight + 1 || list.scrollWidth > list.clientWidth + 1) problems.push(`${where}: the techniques are cut off`);
          const box = list.getBoundingClientRect();
          for (const item of list.querySelectorAll('li:not([hidden])')) {
            const own = item.getBoundingClientRect();
            if (own.bottom > box.bottom + 0.5 || own.right > box.right + 0.5) problems.push(`${where}: "${item.textContent.slice(0, 40)}" is cut off`);
          }
          const hidden = list.querySelectorAll('li[hidden]').length;
          const more = list.querySelector('.tvs-more')?.textContent || '';
          if (hidden && !more.startsWith(`+${hidden} `)) problems.push(`${where}: ${hidden} hidden but "${more}"`);
          fits.push({ count: built.blocks.find((block) => block.list)?.list.length, size: parseFloat(getComputedStyle(list).fontSize), unit: innerWidth / 100, columns: Number(list.style.getPropertyValue('--columns')), tips: list.dataset.tips, hidden });
        }
      }
    }
  }
  return { problems, fits };
}

const codeLetters = /^[2-9A-HJKMNP-Z]{5}$/;

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

  await step('a TV that kept an old 4-character code shows a new 5-character one by itself, and keeps that', async () => {
    const tv = await open('/?tv#screen', 'en-US', television, (context) => context.addInitScript(() => {
      if (!sessionStorage.getItem('reloaded')) localStorage.setItem('sg-tv-code', 'K7P4');
      sessionStorage.setItem('reloaded', 'yes');
    }));
    const code = tv.locator('.tvs-code');
    await code.waitFor();
    const shown = await code.textContent();
    assert.match(shown, codeLetters);
    assert.equal(await tv.evaluate(() => localStorage.getItem('sg-tv-code')), shown);
    await tv.reload();
    await code.waitFor();
    assert.equal(await code.textContent(), shown, 'the new code stays');
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

  await step('on the TV, the sound button and its note never cover the title, the clock or other words: every game, every step, both sizes and languages', async () => {
    for (const size of screens) {
      for (const [locale, language] of [['en-US', 'en'], ['pt-BR', 'pt']]) {
        const tv = await open('/?tv#screen', locale, { viewport: size });
        await tv.locator('.tvs-code').waitFor();
        const games = await tv.evaluate(async () => {
          const { content, loadContent } = await import('/js/content.js');
          await loadContent();
          return content.order.flatMap((key) => (content.modules[key].games || []).map((game) => game.id));
        });
        assert.equal(games.length, 13, 'all 13 games');
        const { problems } = await tv.evaluate(drawScreens, { named: games.map((game) => ({ game })), language });
        assert.deepEqual(problems.slice(0, 5), [], `${size.width}×${size.height} ${language}: ${problems.length} problem(s)`);
        await tv.context().close();
      }
    }
  });

  await step('on the TV, a lesson plan\'s techniques block shows every technique, as large as fits, at both sizes', async () => {
    for (const size of screens) {
      for (const [locale, language] of [['en-US', 'en'], ['pt-BR', 'pt']]) {
        const tv = await open('/?tv#screen', locale, { viewport: size });
        await tv.locator('.tvs-code').waitFor();
        const items = await tv.evaluate(async () => {
          const { content, loadContent } = await import('/js/content.js');
          await loadContent();
          // The part of the fight with the most techniques: a lesson can pick every one of them.
          const [mod] = content.order.map((key) => [key, content.modules[key].stages.flatMap((stage, si) => stage.items.map((_, ii) => `${si}-${ii}`))]).sort((a, b) => b[1].length - a[1].length);
          return { mod: mod[0], keys: mod[1] };
        });
        const lesson = (count) => ({ lesson: { mod: items.mod, dur: '60', items: Array.from({ length: count }, (_, i) => items.keys[i % items.keys.length]), game: '' } });
        const counts = [1, 3, 5, 8, 12, 20, 30, 45, items.keys.length, 200];
        const { problems, fits } = await tv.evaluate(drawScreens, { named: counts.map(lesson), language });
        assert.deepEqual(problems.slice(0, 5), [], `${size.width}×${size.height} ${language}: ${problems.length} problem(s)`);
        const shown = (count) => fits.find((fit) => fit.count === count);
        console.log(`      ${size.width}×${size.height} ${language}: ${fits.map((fit) => `${fit.count}→${fit.columns} col ${(fit.size / fit.unit).toFixed(2)}u${fit.tips === 'true' ? ' +tips' : ''}${fit.hidden ? ` (+${fit.hidden} more)` : ''}`).join(', ')}`);
        for (const count of counts.slice(0, -1)) assert.equal(shown(count).hidden, 0, `${count} techniques all shown`);
        assert.ok(shown(5).size >= 2.4 * shown(5).unit, 'a few techniques in large type');
        assert.ok(shown(items.keys.length).size >= 1.1 * shown(items.keys.length).unit, 'every technique of the largest part of the fight, never smaller than the smallest size (1.15 u)');
        assert.ok(shown(200).hidden > 0, 'past what fits, "+N more" (checked against the techniques hidden)');
        await tv.context().close();
      }
    }
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
