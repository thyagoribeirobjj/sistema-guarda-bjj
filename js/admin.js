import { html } from './html.js';
import { content, loadContent, findTechnique } from './content.js';
import { startFirebase, onAccountChange, signIn, signOut, isAdmin, loadWeek, saveWeek } from './firebase.js';
import { applyTheme, useAccount } from './settings.js';
import { t, text } from './strings.js';

// The admin page: set this week's class. Only people listed in admins/{email} can save (see firestore.rules).
const main = document.getElementById('main');
let week = { weekOf: '', title: { pt: '', en: '' }, note: { pt: '', en: '' }, techniques: [] };

function page(body) {
  main.innerHTML = html`<div class="intro"><div><h2>${t('adminTitle')}</h2></div></div>${body}<p class="note"><a href="./">${t('backToSite')}</a></p>`;
}

function message(textKey, extra = '') {
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

function showForm(email) {
  page(html`<p class="sect-sub">${t('adminLead')}</p>${accountLine(email)}
    <form class="form card" id="weekForm">
      ${field('weekOf', t('weekOf'), week.weekOf || '', 'date')}
      <div class="two">${field('titlePt', `${t('weekTitle')} (PT)`, week.title?.pt || '')}${field('titleEn', `${t('weekTitle')} (EN)`, week.title?.en || '')}</div>
      <div class="two">${field('notePt', `${t('note')} (PT)`, week.note?.pt || '', 'textarea')}${field('noteEn', `${t('note')} (EN)`, week.note?.en || '', 'textarea')}</div>
      <div class="field"><span class="lbl">${t('pickTechniques')}</span><div class="picks" id="picks">${techniquePicker()}</div></div>
      <div class="actions"><button type="submit" class="primary">${t('save')}</button><span class="status" id="status" role="status"></span></div>
    </form>`);
}

function readForm() {
  const value = (id) => document.getElementById(id).value.trim();
  return {
    weekOf: value('weekOf'),
    title: { pt: value('titlePt'), en: value('titleEn') },
    note: { pt: value('notePt'), en: value('noteEn') },
    techniques: [...document.querySelectorAll('#picks input:checked')].map((box) => box.value),
  };
}

main.addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = document.getElementById('status');
  status.textContent = t('saving');
  try {
    week = readForm();
    await saveWeek(week);
    status.textContent = t('saved');
  } catch (error) {
    console.error(error);
    status.textContent = t('saveFailed');
  }
});

main.addEventListener('click', (event) => {
  if (event.target.id === 'signIn') signIn().catch(() => alert(t('signInFailed')));
  if (event.target.id === 'signOut') signOut();
});

async function start() {
  applyTheme();
  await loadContent();
  if (!(await startFirebase())) return message('liveOnly');
  week = { ...week, ...(await loadWeek().catch(() => null)) };
  onAccountChange(async (user) => {
    await useAccount(user);
    if (!user) return message('adminSignIn', html`<button type="button" class="primary" id="signIn">${t('signInWithGoogle')}</button>`);
    if (!(await isAdmin(user.email))) return message('notAdmin', accountLine(user.email));
    showForm(user.email);
  });
}

start();
