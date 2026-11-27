import { loadContent } from './content.js';
import { startFirebase, onAccountChange, isAdmin, loadWeek, lastSeen } from './firebase.js';
import { loadMedia } from './firebase-media.js';
import { applyTheme, useAccount } from './settings.js';
import { state } from './state.js';
import { t } from './strings.js';
import { redrawPanel, panelOpen } from './panel.js';
import { awaitAccount } from './notes.js';
import { weekOn, localDate } from './week.js';
import { startAnalytics, onCookieChoiceChange, holdCountingFor, classKnown } from './analytics.js';
import { followKids } from './kids.js';
import { startTvMode, tvScreenAsked } from './tv.js';
import { $, isPage, firstPage, renderHeader, renderCookieBar, render, route } from './page.js';
import './page-events.js';

// Starts the site: the curriculum, then the database and the account, which arrive while the page is used
// (js/page.js draws it, js/actions.js and js/page-events.js answer the person).

async function accountChanged(user) {
  state.account = user;
  holdCountingFor(user);
  const known = await useAccount(user);
  state.admin = user ? await isAdmin(user.email) : false;
  if (!user || known) classKnown();
  await followKids();
  if (!isPage(state.view)) state.view = firstPage();
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
  if (tvScreenAsked()) {
    const { startTvScreen } = await import('./tv-screen.js');
    return startTvScreen();
  }
  try {
    // The kids' challenges only for the kids class (or both): nothing more to load for an adult.
    await Promise.all([loadContent(), followKids()]);
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
  if (state.week && (location.hash === '#semana' || (!location.hash && firstPage() === 'semana'))) state.view = 'semana';
  if (!isPage(state.view)) state.view = firstPage();
  render();
  if (panelOpen()) redrawPanel(null);
}

start();
