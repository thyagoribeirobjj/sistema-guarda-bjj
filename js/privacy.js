import { html } from './html.js';
import { state } from './state.js';
import { t } from './strings.js';
import { intro } from './views.js';
import { deleteMyData } from './firebase.js';
import { leaveAccount, clearThisBrowser, useAccount } from './settings.js';

// The privacy page (#privacy): what is kept, who sees it, and "Delete my data". Keep its words true to the code:
// firestore.rules says who can read what, and js/settings.js and js/notes.js what is kept.
const sections = ['SignedOut', 'Kept', 'Who', 'Notes', 'Where', 'Ads'];

// state.deleting: '' | 'ask' | 'working' | 'deleted' | 'cleared' | 'failed'
function deleteBlock() {
  const signedIn = Boolean(state.account);
  const status = { working: 'deleting', deleted: 'deleted', cleared: 'cleared', failed: 'deleteFailed' }[state.deleting];
  const controls = state.deleting === 'ask'
    ? html`<div class="confirm" role="alert"><span>${t(signedIn ? 'deleteQuestion' : 'clearQuestion')}</span><button type="button" class="primary" data-delete-data="yes">${t('yesDelete')}</button><button type="button" class="chipbtn" data-delete-data="no">${t('cancel')}</button></div>`
    : html`<div class="actions"><button type="button" class="chipbtn" data-delete-data="ask" ${state.deleting === 'working' ? 'disabled' : ''}>${t(signedIn ? 'deleteMyData' : 'clearThisBrowser')}</button><span class="status" id="deleteStatus" role="status">${status ? t(status) : ''}</span></div>`;
  return html`<section class="card privacy-part"><h3>${t('privacyDeleteTitle')}</h3><p>${t(signedIn ? 'privacyDelete' : 'privacyDeleteLocal')}</p>${controls}</section>`;
}

export function privacyView() {
  return html`${intro(t('privacy'), t('privacyLead'))}<div class="privacy">${sections.map((name) => html`<section class="card privacy-part"><h3>${t(`privacy${name}Title`)}</h3><p>${t(`privacy${name}`)}</p></section>`)}${deleteBlock()}</div>`;
}

// Signed in: the notes, the account's settings and the sign-in record are deleted, which signs out and clears this browser.
// Signed out: only this browser holds anything, so it is cleared.
async function deleteEverything(render) {
  if (!state.account) {
    clearThisBrowser();
    state.deleting = 'cleared';
    render();
    return;
  }
  state.deleting = 'working';
  render();
  const account = state.account;
  leaveAccount();
  try {
    await deleteMyData(account.uid);
    state.deleting = 'deleted';
  } catch (error) {
    console.error(error);
    state.deleting = 'failed';
    // Back to saving to the account, so nothing is quietly kept on this device only (signed out instead, if the
    // account's settings are already gone).
    await useAccount(account);
  }
  render();
}

export function privacyActions(render) {
  return [['[data-delete-data]', (el) => {
    const answer = el.dataset.deleteData;
    if (answer === 'yes') {
      deleteEverything(render).then(() => document.querySelector('[data-delete-data="ask"]')?.focus());
      return;
    }
    state.deleting = answer === 'ask' ? 'ask' : '';
    render();
    document.querySelector(answer === 'ask' ? '[data-delete-data="no"]' : '[data-delete-data="ask"]')?.focus();
  }]];
}
