// ============================================================================
//  BUY LIST — the desk's counter register for the day.
// ============================================================================
import { state } from './state.js';
import { CROPS } from './crops.js';
import { SUPPORTED_CROPS } from './mandi-feed.js';
import { addPurchase, removePurchase, todayPurchases, purchaseTotals, purchaseNet,
         slipHTML, slipText, printSlip } from './purchases.js';
import { toast } from './ui.js';
import { shareText } from './share.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const label = k => esc(CROPS?.[k]?.label || k);
const money = n => '₹' + Math.round(n).toLocaleString('en-IN');
const GRADES = ['', 'A', 'B', 'C'];

export function renderBuyList(){
  const v = document.getElementById('view-deskbuy');
  if (!v) return;
  const crops = SUPPORTED_CROPS;
  const list = todayPurchases();
  const t = purchaseTotals(list);

  v.innerHTML = `
    <h2>Buy list <span class="chip reported">MANDI</span></h2>
    <p class="sub">What came through your gate today. Every entry gives the farmer a slip with the
      kaata and hamali shown — and gives you a register that adds up.</p>

    <div class="grid3" style="margin-bottom:14px">
      <div class="card"><div class="statlabel">Quintals today</div><div class="stat">${t.qty}</div>
        <div class="statlabel">${t.count} lot${t.count === 1 ? '' : 's'} · ${t.farmers} farmer${t.farmers === 1 ? '' : 's'}</div></div>
      <div class="card"><div class="statlabel">Average rate</div><div class="stat">${t.avgRate ? money(t.avgRate) : '—'}<span class="statlabel"> /q</span></div>
        <div class="statlabel">gross ${money(t.gross)}</div></div>
      <div class="card"><div class="statlabel">Payable today</div><div class="stat orange">${money(t.net)}</div>
        <div class="statlabel">after kaata and hamali</div></div>
    </div>

    <div class="card">
      <b style="color:var(--green)">Add a purchase</b>
      <div class="wf2" style="margin-top:8px">
        <label>Farmer name<input id="blName" type="text" placeholder="e.g. Bhaskar Das"></label>
        <label>Mobile (optional)<input id="blPhone" type="tel" inputmode="numeric" placeholder="+91…"></label>
        <label>Crop<select id="blCrop">${crops.map(k => `<option value="${k}">${label(k)}</option>`).join('')}</select></label>
        <label>Grade<select id="blGrade">${GRADES.map(g => `<option value="${g}">${g || '—'}</option>`).join('')}</select></label>
        <label>Quintals<input id="blQty" type="number" inputmode="decimal" min="0" step="0.1" placeholder="e.g. 12.5"></label>
        <label>Rate ₹/qtl<input id="blRate" type="number" inputmode="numeric" min="0" step="1" placeholder="e.g. 2200"></label>
        <label>Kaata %<input id="blKaata" type="number" min="0" step="0.1" value="0.5"></label>
        <label>Hamali ₹/qtl<input id="blHamali" type="number" min="0" step="1" value="0"></label>
      </div>
      <label>Note<input id="blNote" type="text" maxlength="120" placeholder="e.g. paid cash, balance Friday"></label>
      <div class="blnet" id="blNet">Net to farmer appears here.</div>
      <p class="statlabel" id="blErr" style="color:var(--red);margin:4px 0"></p>
      <button class="btn" id="blAdd" type="button">Add to the buy list</button>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="cardhead"><b>Today’s lots</b><span class="chip">${list.length}</span></div>
      ${list.length ? `<div class="tablewrap"><table>
        <tr><th>Farmer</th><th>Crop</th><th>Qty</th><th>Rate</th><th>Net</th><th>Slip</th></tr>
        ${list.map(p => {
          const n = purchaseNet(p);
          return `<tr>
            <td><b>${esc(p.farmer)}</b>${p.village ? `<div class="statlabel">${esc(p.village)}</div>` : ''}</td>
            <td>${label(p.crop)}${p.grade ? ` · ${esc(p.grade)}` : ''}</td>
            <td>${n.qty} qtl</td>
            <td>${money(n.rate)}</td>
            <td><b>${money(n.total)}</b></td>
            <td><button class="btn ghost small" data-slip="${esc(p.id)}" type="button">🧾</button></td>
          </tr>`;
        }).join('')}
      </table></div>` : `<p class="statlabel">No lots yet today. The first entry shows its slip here — print it
        or send it to the farmer on WhatsApp.</p>`}
    </div>

    <div id="slipHost"></div>`;

  const read = () => ({
    farmer: document.getElementById('blName').value,
    phone: document.getElementById('blPhone').value,
    crop: document.getElementById('blCrop').value,
    grade: document.getElementById('blGrade').value,
    qtyQtl: document.getElementById('blQty').value,
    rate: document.getElementById('blRate').value,
    kaataPct: document.getElementById('blKaata').value,
    hamaliPerQtl: document.getElementById('blHamali').value,
    note: document.getElementById('blNote').value
  });

  const paintNet = () => {
    const d = read();
    const n = purchaseNet(d);
    const box = document.getElementById('blNet');
    if (!Number(d.qtyQtl) || !Number(d.rate)){ box.textContent = 'Net to farmer appears here.'; return; }
    box.innerHTML = `${money(n.netPerQtl)}/qtl after cuts · <b>${money(n.total)}</b> on ${n.qty} quintals`;
  };
  ['blQty', 'blRate', 'blKaata', 'blHamali'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.oninput = paintNet;
  });

  document.getElementById('blAdd').onclick = () => {
    const r = addPurchase(read());
    if (!r.ok){ document.getElementById('blErr').textContent = r.error; return; }
    toast(`Added — ${r.entry.farmer}, ${r.entry.qtyQtl} quintals`);
    renderBuyList();
  };

  v.querySelectorAll('[data-slip]').forEach(b => {
    b.onclick = () => {
      const e = [...todayPurchases()].find(p => p.id === b.dataset.slip);
      if (!e) return;
      const host = document.getElementById('slipHost');
      host.innerHTML = `${slipHTML(e)}
        <div class="wsbtns" style="margin-top:8px">
          <button class="btn small" id="slipShare" type="button">📲 Send to farmer</button>
          <button class="btn ghost small" id="slipPrint" type="button">🖨 Print</button>
          <button class="btn ghost small" id="slipDel" type="button">Remove</button>
        </div>`;
      document.getElementById('slipShare').onclick = () => shareText(slipText(e));
      document.getElementById('slipPrint').onclick = () => printSlip(e);
      document.getElementById('slipDel').onclick = () => {
        removePurchase(e.id); toast('Removed'); renderBuyList();
      };
      host.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    };
  });
}
