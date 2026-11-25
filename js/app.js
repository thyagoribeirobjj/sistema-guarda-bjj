import { loadContent, findTechnique, isModule } from './content.js';
import { startFirebase, onAccountChange, signIn, signOut, isAdmin, loadWeek, loadPastWeeks, loadMedia, lastSeen, saveVideo, saveDiagram, removeDiagram, saveMinBelt } from './firebase.js';
import { settings, applyTheme, useAccount, changeSettings, toggleFavorite, markProgress } from './settings.js';
import { state, readHash } from './state.js';
import { t, text } from './strings.js';
import { moduleView, curriculumView, weekView, treeView, methodView, searchView } from './views.js';
import { accountButton, accountMenu } from './account.js';
import { bottomBar, sidebar, partSwitcher, toggleParts, openMenu, closeMenus, openedMenu, moveInMenu, noteWeekSeen } from './nav.js';
import { openPanel, redrawPanel, panelBack, closePanel, panelOpen, forgetDiagram, stepPanel, techniquesIn, typing, sameControl, pickWhereGroup } from './panel.js';
import { changeNote, sendWaiting, awaitAccount } from './notes.js';
import { youtubeId, videoPlayer, shrinkImage } from './media.js';
import { lessonView, planText, changeLesson, redrawPlan } from './lesson.js';
import { privacyView, privacyActions } from './privacy.js';
import { weekOn, localDate } from './week.js';
import { cookieBar, chooseCookies, reopenCookieChoice, startAnalytics, countView, onCookieChoiceChange } from './analytics.js';
import { startTvMode, openTvSheet, castToTv, copyTvAddress, sendTvLink, toggleBigScreen } from './tv.js';

const $ = (id) => document.getElementById(id);
const pages = { curriculum: curriculumView, semana: weekView, meu: treeView, lesson: lessonView, method: methodView, privacy: privacyView };

function isPage(view) {
  return isModule(view) || (view in pages && (view !== 'semana' || state.week));
}

// The page is drawn again when the site's data or the account arrive, often while someone is using it. A part whose
// markup is the same is left alone, so an open menu, the keyboard focus and a tap in progress survive.
// Only menus opening and closing change the header and the navigation in between, and an open menu is meant to stay.
// #main is also changed directly (the lesson plan, a status line) and holds form controls: after any of that, its
// next draw is a real one, so what it shows always follows the state.
// A part that does change keeps the keyboard focus on the same control in its new markup, as the technique panel does;
// an open menu with nothing the same keeps it on its first item.
const drawn = new WeakMap();
const mainEdits = new MutationObserver(() => drawn.delete($('main')));
mainEdits.observe($('main'), { childList: true, subtree: true, characterData: true, attributes: true });
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

function renderHeader() {
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

function renderNavigation() {
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
function renderCookieBar() {
  const bar = String(cookieBar());
  $('cookieBar').setAttribute('aria-label', t('cookies'));
  draw($('cookieBar'), bar);
  $('cookieBar').hidden = !bar;
}

function render() {
  noteWeekSeen();
  renderHeader();
  renderNavigation();
  draw($('main'), mainView());
  renderCookieBar();
  if (!state.search) countView(state.view, $('main').querySelector('h2')?.textContent || document.title);
}

function search(words) {
  state.search = words.trim();
  if (!state.search) $('search').value = '';
  render();
  window.scrollTo(0, 0);
}

function route() {
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
  // No hash is the first page: This week when there is one, otherwise Curriculum.
  const view = target.view || (state.week ? 'semana' : 'curriculum');
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
  if (!isPage(state.view)) state.view = state.week ? 'semana' : 'curriculum';
  render();
}

// Admin: attach or remove a move's video or diagram, then redraw so everyone's view matches.
async function changeMedia(id, field, save) {
  const status = $('mediaStatus');
  status.textContent = t('saving');
  try {
    const value = await save();
    state.media[id] = { ...state.media[id], [field]: value };
    if (!value) delete state.media[id][field];
    forgetDiagram(id);
    render();
    redrawPanel();
    $('mediaStatus').textContent = t('saved');
  } catch (error) {
    console.error(error);
    status.textContent = error.message === 'bad link' ? t('badVideoLink') : t('saveFailed');
  }
}

// The phone's share sheet where there is one; otherwise, or when it fails, the link is copied.
async function shareTechnique(id) {
  const url = `${location.origin}/#t-${id}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: text(findTechnique(id).technique.n), url });
      return;
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error(error);
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    $('shareStatus').textContent = t('linkCopied');
  } catch {
    $('shareStatus').textContent = t('linkCopyFailed');
  }
}

// Past weeks are read once, when asked for: null until then, [] when there are none.
async function showPastWeeks() {
  if (state.pastWeeks || state.pastWeeksStatus === 'loading') return;
  state.pastWeeksStatus = 'loading';
  render();
  try {
    state.pastWeeks = await loadPastWeeks();
    state.pastWeeksStatus = '';
  } catch (error) {
    console.error(error);
    state.pastWeeksStatus = 'failed';
  }
  render();
}

function moveFavorite(index, step) {
  const favorites = [...settings.favorites];
  const other = index + step;
  if (!favorites[index] || !favorites[other]) return;
  [favorites[index], favorites[other]] = [favorites[other], favorites[index]];
  changeSettings({ favorites });
}

const clickActions = [
  ['[data-lang]', (el) => { changeSettings({ language: el.dataset.lang }); render(); redrawPanel(); }],
  ['[data-favorite]', (el) => { toggleFavorite(el.dataset.favorite); render(); redrawPanel(); }],
  ['[data-progress]', (el) => {
    const [id, mark] = el.dataset.progress.split(':');
    markProgress(id, mark);
    render();
    redrawPanel(`[data-progress="${el.dataset.progress}"]`);
  }],
  ['[data-unfavorite]', (el) => { changeSettings({ favorites: settings.favorites.filter((id) => id !== el.dataset.unfavorite) }); render(); }],
  ['[data-move]', (el) => { const [index, step] = el.dataset.move.split(':').map(Number); moveFavorite(index, step); render(); }],
  ['[data-tree-order]', (el) => { state.treeOrder = el.dataset.treeOrder; render(); }],
  ['[data-empty-tree]', (el) => {
    if (el.dataset.emptyTree === 'yes') changeSettings({ favorites: [] });
    state.confirmEmptyTree = el.dataset.emptyTree === 'ask';
    render();
  }],
  ['[data-past-weeks]', showPastWeeks],
  ['[data-share]', (el) => shareTechnique(el.dataset.share)],
  ['[data-tv]', () => { closeMenus(); openTvSheet(); }],
  ['[data-tv-cast]', castToTv],
  ['[data-tv-copy]', copyTvAddress],
  ['[data-tv-send]', sendTvLink],
  ['[data-tv-big]', toggleBigScreen],
  ['[data-step]', (el) => stepPanel(Number(el.dataset.step))],
  ['[data-where-group]', (el) => pickWhereGroup(el.dataset.whereGroup)],
  // A technique opened from the page moves, with next and previous, through the others there (or in its week).
  ['[data-technique]', (el) => openPanel(el.dataset.technique, el.closest('#panel') ? {} : { list: techniquesIn(el.closest('[data-list]') || $('main')) })],
  ['[data-belt-filter]', (el) => {
    state.beltFilter = el.dataset.beltFilter;
    render();
    $('main').querySelector(`[data-belt-filter="${el.dataset.beltFilter}"]`)?.focus();
  }],
  ['[role="menu"] a', () => { closeMenus(); if (state.search) search(''); }],
  ['nav a, .results a, a.part-card', () => { if (state.search) search(''); }],
  ['[data-search-button]', () => { window.scrollTo(0, 0); $('search').focus(); }],
  ['#partsToggle', () => { toggleParts(); renderNavigation(); $('partsToggle').focus(); }],
  ['[data-play]', (el) => { el.outerHTML = videoPlayer(el.dataset.play); }],
  ['[data-save-video]', (el) => changeMedia(el.dataset.saveVideo, 'video', async () => {
    const videoId = youtubeId($('videoLink').value);
    if (!videoId) throw new Error('bad link');
    await saveVideo(el.dataset.saveVideo, videoId);
    return videoId;
  })],
  ['[data-remove-video]', (el) => changeMedia(el.dataset.removeVideo, 'video', async () => { await saveVideo(el.dataset.removeVideo, null); return null; })],
  ['[data-remove-diagram]', (el) => changeMedia(el.dataset.removeDiagram, 'diagram', async () => { await removeDiagram(el.dataset.removeDiagram); return null; })],
  ['#panelBack', panelBack],
  ['#panelClose, #scrim', () => closePanel()],
  // The menu stays open so several themes can be tried.
  ['[data-theme-choice]', (el) => {
    changeSettings({ theme: el.dataset.themeChoice });
    renderHeader();
    $('accountMenu').querySelector(`[data-theme-choice="${el.dataset.themeChoice}"]`)?.focus();
  }],
  ['[data-belt-choice]', (el) => {
    const belt = el.dataset.beltChoice;
    changeSettings({ belt: settings.belt === belt ? '' : belt });
    state.beltFilter = '';
    render();
    redrawPanel('#panelClose');
    if (!$('accountMenu').hidden) $('accountMenu').querySelector(`[data-belt-choice="${belt}"]`)?.focus();
  }],
  ['[aria-haspopup="menu"]', (el) => (el.getAttribute('aria-expanded') === 'true' ? closeMenus() : openMenu(el))],
  ['#signIn', () => { closeMenus(); signIn().catch(() => alert(t('signInFailed'))); }],
  // A note typed just now is saved to the account before signing out clears it from this device.
  ['#signOut', async () => { closeMenus(true); await sendWaiting(); signOut(); }],
  ...privacyActions(() => render()),
  ['[data-cookies]', (el) => { chooseCookies(el.dataset.cookies); renderCookieBar(); }],
  ['#cookieChoice', () => {
    closeMenus();
    reopenCookieChoice();
    renderCookieBar();
    $('cookieBar').querySelector('[aria-pressed="true"], button')?.focus();
  }],
  ['#copyPlan', () => navigator.clipboard.writeText(planText()).then(
    () => { $('copyStatus').textContent = t('copied'); },
    () => { $('copyStatus').textContent = t('copyFailed'); },
  )],
];

// A tap outside an open menu only closes it; it doesn't also press what is under the finger.
// Noted on pointerdown, because the focus leaving the menu closes it before the click arrives.
let closingTap = false;
const outsideMenus = (target) => !target.closest('[role="menu"], [aria-haspopup="menu"]');
document.addEventListener('pointerdown', (event) => { closingTap = Boolean(openedMenu()) && outsideMenus(event.target); });
document.addEventListener('pointercancel', () => { closingTap = false; });

document.addEventListener('click', (event) => {
  const dismiss = closingTap;
  closingTap = false;
  // detail is 0 for a click made with the keyboard.
  if (dismiss && event.detail) {
    closeMenus();
    event.preventDefault();
    return;
  }
  if (outsideMenus(event.target)) closeMenus();
  for (const [selector, action] of clickActions) {
    const element = event.target.closest(selector);
    if (element) { action(element); return; }
  }
});

document.addEventListener('change', (event) => {
  if ($('main').contains(event.target)) drawn.delete($('main'));
  const id = event.target.dataset?.diagramFile;
  if (id && event.target.files[0]) {
    changeMedia(id, 'diagram', async () => { await saveDiagram(id, await shrinkImage(event.target.files[0])); return true; });
    return;
  }
  const minBeltId = event.target.dataset?.minBelt;
  if (minBeltId) {
    changeMedia(minBeltId, 'minBelt', async () => { await saveMinBelt(minBeltId, event.target.value); return event.target.value || null; });
    return;
  }
  const redraw = changeLesson(event.target);
  if (redraw === true) render();
  else if (redraw === false) redrawPlan();
});

document.addEventListener('input', (event) => {
  if (event.target.id === 'search') search(event.target.value);
  if (event.target.dataset.note) changeNote(event.target.dataset.note, event.target.value);
});

// The notes were replaced other than by typing here (another tab, forgotten): an open note box shows them now.
document.addEventListener('notes-changed', () => redrawPanel(null));

document.addEventListener('note-not-saved', (event) => {
  const box = $('noteBox');
  if (box?.dataset.note === event.detail) $('noteStatus').textContent = t('noteNotSaved');
});

document.addEventListener('keydown', (event) => {
  // The TV sheet is a <dialog>: Escape closes it by itself, and nothing behind it.
  if ($('tvSheet').open) return;
  const menuOpen = Boolean(openedMenu());
  if (menuOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    event.preventDefault();
    moveInMenu(event.key === 'ArrowDown' ? 1 : -1);
    return;
  }
  if (!menuOpen && panelOpen() && (event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !typing(event.target)) {
    event.preventDefault();
    stepPanel(event.key === 'ArrowRight' ? 1 : -1);
    return;
  }
  if (event.key !== 'Escape') return;
  if (menuOpen) closeMenus(true);
  else if (panelOpen()) closePanel();
  else if (state.search) search('');
});

// Tabbing out of a menu closes it.
document.addEventListener('focusout', (event) => {
  const menu = event.target.closest?.('[role="menu"]');
  const to = event.relatedTarget;
  if (menu && to && !menu.contains(to) && to.getAttribute('aria-controls') !== menu.id) closeMenus();
});
window.addEventListener('hashchange', route);
// A Google photo that doesn't load leaves the letter under it showing.
document.addEventListener('error', (event) => { if (event.target.matches?.('#account img')) event.target.remove(); }, true);

async function accountChanged(user) {
  state.account = user;
  await useAccount(user);
  state.admin = user ? await isAdmin(user.email) : false;
  render();
  redrawPanel(null);
}

// site/week as stored: a prepared next week becomes this week on its start date, by this browser's own date.
function useWeek(stored) {
  ({ week: state.week, previous: state.weekBefore } = weekOn(stored, localDate()));
}

async function start() {
  applyTheme();
  startTvMode();
  try {
    await loadContent();
  } catch (error) {
    $('main').innerHTML = `<p class="intro" role="alert">${t('loadFailed')}</p>`;
    throw error;
  }
  // The last copy this browser saw shows at once; a newer one replaces it below.
  useWeek(lastSeen('week'));
  state.media = lastSeen('media')?.techniques || {};
  awaitAccount(true);
  route();

  state.online = await startFirebase();
  if (!state.online) {
    awaitAccount(false);
    redrawPanel(null);
    return;
  }
  onCookieChoiceChange(renderCookieBar);
  startAnalytics();
  renderHeader();
  renderCookieBar();
  onAccountChange(accountChanged);
  const [week, media] = await Promise.all([loadWeek().catch(() => null), loadMedia()]);
  useWeek(week);
  state.media = media;
  if (state.week && (!location.hash || location.hash === '#semana')) state.view = 'semana';
  if (!isPage(state.view)) state.view = 'curriculum';
  render();
  if (panelOpen()) redrawPanel(null);
}

start();
