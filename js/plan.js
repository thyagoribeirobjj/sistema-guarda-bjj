import { html } from './html.js';
import { content } from './content.js';
import { t, text } from './strings.js';

// A lesson plan from the lesson builder's choices ({ mod, dur, items, game }, as in settings.lesson): its timed
// blocks and its game. Used by the lesson builder (js/lesson.js) and to run the whole class on the TV (js/tv-show.js).
export const minutes = { 60: [10, 5, 20, 15, 7, 3], 90: [15, 5, 30, 20, 15, 5] };
// The game is the plan's fourth block.
export const gameBlock = 3;

// Every game the lesson builder offers: the curriculum's (with their part of the fight), then the coaches' own
// (site/games, js/coach-games.js), which have no part of the fight.
export function allGames(coachGames = {}) {
  const curriculum = content.order.flatMap((key) => (content.modules[key].games || []).map((game) => ({ id: game.id, game, moduleKey: key })));
  return [...curriculum, ...Object.entries(coachGames).map(([id, game]) => ({ id, game, moduleKey: '' }))];
}

// A game's line in a list of games: its name and part of the fight, or "coach's game".
export function gameChoice(entry, selected) {
  const where = entry.moduleKey ? text(content.modules[entry.moduleKey].title) : t('coachGame');
  return html`<option value="${entry.id}" ${selected ? 'selected' : ''}>${text(entry.game.n)} · ${where}</option>`;
}

// Older lessons named their game by its part of the fight and place ('top:0'); now it is the game's id.
export function gameId(saved) {
  const old = /^([a-z0-9-]+):(\d+)$/.exec(saved || '');
  return old ? content.modules[old[1]]?.games?.[Number(old[2])]?.id || '' : saved || '';
}

export function findGame(id, coachGames = {}) {
  return allGames(coachGames).find((entry) => entry.id === id)?.game || null;
}

// The lesson's game, or else the first game of its part of the fight, or else the first of all.
export function chosenGame(lesson, coachGames = {}) {
  const games = allGames(coachGames);
  const id = gameId(lesson.game);
  return games.find((entry) => entry.id === id) || games.find((entry) => entry.moduleKey === lesson.mod) || games[0];
}

// How each side wins: the curriculum's games say it in one line; a coach's game has it per side.
export function winText(game) {
  if (game?.win) return game.win;
  if (!game?.top) return null;
  const both = (language) => [game.top[language], game.bottom[language]].filter(Boolean).join(' · ');
  return { pt: both('pt'), en: both('en') };
}

export function lessonModule(lesson) {
  return content.modules[lesson.mod] ? lesson.mod : content.order[0];
}

export function planBlocks(lesson, coachGames = {}) {
  const module = content.modules[lessonModule(lesson)];
  const chosen = (lesson.items || []).map((key) => {
    const [si, ii] = String(key).split('-').map(Number);
    const stage = module.stages[si];
    return stage?.items[ii] ? { item: stage.items[ii], stage } : null;
  }).filter(Boolean);
  const game = chosenGame(lesson, coachGames)?.game;
  const time = minutes[lesson.dur] || minutes[60];
  const drill = (language) => `${content.drill.b?.[language] || ''} ${content.drill.a?.[language] || ''}`.trim();
  return [
    { minutes: time[0], title: { pt: 'Aquecimento', en: 'Warm-up' }, text: { pt: 'Fuga de quadril, ponte, quedas (ukemi) e levantada técnica.', en: 'Hip escapes, bridges, breakfalls (ukemi) and technical stand-up.' } },
    { minutes: time[1], title: { pt: 'Conceito', en: 'Concept' }, text: chosen.length ? chosen[0].stage.goal : { pt: 'Escolha técnicas ao lado.', en: 'Pick techniques alongside.' } },
    { minutes: time[2], title: { pt: 'Técnicas', en: 'Techniques' }, list: chosen.length ? chosen.map((x) => text(x.item.n) + (x.item.t ? `: ${text(x.item.t)}` : '')) : [t('noneChosen')], techniques: chosen.map((x) => ({ n: x.item.n, t: x.item.t || null })), text: { pt: drill('pt'), en: drill('en') } },
    { minutes: time[3], title: { pt: `Jogo: ${game ? text(game.n) : ''}`, en: `Game: ${game ? text(game.n) : ''}` }, text: winText(game), game },
    { minutes: time[4], title: { pt: 'Xadrez BJJ ou ao vivo', en: 'BJJ chess or live' }, text: { pt: 'Xadrez BJJ com 3 a 5 movimentos ou rounds ao vivo começando na posição da aula.', en: 'BJJ chess with 3 to 5 moves or live rounds starting from the class position.' } },
    { minutes: time[5], title: { pt: 'Registro', en: 'Log' }, text: { pt: content.method.log.q.map((q) => q.pt).join(' '), en: content.method.log.q.map((q) => q.en).join(' ') } },
  ];
}

export function withClock(blocks) {
  let clock = 0;
  return blocks.map((block) => ({ ...block, start: clock, end: (clock += block.minutes) }));
}
