import { tvsShowing, writeTv, listTvs, deleteTv } from './firebase-tv.js';
import { buildShow, newStamp } from './tv-show.js';
import { showSteps, advance, carryClock } from './game-clock.js';

const dayMs = 24 * 60 * 60 * 1000;

// A coach's game saved in the designer while TVs show it: each session showing it gets its clock carried over onto
// the game as saved (js/game-clock.js) and a new stamp. The TV and the phones following it hear the change, and read the
// games again, so they run the new version within a second or two. Only the sessions
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

// Every session untouched for a day is deleted when a coach opens the remote, whichever phone started it (admins can
// list the TVs). A phone still remembers its TV; its next game starts a new session.
export async function deleteOldSessions() {
  try {
    const old = (await listTvs()).filter(({ session: stored }) => stored.updatedAt && Date.now() - stored.updatedAt > dayMs);
    await Promise.all(old.map(({ code }) => deleteTv(code).catch((error) => console.error(error))));
  } catch (error) {
    console.error(error);
  }
}
