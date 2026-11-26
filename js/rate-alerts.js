// ============================================================================
//  PRICE ALERTS  —  "paddy ₹2,400 cross kare to batao"
// ----------------------------------------------------------------------------
//  A farmer is not watching the app all day. An alert is the reason to open it
//  again — and a price he chose himself is a price he trusts.
//
//  Rules kept deliberately simple and honest:
//   • the farmer sets the number, the crop and the direction (above / below)
//   • the alert fires ONCE per crossing, not on every refresh
//   • the alert says WHERE the price came from and WHEN it was seen
//   • no server, no push service: checked when the app opens or prices refresh
// ============================================================================
import { state } from './state.js';
import { CROPS } from './crops.js';
import { istToday } from './mandi-feed.js';

const KEY = 'km_price_alerts_v1';

const read = () => {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(a) ? a.filter(x => x && x.id) : [];
  } catch { return []; }
};
const write = list => { try { localStorage.setItem(KEY, JSON.stringify(list.slice(-40))); } catch {} };

export const allAlerts = () => read();

export function addAlert({ crop, direction = 'above', price, mandiName = null }){
  const p = Number(String(price ?? '').replace(/[^0-9.]/g, ''));
  if (!crop) return { ok: false, error: 'Pick a crop first.' };
  if (!isFinite(p) || p <= 0) return { ok: false, error: 'Enter a price above 0.' };
  if (p > 200000) return { ok: false, error: 'That price looks like a typo.' };
  const a = {
    id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    crop, direction: direction === 'below' ? 'below' : 'above',
    price: Math.round(p), mandiName,
    createdAt: Date.now(), firedAt: null, lastSeen: null
  };
  write([...read(), a]);
  return { ok: true, alert: a };
}

export const removeAlert = id => { write(read().filter(a => a.id !== id)); };

// The best price we currently hold for a crop, plus where it came from.
export function bestPriceFor(crop){
  const rows = (state.markets || []).filter(r => r.netPerQtl != null);
  if (!rows.length) return null;
  const top = rows.reduce((a, b) => (b.price > a.price ? b : a));
  return {
    price: top.price, market: top.name,
    source: top.reported ? 'REPORTED' : (state.priceSource?.source || 'DEMO'),
    date: top.reported ? istToday() : (state.priceSource?.govDate || null)
  };
}

// Run every active alert against the current price. Returns the ones that fired
// on THIS check, so the caller can toast / notify without repeating itself.
export function checkAlerts(){
  const list = read();
  const fired = [];
  let changed = false;

  for (const a of list){
    if (a.firedAt) continue;                      // one crossing, one alert
    const best = bestPriceFor(a.crop);
    if (!best) continue;
    a.lastSeen = best.price;
    changed = true;
    const hit = a.direction === 'above' ? best.price >= a.price : best.price <= a.price;
    if (hit){
      a.firedAt = Date.now();
      fired.push({ ...a, seen: best.price, market: best.market, source: best.source, date: best.date });
    }
  }
  if (changed) write(list);
  return fired;
}

export function alertText(f){
  const label = CROPS?.[f.crop]?.label || f.crop;
  const dir = f.direction === 'above' ? 'upar' : 'neeche';
  return `${label} ${f.direction === 'above' ? '₹' + f.price + ' ke upar' : '₹' + f.price + ' ke neeche'} — ` +
         `ab ₹${f.seen} (${f.market}).`;
}

// Optional system notification, only when the farmer has allowed it.
export async function notify(fired){
  if (!fired.length) return { ok: false };
  try {
    if (typeof Notification === 'undefined') return { ok: false };
    let perm = Notification.permission;
    if (perm === 'default') perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false };
    for (const f of fired){
      new Notification('KrishiMitra — price alert', { body: alertText(f) });   // eslint-disable-line no-new
    }
    return { ok: true };
  } catch { return { ok: false }; }
}

export const ALERT_KEY = KEY;
