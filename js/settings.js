import { loadUserSettings, saveUserSettings } from './firebase.js';

// Each visitor's language, theme, favorites and progress. Kept in this browser, and in the
// database (users/{uid}) once they sign in, so they follow them to other devices.
const storageKey = 'sg-settings';

// First visit: Portuguese for a browser set to Portuguese, English for everyone else.
const browserLanguage = (navigator.language || '').toLowerCase().startsWith('pt') ? 'pt' : 'en';

// progress: { <technique id>: 'learning' | 'done' }
export const settings = { language: browserLanguage, theme: '', favorites: [], progress: {} };
merge(readLocal());

let accountId = null;

function readLocal() {
  try { return JSON.parse(localStorage.getItem(storageKey)) || {}; } catch { return {}; }
}

// Takes saved settings in. Language and theme are replaced; favorites and progress are added to what is
// already here, so marks made before signing in are kept.
function merge(from) {
  if (from.language === 'pt' || from.language === 'en') settings.language = from.language;
  if (typeof from.theme === 'string') settings.theme = from.theme;
  if (Array.isArray(from.favorites)) settings.favorites = [...new Set([...from.favorites, ...settings.favorites])];
  if (from.progress && typeof from.progress === 'object') settings.progress = { ...from.progress, ...settings.progress };
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
  if (fromDatabase) merge(fromDatabase);
  accountId = user.uid;
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
