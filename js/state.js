// What the page is showing right now. app.js changes it, then calls render().
export const state = {
  view: '',
  search: '',
  week: null,
  // weekBefore: the class a prepared week replaced today, shown first among past weeks (js/week.js).
  weekBefore: null,
  pastWeeks: null,
  pastWeeksStatus: '',
  media: {},
  online: false,
  account: null,
  admin: false,
  treeOrder: 'tree',
  confirmEmptyTree: false,
  beltFilter: '',
  deleting: '', // "Delete my data" on the privacy page
  // list: the techniques the panel's previous and next move through.
  panel: { current: null, history: [], list: [] },
};

// Pages: #curriculum, #fund, #top… (the parts of the fight), #semana, #meu (my tree), #lesson, #method, #privacy. A technique: #t-<id>.
export function readHash() {
  const hash = location.hash.replace(/^#/, '');
  const technique = /^t-(.+)$/.exec(hash);
  return technique ? { technique: technique[1] } : { view: hash };
}
