import { test } from 'node:test';
import assert from 'node:assert/strict';
import { html } from '../js/html.js';

test('values are escaped, and html`` results are not', () => {
  assert.equal(String(html`<b>${'<i>&"'}</b>`), '<b>&lt;i&gt;&amp;&quot;</b>');
  assert.equal(String(html`<p>${html`<i>x</i>`}</p>`), '<p><i>x</i></p>');
});

test('false shows nothing as content, but "false" as a whole attribute value', () => {
  assert.equal(String(html`<p>${false}${null}</p>`), '<p></p>');
  assert.equal(String(html`<button aria-pressed="${false}" aria-checked="${true}">`), '<button aria-pressed="false" aria-checked="true">');
  assert.equal(String(html`<i class="a ${false}">`), '<i class="a ">', 'part of a value');
});
