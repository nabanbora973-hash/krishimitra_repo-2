// Firebase — loaded only when it is actually needed.
//
// WHY THIS FILE LOOKS ODD
// -----------------------
// It used to start with three static imports from Google's CDN:
//
//     import { initializeApp } from "https://www.gstatic.com/firebasejs/...";
//
// A static import is a hard dependency: if the network is down (a village with
// no signal, a phone that has never opened the app before, a blocked CDN), the
// whole module graph fails and NOTHING runs. Not the login screen — nothing.
// The farmer got a blank white page and no explanation.
//
// The app never actually needs Firebase to show a price. It only needs it for
// accounts and cloud backup, both of which are optional. So the SDK is loaded
// on demand (loadFirebase()) and every helper below waits for it. With no
// network the app boots straight into guest mode and works as before.
//
// Keep these rules:
//   • no top-level import from a remote URL in this file, ever
//   • a helper that touches Firestore must await loadFirebase() first
//   • db / auth are sentinels, not the real objects — see doc() below
import { firebaseConfig } from "./config.js";

const CDN = "https://www.gstatic.com/firebasejs/10.12.2/";

let _promise = null;      // in-flight or resolved load
let _sdk = null;          // { app, auth, db, authMod, fsMod }
let _failed = null;       // last failure reason, for the UI to show

/** 'idle' | 'loading' | 'ready' | 'failed' — read by the UI, never trusted blindly. */
export function firebaseState(){
  if (_sdk) return 'ready';
  if (_failed) return 'failed';
  if (_promise) return 'loading';
  return 'idle';
}

export function firebaseError(){ return _failed; }

/** Load the SDK once. Safe to call from anywhere; repeat calls share one promise. */
export function loadFirebase(){
  if (_sdk) return Promise.resolve(_sdk);
  if (_promise) return _promise;

  _promise = (async () => {
    const [appMod, authMod, fsMod] = await Promise.all([
      import(/* @vite-ignore */ CDN + "firebase-app.js"),
      import(/* @vite-ignore */ CDN + "firebase-auth.js"),
      import(/* @vite-ignore */ CDN + "firebase-firestore.js"),
    ]);

    const app = appMod.initializeApp(firebaseConfig);
    const auth = authMod.getAuth(app);

    // Persistent cache: the price board keeps working on a dead connection, and
    // a report written offline is queued, not dropped.
    const db = fsMod.initializeFirestore(app, {
      localCache: fsMod.persistentLocalCache({
        tabManager: fsMod.persistentMultipleTabManager()
      })
    });

    _sdk = { app, auth, db, authMod, fsMod };
    _failed = null;
    return _sdk;
  })().catch(err => {
    // Do not cache a failure forever — a farmer who walks into signal should
    // be able to sign in without reloading the app.
    _promise = null;
    _failed = err?.message || String(err);
    console.info('Firebase could not load — the app continues without accounts:', _failed);
    throw err;
  });

  return _promise;
}

/* ------------------------------------------------------------------ *
 * Sentinels. store.js and friends still call doc(db, …) / collection(db, …);
 * the wrappers below swap the sentinel for the real instance once it exists.
 * That keeps every call site unchanged.
 * ------------------------------------------------------------------ */
export const db   = { __kmSentinel: 'db' };
export const auth = { __kmSentinel: 'auth' };

/* ------------------------------ auth ------------------------------ */

export async function signup(email, pass){
  const s = await loadFirebase();
  return s.authMod.createUserWithEmailAndPassword(s.auth, email, pass);
}

export async function login(email, pass){
  const s = await loadFirebase();
  return s.authMod.signInWithEmailAndPassword(s.auth, email, pass);
}

export async function logout(){
  const s = await loadFirebase();
  return s.authMod.signOut(s.auth);
}

// One tap, no password to remember. Popup is the fast path; a browser that
// blocks popups (or an in-app webview) falls back to a full-page redirect.
//
// v42.5 — a popup can also HANG. Opera GX, Brave and any browser that blocks
// third-party storage will open the Google window, let the person finish, and
// then never hand the answer back: signInWithPopup neither resolves nor throws,
// so the button sat on "Opening Google…" for ever with no error and no way out.
// Measured on a real device, 10 Nov 2026. After popupMaxMs we treat that as
// blocked and take the full-page path, which does not need the handshake.
const POPUP_MAX_MS = 30000;

export async function signInWithGoogle({ popupMaxMs = POPUP_MAX_MS } = {}){
  const s = await loadFirebase();
  const provider = new s.authMod.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  let timer;
  try {
    return await Promise.race([
      s.authMod.signInWithPopup(s.auth, provider),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Object.assign(new Error('popup did not answer'), { code: 'auth/popup-blocked' })),
          popupMaxMs
        );
      })
    ]);
  } catch (e){
    const fallback = ['auth/popup-blocked', 'auth/popup-closed-by-user',
                      'auth/operation-not-supported-in-this-environment',
                      'auth/cancelled-popup-request'];
    if (fallback.includes(e.code)){
      await s.authMod.signInWithRedirect(s.auth, provider);
      return null;
    }
    throw e;
  } finally {
    clearTimeout(timer);          // a popup that did answer must not leave a timer behind
  }
}

// A redirect sign-in lands back here with no local state — this resolves it.
export async function googleRedirectResult(){
  try {
    const s = await loadFirebase();
    return await s.authMod.getRedirectResult(s.auth);
  } catch { return null; }
}

/**
 * Subscribe to auth changes.
 *
 * The callback is GUARANTEED to fire: if the SDK cannot load we call it with
 * null, which is exactly what "signed out" means — the app then goes to guest
 * mode instead of sitting on a blank screen forever.
 */
export function onAuthStateChanged(_auth, cb){
  let fired = false;
  const once = user => { if (!fired){ fired = true; cb(user); } };

  loadFirebase()
    .then(async s => {
      // A full-page (redirect) sign-in lands back here with its result STORED,
      // not applied. Only getRedirectResult() applies it.
      //
      // v42.5: googleRedirectResult() below was written for exactly this and
      // then never called from anywhere — `grep -rn googleRedirectResult js/`
      // found one hit, the definition. So the popup-blocked fallback sent the
      // person to Google, signed them up, and dropped them back on the login
      // screen looking signed out. Resolve it BEFORE subscribing, so the first
      // auth state we report is the real one instead of a null that would
      // strand them in guest mode. The 4 s guard keeps a dead network from
      // holding up the boot.
      await Promise.race([
        s.authMod.getRedirectResult(s.auth).catch(() => null),
        new Promise(r => setTimeout(r, 4000))
      ]);
      s.authMod.onAuthStateChanged(s.auth, once);
    })
    .catch(() => once(null));

  // A stalled CDN must not hold the app hostage either.
  setTimeout(() => { if (!fired) once(null); }, 6000);
}

/* ---------------------------- Firestore ---------------------------- */

export async function doc(_db, ...rest){
  const s = await loadFirebase();
  return s.fsMod.doc(s.db, ...rest);
}

export async function collection(_db, ...rest){
  const s = await loadFirebase();
  return s.fsMod.collection(s.db, ...rest);
}

export async function getDoc(ref){
  const s = await loadFirebase();
  return s.fsMod.getDoc(await ref);
}

export async function setDoc(ref, data, options){
  const s = await loadFirebase();
  return s.fsMod.setDoc(await ref, data, options);
}

export async function addDoc(ref, data){
  const s = await loadFirebase();
  return s.fsMod.addDoc(await ref, data);
}

export async function deleteDoc(ref){
  const s = await loadFirebase();
  return s.fsMod.deleteDoc(await ref);
}

export async function getDocs(ref){
  const s = await loadFirebase();
  return s.fsMod.getDocs(await ref);
}

export async function onSnapshot(ref, next, error){
  const s = await loadFirebase();
  return s.fsMod.onSnapshot(await ref, next, error);
}

export async function query(ref, ...constraints){
  const s = await loadFirebase();
  return s.fsMod.query(await ref, ...constraints);
}

export async function where(...args){
  const s = await loadFirebase();
  return s.fsMod.where(...args);
}

/** Synchronous ref builder — required inside a writeBatch. */
export function docSync(_db, ...rest){
  if (!_sdk) throw new Error('Firebase not loaded yet — cannot build a ref');
  return _sdk.fsMod.doc(_sdk.db, ...rest);
}

// mandi-feed.js posts a whole day of rates in one go: `const batch = fb.writeBatch(fb.db)`
// is synchronous there, so this must return the real batch object, not a promise.
export function writeBatch(_db){
  if (!_sdk) throw new Error('Firebase not loaded yet — call loadFirebase() first');
  return _sdk.fsMod.writeBatch(_sdk.db);
}

/** Must stay synchronous — it is used inside object literals. */
export function serverTimestamp(){
  if (_sdk) return _sdk.fsMod.serverTimestamp();
  return Date.now();   // unreachable in practice: writes require a loaded SDK
}

/* ------------------------------ phone OTP ------------------------------ */

// otp.js writes `new fb.RecaptchaVerifier(fb.auth, id, opts)`. A plain function
// used with `new` returns the object we hand back, so this keeps that call site.
export function RecaptchaVerifier(_auth, containerId, options){
  if (!_sdk) throw new Error('Firebase not loaded yet');
  return new _sdk.authMod.RecaptchaVerifier(_sdk.auth, containerId, options);
}

export async function signInWithPhoneNumber(_auth, phone, verifier){
  const s = await loadFirebase();
  return s.authMod.signInWithPhoneNumber(s.auth, phone, verifier);
}
