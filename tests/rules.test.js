// Runs firestore.rules in the local Firestore emulator: `npm test` starts it.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const project = 'demo-sistema-guarda';
const emulator = `http://${process.env.FIRESTORE_EMULATOR_HOST}`;
const documents = `${emulator}/v1/projects/${project}/databases/(default)/documents`;

const people = {
  admin: { sub: 'admin-uid', email: 'coach@example.com', email_verified: true },
  adminMixedCase: { sub: 'admin-uid', email: 'Coach@Example.com', email_verified: true },
  unverifiedAdmin: { sub: 'unverified-uid', email: 'unverified@example.com', email_verified: false },
  student: { sub: 'student-uid', email: 'student@example.com', email_verified: true },
  otherStudent: { sub: 'other-uid', email: 'other@example.com', email_verified: true },
};

function token(person) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return [
    encode({ alg: 'none', typ: 'JWT' }),
    encode({
      iss: `https://securetoken.google.com/${project}`, aud: project, iat: now, exp: now + 3600, auth_time: now,
      user_id: person.sub, firebase: { sign_in_provider: 'google.com', identities: {} }, ...person,
    }),
    '',
  ].join('.');
}

function toValue(value) {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') return { integerValue: String(value) };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toValue) } };
  return { mapValue: { fields: toFields(value) } };
}

function toFields(object) {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, toValue(value)]));
}

function headers(who) {
  if (who === 'setup') return { Authorization: 'Bearer owner' };
  return who ? { Authorization: `Bearer ${token(people[who])}` } : {};
}

async function read(path, who) {
  const response = await fetch(`${documents}/${path}`, { headers: headers(who) });
  return response.status === 403 ? 'denied' : 'allowed';
}

async function remove(path, who) {
  const response = await fetch(`${documents}/${path}`, { method: 'DELETE', headers: headers(who) });
  if (response.status !== 200 && response.status !== 403) throw new Error(await response.text());
  return response.status === 403 ? 'denied' : 'allowed';
}

// Writes the way the site does: the fields plus updatedAt set by the server.
async function write(path, data, who) {
  const body = {
    writes: [{
      update: { name: `projects/${project}/databases/(default)/documents/${path}`, fields: toFields(data) },
      updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
    }],
  };
  const response = await fetch(`${documents}:commit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers(who) }, body: JSON.stringify(body),
  });
  if (response.status !== 200 && response.status !== 403) throw new Error(await response.text());
  return response.status === 403 ? 'denied' : 'allowed';
}

const week = { weekOf: '2026-11-23', title: { pt: 'Postura', en: 'Posture' }, techniques: ['top-base'] };
const settings = (email) => ({ email, language: 'en', theme: 'dark', favorites: ['top-base'] });

beforeEach(async () => {
  await fetch(`${emulator}/emulator/v1/projects/${project}/databases/(default)/documents`, { method: 'DELETE' });
  await write('admins/coach@example.com', { name: 'Coach' }, 'setup');
  await write('admins/unverified@example.com', { name: 'Unverified' }, 'setup');
  await write('site/week', week, 'setup');
});

test('anyone can read the week, even signed out', async () => {
  assert.equal(await read('site/week'), 'allowed');
  assert.equal(await read('site/week', 'student'), 'allowed');
});

test('only an admin can change the week', async () => {
  assert.equal(await write('site/week', week), 'denied');
  assert.equal(await write('site/week', week, 'student'), 'denied');
  assert.equal(await write('site/week', week, 'unverifiedAdmin'), 'denied');
  assert.equal(await write('site/week', week, 'admin'), 'allowed');
  assert.equal(await write('site/week', week, 'adminMixedCase'), 'allowed');
});

test('anyone can read past weeks; only an admin can change them', async () => {
  const weeks = { weeks: [week] };
  assert.equal(await read('site/weeks'), 'allowed');
  assert.equal(await write('site/weeks', weeks, 'student'), 'denied');
  assert.equal(await write('site/weeks', weeks), 'denied');
  assert.equal(await write('site/weeks', weeks, 'admin'), 'allowed');
});

test('people can read their own admin entry and no one else’s; nobody adds admins from the site', async () => {
  assert.equal(await read('admins/coach@example.com', 'admin'), 'allowed');
  assert.equal(await read('admins/student@example.com', 'student'), 'allowed');
  assert.equal(await read('admins/coach@example.com', 'student'), 'denied');
  assert.equal(await read('admins/coach@example.com'), 'denied');
  assert.equal(await write('admins/student@example.com', { name: 'Me' }, 'student'), 'denied');
  assert.equal(await write('admins/someone@example.com', { name: 'New' }, 'admin'), 'denied');
});

test('people can save and read their own settings', async () => {
  assert.equal(await write('users/student-uid', settings('student@example.com'), 'student'), 'allowed');
  assert.equal(await read('users/student-uid', 'student'), 'allowed');
});

test('coaches can see every student’s settings; other students and visitors cannot', async () => {
  await write('users/student-uid', settings('student@example.com'), 'setup');
  assert.equal(await read('users/student-uid', 'admin'), 'allowed');
  assert.equal(await read('users', 'admin'), 'allowed');
  assert.equal(await read('users/student-uid'), 'denied');
  assert.equal(await read('users/student-uid', 'otherStudent'), 'denied');
  assert.equal(await read('users/student-uid', 'unverifiedAdmin'), 'denied');
  assert.equal(await read('users', 'student'), 'denied');
  assert.equal(await read('users'), 'denied');
});

test('only the person can change or delete their settings, not even a coach', async () => {
  await write('users/student-uid', settings('student@example.com'), 'setup');
  assert.equal(await write('users/student-uid', settings('coach@example.com'), 'admin'), 'denied');
  assert.equal(await write('users/student-uid', settings('other@example.com'), 'otherStudent'), 'denied');
  assert.equal(await remove('users/student-uid', 'admin'), 'denied');
  assert.equal(await remove('users/student-uid', 'otherStudent'), 'denied');
  assert.equal(await remove('users/student-uid', 'student'), 'allowed');
});

test('settings must have the expected shape', async () => {
  const save = (data) => write('users/student-uid', data, 'student');
  assert.equal(await save({ ...settings('student@example.com'), role: 'admin' }), 'denied');
  assert.equal(await save(settings('someone-else@example.com')), 'denied');
  assert.equal(await save({ ...settings('student@example.com'), language: 'fr' }), 'denied');
  assert.equal(await save({ ...settings('student@example.com'), theme: 'purple' }), 'denied');
  assert.equal(await save({ ...settings('student@example.com'), theme: 'gold' }), 'allowed');
  assert.equal(await save({ ...settings('student@example.com'), favorites: 'top-base' }), 'denied');
  assert.equal(await save({ ...settings('student@example.com'), progress: { 'top-base': 'done' } }), 'allowed');
  assert.equal(await save({ ...settings('student@example.com'), progress: 'done' }), 'denied');
  const lesson = { mod: 'top', dur: '60', items: ['0-0', '1-0'], game: 'top:0' };
  assert.equal(await save({ ...settings('student@example.com'), lesson }), 'allowed');
  assert.equal(await save({ ...settings('student@example.com'), lesson: 'top' }), 'denied');
  assert.equal(await save({ ...settings('student@example.com'), lesson: { ...lesson, other: 'x' } }), 'denied');
  const longLesson = { ...lesson, items: Array.from({ length: 201 }, (_, i) => `0-${i}`) };
  assert.equal(await save({ ...settings('student@example.com'), lesson: longLesson }), 'denied');
  const tooMany = Object.fromEntries(Array.from({ length: 1001 }, (_, i) => [`move-${i}`, 'done']));
  assert.equal(await save({ ...settings('student@example.com'), progress: tooMany }), 'denied');
});

test('a name and a belt can be saved with the settings, in the expected shape', async () => {
  const save = (data) => write('users/student-uid', { ...settings('student@example.com'), ...data }, 'student');
  assert.equal(await save({ name: 'Ana Souza', belt: 'blue' }), 'allowed');
  assert.equal(await save({ belt: '' }), 'allowed');
  for (const belt of ['white', 'purple', 'brown', 'black']) assert.equal(await save({ belt }), 'allowed');
  assert.equal(await save({ belt: 'red' }), 'denied');
  assert.equal(await save({ belt: 3 }), 'denied');
  assert.equal(await save({ name: 'x'.repeat(100) }), 'allowed');
  assert.equal(await save({ name: 'x'.repeat(101) }), 'denied');
  assert.equal(await save({ name: ['Ana'] }), 'denied');
});

const notesPath = 'users/student-uid/private/notes';
const manyNotes = (count) => Object.fromEntries(Array.from({ length: count }, (_, i) => [`move-${i}`, 'note']));

test('notes: only the person can read, write or delete their own, not even a coach', async () => {
  assert.equal(await write(notesPath, { notes: { 'top-base': 'Hips low' }, changed: 'top-base' }, 'student'), 'allowed');
  assert.equal(await read(notesPath, 'student'), 'allowed');
  assert.equal(await read(notesPath, 'admin'), 'denied');
  assert.equal(await read(notesPath, 'otherStudent'), 'denied');
  assert.equal(await read(notesPath), 'denied');
  assert.equal(await read('users/student-uid/private', 'admin'), 'denied');
  assert.equal(await write(notesPath, { notes: { 'top-base': 'Mine now' }, changed: 'top-base' }, 'admin'), 'denied');
  assert.equal(await write(notesPath, { notes: { 'top-base': 'Mine now' }, changed: 'top-base' }, 'otherStudent'), 'denied');
  assert.equal(await write(notesPath, { notes: { 'top-base': 'Mine now' }, changed: 'top-base' }), 'denied');
  assert.equal(await remove(notesPath, 'admin'), 'denied');
  assert.equal(await remove(notesPath, 'otherStudent'), 'denied');
  assert.equal(await remove(notesPath, 'student'), 'allowed');
});

test('notes: one short note changes per save, at most 500 notes, nothing else stored there', async () => {
  const save = (notes, changed, extra = {}) => write(notesPath, changed ? { notes, changed, ...extra } : { notes, ...extra }, 'student');
  assert.equal(await save({}), 'allowed');
  assert.equal(await save({ a: 'x'.repeat(2000) }, 'a'), 'allowed');
  assert.equal(await save({ a: 'x'.repeat(2000), b: 'Second' }, 'b'), 'allowed');
  assert.equal(await save({ a: 'Changed', b: 'Second' }, 'a'), 'allowed');
  assert.equal(await save({ b: 'Second' }, 'a'), 'allowed', 'removing one note');
  assert.equal(await save({ b: 'Second' }), 'allowed', 'nothing changed');
  assert.equal(await save({ b: 'Second', c: 'Third' }), 'denied', 'a change must say which note');
  assert.equal(await save({ b: 'Second', c: 'Third' }, 'b'), 'denied', 'says the wrong note');
  assert.equal(await save({ b: 'Second', c: 'x'.repeat(2001) }, 'c'), 'denied');
  assert.equal(await save({ b: 'Second', c: 42 }, 'c'), 'denied');
  assert.equal(await save({ b: 'Changed', c: 'Third' }, 'c'), 'denied', 'two notes in one save');
  assert.equal(await save('Second'), 'denied');
  assert.equal(await save({ b: 'Second' }, '', { shared: true }), 'denied');
  assert.equal(await write('users/student-uid/private/other', { notes: {} }, 'student'), 'denied');
  await write(notesPath, { notes: manyNotes(500) }, 'setup');
  assert.equal(await save({ ...manyNotes(500), 'move-0': 'Changed' }, 'move-0'), 'allowed');
  assert.equal(await save({ ...manyNotes(500), extra: 'One more' }, 'extra'), 'denied');
});

const image = (size) => `data:image/webp;base64,${'A'.repeat(size)}`;

test('anyone can see videos and diagrams; only an admin can attach them', async () => {
  await write('diagrams/top-base', { image: image(100) }, 'setup');
  assert.equal(await read('site/media'), 'allowed');
  assert.equal(await read('diagrams/top-base'), 'allowed');
  const media = { techniques: { 'top-base': { video: 'dQw4w9WgXcQ', diagram: true } } };
  assert.equal(await write('site/media', media, 'student'), 'denied');
  assert.equal(await write('site/media', media, 'admin'), 'allowed');
  assert.equal(await write('diagrams/top-base', { image: image(100) }), 'denied');
  assert.equal(await write('diagrams/top-base', { image: image(100) }, 'student'), 'denied');
  assert.equal(await write('diagrams/top-base', { image: image(600000) }, 'admin'), 'allowed');
});

test('a diagram must be a small image', async () => {
  const save = (data) => write('diagrams/top-base', data, 'admin');
  assert.equal(await save({ image: image(950000) }), 'denied');
  assert.equal(await save({ image: 'https://example.com/picture.png' }), 'denied');
  assert.equal(await save({ image: 'data:text/html;base64,PHNjcmlwdD4=' }), 'denied');
  assert.equal(await save({ image: image(100), note: 'extra field' }), 'denied');
});
