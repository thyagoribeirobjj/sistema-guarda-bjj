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
