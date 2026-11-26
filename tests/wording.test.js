import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// In English the site says "their", "your partner" or "the person on top", never he or she, for whoever is training.
// Portuguese keeps its usual forms ("o professor", "o aluno", "ele"): the coach's call.
const readText = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const dataFiles = ['data/content.json', 'data/curriculum.json', 'data/kids.json'];
const stringFiles = ['js/strings.js', 'js/strings-kids.js', 'js/strings-tv.js'];

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

const everyText = [
  ...dataFiles.flatMap((file) => [...pairs(JSON.parse(readText(file)))].map((pair) => ({ file, ...pair }))),
  ...stringFiles.flatMap((file) => [...stringPairs(readText(file))].map((pair) => ({ file, ...pair }))),
];

test('the wording check reads every label and every curriculum text', () => {
  const labels = everyText.filter(({ file }) => file.startsWith('js/'));
  assert.ok(labels.length > 250, `only ${labels.length} labels found in the strings modules`);
  assert.ok(everyText.length > 1500, `only ${everyText.length} texts found`);
});

test('English never says he, him, his, she or her about a person', () => {
  const found = everyText.filter(({ en }) => englishWords.test(en));
  assert.deepEqual(found.map(({ file, path, en }) => `${file} ${path.join('.')}: ${en}`), []);
});

test('the wording check catches the words it is meant to', () => {
  for (const words of ['Grip his sleeve.', 'If he defends', 'Pull her in.']) assert.match(words, englishWords, words);
  assert.doesNotMatch('Their hand stays on the mat.', englishWords);
});
