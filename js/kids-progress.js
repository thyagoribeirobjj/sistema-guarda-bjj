// The kids' game, without any page or database: tests/kids.test.js.
// claims: what the kid said they did, { <challenge id>: <when, in milliseconds> } (users/{uid}.claims).
// approvals: what a coach answered, { <challenge id>: { status: 'approved' | 'again', claim: <the claim answered> } }
// (approvals/{uid}.challenges). Only an approved challenge counts: its XP, and towards opening the next world.

// A claim as a coach's answer names it: a whole number, as firestore.rules wants, whatever the kid's account holds
// (an older account may keep something else there). The same claim always gives the same number.
export function claimMark(claim) {
  const whole = typeof claim === 'number' ? Math.trunc(claim) : 0;
  return Number.isSafeInteger(whole) ? whole : 0;
}

// What a coach's "Approve" or "Try again" saves for a claim (approvals/{uid}.challenges.<id>).
export function answerFor(status, claim) {
  return { status, claim: claimMark(claim) };
}

// 'done' (approved), 'waiting' (claimed, not answered yet), 'again' (the coach sent that claim back) or 'todo'.
export function challengeStatus(claim, approval) {
  if (approval?.status === 'approved') return 'done';
  const sentBack = approval?.status === 'again';
  if (claim && !(sentBack && approval.claim === claimMark(claim))) return 'waiting';
  return sentBack ? 'again' : 'todo';
}

// The highest level reached: levels are [{ xp, n }] from the lowest. Returns { index, level, next } (next: null at the top).
export function levelOf(levels, xp) {
  let index = 0;
  levels.forEach((level, at) => { if (xp >= level.xp) index = at; });
  return { index, level: levels[index], next: levels[index + 1] || null };
}

// Everything the Kids page shows: each challenge's status, the XP and, per world, whether it is open and how many of
// its challenges are done. A world opens once 2 challenges of the world before are done (all of them, if it has
// fewer) and that world is open too; the first world and those marked alwaysOpen are open from the start.
// allOpen: every world open (a coach looking).
export function kidsProgress({ worlds, challenges }, claims = {}, approvals = {}, { allOpen = false } = {}) {
  const statuses = {};
  let xp = 0;
  for (const challenge of challenges) {
    statuses[challenge.id] = challengeStatus(claims[challenge.id], approvals[challenge.id]);
    if (statuses[challenge.id] === 'done') xp += challenge.xp;
  }
  const worldState = {};
  let before = null;
  for (const world of worlds) {
    const own = challenges.filter((challenge) => challenge.world === world.id);
    const done = own.filter((challenge) => statuses[challenge.id] === 'done').length;
    const previousOpened = before && before.open && before.done >= Math.min(2, before.total);
    const open = allOpen || !before || Boolean(world.alwaysOpen) || Boolean(previousOpened);
    worldState[world.id] = { open, done, total: own.length };
    before = worldState[world.id];
  }
  return { statuses, xp, worlds: worldState };
}

// For the coach's list of students: how many challenges a kid has done and how many wait for an answer.
export function kidsSummary(kidsContent, claims, approvals) {
  const { statuses, xp } = kidsProgress(kidsContent, claims || {}, approvals || {}, { allOpen: true });
  const all = Object.values(statuses);
  return { done: all.filter((status) => status === 'done').length, waiting: all.filter((status) => status === 'waiting').length, xp };
}
