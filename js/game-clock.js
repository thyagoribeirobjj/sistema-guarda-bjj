// The game clock the TV runs: pure functions, tested in tests/game-clock.test.js, used by the TV (js/tv-screen.js),
// the coach's phone (js/remote.js) and the game designer (js/designer.js).
//
// A game: n (name), start (where it starts), top and bottom (how each side wins), parts [{ label, seconds, say }]
// (one round), rounds, rest (seconds between rounds), ready (seconds to get ready, once at the start) and switch
// (the players change roles after each round). Every text is { pt, en }.
// What the TV shows, once built from what the TV session names (js/tv-show.js): { title, blocks: [{ title, say, list, seconds }],
// game, gameAt, gameSeconds }. The game, when there is one, runs its own parts in place of blocks[gameAt] (after the
// last block when gameAt is past them): a single game has no blocks, a lesson plan has one block per part of the class.
// In a lesson plan (gameSeconds: its game block's length) the game fills its block (blockSteps()).
// The clock: { running, step, left, added }: the step showing, its seconds left at that moment, and the seconds
// "+30 s" added to it. A step past the last one means the show is over.

// A TV session's fields (tv/{code}), besides updatedAt: what js/firebase-tv.js stores, and firestore.rules allows.
export const sessionFields = ['name', 'language', 'show', 'clock', 'beeps', 'stamp'];

export const limits = { parts: 6, name: 80, line: 200, label: 60, say: 300, seconds: [5, 1800], rounds: [1, 20], rest: [0, 600], ready: [0, 60] };

// The most techniques a lesson plan on the TV names (firestore.rules checks the same in a session): every technique
// of the largest part of the fight is 65.
export const lessonItemsLimit = 100;

// The lesson's techniques as a TV session holds them: '<stage>-<technique>', each once, at most lessonItemsLimit.
export function lessonItems(items) {
  const keys = (Array.isArray(items) ? items : []).map(String).filter((key) => /^\d{1,2}-\d{1,2}$/.test(key));
  return [...new Set(keys)].slice(0, lessonItemsLimit);
}

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

// A lesson plan's game block of `seconds`: the game's rounds again and again (its rests between them, its roles
// switching as it says), as many whole rounds as fit, so the plan's minutes and the TV agree. The time left after the
// last whole round is the block's own step (`after`: { label, say }), never more rounds. When not even one round fits,
// the round is cut where the block ends.
export function blockSteps(game, seconds, after) {
  const round = totalSeconds(game.parts);
  const rounds = Math.max(1, Math.floor((seconds - game.ready + game.rest) / (round + game.rest)));
  const steps = [];
  let used = 0;
  for (const step of gameSteps({ ...game, rounds })) {
    const length = Math.min(step.seconds, seconds - used);
    if (length <= 0) break;
    steps.push({ ...step, seconds: length });
    used += length;
  }
  if (seconds > used) steps.push({ kind: 'block', label: after.label, say: after.say, list: null, seconds: seconds - used, block: after.block });
  return steps;
}

export function showSteps(show) {
  if (!show) return [];
  const blocks = show.blocks.map((block, index) => ({ kind: 'block', label: block.title, say: block.say, list: block.list || null, seconds: block.seconds, block: index }));
  if (!show.game) return blocks;
  const at = Math.min(show.gameAt, blocks.length);
  const game = show.gameSeconds && blocks[at]
    ? blockSteps(show.game, show.gameSeconds, { label: blocks[at].label, say: show.blocks[at].after || blocks[at].say, block: at })
    : gameSteps(show.game);
  return [...blocks.slice(0, at), ...game, ...blocks.slice(at + 1)];
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

// How long a session's clock had already been running when it reached the TV. The TV's clock and the database's
// need not agree, so a change that arrives while the TV listens counts from its arrival, and teaches the TV the gap
// between the two clocks (`skew`: its time minus the save's time, the trip included, in ms). The first answer after
// the TV (re)loads, or a change older than the gap allows (missed while offline), counts from its save instead.
// lag: the TV's time minus the save's time when it arrived (ms). Returns { elapsed (seconds), skew (to keep) }.
export const freshSlack = 5000;

export function caughtUp({ lag, skew = null, live }) {
  if (!Number.isFinite(lag)) return { elapsed: 0, skew };
  const behind = Math.max(0, lag - (skew ?? 0));
  if (live && (skew === null || behind <= freshSlack)) return { elapsed: 0, skew: lag };
  return { elapsed: behind / 1000, skew: skew === null ? null : Math.min(skew, lag) };
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

// A game changed while a TV shows it (the game designer): the clock carries on at the same place in the new steps
// (the same block of the plan, or the same round and part of the game), with the time already spent there kept, so a
// part made longer runs on and one made shorter than that hands over to the next. A place the game no longer has:
// the step at the same position from its start, or the end.
const placeOf = (step) => [step.kind, step.block, step.round, step.part].join(':');

export function carryClock(before, after, clock) {
  if (isOver(before, clock)) return over(after);
  const place = placeOf(before[clock.step]);
  const step = after.findIndex((each) => placeOf(each) === place);
  if (step < 0) return clock.step < after.length ? { running: clock.running, step: clock.step, left: after[clock.step].seconds, added: 0 } : over(after);
  const spent = before[clock.step].seconds + clock.added - clock.left;
  const left = after[step].seconds + clock.added - spent;
  return left > 0 ? { running: clock.running, step, left, added: clock.added } : nextPart(after, { ...clock, step });
}

// The length of the step showing, "+30 s" included (for its share of the progress bar).
export function stepLength(steps, clock) {
  return isOver(steps, clock) ? 0 : steps[clock.step].seconds + clock.added;
}

// A block too long for the TV screen shows in pages that turn every pageSeconds, counted from the block's own clock,
// so the TV, a reloaded TV and the phone all agree on the page, and a paused clock keeps it.
export const pageSeconds = 8;

export function pageAt(steps, clock, pages) {
  if (pages < 2 || isOver(steps, clock)) return 0;
  const spent = Math.max(0, stepLength(steps, clock) - clock.left);
  return Math.floor(spent / pageSeconds) % pages;
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
