// What the page is showing right now. app.js changes it, then calls render().
export const state = {
  view: '',
  search: '',
  week: null,
  pastWeeks: null,
  pastWeeksStatus: '',
  media: {},
  online: false,
  account: null,
  admin: false,
  treeOrder: 'tree',
  confirmEmptyTree: false,
  beltFilter: '',
  // list: the techniques the panel's previous and next move through.
  panel: { current: null, history: [], list: [] },
};

// Pages: #curriculum, #fund, #top… (the parts of the fight), #semana, #meu (my tree), #lesson, #method. A technique: #t-<id>.
export function readHash() {
  const hash = location.hash.replace(/^#/, '');
  const technique = /^t-(.+)$/.exec(hash);
  return technique ? { technique: technique[1] } : { view: hash };
}
