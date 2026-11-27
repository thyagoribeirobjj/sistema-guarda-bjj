// The coach's tools in tests/signed-in.mjs, against the emulators: a minimum belt saved from a technique's sheet says
// so where the coach is, and the week form's "Chosen" row, its refusal of a week with no techniques and the next-week
// form's own words. tools: what signed-in.mjs uses itself; coach: the coach's page, signed in.
import assert from 'node:assert/strict';

export async function coachSteps({ coach, step, stored, until, today }) {
  await step('a minimum belt saved from the bottom of a technique\'s sheet says "Saved" right there, without jumping to the top', async () => {
    const id = 'top-recover-posture';
    await coach.open('', `#t-${id}`);
    await coach.locator('#minBeltChoice').waitFor();
    await coach.locator('#minBeltChoice').scrollIntoViewIfNeeded();
    await coach.locator('#minBeltChoice').selectOption('blue');
    await coach.locator('#mediaStatus', { hasText: 'Saved' }).waitFor();
    await until(async () => (await stored('site/media'))?.techniques?.[id]?.minBelt === 'blue', 'the belt is saved');
    const [line, sheet] = [await coach.locator('#mediaStatus').boundingBox(), await coach.locator('#panel').boundingBox()];
    assert.ok(line.y >= sheet.y && line.y + line.height <= sheet.y + sheet.height, `"Saved" is on screen (${line.y} in ${sheet.y}–${sheet.y + sheet.height})`);
    assert.ok(await coach.evaluate(() => document.getElementById('panel').scrollTop > 0), 'the sheet stayed down where the coach was');
    await coach.locator('#minBeltChoice').selectOption('');
    await until(async () => !(await stored('site/media'))?.techniques?.[id]?.minBelt, 'and taken off again');
  });

  await step('the week form shows the ticked techniques above the list, unticks them from there, and refuses a week with none', async () => {
    await coach.open('admin.html');
    await coach.locator('#weekForm').waitFor();
    await coach.locator('[data-form="week"]').click();
    const saved = await stored('site/week');
    const chosen = () => coach.locator('#chosen [data-unpick]').evaluateAll((chips) => chips.map((chip) => chip.dataset.unpick));
    assert.deepEqual(await chosen(), saved.techniques, 'the saved week\'s techniques');
    await coach.locator('#picks input[value="top-base"]').check();
    assert.ok((await chosen()).includes('top-base'), 'a tick shows at once');
    for (const id of await chosen()) await coach.locator(`#chosen [data-unpick="${id}"]`).click();
    assert.equal(await coach.locator('#picks input:checked').count(), 0, 'the ✕ unticks it in the list');
    assert.match(await coach.locator('#chosen').innerText(), /No techniques picked yet/);
    assert.ok(await coach.evaluate(() => document.activeElement?.matches('#picks input')), 'the focus goes to the list');
    await coach.locator('#weekForm [type="submit"]').click();
    await coach.locator('#status', { hasText: 'Pick at least one technique' }).waitFor();
    assert.deepEqual((await stored('site/week')).techniques, saved.techniques, 'nothing saved');
    assert.equal((await stored('site/week')).weekOf, today);
  });

  await step('the next-week form says when it shows, not that it is on the site now', async () => {
    await coach.open('admin.html');
    await coach.locator('#weekForm').waitFor();
    await coach.locator('[data-form="next"]').click();
    assert.match(await coach.locator('main .sect-sub').first().innerText(), /from its start date/);
    assert.match(await coach.locator('label[for="title"]').innerText(), /Next week's class/i);
    assert.match(await coach.locator('#picksLabel').innerText(), /Next week's techniques/i);
    await coach.locator('[data-form="week"]').click();
    assert.match(await coach.locator('label[for="title"]').innerText(), /This week's class/i);
  });
}
