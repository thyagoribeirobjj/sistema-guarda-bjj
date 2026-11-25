// The database calls of the games on the TV: the coaches' own games (site/games) and the TV sessions (tv/{code}).
// Part of js/firebase.js, which holds the connection; who may read or change what is in firestore.rules.
import { database, site, forget } from './firebase.js';

// site/games holds { games: { <id>: game } } (js/game-clock.js describes a game). Read only when the lesson builder,
// the game designer or the TV remote opens, never on an ordinary visit; kept in the browser like the week.
export async function loadCoachGames({ fresh = false } = {}) {
  return (await site('games', fresh))?.games || {};
}

// One game per save, naming the game it changes; null deletes it.
export async function saveCoachGame(id, game) {
  const { db, fb, auth } = database();
  await fb.setDoc(fb.doc(db, 'site/games'), {
    games: { [id]: game || fb.deleteField() }, changed: id, updatedBy: auth.currentUser.email, updatedAt: fb.serverTimestamp(),
  }, { merge: true });
  forget('games');
}

// ---- TV sessions ----
// tv/{code} holds what one TV shows: { name, language, show, clock, beeps, stamp } (js/remote.js writes it,
// js/game-clock.js describes show and clock). Anyone may read one by its code; nobody can list them.

export async function readTv(code) {
  const { db, fb } = database();
  const snapshot = await fb.getDoc(fb.doc(db, `tv/${code}`));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  return { ...data, updatedAt: data.updatedAt?.toMillis?.() ?? null };
}

export function writeTv(code, session) {
  const { db, fb } = database();
  const { name, language, show, clock, beeps, stamp } = session;
  // No coach's email here: anyone with the TV's code can read the session.
  return fb.setDoc(fb.doc(db, `tv/${code}`), { name, language, show, clock, beeps, stamp, updatedAt: fb.serverTimestamp() });
}

export function deleteTv(code) {
  const { db, fb } = database();
  return fb.deleteDoc(fb.doc(db, `tv/${code}`));
}

// The TV screen only (the full database code): calls change(session or null) now and on every change.
export function listenToTv(code, change, failed) {
  const { db, fb } = database();
  return fb.onSnapshot(fb.doc(db, `tv/${code}`), (snapshot) => change(snapshot.exists() ? snapshot.data() : null), failed);
}
