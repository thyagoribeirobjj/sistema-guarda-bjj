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

test('nobody else can see or change someone’s settings', async () => {
  await write('users/student-uid', settings('student@example.com'), 'setup');
  assert.equal(await read('users/student-uid'), 'denied');
  assert.equal(await read('users/student-uid', 'admin'), 'denied');
  assert.equal(await write('users/student-uid', settings('coach@example.com'), 'admin'), 'denied');
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
