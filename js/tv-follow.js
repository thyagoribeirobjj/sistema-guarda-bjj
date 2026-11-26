import { tvsShowing, writeTv } from './firebase-tv.js';
import { buildShow, newStamp } from './tv-show.js';
import { showSteps, advance, carryClock } from './game-clock.js';

// A coach's game saved in the designer while TVs show it: each session showing it gets its clock carried over onto
// the game as saved (js/game-clock.js) and a new stamp. The TV reads the games again on every change of its session,
// and a phone on a session changed since it read them, so both run the new version at once. Only the sessions
// showing that game are read (admins may list them, firestore.rules); other TVs and ordinary visits read nothing.
// gamesBefore and gamesNow: the coaches' games before and after the save. Returns how many TVs were changed.
export async function updateTvsShowing(id, gamesBefore, gamesNow) {
  const showing = await tvsShowing(id);
  await Promise.all(showing.map(({ code, session }) => {
    const before = showSteps(buildShow(session.show, gamesBefore));
    const after = showSteps(buildShow(session.show, gamesNow));
    const elapsed = Math.max(0, (Date.now() - (session.updatedAt ?? Date.now())) / 1000);
    const clock = carryClock(before, after, advance(before, session.clock, elapsed));
    return writeTv(code, { ...session, clock, stamp: newStamp() });
  }));
  return showing.length;
}
