import { html } from './html.js';
import { currentTheme, themes, settings } from './settings.js';
import { belts } from './content.js';
import { state } from './state.js';
import { t } from './strings.js';
import { coachMenu } from './nav.js';
import { beltName } from './views.js';
import { cookiesOffered } from './analytics.js';

// The header's account button and its menu: sign in or out, the coach's tools, the belt and theme pickers, privacy.
// Without Firebase (a local preview) the menu has no sign-in, only the coach's tools and the themes.
const themeName = (theme) => t(`theme${theme.charAt(0).toUpperCase()}${theme.slice(1)}`);
const personIcon = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`;
const signOutIcon = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>`;

const shieldIcon = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/></svg>`;

// One swatch per theme. Each swatch carries its own data-theme, so it shows that theme's colors.
function themePicker() {
  return html`<div class="menu-themes" role="group" aria-label="${t('theme')}"><span class="menu-label">${t('theme')}</span><div class="swatches">${themes.map((theme) => html`<button type="button" role="menuitemradio" class="swatch" data-theme="${theme}" data-theme-choice="${theme}" aria-checked="${currentTheme() === theme}" title="${themeName(theme)}" aria-label="${themeName(theme)}"><i></i></button>`)}</div></div>`;
}

// The student's belt, picked by them. Tapping the one already picked clears it.
function beltPicker() {
  const label = settings.belt ? `${t('myBelt')} · ${beltName(settings.belt)}` : t('myBelt');
  return html`<div class="menu-themes menu-belts" role="group" aria-label="${t('myBelt')}"><span class="menu-label">${label}</span><div class="swatches">${belts.map((belt) => html`<button type="button" role="menuitemradio" class="swatch" data-belt-choice="${belt}" aria-checked="${settings.belt === belt}" title="${beltName(belt)}" aria-label="${beltName(belt)}"><i class="belt" data-belt="${belt}"></i></button>`)}</div></div>`;
}

// The person's Google photo, or the first letter of their name under it in case the photo doesn't load.
export function accountButton() {
  const account = state.account;
  if (!account) return personIcon;
  const name = account.displayName || account.email || '';
  const letter = html`<span aria-hidden="true">${name.charAt(0).toUpperCase()}</span>`;
  return account.photoURL ? html`${letter}<img src="${account.photoURL}" alt="" referrerpolicy="no-referrer">` : letter;
}

const cookieIcon = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9 4 4 0 0 1-5-5 4 4 0 0 1-4-4z"/><path d="M8.5 13.5h.01M12 17h.01M15.5 14.5h.01"/></svg>`;

// "Cookies" reopens the cookie bar; only when the site counts visits at all (js/analytics.js).
const privacyLink = () => html`<a role="menuitem" href="#privacy">${shieldIcon}${t('privacy')}</a>${
  cookiesOffered() ? html`<button type="button" role="menuitem" id="cookieChoice">${cookieIcon}${t('cookies')}</button>` : ''}`;

export function accountMenu() {
  const account = state.account;
  if (!state.online) return html`${coachMenu()}${beltPicker()}${themePicker()}${privacyLink()}`;
  if (!account) {
    return html`<button type="button" role="menuitem" id="signIn">${personIcon}${t('signInWithGoogle')}</button><p class="menu-hint" role="none">${t('signInHint')}</p>${
      privacyLink()}${coachMenu()}${beltPicker()}${themePicker()}`;
  }
  return html`<div class="menu-who" role="none">${account.displayName ? html`<b>${account.displayName}</b>` : ''}<span>${account.email}</span></div>${
    coachMenu()}${beltPicker()}${themePicker()}${privacyLink()}<button type="button" role="menuitem" id="signOut">${signOutIcon}${t('signOut')}</button>`;
}
