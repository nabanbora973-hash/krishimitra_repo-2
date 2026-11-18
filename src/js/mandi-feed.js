// ============================================================================
//  MANDI-REPORTED PRICES  —  the second data source, backed by Firestore
// ----------------------------------------------------------------------------
//  Why this exists
//    The government feed (AGMARKNET on data.gov.in) answers only Indian IPs and
//    rate-limits hard. On a bad day the app would have no real price at all.
//
//    So we added the supply side: a mandi / trader registers in the same app and
//    posts TODAY'S rate for its own gate. A farmer next to that mandi then reads a
//    real, same-day, locally-sourced price — with the mandi's name and the time.
//
//  Backend = Firestore (project asia-south1, Mumbai)
//    collection: mandiReports
//    doc id     : <mandiId>__<crop>__<date>      (one price per gate per crop per day)
//    fields     : mandiId, mandiName, district, crop, modal, min, max, note,
//                 reporter, uid, date, at, updatedAt
//
//    • Live: onSnapshot on today's date — a rate posted anywhere shows up on every
//      phone in seconds. No polling, no rebuild.
//    • Offline: initializeFirestore runs with persistentLocalCache, so a gate with
//      no signal still posts, and the write uploads when it reconnects.
//    • Device mirror: the same report is written to localStorage first, so the
//      price survives even when the account is signed out or cloud is unreachable.
//
//  Honesty ladder (one rung added, nothing renamed)
//    1. LIVE       — government feed, fetched just now
//    2. REPORTED   — posted by a named mandi today                 ← this file
//    3. LAST KNOWN — our last successful government figure
//    4. DEMO       — bundled prototype dataset, labelled everywhere
//
//  A mandi report is NEVER labelled as government data.
// ============================================================================
import { state } from './state.js';

const KEY = 'km_mandi_reports_v1';
const PENDING_KEY = 'km_mandi_pending_v1';   // writes the cloud has not taken yet
const HOUR = 3600e3;

export const istToday = () => new Date(Date.now() + 5.5 * HOUR).toISOString().slice(0, 10);
export const normName = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const ageHours = rep => (rep && rep.at ? (Date.now() - rep.at) / HOUR : null);

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
// The crops this app can price. A rate for anything else could never be matched
// to a farmer's season, so it is refused at the gate rather than stored.
// A gate posts once or twice a day; a bulk entry posts a dozen crops at most.
// 30 covers both with room, and still means a spammed account runs dry by lunch.
export const REPORT_DAILY_CAP = 30;

export const SUPPORTED_CROPS = ['paddy', 'tomato', 'mustard', 'potato', 'brinjal', 'cabbage'];
const price = n => {
  const v = Math.round(Number(String(n ?? '').replace(/[^0-9.]/g, '')));
  return isFinite(v) && v > 0 ? v : null;
};

// ---------------------------------------------------------------- device mirror
function readLocal(){
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(arr) ? arr.filter(isObj) : [];
  } catch { return []; }
}
function writeLocal(list){
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-800))); } catch {}
}

// The in-memory board: what the farmer's table reads. Two writers fill it —
// the Firestore snapshot (cloud) and the device mirror (offline / signed out).
// Cloud rows win a tie on `at`, so an edit made on another phone is never undone
// by a stale local copy.
const BOARD = new Map();
let BOARD_AT = 0;
const boardKey = r => `${r.mandiId || normName(r.mandiName)}|${r.crop}|${r.date}`;

function mergeIntoBoard(rows, { fromCloud = false } = {}){
  let changed = false;
  for (const r of rows){
    if (!isObj(r) || !r.mandiName || !r.crop) continue;
    const k = boardKey(r);
    const prev = BOARD.get(k);
    if (!prev || (r.at || 0) >= (prev.at || 0) || (fromCloud && !prev.fromCloud)){
      BOARD.set(k, { ...r, fromCloud: fromCloud || prev?.fromCloud || false });
      changed = true;
    }
  }
  if (changed){
    BOARD_AT = Date.now();
    state.mandiReportsUpdatedAt = BOARD_AT;
    document.dispatchEvent(new CustomEvent('km:mandi-report', { detail: null }));
  }
  return changed;
}

// Board = device mirror first (instant, works signed out), then cloud on top.
export function seedBoardFromDevice(){
  mergeIntoBoard(readLocal());
}

export const allReports = () => [...BOARD.values()].sort((a, b) => (b.at || 0) - (a.at || 0));

export function reportsForCrop(crop){
  const seen = new Map();
  for (const r of BOARD.values()){
    if (crop && r.crop !== crop) continue;
    const k = r.mandiId || normName(r.mandiName);
    const prev = seen.get(k);
    if (!prev || (r.at || 0) > (prev.at || 0)) seen.set(k, r);
  }
  return [...seen.values()].sort((a, b) => (b.at || 0) - (a.at || 0));
}

export const todaysReports = crop => reportsForCrop(crop).filter(r => r.date === istToday());

// The lookup the market table uses: exact mandi id, then normalised name, then a
// whole-word match so "Jorhat Mandi" (bundled) and "Jorhat" (government feed)
// both find the same report.
export function reportFor(mandiName, crop, { mandiId = null, allowStale = false } = {}){
  const want = normName(mandiName);
  let hit = null;
  for (const r of reportsForCrop(crop)){
    const rn = normName(r.mandiName);
    const idHit  = mandiId && r.mandiId && r.mandiId === mandiId;
    const nameHit = rn === want;
    const loose  = !idHit && !nameHit && want.length > 3 && rn.length > 3 &&
                   (rn.startsWith(want + ' ') || want.startsWith(rn + ' '));
    if (idHit || nameHit || loose){ hit = r; break; }
  }
  if (!hit) return null;
  const today = hit.date === istToday();
  if (!today && !allowStale) return null;
  return { ...hit, today, ageHours: ageHours(hit) };
}

export const hasReportsToday = () => allReports().some(r => r.date === istToday());

// ---------------------------------------------------------------- cloud
const cloudOn = () => !state.demo && !!state.user?.uid && state.user.uid !== 'demo';

let unsub = null;
let started = false;

// Live subscription to today's board. Safe to call more than once.
export async function startMandiFeed(){
  seedBoardFromDevice();
  if (started || !cloudOn()) return { live: false, reason: cloudOn() ? 'started' : 'signed out' };
  started = true;

  try {
    const fb = await import('./firebase.js');
    if (!fb.db || !fb.onSnapshot) return { live: false, reason: 'cloud not configured' };

    // Re-read the mirror the moment the network returns — cached writes land here.
    window.addEventListener('online', () => seedBoardFromDevice());

    unsub = fb.onSnapshot(
      fb.query(fb.collection(fb.db, 'mandiReports'), fb.where('date', '==', istToday())),
      snap => {
        const rows = snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
        // A cloud snapshot is authoritative for today: replace, do not merge,
        // so a removed report actually disappears from every phone.
        for (const k of [...BOARD.keys()]){
          if (BOARD.get(k).date === istToday() && BOARD.get(k).fromCloud) BOARD.delete(k);
        }
        mergeIntoBoard(rows, { fromCloud: true });
        state.mandiFeedLive = true;
      },
      err => {
        console.warn('Mandi feed subscription failed — device mirror still in use:', err.message);
        state.mandiFeedLive = false;
      }
    );
    return { live: true };
  } catch (e){
    console.warn('Mandi feed unavailable:', e.message);
    return { live: false, reason: e.message };
  }
}

export function stopMandiFeed(){
  if (unsub){ try { unsub(); } catch {} }
  unsub = null; started = false;
}

// ---------------------------------------------------------------- submit
// One price per gate per crop per day. A correction overwrites, it never adds a
// second price for the same day.
export async function submitReport(input){
  const now = Date.now();
  const rep = {
    mandiId:   String(input.mandiId || normName(input.mandiName)).trim(),
    mandiName: String(input.mandiName || '').trim(),
    district:  String(input.district || '').trim(),
    crop:      String(input.crop || '').trim(),
    modal:     price(input.modal),
    min:       price(input.min),
    max:       price(input.max),
    note:      String(input.note || '').trim().slice(0, 160),
    // The board photo is proof, not decoration: it is stored with the rate so a
    // farmer can see the number was taken at the gate. Capped so one rate cannot
    // fill the device store.
    photo:     (input.photo && String(input.photo).startsWith('data:image/') &&
                String(input.photo).length * 0.75 <= 260 * 1024) ? String(input.photo) : null,
    reporter:  String(input.reporter || '').trim().slice(0, 60),
    uid:       state.user?.uid || 'device',
    at:        now,
    date:      istToday(),
    source:    'mandi'
  };

  if (!rep.mandiName) return { ok: false, error: 'Mandi name is missing.' };
  if (!rep.crop)      return { ok: false, error: 'Pick the crop you are quoting.' };
  if (!SUPPORTED_CROPS.includes(rep.crop))
    return { ok: false, error: `This app prices ${SUPPORTED_CROPS.join(', ')} — pick one of those.` };
  if (!rep.modal)     return { ok: false, error: "Enter today's modal price — a number above 0." };
  if (rep.min != null && rep.max != null && rep.min > rep.max)
    return { ok: false, error: 'The lowest price cannot be higher than the highest.' };

  // 1) device mirror first — the gate must never lose a price to a bad signal
  const k = boardKey(rep);
  writeLocal([...readLocal().filter(r => boardKey(r) !== k), rep]);
  mergeIntoBoard([rep]);

  // 2) Firestore — offline writes are queued by the SDK and uploaded on reconnect
  const cloud = await pushToCloud(rep);
  document.dispatchEvent(new CustomEvent('km:mandi-report', { detail: rep }));
  return { ok: true, report: rep, cloud: cloud.ok, cloudError: cloud.error || null };
}

export async function removeReport(rep){
  const k = boardKey(rep);
  writeLocal(readLocal().filter(r => boardKey(r) !== k));
  BOARD.delete(k);
  state.mandiReportsUpdatedAt = Date.now();
  document.dispatchEvent(new CustomEvent('km:mandi-report', { detail: null }));
  if (!cloudOn()) return { ok: true };
  try {
    const fb = await import('./firebase.js');
    if (!fb.db) return { ok: true };
    const id = `${rep.mandiId || normName(rep.mandiName)}__${rep.crop}__${rep.date}`
      .replace(/[^a-zA-Z0-9_-]+/g, '-');
    await fb.deleteDoc(fb.doc(fb.db, 'mandiReports', id));
    return { ok: true };
  } catch (e){
    return { ok: false, error: e.message };    // queued offline by the SDK
  }
}

// Reports written while the cloud was unreachable. Counted, shown, and cleared
// the moment a write succeeds — never silently dropped.
function readPending(){
  try { const a = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}
function writePending(list){
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(-100))); } catch {}
}
const pendKey = r => `${r.mandiId || normName(r.mandiName)}|${r.crop}|${r.date}`;
export const pendingWrites = () => readPending().length;

async function pushToCloud(rep){
  if (!cloudOn()) return { ok: false, error: 'device only' };
  try {
    const fb = await import('./firebase.js');
    if (!fb.db) return { ok: false, error: 'cloud not configured' };
    const id = `${rep.mandiId}__${rep.crop}__${rep.date}`.replace(/[^a-zA-Z0-9_-]+/g, '-');

    // One write = one unit of the day's allowance. The spend rides in the SAME
    // batch as the rate, because the Firestore rule checks the counter with
    // getAfter(): a report that does not carry a +1 with it is rejected. So a
    // script cannot post a thousand fake rates without a thousand accounts.
    const uSnap = await fb.getDoc(fb.doc(fb.db, 'users', rep.uid));
    const cur = uSnap.exists() ? (uSnap.data().reportsToday || null) : null;
    const spend = (!cur || cur.date !== rep.date) ? 1 : Number(cur.count || 0) + 1;
    if (spend > REPORT_DAILY_CAP)
      return { ok: false, error: `Aaj ki limit poori (${REPORT_DAILY_CAP} rate/din). Kal naya din — phir bhej sakte hain.` };

    // Inside a batch every call must be synchronous — doc() is async now, so
    // build the refs with the sync form first.
    const batch = fb.writeBatch(fb.db);
    const userRef = fb.docSync(fb.db, 'users', rep.uid);
    const reportRef = fb.docSync(fb.db, 'mandiReports', id);
    batch.set(userRef,
      { reportsToday: { date: rep.date, count: spend } }, { merge: true });
    batch.set(reportRef, {
      hasPhoto: !!rep.photo,
      mandiId: rep.mandiId, mandiName: rep.mandiName, district: rep.district,
      crop: rep.crop, modal: rep.modal, min: rep.min, max: rep.max,
      note: rep.note, reporter: rep.reporter, uid: rep.uid,
      // Photos stay on the device: a data URL is too large for a Firestore doc and
      // the farmer's evidence does not need to leave his phone.

      date: rep.date, at: rep.at, updatedAt: fb.serverTimestamp()
    }, { merge: true });
    await batch.commit();
    // It reached the cloud — drop it from the queue if it was waiting there.
    writePending(readPending().filter(r => pendKey(r) !== pendKey(rep)));
    return { ok: true };
  } catch (e){
    // Keep it on the device, queue it, and say so — never pretend it reached
    // other phones.
    const list = readPending().filter(r => pendKey(r) !== pendKey(rep));
    list.push(rep);
    writePending(list);
    console.warn('Mandi report queued on this device — cloud write failed:', e.message);
    return { ok: false, error: e.message, queued: true };
  }
}

// Retry everything that is waiting. Called on reconnect and on app open.
export async function flushPending(){
  const list = readPending();
  if (!list.length) return { ok: true, sent: 0 };
  let sent = 0;
  for (const rep of list){
    const r = await pushToCloud(rep);
    if (r.ok) sent++;
  }
  document.dispatchEvent(new CustomEvent('km:mandi-report', { detail: null }));
  return { ok: true, sent, left: pendingWrites() };
}

// One-shot pull, used when a farmer signs in on a new phone or opens the desk.
export async function pullReportsFromCloud({ timeoutMs = 4000 } = {}){
  if (!cloudOn()) return { ok: false, count: 0 };
  try {
    const fb = await import('./firebase.js');
    if (!fb.db || !fb.getDocs) return { ok: false, count: 0 };
    const work = (async () => {
      const snap = await fb.getDocs(fb.query(
        fb.collection(fb.db, 'mandiReports'), fb.where('date', '==', istToday())));
      return snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
    })();
    const rows = await Promise.race([work, new Promise(r => setTimeout(() => r(null), timeoutMs))]);
    if (!rows) return { ok: false, count: 0 };
    if (rows.length) mergeIntoBoard(rows, { fromCloud: true });
    return { ok: true, count: rows.length };
  } catch (e){
    console.warn('Mandi reports not pulled:', e.message);
    return { ok: false, count: 0 };
  }
}

// ---------------------------------------------------------------- status line
export function reportStatusLine(){
  const today = allReports().filter(r => r.date === istToday());
  if (!today.length) return '';
  const mandis = new Set(today.map(r => r.mandiId || normName(r.mandiName)));
  return `<span class="chip reported">REPORTED</span> ${mandis.size} mandi${mandis.size > 1 ? 's' : ''} ` +
         `posted today's rate from the gate itself` +
         (state.mandiFeedLive ? ' · updating live' : '');
}

export const REPORT_KEY = KEY;
export const _internal = { boardKey, mergeIntoBoard, BOARD };
