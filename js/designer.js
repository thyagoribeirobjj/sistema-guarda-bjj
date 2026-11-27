import { html } from './html.js';
import { settings } from './settings.js';
import { t } from './strings.js';
import { translate } from './firebase-media.js';
import { saveCoachGame, gamesSavedAt } from './firebase-tv.js';
import { coachGames, keepCoachGame, newGameId, tellCoachGameSaved } from './coach-games.js';
import { updateTvsShowing } from './tv-follow.js';
import { allGames, findGame, gameChoice } from './plan.js';
import { limits, gameLength, clockText, clockGame, gameProblems } from './game-clock.js';

// The game designer, for admins in the lesson builder: start from a game (the curriculum's or a coach's) or a blank
// one; change its name, start, how each side wins, the parts of a round, rounds, rest, get ready and switching roles.
// Saved games go to site/games and join the lesson builder's list. The coach writes in the site's language; the
// other language is translated on save, like the admin page (a failed translation leaves it empty, so the site shows
// the coach's own words).
// design: null while closed; otherwise { id ('' until saved), from, base (the game as it started or was saved),
// game (as edited now), status, deleting }.
let design = null;
let saving = false;

const empty = () => ({ pt: '', en: '' });
const blankPart = () => ({ label: empty(), seconds: 60, say: empty() });
const blankGame = () => ({ n: empty(), start: empty(), top: empty(), bottom: empty(), parts: [blankPart()], rounds: 3, rest: 30, ready: 10, switch: true });
const copy = (game) => JSON.parse(JSON.stringify(clockGame(game)));
const otherLanguage = () => (settings.language === 'pt' ? 'en' : 'pt');
const whole = (value, [low, high]) => Math.min(high, Math.max(low, Number.parseInt(value, 10) || low));
const focus = (selector) => document.querySelector(selector)?.focus();

function startDesign(from) {
  const found = from ? findGame(from, coachGames.games) : null;
  const game = found ? copy(found) : blankGame();
  design = { id: from.startsWith('coach-') && found ? from : '', from, base: copy(game), game, status: '', deleting: false };
}

const totalLine = () => `${t('wholeGame')}: ${clockText(gameLength(design.game))}`;

function textField(id, label, value, longest, kind = 'input') {
  return kind === 'textarea'
    ? html`<div class="field"><label for="${id}">${label}</label><textarea id="${id}" maxlength="${longest}" rows="2">${value}</textarea></div>`
    : html`<div class="field"><label for="${id}">${label}</label><input id="${id}" value="${value}" maxlength="${longest}"></div>`;
}

function numberField(id, label, value, [low, high], step) {
  return html`<div class="field"><label for="${id}">${label}</label><input id="${id}" type="number" inputmode="numeric" min="${low}" max="${high}" step="${step}" value="${value}"></div>`;
}

function partFields(part, i, words) {
  return html`<div class="design-part">
    ${textField(`partLabel${i}`, `${t('part')} ${i + 1}`, words(part.label), limits.label)}
    ${numberField(`partSeconds${i}`, t('seconds'), part.seconds, limits.seconds, 5)}
    <button type="button" class="chipbtn" data-designer-remove="${i}" ${design.game.parts.length < 2 ? 'disabled' : ''}>${t('removePart')}</button>
    <div class="design-say">${textField(`partSay${i}`, t('tvSays'), words(part.say), limits.say)}</div>
  </div>`;
}

function deleteControls() {
  if (!design.id) return '';
  if (!design.deleting) return html`<button type="button" class="chipbtn" data-designer-delete="ask">${t('deleteGame')}</button>`;
  return html`<div class="confirm" role="alert"><span>${t('deleteGameQuestion')}</span>
    <button type="button" class="primary" data-designer-delete="yes">${t('yesDeleteGame')}</button>
    <button type="button" class="chipbtn" data-designer-delete="no">${t('keepGame')}</button></div>`;
}

export function designerCard() {
  if (!design) return '';
  const { game } = design;
  const words = (value) => value?.[settings.language] || '';
  const choices = allGames(coachGames.games).map((entry) => gameChoice(entry, design.from === entry.id));
  return html`<section class="card designer" id="designer" aria-labelledby="designerTitle">
    <div class="designer-head"><h3 id="designerTitle">${t('designer')}</h3><button type="button" class="chipbtn" data-designer="close">${t('closeDesigner')}</button></div>
    <p class="note">${t('designerLead')}</p>
    <div class="field"><label for="designFrom">${t('startFromGame')}</label><select id="designFrom"><option value="">${t('blankGame')}</option>${choices}</select></div>
    ${textField('designName', t('gameName'), words(game.n), limits.name)}
    ${textField('designStart', t('gameStartsIn'), words(game.start), limits.line)}
    <div class="design-two">${textField('designTop', t('topWinsBy'), words(game.top), limits.line, 'textarea')}${textField('designBottom', t('bottomWinsBy'), words(game.bottom), limits.line, 'textarea')}</div>
    <h4>${t('partsOfRound')}</h4>
    <div class="design-parts">${game.parts.map((part, i) => partFields(part, i, words))}</div>
    <div class="actions"><button type="button" class="chipbtn" data-designer="add" ${game.parts.length >= limits.parts ? 'disabled' : ''}>${t('addPart')}</button></div>
    <div class="design-three">${numberField('designRounds', t('rounds'), game.rounds, limits.rounds, 1)}${numberField('designRest', t('restSeconds'), game.rest, limits.rest, 5)}${numberField('designReady', t('readySeconds'), game.ready, limits.ready, 5)}</div>
    <label class="check"><input type="checkbox" id="designSwitch" ${game.switch ? 'checked' : ''}> ${t('switchRoles')}</label>
    <p class="design-total" id="designTotal">${totalLine()}</p>
    <div class="actions"><button type="button" class="primary" data-designer="save">${t('saveGame')}</button>${deleteControls()}
      <span class="status" id="designStatus" role="status">${design.status}</span></div>
  </section>`;
}

// Typing in the designer changes the game being made, and only the whole game's length on the page.
// Returns true when the control was the designer's.
export function designerInput(target) {
  if (!design || !target.closest?.('#designer')) return false;
  const { game } = design;
  const language = settings.language;
  const part = /^part(Label|Seconds|Say)(\d+)$/.exec(target.id);
  const texts = { designName: game.n, designStart: game.start, designTop: game.top, designBottom: game.bottom };
  const numbers = { designRounds: ['rounds', limits.rounds], designRest: ['rest', limits.rest], designReady: ['ready', limits.ready] };
  if (part) {
    const changed = game.parts[Number(part[2])];
    if (part[1] === 'Seconds') changed.seconds = whole(target.value, limits.seconds);
    else changed[part[1] === 'Label' ? 'label' : 'say'][language] = target.value;
  } else if (texts[target.id]) texts[target.id][language] = target.value;
  else if (numbers[target.id]) game[numbers[target.id][0]] = whole(target.value, numbers[target.id][1]);
  else if (target.id === 'designSwitch') game.switch = target.checked;
  else return false;
  design.status = '';
  document.getElementById('designTotal').textContent = totalLine();
  document.getElementById('designStatus').textContent = '';
  return true;
}

// "Start from": the chosen game fills the designer. Returns true when the control was the designer's.
export function designerChange(target) {
  if (target.id !== 'designFrom') return false;
  startDesign(target.value);
  return true;
}

// Each text of the game with the same text as it started (or was last saved), to know what to translate, and its
// longest length.
function textPairs(base, game) {
  const longest = { n: limits.name, start: limits.line, top: limits.line, bottom: limits.line };
  const pairs = Object.keys(longest).map((name) => [base[name], game[name], longest[name]]);
  game.parts.forEach((part, i) => pairs.push([base.parts[i]?.label, part.label, limits.label], [base.parts[i]?.say, part.say, limits.say]));
  return pairs;
}

async function translateChanged(game) {
  const from = settings.language;
  const to = otherLanguage();
  const needed = textPairs(design.base, game).filter(([before, now]) => now[from].trim() && (now[from] !== before?.[from] || !now[to].trim()));
  if (!needed.length) return true;
  try {
    const texts = await translate(needed.map(([, now]) => now[from]), from, to);
    needed.forEach(([, now, longest], i) => { now[to] = String(texts[i] || '').slice(0, longest); });
    return true;
  } catch (error) {
    console.error(error);
    needed.forEach(([, now]) => { now[to] = ''; });
    return false;
  }
}

// A saved (or deleted) game is the one the TVs showing it run from now on, and this browser's remote hears of it.
// The save itself already worked, so a failure here only waits for the next press on the phone.
async function keepAndShow(id, game) {
  const before = coachGames.games;
  const sent = Date.now();
  await saveCoachGame(id, game);
  const answered = Date.now();
  keepCoachGame(id, game);
  await updateTvsShowing(id, before, coachGames.games, () => databaseClock(sent, answered)).catch((error) => console.error(error));
  tellCoachGameSaved(id);
}

// The database's clock, from this computer's: the save was stamped by the database while it was on its way, about
// half way between sending it and its answer. Read only when a TV shows the game.
async function databaseClock(sent, answered) {
  const savedAt = await gamesSavedAt();
  const ahead = savedAt === null ? 0 : (sent + answered) / 2 - savedAt;
  return () => Date.now() - ahead;
}

async function saveDesign(redraw) {
  if (saving) return;
  const game = copy(design.game);
  if (!game.n[settings.language].trim()) {
    design.status = t('gameNeedsName');
    redraw();
    focus('#designName');
    return;
  }
  saving = true;
  document.getElementById('designStatus').textContent = t('saving');
  try {
    const translated = await translateChanged(game);
    if (gameProblems(game).length) throw new Error(`Not a game the clock can run: ${gameProblems(game).join(', ')}`);
    const id = design.id || newGameId();
    await keepAndShow(id, game);
    design = { id, from: id, base: copy(game), game: copy(game), status: t(translated ? 'gameSaved' : 'gameSavedUntranslated'), deleting: false };
  } catch (error) {
    console.error(error);
    design.status = t('saveFailed');
  } finally {
    saving = false;
  }
  redraw();
  focus('[data-designer="save"]');
}

async function deleteDesign(answer, redraw) {
  if (answer !== 'yes') {
    design.deleting = answer === 'ask';
    redraw();
    focus(`[data-designer-delete="${design.deleting ? 'no' : 'ask'}"]`);
    return;
  }
  try {
    await keepAndShow(design.id, null);
    startDesign('');
    design.status = t('gameDeleted');
  } catch (error) {
    console.error(error);
    design.status = t('saveFailed');
    design.deleting = false;
  }
  redraw();
  focus('#designFrom');
}

// The designer's buttons, for the click handler (js/actions.js); redraw draws the page again.
export function designerActions(redraw) {
  return [
    ['[data-designer="open"]', () => {
      if (!design) startDesign('');
      redraw();
      document.getElementById('designer')?.scrollIntoView({ block: 'start' });
      focus('#designFrom');
    }],
    ['[data-designer="close"]', () => { design = null; redraw(); focus('[data-designer="open"]'); }],
    ['[data-designer="add"]', () => {
      if (design.game.parts.length < limits.parts) design.game.parts.push(blankPart());
      redraw();
      focus(`#partLabel${design.game.parts.length - 1}`);
    }],
    ['[data-designer-remove]', (button) => {
      design.game.parts.splice(Number(button.dataset.designerRemove), 1);
      redraw();
      focus('[data-designer="add"]');
    }],
    ['[data-designer="save"]', () => saveDesign(redraw)],
    ['[data-designer-delete]', (button) => deleteDesign(button.dataset.designerDelete, redraw)],
  ];
}
