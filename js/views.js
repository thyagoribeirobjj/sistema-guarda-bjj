import { html } from './html.js';
import { content, findTechnique, searchTechniques, levelOf, upToBelt } from './content.js';
import { pastWeeksShown } from './week.js';
import { settings, isFavorite, progressOf } from './settings.js';
import { state } from './state.js';
import { t, text } from './strings.js';

export const heart = (filled) => html`<svg viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>`;

export const progressMarks = { learning: '◐', done: '✓' };

// ---- pieces used by several pages ----

// "White belt", "Blue belt"…
export function beltName(belt) {
  return t(`belt${belt.charAt(0).toUpperCase()}${belt.slice(1)}`);
}

export function levelOfId(id) {
  return levelOf(findTechnique(id).technique, state.media[id]?.level);
}

export const beltMark = (belt, label = false) => (label
  ? html`<i class="belt" data-belt="${belt}" role="img" aria-label="${beltName(belt)}" title="${beltName(belt)}"></i>`
  : html`<i class="belt" data-belt="${belt}" aria-hidden="true"></i>`);

export function techniqueChip(id) {
  const place = findTechnique(id);
  if (!place) return '';
  const technique = place.technique;
  const favorite = isFavorite(id);
  const progress = progressOf(id);
  return html`<button type="button" class="tech b${favorite ? ' on' : ''}" data-technique="${id}">${text(technique.n)} ${beltMark(levelOfId(id), true)}${
    progress ? html` <span class="ptag" aria-label="${t(progress)}">${progressMarks[progress]}</span>` : ''}${
    technique.mine ? html` <span class="mine">★</span>` : ''}${
    technique.g ? html` <span class="gtag">G</span>` : ''}${
    state.media[id]?.video ? html` <span class="vtag" aria-label="${t('video')}">▶</span>` : ''}${
    favorite ? html` <span class="heart" aria-label="${t('inTree')}">♥</span>` : ''}</button>`;
}

function legend() {
  return html`<div class="legend"><span><b class="mine">★</b> ${t('mine')}</span><span><b class="gtag">G</b> ${t('bookTag')}</span><span><b class="vtag">▶</b> ${t('video')}</span><span><b class="heart">♥</b> ${t('inTree')}</span><span><b class="ptag">◐</b> ${t('learning')}</span><span><b class="ptag">✓</b> ${t('done')}</span><span>${beltMark('white')}${beltMark('blue')} ${t('beltLevel')}</span></div>`;
}

// eyebrow: a small line above the title, such as "Coach" on the coach's pages.
export function intro(title, lead, extra = '', eyebrow = '') {
  return html`<div class="intro"><div>${eyebrow ? html`<p class="eyebrow">${eyebrow}</p>` : ''}<h2>${title}</h2><p>${lead}</p></div>${extra}</div>`;
}

function stageBlock(number, title, goal, body) {
  return html`<section class="stage"><div class="node" aria-hidden="true">${number}</div><div class="stage-body"><div class="stage-head"><h3>${title}</h3><span class="goal">${goal}</span></div>${body}</div></section>`;
}

function gameCard(game) {
  return html`<div class="card"><h4>${text(game.n)}${game.mine ? html` <span class="mine">★ ${t('mine')}</span>` : ''}</h4><p>${text(game.d)}</p><div class="rule"><b>${t('who')}</b><span>${text(game.who)}</span><b>${t('wins')}</b><span>${text(game.win)}</span><b>${t('time')}</b><span>${text(game.time)}</span></div></div>`;
}

// Every technique in a part of the fight, once.
function techniqueIds(module) {
  return [...new Set(module.stages.flatMap((stage) => stage.items.map((technique) => technique.id)))];
}

// ---- pages ----

// Curriculum home: one card per part of the fight, in order.
export function curriculumView() {
  const cards = content.order.map((key, i) => {
    const module = content.modules[key];
    const ids = techniqueIds(module);
    return html`<a class="card part-card" href="#${key}"><span class="part-n" aria-hidden="true">${i + 1}</span><h3>${text(module.title)}</h3><p>${text(module.intro)}</p><span class="part-count">${ids.length} ${t('techniques')}</span>${progressBar(ids)}</a>`;
  });
  return html`${intro(t('curriculum'), t('curriculumLead'))}<div class="grid parts">${cards}</div>`;
}

// With a belt picked, a part shows "up to my belt" unless the student asks for everything.
function beltFilterOn() {
  return Boolean(settings.belt) && state.beltFilter !== 'all';
}

function beltFilter() {
  if (!settings.belt) return html`<p class="note belt-hint">${t('pickBeltHint')}</p>`;
  const on = beltFilterOn();
  return html`<div class="filters belt-filter" role="group" aria-label="${t('beltLevel')}"><button type="button" class="chipbtn" data-belt-filter="mine" aria-pressed="${on}">${t('upToMyBelt')} (${beltName(settings.belt)})</button><button type="button" class="chipbtn" data-belt-filter="all" aria-pressed="${!on}">${t('everything')}</button></div>`;
}

function stageTechniques(stage) {
  const ids = stage.items.map((technique) => technique.id);
  const shown = beltFilterOn() ? ids.filter((id) => upToBelt(levelOfId(id), settings.belt)) : ids;
  if (!shown.length) return html`<p class="note">${t('nothingAtMyBelt')}</p>`;
  return html`<div class="techs">${shown.map(techniqueChip)}</div>`;
}

export function moduleView(key) {
  const module = content.modules[key];
  const stages = module.stages.map((stage, i) => stageBlock(i + 1, text(stage.name), text(stage.goal), stageTechniques(stage)));
  const games = module.games?.length
    ? html`<section class="games"><h3 class="sect-title">${t('games')}</h3><p class="sect-sub">${t('gamesLead')}</p><div class="grid">${module.games.map(gameCard)}</div></section>`
    : '';
  const ids = techniqueIds(module);
  return html`${intro(text(module.title), `${text(module.intro)} ${t('tapHint')}`, progressBar(ids))}${beltFilter()}${legend()}<div class="spine">${stages}</div>${games}`;
}

// "Got it: 3 of 24", shown once the visitor has marked something in this part.
function progressBar(ids) {
  if (!ids.some((id) => progressOf(id))) return '';
  const done = ids.filter((id) => progressOf(id) === 'done').length;
  return html`<div class="progress"><span>${t('done')}: <b>${done}</b> ${t('of')} ${ids.length}</span><div class="lad-bar"><i style="width:${Math.round((done / ids.length) * 100)}%"></i></div></div>`;
}

export function searchView() {
  const found = searchTechniques(state.search);
  if (!found.length) return html`${intro(t('searchResults'), `“${state.search}”`)}<div class="empty"><h3>${t('nothingFound')}</h3><p class="note">${t('nothingFoundHint')}</p></div>`;
  const groups = content.order.map((key) => ({ key, places: found.filter((place) => place.moduleKey === key) })).filter((group) => group.places.length);
  return html`${intro(t('searchResults'), `“${state.search}” · ${found.length} ${t(found.length === 1 ? 'foundOne' : 'found')}`)}<div class="results">${groups.map((group) => html`<section class="week"><h3 class="sect-title"><a class="plain" href="#${group.key}">${text(content.modules[group.key].title)}</a></h3>
    <div class="techs">${group.places.map((place) => techniqueChip(place.technique.id))}</div></section>`)}</div>`;
}

// "Week of 24 Nov" from "2026-11-24"; nothing when the date is missing or not a date.
function weekDate(weekOf) {
  const [year, month, day] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekOf || '')?.slice(1).map(Number) || [];
  const date = new Date(year, month - 1, day);
  if (!year || date.getMonth() !== month - 1) return '';
  return `${t('weekOf')} ${date.toLocaleDateString(settings.language === 'pt' ? 'pt-BR' : 'en-GB', { day: 'numeric', month: 'short' })}`;
}

// A past week's title sits under the "Past weeks" heading, one level down.
function weekCard(week, past = false) {
  const date = weekDate(week.weekOf);
  const title = past ? html`<h4 class="week-title">${text(week.title)}</h4>` : html`<h3 class="week-title">${text(week.title)}</h3>`;
  return html`<section class="week" data-list>${date ? html`<p class="week-date">${date}</p>` : ''}${title}
    <div class="techs">${(week.techniques || []).map(techniqueChip)}</div>
    ${text(week.note) ? html`<p class="note">${text(week.note)}</p>` : ''}</section>`;
}

// The archive is read only when someone asks for it, to keep database reads low.
function pastWeeks() {
  if (state.pastWeeksStatus === 'loading') return html`<p class="status" role="status">${t('pastWeeksLoading')}</p>`;
  if (!state.pastWeeks) {
    // Until the database is reachable there is nothing to read past weeks from.
    if (!state.online) return '';
    return html`<div class="actions"><button type="button" class="chipbtn" data-past-weeks>${t('pastWeeks')}</button>${
      state.pastWeeksStatus === 'failed' ? html`<span class="status" role="status">${t('pastWeeksFailed')}</span>` : ''}</div>`;
  }
  const weeks = pastWeeksShown(state.pastWeeks, state.week, state.weekBefore);
  return html`<h3 class="sect-title">${t('pastWeeks')}</h3>${
    weeks.length ? html`<div class="results">${weeks.map((week) => weekCard(week, true))}</div>` : html`<p class="note">${t('noPastWeeks')}</p>`}`;
}

export function weekView() {
  return html`${intro(t('week'), t('weekLead'))}${weekCard(state.week)}<div class="past-weeks">${pastWeeks()}</div>`;
}

function accountNote() {
  if (!state.online) return '';
  return html`<p class="account">${state.account ? `${t('signedInAs')} ${state.account.email}. ${t('savedToAccount')}` : t('signInToSave')}</p>`;
}

export function treeView() {
  const favorites = settings.favorites.filter((id) => findTechnique(id));
  const orderButtons = favorites.length
    ? html`<div class="filters" role="group">${['tree', 'mine'].map((order) => html`<button type="button" class="chipbtn" data-tree-order="${order}" aria-pressed="${state.treeOrder === order}">${t(order === 'tree' ? 'fightOrder' : 'myOrder')}</button>`)}</div>`
    : '';
  const top = html`${intro(t('myTree'), t('treeLead'), orderButtons)}${accountNote()}`;
  if (!favorites.length) {
    const first = content.order[0];
    return html`${top}<div class="empty"><h3>${t('treeEmpty')}</h3><p class="note">${t('treeEmptyHint')}</p><div class="actions center"><a class="primary" href="#${first}">${text(content.modules[first].title)} →</a></div></div>`;
  }
  const removeButton = (id) => html`<button type="button" class="ibtn" data-unfavorite="${id}" aria-label="${t('remove')}: ${text(findTechnique(id).technique.n)}">✕</button>`;
  const list = state.treeOrder === 'mine' ? myOrderList(favorites, removeButton) : fightOrderList(favorites, removeButton);
  const emptyAll = state.confirmEmptyTree
    ? html`<div class="confirm" role="alert"><span>${t('emptyTreeQuestion')}</span><button type="button" class="primary" data-empty-tree="yes">${t('yesEmpty')}</button><button type="button" class="chipbtn" data-empty-tree="no">${t('cancel')}</button></div>`
    : html`<div class="actions space-top"><button type="button" class="chipbtn" data-empty-tree="ask">${t('emptyTree')}</button></div>`;
  return html`${top}${list}${emptyAll}`;
}

function myOrderList(favorites, removeButton) {
  return html`<ol class="mylist">${favorites.map((id, i) => {
    const place = findTechnique(id);
    return html`<li><div class="mrow">${techniqueChip(id)}<button type="button" class="ibtn" data-move="${i}:-1" aria-label="${t('moveUp')}" ${i ? '' : 'disabled'}>↑</button><button type="button" class="ibtn" data-move="${i}:1" aria-label="${t('moveDown')}" ${i < favorites.length - 1 ? '' : 'disabled'}>↓</button>${removeButton(id)}</div><span></span><span class="note where">${text(place.module.title)} · ${text(place.stage.name)}</span></li>`;
  })}</ol>`;
}

function fightOrderList(favorites, removeButton) {
  const modules = content.order.map((key) => ({ key, places: favorites.map(findTechnique).filter((place) => place.moduleKey === key) }))
    .filter((group) => group.places.length);
  return html`<div class="spine">${modules.map((group, n) => {
    const module = content.modules[group.key];
    const stages = module.stages.map((stage, stageIndex) => {
      const here = group.places.filter((place) => place.stageIndex === stageIndex).sort((a, b) => a.index - b.index);
      return here.length ? html`<p class="goal sub">${text(stage.name)}</p><div class="techs">${here.map((place) => html`<span class="chipx">${techniqueChip(place.technique.id)}${removeButton(place.technique.id)}</span>`)}</div>` : '';
    });
    return stageBlock(n + 1, html`<a class="plain" href="#${group.key}">${text(module.title)}</a>`, `${group.places.length} ${t('techniques')}`, stages);
  })}</div>`;
}

export function methodView() {
  const method = content.method;
  return html`${intro(text(method.title), text(method.intro), '', t('coach'))}
    <div class="steps">${method.steps.map((step, i) => html`<div class="step"><div class="n">${i + 1}</div><h4>${text(step.n)} · ${step.m} min</h4><p>${text(step.d)}</p></div>`)}</div>
    <h3 class="sect-title">${t('principles')}</h3><ol class="principles">${method.principles.map((p) => html`<li><b>${text(p.b)}</b><span>${text(p.s)}</span></li>`)}</ol>
    <h3 class="sect-title">${t('ladder')}</h3><div class="ladder">${method.ladder.map((step) => html`<div><div class="pct">${step.p}</div><div class="lad-bar"><i style="width:${Number(step.w)}%"></i></div><p>${text(step.d)}</p></div>`)}</div>
    <h3 class="sect-title">${text(method.gracie.h)}</h3><ol class="principles">${method.gracie.q.map((quote) => html`<li><span class="ink">${text(quote)}</span></li>`)}</ol>
    <div class="grid"><div class="card"><h4>${text(method.rot.h)}</h4><p>${text(method.rot.d)}</p></div><div class="card"><h4>${text(method.log.h)}</h4><p>${method.log.q.map((question, i) => html`${i ? html`<br>` : ''}${i + 1}. ${text(question)}`)}</p></div></div>`;
}
