import { html } from './html.js';
import { signIn, loadWeek, saveWeek, loadPastWeeks } from './firebase.js';
import { signOutOnPurpose } from './delete-data.js';
import { settings } from './settings.js';
import { t } from './strings.js';
import { translatedFields, translationPlan, answerPlan, handFixedAfter, writtenAfter, translationLabel } from './translation.js';
import { localDate, firstStart, dateProblem, classOf } from './week.js';
import { page, accountLine, field } from './admin-page.js';
import { fieldLabel, question, techniquePicker, startFromPast, nextWeekStatus } from './admin-week-view.js';
import { startPreparedWeek, fillTranslations, archiveIfNew } from './admin-saving.js';

// The admin page's class of the week: this week's and next week's forms, their translations and saving them
// (js/admin.js opens it once the admin is known).
const main = document.getElementById('main');
const emptyClass = () => ({ weekOf: '', title: {}, note: {}, techniques: [], handFixed: [] });
// Two forms: this week ('week') and next week ('next'). For each, what is saved (null: next week not prepared),
// what is in the form now, and the basis the translation decisions compare with: the saved class, or the past week
// the admin started from.
const forms = { week: { saved: emptyClass(), draft: emptyClass(), basis: emptyClass() }, next: { saved: null, draft: emptyClass(), basis: emptyClass() } };
let showing = 'week';
let { saved, draft: week, basis } = forms.week;
let writingIn = 'pt';
const editing = new Set(); // translation editors open now
let asking = null; // the fields the admin is being asked about
let saving = false;
let confirmingCancel = false;
let pastWeeks = null; // read when the admin asks to start from one
const otherLanguage = () => (writingIn === 'pt' ? 'en' : 'pt');

// The field in the language the admin writes in, with its translation underneath.
function writingField(name, kind = 'text') {
  return html`${field(name, `${fieldLabel(name)} (${writingIn.toUpperCase()})`, week[name]?.[writingIn] || '', kind)}${translationLine(name, kind)}`;
}

// The translation as a quiet line with an "Edit translation" button, or, once opened, as its own input.
function translationLine(name, kind) {
  const other = otherLanguage();
  const translation = week[name]?.[other] || '';
  if (editing.has(name)) {
    return html`<div class="translation-edit">${field(`${name}-translation`, `${t('translation')} (${other.toUpperCase()})`, translation, kind)}
      <button type="button" class="linkbtn" data-done="${name}">${t('doneEditing')}</button></div>`;
  }
  if (!translation && !basis[name]?.[writingIn]) return '';
  const label = translationLabel(basis, name, translation, other);
  const shown = translation ? html`<span><b>${other.toUpperCase()}:</b> ${translation}</span> ${label ? html`<i>${t(label)}</i>` : ''}` : '';
  return html`<p class="translation">${shown} <button type="button" class="linkbtn" data-edit="${name}">${t('editTranslation')}</button></p>`;
}


function showForm(email, status = '') {
  const languageButtons = ['pt', 'en'].map((language) => html`<button type="button" class="chipbtn" data-writing="${language}" aria-pressed="${writingIn === language}">${language.toUpperCase()}</button>`);
  const formButtons = ['week', 'next'].map((which) => html`<button type="button" class="chipbtn" data-form="${which}" aria-pressed="${showing === which}">${t(which === 'week' ? 'thisWeekForm' : 'nextWeekForm')}</button>`);
  page(html`<p class="sect-sub">${t('adminLead')}</p>${accountLine(email)}
    <p class="actions"><a class="chipbtn plain" href="#tv">📺 ${t('runOnTv')}</a></p>
    <div class="filters admin-forms" role="group">${formButtons}</div>${nextWeekStatus(showing === 'next', saved, confirmingCancel)}
    <form class="form card" id="weekForm">
      <div class="field"><span class="lbl">${t('writingIn')}</span><div class="filters" role="group">${languageButtons}</div></div>
      ${startFromPast(pastWeeks)}
      ${field('weekOf', t(showing === 'next' ? 'startsOn' : 'weekOf'), week.weekOf || '', 'date')}
      ${writingField('title')}
      ${writingField('note', 'textarea')}
      <div class="field"><span class="lbl">${t('pickTechniques')}</span><div class="picks" id="picks">${techniquePicker(week.techniques || [])}</div></div>
      ${question(asking)}
      <div class="actions"><button type="submit" class="primary">${t('save')}</button><span class="status" id="status" role="status">${status}</span></div>
    </form>`);
}

// The week as the form shows it now. The language not on screen keeps what is already in memory.
function readForm() {
  const value = (id) => document.getElementById(id)?.value.trim();
  const draft = {
    weekOf: value('weekOf'),
    techniques: [...document.querySelectorAll('#picks input:checked')].map((box) => box.value),
  };
  for (const name of translatedFields) {
    draft[name] = { pt: '', en: '', ...week[name], [writingIn]: value(name) };
    const translation = value(`${name}-translation`);
    if (translation !== undefined) draft[name][otherLanguage()] = translation;
  }
  return draft;
}

function showFormOf(which) {
  forms[showing] = { saved, draft: week, basis };
  showing = which;
  ({ saved, draft: week, basis } = forms[which]);
  editing.clear();
  asking = null;
  confirmingCancel = false;
}

// Both forms from site/week as stored. What is being typed in them is replaced.
function useStored(stored) {
  const current = classOf(stored);
  const next = stored.next ? classOf(stored.next) : null;
  forms.week = { saved: current, draft: current, basis: current };
  forms.next = { saved: next, draft: next || { ...emptyClass(), weekOf: firstStart(localDate(), current.weekOf) }, basis: next || emptyClass() };
  ({ saved, draft: week, basis } = forms[showing]);
  editing.clear();
  asking = null;
  confirmingCancel = false;
}

// While a save runs the form is locked, so a second click or anything typed meanwhile can't be lost.
function lockForm(locked) {
  for (const control of document.getElementById('weekForm').elements) control.disabled = locked;
}

const focusSaveButton = () => document.querySelector('#weekForm [type="submit"]')?.focus();

// site/week is read fresh before every change, since another admin may have saved since this page opened; if that
// read fails, nothing is saved. If the prepared week started meanwhile, it is switched first and nothing else saved.
async function freshWeek() {
  const stored = (await loadWeek({ fresh: true })) || {};
  const switched = await startPreparedWeek(stored);
  if (switched === null) return stored;
  if (switched) useStored(switched);
  showForm(main.dataset.email, t(switched ? 'nextStartedSaveAgain' : 'nextStartFailed'));
  return null;
}

// answer is the admin's reply to the question ('translate' or 'keep'); a plain Save starts over without one.
async function save(answer) {
  if (saving) return;
  week = readForm();
  const draft = week;
  const problem = dateProblem(showing, draft.weekOf, { today: localDate(), thisWeekOf: forms.week.saved?.weekOf, nextWeekOf: forms.next.saved?.weekOf });
  if (problem) {
    document.getElementById('status').textContent = t(problem);
    document.getElementById('weekOf').focus();
    return;
  }
  const from = writingIn;
  const to = otherLanguage();
  const handFixed = basis.handFixed || [];
  const plan = translationPlan({ saved: basis, draft, from, to, handFixed });
  const asks = translatedFields.filter((name) => plan[name] === 'ask');
  if (asks.length && !answer) {
    asking = asks;
    showForm(main.dataset.email);
    document.querySelector('[data-answer]').focus();
    return;
  }
  asking = null;
  const steps = answerPlan(plan, answer);
  const status = document.getElementById('status');
  saving = true;
  lockForm(true);
  try {
    const translatedOk = await fillTranslations(draft, steps, from, to);
    status.textContent = t('saving');
    const doc = { ...draft, from, handFixed: handFixedAfter(steps, handFixed, { saved: basis, to }), written: writtenAfter({ saved: basis, draft, from, to }) };
    const stored = await freshWeek();
    if (!stored) return;
    let archivedOk = true;
    if (showing === 'week') {
      // The same class with a corrected date is not a new week.
      archivedOk = await archiveIfNew(classOf(stored), doc);
      await saveWeek(stored.next ? { ...doc, next: stored.next } : doc);
    } else {
      await saveWeek({ ...classOf(stored), next: doc });
    }
    saved = doc;
    week = doc;
    basis = doc;
    editing.clear();
    const messages = [t(translatedOk ? 'saved' : 'translateFailed'), archivedOk ? '' : t('archiveFailed')];
    showForm(main.dataset.email, messages.filter(Boolean).join(' '));
  } catch (error) {
    console.error(error);
    lockForm(false);
    document.getElementById('status').textContent = t('saveFailed');
  } finally {
    saving = false;
  }
  focusSaveButton();
}

async function cancelNext() {
  if (saving) return;
  saving = true;
  document.getElementById('status').textContent = t('saving');
  try {
    const stored = await freshWeek();
    if (!stored) return;
    await saveWeek(classOf(stored));
    useStored(classOf(stored));
    showForm(main.dataset.email, t('nextCancelled'));
  } catch (error) {
    console.error(error);
    document.getElementById('status').textContent = t('saveFailed');
  } finally {
    saving = false;
  }
  document.querySelector('[data-form="next"]').focus();
}

async function showPastWeeks() {
  try {
    pastWeeks = await loadPastWeeks({ fresh: true });
  } catch (error) {
    console.error(error);
    document.getElementById('status').textContent = t('pastWeeksFailed');
    return;
  }
  redraw(() => {});
  (document.getElementById('reuseWeek') || document.getElementById('weekOf')).focus();
}

// The past week's class, its text in both languages and how it was written, fill the form; the date stays.
function startFrom(past) {
  redraw(() => {
    week = { ...week, title: { pt: '', en: '', ...past.title }, note: { pt: '', en: '', ...past.note }, techniques: [...(past.techniques || [])] };
    basis = { ...past, handFixed: past.handFixed || [] };
    editing.clear();
    asking = null;
  }, t('filledFromPast'));
  document.getElementById('title').focus();
}

main.addEventListener('submit', (event) => {
  event.preventDefault();
  save(null);
});

// Every button that redraws the form reads it into memory first, so nothing typed is lost.
function redraw(change, status = '') {
  week = readForm();
  change();
  showForm(main.dataset.email, status);
}

main.addEventListener('change', (event) => {
  if (event.target.id === 'reuseWeek' && event.target.value) startFrom(pastWeeks[Number(event.target.value)]);
});

main.addEventListener('click', (event) => {
  const writing = event.target.closest('[data-writing]');
  const which = event.target.closest('[data-form]');
  const edit = event.target.closest('[data-edit]');
  const done = event.target.closest('[data-done]');
  const answer = event.target.closest('[data-answer]');
  const cancel = event.target.closest('[data-cancel-next]');
  if (writing) {
    redraw(() => { writingIn = writing.dataset.writing; asking = null; });
    document.querySelector(`[data-writing="${writingIn}"]`).focus();
  }
  if (which && !saving) {
    redraw(() => showFormOf(which.dataset.form));
    document.querySelector(`[data-form="${showing}"]`).focus();
  }
  if (edit) {
    const name = edit.dataset.edit;
    redraw(() => editing.add(name));
    document.getElementById(`${name}-translation`).focus();
  }
  if (done) {
    const name = done.dataset.done;
    redraw(() => editing.delete(name));
    (document.querySelector(`[data-edit="${name}"]`) || document.getElementById(name)).focus();
  }
  if (cancel) {
    if (cancel.dataset.cancelNext === 'yes') cancelNext();
    else {
      redraw(() => { confirmingCancel = cancel.dataset.cancelNext === 'ask'; });
      document.querySelector(confirmingCancel ? '[data-cancel-next="no"]' : '[data-cancel-next="ask"]').focus();
    }
  }
  if (event.target.closest('[data-reuse]')) showPastWeeks();
  if (answer) save(answer.dataset.answer);
  if (event.target.id === 'signIn') signIn().catch(() => alert(t('signInFailed')));
  if (event.target.id === 'signOut') signOutOnPurpose();
});

// The admin page always reads site/week fresh, and starts a prepared week whose date has come.
export async function openWeek(email) {
  page(html`<p class="status" role="status">${t('loading')}</p>`);
  let notice = '';
  const stored = (await loadWeek({ fresh: true }).catch(() => null)) || {};
  const switched = await startPreparedWeek(stored);
  useStored(switched || stored);
  if (switched) notice = t('nextStarted');
  if (switched === false) notice = t('nextStartFailed');
  writingIn = basis.from || forms.week.basis.from || settings.language;
  showForm(email, notice);
}
