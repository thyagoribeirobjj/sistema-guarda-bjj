// Sign-in and every database call. Nothing else in the site talks to Firebase directly.
// Who may read or change what is decided by firestore.rules, not by this file.
const sdk = 'https://www.gstatic.com/firebasejs/13.2.0/';

let auth = null;
let db = null;
let fb = {};

export async function startFirebase() {
  try {
    // Firebase Hosting serves this project's public settings here. A local preview has none,
    // so the site still works there, just without sign-in or the database.
    const response = await fetch('/__/firebase/init.json');
    if (!response.ok) return false;
    const config = await response.json();
    config.authDomain = location.host;

    const [app, authSdk, store] = await Promise.all(
      ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore-lite.js'].map((file) => import(sdk + file)),
    );
    fb = { ...authSdk, ...store };
    const firebaseApp = app.initializeApp(config);
    auth = authSdk.getAuth(firebaseApp);
    db = store.getFirestore(firebaseApp);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

export function onAccountChange(callback) {
  if (!auth) return callback(null);
  fb.onAuthStateChanged(auth, callback);
}

export async function signIn() {
  const provider = new fb.GoogleAuthProvider();
  try {
    await fb.signInWithPopup(auth, provider);
  } catch (error) {
    if (error.code === 'auth/popup-blocked') return fb.signInWithRedirect(auth, provider);
    if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') throw error;
  }
}

export function signOut() {
  return fb.signOut(auth);
}

async function read(path) {
  const snapshot = await fb.getDoc(fb.doc(db, path));
  return snapshot.exists() ? snapshot.data() : null;
}

function write(path, data) {
  return fb.setDoc(fb.doc(db, path), { ...data, updatedAt: fb.serverTimestamp() });
}

export async function isAdmin(email) {
  if (!db || !email) return false;
  return (await read(`admins/${email.toLowerCase()}`).catch(() => null)) !== null;
}

// ---- what the whole site shows ----
// The week and the list of videos change a few times a week, so each browser keeps its last copy for a few
// minutes instead of asking the database on every visit. Admin pages ask for a fresh copy.
const keepMinutes = 15;

function kept(name) {
  try { return JSON.parse(localStorage.getItem(`sg-site-${name}`)); } catch { return null; }
}

function forget(name) {
  try { localStorage.removeItem(`sg-site-${name}`); } catch {}
}

export function lastSeen(name) {
  return kept(name)?.value ?? null;
}

async function site(name, fresh) {
  const copy = kept(name);
  const age = copy ? Date.now() - copy.at : -1;
  if (!fresh && age >= 0 && age < keepMinutes * 60000) return copy.value;
  if (!db) return copy?.value ?? null;
  try {
    const value = await read(`site/${name}`);
    try { localStorage.setItem(`sg-site-${name}`, JSON.stringify({ at: Date.now(), value })); } catch {}
    return value;
  } catch (error) {
    if (copy) return copy.value;
    throw error;
  }
}

export function loadWeek({ fresh = false } = {}) {
  return site('week', fresh);
}

export async function saveWeek(week) {
  await write('site/week', { ...week, updatedBy: auth.currentUser.email });
  forget('week');
}

// site/weeks holds { weeks: [{ weekOf, title, note, techniques }] }, newest first. Read only when someone asks.
const pastWeeksKept = 52;

export async function loadPastWeeks({ fresh = false } = {}) {
  return (await site('weeks', fresh))?.weeks || [];
}

export async function archiveWeek(week) {
  const past = pastEntry(week);
  const older = ((await read('site/weeks'))?.weeks || []).filter((other) => other.weekOf !== past.weekOf);
  await write('site/weeks', { weeks: [past, ...older].slice(0, pastWeeksKept), updatedBy: auth.currentUser.email });
  forget('weeks');
}

export function loadUserSettings(uid) {
  return read(`users/${uid}`);
}

// The name lets coaches see who is who on their list of students.
export function saveUserSettings(uid, data) {
  const user = auth.currentUser;
  return write(`users/${uid}`, { ...data, email: user.email, name: (user.displayName || '').slice(0, 100) });
}

// Every student's users/{uid}, for coaches (firestore.rules lets admins read them). Read only when a coach asks:
// each student is one read. Notes live elsewhere and are never part of this.
export async function loadStudents() {
  const snapshot = await fb.getDocs(fb.collection(db, 'users'));
  return snapshot.docs.map((user) => {
    const data = user.data();
    return { ...data, uid: user.id, updatedAt: data.updatedAt?.toMillis?.() ?? null };
  });
}

// "Delete my data": the person's notes, then their settings. Signing out afterwards clears this browser.
export async function deleteMyData(uid) {
  await fb.deleteDoc(fb.doc(db, `users/${uid}/private/notes`));
  await fb.deleteDoc(fb.doc(db, `users/${uid}`));
}

// users/{uid}/private/notes holds { notes: { <technique id>: text } }. Only that person can read it (firestore.rules).
export async function loadNotes(uid) {
  return (await read(`users/${uid}/private/notes`))?.notes || {};
}

// One note per save, naming the note it changes; an empty note is removed.
export function saveNote(uid, id, note) {
  return fb.setDoc(fb.doc(db, `users/${uid}/private/notes`),
    { notes: { [id]: note ? note : fb.deleteField() }, changed: id, updatedAt: fb.serverTimestamp() },
    { merge: true });
}

// ---- each move's video, diagram and minimum belt ----
// site/media holds { techniques: { <id>: { video: <YouTube id>, diagram: true, minBelt: 'blue' } } }.
// minBelt is set only where an admin gave the move a minimum belt; without it the move is for everyone.
// The diagram image itself sits in diagrams/<id> and is read only when someone opens that move.

export async function loadMedia({ fresh = false } = {}) {
  return (await site('media', fresh).catch(() => null))?.techniques || {};
}

async function saveMediaField(id, field, value) {
  const change = { [field]: value === null ? fb.deleteField() : value };
  await fb.setDoc(fb.doc(db, 'site/media'),
    { techniques: { [id]: change }, updatedBy: auth.currentUser.email, updatedAt: fb.serverTimestamp() },
    { merge: true });
  forget('media');
}

export function saveVideo(id, videoId) {
  return saveMediaField(id, 'video', videoId);
}

// '' clears the minimum belt: the technique is for everyone.
export function saveMinBelt(id, belt) {
  return saveMediaField(id, 'minBelt', belt || null);
}

export async function loadDiagram(id) {
  return (await read(`diagrams/${id}`))?.image || null;
}

export async function saveDiagram(id, image) {
  await write(`diagrams/${id}`, { image, updatedBy: auth.currentUser.email });
  await saveMediaField(id, 'diagram', true);
}

export async function removeDiagram(id) {
  await fb.deleteDoc(fb.doc(db, `diagrams/${id}`));
  await saveMediaField(id, 'diagram', null);
}

// ---- translation ----
// A small Google Apps Script (docs/translator.gs) translates for admins only. Its address is in site/config.

export async function translate(texts, from, to) {
  const config = await read('site/config');
  if (!config?.translatorUrl) throw new Error('No translator configured (site/config.translatorUrl).');
  const user = auth.currentUser;
  const response = await fetch(config.translatorUrl, {
    method: 'POST',
    body: JSON.stringify({ idToken: await user.getIdToken(), email: user.email, texts, from, to }),
  });
  const result = await response.json();
  if (!result.texts) throw new Error(result.error || 'Translation failed.');
  return result.texts;
}
