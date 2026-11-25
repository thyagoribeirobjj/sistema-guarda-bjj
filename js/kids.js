import { html } from './html.js';
import { kids, loadKids } from './content.js';
import { loadApprovals } from './firebase.js';
import { kidsProgress, levelOf } from './kids-progress.js';
import { settings, claimChallenge } from './settings.js';
import { state } from './state.js';
import { t, text } from './strings.js';
import { intro, techniqueChip } from './views.js';

// The Kids page (#kids), for someone who trains in the kids class (or both): worlds of challenges from data/kids.json,
// each pointing at the site's own techniques. Signed in, a kid taps "I did it" (users/{uid}.claims) and a coach
// approves it or sends it back from the admin page's Students list (approvals/{uid}); only approved ones give XP.
const statusLabels = { todo: 'statusTodo', waiting: 'statusWaiting', done: 'statusDone', again: 'statusAgain', locked: 'statusLocked' };

// The kids' content and, signed in, the coaches' answers: read only for the kids class or both, so an adult's visit
// costs nothing more. state.approvals stays null until the answers are known (the buttons wait for them).
export async function followKids() {
  if (settings.audience === 'adult') {
    state.approvals = null;
    return;
  }
  try {
    await loadKids();
  } catch (error) {
    console.error(error);
  }
  const uid = state.account?.uid;
  if (!uid) {
    state.approvals = null;
    return;
  }
  if (state.approvalsOf === uid && state.approvals) return;
  state.approvalsOf = uid;
  try {
    const approvals = await loadApprovals(uid);
    if (state.account?.uid === uid) state.approvals = approvals;
  } catch (error) {
    console.error(error);
    state.approvalsOf = null;
  }
}

export const kidsPage = () => settings.audience !== 'adult' && kids.loaded;

function levelLine(xp) {
  const { level, next } = levelOf(kids.levels, xp);
  const toNext = next
    ? t('xpToNext').replace('{xp}', next.xp - xp).replace('{level}', text(next.n))
    : t('topLevel');
  const width = next ? Math.round(((xp - level.xp) / (next.xp - level.xp)) * 100) : 100;
  return html`<div class="progress kids-level"><span>${t('level')}: <b>${text(level.n)}</b> · <b>${xp}</b> XP</span><div class="lad-bar"><i style="width:${width}%"></i></div><span class="note">${toNext}</span></div>`;
}

const statusPill = (status) => html`<span class="kid-status" data-status="${status}">${t(statusLabels[status])}</span>`;

// "I did it" waits for the coaches' answers, so a button never changes under a finger when they arrive.
function claimButton(challenge, status) {
  if (!state.account || !state.approvals) return '';
  if (status === 'todo' || status === 'again') return html`<div class="actions"><button type="button" class="primary" data-claim="${challenge.id}">${t('iDidIt')}</button></div>`;
  if (status === 'waiting') return html`<div class="actions"><button type="button" class="chipbtn" data-unclaim="${challenge.id}">${t('takeBack')}</button></div>`;
  return '';
}

function challengeRow(challenge, status, open) {
  const head = html`<div class="challenge-head"><b>${text(challenge.n)}</b><span class="xp">${challenge.xp} XP</span>${statusPill(open ? status : 'locked')}</div>`;
  if (!open) return html`<li class="challenge locked">${head}</li>`;
  return html`<li class="challenge" data-challenge="${challenge.id}">${head}<p>${text(challenge.task)}</p>${
    challenge.techniques.length ? html`<div class="techs">${challenge.techniques.map((id) => techniqueChip(id))}</div>` : ''}${claimButton(challenge, status)}</li>`;
}

function worldCard(world, number, progress) {
  const here = progress.worlds[world.id];
  const challenges = kids.challenges.filter((challenge) => challenge.world === world.id);
  return html`<section class="card world${here.open ? '' : ' locked'}" data-list data-world="${world.id}"><div class="world-head"><span class="world-mark" aria-hidden="true">${world.mark}</span><div><p class="eyebrow">${t('world')} ${number}</p><h3>${text(world.n)}</h3></div><span class="world-count">${here.done}/${here.total} ${t('worldDone')}</span></div>
    <p class="note">${here.open ? text(world.d) : t('worldLocked')}</p><ol class="challenges">${challenges.map((challenge) => challengeRow(challenge, progress.statuses[challenge.id], here.open))}</ol></section>`;
}

export function kidsView() {
  const progress = kidsProgress(kids, settings.claims, state.approvals || {}, { allOpen: state.admin });
  const signIn = state.online && !state.account ? html`<p class="note kids-sign-in">${t('kidsSignIn')}</p>` : '';
  return html`${intro(t('kids'), t('kidsLead'), levelLine(progress.xp))}${signIn}<div class="worlds">${kids.worlds.map((world, i) => worldCard(world, i + 1, progress))}</div>`;
}

// The buttons, for js/app.js: each redraws and keeps the focus on the challenge's other button.
export function kidsActions(render) {
  const answer = (id, claimed) => {
    claimChallenge(id, claimed);
    render();
    document.querySelector(`[data-challenge="${id}"] :is([data-claim], [data-unclaim])`)?.focus();
  };
  return [
    ['[data-claim]', (el) => answer(el.dataset.claim, true)],
    ['[data-unclaim]', (el) => answer(el.dataset.unclaim, false)],
  ];
}
