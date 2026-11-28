// Runs firestore.rules in the local Firestore emulator: `npm test` starts it.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { tvRuleTests } from './rules-tv.mjs';
import { listRuleTests } from './rules-lists.mjs';

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
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
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

test('the class last looked at (seenWeek) is a short text saved with the settings', async () => {
  const save = (data) => write('users/student-uid', { ...settings('student@example.com'), ...data }, 'student');
  assert.equal(await save({ seenWeek: '2026-11-23:abc123' }), 'allowed');
  assert.equal(await save({ seenWeek: '' }), 'allowed');
  assert.equal(await save({ seenWeek: 'x'.repeat(100) }), 'allowed');
  assert.equal(await save({ seenWeek: 'x'.repeat(101) }), 'denied');
  assert.equal(await save({ seenWeek: 3 }), 'denied');
  assert.equal(await write('users/student-uid', { ...settings('student@example.com'), seenWeek: 'a:b' }, 'otherStudent'), 'denied');
});

test('the class someone trains in, a kids’ belt and the challenges they claimed are saved with the settings', async () => {
  const save = (data) => write('users/student-uid', { ...settings('student@example.com'), ...data }, 'student');
  for (const audience of ['adult', 'kids', 'both']) assert.equal(await save({ audience }), 'allowed');
  assert.equal(await save({ audience: 'teens' }), 'denied');
  assert.equal(await save({ audience: '' }), 'denied');
  for (const belt of ['gray-white', 'yellow', 'orange-black', 'green-black']) assert.equal(await save({ belt }), 'allowed');
  assert.equal(await save({ belt: 'pink' }), 'denied');
  assert.equal(await save({ claims: { rolamento: 1764000000000, camarao: 1764000000001 } }), 'allowed');
  assert.equal(await save({ claims: 'rolamento' }), 'denied');
  const tooMany = Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`challenge-${i}`, 1]));
  assert.equal(await save({ claims: tooMany }), 'denied');
  assert.equal(await write('users/student-uid', { ...settings('student@example.com'), claims: { rolamento: 1 } }, 'otherStudent'), 'denied');
});

test('each claim a save adds is a whole number (when it was claimed), at most 50 added per save', async () => {
  const save = (claims, extra = {}) => write('users/student-uid', { ...settings('student@example.com'), claims, ...extra }, 'student');
  assert.equal(await save({ rolamento: 1764000000000 }), 'allowed');
  for (const wrong of [1764000000000.5, 'yesterday', true, { at: 1 }, [1], null]) {
    assert.equal(await save({ rolamento: 1764000000000, camarao: wrong }), 'denied', JSON.stringify(wrong));
  }
  const many = (count, from = 0) => Object.fromEntries(Array.from({ length: count }, (_, i) => [`challenge-${String(from + i).padStart(3, '0')}`, 1764000000000 + from + i]));
  // The first sign-in adds everything this browser marked at once, with the rest of the settings at their largest.
  const largest = {
    favorites: Array.from({ length: 500 }, (_, i) => `move-${i}`), name: 'x'.repeat(100), seenWeek: 'x'.repeat(100),
    progress: Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [`move-${i}`, 'done'])),
    lesson: { mod: 'top', dur: '60', items: Array.from({ length: 200 }, (_, i) => `0-${i}`), game: 'top:0' },
  };
  await remove('users/student-uid', 'student');
  assert.equal(await save(many(50), largest), 'allowed', '50 claims in a first save, with the largest settings');
  assert.equal(await save({ ...many(50), ...many(50, 50) }, largest), 'allowed', '50 more in the next, up to the 100 a kid may have');
  await remove('users/student-uid', 'student');
  assert.equal(await save(many(51)), 'denied', 'more than 50 added at once (there are far fewer challenges)');
  for (const at of [0, 4, 5, 26, 49]) {
    const claims = many(50);
    claims[`challenge-${String(at).padStart(3, '0')}`] = 1.5;
    assert.equal(await save(claims), 'denied', `a claim that is not a whole number, the ${at + 1}th of 50`);
  }
  // A kid whose account kept such a claim from before is not stuck: saves that leave it alone still work.
  await write('users/student-uid', { ...settings('student@example.com'), claims: { rolamento: 1.5 } }, 'setup');
  assert.equal(await save({ rolamento: 1.5 }, { theme: 'light' }), 'allowed', 'claims unchanged');
  assert.equal(await save({ rolamento: 1.5, camarao: 7 }), 'allowed', 'a new claim beside it');
  assert.equal(await save({ rolamento: 1.5, camarao: 7.5 }), 'denied', 'but not a new one like it');
  assert.equal(await save({ camarao: 7 }), 'allowed', 'the old claim taken back');
});

// The coaches' answers to a kid's challenges, saved as the site does: one challenge per save, named in changed.
const approvalsPath = 'approvals/student-uid';
const answer = (id, status = 'approved', extra = {}) => ({ challenges: { [id]: { status, claim: 1764000000000 } }, changed: id, ...extra });

test('only a coach can approve a kid’s challenge; the kid never can, not even their own', async () => {
  assert.equal(await write(approvalsPath, answer('rolamento', 'approved', { updatedBy: 'student@example.com' }), 'student'), 'denied', 'approving themselves');
  assert.equal(await write(approvalsPath, answer('rolamento', 'approved', { updatedBy: 'other@example.com' }), 'otherStudent'), 'denied');
  assert.equal(await write(approvalsPath, answer('rolamento', 'approved', { updatedBy: 'unverified@example.com' }), 'unverifiedAdmin'), 'denied');
  assert.equal(await write(approvalsPath, answer('rolamento')), 'denied', 'signed out');
  assert.equal(await write(approvalsPath, answer('rolamento', 'approved', { updatedBy: 'coach@example.com' }), 'admin'), 'allowed');
  assert.equal(await write(approvalsPath, { ...answer('rolamento', 'again'), updatedBy: 'student@example.com' }, 'student'), 'denied', 'nor change an answer');
  assert.equal(await remove(approvalsPath, 'otherStudent'), 'denied');
});

test('a kid can read their own answers, never another kid’s; coaches read them all', async () => {
  await write(approvalsPath, answer('rolamento'), 'setup');
  assert.equal(await read(approvalsPath, 'student'), 'allowed');
  assert.equal(await read(approvalsPath, 'admin'), 'allowed');
  assert.equal(await read('approvals', 'admin'), 'allowed');
  assert.equal(await read(approvalsPath, 'otherStudent'), 'denied');
  assert.equal(await read(approvalsPath), 'denied');
  assert.equal(await read('approvals', 'student'), 'denied');
  assert.equal(await remove(approvalsPath, 'student'), 'allowed', 'deleted with the rest of their data');
});

test('an answer approves or sends back one challenge per save, naming the claim, and nothing else is stored', async () => {
  const save = (data) => write(approvalsPath, { updatedBy: 'coach@example.com', ...data }, 'admin');
  assert.equal(await save(answer('rolamento')), 'allowed');
  assert.equal(await save({ challenges: { rolamento: { status: 'approved', claim: 1764000000000 }, camarao: { status: 'again', claim: 7 } }, changed: 'camarao' }), 'allowed');
  assert.equal(await save({ challenges: { camarao: { status: 'again', claim: 7 } }, changed: 'rolamento' }), 'allowed', 'taking an answer back');
  assert.equal(await save({ challenges: { camarao: { status: 'approved', claim: 7 }, base: { status: 'approved', claim: 7 } }, changed: 'base' }), 'denied', 'two answers in one save');
  assert.equal(await save({ challenges: { camarao: { status: 'again', claim: 7 }, base: { status: 'approved', claim: 7 } } }), 'denied', 'a change must say which challenge');
  assert.equal(await save({ challenges: { camarao: { status: 'again', claim: 7 }, base: { status: 'done', claim: 7 } }, changed: 'base' }), 'denied', 'approved or again only');
  assert.equal(await save({ challenges: { camarao: { status: 'again', claim: 7 }, base: { status: 'approved', claim: 'x' } }, changed: 'base' }), 'denied');
  assert.equal(await save({ challenges: { camarao: { status: 'again', claim: 7 }, base: { status: 'approved', claim: 7, xp: 500 } }, changed: 'base' }), 'denied', 'no XP of its own');
  assert.equal(await save({ challenges: { camarao: { status: 'again', claim: 7 } }, changed: 'camarao', note: 'extra' }), 'denied');
  assert.equal(await save({ ...answer('base'), updatedBy: 'someone@example.com' }), 'denied', 'signed with the coach’s own email');
});

test('a kid deletes their answers only once their settings are gone, so a "Try again" can\'t be wiped alone; coaches always can', async () => {
  await write(approvalsPath, answer('rolamento', 'again'), 'setup');
  await write('users/student-uid', settings('student@example.com'), 'setup');
  assert.equal(await remove(approvalsPath, 'student'), 'denied', 'while their settings exist');
  assert.equal(await remove(approvalsPath, 'otherStudent'), 'denied');
  assert.equal(await remove(approvalsPath), 'denied');
  assert.equal(await remove('users/student-uid', 'student'), 'allowed', '"Delete my data" deletes the settings first');
  assert.equal(await remove(approvalsPath, 'otherStudent'), 'denied', 'still nobody else');
  assert.equal(await remove(approvalsPath, 'student'), 'allowed', 'then the answers');
  assert.equal(await remove(approvalsPath, 'student'), 'allowed', 'pressed again (already gone): still fine');
  await write(approvalsPath, answer('rolamento', 'again'), 'setup');
  await write('users/student-uid', settings('student@example.com'), 'setup');
  assert.equal(await remove(approvalsPath, 'admin'), 'allowed', 'a coach may delete them any time');
});

const notesPath = 'users/student-uid/private/notes';
const manyNotes = (count) => Object.fromEntries(Array.from({ length: count }, (_, i) => [`move-${i}`, 'note']));

test('notes can be started only while the person\'s settings exist; saves after that are updates', async () => {
  const note = (text) => ({ notes: { 'top-base': text }, changed: 'top-base' });
  assert.equal(await write(notesPath, note('Hips low'), 'student'), 'denied', 'no settings (deleted, or not saved yet)');
  await write('users/student-uid', settings('student@example.com'), 'setup');
  assert.equal(await write(notesPath, note('Hips low'), 'student'), 'allowed');
  await remove('users/student-uid', 'student');
  assert.equal(await write(notesPath, note('Still here'), 'student'), 'allowed', 'an update needs no settings read');
  await remove(notesPath, 'student');
  assert.equal(await write(notesPath, note('Brought back'), 'student'), 'denied', 'after "Delete my data" nothing starts them again');
});

test('notes: only the person can read, write or delete their own, not even a coach', async () => {
  await write('users/student-uid', settings('student@example.com'), 'setup');
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
  await write('users/student-uid', settings('student@example.com'), 'setup');
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

tvRuleTests({ test, assert, read, write, remove });
listRuleTests({ test, assert, write });
