import { html } from './html.js';
import { kids, loadKids } from './content.js';
import { loadAllApprovals, saveApproval } from './firebase.js';
import { challengeStatus, kidsSummary, claimMark, answerFor } from './kids-progress.js';
import { t, text } from './strings.js';

// The kids' challenges in the admin page's Students list (js/students.js): what each kid said they did, with
// "Approve" and "Try again". The answers go to approvals/{uid}, which only coaches can write (firestore.rules).
// Read with the list, only when the coach taps "Show students": one read per kid with any answer.
const audienceLabels = { kids: 'audienceKids', both: 'audienceBoth' };
let approvals = {};
const failed = new Set(); // "<uid>:<challenge>" whose answer couldn't be saved

export async function loadKidsAnswers() {
  failed.clear();
  const [answers] = await Promise.all([loadAllApprovals().catch((error) => { console.error(error); return {}; }), loadKids().catch(() => {})]);
  approvals = answers;
}

const claimsOf = (user) => (user.claims && typeof user.claims === 'object' ? user.claims : {});
const hasKidsPart = (user) => user.audience === 'kids' || user.audience === 'both' || Object.keys(claimsOf(user)).length > 0;

// A line in the student's summary: their class and, for a kid, the challenges done and waiting.
export function kidsFacts(user) {
  if (!hasKidsPart(user) || !kids.loaded) return '';
  const summary = kidsSummary(kids, claimsOf(user), approvals[user.uid]);
  const label = audienceLabels[user.audience];
  return html`${label ? html`<span>${t(label)}</span>` : ''}<span>${t('kidsChallenges')}: <b>${summary.done}</b> ${t('worldDone')}, <b>${summary.waiting}</b> ${t('kidsWaiting')}</span>`;
}

// How many of the kid's challenges wait for a coach's answer: their row opens by itself.
export function waitingOf(user) {
  return hasKidsPart(user) && kids.loaded ? kidsSummary(kids, claimsOf(user), approvals[user.uid]).waiting : 0;
}

function answerButtons(uid, challenge, status, claim) {
  const button = (answer, label, primary = false) => html`<button type="button" class="${primary ? 'primary' : 'chipbtn'}" data-answer="${uid}:${challenge.id}:${answer}:${claimMark(claim)}">${t(label)}</button>`;
  if (status === 'waiting') return html`${button('approved', 'approve', true)}${button('again', 'sendBack')}`;
  return button('undo', 'undoAnswer');
}

// The challenges the kid claimed or a coach answered, in the game's order.
export function kidsBody(user) {
  if (!hasKidsPart(user) || !kids.loaded) return '';
  const claims = claimsOf(user);
  const answers = approvals[user.uid] || {};
  const shown = kids.challenges.filter((challenge) => claims[challenge.id] || answers[challenge.id]);
  const statusLabels = { waiting: 'statusWaiting', done: 'statusDone', again: 'statusAgain' };
  const rows = shown.map((challenge) => {
    const status = challengeStatus(claims[challenge.id], answers[challenge.id]);
    const problem = failed.has(`${user.uid}:${challenge.id}`) ? html`<span class="status" role="status">${t('answerFailed')}</span>` : '';
    return html`<li class="kid-answer" data-kid-challenge="${challenge.id}"><span>${text(challenge.n)} · ${challenge.xp} XP <span class="kid-status" data-status="${status}">${t(statusLabels[status])}</span></span><span class="actions">${answerButtons(user.uid, challenge, status, claims[challenge.id])}${problem}</span></li>`;
  });
  return html`<h5>${t('kidsChallenges')}</h5>${rows.length ? html`<ul class="kid-answers">${rows}</ul>` : html`<p class="note">${t('noClaims')}</p>`}`;
}

// data-answer="<uid>:<challenge>:<approved | again | undo>:<the claim answered>". Resolves once saved (or failed).
export async function answerChallenge(value) {
  const [uid, id, answer, claim] = value.split(':');
  const key = `${uid}:${id}`;
  failed.delete(key);
  const saved = answer === 'undo' ? null : answerFor(answer, Number(claim));
  try {
    await saveApproval(uid, id, saved);
    const mine = { ...approvals[uid] };
    if (saved) mine[id] = saved;
    else delete mine[id];
    approvals[uid] = mine;
  } catch (error) {
    console.error(error);
    failed.add(key);
  }
}
