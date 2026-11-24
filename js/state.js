// What the page is showing right now. app.js changes it, then calls render().
export const state = {
  view: '',
  search: '',
  week: null,
  media: {},
  online: false,
  account: null,
  admin: false,
  treeOrder: 'tree',
  confirmEmptyTree: false,
  panel: { current: null, history: [] },
};

// Tabs: #fund, #top… (modules), #semana, #meu (my tree), #lesson, #method. A technique: #t-<id>.
export function readHash() {
  const hash = location.hash.replace(/^#/, '');
  const technique = /^t-(.+)$/.exec(hash);
  return technique ? { technique: technique[1] } : { view: hash };
}
