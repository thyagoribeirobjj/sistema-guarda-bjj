import { loadNotes, saveNote, loadUserSettings } from './firebase.js';

// Each person's notes on techniques: { <technique id>: text }. Only they see them, coaches don't.
// Signed out, they live in this browser. Signed in, they are read from the account the first time a technique
// is opened (not on every visit) and each change is saved there, one note at a time.
const storageKey = 'sg-notes';
// The account whose notes this browser holds, once they have been joined with it.
const joinedKey = 'sg-notes-account';
export const noteLength = 2000;
const saveDelay = 800;

let notes = readLocal();
let user = null; // signed in, notes not read yet
let accountId = null; // read: changes go to this account
let notesSaved = false; // the account's notes document exists: read, or written once on this visit
// firestore.rules start the notes only once the account's settings exist, and a first sign-in saves those first:
// until js/settings.js says they exist, saves that would start the notes wait (the notes stay in this browser).
let settingsReady = null;
let settingsExist = false;
const afterSettings = new Set(); // technique ids waiting for the settings
let loading = null;
let reading = false;
// This browser joined an account's notes, and it is not known yet whether that account is signed in (awaitAccount).
let accountUnknown = false;
let changedWhileLoading = new Set();
const waiting = new Map(); // technique id → timer of a save not sent yet
// Counts the times the notes were replaced other than by typing in this page (forgotten, another account, the
// account's notes read). A note box filled before the count last changed may show notes that are gone.
let epoch = 0;
let usedFor = null; // the account the notes were last used with (useNotesAccount)

function readLocal() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

function storeLocal() {
  try { localStorage.setItem(storageKey, JSON.stringify(notes)); } catch {}
}

function joinedAccount() {
  try { return localStorage.getItem(joinedKey); } catch { return null; }
}

export function notesEpoch() {
  return epoch;
}

// An open note box is filled again at once (js/page-events.js), so no key typed into it brings back what was forgotten.
export function forgetNotes() {
  epoch++;
  notes = {};
  storeLocal();
  try { localStorage.removeItem(joinedKey); } catch {}
  notesReplaced();
}

function notesReplaced() {
  document.dispatchEvent(new CustomEvent('notes-changed'));
}

// js/app.js, while Firebase starts (waiting true) and if it can't (false). In a browser that joined an account, a
// note typed before the account arrives would be replaced by the account's note unseen, so the box waits.
export function awaitAccount(waiting) {
  accountUnknown = waiting && Boolean(joinedAccount());
}

export function noteOf(id) {
  return notes[id] || '';
}

// previous: the account this browser was last signed in to (js/settings.js); settingsSaved: resolves once that
// account's settings exist in the database.
// Like favorites and progress, a signed-out device keeps no one's notes, and a different account starts clean.
export function useNotesAccount(person, previous, settingsSaved) {
  sendWaiting();
  user = null;
  accountId = null;
  loading = null;
  notesSaved = false;
  settingsExist = false;
  afterSettings.clear();
  settingsReady = settingsSaved;
  settingsSaved?.then(() => {
    if (settingsReady !== settingsSaved) return;
    settingsExist = true;
    for (const id of afterSettings) send(id);
    afterSettings.clear();
  });
  // was: the account this page itself was signed in to. Another tab signing out has already cleared what this browser
  // keeps (so previous and joined are gone), but not the notes this page holds.
  const was = usedFor;
  usedFor = person?.uid ?? null;
  if (usedFor !== was) epoch++;
  const joined = joinedAccount();
  if (!person) {
    accountUnknown = false;
    if (previous || joined || was) forgetNotes();
    return;
  }
  if ([previous, joined, was].some((other) => other && other !== person.uid)) forgetNotes();
  user = person;
}

// While the account's notes are being read (or it is not known yet whose they are) the note box can't be typed in:
// a note typed now would replace the one the account holds without it ever being shown.
export function notesLoading() {
  return reading || accountUnknown;
}

// Called when a technique opens. Resolves once the account's notes are read (or could not be).
export function readNotes() {
  if (!user || accountId === user.uid) return Promise.resolve();
  if (!loading) loading = join(user.uid);
  return loading;
}

async function join(uid) {
  changedWhileLoading = new Set();
  let fromAccount;
  reading = true;
  accountUnknown = false;
  try {
    fromAccount = await loadNotes(uid);
  } catch (error) {
    // Couldn't read the account: notes stay on this device for this visit, so nothing is written over the account.
    console.error(error);
    return;
  } finally {
    reading = false;
  }
  if (user?.uid !== uid) return;
  // With no notes in the account yet, what is here was never saved there (or the first save didn't arrive): keep it.
  const firstTime = joinedAccount() !== uid || !fromAccount;
  notesSaved = Boolean(fromAccount);
  fromAccount = fromAccount || {};
  const here = notes;
  // A browser joining for the first time adds its notes to the account; after that the account is the truth.
  epoch++;
  notes = firstTime ? { ...fromAccount, ...here } : { ...fromAccount };
  for (const id of changedWhileLoading) {
    if (here[id]) notes[id] = here[id];
    else delete notes[id];
  }
  accountId = uid;
  storeLocal();
  try { localStorage.setItem(joinedKey, uid); } catch {}
  const toSave = Object.keys({ ...fromAccount, ...notes }).filter((id) => (notes[id] || '') !== (fromAccount[id] || ''));
  for (const id of toSave) await send(id);
}

export function changeNote(id, value) {
  const note = value.slice(0, noteLength);
  if (note.trim()) notes[id] = note;
  else delete notes[id];
  storeLocal();
  if (loading && !accountId) changedWhileLoading.add(id);
  if (!accountId) return;
  clearTimeout(waiting.get(id));
  waiting.set(id, setTimeout(() => send(id), saveDelay));
}

async function send(id) {
  waiting.delete(id);
  if (!accountId) return;
  const uid = accountId;
  const create = !notesSaved;
  if (create && !settingsExist) {
    afterSettings.add(id);
    return;
  }
  try {
    await saveNote(uid, id, notes[id] || '', { create });
    if (accountId === uid) notesSaved = true;
  } catch (error) {
    if (error.code === 'not-found' || (create && error.code === 'permission-denied' && await settingsGone(uid))) {
      document.dispatchEvent(new CustomEvent('account-deleted'));
      return;
    }
    console.error(error);
    document.dispatchEvent(new CustomEvent('note-not-saved', { detail: id }));
  }
}

// Starting the notes was refused. The settings existed, so they are gone now only if "Delete my data" was used on
// another device. One read, only after a refusal.
async function settingsGone(uid) {
  try { return (await loadUserSettings(uid)) === null; } catch { return false; }
}

// The account is being deleted: drop what is waiting and write nothing more to it.
export function leaveNotesAccount() {
  accountUnknown = false;
  for (const timer of waiting.values()) clearTimeout(timer);
  waiting.clear();
  afterSettings.clear();
  user = null;
  accountId = null;
}

// Sends any note still waiting, for example when the page is closing or before signing out.
export function sendWaiting() {
  const sending = [...waiting].map(([id, timer]) => {
    clearTimeout(timer);
    return send(id);
  });
  return Promise.all(sending);
}

addEventListener('pagehide', sendWaiting);

// Another tab of this browser changed the notes (typed, cleared, signed out): this tab takes them, so an open box shows
// them and the next note typed here doesn't store this tab's older copy over them. One exception: a note typed here and
// not sent to the account yet stays as typed. It is newer than anything the other tab stored before it, it is under
// the person's fingers, and its save is about to go out; replacing it would lose keys. Nothing is stored back here,
// so two tabs never bounce a note between them; the next key typed here stores it.
addEventListener('storage', (event) => {
  if (event.key !== storageKey && event.key !== null) return;
  const theirs = readLocal();
  for (const id of [...waiting.keys(), ...afterSettings]) {
    if (notes[id]) theirs[id] = notes[id];
    else delete theirs[id];
  }
  epoch++;
  notes = theirs;
  notesReplaced();
});
