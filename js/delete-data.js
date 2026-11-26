import { deleteMyData, settingsSavedAt } from './firebase.js';

// "Delete my data", remembered in this browser until it is done: { uid, settingsAt }. A press cut off half way (the
// page closed or reloaded, the connection lost) is finished by that account's next visit or sign-in here, and only
// while its settings are the very ones it asked to delete: settingsAt is when they were last saved, by the database's
// clock (null when there were none). An account used again since, on purpose, keeps everything; another account
// signing in here is never touched.
const askedKey = 'sg-deleting';

function asked(uid) {
  try {
    const kept = JSON.parse(localStorage.getItem(askedKey));
    return kept?.uid === uid ? kept : null;
  } catch {
    return null;
  }
}

export function deletionDone() {
  try { localStorage.removeItem(askedKey); } catch {}
}

// The person pressed "Yes, delete": what their settings are now is noted first (one read), then everything is deleted.
export async function deleteAccountData(uid) {
  const settingsAt = await settingsSavedAt(uid);
  try { localStorage.setItem(askedKey, JSON.stringify({ uid, settingsAt })); } catch {}
  await deleteMyData(uid);
  deletionDone();
}

export const deletionAsked = (uid) => Boolean(asked(uid));

// stored: the account's settings as just read (null when there are none). Throws if it could not finish; the next
// visit or sign-in tries again. False when there was nothing to finish (or the account was used again since).
export async function finishDeletion(uid, stored) {
  const pending = asked(uid);
  if (!pending) return false;
  if (stored && (stored.updatedAt?.toMillis?.() ?? null) !== pending.settingsAt) {
    deletionDone();
    return false;
  }
  // No sign-in window opens by itself here: if Google wants the person to confirm, the next sign-in finishes it.
  await deleteMyData(uid, { confirm: false });
  deletionDone();
  return true;
}
