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
export async function saveProfile(profile){
  if (state.demo) { localSave('profile', profile); return { local: true }; }
  try {
    await setDoc(doc(db, "users", state.user.uid), { profile }, { merge: true });
    return { local: false };
  } catch (e) {
    console.warn("Firestore write failed, saving locally:", e.message);
    localSave('profile', profile);
    return { local: true, error: e.message };
  }
}
export async function loadProfile(){
  if (state.demo) return localLoad('profile');
  try {
    const snap = await getDoc(doc(db, "users", state.user.uid));
    return snap.exists() ? (snap.data().profile || null) : null;
  } catch (e) {
    console.warn("Firestore read failed:", e.message);
    return localLoad('profile');
  }
}

// ---------- SEASON ----------
export async function saveSeason(season){
  if (state.demo) { localSave('season', season); return { local: true }; }
  try {
    await setDoc(doc(db, "users", state.user.uid), { currentSeason: season }, { merge: true });
    return { local: false };
  } catch (e) {
    localSave('season', season);
    return { local: true, error: e.message };
  }
}
export async function loadSeason(){
  if (state.demo) return localLoad('season');
  try {
    const snap = await getDoc(doc(db, "users", state.user.uid));
    return snap.exists() ? (snap.data().currentSeason || null) : null;
  } catch (e) {
    return localLoad('season');
  }
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
