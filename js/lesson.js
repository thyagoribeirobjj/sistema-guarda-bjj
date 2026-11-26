import { html } from './html.js';
import { content } from './content.js';
import { settings, changeSettings } from './settings.js';
import { t, text } from './strings.js';
import { intro } from './views.js';
import { minutes, allGames, gameId, gameChoice, chosenGame as lessonGame, planBlocks as lessonBlocks, withClock } from './plan.js';
import { coachGames } from './coach-games.js';
import { state } from './state.js';
import { designerCard } from './designer.js';

// The coach's lesson builder: any part of the fight, one level for everyone. The choices are saved with the
// person's other settings (settings.lesson), in this browser and in their account once signed in.
let pick = { mod: '', dur: '60', items: [], game: '' };
let pickedFrom;

// Also before the TV remote opens, so it runs the plan shown here.
export function remember() {
  const { mod, dur, items, game } = pick;
  changeSettings({ lesson: { mod, dur, items, game } });
  pickedFrom = settings.lesson;
}

let firstVisit = true;

function option(value, label, selected) {
  return html`<option value="${value}" ${selected ? 'selected' : ''}>${label}</option>`;
}

const chosenGame = () => lessonGame(pick, coachGames.games);

// The coaches' own games, read once the lesson builder opens, join the list where it is: the page isn't drawn again
// under the coach. New games are added; when a fresher copy renamed or removed one, the list's choices are replaced.
// The plan is drawn again when its game is a coach's (it may have changed).
export function showCoachGames() {
  const select = document.getElementById('selGame');
  if (!select || !coachGames.loaded) return;
  const picked = pick.game;
  if (pick.game.startsWith('coach-') && !coachGames.games[pick.game]) pick.game = chosenGame()?.id || '';
  const wanted = document.createElement('select');
  wanted.innerHTML = String(html`${allGames(coachGames.games).map((entry) => gameChoice(entry, entry.id === pick.game))}`);
  const choices = (list) => [...list.options].map((option) => `${option.value} ${option.textContent}`);
  const [now, then] = [choices(select).join('\n'), choices(wanted)];
  if (now !== then.join('\n')) {
    if (now === then.slice(0, select.options.length).join('\n')) select.append(...[...wanted.options].slice(select.options.length));
    else select.replaceChildren(...wanted.options);
    select.value = pick.game;
  }
  if (pick.game !== picked || pick.game.startsWith('coach-')) redrawPlan();
}

export function lessonView() {
  // Signing in can bring a lesson saved on another device.
  if (settings.lesson !== pickedFrom) {
    pickedFrom = settings.lesson;
    pick = { mod: '', dur: '60', items: [], game: '', ...settings.lesson };
    if (!Array.isArray(pick.items)) pick.items = [];
    if (!minutes[pick.dur]) pick.dur = '60';
  }
  if (!content.modules[pick.mod]) Object.assign(pick, { mod: content.order[0], items: [] });
  if (firstVisit && !pick.items.length) pick.items = ['0-0', '0-1', '1-0'];
  firstVisit = false;
  // A coach's game isn't known until site/games is read: the choice waits for it rather than being replaced.
  pick.game = gameId(pick.game);
  if (!pick.game.startsWith('coach-') || coachGames.loaded) pick.game = chosenGame()?.id || '';
  const module = content.modules[pick.mod];
  const picks = module.stages.map((stage, si) => html`<div class="grp">${text(stage.name)}</div>${stage.items.map((item, ii) => {
    const key = `${si}-${ii}`;
    return html`<label><input type="checkbox" value="${key}" ${pick.items.includes(key) ? 'checked' : ''}><i class="dot b"></i>${text(item.n)}</label>`;
  })}`);
  return html`${intro(t('lesson'), t('lessonIntro'), '', t('coach'))}
    <div class="builder"><div class="card">
      <div class="field"><label for="selMod">${t('partOfFight')}</label><select id="selMod">${content.order.map((key) => option(key, text(content.modules[key].title), pick.mod === key))}</select></div>
      <div class="field"><label for="selDur">${t('length')}</label><select id="selDur">${option('60', '60 min', pick.dur === '60')}${option('90', '90 min', pick.dur === '90')}</select></div>
      <div class="field"><span class="lbl">${t('techniquesLabel')}</span><div class="picks" id="picks">${picks}</div></div>
      <div class="field"><label for="selGame">${t('game')}</label><select id="selGame">${allGames(coachGames.games).map((entry) => gameChoice(entry, pick.game === entry.id))}</select></div>
      ${state.admin ? html`<div class="actions"><button type="button" class="chipbtn" data-designer="open">${t('designGame')}</button><a class="chipbtn plain" href="admin.html#tv" data-lesson-to-tv>${t('runOnTv')}</a></div>` : ''}
    </div><div class="plan" id="plan">${planCard()}</div></div>${state.admin ? designerCard() : ''}`;
}

const planBlocks = () => lessonBlocks(pick, coachGames.games);

function planCard() {
  const blocks = withClock(planBlocks()).map((block) => html`<div class="block"><div class="t">${block.start}–${block.end}</div><div><h4>${text(block.title)} · ${block.minutes} min</h4>${block.list ? html`<ul>${block.list.map((line) => html`<li>${line}</li>`)}</ul>` : ''}${text(block.text) ? html`<p>${text(block.text)}</p>` : ''}</div></div>`);
  return html`<h3>${text(content.modules[pick.mod].title)}</h3><div class="meta">${pick.dur} min</div>${blocks}
    <div class="actions"><button type="button" class="primary" id="copyPlan">${t('copyPlan')}</button><span class="status" id="copyStatus" role="status"></span></div>
    <p class="note">${t('lessonTip')}</p>`;
}

export function planText() {
  const lines = [`${text(content.modules[pick.mod].title)} · ${pick.dur} min`, ''];
  for (const block of withClock(planBlocks())) {
    lines.push(`${block.start}–${block.end} min  ${text(block.title)}`);
    (block.list || []).forEach((line) => lines.push(`  - ${line}`));
    if (text(block.text)) lines.push(`  ${text(block.text)}`);
  }
  return lines.join('\n');
}

// Returns true when the whole tab should redraw, false when only the plan changed, null if not ours.
export function changeLesson(target) {
  if (target.id === 'selMod') Object.assign(pick, { mod: target.value, items: [] });
  else if (target.id === 'selDur') pick.dur = target.value;
  else if (target.id === 'selGame') pick.game = target.value;
  else if (target.closest('#picks')) pick.items = [...document.querySelectorAll('#picks input:checked')].map((box) => box.value);
  else return null;
  remember();
  return target.id === 'selMod';
}

export function redrawPlan() {
  const plan = document.getElementById('plan');
  if (plan) plan.innerHTML = planCard();
}
