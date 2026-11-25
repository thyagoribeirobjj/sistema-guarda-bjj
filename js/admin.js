import { html } from './html.js';
import { content, loadContent, findTechnique } from './content.js';
import { startFirebase, onAccountChange, signIn, signOut, isAdmin, loadWeek, saveWeek, archiveWeek, loadPastWeeks, translate } from './firebase.js';
import { settings, applyTheme, useAccount } from './settings.js';
import { t, text } from './strings.js';
import { translatedFields, translationPlan, answerPlan, handFixedAfter, writtenAfter, translationLabel } from './translation.js';
import { localDate, firstStart, dateProblem, classOf, switchOver, worthArchiving } from './week.js';
import { showStudents, hideStudents } from './students.js';
import { openRemote, closeRemote, remoteAsked } from './remote.js';

// The admin page: set this week's class, or prepare next week's, which takes this week's place on its start date
// (js/week.js decides). A new week moves the last one into past weeks. Only people listed in admins/{email} can
// save (see firestore.rules). Below the form, the coach's list of students (js/students.js).
// The admin writes in one language; the other is translated automatically on save. Its translation shows under each
// field and can be corrected by hand; a hand-made correction is never replaced without asking (js/translation.js).
const main = document.getElementById('main');
const studentsSlot = document.getElementById('students');
const remoteSlot = document.getElementById('remote');
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
const fieldLabel = (name) => t(name === 'title' ? 'weekTitle' : 'note');
const dayName = (date) => new Date(`${date}T12:00`).toLocaleDateString(settings.language === 'pt' ? 'pt-BR' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

function page(body) {
  main.innerHTML = html`<div class="intro"><div><h2>${t('adminTitle')}</h2></div></div>${body}<p class="note"><a href="./">${t('backToSite')}</a></p>`;
}

function message(textKey, extra = '') {
  hideStudents(studentsSlot);
  closeRemote(remoteSlot);
  main.hidden = false;
  page(html`<p class="sect-sub">${t(textKey)}</p>${extra}`);
}

function accountLine(email) {
  return html`<p class="account">${t('signedInAs')} ${email} <button type="button" class="pill" id="signOut">${t('signOut')}</button></p>`;
}

function field(id, label, value, kind = 'text') {
  return kind === 'textarea'
    ? html`<div class="field"><label for="${id}">${label}</label><textarea id="${id}">${value}</textarea></div>`
    : html`<div class="field"><label for="${id}">${label}</label><input type="${kind}" id="${id}" value="${value}"></div>`;
}

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

function question() {
  if (!asking) return '';
  const names = asking.map(fieldLabel).join(', ');
  return html`<div class="confirm" role="alert"><span><b>${names}:</b> ${t(asking.length > 1 ? 'handFixedChangedBoth' : 'handFixedChanged')}</span>
    <button type="button" class="primary" data-answer="translate">${t('translateAgain')}</button>
    <button type="button" class="chipbtn" data-answer="keep">${t('keepMyTranslation')}</button></div>`;
}

// Each technique once, in the tab where it is written (shared techniques also show up in other tabs).
function techniquePicker() {
  const chosen = week.techniques || [];
  return content.order.map((key) => {
    const module = content.modules[key];
    return html`<div class="grp">${text(module.title)}</div>${module.stages.map((stage) => {
      const own = stage.items.filter((item) => findTechnique(item.id).moduleKey === key);
      return own.map((item) => html`<label><input type="checkbox" value="${item.id}" ${chosen.includes(item.id) ? 'checked' : ''}><i class="dot b"></i>${text(item.n)} · ${text(stage.name)}</label>`);
    })}`;
  });
}

// "Start from a past week": a button, then (once past weeks are read) a list to pick one from.
function startFromPast() {
  if (!pastWeeks) return html`<div class="field"><button type="button" class="chipbtn" data-reuse>${t('startFromPast')}</button></div>`;
  if (!pastWeeks.length) return html`<p class="note">${t('noPastWeeks')}</p>`;
  const options = pastWeeks.map((past, i) => html`<option value="${i}">${past.weekOf} · ${text(past.title)}</option>`);
  return html`<div class="field"><label for="reuseWeek">${t('startFromPast')}</label><select id="reuseWeek"><option value="">${t('pickPastWeek')}</option>${options}</select></div>`;
}

// Next week: whether one is prepared, and a way to cancel it.
function nextWeekStatus() {
  if (showing !== 'next') return '';
  const prepared = saved;
  if (!prepared) return html`<p class="sect-sub">${t('nextWeekLead')} ${t('nextNotReady')}</p>`;
  const cancel = confirmingCancel
    ? html`<div class="confirm" role="alert"><span>${t('cancelNextQuestion')}</span><button type="button" class="primary" data-cancel-next="yes">${t('yesCancelNext')}</button><button type="button" class="chipbtn" data-cancel-next="no">${t('keepIt')}</button></div>`
    : html`<button type="button" class="chipbtn" data-cancel-next="ask">${t('cancelNext')}</button>`;
  return html`<p class="sect-sub">${t('nextWeekLead')}</p><div class="next-ready"><span>${t('nextReady')} <b>${dayName(prepared.weekOf)}</b>.</span> ${cancel}</div>`;
}

function showForm(email, status = '') {
  const languageButtons = ['pt', 'en'].map((language) => html`<button type="button" class="chipbtn" data-writing="${language}" aria-pressed="${writingIn === language}">${language.toUpperCase()}</button>`);
  const formButtons = ['week', 'next'].map((which) => html`<button type="button" class="chipbtn" data-form="${which}" aria-pressed="${showing === which}">${t(which === 'week' ? 'thisWeekForm' : 'nextWeekForm')}</button>`);
  page(html`<p class="sect-sub">${t('adminLead')}</p>${accountLine(email)}
    <p class="actions"><a class="chipbtn plain" href="#tv">📺 ${t('runOnTv')}</a></p>
    <div class="filters admin-forms" role="group">${formButtons}</div>${nextWeekStatus()}
    <form class="form card" id="weekForm">
      <div class="field"><span class="lbl">${t('writingIn')}</span><div class="filters" role="group">${languageButtons}</div></div>
      ${startFromPast()}
      ${field('weekOf', t(showing === 'next' ? 'startsOn' : 'weekOf'), week.weekOf || '', 'date')}
      ${writingField('title')}
      ${writingField('note', 'textarea')}
      <div class="field"><span class="lbl">${t('pickTechniques')}</span><div class="picks" id="picks">${techniquePicker()}</div></div>
      ${question()}
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

// Once a prepared week's start date has come, it becomes this week and the old class moves to past weeks.
// Students already see it by the date; this makes the database match. If filing the old class fails, nothing
// changes, so no class is lost. Returns the new site/week, false if it failed, or null when there was nothing to do.
async function startPreparedWeek(stored) {
  const change = switchOver(stored, localDate());
  if (!change) return null;
  try {
    if (change.archive) await archiveWeek(change.archive);
    await saveWeek(change.week);
    return change.week;
  } catch (error) {
    console.error(error);
    return false;
  }
}

// Carries out the plan. If the translator fails, the fields it should have filled are left empty, so the site
// shows the original text rather than an old translation of different words.
async function fillTranslations(draft, plan, from, to) {
  translatedFields.filter((name) => plan[name] === 'clear').forEach((name) => { draft[name][to] = ''; });
  const needed = translatedFields.filter((name) => plan[name] === 'translate');
  if (!needed.length) return true;
  document.getElementById('status').textContent = t('translating');
  try {
    const texts = await translate(needed.map((name) => draft[name][from]), from, to);
    needed.forEach((name, i) => { draft[name][to] = texts[i]; });
    return true;
  } catch (error) {
    console.error(error);
    needed.forEach((name) => { draft[name][to] = ''; });
    return false;
  }
}

// A new class moves the live one into "Past weeks". Saving goes ahead if only the archiving fails.
async function archiveIfNew(previous, draft) {
  if (!worthArchiving(previous, draft)) return true;
  try {
    await archiveWeek(previous);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
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
  if (event.target.id === 'signOut') signOut();
});

// The admin page always reads site/week fresh, and starts a prepared week whose date has come.
async function openWeek(email) {
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

async function start() {
  applyTheme();
  await loadContent();
  if (!(await startFirebase())) return message('liveOnly');
  onAccountChange(async (user) => {
    await useAccount(user);
    delete main.dataset.email;
    if (!user) return message('adminSignIn', html`<button type="button" class="primary" id="signIn">${t('signInWithGoogle')}</button>`);
    if (!(await isAdmin(user.email))) return message('notAdmin', accountLine(user.email));
    main.dataset.email = user.email;
    await showPage(user.email);
  });
  // "Run on the TV" and back: the remote (js/remote.js) or this week's class, once the admin is known.
  window.addEventListener('hashchange', () => { if (main.dataset.email) showPage(main.dataset.email); });
}

async function showPage(email) {
  hideStudents(studentsSlot);
  if (remoteAsked()) {
    main.hidden = true;
    await openRemote(remoteSlot);
    return;
  }
  closeRemote(remoteSlot);
  main.hidden = false;
  await openWeek(email);
  showStudents(studentsSlot);
}

start();
