import { html } from './html.js';
import { content } from './content.js';
import { t, text } from './strings.js';

// The coach's lesson builder: any part of the fight, one level for everyone. Choices stay in this browser.
const storageKey = 'sg-pick5';
const pick = { mod: '', dur: '60', items: [], game: '' };
try { Object.assign(pick, JSON.parse(localStorage.getItem(storageKey)) || {}); } catch {}

function remember() {
  try { localStorage.setItem(storageKey, JSON.stringify(pick)); } catch {}
}

let firstVisit = true;
const minutes = { 60: [10, 5, 20, 15, 7, 3], 90: [15, 5, 30, 20, 15, 5] };

function allGames() {
  return content.order.flatMap((key) => (content.modules[key].games || []).map((game, i) => ({ key: `${key}:${i}`, game, moduleKey: key })));
}

function option(value, label, selected) {
  return html`<option value="${value}" ${selected ? 'selected' : ''}>${label}</option>`;
}

function chosenGame() {
  const games = allGames();
  return games.find((g) => g.key === pick.game) || games.find((g) => g.moduleKey === pick.mod) || games[0];
}

export function lessonView() {
  if (!content.modules[pick.mod]) Object.assign(pick, { mod: content.order[0], items: [] });
  if (firstVisit && !pick.items.length) pick.items = ['0-0', '0-1', '1-0'];
  firstVisit = false;
  pick.game = chosenGame()?.key || '';
  const module = content.modules[pick.mod];
  const picks = module.stages.map((stage, si) => html`<div class="grp">${text(stage.name)}</div>${stage.items.map((item, ii) => {
    const key = `${si}-${ii}`;
    return html`<label><input type="checkbox" value="${key}" ${pick.items.includes(key) ? 'checked' : ''}><i class="dot b"></i>${text(item.n)}</label>`;
  })}`);
  return html`<div class="intro"><div><h2>${t('lesson')}</h2><p>${t('lessonIntro')}</p></div></div>
    <div class="builder"><div class="card">
      <div class="field"><label for="selMod">${t('partOfFight')}</label><select id="selMod">${content.order.map((key) => option(key, text(content.modules[key].title), pick.mod === key))}</select></div>
      <div class="field"><label for="selDur">${t('length')}</label><select id="selDur">${option('60', '60 min', pick.dur === '60')}${option('90', '90 min', pick.dur === '90')}</select></div>
      <div class="field"><span class="lbl">${t('techniquesLabel')}</span><div class="picks" id="picks">${picks}</div></div>
      <div class="field"><label for="selGame">${t('game')}</label><select id="selGame">${allGames().map((g) => option(g.key, `${text(g.game.n)} · ${text(content.modules[g.moduleKey].title)}`, pick.game === g.key))}</select></div>
    </div><div class="plan" id="plan">${planCard()}</div></div>`;
}

function planBlocks() {
  const module = content.modules[pick.mod];
  const chosen = pick.items.map((key) => {
    const [si, ii] = key.split('-').map(Number);
    const stage = module.stages[si];
    return stage?.items[ii] ? { item: stage.items[ii], stage } : null;
  }).filter(Boolean);
  const game = chosenGame()?.game;
  const time = minutes[pick.dur];
  const drill = (language) => `${content.drill.b?.[language] || ''} ${content.drill.a?.[language] || ''}`.trim();
  return [
    { minutes: time[0], title: { pt: 'Aquecimento', en: 'Warm-up' }, text: { pt: 'Fuga de quadril, ponte, quedas (ukemi) e levantada técnica.', en: 'Hip escapes, bridges, breakfalls (ukemi) and technical stand-up.' } },
    { minutes: time[1], title: { pt: 'Conceito', en: 'Concept' }, text: chosen.length ? chosen[0].stage.goal : { pt: 'Escolha técnicas ao lado.', en: 'Pick techniques alongside.' } },
    { minutes: time[2], title: { pt: 'Técnicas', en: 'Techniques' }, list: chosen.length ? chosen.map((x) => text(x.item.n) + (x.item.t ? `: ${text(x.item.t)}` : '')) : [t('noneChosen')], text: { pt: drill('pt'), en: drill('en') } },
    { minutes: time[3], title: { pt: `Jogo: ${game ? text(game.n) : ''}`, en: `Game: ${game ? text(game.n) : ''}` }, text: game?.win },
    { minutes: time[4], title: { pt: 'Xadrez BJJ ou ao vivo', en: 'BJJ chess or live' }, text: { pt: 'Xadrez BJJ com 3 a 5 movimentos ou rounds ao vivo começando na posição da aula.', en: 'BJJ chess with 3 to 5 moves or live rounds starting from the class position.' } },
    { minutes: time[5], title: { pt: 'Registro', en: 'Log' }, text: { pt: content.method.log.q.map((q) => q.pt).join(' '), en: content.method.log.q.map((q) => q.en).join(' ') } },
  ];
}

function withClock(blocks) {
  let clock = 0;
  return blocks.map((block) => ({ ...block, start: clock, end: (clock += block.minutes) }));
}

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
