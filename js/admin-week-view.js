import { html } from './html.js';
import { content, findTechnique } from './content.js';
import { settings } from './settings.js';
import { t, text } from './strings.js';

// The pieces of the admin page's week form that only show what they are given (js/admin-week.js keeps the form).

export const fieldLabel = (name) => t(name === 'title' ? 'weekTitle' : 'note');
const dayName = (date) => new Date(`${date}T12:00`).toLocaleDateString(settings.language === 'pt' ? 'pt-BR' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

// asking: the fields the admin is being asked about, or null.
export function question(asking) {
  if (!asking) return '';
  const names = asking.map(fieldLabel).join(', ');
  return html`<div class="confirm" role="alert"><span><b>${names}:</b> ${t(asking.length > 1 ? 'handFixedChangedBoth' : 'handFixedChanged')}</span>
    <button type="button" class="primary" data-answer="translate">${t('translateAgain')}</button>
    <button type="button" class="chipbtn" data-answer="keep">${t('keepMyTranslation')}</button></div>`;
}

// Each technique once, in the tab where it is written (shared techniques also show up in other tabs). chosen: their ids.
export function techniquePicker(chosen) {
  return content.order.map((key) => {
    const module = content.modules[key];
    return html`<div class="grp">${text(module.title)}</div>${module.stages.map((stage) => {
      const own = stage.items.filter((item) => findTechnique(item.id).moduleKey === key);
      return own.map((item) => html`<label><input type="checkbox" value="${item.id}" ${chosen.includes(item.id) ? 'checked' : ''}><i class="dot b"></i>${text(item.n)} · ${text(stage.name)}</label>`);
    })}`;
  });
}

// "Start from a past week": a button, then (once past weeks are read) a list to pick one from.
export function startFromPast(pastWeeks) {
  if (!pastWeeks) return html`<div class="field"><button type="button" class="chipbtn" data-reuse>${t('startFromPast')}</button></div>`;
  if (!pastWeeks.length) return html`<p class="note">${t('noPastWeeks')}</p>`;
  const options = pastWeeks.map((past, i) => html`<option value="${i}">${past.weekOf} · ${text(past.title)}</option>`);
  return html`<div class="field"><label for="reuseWeek">${t('startFromPast')}</label><select id="reuseWeek"><option value="">${t('pickPastWeek')}</option>${options}</select></div>`;
}

// Next week: whether one is prepared (prepared: the saved next week, or null), and a way to cancel it.
export function nextWeekStatus(showingNext, prepared, confirmingCancel) {
  if (!showingNext) return '';
  if (!prepared) return html`<p class="sect-sub">${t('nextWeekLead')} ${t('nextNotReady')}</p>`;
  const cancel = confirmingCancel
    ? html`<div class="confirm" role="alert"><span>${t('cancelNextQuestion')}</span><button type="button" class="primary" data-cancel-next="yes">${t('yesCancelNext')}</button><button type="button" class="chipbtn" data-cancel-next="no">${t('keepIt')}</button></div>`
    : html`<button type="button" class="chipbtn" data-cancel-next="ask">${t('cancelNext')}</button>`;
  return html`<p class="sect-sub">${t('nextWeekLead')}</p><div class="next-ready"><span>${t('nextReady')} <b>${dayName(prepared.weekOf)}</b>.</span> ${cancel}</div>`;
}
