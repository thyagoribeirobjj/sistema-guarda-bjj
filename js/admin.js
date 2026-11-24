import { html } from './html.js';
import { content, loadContent, findTechnique } from './content.js';
import { startFirebase, onAccountChange, signIn, signOut, isAdmin, loadWeek, saveWeek, archiveWeek, translate } from './firebase.js';
import { settings, applyTheme, useAccount } from './settings.js';
import { t, text } from './strings.js';
import { translatedFields, translationPlan, answerPlan, handFixedAfter } from './translation.js';

// The admin page: set this week's class. Only people listed in admins/{email} can save (see firestore.rules).
// The admin writes in one language; the other is translated automatically on save. Its translation shows under each
// field and can be corrected by hand; a hand-made correction is never replaced without asking (js/translation.js).
const main = document.getElementById('main');
let saved = { weekOf: '', title: {}, note: {}, techniques: [], handFixed: [] };
let week = saved;
let writingIn = 'pt';
const editing = new Set(); // translation editors open now
const edited = new Set(); // translation editors opened since the last save
let asking = null; // the fields the admin is being asked about
const otherLanguage = () => (writingIn === 'pt' ? 'en' : 'pt');
const fieldLabel = (name) => t(name === 'title' ? 'weekTitle' : 'note');

function page(body) {
  main.innerHTML = html`<div class="intro"><div><h2>${t('adminTitle')}</h2></div></div>${body}<p class="note"><a href="./">${t('backToSite')}</a></p>`;
}

function message(textKey, extra = '') {
  page(html`<p class="sect-sub">${t(textKey)}</p>${extra}`);
}

function accountLine(email) {
  return html`<p class="account">${t('signedInAs')} ${email} <button type="button" class="pill" id="signOut">${t('signOut')}</button></p>`;
}

function field(id, label, value, kind = 'text', className = 'field') {
  return kind === 'textarea'
    ? html`<div class="${className}"><label for="${id}">${label}</label><textarea id="${id}">${value}</textarea></div>`
    : html`<div class="${className}"><label for="${id}">${label}</label><input type="${kind}" id="${id}" value="${value}"></div>`;
}

// The field in the language the admin writes in, with its translation underneath.
function writingField(name, kind = 'text') {
  return html`${field(name, `${fieldLabel(name)} (${writingIn.toUpperCase()})`, week[name]?.[writingIn] || '', kind)}${translationLine(name, kind)}`;
}

function translationNote(name, translation) {
  const other = otherLanguage();
  const unchanged = translation === (saved[name]?.[other] || '');
  if (unchanged && saved.from === other) return ''; // the admin wrote this text themselves
  return t(unchanged && !saved.handFixed?.includes(name) ? 'translatedAutomatically' : 'yourCorrection');
}

// The translation as a quiet line with an "Edit translation" button, or, once opened, as its own input.
function translationLine(name, kind) {
  const other = otherLanguage();
  const translation = week[name]?.[other] || '';
  if (editing.has(name)) {
    return html`<div class="translation-edit">${field(`${name}-translation`, `${t('translation')} (${other.toUpperCase()})`, translation, kind)}
      <button type="button" class="linkbtn" data-done="${name}">${t('doneEditing')}</button></div>`;
  }
  if (!translation && !saved[name]?.[writingIn]) return '';
  const shown = translation ? html`<span><b>${other.toUpperCase()}:</b> ${translation}</span> <i>${translationNote(name, translation)}</i>` : '';
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

function showForm(email, status = '') {
  const languageButtons = ['pt', 'en'].map((language) => html`<button type="button" class="chipbtn" data-writing="${language}" aria-pressed="${writingIn === language}">${language.toUpperCase()}</button>`);
  page(html`<p class="sect-sub">${t('adminLead')}</p>${accountLine(email)}
    <form class="form card" id="weekForm">
      <div class="field"><span class="lbl">${t('writingIn')}</span><div class="filters" role="group">${languageButtons}</div></div>
      ${field('weekOf', t('weekOf'), week.weekOf || '', 'date')}
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

// A new week moves the live one into "Past weeks". It is read fresh, since another admin may have saved since this
// page opened; if that read fails, nothing is saved. Saving goes ahead if only the archiving fails.
// The same class with a corrected date is not a new week.
async function archivePrevious(draft) {
  const previous = (await loadWeek({ fresh: true })) || {};
  const hasContent = previous.techniques?.length || previous.title?.pt || previous.title?.en;
  const sameClass = JSON.stringify(previous.techniques || []) === JSON.stringify(draft.techniques)
    && previous.title?.pt === draft.title.pt && previous.title?.en === draft.title.en;
  if (!previous.weekOf || previous.weekOf === draft.weekOf || !hasContent || sameClass) return true;
  try {
    await archiveWeek(previous);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

// answer is the admin's reply to the question ('translate' or 'keep'); a plain Save starts over without one.
async function save(answer) {
  week = readForm();
  const draft = week;
  const from = writingIn;
  const to = otherLanguage();
  const handFixed = saved.handFixed || [];
  const plan = translationPlan({ saved, draft, from, to, handFixed, edited: [...edited] });
  const asks = translatedFields.filter((name) => plan[name] === 'ask');
  if (asks.length && !answer) {
    asking = asks;
    return showForm(main.dataset.email);
  }
  asking = null;
  const steps = answerPlan(plan, answer);
  const status = document.getElementById('status');
  try {
    const translatedOk = await fillTranslations(draft, steps, from, to);
    status.textContent = t('saving');
    const archivedOk = await archivePrevious(draft);
    const doc = { ...draft, from, handFixed: handFixedAfter(steps, handFixed) };
    await saveWeek(doc);
    saved = doc;
    week = doc;
    editing.clear();
    edited.clear();
    const messages = [t(translatedOk ? 'saved' : 'translateFailed'), archivedOk ? '' : t('archiveFailed')];
    showForm(main.dataset.email, messages.filter(Boolean).join(' '));
  } catch (error) {
    console.error(error);
    document.getElementById('status').textContent = t('saveFailed');
  }
}

main.addEventListener('submit', (event) => {
  event.preventDefault();
  save(null);
});

// Every button that redraws the form reads it into memory first, so nothing typed is lost.
function redraw(change) {
  week = readForm();
  change();
  showForm(main.dataset.email);
}

main.addEventListener('click', (event) => {
  const writing = event.target.closest('[data-writing]');
  const edit = event.target.closest('[data-edit]');
  const done = event.target.closest('[data-done]');
  const answer = event.target.closest('[data-answer]');
  if (writing) redraw(() => { writingIn = writing.dataset.writing; asking = null; });
  if (edit) {
    const name = edit.dataset.edit;
    redraw(() => { editing.add(name); edited.add(name); });
    document.getElementById(`${name}-translation`).focus();
  }
  if (done) {
    const name = done.dataset.done;
    redraw(() => editing.delete(name));
    document.querySelector(`[data-edit="${name}"]`)?.focus();
  }
  if (answer) save(answer.dataset.answer);
  if (event.target.id === 'signIn') signIn().catch(() => alert(t('signInFailed')));
  if (event.target.id === 'signOut') signOut();
});

async function start() {
  applyTheme();
  await loadContent();
  if (!(await startFirebase())) return message('liveOnly');
  saved = { ...saved, ...(await loadWeek({ fresh: true }).catch(() => null)) };
  week = saved;
  writingIn = saved.from || settings.language;
  onAccountChange(async (user) => {
    await useAccount(user);
    if (!user) return message('adminSignIn', html`<button type="button" class="primary" id="signIn">${t('signInWithGoogle')}</button>`);
    if (!(await isAdmin(user.email))) return message('notAdmin', accountLine(user.email));
    main.dataset.email = user.email;
    showForm(user.email);
  });
}

start();
