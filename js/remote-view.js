import { html } from './html.js';
import { t, text } from './strings.js';
import { allGames, gameChoice } from './plan.js';
import { clockText, isOver, stepLength, pageSeconds } from './game-clock.js';

// The markup of the coach's phone remote (admin page, "Run on the TV"; js/remote.js runs it).

function tvButtons({ tvs, current }) {
  if (!tvs.length) return '';
  return html`<div class="field"><span class="lbl">${t('myTvs')}</span><div class="filters" role="group">${tvs.map((tv) => html`<button type="button" class="chipbtn" data-remote-tv="${tv.code}" aria-pressed="${tv.code === current}">${tv.name} · ${tv.code}</button>`)}
    <button type="button" class="chipbtn" data-remote="another">${t('anotherTv')}</button></div></div>`;
}

function pairForm({ typedCode, defaultName }) {
  return html`<form class="remote-pair" id="pairForm">
    <div class="field"><label for="tvCode">${t('tvCode')}</label><input id="tvCode" class="code-input" maxlength="7" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${typedCode}"></div>
    <div class="field"><label for="tvName">${t('tvName')}</label><input id="tvName" maxlength="40" value="${defaultName}"></div>
    <button type="submit" class="primary">${t('pairTv')}</button></form>`;
}

function showChooser({ choice, coachGames }) {
  const games = allGames(coachGames).map((entry) => gameChoice(entry, choice === entry.id));
  return html`<div class="field"><label for="remoteShow">${t('whatToShow')}</label><select id="remoteShow">
    <option value="lesson" ${choice === 'lesson' ? 'selected' : ''}>${t('lessonPlanChoice')}</option>${games}</select></div>
    <div class="actions"><button type="button" class="primary" data-remote="show">${t('showOnThisTv')}</button>
      <button type="button" class="chipbtn" data-remote="forget">${t('forgetTv')}</button></div>`;
}

// The clock's words on the phone: the time, and what is happening ("Minute 1 · round 1 of 2").
export function phaseLine(steps, position) {
  const step = steps[position.step];
  if (!step) return t('tvTime');
  const name = step.kind === 'ready' ? t('tvGetReady') : step.kind === 'rest' ? t('tvRest') : text(step.label);
  return step.game ? `${name} · ${t('tvRound')} ${step.round} ${t('tvOf')} ${step.game.rounds}` : name;
}

// A techniques block: how many there are, and when the TV turns its page if it shows them in pages. Only the TV knows
// whether they fit its screen (it never writes), so the phone never claims a page number.
export function pagingLine(steps, position) {
  const step = steps[position.step];
  if (!step?.list || isOver(steps, position)) return '';
  const spent = Math.max(0, stepLength(steps, position) - position.left);
  const turn = Math.max(1, Math.ceil(pageSeconds - (spent % pageSeconds)));
  return `${step.list.length} ${t('remoteTechniques')}. ${t('remotePaging')} ${turn} s.`;
}

export function toggleLabel(steps, position, fresh) {
  if (position.running) return t('clockPause');
  if (isOver(steps, position)) return t('clockAgain');
  return t(fresh ? 'clockStart' : 'clockResume');
}

export function clockPart({ session, steps, position, fresh }) {
  if (!session?.show) return html`<p class="note">${t('nothingOnTv')}</p>`;
  const key = (name, label, extra = '') => html`<button type="button" class="chipbtn" data-remote="${name}" ${extra}>${label}</button>`;
  return html`<div class="remote-now"><span id="remoteTime">${clockText(position.left)}</span><span id="remotePhase">${phaseLine(steps, position)}</span></div>
    <button type="button" class="primary remote-go" data-remote="toggle" id="remoteToggle">${toggleLabel(steps, position, fresh)}</button>
    <div class="remote-keys">${key('back', t('clockBack'))}${key('next', t('clockNext'))}${key('more', t('clockMore'))}${key('restart', t('clockRestart'))}
      ${key('beeps', t('clockBeeps'), html`aria-pressed="${Boolean(session.beeps)}"`)}${key('end', t('clockEnd'))}</div>
    <p class="note" id="remotePaging">${pagingLine(steps, position)}</p>`;
}

export function remotePage(view) {
  const pairing = !view.tvs.length || view.adding;
  return html`<div class="intro"><div><h2>${t('runOnTv')}</h2><p>${t('remoteLead')}</p></div></div>
    <p class="note"><a href="admin.html">${t('backToAdmin')}</a></p>
    <section class="card remote" aria-label="${t('runOnTv')}">
      ${tvButtons(view)}
      ${pairing ? pairForm(view) : ''}
      ${view.current ? showChooser(view) : ''}
      ${view.current ? html`<div class="remote-clock" id="remoteClock">${clockPart(view)}</div>` : ''}
      <p class="status" id="remoteStatus" role="status">${view.status}</p>
    </section>`;
}
