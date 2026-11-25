// The game clock the TV runs: pure functions, tested in tests/game-clock.test.js, used by the TV (js/tv-screen.js),
// the coach's phone (js/remote.js) and the game designer (js/designer.js).
//
// A game: n (name), start (where it starts), top and bottom (how each side wins), parts [{ label, seconds, say }]
// (one round), rounds, rest (seconds between rounds), ready (seconds to get ready, once at the start) and switch
// (the players change roles after each round). Every text is { pt, en }.
// What the TV shows, once built from what the TV session names (js/tv-show.js): { title, blocks: [{ title, say, seconds }],
// game, gameAt }. The game, when there is one, runs its own parts in place of blocks[gameAt] (after the last block
// when gameAt is past them): a single game has no blocks, a lesson plan has one block per part of the class.
// The clock: { running, step, left, added }: the step showing, its seconds left at that moment, and the seconds
// "+30 s" added to it. A step past the last one means the show is over.

export const limits = { parts: 6, name: 80, line: 200, label: 60, say: 300, seconds: [5, 1800], rounds: [1, 20], rest: [0, 600], ready: [0, 60] };

// The steps of one game: get ready, then each round's parts, with a rest between rounds.
export function gameSteps(game) {
  const steps = [];
  if (game.ready > 0) steps.push({ kind: 'ready', seconds: game.ready, round: 1, game });
  for (let round = 1; round <= game.rounds; round++) {
    game.parts.forEach((part, index) => steps.push({ kind: 'work', label: part.label, say: part.say, seconds: part.seconds, part: index, round, game }));
    if (round < game.rounds && game.rest > 0) steps.push({ kind: 'rest', seconds: game.rest, round, game });
  }
  return steps;
}

export function showSteps(show) {
  if (!show) return [];
  const blocks = show.blocks.map((block, index) => ({ kind: 'block', label: block.title, say: block.say, seconds: block.seconds, block: index }));
  if (!show.game) return blocks;
  const at = Math.min(show.gameAt, blocks.length);
  return [...blocks.slice(0, at), ...gameSteps(show.game), ...blocks.slice(at + 1)];
}

export function totalSeconds(steps) {
  return steps.reduce((sum, step) => sum + step.seconds, 0);
}

export const gameLength = (game) => totalSeconds(gameSteps(game));

// 0:00 for the clocks: minutes and seconds, a part of a second counting as a whole one.
export function clockText(seconds) {
  const whole = Math.max(0, Math.ceil(seconds - 1e-9));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function startClock(steps) {
  return { running: false, step: 0, left: steps[0]?.seconds ?? 0, added: 0 };
}

const over = (steps) => ({ running: false, step: steps.length, left: 0, added: 0 });

export const isOver = (steps, clock) => clock.step >= steps.length;

// Where the clock is `elapsed` seconds after it was set: a step that runs out hands over to the next.
export function advance(steps, clock, elapsed) {
  if (!clock.running || isOver(steps, clock)) return isOver(steps, clock) ? over(steps) : { ...clock };
  let { step, added } = clock;
  let left = clock.left - elapsed;
  while (left <= 0) {
    step += 1;
    added = 0;
    if (step >= steps.length) return over(steps);
    left += steps[step].seconds;
  }
  return { running: true, step, left, added };
}

// Start or Pause. A finished show starts again from the beginning.
export function toggle(steps, clock) {
  if (isOver(steps, clock)) return { ...startClock(steps), running: steps.length > 0 };
  return { ...clock, running: !clock.running };
}

export function nextPart(steps, clock) {
  if (clock.step + 1 >= steps.length) return over(steps);
  return { running: clock.running, step: clock.step + 1, left: steps[clock.step + 1].seconds, added: 0 };
}

// Back to the start of this part; pressed again within its first 3 seconds, back to the part before.
export function backPart(steps, clock) {
  if (!steps.length) return over(steps);
  if (isOver(steps, clock)) return { running: false, step: steps.length - 1, left: steps[steps.length - 1].seconds, added: 0 };
  const length = steps[clock.step].seconds + clock.added;
  const step = length - clock.left < 3 && clock.step > 0 ? clock.step - 1 : clock.step;
  return { running: clock.running, step, left: steps[step].seconds, added: 0 };
}

export function addTime(steps, clock, seconds = 30) {
  if (isOver(steps, clock)) return clock;
  return { ...clock, left: clock.left + seconds, added: clock.added + seconds };
}

export const restart = (steps) => startClock(steps);

// The length of the step showing, "+30 s" included (for its share of the progress bar).
export function stepLength(steps, clock) {
  return isOver(steps, clock) ? 0 : steps[clock.step].seconds + clock.added;
}

export function timeLeft(steps, clock) {
  if (isOver(steps, clock)) return 0;
  return clock.left + totalSeconds(steps.slice(clock.step + 1));
}

// The roles are switched in every second round of a game that switches them.
export function rolesSwitched(step) {
  return Boolean(step?.game?.switch) && step.round % 2 === 0;
}

// ---- checking a game ----

const whole = (value, [low, high]) => Number.isInteger(value) && value >= low && value <= high;

function textProblem(value, longest) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'not a text';
  if (Object.keys(value).some((key) => key !== 'pt' && key !== 'en')) return 'a language other than pt and en';
  if (['pt', 'en'].some((language) => typeof value[language] !== 'string')) return 'both languages needed';
  if (['pt', 'en'].some((language) => value[language].length > longest)) return `longer than ${longest}`;
  return '';
}

// What is wrong with a game, as a list of short reasons; [] when the clock can run it. The same limits as
// firestore.rules, so a game that passes here can be saved and shown on a TV.
export function gameProblems(game) {
  const problems = [];
  const text = (name, value, longest) => { const problem = textProblem(value, longest); if (problem) problems.push(`${name}: ${problem}`); };
  text('name', game.n, limits.name);
  text('start', game.start, limits.line);
  text('top', game.top, limits.line);
  text('bottom', game.bottom, limits.line);
  if (!Array.isArray(game.parts) || !game.parts.length || game.parts.length > limits.parts) problems.push(`parts: 1 to ${limits.parts}`);
  (Array.isArray(game.parts) ? game.parts : []).forEach((part, index) => {
    text(`part ${index + 1} label`, part.label, limits.label);
    text(`part ${index + 1} says`, part.say, limits.say);
    if (!whole(part.seconds, limits.seconds)) problems.push(`part ${index + 1} seconds`);
    if (Object.keys(part).some((key) => !['label', 'seconds', 'say'].includes(key))) problems.push(`part ${index + 1}: unknown field`);
  });
  if (!whole(game.rounds, limits.rounds)) problems.push('rounds');
  if (!whole(game.rest, limits.rest)) problems.push('rest');
  if (!whole(game.ready, limits.ready)) problems.push('ready');
  if (typeof game.switch !== 'boolean') problems.push('switch');
  return problems;
}

// Only what the clock needs from a game (the curriculum's games also carry their description and timing text).
export function clockGame(game) {
  const { n, start, top, bottom, rounds, rest, ready } = game;
  return { n, start, top, bottom, rounds, rest, ready, switch: game.switch, parts: game.parts.map(({ label, seconds, say }) => ({ label, seconds, say })) };
}

export const hasClock = (game) => Array.isArray(game?.parts) && game.parts.length > 0;
