// Sign-in and every database call. Nothing else in the site talks to Firebase directly.
// Who may read or change what is decided by firestore.rules, not by this file.
const sdk = 'https://www.gstatic.com/firebasejs/13.2.0/';

let auth = null;
let db = null;
let fb = {};

export async function startFirebase() {
  try {
    // Firebase Hosting serves this project's public settings here. A local preview has none,
    // so the site still works there, just without sign-in or the database.
    const response = await fetch('/__/firebase/init.json');
    if (!response.ok) return false;
    const config = await response.json();
    config.authDomain = location.host;

    const [app, authSdk, store] = await Promise.all(
      ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore-lite.js'].map((file) => import(sdk + file)),
    );
    fb = { ...authSdk, ...store };
    const firebaseApp = app.initializeApp(config);
    auth = authSdk.getAuth(firebaseApp);
    db = store.getFirestore(firebaseApp);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

export function onAccountChange(callback) {
  if (!auth) return callback(null);
  fb.onAuthStateChanged(auth, callback);
}

export async function signIn() {
  const provider = new fb.GoogleAuthProvider();
  try {
    await fb.signInWithPopup(auth, provider);
  } catch (error) {
    if (error.code === 'auth/popup-blocked') return fb.signInWithRedirect(auth, provider);
    if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') throw error;
  }
}

export function signOut() {
  return fb.signOut(auth);
}

async function read(path) {
  const snapshot = await fb.getDoc(fb.doc(db, path));
  return snapshot.exists() ? snapshot.data() : null;
}

function write(path, data) {
  return fb.setDoc(fb.doc(db, path), { ...data, updatedAt: fb.serverTimestamp() });
}

export async function isAdmin(email) {
  if (!db || !email) return false;
  return (await read(`admins/${email.toLowerCase()}`).catch(() => null)) !== null;
}

export function loadWeek() {
  return db ? read('site/week') : Promise.resolve(null);
}

export function saveWeek(week) {
  return write('site/week', { ...week, updatedBy: auth.currentUser.email });
}

export function loadUserSettings(uid) {
  return read(`users/${uid}`);
}

export function saveUserSettings(uid, data) {
  return write(`users/${uid}`, { ...data, email: auth.currentUser.email });
}
