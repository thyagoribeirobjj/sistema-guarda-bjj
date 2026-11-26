import { tvsShowing, changeTv, listTvs, deleteTv } from './firebase-tv.js';
import { buildShow, newStamp } from './tv-show.js';
import { showSteps, advance, carryClock } from './game-clock.js';

const dayMs = 24 * 60 * 60 * 1000;

// A coach's game saved in the designer while TVs show it: each session showing it gets its clock carried over onto
// the game as saved (js/game-clock.js) and a new stamp. The TV and the phones following it hear the change, and read the
// games again, so they run the new version within a second or two. Only the sessions
// showing that game are read (admins may list them, firestore.rules); other TVs and ordinary visits read nothing.
// Each session is read and written in one change (changeTv), so a coach's press on a phone landing in between is
// kept: the clock is carried over from it. The time since the session was saved is counted by the database's clock
// (now()), never this computer's, which may be wrong.
// gamesBefore and gamesNow: the coaches' games before and after the save. Returns how many TVs were changed.
export async function updateTvsShowing(id, gamesBefore, gamesNow, now) {
  const showing = await tvsShowing(id);
  if (!showing.length) return 0;
  const databaseNow = await now();
  await Promise.all(showing.map(({ code }) => changeTv(code, (session) => {
    if (!session || !showsGame(session.show, id)) return null;
    const before = showSteps(buildShow(session.show, gamesBefore));
    const after = showSteps(buildShow(session.show, gamesNow));
    const elapsed = Math.max(0, (databaseNow() - (session.updatedAt ?? databaseNow())) / 1000);
    const clock = carryClock(before, after, advance(before, session.clock, elapsed));
    return { ...session, clock, stamp: newStamp() };
  })));
  return showing.length;
}

// Still showing the game: another coach may have chosen something else meanwhile.
const showsGame = (show, id) => show?.game === id || show?.lesson?.game === id;

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
