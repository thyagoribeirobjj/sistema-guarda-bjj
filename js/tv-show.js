import { content } from './content.js';
import { t, text } from './strings.js';
import { findGame, planBlocks, gameBlock, lessonModule, gameId, chosenGame } from './plan.js';
import { clockGame, hasClock, lessonItems } from './game-clock.js';

// What a TV session names ({ game: <id> } or { lesson: { mod, dur, items, game } }, firestore.rules), built into what
// the clock runs (js/game-clock.js). The TV and the coach's phone each build it from the site's own files and the
// coaches' games, so both run the very same steps.

export function needsCoachGames(named) {
  return (named?.game || named?.lesson?.game || '').startsWith('coach-');
}

// A block of the plan on the TV; the techniques block lists each technique (its name and tip, in both languages).
function showBlock(block) {
  const seconds = block.minutes * 60;
  if (block.techniques?.length) return { title: block.title, say: '', list: block.techniques, seconds };
  return { title: block.title, say: block.list ? block.list.join(' · ') : text(block.text), seconds };
}

// null when nothing is shown, or the game named is not on the site (any more).
export function buildShow(named, coachGames = {}) {
  if (named?.game) {
    const game = findGame(named.game, coachGames);
    return hasClock(game) ? { title: game.n, blocks: [], game: clockGame(game), gameAt: 0 } : null;
  }
  if (!named?.lesson) return null;
  const blocks = planBlocks(named.lesson, coachGames);
  const game = blocks[gameBlock].game;
  const shown = blocks.map(showBlock);
  // The game fills its block of the plan; what is left after its last whole round says so.
  shown[gameBlock].after = t('tvGameBlockLeft');
  return {
    title: content.modules[lessonModule(named.lesson)].title,
    blocks: shown,
    game: hasClock(game) ? clockGame(game) : null,
    gameAt: gameBlock,
    gameSeconds: shown[gameBlock].seconds,
  };
}

// The lesson builder's choices (settings.lesson) as a TV session names them.
export function lessonShow(lesson, coachGames = {}) {
  const chosen = lesson || {};
  return {
    mod: lessonModule(chosen), dur: chosen.dur === '90' ? '90' : '60',
    items: lessonItems(chosen.items),
    game: gameId(chosen.game) || chosenGame(chosen, coachGames)?.id || '',
  };
}

// The mark of one change to a session (its stamp), so a phone knows its own changes from the others'.
export const newStamp = () => Math.random().toString(36).slice(2, 12);
