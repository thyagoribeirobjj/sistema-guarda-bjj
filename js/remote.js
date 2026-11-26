import { html } from './html.js';
import { settings } from './settings.js';
import { t } from './strings.js';
import { readTv, writeTv, deleteTv, listTvs } from './firebase-tv.js';
import { coachGames, followCoachGames, reloadCoachGames, onCoachGameSaved } from './coach-games.js';
import { gameId, chosenGame, lessonModule } from './plan.js';
import { isCode, typedCode } from './tv-code.js';
import { showSteps, startClock, advance, toggle, nextPart, backPart, addTime, restart, clockText } from './game-clock.js';
import { buildShow, needsCoachGames, newStamp } from './tv-show.js';
import { remotePage, clockPart, phaseLine, toggleLabel } from './remote-view.js';

// The coach's phone as the TV's remote (admin page, "Run on the TV", admin.html#tv; the TV's square opens
// admin.html#tv=<code>). The phone remembers its TVs (sg-tvs, this browser only). Each TV has its own session,
// tv/{code}, so each keeps its own clock, and any admin can control any TV whose code they have.
// Every button reads the session first, since another coach may have changed it; the phone then runs the clock
// itself from its own change, as the TV does from its arrival.
const tvsKey = 'sg-tvs';
const dayMs = 24 * 60 * 60 * 1000;
let slot = null;
let tvs = [];
let current = '';
let session = null;
let knownAt = 0; // performance.now() when session.clock was true
let mine = ''; // the mark of this phone's last change
let choice = '';
let adding = false;
let typed = '';
let status = '';
let ticker = null;
let following = null;
let wake = null;
let awake = false; // whether the phone was last asked to stay awake
let built = { named: undefined, games: null, steps: [] };

export const remoteAsked = () => /^#tv(=|$)/.test(location.hash);

function rememberedTvs() {
  try {
    const kept = JSON.parse(localStorage.getItem(tvsKey));
    return Array.isArray(kept) ? kept.filter((tv) => isCode(tv?.code) && typeof tv.name === 'string') : [];
  } catch {
    return [];
  }
}

function keepTvs() {
  try { localStorage.setItem(tvsKey, JSON.stringify(tvs)); } catch {}
}

// The session's steps, built again only when what it shows, or the coaches' games, change.
function steps() {
  const named = JSON.stringify(session?.show ?? null);
  if (built.named !== named || built.games !== coachGames.games) {
    built = { named, games: coachGames.games, steps: showSteps(buildShow(session?.show, coachGames.games)) };
  }
  return built.steps;
}

const position = () => advance(steps(), session.clock, (performance.now() - knownAt) / 1000);
const freshClock = () => JSON.stringify(session.clock) === JSON.stringify(startClock(steps()));

function view() {
  const defaultName = `${t('tvNameDefault')}${tvs.length ? ` ${tvs.length + 1}` : ''}`;
  const clock = session?.show ? { steps: steps(), position: position(), fresh: freshClock() } : {};
  return { tvs, current, adding, typedCode: typed, defaultName, choice, coachGames: coachGames.games, session, status, ...clock };
}

function draw() {
  slot.innerHTML = remotePage(view());
}

function drawClock() {
  const part = document.getElementById('remoteClock');
  if (part) part.innerHTML = clockPart(view());
  say(status);
}

function say(words) {
  status = words;
  const line = document.getElementById('remoteStatus');
  if (line) line.textContent = words;
}

// Between changes only the numbers move.
function tick() {
  if (!session?.show || !document.getElementById('remoteTime')) return;
  const now = position();
  document.getElementById('remoteTime').textContent = clockText(now.left);
  document.getElementById('remotePhase').textContent = phaseLine(steps(), now);
  document.getElementById('remoteToggle').textContent = toggleLabel(steps(), now, freshClock());
  if (now.running !== awake) keepAwake(now.running);
}

// Someone else's change: its clock was set when it was saved, by the database's time. A coach's game on a session
// changed since the games were read may have been changed too (js/tv-follow.js): they are read again.
async function adopt(stored) {
  if (stored && stored.stamp === mine) return;
  session = stored;
  knownAt = performance.now() - Math.max(0, Date.now() - (stored?.updatedAt ?? Date.now()));
  if (needsCoachGames(stored?.show) && stored.updatedAt > coachGames.readAt) await reloadCoachGames();
}

async function follow() {
  if (!current) return;
  const code = current;
  try {
    const stored = await readTv(code);
    if (code !== current) return;
    const before = JSON.stringify(session);
    const games = coachGames.games;
    await adopt(stored);
    if (JSON.stringify(session) !== before || games !== coachGames.games) drawClock();
  } catch (error) {
    console.error(error);
  }
}

function lessonToShow() {
  const lesson = settings.lesson || {};
  return {
    mod: lessonModule(lesson), dur: lesson.dur === '90' ? '90' : '60',
    items: (Array.isArray(lesson.items) ? lesson.items : []).slice(0, 200).map(String),
    game: gameId(lesson.game) || chosenGame(lesson, coachGames.games)?.id || '',
  };
}

// The chooser shows what the TV shows now.
function choiceFromSession() {
  choice = session?.show?.game || (session?.show?.lesson ? 'lesson' : choice);
}

const named = () => (choice === 'lesson' ? { lesson: lessonToShow() } : { game: choice });

// change(session, steps, position) gives the fields to change. The session is read first; the change shows on the
// phone at once and goes to the TV.
// One change at a time, in the order pressed: two quick presses of Next move two parts, not one.
let sending = Promise.resolve();
function send(change) {
  sending = sending.then(() => sendNow(change));
  return sending;
}

async function sendNow(change) {
  const code = current;
  try {
    await adopt(await readTv(code));
    const base = session || { name: tvs.find((tv) => tv.code === code)?.name || '', show: null, clock: startClock([]), beeps: true };
    const now = session?.show ? position() : base.clock;
    const next = { ...base, language: settings.language, ...change(base, steps(), now), stamp: newStamp() };
    mine = next.stamp;
    session = next;
    knownAt = performance.now();
    status = '';
    drawClock();
    await writeTv(code, next);
  } catch (error) {
    console.error(error);
    say(t('tvSendFailed'));
  }
}

function showChoice() {
  return send(() => {
    const show = named();
    return { show, clock: startClock(showSteps(buildShow(show, coachGames.games))) };
  });
}

const commands = {
  toggle: () => send((base, all, now) => ({ clock: toggle(all, now) })),
  back: () => send((base, all, now) => ({ clock: backPart(all, now) })),
  next: () => send((base, all, now) => ({ clock: nextPart(all, now) })),
  more: () => send((base, all, now) => ({ clock: addTime(all, now, 30) })),
  restart: () => send((base, all) => ({ clock: restart(all) })),
  beeps: () => send((base, all, now) => ({ clock: now, beeps: !base.beeps })),
  end: () => send(() => ({ show: null, clock: startClock([]) })),
  show: showChoice,
};

async function pair(form) {
  const code = typedCode(form.querySelector('#tvCode').value);
  const name = form.querySelector('#tvName').value.trim().slice(0, 40) || t('tvNameDefault');
  if (!isCode(code)) {
    say(t('badTvCode'));
    form.querySelector('#tvCode').focus();
    return;
  }
  tvs = [...tvs.filter((tv) => tv.code !== code), { code, name }];
  keepTvs();
  current = code;
  adding = false;
  typed = '';
  session = null;
  mine = '';
  // A TV another coach already runs keeps its game and clock (the chooser shows it); a new one shows what is chosen here.
  await follow();
  choiceFromSession();
  draw();
  await send((base, all, now) => (base.show ? { name, clock: now } : { name, show: named(), clock: startClock(showSteps(buildShow(named(), coachGames.games))) }));
  document.querySelector('[data-remote="toggle"], #remoteShow')?.focus();
}

async function chooseTv(code) {
  current = code;
  session = null;
  mine = '';
  adding = false;
  draw();
  await follow();
  choiceFromSession();
  draw();
  document.querySelector(`[data-remote-tv="${code}"]`)?.focus();
}

function forgetTv() {
  tvs = tvs.filter((tv) => tv.code !== current);
  keepTvs();
  current = tvs[0]?.code || '';
  session = null;
  draw();
  if (current) chooseTv(current);
}

// While the clock runs, the phone's screen stays on where the browser allows it.
async function keepAwake(running) {
  awake = running;
  try {
    if (!running) {
      const lock = wake;
      wake = null;
      await lock?.release();
    } else if (!wake && navigator.wakeLock && document.visibilityState === 'visible') {
      wake = await navigator.wakeLock.request('screen');
      wake.addEventListener('release', () => { wake = null; });
    }
  } catch {}
}

// Every session untouched for a day is deleted when a coach opens the remote, whichever phone started it (admins can
// list the TVs). A phone still remembers its TV; its next game starts a new session.
async function deleteOldSessions() {
  try {
    const old = (await listTvs()).filter(({ session: stored }) => stored.updatedAt && Date.now() - stored.updatedAt > dayMs);
    await Promise.all(old.map(({ code }) => deleteTv(code).catch((error) => console.error(error))));
  } catch (error) {
    console.error(error);
  }
}

function listen() {
  slot.addEventListener('submit', (event) => {
    event.preventDefault();
    pair(event.target);
  });
  slot.addEventListener('change', (event) => { if (event.target.id === 'remoteShow') choice = event.target.value; });
  slot.addEventListener('input', (event) => { if (event.target.id === 'tvCode') typed = event.target.value; });
  slot.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remote], [data-remote-tv]');
    if (!button) return;
    if (button.dataset.remoteTv) chooseTv(button.dataset.remoteTv);
    else if (button.dataset.remote === 'another') {
      adding = true;
      draw();
      document.getElementById('tvCode').focus();
    } else if (button.dataset.remote === 'forget') forgetTv();
    else commands[button.dataset.remote]?.();
  });
  // A game saved in the designer in another tab of this browser: at once, not at the next look.
  onCoachGameSaved(() => reloadCoachGames().then(follow));
  // Coming back to the page: the other coaches' changes, and the screen kept on again (the browser let it go).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    awake = false;
    follow();
  });
}

export async function openRemote(into) {
  const first = !slot;
  slot = into;
  slot.hidden = false;
  slot.innerHTML = html`<p class="status" role="status">${t('loading')}</p>`;
  if (first) listen();
  tvs = rememberedTvs();
  const fromSquare = typedCode(location.hash.split('=')[1]);
  await Promise.all([followCoachGames({ fresh: true }), deleteOldSessions()]);
  choice = choice || gameId(settings.lesson?.game) || chosenGame(settings.lesson || {}, coachGames.games)?.id || 'lesson';
  if (fromSquare && tvs.some((tv) => tv.code === fromSquare)) current = fromSquare;
  else if (fromSquare) [adding, typed] = [true, fromSquare];
  current ||= tvs[0]?.code || '';
  if (current) await follow();
  choiceFromSession();
  draw();
  clearInterval(ticker);
  clearInterval(following);
  ticker = setInterval(tick, 250);
  following = setInterval(() => { if (document.visibilityState === 'visible') follow(); }, 20000);
  (document.querySelector(typed ? '#tvName' : '#tvCode') || document.querySelector('[data-remote="toggle"], #remoteShow'))?.focus();
}

export function closeRemote(into) {
  clearInterval(ticker);
  clearInterval(following);
  keepAwake(false);
  into.hidden = true;
  into.innerHTML = '';
}
