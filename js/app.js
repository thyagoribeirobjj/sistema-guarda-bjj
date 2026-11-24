import { content, loadContent, findTechnique, isModule } from './content.js';
import { startFirebase, onAccountChange, signIn, signOut, isAdmin, loadWeek, loadPastWeeks, loadMedia, lastSeen, saveVideo, saveDiagram, removeDiagram } from './firebase.js';
import { settings, applyTheme, currentTheme, useAccount, changeSettings, toggleFavorite, markProgress } from './settings.js';
import { state, readHash } from './state.js';
import { t, text } from './strings.js';
import { navigation, moduleView, weekView, treeView, methodView, searchView } from './views.js';
import { themeButton, accountButton, accountMenu, openAccountMenu, closeAccountMenu, moveInMenu } from './account.js';
import { openPanel, redrawPanel, panelBack, closePanel, panelOpen, forgetDiagram } from './panel.js';
import { youtubeId, videoPlayer, shrinkImage } from './media.js';
import { lessonView, planText, changeLesson, redrawPlan } from './lesson.js';

const $ = (id) => document.getElementById(id);
const tabs = { semana: weekView, meu: treeView, lesson: lessonView, method: methodView };

function isTab(view) {
  return isModule(view) || (view in tabs && (view !== 'semana' || state.week));
}

function renderHeader() {
  document.documentElement.lang = settings.language === 'pt' ? 'pt-BR' : 'en';
  $('appTitle').textContent = t('title');
  document.querySelectorAll('[data-lang]').forEach((button) => button.setAttribute('aria-pressed', button.dataset.lang === settings.language));
  $('headerTheme').innerHTML = state.online ? '' : themeButton(false);
  $('account').hidden = !state.online;
  $('account').innerHTML = accountButton();
  const who = state.account ? state.account.displayName || state.account.email : t('signIn');
  $('account').setAttribute('aria-label', `${t('account')}: ${who}`);
  $('account').title = $('account').getAttribute('aria-label');
  $('accountMenu').innerHTML = accountMenu();
  $('search').placeholder = t('search');
  $('search').setAttribute('aria-label', t('search'));
  $('nav').setAttribute('aria-label', t('modules'));
  $('nav').innerHTML = navigation();
  showCurrentTab();
}

// The tab strip scrolls sideways on phones: keep the current tab in view and fade the edges that hide more tabs.
function showCurrentTab() {
  const nav = $('nav');
  const current = nav.querySelector('[aria-current]');
  if (current) {
    const navBox = nav.getBoundingClientRect();
    const tabBox = current.getBoundingClientRect();
    if (tabBox.left < navBox.left || tabBox.right > navBox.right) nav.scrollLeft += tabBox.left - navBox.left - (navBox.width - tabBox.width) / 2;
  }
  fadeHiddenTabs();
}

function fadeHiddenTabs() {
  const nav = $('nav');
  nav.classList.toggle('more-before', nav.scrollLeft > 2);
  nav.classList.toggle('more-after', nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 2);
}

function mainView() {
  if (state.search) return searchView();
  return isModule(state.view) ? moduleView(state.view) : tabs[state.view]();
}

function render() {
  renderHeader();
  $('main').innerHTML = mainView();
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
    if (!isModule(state.view) && state.view !== 'meu' && state.view !== 'semana') state.view = place.moduleKey;
    render();
    if (state.panel.current !== target.technique) openPanel(target.technique, { remember: false });
    return;
  }
  // The back button, or a link to a tab, closes an open technique. History has already moved, so don't move it again.
  if (panelOpen()) closePanel({ fromHistory: true });
  if (isTab(target.view)) {
    const newTab = target.view !== state.view;
    state.view = target.view;
    if (newTab) {
      state.search = '';
      $('search').value = '';
    }
    render();
    if (newTab) window.scrollTo(0, 0);
    return;
  }
  if (!isTab(state.view)) state.view = state.week ? 'semana' : content.order[0];
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

// The phone's share sheet where there is one; otherwise the link is copied.
async function shareTechnique(id) {
  const url = `${location.origin}/#t-${id}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: text(findTechnique(id).technique.n), url });
    } catch (error) {
      if (error.name !== 'AbortError') console.error(error);
    }
    return;
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
  ['[data-technique]', (el) => openPanel(el.dataset.technique)],
  ['nav a, .results a', () => { if (state.search) search(''); }],
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
  ['#theme', () => {
    const fromMenu = !$('accountMenu').hidden;
    closeAccountMenu();
    changeSettings({ theme: currentTheme() === 'dark' ? 'light' : 'dark' });
    renderHeader();
    if (fromMenu) $('account').focus();
  }],
  ['#account', () => ($('accountMenu').hidden ? openAccountMenu() : closeAccountMenu())],
  ['#signIn', () => { closeAccountMenu(); signIn().catch(() => alert(t('signInFailed'))); }],
  ['#signOut', () => { closeAccountMenu(true); signOut(); }],
  ['#adminLink', () => closeAccountMenu()],
  ['#copyPlan', () => navigator.clipboard.writeText(planText()).then(
    () => { $('copyStatus').textContent = t('copied'); },
    () => { $('copyStatus').textContent = t('copyFailed'); },
  )],
];

document.addEventListener('click', (event) => {
  if (!event.target.closest('#accountMenu, #account')) closeAccountMenu();
  for (const [selector, action] of clickActions) {
    const element = event.target.closest(selector);
    if (element) { action(element); return; }
  }
});

document.addEventListener('change', (event) => {
  const id = event.target.dataset?.diagramFile;
  if (id && event.target.files[0]) {
    changeMedia(id, 'diagram', async () => { await saveDiagram(id, await shrinkImage(event.target.files[0])); return true; });
    return;
  }
  const redraw = changeLesson(event.target);
  if (redraw === true) render();
  else if (redraw === false) redrawPlan();
});

document.addEventListener('input', (event) => {
  if (event.target.id === 'search') search(event.target.value);
});

document.addEventListener('keydown', (event) => {
  const menuOpen = !$('accountMenu').hidden;
  if (menuOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    event.preventDefault();
    moveInMenu(event.key === 'ArrowDown' ? 1 : -1);
    return;
  }
  if (event.key !== 'Escape') return;
  if (menuOpen) closeAccountMenu(true);
  else if (panelOpen()) closePanel();
  else if (state.search) search('');
});

window.addEventListener('hashchange', route);
// A Google photo that doesn't load leaves the letter under it showing.
document.addEventListener('error', (event) => { if (event.target.matches?.('#account img')) event.target.remove(); }, true);
$('nav').addEventListener('scroll', fadeHiddenTabs, { passive: true });
window.addEventListener('resize', fadeHiddenTabs);

async function accountChanged(user) {
  state.account = user;
  await useAccount(user);
  state.admin = user ? await isAdmin(user.email) : false;
  render();
  redrawPanel();
}

async function start() {
  applyTheme();
  try {
    await loadContent();
  } catch (error) {
    $('main').innerHTML = `<p class="intro" role="alert">${t('loadFailed')}</p>`;
    throw error;
  }
  // The last copy this browser saw shows at once; a newer one replaces it below.
  state.week = lastSeen('week');
  state.media = lastSeen('media')?.techniques || {};
  route();

  state.online = await startFirebase();
  if (!state.online) return;
  renderHeader();
  onAccountChange(accountChanged);
  [state.week, state.media] = await Promise.all([loadWeek().catch(() => null), loadMedia()]);
  if (state.week && (!location.hash || location.hash === '#semana')) state.view = 'semana';
  if (!isTab(state.view)) state.view = content.order[0];
  render();
  if (panelOpen()) redrawPanel('#panelClose');
}

start();
