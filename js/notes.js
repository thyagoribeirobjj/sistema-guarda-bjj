import { loadNotes, saveNote } from './firebase.js';

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
let loading = null;
let changedWhileLoading = new Set();
const waiting = new Map(); // technique id → timer of a save not sent yet

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

function forgetNotes() {
  notes = {};
  storeLocal();
  try { localStorage.removeItem(joinedKey); } catch {}
}

export function noteOf(id) {
  return notes[id] || '';
}

// previous: the account this browser was last signed in to (js/settings.js).
// Like favorites and progress, a signed-out device keeps no one's notes, and a different account starts clean.
export function useNotesAccount(person, previous) {
  sendWaiting();
  user = null;
  accountId = null;
  loading = null;
  const joined = joinedAccount();
  if (!person) {
    if (previous || joined) forgetNotes();
    return;
  }
  if ((previous && previous !== person.uid) || (joined && joined !== person.uid)) forgetNotes();
  user = person;
}

// Called when a technique opens. Resolves true when the notes shown changed.
export function readNotes() {
  if (!user || accountId === user.uid) return Promise.resolve(false);
  if (!loading) loading = join(user.uid);
  return loading;
}

async function join(uid) {
  changedWhileLoading = new Set();
  let fromAccount;
  try {
    fromAccount = await loadNotes(uid);
  } catch (error) {
    // Couldn't read the account: notes stay on this device for this visit, so nothing is written over the account.
    console.error(error);
    return false;
  }
  if (user?.uid !== uid) return false;
  const firstTime = joinedAccount() !== uid;
  const here = notes;
  // A browser joining for the first time adds its notes to the account; after that the account is the truth.
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
  return true;
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
  try {
    await saveNote(accountId, id, notes[id] || '');
  } catch (error) {
    console.error(error);
    document.dispatchEvent(new CustomEvent('note-not-saved', { detail: id }));
  }
}

// Sends any note still waiting, for example when the page is closing.
export function sendWaiting() {
  for (const [id, timer] of waiting) {
    clearTimeout(timer);
    send(id);
  }
}

addEventListener('pagehide', sendWaiting);
