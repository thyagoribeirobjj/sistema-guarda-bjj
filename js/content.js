// The curriculum: data/content.json (guard modules, drills, method) plus data/curriculum.json
// (the other parts of the fight, their order, and the links between techniques).
export const content = { modules: {}, order: [], drill: null, method: null };

// The groups "where to go" is subdivided into, in the order the panel shows them.
export const whereGroups = ['trans', 'sub', 'pos', 'esc', 'def', 'train'];

const places = new Map();

// index.html preloads content.json and curriculum.json; this fetch takes that download over (a preload is matched by
// its address and mode, not by `cache`), so each is fetched once, still asked of the server on every visit.
async function loadJson(path) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

export async function loadContent() {
  const [guard, curriculum] = await Promise.all([loadJson('data/content.json'), loadJson('data/curriculum.json')]);
  const all = { ...guard.modules, ...curriculum.modules };
  const order = (curriculum.moduleOrder || []).filter((key) => all[key]);
  Object.keys(all).forEach((key) => { if (!order.includes(key)) order.push(key); });

  Object.assign(content, { modules: all, order, drill: guard.drill, method: guard.method });

  for (const key of order) {
    all[key].stages.forEach((stage, stageIndex) => stage.items.forEach((technique, index) => {
      if (!technique.ref) places.set(technique.id, { technique, moduleKey: key, stageIndex, index });
    }));
  }
  // A technique shown in two parts is written once and referenced elsewhere as { "ref": "<id>" }.
  for (const key of order) {
    for (const stage of all[key].stages) {
      stage.items = stage.items.map((item) => (item.ref ? places.get(item.ref)?.technique : item)).filter(Boolean);
    }
  }
  for (const [id, links] of Object.entries(curriculum.nx || {})) {
    const place = places.get(id);
    if (place) place.technique.links = links.filter(([target]) => places.has(target));
  }
  // What each move is for (the curriculum's "ty"): it subdivides "where to go" in the panel.
  for (const [id, type] of Object.entries(curriculum.ty || {})) {
    const place = places.get(id);
    if (place) place.technique.group = type === 'drill' || type === 'conc' ? 'train' : whereGroups.includes(type) ? type : 'pos';
  }
}

// The group a technique belongs to in "where to go"; one with none set controls the position.
export function groupOf(id) {
  return places.get(id)?.technique.group || 'pos';
}

export function findTechnique(id) {
  const place = places.get(id);
  if (!place) return null;
  const module = content.modules[place.moduleKey];
  return { ...place, module, stage: module.stages[place.stageIndex] };
}

// Belts in order. A technique has a minimum belt only where an admin set one (site/media, techniques.<id>.minBelt);
// without one it is for everyone.
export const belts = ['white', 'blue', 'purple', 'brown', 'black'];
// The kids' belts, in order, offered instead when someone trains in the kids class. White is in both.
export const kidsBelts = ['white', 'gray-white', 'gray', 'gray-black', 'yellow-white', 'yellow', 'yellow-black',
  'orange-white', 'orange', 'orange-black', 'green-white', 'green', 'green-black'];
// The site's themes: each one is a block of colors in css/theme.css.
export const themes = ['dark', 'light', 'orange', 'gold', 'royal', 'emerald'];
// The class someone trains in ("I train in"): 'adult' is the site as it always was.
export const audiences = ['kids', 'adult', 'both'];
// firestore.rules lists these four again (a person's settings); tests/rules-lists.mjs checks that they agree.

// The kids' worlds, challenges and levels (data/kids.json), read only by someone who trains in the kids class (or both).
export const kids = { worlds: [], challenges: [], levels: [], loaded: false };
let kidsLoading = null;

export function loadKids() {
  kidsLoading ||= loadJson('data/kids.json').then((file) => {
    Object.assign(kids, { worlds: file.worlds, challenges: file.challenges, levels: file.levels, loaded: true });
  }).catch((error) => {
    kidsLoading = null;
    throw error;
  });
  return kidsLoading;
}

// "Up to my belt": techniques with no minimum, and those whose minimum is my belt or below. No belt keeps everything.
export function upToBelt(minBelt, belt) {
  return !belts.includes(belt) || !belts.includes(minBelt) || belts.indexOf(minBelt) <= belts.indexOf(belt);
}

export function isModule(key) {
  return content.order.includes(key);
}

// "Triângulo" and "triangulo" both match.
export function plain(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// Built once per technique, the first time it is searched: its description, key point, drill and steps.
const otherText = new Map();

function textOf(technique) {
  if (!otherText.has(technique)) {
    const parts = [technique.d, technique.t, technique.dr].flatMap((value) => [value?.pt, value?.en]);
    (technique.s || []).forEach((pair) => parts.push(...pair));
    otherText.set(technique, plain(parts.filter(Boolean).join(' ')));
  }
  return otherText.get(technique);
}

// Techniques where every word typed is in the name (in either language) or in the rest of the text.
// Names with every word that start with the first word come first, then other name matches, then the rest.
// Each result is what findTechnique() returns, with byName: whether every word is in its name.
export function searchTechniques(query) {
  const words = plain(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const found = [];
  for (const [id, { technique }] of places) {
    const names = [plain(technique.n?.pt), plain(technique.n?.en)];
    const inName = (word) => names.some((name) => name.includes(word));
    if (!words.every((word) => inName(word) || textOf(technique).includes(word))) continue;
    let rank = 2;
    if (words.every(inName)) rank = names.some((name) => name.startsWith(words[0])) ? 0 : 1;
    found.push({ id, rank });
  }
  return found.sort((a, b) => a.rank - b.rank).map(({ id, rank }) => ({ ...findTechnique(id), byName: rank < 2 }));
}
