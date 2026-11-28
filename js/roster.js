// The coach's list of students: counting, sorting, finding by name and grouping marks by part of the fight.
// No page, no database: tests/roster.test.js. Each user is a users/{uid} document plus its uid, with updatedAt in
// milliseconds (null when unknown). Notes are never part of it: they are not in that document.
import { plain } from './content.js';

// known(id): whether the technique still exists, so removed ones aren't counted.
export function studentSummary(user, known = () => true) {
  const progress = Object.entries(user.progress && typeof user.progress === 'object' ? user.progress : {})
    .filter(([id]) => known(id));
  return {
    uid: user.uid,
    name: user.name || '',
    email: user.email || '',
    belt: user.belt || '',
    learning: progress.filter(([, mark]) => mark === 'learning').length,
    done: progress.filter(([, mark]) => mark === 'done').length,
    favorites: (Array.isArray(user.favorites) ? user.favorites : []).filter(known).length,
    lastActive: typeof user.updatedAt === 'number' ? user.updatedAt : null,
  };
}

const byName = (a, b) => (a.name || a.email).localeCompare(b.name || b.email) || a.email.localeCompare(b.email);
const orders = {
  name: byName,
  active: (a, b) => (b.lastActive ?? -1) - (a.lastActive ?? -1) || byName(a, b),
  done: (a, b) => b.done - a.done || b.learning - a.learning || byName(a, b),
};
export const studentOrders = Object.keys(orders);

// order: 'name', 'active' (most recent first) or 'done' (most learned first). find: part of a name or email.
export function studentList(users, { order = 'name', find = '', known } = {}) {
  const words = plain(find).split(/\s+/).filter(Boolean);
  return users.map((user) => studentSummary(user, known))
    .filter((student) => words.every((word) => plain(`${student.name} ${student.email}`).includes(word)))
    .sort(orders[order] || orders.name);
}

// One student's marks, by part of the fight in the curriculum's order, each part's techniques in their place there.
// placeOf(id) gives { moduleKey, stageIndex, index } or null for a technique that no longer exists.
// Returns [{ part, techniques: [{ id, progress: '' | 'learning' | 'done', favorite }] }].
export function marksByPart(user, placeOf, order) {
  const progress = user.progress && typeof user.progress === 'object' ? user.progress : {};
  const favorites = new Set(Array.isArray(user.favorites) ? user.favorites : []);
  const ids = new Set([...Object.keys(progress).filter((id) => progress[id] === 'learning' || progress[id] === 'done'), ...favorites]);
  const marked = [...ids].map((id) => ({ id, place: placeOf(id) })).filter(({ place }) => place);
  return order.map((part) => ({
    part,
    techniques: marked.filter(({ place }) => place.moduleKey === part)
      .sort((a, b) => a.place.stageIndex - b.place.stageIndex || a.place.index - b.place.index)
      .map(({ id }) => ({ id, progress: progress[id] === 'learning' || progress[id] === 'done' ? progress[id] : '', favorite: favorites.has(id) })),
  })).filter((group) => group.techniques.length);
}
