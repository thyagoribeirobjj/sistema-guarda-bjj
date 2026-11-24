import { html } from './html.js';
import { content, isModule } from './content.js';
import { settings } from './settings.js';
import { state } from './state.js';
import { t, text } from './strings.js';
import { heart } from './views.js';

// The site's navigation, described once. The bottom bar (phones), the sidebar (desktop) and the account menu's
// Coach section are all drawn from these two lists. A new part of the fight needs nothing here: Curriculum lists
// content.order. A new coach tool is one more entry in `coach` (and its view in `pages`, js/app.js).
const icon = (paths) => html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const calendarIcon = icon(html`<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>`);
const curriculumIcon = icon(html`<path d="M12 3 2 8l10 5 10-5z"/><path d="m2 13 10 5 10-5"/>`);
const searchIcon = icon(html`<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>`);
const lessonIcon = icon(html`<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v3H9zM9 11h6M9 15h6"/>`);
const methodIcon = icon(html`<path d="M4 20v-5M10 20V10M16 20V4M2 20h20"/>`);
const adminIcon = icon(html`<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>`);

const students = [
  { view: 'semana', label: 'week', icon: calendarIcon, shown: () => Boolean(state.week), dot: () => weekIsNew() },
  { view: 'curriculum', label: 'curriculum', icon: curriculumIcon, parts: true },
  { view: 'meu', label: 'myTree', icon: heart(false), count: true },
];
const coach = [
  { view: 'lesson', label: 'lesson', icon: lessonIcon },
  { view: 'method', label: 'method', icon: methodIcon },
  { href: 'admin.html', id: 'adminLink', label: 'admin', icon: adminIcon, shown: () => state.admin },
];

const shown = (items) => items.filter((item) => !item.shown || item.shown());
const hrefOf = (item) => item.href || `#${item.view}`;
const favoritesCount = () => html`<span class="navcount">${settings.favorites.length || ''}</span>`;
const newDot = (item) => (item.dot?.() ? html`<span class="newdot" role="img" aria-label="${t('newClass')}"></span>` : '');

// ---- the "new" dot on This week ----
// This browser remembers the class it last showed on This week. A different class gets the dot until This week is opened.
// The first visit just remembers the class, without a dot.
const weekSeenKey = 'sg-week-seen';

function weekSignature(week) {
  return JSON.stringify([week.weekOf || '', week.title || {}, week.note || {}, week.techniques || []]);
}

function seenWeek() {
  try { return localStorage.getItem(weekSeenKey); } catch { return null; }
}

// Called on every render.
export function noteWeekSeen() {
  if (!state.week) return;
  const looking = state.view === 'semana' && !state.search;
  if (looking || seenWeek() === null) {
    try { localStorage.setItem(weekSeenKey, weekSignature(state.week)); } catch {}
  }
}

function weekIsNew() {
  const seen = seenWeek();
  return Boolean(state.week) && seen !== null && seen !== weekSignature(state.week);
}

// Which entry is "here": a part of the fight belongs to Curriculum. Nothing is, while searching.
function currentView() {
  if (state.search) return '';
  return isModule(state.view) ? 'curriculum' : state.view;
}

const current = (yes) => (yes ? html`aria-current="page"` : '');

export function bottomBar() {
  const here = currentView();
  return html`${shown(students).map((item) => html`<a href="${hrefOf(item)}" ${current(here === item.view)}><span class="nav-icon">${item.icon}${item.count ? favoritesCount() : ''}${newDot(item)}</span><span class="nav-label">${t(item.label)}</span></a>`)}<button type="button" data-search-button><span class="nav-icon">${searchIcon}</span><span class="nav-label">${t('searchShort')}</span></button>`;
}

// ---- desktop sidebar ----

// Folding the parts away is remembered in this browser when it can be; the button works either way.
const partsKey = 'sg-nav-parts';
let partsFolded = (() => {
  try { return localStorage.getItem(partsKey) === 'closed'; } catch { return false; }
})();

export function partsOpen() {
  return !partsFolded;
}

export function toggleParts() {
  partsFolded = !partsFolded;
  try { localStorage.setItem(partsKey, partsFolded ? 'closed' : 'open'); } catch {}
}

function partLinks(asMenu) {
  return content.order.map((key) => html`<a href="#${key}" ${asMenu ? html`role="menuitem"` : ''} ${current(!state.search && state.view === key)}>${text(content.modules[key].title)}</a>`);
}

function sidebarItem(item) {
  const here = currentView() === item.view;
  if (!item.parts) {
    return html`<a class="side-link" href="${hrefOf(item)}" ${current(here)}>${item.icon}<span>${t(item.label)}</span>${item.count ? favoritesCount() : ''}${newDot(item)}</a>`;
  }
  const open = partsOpen();
  // Inside a part, the part is marked; with the list folded away, Curriculum is.
  const marked = here && (state.view === 'curriculum' || !open);
  return html`<div class="side-row"><a class="side-link" href="${hrefOf(item)}" ${current(marked)}>${item.icon}<span>${t(item.label)}</span></a><button type="button" class="side-toggle" id="partsToggle" aria-expanded="${String(open)}" aria-controls="sideParts" aria-label="${t(open ? 'hideParts' : 'showParts')}">▾</button></div>
    <div class="side-parts" id="sideParts" ${open ? '' : 'hidden'}>${partLinks(false)}</div>`;
}

export function sidebar() {
  return html`${shown(students).map(sidebarItem)}<div class="side-coach"><span class="menu-label">${t('coach')}</span>${shown(coach).map(sidebarItem)}</div>
    <a class="side-foot" href="#privacy" ${current(currentView() === 'privacy')}>${t('privacy')}</a>`;
}

// ---- inside a part, on phones: back to Curriculum, and a menu of every part ----

export function partSwitcher() {
  if (!isModule(state.view) || state.search) return '';
  return html`<a class="switch-back" href="#curriculum">‹ ${t('curriculum')}</a><button type="button" class="switch-part" id="partButton" aria-haspopup="menu" aria-expanded="false" aria-controls="partMenu"><span>${text(content.modules[state.view].title)}</span> ▾</button>
    <div class="menu part-menu" id="partMenu" role="menu" aria-label="${t('partsOfFight')}" hidden>${partLinks(true)}</div>`;
}

// The account menu's Coach section: the same entries as the sidebar's.
export function coachMenu() {
  return html`<div class="menu-section" role="group" aria-label="${t('coach')}"><span class="menu-label">${t('coach')}</span>${
    shown(coach).map((item) => html`<a role="menuitem" href="${hrefOf(item)}" ${item.id ? html`id="${item.id}"` : ''} ${current(currentView() === item.view)}>${item.icon}${t(item.label)}</a>`)}</div>`;
}

// ---- menus (the account menu and the part switcher) ----
// A button with aria-haspopup="menu" opens the menu its aria-controls names; one menu is open at a time.

export function openMenu(button) {
  closeMenus();
  const menu = document.getElementById(button.getAttribute('aria-controls'));
  menu.hidden = false;
  // On a short screen (a phone on its side) the menu scrolls inside the screen instead of running off it.
  menu.style.maxHeight = `${window.innerHeight - menu.getBoundingClientRect().top - 12}px`;
  button.setAttribute('aria-expanded', 'true');
  (menu.querySelector('[aria-current]') || menu.querySelector('[role^="menuitem"]'))?.focus();
}

export function closeMenus(focusButton = false) {
  document.querySelectorAll('[aria-haspopup="menu"][aria-expanded="true"]').forEach((button) => {
    document.getElementById(button.getAttribute('aria-controls')).hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (focusButton) button.focus();
  });
}

export function openedMenu() {
  return document.querySelector('[role="menu"]:not([hidden])');
}

// Up and down arrows move between the menu's items, as in any menu.
export function moveInMenu(step) {
  const items = [...openedMenu().querySelectorAll('[role^="menuitem"]')];
  const next = items.indexOf(document.activeElement) + step;
  items[(next + items.length) % items.length]?.focus();
}
