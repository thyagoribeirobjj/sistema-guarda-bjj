import { html } from './html.js';
import { content, findTechnique } from './content.js';
import { settings, isFavorite } from './settings.js';
import { state } from './state.js';
import { t, text } from './strings.js';
import { heart, techniqueChip } from './views.js';

// The technique, big; below it, the branches to where you can go next.
const panel = () => document.getElementById('panel');
const scrim = () => document.getElementById('scrim');
const linkKinds = ['next', 'chain', 'combo', 'counter'];

function panelContent(id) {
  const { technique, module, stage, stageIndex } = findTechnique(id);
  const favorite = isFavorite(id);
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
    <button type="button" class="fav-btn" data-favorite="${id}" aria-pressed="${favorite}">${heart(favorite)}${t(favorite ? 'inTree' : 'addToTree')}</button>
    <h5>${t('whatItIs')}</h5><p>${text(technique.d)}</p>
    ${steps.length ? html`<h5>${t('steps')}</h5><ol class="steplist">${steps}</ol>` : ''}
    ${technique.t ? html`<h5>${t('keyPoint')}</h5><p class="key-p">${text(technique.t)}</p>` : ''}
    <h5>${t('drill')}</h5><p>${drill}</p>
    ${technique.g || technique.bk ? html`<p class="note">${t('bookReference')}</p>` : ''}
    ${links}
    ${nextStage ? html`<h5>${t('nextStage')} · ${text(nextStage.name)}</h5><div class="next">${nextStage.items.map((item) => techniqueChip(item.id))}</div>` : ''}`;
}

export function openPanel(id, { remember = true, focus = 'close' } = {}) {
  if (!findTechnique(id)) return;
  if (remember && state.panel.current && state.panel.current !== id) state.panel.history.push(state.panel.current);
  state.panel.current = id;
  panel().innerHTML = panelContent(id);
  panel().hidden = false;
  scrim().hidden = false;
  panel().scrollTop = 0;
  history.replaceState(null, '', `#t-${id}`);
  panel().querySelector(focus === 'favorite' ? '[data-favorite]' : '#panelClose')?.focus();
}

export function redrawPanel() {
  if (state.panel.current) openPanel(state.panel.current, { remember: false, focus: 'favorite' });
}

export function panelBack() {
  if (state.panel.history.length) openPanel(state.panel.history.pop(), { remember: false });
}

export function closePanel() {
  panel().hidden = true;
  scrim().hidden = true;
  state.panel = { current: null, history: [] };
  history.replaceState(null, '', `#${state.view}`);
}

export function panelOpen() {
  return !panel().hidden;
}
