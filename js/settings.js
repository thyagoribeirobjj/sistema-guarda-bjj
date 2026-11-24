import { loadUserSettings, saveUserSettings } from './firebase.js';

// Each visitor's language, theme and favorites. Kept in this browser, and in the
// database (users/{uid}) once they sign in, so they follow them to other devices.
const storageKey = 'sg-settings';

export const settings = { language: 'pt', theme: '', favorites: [], ...readLocal() };

let accountId = null;

function readLocal() {
  try { return JSON.parse(localStorage.getItem(storageKey)) || {}; } catch { return {}; }
}

function saved() {
  const { language, theme, favorites } = settings;
  return { language, theme, favorites };
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
  accountId = user ? user.uid : null;
  if (!user) return;
  const fromDatabase = await loadUserSettings(user.uid).catch(() => null);
  if (fromDatabase) Object.assign(settings, fromDatabase);
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
