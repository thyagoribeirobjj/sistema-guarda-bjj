import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { upToBelt } from '../js/content.js';
import { gameProblems, clockGame, gameLength } from '../js/game-clock.js';

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

test('"where to go" groups name techniques that exist, with a known kind of move', () => {
  const kinds = ['trans', 'sub', 'pos', 'esc', 'def', 'drill', 'conc'];
  for (const [id, kind] of Object.entries(curriculum.ty || {})) {
    assert.ok(ids.has(id), `group for missing ${id}`);
    assert.ok(kinds.includes(kind), `unknown group ${kind} for ${id}`);
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

test('"up to my belt" keeps techniques with no minimum and those at my belt or below; no belt keeps everything', () => {
  assert.ok(upToBelt('', 'white'), 'no minimum belt: for everyone');
  assert.ok(upToBelt(undefined, 'white'));
  assert.ok(upToBelt('red', 'white'), 'an unknown minimum is ignored');
  assert.ok(upToBelt('white', 'white'));
  assert.ok(!upToBelt('blue', 'white'));
  assert.ok(upToBelt('blue', 'purple'));
  assert.ok(!upToBelt('black', 'brown'));
  assert.ok(upToBelt('black', ''));
});

// ---- the kids' class (data/kids.json) ----
const kids = read('kids.json');
const bothLanguages = (value) => Boolean(value?.pt && value?.en);

test('kids: every world and challenge has a unique id and a name in Portuguese and English', () => {
  const worldIds = kids.worlds.map((world) => world.id);
  const challengeIds = kids.challenges.map((challenge) => challenge.id);
  assert.equal(new Set(worldIds).size, worldIds.length, 'world ids are unique');
  assert.equal(new Set(challengeIds).size, challengeIds.length, 'challenge ids are unique');
  for (const world of kids.worlds) {
    assert.match(world.id, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(bothLanguages(world.n) && bothLanguages(world.d), `world ${world.id}`);
    assert.ok(world.mark, `world ${world.id} has its mark`);
  }
  for (const challenge of kids.challenges) {
    assert.match(challenge.id, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(bothLanguages(challenge.n) && bothLanguages(challenge.task), `challenge ${challenge.id}`);
    assert.ok(worldIds.includes(challenge.world), `challenge ${challenge.id} is in a world that exists`);
    assert.ok(Number.isInteger(challenge.xp) && challenge.xp > 0, `challenge ${challenge.id} gives XP`);
  }
});

test('kids: every challenge points at techniques that exist in the site\'s curriculum', () => {
  for (const challenge of kids.challenges) {
    assert.ok(Array.isArray(challenge.techniques), challenge.id);
    for (const id of challenge.techniques) assert.ok(ids.has(id), `${challenge.id} points at missing ${id}`);
  }
});

test('kids: the whole catalog is there, every world has challenges, the last world is always open', () => {
  assert.equal(kids.worlds.length, 8);
  assert.equal(kids.challenges.length, 25);
  for (const world of kids.worlds) assert.ok(kids.challenges.some((challenge) => challenge.world === world.id), `${world.id} has challenges`);
  assert.equal(kids.worlds.at(-1).alwaysOpen, true);
  assert.equal(kids.worlds.filter((world) => world.alwaysOpen).length, 1);
});

test('kids: levels start at 0 XP and go up, each named in both languages', () => {
  assert.equal(kids.levels[0].xp, 0);
  kids.levels.forEach((level, i) => {
    assert.ok(bothLanguages(level.n));
    if (i) assert.ok(level.xp > kids.levels[i - 1].xp);
  });
});

test('kids: no challenge asks for a video, an upload or something written', () => {
  for (const challenge of kids.challenges) assert.doesNotMatch(challenge.task.en, /video|record|write|upload|send/i, challenge.id);
});

test('every game has the timing the TV clock runs: parts, rounds, rest, get ready, switching roles', () => {
  assert.equal(games.length, 13);
  for (const { item } of games) {
    assert.deepEqual(gameProblems(clockGame(item)), [], item.id);
    assert.ok(gameLength(item) <= 30 * 60, `${item.id} runs more than half an hour`);
    for (const name of ['start', 'top', 'bottom']) assert.ok(item[name].pt && item[name].en, `${item.id}: ${name} in both languages`);
    for (const part of item.parts) assert.ok(part.label.pt && part.label.en && part.say.pt && part.say.en, `${item.id}: a part in both languages`);
  }
});
