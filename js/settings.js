import { loadUserSettings, saveUserSettings, signOut } from './firebase.js';
import { belts, kidsBelts } from './content.js';
import { useNotesAccount, leaveNotesAccount, forgetNotes } from './notes.js';

// Each visitor's language, theme, class (audience), belt, favorites, progress, kids' challenges and lesson plan. Kept in this browser, and in the
// database (users/{uid}) once they sign in, so they follow them to other devices.
const storageKey = 'sg-settings';
// Each one is a block of colors in css/theme.css.
export const themes = ['dark', 'light', 'orange', 'gold', 'royal', 'emerald'];
// The class someone trains in ("I train in"): 'adult' is the site as it always was.
export const audiences = ['kids', 'adult', 'both'];
const accountKey = 'sg-account';
// Set while this browser belongs to an account whose settings it has not yet seen in the database (read or saved):
// until then a missing document means "not saved yet", never "deleted".
const unconfirmedKey = 'sg-account-unconfirmed';

// First visit: Portuguese for a browser set to Portuguese, English for everyone else.
const browserLanguage = (navigator.language || '').toLowerCase().startsWith('pt') ? 'pt' : 'en';

// progress: { <technique id>: 'learning' | 'done' }
// lesson: the lesson builder's choices, { mod, dur, items, game }; null until something is picked.
// belt: the belt the person says they have ('' until they pick one; one of belts or kidsBelts in js/content.js).
// audience: the class they train in (one of audiences). claims: the kids' challenges they said they did,
// { <challenge id>: <when, in milliseconds> }; only signed in (a coach answers in approvals/{uid}).
// seenWeek: a short mark of the class last looked at on This week, for the "new" dot (js/nav.js); '' before the first visit.
export const settings = { language: browserLanguage, theme: '', audience: 'adult', belt: '', seenWeek: '', favorites: [], progress: {}, claims: {}, lesson: null };
merge(readLocal());
takeOldLesson();

let accountId = null;
let accountSaved = false; // the account's settings exist in the database: read, or written once on this visit
let settingsSaved = () => {}; // tells js/notes.js the settings exist, so the notes may be started
let loading = false;
let changedWhileLoading = {};

function readLocal() {
  try { return JSON.parse(localStorage.getItem(storageKey)) || {}; } catch { return {}; }
}

// Takes saved settings in. With keep, the favorites and progress already here are added to, not replaced.
function merge(from, keep = false) {
  if (from.language === 'pt' || from.language === 'en') settings.language = from.language;
  if (from.theme === '' || themes.includes(from.theme)) settings.theme = from.theme;
  if (audiences.includes(from.audience)) settings.audience = from.audience;
  if ((from.belt === '' || belts.includes(from.belt) || kidsBelts.includes(from.belt)) && !(keep && settings.belt)) settings.belt = from.belt;
  // The account's mark wins even on a first sign-in: this browser may have just noted a class nobody looked at.
  if (typeof from.seenWeek === 'string' && from.seenWeek && from.seenWeek.length <= 100) settings.seenWeek = from.seenWeek;
  if (Array.isArray(from.favorites)) settings.favorites = keep ? [...new Set([...from.favorites, ...settings.favorites])] : from.favorites;
  if (from.progress && typeof from.progress === 'object') settings.progress = keep ? { ...from.progress, ...settings.progress } : from.progress;
  if (isMap(from.claims)) settings.claims = keep ? { ...from.claims, ...settings.claims } : from.claims;
  if (isMap(from.lesson)) settings.lesson = from.lesson;
}

function isMap(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// The lesson builder used to keep its choices in their own place in this browser: move them in once.
function takeOldLesson() {
  try {
    const old = JSON.parse(localStorage.getItem('sg-pick5'));
    if (!settings.lesson && isMap(old)) {
      settings.lesson = old;
      localStorage.setItem(storageKey, JSON.stringify(saved()));
    }
    localStorage.removeItem('sg-pick5');
  } catch {}
}

function lastAccount() {
  try { return localStorage.getItem(accountKey); } catch { return null; }
}

function saved() {
  const { language, theme, audience, belt, seenWeek, favorites, progress, claims, lesson } = settings;
  const kept = { language, theme, audience, belt, seenWeek, favorites, progress, claims };
  return lesson ? { ...kept, lesson } : kept;
}

function store() {
  try { localStorage.setItem(storageKey, JSON.stringify(saved())); } catch {}
  if (!accountId) return;
  const uid = accountId;
  saveUserSettings(uid, saved(), { create: !accountSaved }).then(() => {
    if (accountId === uid) settingsExist();
  }, (error) => {
    // The settings this device saved before are gone: "Delete my data" was used on another device.
    if (error.code === 'not-found' && accountId === uid) accountDeleted();
    else console.error(error);
  });
}

function settingsExist() {
  accountSaved = true;
  try { localStorage.removeItem(unconfirmedKey); } catch {}
  settingsSaved();
}

export function applyTheme() {
  const root = document.documentElement;
  if (settings.theme) root.dataset.theme = settings.theme;
  else delete root.dataset.theme;
  // The phone's browser bar takes the header's color.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(root).getPropertyValue('--surface').trim());
}

export function currentTheme() {
  return themes.includes(settings.theme) ? settings.theme : 'dark';
}

function forgetPersonalMarks() {
  settings.belt = '';
  settings.favorites = [];
  settings.progress = {};
  settings.claims = {};
  settings.lesson = null;
}

// "Delete my data" (the privacy page): nothing more is written to the account while it is deleted.
export function leaveAccount() {
  accountId = null;
  leaveNotesAccount();
}

// "Delete my data" was used on another device: nothing is written back, so the account stays deleted, and this
// device forgets it all and signs out.
async function accountDeleted() {
  leaveAccount();
  forgetPersonalMarks();
  forgetAccount();
  store();
  forgetNotes();
  await signOut().catch((error) => console.error(error));
}

document.addEventListener('account-deleted', () => { if (accountId) accountDeleted(); });

// Signed out, "delete my data" clears what this browser keeps.
export function clearThisBrowser() {
  forgetPersonalMarks();
  store();
  forgetNotes();
}

function forgetAccount() {
  try {
    localStorage.removeItem(accountKey);
    localStorage.removeItem(unconfirmedKey);
  } catch {}
}

// This browser knows the account's settings existed: it read them, or saved them, before.
function knownSaved(uid) {
  try { return localStorage.getItem(accountKey) === uid && localStorage.getItem(unconfirmedKey) !== uid; } catch { return false; }
}

// True once the account's settings are known (read, or found not saved yet), and so the class the person trains in.
export async function useAccount(user) {
  accountId = null;
  const previous = lastAccount();
  const settingsSavedBefore = user ? knownSaved(user.uid) : false;
  const settingsReady = new Promise((resolve) => { settingsSaved = resolve; });
  useNotesAccount(user, previous, settingsReady);
  if (!user) {
    // Signed out: the tree and progress stay in the account, not on a device someone else may use next.
    if (previous) {
      forgetPersonalMarks();
      forgetAccount();
      store();
    }
    return;
  }
  if (previous && previous !== user.uid) forgetPersonalMarks();

  let fromDatabase;
  loading = true;
  changedWhileLoading = {};
  try {
    fromDatabase = await loadUserSettings(user.uid);
  } catch (error) {
    // Couldn't read the account: keep this visit on the device only, so nothing is written over the account.
    console.error(error);
    return;
  } finally {
    loading = false;
  }
  // This browser saw the account's settings before: gone now means the person used "Delete my data" on another device.
  // (A first sign-in whose first save never arrived is only "not saved yet": what is here is kept and saved now.)
  if (!fromDatabase && settingsSavedBefore) return accountDeleted();
  // A browser that has not saved to the account yet adds what was marked here to it. After that the account is
  // the truth, so removing a favorite on one device removes it on the others.
  if (fromDatabase) merge(fromDatabase, !settingsSavedBefore);
  Object.assign(settings, changedWhileLoading);
  accountId = user.uid;
  accountSaved = false;
  try {
    localStorage.setItem(accountKey, user.uid);
    if (!fromDatabase) localStorage.setItem(unconfirmedKey, user.uid);
  } catch {}
  if (fromDatabase) settingsExist();
  store();
  applyTheme();
  return true;
}

export function changeSettings(changes) {
  if (loading) Object.assign(changedWhileLoading, changes);
  Object.assign(settings, changes);
  store();
  applyTheme();
}

// The "new" dot: looking at This week marks its class seen (one save, only when it changed). Otherwise the very first
// visit marks it silently, so there is no dot; not while the account is being read, which may know an older class.
export function seeWeek(signature, looking) {
  if (settings.seenWeek === signature) return;
  if (looking || (!settings.seenWeek && !loading)) changeSettings({ seenWeek: signature });
}

export function isFavorite(id) {
  return settings.favorites.includes(id);
}

export function toggleFavorite(id) {
  const favorites = isFavorite(id)
    ? settings.favorites.filter((favorite) => favorite !== id)
    : [...settings.favorites, id];
  changeSettings({ favorites });
}

export function progressOf(id) {
  return settings.progress[id] || '';
}

// Tapping the mark a move already has clears it.
export function markProgress(id, mark) {
  const progress = { ...settings.progress };
  if (progress[id] === mark) delete progress[id];
  else progress[id] = mark;
  changeSettings({ progress });
}

// "I did it" on a kids' challenge, or taking it back while the coach has not answered.
export function claimChallenge(id, claimed) {
  const claims = { ...settings.claims };
  if (claimed) claims[id] = Date.now();
  else delete claims[id];
  changeSettings({ claims });
}
