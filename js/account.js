import { html } from './html.js';
import { currentTheme, themes } from './settings.js';
import { state } from './state.js';
import { t } from './strings.js';

// The header's account button and its menu (sign in or out, Admin, the theme picker), and the plain theme button.
const $ = (id) => document.getElementById(id);
const themeIcon = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/></svg>`;
const themeName = (theme) => t(`theme${theme.charAt(0).toUpperCase()}${theme.slice(1)}`);
const personIcon = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`;
const adminIcon = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`;
const signOutIcon = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>`;

// Without an account button (no Firebase) the header keeps one plain button that steps through the themes.
export function themeButton() {
  return html`<button type="button" class="pill icon-only" id="theme" title="${t('nextTheme')}" aria-label="${t('nextTheme')}">${themeIcon}</button>`;
}

// One swatch per theme. Each swatch carries its own data-theme, so it shows that theme's colors.
function themePicker() {
  return html`<div class="menu-themes" role="group" aria-label="${t('theme')}"><span class="menu-label">${t('theme')}</span><div class="swatches">${themes.map((theme) => html`<button type="button" role="menuitemradio" class="swatch" data-theme="${theme}" data-theme-choice="${theme}" aria-checked="${currentTheme() === theme}" title="${themeName(theme)}" aria-label="${themeName(theme)}"><i></i></button>`)}</div></div>`;
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
  if (!account) return html`<button type="button" role="menuitem" id="signIn">${personIcon}${t('signInWithGoogle')}</button>${themePicker()}`;
  return html`<div class="menu-who" role="none">${account.displayName ? html`<b>${account.displayName}</b>` : ''}<span>${account.email}</span></div>${
    state.admin ? html`<a role="menuitem" id="adminLink" href="admin.html">${adminIcon}${t('admin')}</a>` : ''}${themePicker()}<button type="button" role="menuitem" id="signOut">${signOutIcon}${t('signOut')}</button>`;
}

export function openAccountMenu() {
  $('accountMenu').hidden = false;
  $('account').setAttribute('aria-expanded', 'true');
  $('accountMenu').querySelector('[role^="menuitem"]')?.focus();
}

export function closeAccountMenu(focusButton = false) {
  if ($('accountMenu').hidden) return;
  $('accountMenu').hidden = true;
  $('account').setAttribute('aria-expanded', 'false');
  if (focusButton) $('account').focus();
}

// Up and down arrows move between the menu's items, as in any menu.
export function moveInMenu(step) {
  const items = [...$('accountMenu').querySelectorAll('[role^="menuitem"]')];
  const next = items.indexOf(document.activeElement) + step;
  items[(next + items.length) % items.length]?.focus();
}
