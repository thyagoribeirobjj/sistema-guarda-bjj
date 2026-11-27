import { findTechnique, belts, kidsBelts } from './content.js';
import { signIn, loadPastWeeks } from './firebase.js';
import { saveVideo, removeDiagram } from './firebase-media.js';
import { settings, changeSettings, toggleFavorite, markProgress } from './settings.js';
import { state } from './state.js';
import { t, text } from './strings.js';
import { toggleParts, openMenu, closeMenus } from './nav.js';
import { openPanel, redrawPanel, panelBack, closePanel, forgetDiagram, stepPanel, techniquesIn, pickWhereGroup } from './panel.js';
import { sendWaiting } from './notes.js';
import { youtubeId, videoPlayer } from './media.js';
import { planText, remember as rememberLesson } from './lesson.js';
import { designerActions } from './designer.js';
import { privacyActions } from './privacy.js';
import { closeDeletionNote, signOutOnPurpose } from './delete-data.js';
import { chooseCookies, reopenCookieChoice, followAudience } from './analytics.js';
import { kidsActions, followKids } from './kids.js';
import { openTvSheet, castToTv, copyTvAddress, sendTvLink, toggleBigScreen } from './tv.js';
import { $, isPage, firstPage, adultPage, renderHeader, renderNavigation, renderCookieBar, render, search } from './page.js';

// What each button and link on the site's page does (clickActions, for the click listener in js/page-events.js),
// with the admin's video and diagram changes (changeMedia).

// "I train in": the belt picker follows (a belt from the other track is cleared), visits stop or start being counted,
// and the page follows: the kids class opens Kids, and a page the new class doesn't have gives way to the first page.
async function chooseAudience(audience) {
  const track = audience === 'kids' ? kidsBelts : belts;
  changeSettings({ audience, belt: track.includes(settings.belt) ? settings.belt : '' });
  state.beltFilter = '';
  followAudience();
  await followKids();
  const leave = audience === 'kids' ? adultPage(state.view) : !isPage(state.view);
  const addressed = location.hash.slice(1);
  if (leave && !state.search && addressed !== firstPage()) location.hash = firstPage();
  else {
    // The address already names the page to show (a shared link to #kids, say): no hashchange comes, so it shows now.
    if (!state.search && isPage(addressed)) state.view = addressed;
    render();
  }
  $('accountMenu').querySelector(`[data-audience-choice="${audience}"]`)?.focus();
}

// Admin: attach or remove a move's video or diagram, then redraw so everyone's view matches.
export async function changeMedia(id, field, save) {
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

export const clickActions = [
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
  ['[data-audience-choice]', (el) => chooseAudience(el.dataset.audienceChoice)],
  ...kidsActions(() => render()),
  ...designerActions(() => render()),
  // The TV remote runs the plan shown here, so it is kept first.
  ['[data-lesson-to-tv]', rememberLesson],
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
  ['#signOut', async () => { closeMenus(true); await sendWaiting(); signOutOnPurpose(); }],
  ...privacyActions(() => render()),
  ['#closeDeletionNote', () => { closeDeletionNote(); renderCookieBar(); }],
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
