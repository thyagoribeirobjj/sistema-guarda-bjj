import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { belts, levelOf, upToBelt } from '../js/content.js';

const read = (name) => JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const content = read('content.json');
const curriculum = read('curriculum.json');
const modules = Object.entries({ ...content.modules, ...curriculum.modules });

const items = modules.flatMap(([key, module]) => module.stages.flatMap((stage) => stage.items.map((item) => ({ key, item }))));
const techniques = items.filter(({ item }) => !item.ref);
const games = modules.flatMap(([key, module]) => (module.games || []).map((item) => ({ key, item })));
const ids = new Set([...techniques, ...games].map(({ item }) => item.id));

test('every technique and game has an id like "top-standing-pass"', () => {
  for (const { key, item } of [...techniques, ...games]) {
    assert.match(item.id || '', new RegExp(`^${key}-[a-z0-9]+(-[a-z0-9]+)*$`), `missing or bad id: ${item.n?.en}`);
  }
});

test('ids are unique across both files', () => {
  assert.equal(ids.size, techniques.length + games.length);
});

test('shared techniques and "where to go" links point at techniques that exist', () => {
  for (const { item } of items.filter(({ item }) => item.ref)) assert.ok(ids.has(item.ref), `ref to missing ${item.ref}`);
  for (const [from, links] of Object.entries(curriculum.nx || {})) {
    assert.ok(ids.has(from), `links from missing ${from}`);
    for (const [to] of links) assert.ok(ids.has(to), `link from ${from} to missing ${to}`);
  }
});

test('the tab order lists every module', () => {
  for (const [key] of modules) assert.ok(curriculum.moduleOrder.includes(key), `${key} is not in moduleOrder`);
});

test('every technique has a name in Portuguese and English, and a level', () => {
  for (const { item } of techniques) {
    assert.ok(item.n?.pt && item.n?.en, `name: ${item.id}`);
    assert.ok(['b', 'a'].includes(item.lv), `level: ${item.id}`);
  }
});

test('every technique has a belt level: basic is white, advanced blue, unless an admin chose another', () => {
  for (const { item } of techniques) assert.ok(belts.includes(levelOf(item)), `belt level: ${item.id}`);
  assert.equal(levelOf({ lv: 'b' }), 'white');
  assert.equal(levelOf({ lv: 'a' }), 'blue');
  assert.equal(levelOf({ lv: 'b' }, 'purple'), 'purple');
  assert.equal(levelOf({ lv: 'a' }, 'red'), 'blue', 'an unknown level is ignored');
  assert.ok(techniques.some(({ item }) => levelOf(item) === 'white') && techniques.some(({ item }) => levelOf(item) === 'blue'));
});

test('"up to my belt" keeps my belt and the ones below it; no belt keeps everything', () => {
  assert.ok(upToBelt('white', 'white'));
  assert.ok(!upToBelt('blue', 'white'));
  assert.ok(upToBelt('blue', 'purple'));
  assert.ok(!upToBelt('black', 'brown'));
  assert.ok(upToBelt('black', ''));
});
