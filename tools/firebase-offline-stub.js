/* Offline / single-file build stub for src/js/firebase.js
   -------------------------------------------------------
   The hosted build talks to Firebase (CDN ES modules) for optional accounts.
   The single-file demo has no network at all, so this stub keeps every export
   the app imports — but every call is a no-op.

   The app is written to detect this: it falls back to local demo mode
   (see js/auth.js → "Demo mode"), so nothing breaks and no fake data appears.
*/
export const app = null;
export const auth = null;
export const db = null;

export const signup = () => Promise.reject(new Error("offline build — accounts disabled"));
export const login  = () => Promise.reject(new Error("offline build — accounts disabled"));
export const logout = () => Promise.resolve();

export const onAuthStateChanged = (_auth, cb) => { if (typeof cb === "function") cb(null); return () => {}; };
export const doc = () => null;
export const getDoc = () => Promise.resolve({ exists: () => false, data: () => ({}) });
export const setDoc = () => Promise.resolve();
export const addDoc = () => Promise.resolve({ id: "offline" });
export const collection = () => null;
export const serverTimestamp = () => Date.now();
