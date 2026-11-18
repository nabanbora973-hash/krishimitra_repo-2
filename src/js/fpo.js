// ============================================================================
//  FARMER GROUP (FPO)  —  many small farms, one negotiation
// ----------------------------------------------------------------------------
//  One farmer with 20 quintals gets the gate price. Forty farmers with 800
//  quintals get a conversation. That is the whole idea, and it needs nothing
//  more than a shared group code.
//
//  Stored on the device first (works offline, works without an account), and
//  mirrored to Firestore when signed in so members on other phones see the same
//  combined stock.
// ============================================================================
import { state } from './state.js';
import { CROPS } from './crops.js';

const KEY = 'km_fpo_v1';

const read = () => {
  try {
    const g = JSON.parse(localStorage.getItem(KEY) || 'null');
    return g && g.code ? g : null;
  } catch { return null; }
};
const write = g => { try { localStorage.setItem(KEY, JSON.stringify(g)); } catch {} };

const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

export const myGroup = () => read();
export const makeCode = () =>
  'KM' + Math.random().toString(36).slice(2, 6).toUpperCase();

// Join or create. The member list starts with whoever is on this device.
export function joinGroup(code, { name, crop, qty } = {}){
  const c = normCode(code);
  if (c.length < 4) return { ok: false, error: 'Group code must be at least 4 characters.' };
  const existing = read();
  const group = existing && existing.code === c ? existing : { code: c, createdAt: Date.now(), members: [], cloud: false };
  const who = { uid: state.user?.uid || 'device', name: name || state.profile?.name || 'Farmer',
                crop: crop || state.season?.crop || 'paddy', qty: Number(qty) || 0, at: Date.now() };
  group.members = [...group.members.filter(m => m.uid !== who.uid), who];
  write(group);
  document.dispatchEvent(new CustomEvent('km:fpo-changed', { detail: group }));
  return { ok: true, group };
}

export function leaveGroup(){
  try { localStorage.removeItem(KEY); } catch {}
  document.dispatchEvent(new CustomEvent('km:fpo-changed', { detail: null }));
}

// Update my own quantity — the number the group negotiates with.
export function setMyStock(qty, crop){
  const g = read();
  if (!g) return { ok: false, error: 'Join a group first.' };
  const uid = state.user?.uid || 'device';
  const q = Number(qty);
  if (!isFinite(q) || q < 0) return { ok: false, error: 'Quantity must be 0 or more.' };
  g.members = g.members.map(m => m.uid === uid ? { ...m, qty: q, crop: crop || m.crop, at: Date.now() } : m);
  if (!g.members.some(m => m.uid === uid)){
    g.members.push({ uid, name: state.profile?.name || 'Farmer', crop: crop || 'paddy', qty: q, at: Date.now() });
  }
  write(g);
  document.dispatchEvent(new CustomEvent('km:fpo-changed', { detail: g }));
  return { ok: true, group: g };
}

// Combined stock by crop — what the group can actually offer a buyer.
export function combinedStock(group = read()){
  if (!group) return [];
  const by = new Map();
  for (const m of group.members){
    const k = m.crop || 'paddy';
    const prev = by.get(k) || { crop: k, qty: 0, members: 0 };
    prev.qty += Number(m.qty) || 0;
    prev.members += 1;
    by.set(k, prev);
  }
  return [...by.values()]
    .map(r => ({ ...r, label: CROPS?.[r.crop]?.label || r.crop }))
    .sort((a, b) => b.qty - a.qty);
}

export const groupSummary = (group = read()) => {
  if (!group) return null;
  const stock = combinedStock(group);
  return {
    code: group.code,
    members: group.members.length,
    totalQtl: stock.reduce((s, r) => s + r.qty, 0),
    stock
  };
};

// ---------------------------------------------------------------- cloud
// Same shape on the wire as on the device: one document per group.
export async function pushGroupToCloud(){
  const g = read();
  if (!g) return { ok: false };
  if (state.demo || !state.user?.uid || state.user.uid === 'demo') return { ok: false, error: 'device only' };
  try {
    const fb = await import('./firebase.js');
    if (!fb.db) return { ok: false };
    await fb.setDoc(fb.doc(fb.db, 'farmerGroups', g.code), {
      code: g.code, members: g.members, updatedAt: fb.serverTimestamp()
    }, { merge: true });
    return { ok: true };
  } catch (e){ return { ok: false, error: e.message }; }
}

export async function pullGroupFromCloud(code){
  const c = normCode(code);
  if (!c) return { ok: false };
  if (state.demo || !state.user?.uid || state.user.uid === 'demo') return { ok: false, error: 'device only' };
  try {
    const fb = await import('./firebase.js');
    if (!fb.db) return { ok: false };
    const snap = await fb.getDoc(fb.doc(fb.db, 'farmerGroups', c));
    if (!snap.exists()) return { ok: false, error: 'No such group yet' };
    const data = snap.data();
    const mine = read() || { code: c, createdAt: Date.now(), members: [] };
    const byUid = new Map(mine.members.map(m => [m.uid, m]));
    for (const m of (data.members || [])) if (!byUid.has(m.uid)) byUid.set(m.uid, m);
    mine.members = [...byUid.values()];
    mine.cloud = true;
    write(mine);
    document.dispatchEvent(new CustomEvent('km:fpo-changed', { detail: mine }));
    return { ok: true, group: mine };
  } catch (e){ return { ok: false, error: e.message }; }
}

export const FPO_KEY = KEY;
