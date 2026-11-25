import { loadContent } from './content.js';
import { startFirebase } from './firebase.js';
import { listenToTv, loadCoachGames } from './firebase-tv.js';
import { settings } from './settings.js';
import { newCode, randomLetterIndex, isCode } from './tv-code.js';
import { showSteps, advance } from './game-clock.js';
import { buildShow, needsCoachGames } from './tv-show.js';
import { waitingScreen, gameScreen, tickScreen } from './tv-screen-view.js';

// The TV screen (/?tv#screen): a code to pair with, then the game a coach runs from the phone (js/remote.js).
// The TV only reads: it listens to its own tv/{code} with the database's live updates and never writes. It runs the
// clock itself from the moment a change arrives, so the phone's clock and the TV's need not agree. Nothing on it is
// counted (Google Analytics never starts here) and it asks nothing about cookies.
const codeKey = 'sg-tv-code';
let screen = null;
let code = '';
let session; // undefined until the database answers, then null (no coach yet) or tv/{code}
let show = null;
let steps = [];
let arrivedAt = 0; // performance.now() when the clock in the session arrived
let drawnStep = null; // the step (and state) the whole screen was last drawn for
let lastWhole = null;
let changes = 0;
let audio = null;
let sound = 'off'; // 'off' until a press allows it, 'on', or 'blocked'
let wake = null;

// A TV keeps its code, so a coach's phone that paired once finds it again next class.
function tvCode() {
  try {
    const kept = localStorage.getItem(codeKey);
    if (isCode(kept)) return kept;
    const fresh = newCode(randomLetterIndex);
    localStorage.setItem(codeKey, fresh);
    return fresh;
  } catch {
    return newCode(randomLetterIndex);
  }
}

const position = () => advance(steps, session.clock, (performance.now() - arrivedAt) / 1000);

function drawWhole() {
  if (session?.show && show) {
    const now = position();
    screen.innerHTML = gameScreen({ show, steps, position: now, sound });
    tickScreen(steps, now);
    drawnStep = `${now.step}:${now.running}`;
  } else {
    const waiting = !session ? '' : session.show ? 'missing' : 'paired';
    screen.innerHTML = waitingScreen({ code, name: session?.name, waiting, sound });
    drawnStep = null;
  }
}

// The last three seconds of a step beep short; the start of the next, long. Only once a press allowed sound and
// the coach left the beeps on.
function beep(frequency, seconds) {
  if (sound !== 'on' || !session?.beeps) return;
  try {
    const tone = audio.createOscillator();
    const volume = audio.createGain();
    tone.frequency.value = frequency;
    volume.gain.value = 0.2;
    tone.connect(volume).connect(audio.destination);
    tone.start();
    tone.stop(audio.currentTime + seconds);
  } catch {}
}

function tick() {
  if (!session?.show || !show) return;
  const now = position();
  const whole = Math.ceil(now.left);
  if (now.running && whole !== lastWhole && whole >= 1 && whole <= 3) beep(660, 0.12);
  if (drawnStep !== `${now.step}:${now.running}`) {
    if (session.clock.running && drawnStep && Number(drawnStep.split(':')[0]) !== now.step) beep(990, 0.5);
    drawWhole();
  } else tickScreen(steps, now);
  lastWhole = whole;
}

async function arrived(data) {
  const change = ++changes;
  arrivedAt = performance.now();
  if (data?.language === 'pt' || data?.language === 'en') settings.language = data.language;
  document.documentElement.lang = settings.language === 'pt' ? 'pt-BR' : 'en';
  let coachGames = {};
  if (needsCoachGames(data?.show)) coachGames = await loadCoachGames({ fresh: true }).catch(() => ({}));
  if (change !== changes) return;
  session = data;
  show = buildShow(data?.show, coachGames);
  steps = showSteps(show);
  lastWhole = null;
  drawWhole();
  keepAwake();
}

// Until the database lets this TV listen (it may be offline, or not allow it yet), the code still shows; it tries
// again in a while.
function listen() {
  listenToTv(code, arrived, (error) => {
    console.warn('The TV could not listen for a coach yet:', error.code || error.message);
    setTimeout(listen, 30000);
  });
}

// Browsers play sound only after someone presses something on the page: the TV's remote (OK) or a tap.
async function allowSound() {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    await audio.resume();
    sound = audio.state === 'running' ? 'on' : 'blocked';
  } catch {
    sound = 'blocked';
  }
  drawWhole();
}

async function keepAwake() {
  try {
    if (wake || document.visibilityState !== 'visible' || !navigator.wakeLock) return;
    wake = await navigator.wakeLock.request('screen');
    wake.addEventListener('release', () => { wake = null; });
  } catch {}
}

export async function startTvScreen() {
  // The TV screen draws itself to the screen's size: no large type (?tv's zoom) on top.
  document.documentElement.classList.remove('tv');
  document.documentElement.classList.add('tv-screen');
  screen = document.createElement('div');
  screen.id = 'tvScreen';
  screen.className = 'tvscreen';
  document.body.append(screen);
  code = tvCode();
  drawWhole();
  screen.addEventListener('click', (event) => { if (event.target.closest('[data-tv-sound]')) allowSound(); });
  document.addEventListener('keydown', (event) => { if (sound === 'off' && (event.key === 'Enter' || event.key === ' ')) allowSound(); });
  document.addEventListener('visibilitychange', keepAwake);
  setInterval(tick, 200);
  screen.querySelector('[data-tv-sound]')?.focus();
  await loadContent();
  if (!(await startFirebase({ realtime: true }))) return;
  listen();
}
