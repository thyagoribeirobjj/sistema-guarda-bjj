import { content, loadContent, findTechnique, isModule } from './content.js';
import { startFirebase, onAccountChange, signIn, signOut, isAdmin, loadWeek, loadPastWeeks, loadMedia, lastSeen, saveVideo, saveDiagram, removeDiagram } from './firebase.js';
import { settings, applyTheme, currentTheme, useAccount, changeSettings, toggleFavorite, markProgress } from './settings.js';
import { state, readHash } from './state.js';
import { t, text } from './strings.js';
import { navigation, moduleView, weekView, treeView, methodView, searchView } from './views.js';
import { openPanel, redrawPanel, panelBack, closePanel, panelOpen, forgetDiagram } from './panel.js';
import { youtubeId, videoPlayer, shrinkImage } from './media.js';
import { lessonView, planText, changeLesson, redrawPlan } from './lesson.js';

const $ = (id) => document.getElementById(id);
const tabs = { semana: weekView, meu: treeView, lesson: lessonView, method: methodView };
const themeIcons = {
  dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
};

function isTab(view) {
  return isModule(view) || (view in tabs && (view !== 'semana' || state.week));
}

function renderHeader() {
  document.documentElement.lang = settings.language === 'pt' ? 'pt-BR' : 'en';
  $('appTitle').textContent = t('title');
  document.querySelectorAll('[data-lang]').forEach((button) => button.setAttribute('aria-pressed', button.dataset.lang === settings.language));
  const otherTheme = currentTheme() === 'dark' ? 'light' : 'dark';
  $('theme').innerHTML = themeIcons[otherTheme];
  $('theme').title = t(otherTheme === 'dark' ? 'darkMode' : 'lightMode');
  $('theme').setAttribute('aria-label', $('theme').title);
  $('adminLink').hidden = !state.admin;
  $('adminLink').textContent = t('admin');
  $('account').hidden = !state.online;
  $('account').textContent = state.account ? t('signOut') : t('signIn');
  $('account').title = state.account ? state.account.email : t('signInWithGoogle');
  $('search').placeholder = t('search');
  $('search').setAttribute('aria-label', t('search'));
  $('nav').setAttribute('aria-label', t('modules'));
  $('nav').innerHTML = navigation();
  $('nav').querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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
  if (isTab(target.view)) {
    state.view = target.view;
    state.search = '';
    $('search').value = '';
    if (panelOpen()) closePanel();
    render();
    window.scrollTo(0, 0);
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
  ['#panelClose, #scrim', closePanel],
  ['#theme', () => { changeSettings({ theme: currentTheme() === 'dark' ? 'light' : 'dark' }); renderHeader(); }],
  ['#account', () => (state.account ? signOut() : signIn().catch(() => alert(t('signInFailed'))))],
  ['#copyPlan', () => navigator.clipboard.writeText(planText()).then(
    () => { $('copyStatus').textContent = t('copied'); },
    () => { $('copyStatus').textContent = t('copyFailed'); },
  )],
];

document.addEventListener('click', (event) => {
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
  if (event.key !== 'Escape') return;
  if (panelOpen()) closePanel();
  else if (state.search) search('');
});

window.addEventListener('hashchange', route);

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
