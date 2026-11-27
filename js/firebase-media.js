// The database calls for each move's video, diagram and minimum belt (site/media, diagrams/{id}), and the translator.
// Part of js/firebase.js, which holds the connection; who may read or change what is in firestore.rules.
import { database, site, forget, read, write } from './firebase.js';

// ---- each move's video, diagram and minimum belt ----
// site/media holds { techniques: { <id>: { video: <YouTube id>, diagram: true, minBelt: 'blue' } } }.
// minBelt is set only where an admin gave the move a minimum belt; without it the move is for everyone.
// The diagram image itself sits in diagrams/<id> and is read only when someone opens that move.

export async function loadMedia({ fresh = false } = {}) {
  return (await site('media', fresh).catch(() => null))?.techniques || {};
}

async function saveMediaField(id, field, value) {
  const { db, fb, auth } = database();
  const change = { [field]: value === null ? fb.deleteField() : value };
  await fb.setDoc(fb.doc(db, 'site/media'),
    { techniques: { [id]: change }, updatedBy: auth.currentUser.email, updatedAt: fb.serverTimestamp() },
    { merge: true });
  forget('media');
}

export function saveVideo(id, videoId) {
  return saveMediaField(id, 'video', videoId);
}

// '' clears the minimum belt: the technique is for everyone.
export function saveMinBelt(id, belt) {
  return saveMediaField(id, 'minBelt', belt || null);
}

export async function loadDiagram(id) {
  return (await read(`diagrams/${id}`))?.image || null;
}

export async function saveDiagram(id, image) {
  await write(`diagrams/${id}`, { image, updatedBy: database().auth.currentUser.email });
  await saveMediaField(id, 'diagram', true);
}

export async function removeDiagram(id) {
  const { db, fb } = database();
  await fb.deleteDoc(fb.doc(db, `diagrams/${id}`));
  await saveMediaField(id, 'diagram', null);
}

// ---- translation ----
// A small Google Apps Script (docs/translator.gs) translates for admins only. Its address is in site/config.

export async function translate(texts, from, to) {
  const config = await read('site/config');
  if (!config?.translatorUrl) throw new Error('No translator configured (site/config.translatorUrl).');
  const user = database().auth.currentUser;
  const response = await fetch(config.translatorUrl, {
    method: 'POST',
    body: JSON.stringify({ idToken: await user.getIdToken(), email: user.email, texts, from, to }),
  });
  const result = await response.json();
  if (!result.texts) throw new Error(result.error || 'Translation failed.');
  return result.texts;
}
