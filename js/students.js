import { html } from './html.js';
import { content, findTechnique } from './content.js';
import { loadStudents } from './firebase.js';
import { settings } from './settings.js';
import { t, text } from './strings.js';
import { studentList, studentOrders, marksByPart } from './roster.js';
import { beltName, beltMark, progressMarks } from './views.js';
import { loadKidsAnswers, kidsFacts, kidsBody, answerChallenge } from './kids-coach.js';

// The admin page's Students section: each student's belt and marks, to follow their training. Read only when the
// coach taps "Show students" (one read per student). Notes are never read: they are not in users/{uid}.
// Counting, sorting, finding and grouping are in js/roster.js (tests/roster.test.js).
const view = { users: null, status: '', order: 'name', find: '', open: new Set() };
const orderLabels = { name: 'sortName', active: 'sortActive', done: 'sortDone' };
const known = (id) => Boolean(findTechnique(id));
let slot = null;

export function showStudents(element) {
  slot = element;
  slot.hidden = false;
  draw();
}

export function hideStudents(element) {
  element.hidden = true;
  element.innerHTML = '';
  view.users = null;
  view.open.clear();
}

const day = (millis) => new Date(millis).toLocaleDateString(settings.language === 'pt' ? 'pt-BR' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const userOf = (uid) => view.users.find((one) => one.uid === uid);

function marks(uid) {
  const user = userOf(uid);
  const groups = marksByPart(user, findTechnique, content.order);
  if (!groups.length) return html`<p class="note">${t('nothingMarked')}</p>`;
  return groups.map((group) => html`<h5>${text(content.modules[group.part].title)}</h5><ul class="student-marks">${group.techniques.map((mark) => html`<li>${text(findTechnique(mark.id).technique.n)}${
    mark.progress ? html` <span class="ptag" aria-label="${t(mark.progress)}" title="${t(mark.progress)}">${progressMarks[mark.progress]}</span>` : ''}${
    mark.favorite ? html` <span class="heart" aria-label="${t('inTree')}" title="${t('inTree')}">♥</span>` : ''}</li>`)}</ul>`);
}

function studentRow(student) {
  const belt = student.belt ? html`${beltMark(student.belt)} ${beltName(student.belt)}` : t('noBelt');
  return html`<details class="student" data-student="${student.uid}" ${view.open.has(student.uid) ? 'open' : ''}><summary>
    <span class="student-who"><b>${student.name || student.email}</b>${student.name ? html`<span>${student.email}</span>` : ''}</span>
    <span class="student-facts"><span>${belt}</span><span>${t('learning')}: <b>${student.learning}</b></span><span>${t('done')}: <b>${student.done}</b></span><span>${t('myTree')}: <b>${student.favorites}</b></span><span>${t('lastActive')}: ${student.lastActive ? day(student.lastActive) : t('never')}</span>${kidsFacts(userOf(student.uid))}</span>
    </summary><div class="student-body">${kidsBody(userOf(student.uid))}${marks(student.uid)}</div></details>`;
}

function list() {
  if (!view.users.length) return html`<p class="note">${t('noStudents')}</p>`;
  const students = studentList(view.users, { order: view.order, find: view.find, known });
  if (!students.length) return html`<p class="note">${t('noStudentFound')}</p>`;
  return html`<p class="status">${students.length} ${t('studentCount')}</p><div class="students">${students.map(studentRow)}</div>`;
}

function body() {
  if (!view.users) {
    return html`<div class="actions"><button type="button" class="chipbtn" data-load-students ${view.status === 'studentsLoading' ? 'disabled' : ''}>${t('showStudents')}</button><span class="status" role="status">${view.status ? t(view.status) : ''}</span></div>`;
  }
  const orders = studentOrders.map((order) => html`<button type="button" class="chipbtn" data-student-order="${order}" aria-pressed="${view.order === order}">${t(orderLabels[order])}</button>`);
  return html`<div class="student-tools"><input type="search" id="findStudent" class="search" placeholder="${t('findStudent')}" aria-label="${t('findStudent')}" value="${view.find}" autocomplete="off">
    <div class="filters" role="group" aria-label="${t('sortBy')}">${orders}</div></div><div id="studentList">${list()}</div>`;
}

function draw() {
  slot.innerHTML = html`<h3 class="sect-title">${t('students')}</h3><p class="sect-sub">${t('studentsLead')}</p>${body()}`;
}

async function load() {
  view.status = 'studentsLoading';
  draw();
  try {
    [view.users] = await Promise.all([loadStudents(), loadKidsAnswers()]);
    view.status = '';
  } catch (error) {
    console.error(error);
    view.status = 'studentsFailed';
  }
  draw();
  (slot.querySelector('#findStudent') || slot.querySelector('[data-load-students]'))?.focus();
}

// A coach's answer to a kid's challenge: saved, then the list is drawn again with the focus back in that row.
async function answerKid(button) {
  const row = button.closest('[data-student]').dataset.student;
  const challenge = button.closest('[data-kid-challenge]').dataset.kidChallenge;
  button.disabled = true;
  await answerChallenge(button.dataset.answer);
  draw();
  const again = slot.querySelector(`[data-student="${row}"] [data-kid-challenge="${challenge}"] button`);
  (again || slot.querySelector(`[data-student="${row}"] summary`))?.focus();
}

document.addEventListener('click', (event) => {
  if (!slot?.contains(event.target)) return;
  if (event.target.closest('[data-load-students]')) load();
  const answer = event.target.closest('[data-answer]');
  if (answer) answerKid(answer);
  const order = event.target.closest('[data-student-order]');
  if (order) {
    view.order = order.dataset.studentOrder;
    draw();
    slot.querySelector(`[data-student-order="${view.order}"]`).focus();
  }
});

// Typing redraws only the list, so the search box keeps its focus.
document.addEventListener('input', (event) => {
  if (event.target.id !== 'findStudent') return;
  view.find = event.target.value;
  document.getElementById('studentList').innerHTML = list();
});

// Which students are open is remembered, so sorting or finding doesn't fold them away. (toggle doesn't bubble.)
document.addEventListener('toggle', (event) => {
  const uid = event.target.dataset?.student;
  if (!uid) return;
  if (event.target.open) view.open.add(uid);
  else view.open.delete(uid);
}, true);
