// The curriculum: data/content.json (guard modules, drills, method) plus data/curriculum.json
// (the other parts of the fight, their order, and the links between techniques).
export const content = { modules: {}, order: [], drill: null, method: null };

const places = new Map();

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
  // A technique shown in two tabs is written once and referenced elsewhere as { "ref": "<id>" }.
  for (const key of order) {
    for (const stage of all[key].stages) {
      stage.items = stage.items.map((item) => (item.ref ? places.get(item.ref)?.technique : item)).filter(Boolean);
    }
  }
  for (const [id, links] of Object.entries(curriculum.nx || {})) {
    const place = places.get(id);
    if (place) place.technique.links = links.filter(([target]) => places.has(target));
  }
}

export function findTechnique(id) {
  const place = places.get(id);
  if (!place) return null;
  const module = content.modules[place.moduleKey];
  return { ...place, module, stage: module.stages[place.stageIndex] };
}

export function isModule(key) {
  return content.order.includes(key);
}

// "Triângulo" and "triangulo" both match.
function plain(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// Techniques whose name (in either language) has every word typed; names that start with it come first.
// Each result is what findTechnique() returns.
export function searchTechniques(query) {
  const words = plain(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const found = [];
  for (const [id, { technique }] of places) {
    const names = [plain(technique.n?.pt), plain(technique.n?.en)];
    if (words.every((word) => names.some((name) => name.includes(word)))) {
      found.push({ id, starts: names.some((name) => name.startsWith(words[0])) });
    }
  }
  return found.sort((a, b) => b.starts - a.starts).map(({ id }) => findTechnique(id));
}
