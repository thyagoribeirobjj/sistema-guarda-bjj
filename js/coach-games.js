import { loadCoachGames } from './firebase-tv.js';

// The games coaches made in the game designer (site/games): { <id>: game }. Read only when the lesson builder,
// the designer or the TV remote opens, never on an ordinary visit. loaded is false until they are known; readAt is
// when they were asked for (ms).
export const coachGames = { games: {}, loaded: false, readAt: 0 };
let loading = null;

// fresh: an admin's page always asks the database (other pages may use this browser's copy of a few minutes ago).
export function followCoachGames({ fresh = false } = {}) {
  const asked = Date.now();
  loading ||= loadCoachGames({ fresh }).then((games) => {
    coachGames.games = games;
    coachGames.loaded = true;
    coachGames.readAt = asked;
  }).catch((error) => {
    console.error(error);
    loading = null;
  });
  return loading;
}

// The games as saved now (a coach may have changed one while a TV shows it).
export function reloadCoachGames() {
  loading = null;
  return followCoachGames({ fresh: true });
}

// The designer tells this browser's other tabs (the TV remote) that a game was saved, and which TVs now show it.
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('sg-coach-games') : null;
export const tellCoachGameSaved = (id) => channel?.postMessage(id);
export const onCoachGameSaved = (heard) => channel?.addEventListener('message', (event) => heard(event.data));

export function keepCoachGame(id, game) {
  const games = { ...coachGames.games, [id]: game };
  if (!game) delete games[id];
  coachGames.games = games;
}

// A new game's id, as firestore.rules expects: coach- and 8 letters or digits.
export function newGameId() {
  const letters = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const random = crypto.getRandomValues(new Uint8Array(8));
  return `coach-${[...random].map((value) => letters[value % letters.length]).join('')}`;
}
