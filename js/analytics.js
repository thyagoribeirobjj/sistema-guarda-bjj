import { html } from './html.js';
import { t } from './strings.js';
import { analyticsId, loadAnalytics } from './firebase.js';
import { settings } from './settings.js';

// Visitor statistics (Google Analytics, through Firebase), only in a browser where someone pressed "Accept" on the
// cookie bar. Until then Google Analytics' code is not even loaded, so nothing is sent and no cookie is set.
// The choice belongs to this browser (sg-cookies), not to the account, and is never saved to the database.
// Without a measurement id in the site's Firebase settings there is no bar, no menu item and nothing loaded.
// Only pages are counted: the part of the site and the technique opened, by link and name. Never who is looking.
// Someone who trains in the kids class is never counted, whatever the cookie choice: no bar, nothing loaded.
const choiceKey = 'sg-cookies';
const adsOff = { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };

// A signed-in person may train in the kids class, which only their account says: nothing is counted for them until
// it is known (classKnown()). This browser notes that someone is signed in here, so after a reload that wait starts
// with the very first page; a signed-out visitor is counted as before.
const signedInKey = 'sg-signed-in';

// '' (not chosen yet) | 'accepted' | 'rejected'. Kept here too, so a browser that can't store it still obeys it.
let choice = storedChoice();
let classUnknown = signedInHere();
let barOpen = false;
let analytics = null; // { sdk, instance } once loaded
let loading = null;
let page = null; // the page showing now: { page_location, page_title }
let countedView = '';

function storedChoice() {
  try {
    const stored = localStorage.getItem(choiceKey);
    return stored === 'accepted' || stored === 'rejected' ? stored : '';
  } catch {
    return '';
  }
}

function signedInHere() {
  try { return localStorage.getItem(signedInKey) === 'yes'; } catch { return false; }
}

// Someone signed in (or out): for someone signed in, nothing is counted until classKnown().
export function holdCountingFor(user) {
  classUnknown = Boolean(user);
  try {
    if (user) localStorage.setItem(signedInKey, 'yes');
    else localStorage.removeItem(signedInKey);
  } catch {}
}

// The account's class is known (or the person signed out): counting follows it from now on.
export function classKnown() {
  classUnknown = false;
  followAudience();
}

function storeChoice(value) {
  choice = value;
  try {
    if (value) localStorage.setItem(choiceKey, value);
    else localStorage.removeItem(choiceKey);
  } catch {}
}

export function cookiesOffered() {
  return Boolean(analyticsId()) && settings.audience !== 'kids';
}

// "I train in" changed (here, or with the account arriving): the kids class switches counting off at once and
// deletes its cookies, keeping the cookie choice itself; going back to another class follows that choice again,
// from the next page on (the page being left was a kids' page, so it is not counted).
export function followAudience() {
  if (!countable()) page = null;
  if (!started || !analyticsId()) return;
  if (cookiesOffered()) {
    if (choice === 'accepted') turnOn();
    return;
  }
  barOpen = false;
  turnOff();
}

const countable = () => settings.audience !== 'kids';

// A page opened for the television (?tv, js/tv.js) has no one at it to answer, so it does not ask. With no choice it counts nothing.
const forTv = new URLSearchParams(location.search).has('tv');

export function cookieBarShown() {
  return cookiesOffered() && (barOpen || (!choice && !forTv));
}

// Called once Firebase has started: someone who accepted before is counted again from this page on.
let started = false;
export function startAnalytics() {
  started = true;
  if (cookiesOffered() && choice === 'accepted') turnOn();
}

// Only the latest call carries on, so pressing "Accept" twice while the code loads still counts the page once.
// Loading the code sends nothing; starting it does (its settings, an install id, gtag.js from Tag Manager), so it is
// started only if the choice is still "Accept" once the code has arrived. A "Reject" pressed meanwhile wins.
let turnOnCalls = 0;
let switchedOff = false;
async function turnOn() {
  const call = ++turnOnCalls;
  loading ||= loadAnalytics().then(async (loaded) => ((await loaded.sdk.isSupported()) ? loaded : null))
    .catch((error) => { console.error(error); return null; });
  const loaded = await loading;
  if (!loaded || call !== turnOnCalls || choice !== 'accepted' || !cookiesOffered() || classUnknown) return;
  if (!analytics) {
    // The defaults, before anything is sent: statistics yes, advertising no.
    loaded.sdk.setConsent({ analytics_storage: 'granted', ...adsOff });
    const instance = loaded.sdk.initializeAnalytics(loaded.app, {
      config: { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false },
    });
    analytics = { sdk: loaded.sdk, instance };
  } else if (switchedOff) {
    analytics.sdk.setConsent({ analytics_storage: 'granted', ...adsOff });
    analytics.sdk.setAnalyticsCollectionEnabled(analytics.instance, true);
    switchedOff = false;
  }
  send();
}

function turnOff() {
  if (analytics && !switchedOff) {
    switchedOff = true;
    analytics.sdk.setAnalyticsCollectionEnabled(analytics.instance, false);
    analytics.sdk.setConsent({ analytics_storage: 'denied', ...adsOff });
  }
  deleteAnalyticsCookies();
}

// Google Analytics' cookies are named _ga…, set on this address or the one above it (sistemaguarda.com for www.).
// Its install id (Firebase's own little database in the browser) goes too.
function deleteAnalyticsCookies() {
  const names = document.cookie.split(';').map((cookie) => cookie.split('=')[0].trim()).filter((name) => name.startsWith('_ga'));
  const labels = location.hostname.split('.');
  const domains = ['', ...labels.map((_, at) => labels.slice(at).join('.'))];
  for (const name of names) {
    for (const domain of domains) document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ''}`;
  }
  try { indexedDB.deleteDatabase('firebase-installations-database'); } catch {}
}

export function chooseCookies(value) {
  storeChoice(value);
  barOpen = false;
  if (value === 'accepted') turnOn();
  else turnOff();
}

// Another tab of this browser changed the choice (or cleared everything): this tab follows at once, so a "Reject"
// there stops the counting here too, and its cookies, deleted there, are not set again from here.
let choiceShown = () => {};
export function onCookieChoiceChange(redraw) {
  choiceShown = redraw;
}

addEventListener('storage', (event) => {
  if (event.key !== choiceKey && event.key !== null) return;
  const theirs = storedChoice();
  if (theirs === choice) return;
  choice = theirs;
  if (!started || !cookiesOffered()) return;
  if (choice === 'accepted') turnOn();
  else turnOff();
  choiceShown();
});

// The account menu's "Cookies": the same bar, showing the choice made.
export function reopenCookieChoice() {
  barOpen = true;
}

// "Clear this browser" and "Delete my data" forget the choice too, so the bar asks again; until then nothing is sent.
export function forgetCookieChoice() {
  storeChoice('');
  barOpen = false;
  turnOff();
}

function send() {
  if (analytics && choice === 'accepted' && cookiesOffered() && !classUnknown && page) analytics.sdk.logEvent(analytics.instance, 'page_view', page);
}

// The link is built from the page's own hash, so nothing else in the address (a search, a test's ?emulators=) goes.
const pageLink = (hash) => `${location.origin}${location.pathname}${hash}`;

// A part of the site, counted when it changes (not on every redraw).
export function countView(view, title) {
  const changed = view !== countedView;
  countedView = view;
  page = countable() ? { page_location: pageLink(`#${view}`), page_title: title } : null;
  if (changed) send();
}

export function countTechnique(id, name) {
  page = countable() ? { page_location: pageLink(`#t-${id}`), page_title: name } : null;
  send();
}

export function cookieBar() {
  if (!cookieBarShown()) return '';
  const button = (value, label) => html`<button type="button" class="chipbtn" data-cookies="${value}" aria-pressed="${choice === value}">${t(label)}</button>`;
  const now = choice ? html` <b>${t(choice === 'accepted' ? 'cookiesNowAccepted' : 'cookiesNowRejected')}</b>` : '';
  return html`<p>${t('cookiesAsk')}${now} <a href="#privacy">${t('cookiesMore')}</a></p><div class="cookie-actions">${button('accepted', 'accept')}${button('rejected', 'reject')}</div>`;
}
