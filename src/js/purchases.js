// ============================================================================
//  BUY LIST — the desk's own purchase register.
// ----------------------------------------------------------------------------
//  A trader buys from ten farmers before lunch. Until now this app only ever
//  recorded a farmer SELLING. This is the other side: farmer name, quintals,
//  rate, kaata, hamali → the net the desk must pay, and a slip the farmer can
//  carry home or receive on WhatsApp.
//
//  Stored on this device only (km_purchases_v1) — it is the desk's own
//  bookkeeping, not something to broadcast. Nothing here is invented: every
//  rupee comes from the numbers the desk typed at the gate.
// ============================================================================
import { istToday } from './mandi-feed.js';

// A purchase slip prints the farmer's name, village, phone and the desk's note.
// All five are typed text. slipHTML() is also written into a NEW window with
// document.write(), so an unescaped note there runs as a fresh document.
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
import { state } from './state.js';

const KEY = 'km_purchases_v1';
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

const read = () => { try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a.filter(isObj) : []; } catch { return []; } };
const write = list => { try { localStorage.setItem(KEY, JSON.stringify(list.slice(-600))); } catch {} };

export const PURCHASE_KEY = KEY;
export const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

export const allPurchases = () => read().slice().sort((a, b) => (b.at || 0) - (a.at || 0));
export const todayPurchases = () => allPurchases().filter(p => p.date === istToday());
export const purchasesFor = farmer => allPurchases().filter(p => p.farmer.toLowerCase() === String(farmer || '').toLowerCase());

// Every rupee on one lot, per quintal and in total.
export function purchaseNet(e = {}){
  const qty  = Math.max(0, Number(e.qtyQtl) || 0);
  const rate = Math.max(0, Number(e.rate) || 0);
  const kaataPct = Math.max(0, Math.min(20, Number(e.kaataPct) || 0));
  const hamaliPerQtl = Math.max(0, Number(e.hamaliPerQtl) || 0);
  const kaataCut = rate * kaataPct / 100;
  const netPerQtl = Math.max(0, rate - kaataCut - hamaliPerQtl);
  const gross = rate * qty;
  const total = Math.round(netPerQtl * qty);
  return { qty, rate, kaataPct, hamaliPerQtl, kaataCut, netPerQtl, gross: Math.round(gross), total };
}

export function addPurchase(input = {}){
  const farmer = String(input.farmer || '').trim();
  if (farmer.length < 2) return { ok: false, error: 'Enter the farmer’s name.' };
  const crop = String(input.crop || '').toLowerCase();
  if (!crop) return { ok: false, error: 'Pick the crop.' };
  const qty = Number(input.qtyQtl);
  if (!(qty > 0) || qty > 5000) return { ok: false, error: 'Quintals must be between 1 and 5,000.' };
  const rate = Number(input.rate);
  if (!(rate >= 100) || rate > 50000) return { ok: false, error: 'Rate must be ₹100–₹50,000 per quintal.' };

  const entry = {
    id: newId(),
    date: input.date || istToday(),
    farmer: farmer.slice(0, 60),
    phone: String(input.phone || '').replace(/[^\d+]/g, '').slice(0, 15),
    village: String(input.village || '').slice(0, 60),
    crop,
    qtyQtl: qty,
    rate: Math.round(rate),
    kaataPct: Number(input.kaataPct) || 0,
    hamaliPerQtl: Number(input.hamaliPerQtl) || 0,
    grade: String(input.grade || '').slice(0, 12),
    note: String(input.note || '').slice(0, 120),
    deskName: state.profile?.mandiName || state.profile?.village || '',
    at: Date.now()
  };
  write([...read(), entry]);
  return { ok: true, entry };
}

export function removePurchase(id){
  write(read().filter(p => p.id !== id));
  return { ok: true };
}

// Today's counter, in one card: how much came in and what is owed.
export function purchaseTotals(list = []){
  const t = { count: list.length, qty: 0, gross: 0, net: 0, farmers: new Set() };
  for (const p of list){
    const n = purchaseNet(p);
    t.qty += n.qty;
    t.gross += n.gross;
    t.net += n.total;
    t.farmers.add(p.farmer.toLowerCase());
  }
  t.farmers = t.farmers.size;
  t.avgRate = t.qty ? Math.round(t.gross / t.qty) : 0;
  return t;
}

const money = n => '₹' + Math.round(n).toLocaleString('en-IN');

export function slipText(e){
  const n = purchaseNet(e);
  return [
    `🧾 ${e.deskName || 'Purchase slip'} — ${e.date}`,
    `Farmer: ${e.farmer}${e.village ? ' (' + e.village + ')' : ''}`,
    `${e.crop}${e.grade ? ' · ' + e.grade : ''} · ${n.qty} quintals @ ${money(n.rate)}/qtl`,
    `Kaata ${n.kaataPct}%: −${money(n.kaataCut)}/qtl`,
    n.hamaliPerQtl ? `Hamali: −${money(n.hamaliPerQtl)}/qtl` : '',
    `Net to farmer: ${money(n.netPerQtl)}/qtl × ${n.qty} = ${money(n.total)}`,
    e.note ? `Note: ${e.note}` : '',
    '— KrishiMitra'
  ].filter(Boolean).join('\n');
}

export function slipHTML(e){
  const n = purchaseNet(e);
  return `<div class="slip">
    <div class="sliphead"><b>${esc(e.deskName) || 'Purchase slip'}</b><span>${esc(e.date)}</span></div>
    <div class="slipmeta">${esc(e.farmer)}${e.village ? ' · ' + esc(e.village) : ''}${e.phone ? ' · ' + esc(e.phone) : ''}</div>
    <table class="minitable">
      <tr><td>${esc(e.crop)}${e.grade ? ' (' + esc(e.grade) + ')' : ''} · ${n.qty} qtl</td><td>${money(n.gross)}</td></tr>
      <tr><td>Kaata ${n.kaataPct}%</td><td>−${money(n.kaataCut * n.qty)}</td></tr>
      ${n.hamaliPerQtl ? `<tr><td>Hamali</td><td>−${money(n.hamaliPerQtl * n.qty)}</td></tr>` : ''}
      <tr class="wsnet"><td><b>Net to farmer</b></td><td><b>${money(n.total)}</b></td></tr>
    </table>
    <div class="statlabel">${money(n.netPerQtl)}/qtl after cuts${e.note ? ' · ' + esc(e.note) : ''}</div>
  </div>`;
}

export function printSlip(e){
  const w = window.open('', '_blank', 'width=380,height=600');
  if (!w){ window.print(); return; }
  w.document.write(`<html><head><title>Slip ${esc(e.farmer)}</title>
    <style>body{font:13px/1.5 system-ui,sans-serif;padding:16px}table{width:100%;border-collapse:collapse}td{padding:4px 0}td:last-child{text-align:right}
    .sliphead{display:flex;justify-content:space-between;border-bottom:1px solid #586A5F;padding-bottom:6px;margin-bottom:8px}</style></head>
    <body>${slipHTML(e)}<p style="margin-top:14px;font-size:12px;color:var(--ink)">Signed: ____________________</p></body></html>`);
  w.document.close();
  w.focus();
  w.print();
}
