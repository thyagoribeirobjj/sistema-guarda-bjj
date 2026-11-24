import { loadUserSettings, saveUserSettings } from './firebase.js';

// Each visitor's language, theme, favorites and progress. Kept in this browser, and in the
// database (users/{uid}) once they sign in, so they follow them to other devices.
const storageKey = 'sg-settings';
const accountKey = 'sg-account';

// First visit: Portuguese for a browser set to Portuguese, English for everyone else.
const browserLanguage = (navigator.language || '').toLowerCase().startsWith('pt') ? 'pt' : 'en';

// progress: { <technique id>: 'learning' | 'done' }
export const settings = { language: browserLanguage, theme: '', favorites: [], progress: {} };
merge(readLocal());

let accountId = null;

function readLocal() {
  try { return JSON.parse(localStorage.getItem(storageKey)) || {}; } catch { return {}; }
}

// Takes saved settings in. With keep, the favorites and progress already here are added to, not replaced.
function merge(from, keep = false) {
  if (from.language === 'pt' || from.language === 'en') settings.language = from.language;
  if (typeof from.theme === 'string') settings.theme = from.theme;
  if (Array.isArray(from.favorites)) settings.favorites = keep ? [...new Set([...from.favorites, ...settings.favorites])] : from.favorites;
  if (from.progress && typeof from.progress === 'object') settings.progress = keep ? { ...from.progress, ...settings.progress } : from.progress;
}

function lastAccount() {
  try { return localStorage.getItem(accountKey); } catch { return null; }
}

function saved() {
  const { language, theme, favorites, progress } = settings;
  return { language, theme, favorites, progress };
}

function store() {
  try { localStorage.setItem(storageKey, JSON.stringify(saved())); } catch {}
  if (accountId) saveUserSettings(accountId, saved()).catch((error) => console.error(error));
}

export function applyTheme() {
  const root = document.documentElement;
  if (settings.theme) root.dataset.theme = settings.theme;
  else delete root.dataset.theme;
}

export function currentTheme() {
  return settings.theme || 'dark';
}

export async function useAccount(user) {
  accountId = null;
  if (!user) return;
  const fromDatabase = await loadUserSettings(user.uid).catch(() => null);
  // The first time this browser signs in to an account, what was marked here before is added to the account.
  // After that the account is the truth, so removing a favorite on one device removes it on the others.
  if (fromDatabase) merge(fromDatabase, lastAccount() !== user.uid);
  accountId = user.uid;
  try { localStorage.setItem(accountKey, user.uid); } catch {}
  store();
  applyTheme();
}

export function changeSettings(changes) {
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
