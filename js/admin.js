import { html } from './html.js';
import { content, loadContent, findTechnique } from './content.js';
import { startFirebase, onAccountChange, signIn, signOut, isAdmin, loadWeek, saveWeek, archiveWeek, translate } from './firebase.js';
import { settings, applyTheme, useAccount } from './settings.js';
import { t, text } from './strings.js';

// The admin page: set this week's class. Only people listed in admins/{email} can save (see firestore.rules).
// The admin writes in one language; the other is translated automatically on save and can be corrected.
const main = document.getElementById('main');
const translated = ['title', 'note'];
let saved = { weekOf: '', title: {}, note: {}, techniques: [] };
let week = saved;
let writingIn = 'pt';
const otherLanguage = () => (writingIn === 'pt' ? 'en' : 'pt');

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

// The language the admin writes in, then its automatic translation beside it.
function bilingualField(name, label, kind) {
  const value = week[name] || {};
  const other = otherLanguage();
  return html`<div class="two">${field(`${name}-${writingIn}`, `${label} (${writingIn.toUpperCase()})`, value[writingIn] || '', kind)}${
    field(`${name}-${other}`, `${label} (${other.toUpperCase()}) · ${t('autoTranslated')}`, value[other] || '', kind, 'field auto')}</div>`;
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
      ${bilingualField('title', t('weekTitle'))}
      ${bilingualField('note', t('note'), 'textarea')}
      <div class="field"><span class="lbl">${t('pickTechniques')}</span><div class="picks" id="picks">${techniquePicker()}</div></div>
      <div class="actions"><button type="submit" class="primary">${t('save')}</button><span class="status" id="status" role="status">${status}</span></div>
    </form>`);
}

function readForm() {
  const value = (id) => document.getElementById(id).value.trim();
  const both = (name) => ({ pt: value(`${name}-pt`), en: value(`${name}-en`) });
  return {
    weekOf: value('weekOf'),
    title: both('title'),
    note: both('note'),
    techniques: [...document.querySelectorAll('#picks input:checked')].map((box) => box.value),
  };
}

// Translate a field when its original text changed or its translation is empty; keep hand-made fixes otherwise.
async function fillTranslations(draft) {
  const from = writingIn;
  const to = otherLanguage();
  const needed = translated.filter((name) => draft[name][from] && (draft[name][from] !== saved[name]?.[from] || !draft[name][to]));
  if (!needed.length) return true;
  document.getElementById('status').textContent = t('translating');
  try {
    const texts = await translate(needed.map((name) => draft[name][from]), from, to);
    needed.forEach((name, i) => { draft[name][to] = texts[i]; });
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

// A new week moves the one saved before it into "Past weeks". Saving the new week goes ahead even if that fails.
async function archivePrevious(draft) {
  const previous = saved;
  const hasContent = previous.techniques?.length || previous.title?.pt || previous.title?.en;
  if (!previous.weekOf || previous.weekOf === draft.weekOf || !hasContent) return true;
  try {
    await archiveWeek(previous);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

main.addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = document.getElementById('status');
  try {
    const draft = readForm();
    const translatedOk = await fillTranslations(draft);
    status.textContent = t('saving');
    const archivedOk = await archivePrevious(draft);
    await saveWeek({ ...draft, from: writingIn });
    saved = draft;
    week = draft;
    const messages = [t(translatedOk ? 'saved' : 'translateFailed'), archivedOk ? '' : t('archiveFailed')];
    showForm(main.dataset.email, messages.filter(Boolean).join(' '));
  } catch (error) {
    console.error(error);
    status.textContent = t('saveFailed');
  }
});

main.addEventListener('click', (event) => {
  const writing = event.target.closest('[data-writing]');
  if (writing) {
    week = { ...week, ...readForm() };
    writingIn = writing.dataset.writing;
    showForm(main.dataset.email);
  }
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
