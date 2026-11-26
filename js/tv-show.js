import { content } from './content.js';
import { text } from './strings.js';
import { findGame, planBlocks, gameBlock, lessonModule } from './plan.js';
import { clockGame, hasClock } from './game-clock.js';

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
  return {
    title: content.modules[lessonModule(named.lesson)].title,
    blocks: blocks.map(showBlock),
    game: hasClock(game) ? clockGame(game) : null,
    gameAt: gameBlock,
  };
}

// The mark of one change to a session (its stamp), so a phone knows its own changes from the others'.
export const newStamp = () => Math.random().toString(36).slice(2, 12);
