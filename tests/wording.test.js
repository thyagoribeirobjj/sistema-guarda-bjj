import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The site speaks to everyone who trains, so its words never assume a gender: "your partner", "they",
// "the person on top" in English; "a outra pessoa", "quem está por baixo", "a sua dupla", "quem dá a aula" in Portuguese.
const readText = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const dataFiles = ['data/content.json', 'data/curriculum.json', 'data/kids.json'];
const stringFiles = ['js/strings.js', 'js/strings-kids.js', 'js/strings-tv.js'];

const englishWords = /\b(he|him|his|she|her|hers|himself|herself|guys)\b/i;
const portugueseWords = new RegExp(`(?<![\\p{L}-])(${[
  'alunos?', 'alunas?', 'parceir[oa]s?', 'o oponente', 'os oponentes', 'seu oponente', 'do oponente', 'ao oponente',
  'adversári[oa]s?', 'agressor(es)?', 'ele', 'eles', 'dele', 'deles', 'nele', 'neles',
  'o professor', 'os professores', 'seus professores', 'do professor', 'ao professor', 'pelo professor', 'professor mirim',
  'o colega', 'os colegas', 'um colega', 'bem-vind[oa]s?', 'o de cima', 'o de baixo', 'ajoelhado', 'sentado', 'sozinho ou',
  'mestre', 'rei', 'guerreiro', 'toureiro', 'pai', 'mãe', 'um adulto', 'conectado como',
  'jogador(es)?', 'jogadoras?', 'guardi(ão|ã|ões|ãs)', 'todos(?! os)',
  // Adjectives that would describe the reader as a man: "fique parado", "ser levantado", "apoiado nas costas", "agarrado".
  'fique parad[oa]', 'ficar parad[oa]', 'ser levantad[oa]', 'apoiad[oa] nas costas', 'apoiad[oa] no próprio', 'agarrad[oa]s?',
].join('|')})(?![\\p{L}-])`, 'iu');

// Real exceptions: here "ele" is a thing, not a person.
const allowed = [
  'O relógio funciona sem ele', // the sound, on the TV
  'Ele usa cookies', // Google Analytics, in the cookie bar
  'Ele nunca recebe', // Google Analytics, on the privacy page
  'ele nem é carregado', // Google Analytics, on the privacy page
  'os cookies dele', // Google Analytics, on the privacy page
  'guardada nele', // the database, on the privacy page
  'nada nele segue você', // the site, on the privacy page
];
const withoutAllowed = (words) => allowed.reduce((rest, phrase) => rest.replaceAll(phrase, ''), words);

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
  const found = everyText.filter(({ en }) => englishWords.test(withoutAllowed(en)));
  assert.deepEqual(found.map(({ file, path, en }) => `${file} ${path.join('.')}: ${en}`), []);
});

test('Portuguese never needs a gendered word for a person (aluno, parceiro, adversário, ele, o professor…)', () => {
  const found = everyText.filter(({ pt }) => portugueseWords.test(withoutAllowed(pt)));
  assert.deepEqual(found.map(({ file, path, pt }) => `${file} ${path.join('.')}: ${pt}`), []);
});

// "A dupla" alone means the pair; when only one person waits or watches, the text names "a outra pessoa" or "a sua dupla".
const pairActsAlone = /(?<!sua )(?<![\p{L}])a dupla (só )?(espera|observa|aguarda|tenta)/iu;

test('Portuguese never says "a dupla" when only one of the two waits, watches or tries', () => {
  const found = everyText.filter(({ pt }) => pairActsAlone.test(pt));
  assert.deepEqual(found.map(({ file, path, pt }) => `${file} ${path.join('.')}: ${pt}`), []);
});

test('the name "their arms above your head" says whose arms they are, in Portuguese too', () => {
  const content = JSON.parse(readText('data/content.json'));
  const named = [...pairs(content)].find(({ path }) => path.at(-1) === 'n' && path.length > 1
    && path.slice(0, -1).reduce((item, key) => item[key], content).id === 'bottom-his-arms-above-your-head');
  assert.match(named.pt, /outra pessoa|sua dupla|quem está por cima/, named.pt);
});

test('the wording check catches the words it is meant to', () => {
  for (const words of ['Primeiro jogador · 3 movimentos', 'Guardião da postura', 'Nunca fique parado na tartaruga.',
    'para não ser levantado', 'Faça a ponte apoiado nas costas', 'Agarrado por trás', 'aparece para todos na hora']) {
    assert.match(words, portugueseWords, words);
  }
  assert.match('A dupla só observa.', pairActsAlone);
  assert.doesNotMatch('A sua dupla tenta escapar.', pairActsAlone);
  assert.doesNotMatch('Quadril parado no chão, com o cotovelo apoiado no seu joelho, todos os dias.', portugueseWords);
  for (const words of ['Segure o braço dele.', 'O aluno descobre.', 'Cumprimente o parceiro.', 'Peça ao professor.', 'Se ele defender']) {
    assert.match(words, portugueseWords, words);
  }
  for (const words of ['Grip his sleeve.', 'If he defends', 'Pull her in.']) assert.match(words, englishWords, words);
  for (const words of ['Segure o braço da outra pessoa.', 'Quem dá a aula confere.', 'Estudantes', 'Toque em Ensino', 'o reinado']) {
    assert.doesNotMatch(words, portugueseWords, words);
  }
  assert.doesNotMatch('Their hand stays on the mat.', englishWords);
});
