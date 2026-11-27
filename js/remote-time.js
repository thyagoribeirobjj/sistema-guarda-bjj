import { caughtUp } from './game-clock.js';

// The phone's clock and the database's need not agree, so the remote learns the gap between them (skew: the phone's
// time minus the database's, in ms), as the TV and the game designer do: from its own presses (the database stamps a
// press about half way between sending it and its answer) and from other coaches' changes as they arrive.
let skew = null;
const presses = new Map(); // stamp: { sent, answered, savedAt }

function learn(stamp, times) {
  const press = { ...presses.get(stamp), ...times };
  presses.set(stamp, press);
  if (!press.answered || !Number.isFinite(press.savedAt)) return;
  skew = (press.sent + press.answered) / 2 - press.savedAt;
  presses.delete(stamp);
}

export const pressAnswered = (stamp, sent, answered) => learn(stamp, { sent, answered });
export const pressSaved = (stamp, savedAt) => learn(stamp, { savedAt });

export function forgetPresses() {
  presses.clear();
}

// How long (seconds) a session's clock had already run when the phone took it in. live: it arrived while the phone
// listened, so it counts from now (caughtUp(), js/game-clock.js).
export function elapsedSince(savedAt, live) {
  const caught = caughtUp({ lag: Number.isFinite(savedAt) ? Date.now() - savedAt : NaN, skew, live });
  skew = caught.skew;
  return caught.elapsed;
}
