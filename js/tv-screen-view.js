import { html } from './html.js';
import { t, text } from './strings.js';
import { qrModules } from './qr.js';
import { clockText, isOver, stepLength, timeLeft, rolesSwitched } from './game-clock.js';

// The TV screen's markup (js/tv-screen.js runs it): the pairing screen, and the game as the mock-up shows it.
// Every size is a share of the screen (--u in css/tv.css), so it fills any 16:9 TV and reads from across the room.

// The pairing square: a link to the coach's remote with this TV's code filled in.
function qrSquare(code) {
  const modules = qrModules(`${location.origin}/admin.html#tv=${code}`);
  const border = 4;
  const size = modules.length + border * 2;
  const path = modules.flatMap((row, y) => row.map((dark, x) => (dark ? `M${x + border} ${y + border}h1v1h-1z` : ''))).join('');
  return html`<svg class="tvs-qr" viewBox="0 0 ${size} ${size}" role="img" aria-label="${t('tvPairHow')}" shape-rendering="crispEdges">
    <rect width="${size}" height="${size}" class="tvs-qr-light"></rect><path d="${path}" class="tvs-qr-dark"></path></svg>`;
}

function soundButton(sound) {
  if (sound === 'on') return '';
  if (sound === 'blocked') return html`<p class="tvs-sound-note">${t('tvSoundBlocked')}</p>`;
  return html`<button type="button" class="tvs-sound" data-tv-sound>${t('tvSoundOn')}</button>`;
}

// waiting: '' before any coach paired, 'paired' with nothing to show, 'missing' when the game named isn't on the site.
export function waitingScreen({ code, name, waiting, sound }) {
  const how = { '': 'tvPairHow', paired: 'tvPairedWaiting', missing: 'tvGameMissing' }[waiting];
  return html`<div class="tvs tvs-wait">
    <div class="tvs-name">${name || t('tvScreenName')}</div>
    <div class="tvs-code" aria-label="${t('tvCodeLabel')}: ${[...code].join(' ')}">${code}</div>
    <p class="tvs-how">${t(how)}</p>
    ${qrSquare(code)}
    ${soundButton(sound)}
  </div>`;
}

const kindOf = (steps, position) => (isOver(steps, position) ? 'done' : steps[position.step].kind);

function label(step) {
  if (!step) return t('tvTime');
  if (step.kind === 'ready') return t('tvGetReady');
  if (step.kind === 'rest') return t(step.game.switch ? 'tvRestSwitch' : 'tvRest');
  return text(step.label);
}

function says(step) {
  if (!step) return t('tvTimeSay');
  if (step.kind === 'ready') return `${t('tvStartsIn')}: ${text(step.game.start)}`;
  if (step.kind === 'rest') return t(step.game.switch ? 'tvSwitchSay' : 'tvRestSay');
  return text(step.say);
}

// "Round 2 of 4" in a game; "Part 3 of 6" in a lesson plan's other blocks.
function whereLine(show, step, last) {
  const current = step || last;
  if (current?.game) return `${t('tvRound')} ${current.round} ${t('tvOf')} ${current.game.rounds}`;
  return `${t('tvBlock')} ${(current?.block ?? 0) + 1} ${t('tvOf')} ${show.blocks.length}`;
}

function sides(step) {
  if (!step?.game) return '';
  const switched = rolesSwitched(step) ? html` · ${t('tvRolesSwitched')}` : '';
  return html`<div class="tvs-sides"><div class="tvs-side"><b>${t('tvTopWins')}${switched}</b><span>${text(step.game.top)}</span></div>
    <div class="tvs-side"><b>${t('tvBottomWins')}</b><span>${text(step.game.bottom)}</span></div></div>`;
}

function nextLine(steps, position) {
  const next = steps[position.step + 1];
  if (isOver(steps, position)) return '';
  return html`<span>${t('tvNext')}: <b>${next ? `${label(next)} · ${clockText(next.seconds)}` : t('tvTheEnd')}</b></span>`;
}

// How far into this step, for its part of the progress bar.
export function stepShare(steps, position) {
  const length = stepLength(steps, position);
  return length ? Math.round(100 * (1 - position.left / length)) : 0;
}

export function gameScreen({ show, steps, position, sound }) {
  const step = isOver(steps, position) ? null : steps[position.step];
  const title = step?.game && show.blocks.length ? step.game.n : show.title;
  const bar = steps.map((each, i) => {
    const where = i < position.step ? 'past' : i === position.step ? 'now' : '';
    return html`<i class="${where}" style="--w:${each.seconds}"${i === position.step ? html` id="tvsNow"` : ''}></i>`;
  });
  return html`<div class="tvs tvs-game" data-kind="${kindOf(steps, position)}" id="tvsGame">
    <div class="tvs-top"><span class="tvs-title">${text(title)}</span><span class="tvs-round">${whereLine(show, step, steps[steps.length - 1])}</span></div>
    <div class="tvs-mid"><div class="tvs-clock" id="tvsClock">${clockText(position.left)}</div>
      <div class="tvs-now"><div class="tvs-phase">${label(step)}</div><div class="tvs-say">${says(step)}</div></div></div>
    ${sides(step)}
    <div class="tvs-foot"><div class="tvs-bar">${bar}</div><div class="tvs-next">${nextLine(steps, position)}<span id="tvsLeft">${leftLine(steps, position)}</span></div></div>
    ${soundButton(sound)}
  </div>`;
}

function leftLine(steps, position) {
  return isOver(steps, position) ? '' : `${clockText(timeLeft(steps, position))} ${t('tvLeft')}`;
}

// Between whole redraws (a new step, a change from the phone), only the numbers move.
export function tickScreen(steps, position) {
  document.getElementById('tvsClock').textContent = clockText(position.left);
  document.getElementById('tvsLeft').textContent = leftLine(steps, position);
  document.getElementById('tvsNow')?.style.setProperty('--p', `${stepShare(steps, position)}%`);
  const step = steps[position.step];
  document.getElementById('tvsGame').classList.toggle('last', Boolean(position.running && step && step.kind !== 'ready' && position.left <= 10));
}
