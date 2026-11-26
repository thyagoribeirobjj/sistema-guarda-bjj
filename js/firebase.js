// Sign-in and every database call. Nothing else in the site talks to Firebase directly.
// Who may read or change what is decided by firestore.rules, not by this file.
import { pastEntry } from './week.js';

const sdk = 'https://www.gstatic.com/firebasejs/13.2.0/';

// Only for tests/signed-in.mjs: a page on this computer opened with ?emulators=<made-up person> uses the local
// emulators (firebase.json) and signs that person in (&analytics=<made-up id>: with Google Analytics switched on,
// which the test answers itself). The published site never matches, so nothing changes there.
const testAddress = new URLSearchParams(['localhost', '127.0.0.1'].includes(location.hostname) ? location.search : '');
const testPerson = testAddress.get('emulators');
const testConfig = { apiKey: 'test', projectId: 'demo-sistema-guarda', appId: '1:1:web:1', measurementId: testAddress.get('analytics') || '' };

let auth = null;
let db = null;
let fb = {};
let firebaseApp = null;
let measurementId = '';

// realtime: the TV screen (js/tv-screen.js) only. It needs the database's live updates, which only the full database
// code has, and never signs in; every other page loads the smaller code (firestore-lite) and sign-in.
export async function startFirebase({ realtime = false } = {}) {
  try {
    // Firebase Hosting serves this project's public settings here. A local preview has none,
    // so the site still works there, just without sign-in or the database.
    const response = testPerson ? null : await fetch('/__/firebase/init.json');
    if (response && !response.ok) return false;
    const config = testPerson ? { ...testConfig } : await response.json();
    config.authDomain = location.host;

    const files = realtime ? ['firebase-app.js', 'firebase-firestore.js'] : ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore-lite.js'];
    const [app, ...parts] = await Promise.all(files.map((file) => import(sdk + file)));
    const [authSdk, store] = realtime ? [null, parts[0]] : parts;
    fb = { ...authSdk, ...store };
    firebaseApp = app.initializeApp(config);
    measurementId = config.measurementId || '';
    auth = authSdk ? authSdk.getAuth(firebaseApp) : null;
    db = store.getFirestore(firebaseApp);
    if (testPerson) {
      if (auth) authSdk.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      store.connectFirestoreEmulator(db, '127.0.0.1', 8080);
    }
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

// The Google Analytics id from the site's own Firebase settings: there only once Analytics is switched on in the
// Firebase console, '' until then (and in a local preview).
export function analyticsId() {
  return measurementId;
}

// Google Analytics' code, loaded only for someone who accepted it (js/analytics.js decides when).
export async function loadAnalytics() {
  return { sdk: await import(sdk + 'firebase-analytics.js'), app: firebaseApp };
}

// For js/firebase-tv.js, the database calls of the games on the TV, kept in a file of their own.
export function database() {
  return { db, fb, auth };
}

export function onAccountChange(callback) {
  if (!auth) return callback(null);
  fb.onAuthStateChanged(auth, callback);
}

export async function signIn() {
  const provider = new fb.GoogleAuthProvider();
  if (testPerson) return fb.signInWithCredential(auth, fb.GoogleAuthProvider.credential(testPerson));
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

export function forget(name) {
  try { localStorage.removeItem(`sg-site-${name}`); } catch {}
}

export function lastSeen(name) {
  return kept(name)?.value ?? null;
}

export async function site(name, fresh) {
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

// The name lets coaches see who is who on their list of students. Once the settings exist they are updated, not
// written anew: an update fails ('not-found') when they were deleted, so a device still signed in elsewhere can't
// bring back what "Delete my data" removed.
export function saveUserSettings(uid, data, { create = true } = {}) {
  const user = auth.currentUser;
  const settings = { ...data, email: user.email, name: (user.displayName || '').slice(0, 100) };
  if (create) return write(`users/${uid}`, settings);
  return fb.updateDoc(fb.doc(db, `users/${uid}`), { lesson: fb.deleteField(), ...settings, updatedAt: fb.serverTimestamp() });
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

// ---- the kids' challenges ----
// approvals/{uid} holds { challenges: { <challenge id>: { status: 'approved' | 'again', claim } } }: the coaches'
// answers to what the kid claimed (users/{uid}.claims). The kid reads their own (one read, only for the kids class);
// only coaches write them (firestore.rules).
export async function loadApprovals(uid) {
  return (await read(`approvals/${uid}`))?.challenges || {};
}

// Every kid's answers, for the coach's list of students: one read per kid with any answer.
export async function loadAllApprovals() {
  const snapshot = await fb.getDocs(fb.collection(db, 'approvals'));
  return Object.fromEntries(snapshot.docs.map((answers) => [answers.id, answers.data().challenges || {}]));
}

// answer: { status: 'approved' | 'again', claim }, or null to take the answer back.
export function saveApproval(uid, id, answer) {
  return fb.setDoc(fb.doc(db, `approvals/${uid}`), {
    challenges: { [id]: answer || fb.deleteField() }, changed: id, updatedBy: auth.currentUser.email, updatedAt: fb.serverTimestamp(),
  }, { merge: true });
}

// "Delete my data": the person's notes, their settings, the coaches' answers to their kids' challenges (which
// firestore.rules lets them delete only once the settings are gone), then their sign-in record on this site, which
// signs them out (and so clears this browser). Deleting what is already gone is fine, so pressing again after an
// interruption finishes the job; error.settingsDeleted says the settings were gone by the time it stopped.
export async function deleteMyData(uid) {
  let settingsDeleted = false;
  try {
    await fb.deleteDoc(fb.doc(db, `users/${uid}/private/notes`));
    await fb.deleteDoc(fb.doc(db, `users/${uid}`));
    settingsDeleted = true;
    await fb.deleteDoc(fb.doc(db, `approvals/${uid}`));
    await deleteSignIn();
  } catch (error) {
    error.settingsDeleted = settingsDeleted;
    throw error;
  }
}

async function deleteSignIn() {
  try {
    await fb.deleteUser(auth.currentUser);
  } catch (error) {
    if (error.code !== 'auth/requires-recent-login') throw error;
    // Signed in a while ago: Google asks the person to confirm it's them first.
    const user = auth.currentUser;
    await (testPerson
      ? fb.reauthenticateWithCredential(user, fb.GoogleAuthProvider.credential(testPerson))
      : fb.reauthenticateWithPopup(user, new fb.GoogleAuthProvider()));
    await fb.deleteUser(user);
  }
}

// users/{uid}/private/notes holds { notes: { <technique id>: text } }. Only that person can read it (firestore.rules).
// null when there is no notes document (yet, or any more).
export async function loadNotes(uid) {
  const saved = await read(`users/${uid}/private/notes`);
  return saved ? saved.notes || {} : null;
}

// One note per save, naming the note it changes; an empty note is removed. Like the settings, once the document
// exists it is only updated, so a save fails ('not-found') after "Delete my data" instead of bringing it back.
export function saveNote(uid, id, note, { create = true } = {}) {
  const notes = fb.doc(db, `users/${uid}/private/notes`);
  const value = note ? note : fb.deleteField();
  if (create) return fb.setDoc(notes, { notes: { [id]: value }, changed: id, updatedAt: fb.serverTimestamp() }, { merge: true });
  return fb.updateDoc(notes, new fb.FieldPath('notes', id), value, 'changed', id, 'updatedAt', fb.serverTimestamp());
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
