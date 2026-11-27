import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// In English the site says "their", "your partner" or "the person on top", never he or she, for whoever is training.
// Portuguese keeps its usual forms ("o professor", "o aluno", "ele"): the coach's call.
const readText = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const dataFiles = ['data/content.json', 'data/curriculum.json', 'data/kids.json'];
const stringFiles = ['js/strings.js', 'js/strings-kids.js', 'js/strings-tv.js'];
// Texts written in the code itself (the lesson plan's blocks), and the pages' own words and share-preview tags.
const inlineFiles = ['js/plan.js'];
const pageFiles = ['index.html', 'admin.html'];

const englishWords = /\b(he|him|his|she|her|hers|himself|herself|guys)\b/i;

function* pairs(value, path = []) {
  if (Array.isArray(value)) {
    if (path.at(-2) === 's' && value.length === 2 && value.every((part) => typeof part === 'string')) {
      yield { path, pt: value[0], en: value[1] };
      return;
    }
    for (const [index, item] of value.entries()) yield* pairs(item, [...path, index]);
  } else if (value && typeof value === 'object') {
    if (typeof value.pt === 'string' && typeof value.en === 'string') yield { path, pt: value.pt, en: value.en };
    for (const [key, item] of Object.entries(value)) if (key !== 'pt' && key !== 'en') yield* pairs(item, [...path, key]);
  }
}

function* stringPairs(source) {
  const literal = `('(?:[^'\\\\]|\\\\.)*'|"(?:[^"\\\\]|\\\\.)*")`;
  const label = new RegExp(`^\\s*(\\w+): \\{ pt: ${literal}, en: ${literal} \\}`, 'gm');
  for (const [, key, pt, en] of source.matchAll(label)) yield { path: [key], pt: pt.slice(1, -1), en: en.slice(1, -1) };
}

// { pt: '…', en: '…' } written inline, the English in quotes or a template.
function* inlinePairs(source) {
  const literal = '(\'(?:[^\'\\\\]|\\\\.)*\'|"(?:[^"\\\\]|\\\\.)*"|`(?:[^`\\\\]|\\\\.)*`)';
  const pair = new RegExp(`\\{ pt: ${literal}, en: ${literal} \\}`, 'g');
  for (const [, pt, en] of source.matchAll(pair)) yield { path: [pt.slice(1, 30)], pt: pt.slice(1, -1), en: en.slice(1, -1) };
}

// What a page shows or says about itself: its text, and the words in alt, aria-label, placeholder and title, and in
// the description and share-preview tags. Every page's own words are checked as English.
function* pageTexts(source) {
  const markup = source.replace(/<(script|style)\b[\s\S]*?<\/\1>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  for (const [, words] of markup.matchAll(/>([^<]+)</g)) if (words.trim()) yield { path: ['text'], pt: '', en: words.trim() };
  for (const [, name, words] of markup.matchAll(/\b(alt|aria-label|placeholder|title)="([^"]*)"/g)) if (words.trim()) yield { path: [name], pt: '', en: words };
  for (const [, name, words] of markup.matchAll(/<meta (?:name|property)="((?:description|og:|twitter:)[^"]*)" content="([^"]*)"/g)) yield { path: [name], pt: '', en: words };
}

const everyText = [
  ...dataFiles.flatMap((file) => [...pairs(JSON.parse(readText(file)))].map((pair) => ({ file, ...pair }))),
  ...stringFiles.flatMap((file) => [...stringPairs(readText(file))].map((pair) => ({ file, ...pair }))),
  ...inlineFiles.flatMap((file) => [...inlinePairs(readText(file))].map((pair) => ({ file, ...pair }))),
  ...pageFiles.flatMap((file) => [...pageTexts(readText(file))].map((pair) => ({ file, ...pair }))),
];

test('the wording check reads every label and every curriculum text', () => {
  const labels = everyText.filter(({ file }) => file.startsWith('js/'));
  assert.ok(labels.length > 250, `only ${labels.length} labels found in the strings modules`);
  assert.ok(everyText.length > 1500, `only ${everyText.length} texts found`);
  const planTexts = everyText.filter(({ file }) => file === 'js/plan.js').map(({ en }) => en);
  for (const words of ['Warm-up', 'Hip escapes, bridges, breakfalls (ukemi) and technical stand-up.', 'Game: ${game ? text(game.n) : \'\'}', 'BJJ chess or live']) {
    assert.ok(planTexts.includes(words), `the lesson plan's "${words}" is read`);
  }
  for (const file of pageFiles) {
    const found = everyText.filter((each) => each.file === file);
    assert.ok(found.some(({ path }) => path[0] === 'text'), `${file}: its text is read`);
    assert.ok(found.some(({ path }) => path[0] === 'description'), `${file}: its description is read`);
  }
  assert.ok(everyText.some(({ file, path }) => file === 'index.html' && path[0] === 'og:description'), 'and the share preview');
});

test('the wording check reads text written inline and the pages\' own words', () => {
  assert.deepEqual([...inlinePairs("x = { pt: 'Puxe a manga.', en: `Grip his ${'sleeve'}.` };")].map(({ en }) => en), ["Grip his ${'sleeve'}."]);
  const page = '<title>Hold her</title><script>const he = 1;</script><img alt="his grip"><meta property="og:description" content="If she defends">';
  assert.deepEqual([...pageTexts(page)].map(({ en }) => en), ['Hold her', 'his grip', 'If she defends']);
});

test('English never says he, him, his, she or her about a person', () => {
  const found = everyText.filter(({ en }) => englishWords.test(en));
  assert.deepEqual(found.map(({ file, path, en }) => `${file} ${path.join('.')}: ${en}`), []);
});

test('the wording check catches the words it is meant to', () => {
  for (const words of ['Grip his sleeve.', 'If he defends', 'Pull her in.']) assert.match(words, englishWords, words);
  assert.doesNotMatch('Their hand stays on the mat.', englishWords);
});
