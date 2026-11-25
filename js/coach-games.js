import { loadCoachGames } from './firebase-tv.js';

// The games coaches made in the game designer (site/games): { <id>: game }. Read only when the lesson builder,
// the designer or the TV remote opens, never on an ordinary visit. loaded is false until they are known.
export const coachGames = { games: {}, loaded: false };
let loading = null;

// fresh: an admin's page always asks the database (other pages may use this browser's copy of a few minutes ago).
export function followCoachGames({ fresh = false } = {}) {
  loading ||= loadCoachGames({ fresh }).then((games) => {
    coachGames.games = games;
    coachGames.loaded = true;
  }).catch((error) => {
    console.error(error);
    loading = null;
  });
  return loading;
}

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
