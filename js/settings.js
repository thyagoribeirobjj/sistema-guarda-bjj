import { loadUserSettings, saveUserSettings } from './firebase.js';

// Each visitor's language, theme, favorites, progress and lesson plan. Kept in this browser, and in the
// database (users/{uid}) once they sign in, so they follow them to other devices.
const storageKey = 'sg-settings';
// Each one is a block of colors in css/theme.css.
export const themes = ['dark', 'light', 'orange', 'gold', 'royal', 'emerald'];
const accountKey = 'sg-account';

// First visit: Portuguese for a browser set to Portuguese, English for everyone else.
const browserLanguage = (navigator.language || '').toLowerCase().startsWith('pt') ? 'pt' : 'en';

// progress: { <technique id>: 'learning' | 'done' }
// lesson: the lesson builder's choices, { mod, dur, items, game }; null until something is picked.
export const settings = { language: browserLanguage, theme: '', favorites: [], progress: {}, lesson: null };
merge(readLocal());
takeOldLesson();

let accountId = null;
let loading = false;
let changedWhileLoading = {};

function readLocal() {
  try { return JSON.parse(localStorage.getItem(storageKey)) || {}; } catch { return {}; }
}

// Takes saved settings in. With keep, the favorites and progress already here are added to, not replaced.
function merge(from, keep = false) {
  if (from.language === 'pt' || from.language === 'en') settings.language = from.language;
  if (from.theme === '' || themes.includes(from.theme)) settings.theme = from.theme;
  if (Array.isArray(from.favorites)) settings.favorites = keep ? [...new Set([...from.favorites, ...settings.favorites])] : from.favorites;
  if (from.progress && typeof from.progress === 'object') settings.progress = keep ? { ...from.progress, ...settings.progress } : from.progress;
  if (isLesson(from.lesson)) settings.lesson = from.lesson;
}

function isLesson(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// The lesson builder used to keep its choices in their own place in this browser: move them in once.
function takeOldLesson() {
  try {
    const old = JSON.parse(localStorage.getItem('sg-pick5'));
    if (!settings.lesson && isLesson(old)) {
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
  const { language, theme, favorites, progress, lesson } = settings;
  return lesson ? { language, theme, favorites, progress, lesson } : { language, theme, favorites, progress };
}

function store() {
  try { localStorage.setItem(storageKey, JSON.stringify(saved())); } catch {}
  if (accountId) saveUserSettings(accountId, saved()).catch((error) => console.error(error));
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
  settings.favorites = [];
  settings.progress = {};
  settings.lesson = null;
}

export async function useAccount(user) {
  accountId = null;
  const previous = lastAccount();
  if (!user) {
    // Signed out: the tree and progress stay in the account, not on a device someone else may use next.
    if (previous) {
      forgetPersonalMarks();
      try { localStorage.removeItem(accountKey); } catch {}
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
  // A browser that was never signed in adds what was marked here to the account. After that the account is
  // the truth, so removing a favorite on one device removes it on the others.
  if (fromDatabase) merge(fromDatabase, !previous);
  Object.assign(settings, changedWhileLoading);
  accountId = user.uid;
  try { localStorage.setItem(accountKey, user.uid); } catch {}
  store();
  applyTheme();
}

export function changeSettings(changes) {
  if (loading) Object.assign(changedWhileLoading, changes);
  Object.assign(settings, changes);
  store();
  applyTheme();
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
