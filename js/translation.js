// What to do with each translated field when the admin saves the week. No page, no database: tests/translation.test.js.
//   saved:     the week as last saved ({ title: { pt, en }, note: { pt, en } })
//   draft:     the week as it is in the form now
//   from, to:  the language the admin writes in, and the other one
//   handFixed: the fields whose translation the admin corrected by hand
// A translation in the draft that differs from the saved one was typed by the admin: in the translation editor,
// or as the original before switching the writing language.
// Each field gets one of:
//   'clear'      the admin emptied the original (or both are empty), so no translation either
//   'keepEdited' keep the translation the admin just typed
//   'keep'       nothing changed (or only the other language has text), keep the translation
//   'translate'  translate the original again
//   'ask'        the original changed, but its translation was corrected by hand: ask before replacing it
export const translatedFields = ['title', 'note'];

export function translationPlan({ saved = {}, draft, from, to, handFixed = [] }) {
  const plan = {};
  for (const name of translatedFields) {
    const source = draft[name]?.[from] || '';
    const translation = draft[name]?.[to] || '';
    const savedTranslation = saved[name]?.[to] || '';
    const savedSource = saved[name]?.[from] || '';
    const typedTranslation = translation && translation !== savedTranslation;
    if (!source && (savedSource || !translation)) plan[name] = 'clear';
    else if (typedTranslation) plan[name] = 'keepEdited';
    else if (!source || (source === savedSource && translation)) plan[name] = 'keep';
    else if (handFixed.includes(name) && translation) plan[name] = 'ask';
    else plan[name] = 'translate';
  }
  return plan;
}

// Turn each 'ask' into the admin's answer: 'translate' or 'keep'.
export function answerPlan(plan, answer) {
  return Object.fromEntries(Object.entries(plan).map(([name, step]) => [name, step === 'ask' ? answer : step]));
}

// The fields still corrected by hand once the plan (with no 'ask' left) is carried out.
export function handFixedAfter(plan, handFixed = []) {
  return translatedFields.filter((name) => plan[name] === 'keepEdited' || (plan[name] === 'keep' && handFixed.includes(name)));
}

// ---- which language each field was written in ----
// written: { title: 'pt', note: 'en' } in site/week. Each field remembers the language its original text was typed
// in, since the admin can write one week in two languages over several saves.

// Weeks saved before `written` existed: the language they were saved from, unless that field was empty there
// (then its text was kept from the other language, where someone typed it).
export function writtenIn(saved = {}, name) {
  if (saved.written?.[name]) return saved.written[name];
  const from = saved.from || 'pt';
  const other = from === 'pt' ? 'en' : 'pt';
  return saved[name]?.[from] || !saved[name]?.[other] ? from : other;
}

// After a save: an original typed or changed now was written in `from`; one left as it was keeps its language;
// a field with text in the other language only was written in that one.
export function writtenAfter({ saved = {}, draft, from, to }) {
  const written = {};
  for (const name of translatedFields) {
    const source = draft[name]?.[from] || '';
    const translation = draft[name]?.[to] || '';
    if (!source) {
      if (translation) written[name] = to;
    } else {
      written[name] = source === (saved[name]?.[from] || '') && translation ? writtenIn(saved, name) : from;
    }
  }
  return written;
}

// The quiet word beside a translation on the admin page: '' when that text is an original someone typed,
// 'translatedAutomatically', or 'yourCorrection'. Nothing is claimed for text whose history isn't known.
export function translationLabel(saved = {}, name, translation, other) {
  const unchanged = translation === (saved[name]?.[other] || '');
  if (!unchanged) return 'yourCorrection';
  if (!saved.from || writtenIn(saved, name) === other) return '';
  return saved.handFixed?.includes(name) ? 'yourCorrection' : 'translatedAutomatically';
}
