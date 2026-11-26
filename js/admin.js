import { html } from './html.js';
import { loadContent } from './content.js';
import { startFirebase, onAccountChange, checkAdmin } from './firebase.js';
import { applyTheme, useAccount } from './settings.js';
import { t } from './strings.js';
import { showStudents, hideStudents } from './students.js';
import { openRemote, closeRemote, remoteAsked } from './remote.js';
import { page, accountLine } from './admin-page.js';
import { openWeek } from './admin-week.js';

// The admin page: set this week's class, or prepare next week's, which takes this week's place on its start date
// (js/week.js decides). A new week moves the last one into past weeks. Only people listed in admins/{email} can
// save (see firestore.rules). Below the form, the coach's list of students (js/students.js).
// The admin writes in one language; the other is translated automatically on save. Its translation shows under each
// field and can be corrected by hand; a hand-made correction is never replaced without asking (js/translation.js).
// This file starts the page and follows the account; the week's form is js/admin-week.js.
const main = document.getElementById('main');
const studentsSlot = document.getElementById('students');
const remoteSlot = document.getElementById('remote');

function message(textKey, extra = '') {
  hideStudents(studentsSlot);
  closeRemote(remoteSlot);
  main.hidden = false;
  page(html`<p class="sect-sub">${t(textKey)}</p>${extra}`);
}

// Without a connection nobody can be told apart from an admin: the page says there is no connection and tries again
// by itself. null when someone else signed in meanwhile.
let signedIn = null;
async function adminOnceConnected(user) {
  for (;;) {
    try {
      return await checkAdmin(user.email);
    } catch (error) {
      console.warn('No connection to the database yet:', error.code || error.message);
      message('noConnection');
      await new Promise((done) => setTimeout(done, 5000));
      if (signedIn !== user) return null;
    }
  }
}

async function start() {
  applyTheme();
  await loadContent();
  if (!(await startFirebase())) return message('liveOnly');
  onAccountChange(async (user) => {
    signedIn = user;
    await useAccount(user);
    delete main.dataset.email;
    if (!user) return message('adminSignIn', html`<button type="button" class="primary" id="signIn">${t('signInWithGoogle')}</button>`);
    const admin = await adminOnceConnected(user);
    if (admin === null) return;
    if (!admin) return message('notAdmin', accountLine(user.email));
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
