import { html } from './html.js';
import { t } from './strings.js';

// The admin page's own markup, shared by its parts (js/admin.js, js/admin-week.js).
const main = document.getElementById('main');

export function page(body) {
  main.innerHTML = html`<div class="intro"><div><h2>${t('adminTitle')}</h2></div></div>${body}<p class="note"><a href="./">${t('backToSite')}</a></p>`;
}

export function accountLine(email) {
  return html`<p class="account">${t('signedInAs')} ${email} <button type="button" class="pill" id="signOut">${t('signOut')}</button></p>`;
}

export function field(id, label, value, kind = 'text') {
  return kind === 'textarea'
    ? html`<div class="field"><label for="${id}">${label}</label><textarea id="${id}">${value}</textarea></div>`
    : html`<div class="field"><label for="${id}">${label}</label><input type="${kind}" id="${id}" value="${value}"></div>`;
}
