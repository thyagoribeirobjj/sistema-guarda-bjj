import { content, loadContent, findTechnique, isModule } from './content.js';
import { startFirebase, onAccountChange, signIn, signOut, isAdmin, loadWeek } from './firebase.js';
import { settings, applyTheme, currentTheme, useAccount, changeSettings, toggleFavorite } from './settings.js';
import { state, readHash } from './state.js';
import { t } from './strings.js';
import { navigation, moduleView, weekView, treeView, methodView } from './views.js';
import { openPanel, redrawPanel, panelBack, closePanel, panelOpen } from './panel.js';
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
  $('nav').setAttribute('aria-label', t('modules'));
  $('nav').innerHTML = navigation();
  $('nav').querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function render() {
  renderHeader();
  $('main').innerHTML = isModule(state.view) ? moduleView(state.view) : tabs[state.view]();
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
    if (panelOpen()) closePanel();
    render();
    window.scrollTo(0, 0);
    return;
  }
  if (!isTab(state.view)) state.view = state.week ? 'semana' : content.order[0];
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
  ['[data-unfavorite]', (el) => { changeSettings({ favorites: settings.favorites.filter((id) => id !== el.dataset.unfavorite) }); render(); }],
  ['[data-move]', (el) => { const [index, step] = el.dataset.move.split(':').map(Number); moveFavorite(index, step); render(); }],
  ['[data-tree-order]', (el) => { state.treeOrder = el.dataset.treeOrder; render(); }],
  ['[data-empty-tree]', (el) => {
    if (el.dataset.emptyTree === 'yes') changeSettings({ favorites: [] });
    state.confirmEmptyTree = el.dataset.emptyTree === 'ask';
    render();
  }],
  ['[data-technique]', (el) => openPanel(el.dataset.technique)],
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
  const redraw = changeLesson(event.target);
  if (redraw === true) render();
  else if (redraw === false) redrawPlan();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && panelOpen()) closePanel();
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
  route();

  state.online = await startFirebase();
  if (!state.online) return;
  renderHeader();
  onAccountChange(accountChanged);
  state.week = await loadWeek().catch(() => null);
  if (state.week && (!location.hash || location.hash === '#semana')) state.view = 'semana';
  render();
}

start();
