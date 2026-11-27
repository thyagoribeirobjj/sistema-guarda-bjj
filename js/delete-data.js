import { deleteMyData, settingsSavedAt, signOut, signedInId } from './firebase.js';

// "Delete my data", remembered in this browser until it is done: { uid, settingsAt, lastStep, signInNext, signedInAgain }.
// A press cut off half way (the page closed or reloaded, the connection lost) is finished by that account's next visit
// or sign-in here, and only while its settings are the very ones it asked to delete: settingsAt is when they were last
// saved, by the database's clock (null when there were none). An account used again since, on purpose, keeps
// everything; another account signing in here is never touched. lastStep: the sign-in record was being deleted.
// signInNext: the person was signed out, by Google wanting a fresh sign-in or on purpose, and their next sign-in here
// finishes it.
const askedKey = 'sg-deleting';

function kept() {
  try { return JSON.parse(localStorage.getItem(askedKey)); } catch { return null; }
}

function asked(uid) {
  const pending = kept();
  return pending?.uid === uid ? pending : null;
}

function keep(pending) {
  try { localStorage.setItem(askedKey, JSON.stringify(pending)); } catch {}
}

// Set when a cut-off request had to be dropped on this visit, until the person closes the note about it.
let stoppedNote = false;
export const deletionStoppedNote = () => stoppedNote;
export function closeDeletionNote() {
  stoppedNote = false;
}

export function deletionDone() {
  try { localStorage.removeItem(askedKey); } catch {}
}

function deleteNoting(pending, options) {
  return deleteMyData(pending.uid, { ...options, beforeSignIn: () => keep({ ...pending, lastStep: true }) });
}

// The person pressed "Yes, delete": what their settings are now is noted first (one read), then everything is deleted.
export async function deleteAccountData(uid) {
  const pending = { uid, settingsAt: await settingsSavedAt(uid) };
  keep(pending);
  await deleteNoting(pending);
  deletionDone();
}

export const deletionAsked = (uid) => Boolean(asked(uid));

// The person signs out on purpose: a request still waiting here for their account is kept for their next sign-in.
export function signOutOnPurpose() {
  const pending = asked(signedInId());
  if (pending) keep({ ...pending, signInNext: true });
  return signOut();
}

// Nobody is signed in here, and nobody signed out on purpose: a request that got as far as the sign-in record belongs
// to an account that is gone (the answer to its last step was lost), so nothing is left to finish.
export function signedOutHere() {
  const pending = kept();
  if (pending?.lastStep && !pending.signInNext) deletionDone();
}

// stored: the account's settings as just read (null when there are none). The outcome is
// 'none': nothing to finish (or the account was used again since); 'finished';
// 'sign-in': Google wants a fresh sign-in first, so the person is signed out and their next sign-in finishes it;
// 'stopped': it can't finish by itself (it failed again after that sign-in, or for another reason). The request is
// dropped, so it is never tried in a loop, and the person is told to press "Delete my data" again.
export async function finishDeletion(uid, stored) {
  const pending = asked(uid);
  if (!pending) return { outcome: 'none' };
  if (stored && (stored.updatedAt?.toMillis?.() ?? null) !== pending.settingsAt) {
    deletionDone();
    return { outcome: 'none' };
  }
  const attempt = { ...pending, signInNext: false, signedInAgain: Boolean(pending.signedInAgain || pending.signInNext) };
  keep(attempt);
  try {
    // Never opens Google's window by itself.
    await deleteNoting(attempt, { confirm: false });
  } catch (error) {
    const settingsGone = !stored || Boolean(error.settingsDeleted);
    if (error.code === 'auth/requires-recent-login' && !attempt.signedInAgain) {
      keep({ ...attempt, signInNext: true });
      return { outcome: 'sign-in', error, settingsGone };
    }
    deletionDone();
    stoppedNote = true;
    return { outcome: 'stopped', error, settingsGone };
  }
  deletionDone();
  return { outcome: 'finished' };
}
