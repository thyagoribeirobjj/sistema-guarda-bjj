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
// js/game-clock.js describes show and clock). Anyone may read one by its code; only admins can list them.

const session = (data) => ({ ...data, updatedAt: data.updatedAt?.toMillis?.() ?? null });

export async function readTv(code) {
  const { db, fb } = database();
  const snapshot = await fb.getDoc(fb.doc(db, `tv/${code}`));
  return snapshot.exists() ? session(snapshot.data()) : null;
}

// Admins only, when the remote opens: every session, one read each (there are a few, and old ones are deleted).
export async function listTvs() {
  const { db, fb } = database();
  const snapshot = await fb.getDocs(fb.collection(db, 'tv'));
  return snapshot.docs.map((tv) => ({ code: tv.id, session: session(tv.data()) }));
}

// Admins only, when a coach's game is saved: the sessions showing that game, alone or in a lesson plan. Only those
// are read.
export async function tvsShowing(id) {
  const { db, fb } = database();
  const asking = ['show.game', 'show.lesson.game'].map((field) => fb.getDocs(fb.query(fb.collection(db, 'tv'), fb.where(field, '==', id))));
  return (await Promise.all(asking)).flatMap((snapshot) => snapshot.docs.map((tv) => ({ code: tv.id, session: session(tv.data()) })));
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

// The phone remote's live session: the full database code (as on the TV) beside the page's smaller one, loaded only
// when the remote follows a TV.
let live = null;
function liveDatabase() {
  const { app, sdk, emulators } = database();
  live ||= import(sdk + 'firebase-firestore.js').then((store) => {
    const db = store.getFirestore(app);
    if (emulators) store.connectFirestoreEmulator(db, '127.0.0.1', 8080);
    return { db, fb: store };
  });
  return live;
}

// The remote: calls change(session or null) now and on every change, one read each. Returns how to stop.
export function followTv(code, change, failed) {
  let stop = null;
  let stopped = false;
  liveDatabase().then(({ db, fb }) => {
    if (!stopped) stop = fb.onSnapshot(fb.doc(db, `tv/${code}`), (snapshot) => change(snapshot.exists() ? session(snapshot.data()) : null), failed);
  }).catch(failed);
  return () => {
    stopped = true;
    stop?.();
  };
}

// The TV screen only (the full database code): calls change(session or null) now and on every change.
export function listenToTv(code, change, failed) {
  const { db, fb } = database();
  return fb.onSnapshot(fb.doc(db, `tv/${code}`), (snapshot) => change(snapshot.exists() ? snapshot.data() : null), failed);
}
