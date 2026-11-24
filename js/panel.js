import { html } from './html.js';
import { content, findTechnique } from './content.js';
import { settings, isFavorite, progressOf } from './settings.js';
import { state } from './state.js';
import { t, text } from './strings.js';
import { heart, techniqueChip, progressMarks } from './views.js';
import { videoPreview } from './media.js';
import { loadDiagram } from './firebase.js';

// The technique, big; below it, the branches to where you can go next.
const panel = () => document.getElementById('panel');
const scrim = () => document.getElementById('scrim');
const linkKinds = ['next', 'chain', 'combo', 'counter'];
const diagrams = new Map();

// Admins attach a YouTube link and a diagram to each move right here, from any device.
function mediaControls(id, media) {
  return html`<section class="media-admin"><h5>${t('admin')} · ${t('video')}</h5>
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
  return html`<div class="panel-top"><button type="button" class="pback" id="panelBack" ${state.panel.history.length ? '' : 'hidden'}>← ${t('back')}</button></div>
    <button type="button" class="close" id="panelClose" aria-label="${t('close')}">×</button>
    ${technique.mine ? html`<span class="mine">★ ${t('mine')}</span> ` : ''}${technique.g ? html`<span class="gtag">G</span>` : ''}
    <h3 id="panelTitle">${text(technique.n)}</h3>
    <div class="from">${text(module.title)} · ${t('stage')} ${stageIndex + 1}: ${text(stage.name)}</div>
    <div class="actions panel-actions"><button type="button" class="fav-btn" data-favorite="${id}" aria-pressed="${favorite}">${heart(favorite)}${t(favorite ? 'inTree' : 'addToTree')}</button>
    <button type="button" class="chipbtn" data-share="${id}">${t('share')}</button><span class="status" id="shareStatus" role="status"></span></div>
    <div class="marks" role="group" aria-label="${t('myProgress')}">${['learning', 'done'].map((mark) => html`<button type="button" class="chipbtn" data-progress="${id}:${mark}" aria-pressed="${progressOf(id) === mark}">${progressMarks[mark]} ${t(mark)}</button>`)}</div>
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

export function openPanel(id, { remember = true, focus = '#panelClose' } = {}) {
  if (!findTechnique(id)) return;
  if (remember && state.panel.current && state.panel.current !== id) state.panel.history.push(state.panel.current);
  const wasOpen = panelOpen();
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
  panel().querySelector(focus)?.focus();
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
  state.panel = { current: null, history: [] };
  if (fromHistory) return;
  // A technique opened from a shared link has no step of ours to go back to: going back would leave the site.
  if (history.state?.panel) history.back();
  else history.replaceState(null, '', `#${state.view}`);
}

export function panelOpen() {
  return !panel().hidden;
}
