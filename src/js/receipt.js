// ============================================================================
//  SALE RECEIPT  —  what the farmer actually got, written down
// ----------------------------------------------------------------------------
//  Three months after a sale, the question is never "what was the mandi rate" —
//  it is "kitna mila tha, kisne liya, kitna kaat liya". That is a receipt.
//
//  It is generated on the phone, stored with the sale, printable, and shareable
//  to WhatsApp. No paper trail is lost because a screen was closed.
// ============================================================================
import { state } from './state.js';

const rup = n => (n == null || !isFinite(n) ? '—' : '₹' + Math.round(n).toLocaleString('en-IN'));
const pad = n => String(n).padStart(2, '0');

export const receiptNo = sale =>
  'KM-' + String(sale.date || '').replace(/-/g, '').slice(2) + '-' +
  String(sale.id || '0').slice(-4).toUpperCase();

// Amount is what matters: qty × price, minus whatever the farmer says was cut
// (weighing, commission). The deduction is explicit, never hidden in a total.
export function receiptTotals(sale){
  const qty = Number(sale.qty) || 0;
  const price = Number(sale.price) || 0;
  const gross = qty * price;
  const cuts = Number(sale.deductions) || 0;
  const net = Math.max(0, gross - cuts);
  return { qty, price, gross, cuts, net, perQtlNet: qty ? Math.round(net / qty) : null };
}

export function receiptText(sale){
  const t = receiptTotals(sale);
  const lines = [
    '🧾 KrishiMitra — bikri ki raseed',
    `No: ${receiptNo(sale)}`,
    `Date: ${sale.date || '—'}`,
    '',
    `Kisan: ${state.profile?.name || '—'}`,
    `Gaon: ${state.profile?.village || '—'}`,
    `Kharidar: ${sale.party || sale.market || '—'}`,
    '',
    `Fasal: ${sale.cropLabel || sale.crop || '—'}`,
    `Maal: ${t.qty} qtl × ₹${t.price}/qtl`,
    `Kul: ${rup(t.gross)}`,
    t.cuts ? `Kataut: −${rup(t.cuts)}` : null,
    `Haath me: ${rup(t.net)}${t.perQtlNet != null ? ` (₹${t.perQtlNet}/qtl)` : ''}`,
    '',
    sale.photo ? '(board ki photo is raseed ke saath saved hai)' : null,
    'Ye raseed app ne phone par banayi hai.'
  ].filter(Boolean);
  return lines.join('\n');
}

// A print-ready block. window.print() on this is enough — no PDF library.
export function receiptHTML(sale){
  const t = receiptTotals(sale);
  return `
    <div class="rcpt" id="rcptCard">
      <div class="rcpthead">
        <div>
          <b>KrishiMitra</b>
          <div class="statlabel">Bikri ki raseed · sale receipt</div>
        </div>
        <div class="rcptno">${receiptNo(sale)}</div>
      </div>
      <div class="rcptmeta">
        <div><span>Date</span><b>${sale.date || '—'}</b></div>
        <div><span>Kisan</span><b>${esc(state.profile?.name || '—')}</b></div>
        <div><span>Kharidar</span><b>${esc(sale.party || sale.market || '—')}</b></div>
        <div><span>Fasal</span><b>${esc(sale.cropLabel || sale.crop || '—')}</b></div>
      </div>
      <table class="rcpttable">
        <tr><td>Maal</td><td>${t.qty} qtl</td></tr>
        <tr><td>Bhav</td><td>${rup(t.price)} /qtl</td></tr>
        <tr><td>Kul</td><td>${rup(t.gross)}</td></tr>
        ${t.cuts ? `<tr><td>Kataut</td><td>− ${rup(t.cuts)}</td></tr>` : ''}
        <tr class="rcptnet"><td>Haath me</td><td>${rup(t.net)}</td></tr>
      </table>
      ${sale.photo ? `<img class="rcptphoto" src="${sale.photo}" alt="mandi board photo">` : ''}
      <div class="statlabel" style="margin-top:10px">
        Ye raseed phone par banayi gayi hai. Koi server par nahi gayi.
      </div>
    </div>`;
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function printReceipt(sale){
  try {
    const w = window.open('', '_blank');
    if (!w) return { ok: false, error: 'Popup blocked' };
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${receiptNo(sale)}</title>
      <style>
        body{font-family:system-ui,Segoe UI,sans-serif;padding:18px;color:var(--green-900)}
        .rcpt{max-width:420px;margin:0 auto;border:1px solid #DDEBE1;border-radius:12px;padding:16px}
        .rcpthead{display:flex;justify-content:space-between;align-items:flex-start;
                  border-bottom:1px dashed #DDEBE1;padding-bottom:10px;margin-bottom:10px}
        .rcpthead b{color:var(--green-900);font-size:18px}
        .rcptno{font-family:ui-monospace,monospace;font-size:13.5px;color:var(--ink)}
        .rcptmeta div{display:flex;justify-content:space-between;font-size:13.5px;padding:3px 0}
        .rcptmeta span{color:var(--ink)}
        .rcpttable{width:100%;border-collapse:collapse;margin-top:10px;font-size:15.5px}
        .rcpttable td{padding:7px 0;border-bottom:1px solid #EDF4EF}
        .rcpttable td:last-child{text-align:right;font-weight:600}
        .rcptnet td{border-top:2px solid #0B4A2F;border-bottom:0;color:var(--green-900);font-weight:800;font-size:18px}
        .rcptphoto{width:100%;border-radius:8px;margin-top:10px}
        .statlabel{font-size:12px;color:var(--ink)}
      </style></head><body>${receiptHTML(sale)}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch {} }, 250);
    return { ok: true };
  } catch (e){ return { ok: false, error: String(e.message || e) }; }
}

export { pad };
