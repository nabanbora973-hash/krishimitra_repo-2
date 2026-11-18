// ============================================================================
//  DEMAND BOARD — the desk asks for maal, the farmer answers with quintals.
// ----------------------------------------------------------------------------
//  Every other screen in this app tells a farmer what a mandi PAYS. This is the
//  first one where the mandi asks for supply: "200 quintals paddy by Friday,
//  ₹2,100 max". A trader with an order to fill posts it once; farmers near that
//  gate see it and commit what they can bring.
//
//  Backend = Firestore (same project, asia-south1)
//    collection: demands           doc: <demandId>
//    collection: demandResponses   doc: <demandId>__<farmerId>__<ts>
//
//  Device first, exactly like the price board: the post is written to this
//  phone before the cloud is tried, so a gate with no signal still records it
//  and uploads when the signal returns. Nothing is ever labelled "sent" unless
//  the cloud took it.
// ============================================================================
import { state } from './state.js';
import { SUPPORTED_CROPS, istToday } from './mandi-feed.js';

const KEY = 'km_demands_v1';
const RES_KEY = 'km_demand_responses_v1';
const PENDING_KEY = 'km_demand_pending_v1';

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const read = (k, fallback) => {
  try { const a = JSON.parse(localStorage.getItem(k) || 'null'); return Array.isArray(a) ? a.filter(isObj) : fallback; }
  catch { return fallback; }
};
const write = (k, list) => { try { localStorage.setItem(k, JSON.stringify(list.slice(-400))); } catch {} };

export const DEMAND_KEY = KEY;
export const newId = () => 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const myDeskId = () => state.profile?.mandiId
  || String(state.profile?.mandiName || state.profile?.village || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');

// ---------------------------------------------------------------- reading
export function allDemands(){
  return read(KEY, []).slice().sort((a, b) => String(a.needBy).localeCompare(String(b.needBy)));
}

export function myDemands(){
  const me = myDeskId();
  return allDemands().filter(d => d.mine || (d.deskId && d.deskId === me));
}

// Open, not expired, and for a crop we can actually price.
export function openDemands({ crop = null } = {}){
  const today = istToday();
  return allDemands().filter(d =>
    (d.status || 'open') === 'open' &&
    String(d.needBy || '') >= today &&
    SUPPORTED_CROPS.includes(d.crop) &&
    (!crop || d.crop === crop));
}

export const demandById = id => allDemands().find(d => d.id === id) || null;

// Whole days from today until the goods are needed. 0 = today.
export function daysLeft(d){
  const a = new Date(istToday() + 'T00:00:00Z').getTime();
  const b = new Date(String(d.needBy) + 'T00:00:00Z').getTime();
  return Math.round((b - a) / 864e5);
}

export function responsesFor(demandId){
  return read(RES_KEY, []).filter(r => r.demandId === demandId)
    .sort((a, b) => (a.at || 0) - (b.at || 0));
}
export const myResponses = () => read(RES_KEY, []).filter(r => r.mine);

// ---------------------------------------------------------------- writing
function validate(input){
  const crop = String(input.crop || '').toLowerCase();
  if (!SUPPORTED_CROPS.includes(crop)) return { ok: false, error: 'Pick a crop we price.' };
  const qty = Number(input.qtyQtl);
  if (!(qty > 0) || qty > 5000) return { ok: false, error: 'Quantity must be between 1 and 5,000 quintals.' };
  const price = Math.round(Number(input.maxPrice));
  if (!(price >= 500) || price > 20000) return { ok: false, error: 'Enter the maximum ₹/quintal you will pay (₹500–₹20,000).' };
  const needBy = String(input.needBy || '');
  const today = istToday();
  const limit = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(needBy)) return { ok: false, error: 'Pick the date you need the goods by.' };
  if (needBy < today) return { ok: false, error: 'The date you need it by is already past.' };
  if (needBy > limit) return { ok: false, error: 'Post it within 90 days — a demand older than that is not believable.' };
  return { ok: true, crop, qty, price, needBy };
}

//  A guest's uid is the literal string 'demo'. Every rule says
//  request.resource.data.uid == request.auth.uid, so a guest write is refused
//  100% of the time — and the old code caught that refusal, wrote the post to
//  localStorage and told the farmer "it will reach them when you are online",
//  which was never going to happen. Ask for an account instead of lying.
const realUser = () => {
  const u = state.user;
  return !!(u && u.uid && u.uid !== 'demo' && !u.isDemoAccount);
};

export async function postDemand(input){
  const v = validate(input);
  if (!v.ok) return v;
  if (!realUser())
    return { ok: false, needAuth: true,
      error: 'Board par post karne ke liye account chahiye (free, 10 second). Neeche “Sign in” dabao — is phone ka data waise hi rahega.' };

  const demand = {
    id: newId(),
    deskId: myDeskId(),
    deskName: state.profile?.mandiName || state.profile?.village || 'Mandi desk',
    district: state.profile?.district || '',
    crop: v.crop, qtyQtl: v.qty, maxPrice: v.price, needBy: v.needBy,
    note: String(input.note || '').slice(0, 160),
    phone: String(state.profile?.phone || '').replace(/[^\d+]/g, ''),
    status: 'open',
    mine: true,
    at: Date.now()
  };

  // device first — the promise is kept even with no signal
  write(KEY, [...read(KEY, []), demand]);

  try {
    const fb = await import('./firebase.js');
    await fb.addDoc(fb.collection(fb.db, 'demands'), {
      ...demand, uid: state.user?.uid || null, serverAt: fb.serverTimestamp()
    });
    return { ok: true, demand, queued: false };
  } catch (e){
    const q = read(PENDING_KEY, []);
    q.push({ kind: 'demand', id: demand.id, at: Date.now(), error: e.message });
    write(PENDING_KEY, q);
    return { ok: true, demand, queued: true, error: e.message, reason: cloudReason(e) };
  }
}

// Retry whatever is queued. Called on app open and after sign-in; without this
// a post made before signing in sat in localStorage for ever.
export async function flushDemandPending(){
  if (!realUser()) return { ok: false, sent: 0, left: pendingDemandWrites() };
  const q = read(PENDING_KEY, []);
  if (!q.length) return { ok: true, sent: 0, left: 0 };
  const demands = read(KEY, []);
  let sent = 0;
  const fb = await import('./firebase.js');
  for (const item of q){
    try {
      if (item.kind === 'demand'){
        const d = demands.find(x => x.id === item.id);
        if (!d) continue;
        await fb.addDoc(fb.collection(fb.db, 'demands'),
          { ...d, uid: state.user.uid, serverAt: fb.serverTimestamp() });
      } else {
        const r = read(RES_KEY, []).find(x => x.id === item.id);
        if (!r) continue;
        await fb.addDoc(fb.collection(fb.db, 'demandResponses'),
          { ...r, uid: state.user.uid, serverAt: fb.serverTimestamp() });
      }
      sent++;
      write(PENDING_KEY, read(PENDING_KEY).filter(x => x.id !== item.id));
    } catch (e){ /* stays in the queue */ }
  }
  return { ok: true, sent, left: pendingDemandWrites() };
}

export async function closeDemand(id){
  const list = read(KEY, []).map(d => d.id === id ? { ...d, status: 'closed', closedAt: Date.now() } : d);
  write(KEY, list);
  try {
    const fb = await import('./firebase.js');
    await fb.setDoc(fb.doc(fb.db, 'demands', id), { status: 'closed', closedAt: Date.now() }, { merge: true });
    return { ok: true, queued: false };
  } catch (e){ return { ok: true, queued: true, error: e.message }; }
}

export async function respond(demandId, { name, phone, qtyQtl, price, village } = {}){
  if (!realUser())
    return { ok: false, needAuth: true,
      error: 'Commitment bhejne ke liye account chahiye (free). Neeche “Sign in” dabao.' };
  const d = demandById(demandId);
  if (!d) return { ok: false, error: 'That demand is no longer on the board.' };
  if ((d.status || 'open') !== 'open') return { ok: false, error: 'The desk has already closed this demand.' };
  const qty = Number(qtyQtl);
  if (!(qty > 0) || qty > d.qtyQtl) return { ok: false, error: `Offer between 1 and ${d.qtyQtl} quintals.` };
  const ask = Math.round(Number(price) || d.maxPrice);
  if (ask < 100 || ask > 50000) return { ok: false, error: 'That price looks like a typo.' };
  const who = String(name || state.profile?.name || '').trim();
  if (who.length < 2) return { ok: false, error: 'Tell the desk who you are.' };

  const res = {
    id: newId(), demandId, demandCrop: d.crop, deskName: d.deskName,
    // Which desk this reply belongs to. Without it the desk could never read the
    // offers it asked for (and the rules refuse to make replies public, because
    // this document carries a farmer's phone number).
    deskUid: d.uid || null,
    name: who.slice(0, 60),
    phone: String(phone || state.profile?.phone || '').replace(/[^\d+]/g, '').slice(0, 15),
    village: String(village || state.profile?.village || '').slice(0, 60),
    qtyQtl: qty, price: ask,
    uid: state.user?.uid || null,
    mine: true, at: Date.now()
  };
  write(RES_KEY, [...read(RES_KEY, []), res]);

  try {
    const fb = await import('./firebase.js');
    await fb.addDoc(fb.collection(fb.db, 'demandResponses'), { ...res, serverAt: fb.serverTimestamp() });
    return { ok: true, response: res, queued: false };
  } catch (e){
    const q = read(PENDING_KEY, []);
    q.push({ kind: 'response', id: res.id, at: Date.now(), error: e.message });
    write(PENDING_KEY, q);
    return { ok: true, response: res, queued: true, error: e.message, reason: cloudReason(e) };
  }
}

// Why the cloud refused. "You are offline" and "the server said no" need
// different words — telling a farmer to wait for signal fixes nothing when the
// real answer is "sign in first".
export function cloudReason(e){
  const code = String((e && (e.code || e.message)) || '');
  if (/permission-denied|insufficient permissions/i.test(code)) return 'auth';
  if (/unavailable|network|offline|timeout|Failed to fetch/i.test(code)) return 'offline';
  return 'error';
}

export const pendingDemandWrites = () => read(PENDING_KEY, []).length;

// ---------------------------------------------------------------- cloud pull
// One shot, like the price board: whatever the cloud knows replaces nothing,
// it is merged by id so the desk's own offline post is never lost.
export async function pullDemands({ timeoutMs = 5000 } = {}){
  try {
    const fb = await import('./firebase.js');
    const q = fb.query(fb.collection(fb.db, 'demands'), fb.where('status', '==', 'open'));
    const snap = await fb.getDocs(q);
    const cloud = snap.docs.map(d => ({ id: d.id, ...d.data(), mine: false }));
    const byId = new Map(read(KEY, []).map(d => [d.id, d]));
    for (const c of cloud) if (!byId.has(c.id)) byId.set(c.id, c);
    write(KEY, [...byId.values()]);
    return { ok: true, count: cloud.length };
  } catch (e){ return { ok: false, error: e.message }; }
}

// ---------------------------------------------------------------- samples
//  An empty board is honest but useless to look at, so before the first real
//  post we render three examples of the SHAPE of a post. They are never written
//  to storage, never counted, and every screen that uses them says "SAMPLE".
//  A commitment against a sample is refused in the UI (data-sample attr).
export function sampleDemands(crop = null){
  const add = n => {
    const d = new Date(Date.now() + n * 864e5);
    return d.toISOString().slice(0, 10);
  };
  const rows = [
    { id:'sample-1', deskName:'Naharkatia Traders (sample)', district:'Dibrugarh', crop:'paddy',
      qtyQtl:200, maxPrice:2180, needBy:add(3), note:'A-grade, cash on delivery',
      status:'open', sample:true },
    { id:'sample-2', deskName:'Tinsukia FPO gate (sample)', district:'Tinsukia', crop:'paddy',
      qtyQtl:120, maxPrice:2210, needBy:add(1), note:'Dry grain only', status:'open', sample:true },
    { id:'sample-3', deskName:'Duliajan aggregator (sample)', district:'Dibrugarh', crop: crop || 'paddy',
      qtyQtl:60, maxPrice:2150, needBy:add(6), note:'', status:'open', sample:true }
  ];
  return rows;
}

// ---------------------------------------------------------------- text
export function demandText(d, { cropLabel = null, lang = 'en' } = {}){
  const left = daysLeft(d);
  const when = left <= 0 ? 'aaj' : left === 1 ? 'kal' : `${left} din me`;
  const crop = cropLabel || d.crop;
  return [
    `📢 ${d.deskName}${d.district ? ', ' + d.district : ''} needs ${d.qtyQtl} quintals of ${crop}`,
    `Rate: up to ₹${d.maxPrice}/qtl · needed ${when} (${d.needBy})`,
    d.note ? `“${d.note}”` : '',
    d.phone ? `Call: ${d.phone}` : '',
    'Reply on KrishiMitra — Demand board.'
  ].filter(Boolean).join('\n');
}
