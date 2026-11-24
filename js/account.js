import { html } from './html.js';
import { currentTheme } from './settings.js';
import { state } from './state.js';
import { t } from './strings.js';

// The header's account button and its menu (sign in or out, Admin, light/dark), and the plain light/dark button.
const $ = (id) => document.getElementById(id);
const themeIcons = {
  dark: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`,
  light: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`,
};
const personIcon = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`;
const adminIcon = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`;
const signOutIcon = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>`;

// Light/dark: a plain button in the header, or an item in the account menu once there is one (always id="theme").
export function themeButton(inMenu) {
  const otherTheme = currentTheme() === 'dark' ? 'light' : 'dark';
  const label = t(otherTheme === 'dark' ? 'darkMode' : 'lightMode');
  const icon = themeIcons[otherTheme];
  return inMenu
    ? html`<button type="button" role="menuitem" id="theme" title="${label}">${icon}${label}</button>`
    : html`<button type="button" class="pill icon-only" id="theme" title="${label}" aria-label="${label}">${icon}</button>`;
}

// The person's Google photo, or the first letter of their name under it in case the photo doesn't load.
export function accountButton() {
  const account = state.account;
  if (!account) return personIcon;
  const name = account.displayName || account.email || '';
  const letter = html`<span aria-hidden="true">${name.charAt(0).toUpperCase()}</span>`;
  return account.photoURL ? html`${letter}<img src="${account.photoURL}" alt="" referrerpolicy="no-referrer">` : letter;
}

export function accountMenu() {
  const account = state.account;
  if (!account) return html`<button type="button" role="menuitem" id="signIn">${personIcon}${t('signInWithGoogle')}</button>${themeButton(true)}`;
  return html`<div class="menu-who" role="none">${account.displayName ? html`<b>${account.displayName}</b>` : ''}<span>${account.email}</span></div>${
    state.admin ? html`<a role="menuitem" id="adminLink" href="admin.html">${adminIcon}${t('admin')}</a>` : ''}${themeButton(true)}<button type="button" role="menuitem" id="signOut">${signOutIcon}${t('signOut')}</button>`;
}

export function openAccountMenu() {
  $('accountMenu').hidden = false;
  $('account').setAttribute('aria-expanded', 'true');
  $('accountMenu').querySelector('[role="menuitem"]')?.focus();
}

export function closeAccountMenu(focusButton = false) {
  if ($('accountMenu').hidden) return;
  $('accountMenu').hidden = true;
  $('account').setAttribute('aria-expanded', 'false');
  if (focusButton) $('account').focus();
}

// Up and down arrows move between the menu's items, as in any menu.
export function moveInMenu(step) {
  const items = [...$('accountMenu').querySelectorAll('[role="menuitem"]')];
  const next = items.indexOf(document.activeElement) + step;
  items[(next + items.length) % items.length]?.focus();
}
