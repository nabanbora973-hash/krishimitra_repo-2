// Persistence layer with automatic fallback.
// Online (logged in)  → Cloud Firestore
// Demo (?demo=1) or network failure → localStorage
// This is the "degrades gracefully, never loses data" behaviour claimed in Q&A.
import { state } from "./state.js";
import { db, doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from "./firebase.js";

const lsKey = k => `km_${state.user?.uid || 'anon'}_${k}`;

function localSave(key, obj){
  localStorage.setItem(lsKey(key), JSON.stringify({ ...obj, _savedAt: Date.now() }));
}
function localLoad(key){
  const raw = localStorage.getItem(lsKey(key));
  return raw ? JSON.parse(raw) : null;
}

// ---------- PROFILE ----------
// The device copy is written FIRST and always. The cloud is the backup, not the
// source of truth — a farmer on a bad connection must never lose a season
// because the upload failed.
export async function saveProfile(profile){
  localSave('profile', profile);
  if (state.demo || !state.user?.uid || state.user.uid === 'demo') return { local: true };
  try {
    await setDoc(doc(db, "users", state.user.uid), { profile }, { merge: true });
    markSynced();
    return { local: true, cloud: true };
  } catch (e) {
    console.warn("Firestore write failed (kept on device):", e.message);
    return { local: true, cloud: false, error: e.message };
  }
}
export async function loadProfile(){
  const local = localLoad('profile');
  if (state.demo || !state.user?.uid || state.user.uid === 'demo') return local;
  try {
    const snap = await getDoc(doc(db, "users", state.user.uid));
    const cloud = snap.exists() ? (snap.data().profile || null) : null;
    // Cloud wins when it exists (new phone case), device copy otherwise.
    if (cloud) { localSave('profile', cloud); return cloud; }
    return local;
  } catch (e) {
    console.warn("Firestore read failed (using this device's copy):", e.message);
    return local;
  }
}

// ---------- SEASON ----------
export async function saveSeason(season){
  localSave('season', season);
  if (state.demo || !state.user?.uid || state.user.uid === 'demo') return { local: true };
  try {
    await setDoc(doc(db, "users", state.user.uid), { currentSeason: season }, { merge: true });
    markSynced();
    return { local: true, cloud: true };
  } catch (e) {
    return { local: true, cloud: false, error: e.message };
  }
}
export async function loadSeason(){
  const local = localLoad('season');
  if (state.demo || !state.user?.uid || state.user.uid === 'demo') return local;
  try {
    const snap = await getDoc(doc(db, "users", state.user.uid));
    const cloud = snap.exists() ? (snap.data().currentSeason || null) : null;
    if (cloud) { localSave('season', cloud); return cloud; }
    return local;
  } catch (e) { return local; }
}

// ---------- GUIDANCE AUDIT LOG (integrity story for Q&A) ----------
export async function logGuidance(record){
  const entry = { ...record, createdAt: Date.now() };
  const existing = localLoad('guidanceLog') || [];
  existing.unshift(entry);
  localSave('guidanceLog', existing.slice(0, 50));   // always mirror locally
  if (state.demo) return;
  try {
    await addDoc(collection(db, "users", state.user.uid, "guidanceLog"),
      { ...record, createdAt: serverTimestamp() });
  } catch (e) { console.warn("Audit log to Firestore failed (kept locally):", e.message); }
}
export async function loadGuidanceLog(){
  if (state.demo) return localLoad('guidanceLog') || [];
  try {
    const snap = await getDoc(doc(db, "users", state.user.uid));
    return localLoad('guidanceLog') || [];
  } catch (e) { return localLoad('guidanceLog') || []; }
}


// ---------- cloud sync bookkeeping ----------
const SYNC_KEY = 'km_last_sync';
function markSynced(){ try { localStorage.setItem(SYNC_KEY, String(Date.now())); } catch {} }
export function lastSyncedAt(){
  try { const v = localStorage.getItem(SYNC_KEY); return v ? Number(v) : null; } catch { return null; }
}

// Push whatever is on this device to the farmer's Firestore document. Used by
// the 'Sync now' button after a spell offline.
export async function pushAllToCloud(){
  if (state.demo || !state.user?.uid) return { ok: false, reason: 'not signed in' };
  const profile = localLoad('profile');
  const season  = localLoad('season');
  const sales   = localLoad('sales_v1');
  try {
    await setDoc(doc(db, "users", state.user.uid),
      { profile: profile || null,
        currentSeason: season || null,
        sales: sales || null,
        syncedAt: serverTimestamp() }, { merge: true });
    markSynced();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}
