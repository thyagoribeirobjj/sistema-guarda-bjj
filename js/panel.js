import { html } from './html.js';
import { content, findTechnique, belts } from './content.js';
import { settings, isFavorite, progressOf } from './settings.js';
import { state } from './state.js';
import { t, text } from './strings.js';
import { heart, techniqueChip, progressMarks, beltName, minBeltOf } from './views.js';
import { noteOf, noteLength, readNotes } from './notes.js';
import { videoPreview } from './media.js';
import { loadDiagram } from './firebase.js';

// The technique, big; below it, the branches to where you can go next.
const panel = () => document.getElementById('panel');
const scrim = () => document.getElementById('scrim');
const linkKinds = ['next', 'chain', 'combo', 'counter'];
const diagrams = new Map();

// Admins attach a YouTube link and a diagram to each move right here, from any device.
function mediaControls(id, media) {
  const choices = belts.map((belt) => html`<option value="${belt}" ${media.minBelt === belt ? 'selected' : ''}>${beltName(belt)}</option>`);
  return html`<section class="media-admin"><h5><label for="minBeltChoice">${t('admin')} · ${t('minBelt')}</label></h5>
    <div class="row"><select id="minBeltChoice" data-min-belt="${id}"><option value="">${t('noMinBelt')}</option>${choices}</select></div>
    <h5>${t('admin')} · ${t('video')}</h5>
    <div class="row"><input type="url" id="videoLink" placeholder="${t('videoPlaceholder')}" value="${media.video ? `https://youtu.be/${media.video}` : ''}">
    <button type="button" class="chipbtn" data-save-video="${id}">${t('save')}</button>${media.video ? html`<button type="button" class="chipbtn" data-remove-video="${id}">${t('remove')}</button>` : ''}</div>
    <h5>${t('admin')} · ${t('diagram')}</h5>
    <div class="row"><label class="chipbtn">${t(media.diagram ? 'replaceDiagram' : 'addDiagram')}<input type="file" accept="image/*" data-diagram-file="${id}" hidden></label>${
      media.diagram ? html`<button type="button" class="chipbtn" data-remove-diagram="${id}">${t('remove')}</button>` : ''}</div>
    <p class="status" id="mediaStatus" role="status"></p></section>`;
}

async function showDiagram(id) {
  const slot = document.getElementById('panelDiagram');
  if (!slot) return;
  if (!diagrams.has(id)) diagrams.set(id, await loadDiagram(id).catch(() => null));
  const image = diagrams.get(id);
  if (image && state.panel.current === id) slot.innerHTML = html`<img src="${image}" alt="${t('diagram')}">`;
}

export function forgetDiagram(id) {
  diagrams.delete(id);
}

// Previous and next in the list the technique was opened from (a part, the week, search results, my tree).
function stepButtons(id) {
  const { list } = state.panel;
  const at = list.indexOf(id);
  if (at < 0 || list.length < 2) return '';
  const button = (step, label, sign) => {
    const target = list[at + step];
    return html`<button type="button" class="step" data-step="${step}" ${target ? html`aria-label="${t(label)}: ${text(findTechnique(target).technique.n)}"` : html`aria-label="${t(label)}" disabled`}>${sign}</button>`;
  };
  return html`<div class="panel-steps">${button(-1, 'previous', '‹')}<span class="step-count">${at + 1} / ${list.length}</span>${button(1, 'nextTechnique', '›')}</div>`;
}

// Only for the student: coaches don't see notes.
function notesBox(id) {
  return html`<h5><label for="noteBox">${t('myNotes')}</label></h5>
    <textarea class="notebox" id="noteBox" data-note="${id}" maxlength="${noteLength}" rows="3" placeholder="${t('notePlaceholder')}">${noteOf(id)}</textarea>
    <p class="note-hint" id="noteStatus" role="status">${t(state.account ? 'notesPrivate' : 'notesOnDevice')}</p>`;
}

function panelContent(id) {
  const { technique, module, stage, stageIndex } = findTechnique(id);
  const favorite = isFavorite(id);
  const media = state.media[id] || {};
  const drill = technique.dr ? text(technique.dr) : `${text(content.drill.b)} ${text(content.drill.a)}`.trim();
  const steps = (technique.s || []).map((pair) => html`<li>${settings.language === 'pt' ? pair[0] : pair[1]}</li>`);
  const links = linkKinds.map((kind) => {
    const targets = (technique.links || []).filter(([, linkKind]) => linkKind === kind);
    return targets.length ? html`<h5 class="grp">${t('whereTo')} · ${t(kind)}</h5><div class="next">${targets.map(([target]) => techniqueChip(target))}</div>` : '';
  });
  const nextStage = module.stages[stageIndex + 1];
  return html`<div class="panel-top"><button type="button" class="pback" id="panelBack" ${state.panel.history.length ? '' : 'hidden'}>← ${t('back')}</button>${stepButtons(id)}</div>
    <button type="button" class="close" id="panelClose" aria-label="${t('close')}">×</button>
    ${technique.mine ? html`<span class="mine">★ ${t('mine')}</span> ` : ''}${technique.g ? html`<span class="gtag">G</span>` : ''}
    <h3 id="panelTitle">${text(technique.n)}</h3>
    <div class="from">${text(module.title)} · ${t('stage')} ${stageIndex + 1}: ${text(stage.name)}${minBeltOf(id) ? ` · ${t('minBelt')}: ${beltName(minBeltOf(id))}` : ''}</div>
    <div class="actions panel-actions"><button type="button" class="fav-btn" data-favorite="${id}" aria-pressed="${favorite}">${heart(favorite)}${t(favorite ? 'inTree' : 'addToTree')}</button>
    <button type="button" class="chipbtn" data-share="${id}">${t('share')}</button><span class="status" id="shareStatus" role="status"></span></div>
    <div class="marks" role="group" aria-label="${t('myProgress')}">${['learning', 'done'].map((mark) => html`<button type="button" class="chipbtn" data-progress="${id}:${mark}" aria-pressed="${progressOf(id) === mark}">${progressMarks[mark]} ${t(mark)}</button>`)}</div>
    ${notesBox(id)}
    ${videoPreview(media.video)}
    ${media.diagram ? html`<div class="diagram" id="panelDiagram"></div>` : ''}
    <h5>${t('whatItIs')}</h5><p>${text(technique.d)}</p>
    ${steps.length ? html`<h5>${t('steps')}</h5><ol class="steplist">${steps}</ol>` : ''}
    ${technique.t ? html`<h5>${t('keyPoint')}</h5><p class="key-p">${text(technique.t)}</p>` : ''}
    <h5>${t('drill')}</h5><p>${drill}</p>
    ${technique.g || technique.bk ? html`<p class="note">${t('bookReference')}</p>` : ''}
    ${links}
    ${nextStage ? html`<h5>${t('nextStage')} · ${text(nextStage.name)}</h5><div class="next">${nextStage.items.map((item) => techniqueChip(item.id))}</div>` : ''}
    ${state.admin ? mediaControls(id, media) : ''}`;
}

// list: the techniques next and previous move through. Without one, a technique opened from outside the panel
// moves through the techniques on the page behind it; one opened from inside the panel keeps the list it had.
export function openPanel(id, { remember = true, focus = '#panelClose', list } = {}) {
  if (!findTechnique(id)) return;
  if (remember && state.panel.current && state.panel.current !== id) state.panel.history.push(state.panel.current);
  const wasOpen = panelOpen();
  if (list) state.panel.list = list;
  else if (!wasOpen) state.panel.list = techniquesIn(document.getElementById('main'));
  state.panel.current = id;
  panel().innerHTML = panelContent(id);
  panel().hidden = false;
  scrim().hidden = false;
  document.documentElement.classList.add('panel-open');
  panel().scrollTop = 0;
  // Opening a technique adds one step to the browser's history, so the phone's back button closes it.
  // Moving between techniques inside the panel replaces that step. { panel: true } marks a step the site added.
  if (location.hash !== `#t-${id}`) {
    if (wasOpen) history.replaceState(history.state, '', `#t-${id}`);
    else history.pushState({ panel: true }, '', `#t-${id}`);
  }
  if (state.media[id]?.diagram) showDiagram(id);
  (panel().querySelector(focus) || panel().querySelector('#panelClose')).focus();
  readNotes().then((changed) => {
    const box = document.getElementById('noteBox');
    if (changed && box && document.activeElement !== box) box.value = noteOf(box.dataset.note);
  });
}

export function techniquesIn(element) {
  return [...new Set([...element.querySelectorAll('[data-technique]')].map((chip) => chip.dataset.technique))];
}

// Moving to the previous or next technique replaces the panel's step in the history, so Back still closes it.
export function stepPanel(step) {
  const { list, current } = state.panel;
  const target = list.includes(current) && list[list.indexOf(current) + step];
  if (target) openPanel(target, { remember: false, focus: `[data-step="${step}"]:not(:disabled)` });
}

// Redraws the open technique; focus says which button keeps the keyboard focus.
export function redrawPanel(focus = '[data-favorite]') {
  if (state.panel.current) openPanel(state.panel.current, { remember: false, focus });
}

export function panelBack() {
  if (state.panel.history.length) openPanel(state.panel.history.pop(), { remember: false });
}

// fromHistory: the back button (or another link) already left the technique's step in the history.
export function closePanel({ fromHistory = false } = {}) {
  panel().hidden = true;
  scrim().hidden = true;
  document.documentElement.classList.remove('panel-open');
  state.panel = { current: null, history: [], list: [] };
  if (fromHistory) return;
  // A technique opened from a shared link has no step of ours to go back to: going back would leave the site.
  if (history.state?.panel) history.back();
  else history.replaceState(null, '', `#${state.view}`);
}

export function panelOpen() {
  return !panel().hidden;
}

export const typing = (element) => element.matches?.('input, textarea, select, [contenteditable]');

// Swiping an open technique left or right moves to the next or previous one.
let swipeStart = null;
panel().addEventListener('touchstart', (event) => {
  swipeStart = event.touches.length === 1 && !typing(event.target) ? event.touches[0] : null;
}, { passive: true });
panel().addEventListener('touchend', (event) => {
  if (!swipeStart) return;
  const end = event.changedTouches[0];
  const across = end.clientX - swipeStart.clientX;
  const down = end.clientY - swipeStart.clientY;
  swipeStart = null;
  if (Math.abs(across) > 60 && Math.abs(across) > 2 * Math.abs(down)) stepPanel(across < 0 ? 1 : -1);
}, { passive: true });
