// Restart, End and Show on the coach's phone (js/remote.js) replace a game under way: while one is, they ask first
// (the row js/remote-view.js draws from asked()) and act only on "yes". Otherwise they act at once, as before.
let asking = ''; // 'restart', 'end' or 'show'

export const asked = () => asking;

export function forgetAsking() {
  asking = '';
}

// underWay: a game has started (or moved on) and is not over. redraw draws the clock part again.
export function askOrAct(name, underWay, act, redraw) {
  if (!underWay) return act();
  asking = name;
  redraw();
  document.querySelector('[data-remote-sure="no"]')?.focus();
  return null;
}

// acts: what each question does once answered "yes".
export function answerAsked(answer, acts, redraw) {
  const name = asking;
  asking = '';
  redraw();
  if (answer === 'yes' && acts[name]) return acts[name]();
  document.querySelector(`[data-remote="${name}"]`)?.focus();
  return null;
}
