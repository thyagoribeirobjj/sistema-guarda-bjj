import { findTechnique, isModule } from './content.js';
import { settings } from './settings.js';
import { state, readHash } from './state.js';
import { t } from './strings.js';
import { moduleView, curriculumView, weekView, treeView, methodView, searchView } from './views.js';
import { accountButton, accountMenu } from './account.js';
import { bottomBar, sidebar, partSwitcher, noteWeekSeen } from './nav.js';
import { openPanel, closePanel, panelOpen, sameControl } from './panel.js';
import { lessonView, showCoachGames } from './lesson.js';
import { coachGames, followCoachGames } from './coach-games.js';
import { privacyView } from './privacy.js';
import { cookieBar, countView } from './analytics.js';
import { kidsView, kidsPage } from './kids.js';
import { tvScreenAsked } from './tv.js';

// The site's page (index.html): which page shows, drawing it (the header, the navigation, the page itself, the cookie
// bar) and following the link in the address. js/app.js starts it.

export const $ = (id) => document.getElementById(id);
const pages = { curriculum: curriculumView, semana: weekView, meu: treeView, kids: kidsView, lesson: lessonView, method: methodView, privacy: privacyView };

export function isPage(view) {
  if (view === 'kids') return kidsPage();
  return isModule(view) || (view in pages && (view !== 'semana' || state.week));
}

// The first page: Kids for the kids class, otherwise This week when there is one, otherwise Curriculum.
// The week often arrives a moment after the page shows. Once the person has done something, the first page stays the
// one they saw (Back to it too): a week arriving later waits in the navigation until they open it.
let keptFirstPage = '';
export function firstPage() {
  if (settings.audience === 'kids' && kidsPage()) return 'kids';
  if (keptFirstPage && isPage(keptFirstPage)) return keptFirstPage;
  return state.week ? 'semana' : 'curriculum';
}

export function keepFirstPage() {
  if (!keptFirstPage) keptFirstPage = state.week ? 'semana' : 'curriculum';
}

// The pages of the adult curriculum, which the kids class doesn't see in the navigation.
export const adultPage = (view) => isModule(view) || view === 'curriculum' || view === 'semana';

// The page is drawn again when the site's data or the account arrive, often while someone is using it. A part whose
// markup is the same is left alone, so an open menu, the keyboard focus and a tap in progress survive.
// Only menus opening and closing change the header and the navigation in between, and an open menu is meant to stay.
// #main is also changed directly (the lesson plan, a status line) and holds form controls: after any of that, its
// next draw is a real one, so what it shows always follows the state.
// A part that does change keeps the keyboard focus on the same control in its new markup, as the technique panel does;
// an open menu with nothing the same keeps it on its first item.
export const drawn = new WeakMap();
const mainEdits = new MutationObserver(() => drawn.delete($('main')));
mainEdits.observe($('main'), { childList: true, subtree: true, characterData: true, attributes: true });
// #main was changed in place to match what it would be drawn as (typing in the game designer, games joining a list):
// it counts as drawn, so the next draw doesn't replace it under the person.
export function adoptMain() {
  mainEdits.takeRecords();
  drawn.set($('main'), String(mainView()));
}

function draw(element, markup) {
  const value = String(markup);
  if (mainEdits.takeRecords().length) drawn.delete($('main'));
  if (drawn.get(element) === value) return;
  drawn.set(element, value);
  const active = document.activeElement;
  const focused = active !== element && element.contains(active);
  const same = focused ? sameControl(active, element) : null;
  element.innerHTML = value;
  mainEdits.takeRecords();
  if (!focused) return;
  same?.()?.focus({ preventScroll: true });
  if (!element.contains(document.activeElement) && element.matches('[role="menu"]:not([hidden])')) element.querySelector('[role^="menuitem"]')?.focus();
}

export function renderHeader() {
  document.documentElement.lang = settings.language === 'pt' ? 'pt-BR' : 'en';
  $('appTitle').textContent = t('title');
  document.querySelectorAll('[data-lang]').forEach((button) => button.setAttribute('aria-pressed', button.dataset.lang === settings.language));
  draw($('account'), accountButton());
  const who = state.account ? state.account.displayName || state.account.email : t('signIn');
  $('account').setAttribute('aria-label', state.online ? `${t('account')}: ${who}` : t('menu'));
  $('account').title = $('account').getAttribute('aria-label');
  draw($('accountMenu'), accountMenu());
  $('search').placeholder = t('search');
  $('search').setAttribute('aria-label', t('search'));
}

export function renderNavigation() {
  $('sidebar').setAttribute('aria-label', t('navigation'));
  draw($('sidebar'), sidebar());
  $('bottomBar').setAttribute('aria-label', t('navigation'));
  draw($('bottomBar'), bottomBar());
  $('switcher').setAttribute('aria-label', t('partsOfFight'));
  const switcher = String(partSwitcher());
  draw($('switcher'), switcher);
  $('switcher').hidden = !switcher;
}

function mainView() {
  if (state.search) return searchView();
  return isModule(state.view) ? moduleView(state.view) : pages[state.view]();
}

// The cookie bar, while there is a choice to make (js/analytics.js).
export function renderCookieBar() {
  const bar = String(cookieBar());
  $('cookieBar').setAttribute('aria-label', t('cookies'));
  draw($('cookieBar'), bar);
  $('cookieBar').hidden = !bar;
}

// The coaches' own games (site/games): read once the lesson builder opens, never on an ordinary visit. They join the
// game lists where they are. An admin always gets them fresh from the database, also when the account turns out to
// be an admin's after this browser's copy was shown.
function followLessonGames() {
  if (state.view !== 'lesson' || state.search || !state.online) return;
  if (coachGames.loaded && (coachGames.fresh || !state.admin)) return;
  followCoachGames({ fresh: state.admin }).then(() => {
    if (state.view !== 'lesson' || state.search) return;
    showCoachGames();
    adoptMain();
  });
}

export function render() {
  noteWeekSeen();
  renderHeader();
  renderNavigation();
  draw($('main'), mainView());
  renderCookieBar();
  if (!state.search) countView(state.view, $('main').querySelector('h2')?.textContent || document.title);
  followLessonGames();
}

export function search(words) {
  state.search = words.trim();
  if (!state.search) $('search').value = '';
  render();
  window.scrollTo(0, 0);
}

export function route() {
  // The TV screen is its own page: another link opens the site itself.
  if (document.documentElement.classList.contains('tv-screen')) {
    if (!tvScreenAsked()) location.reload();
    return;
  }
  const target = readHash();
  const place = target.technique && findTechnique(target.technique);
  if (place) {
    // A shared link to a technique: its part of the fight shows behind it.
    if (!isPage(state.view)) state.view = place.moduleKey;
    render();
    if (state.panel.current !== target.technique) openPanel(target.technique, { remember: false });
    return;
  }
  // The back button, or a link to a page, closes an open technique. History has already moved, so don't move it again.
  if (panelOpen()) closePanel({ fromHistory: true });
  // No hash is the first page.
  const view = target.view || firstPage();
  if (isPage(view)) {
    const newPage = view !== state.view;
    state.view = view;
    if (newPage) {
      state.search = '';
      $('search').value = '';
    }
    render();
    if (newPage) window.scrollTo(0, 0);
    return;
  }
  if (!isPage(state.view)) state.view = firstPage();
  render();
}
