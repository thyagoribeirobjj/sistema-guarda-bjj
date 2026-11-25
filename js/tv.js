import { html } from './html.js';
import { t } from './strings.js';

// Showing the site on a television. Chrome can cast it to a Chromecast, Google TV or Android TV by itself;
// everywhere else the phone mirrors its own screen (AirPlay, Smart View), or the TV's browser opens the address.
// A page opened with ?tv (what casting opens) is drawn large, for reading from across the mats.
const sheet = () => document.getElementById('tvSheet');
const canCast = 'PresentationRequest' in window;
const device = /iPhone|iPad|Macintosh/.test(navigator.userAgent) ? 'apple' : /Android/.test(navigator.userAgent) ? 'android' : 'computer';

// The TV screen of the games on the TV (js/tv-screen.js): its own address, /?tv#screen.
export function tvScreenAsked() {
  return new URLSearchParams(location.search).has('tv') && location.hash === '#screen';
}

export function startTvMode() {
  document.documentElement.classList.toggle('tv', new URLSearchParams(location.search).has('tv'));
}

const bigScreen = () => document.documentElement.classList.contains('tv');

// One way to put the screen on the TV: its name and how, in a sentence or two.
function way(name, how) {
  return html`<section class="tv-way"><h3>${t(name)}</h3><p>${t(how)}</p></section>`;
}

function sheetContent() {
  const address = `${location.host}/${location.hash}`;
  const ways = { apple: way('tvApple', 'tvAppleHow'), android: way('tvAndroid', 'tvAndroidHow'), computer: way('tvComputer', 'tvComputerHow') };
  const order = [device, ...Object.keys(ways).filter((name) => name !== device)];
  return html`<form method="dialog" class="tv-close"><button type="submit" class="close" aria-label="${t('close')}">×</button></form>
    <h2 id="tvTitle">${t('showOnTv')}</h2>
    ${canCast ? html`<button type="button" class="tv-cast" data-tv-cast>${t('tvCast')}</button><p class="note">${t('tvCastHint')}</p>` : ''}
    ${order.map((name) => ways[name])}
    <section class="tv-way"><h3>${t('tvBrowser')}</h3><p>${t('tvBrowserHow')}</p><p class="tv-address">${address}</p>
      <div class="actions"><button type="button" class="chipbtn" data-tv-copy>${t('copyLink')}</button>${
        navigator.share ? html`<button type="button" class="chipbtn" data-tv-send>${t('tvSendLink')}</button>` : ''}</div></section>
    <section class="tv-way"><h3>${t('tvGameClock')}</h3><p>${t('tvGameClockHow')}</p><p class="tv-clock-address">${location.host}/?tv#screen</p>
      <div class="actions"><a class="chipbtn plain" href="/?tv#screen" data-tv-screen>${t('tvOpenClock')}</a></div></section>
    <button type="button" class="chipbtn" data-tv-big aria-pressed="${bigScreen()}">${t('tvBig')}</button>
    <p class="status" id="tvStatus" role="status"></p>`;
}

export function openTvSheet() {
  sheet().innerHTML = sheetContent();
  sheet().showModal();
}

const say = (key) => { document.getElementById('tvStatus').textContent = key ? t(key) : ''; };

// Chrome shows the TVs on the same Wi-Fi; the TV then opens this page itself, drawn large.
export async function castToTv() {
  try {
    await new PresentationRequest([`${location.origin}/?tv${location.hash}`]).start();
    say('tvCasting');
  } catch (error) {
    say(error.name === 'NotFoundError' ? 'tvNoDevice' : '');
  }
}

export async function copyTvAddress() {
  try {
    await navigator.clipboard.writeText(`${location.origin}/${location.hash}`);
    say('linkCopied');
  } catch {
    say('linkCopyFailed');
  }
}

// The phone's share sheet: AirDrop to a Mac or iPad by the TV, a message to whoever runs the TV.
export async function sendTvLink() {
  try {
    await navigator.share({ title: t('title'), url: `${location.origin}/?tv${location.hash}` });
  } catch (error) {
    if (error.name !== 'AbortError') say('linkCopyFailed');
  }
}

export function toggleBigScreen(button) {
  document.documentElement.classList.toggle('tv');
  button.setAttribute('aria-pressed', bigScreen());
}
