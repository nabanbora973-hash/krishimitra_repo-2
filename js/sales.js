// ============================================================================
//  MY SALES — the farmer's own sale log ("Your recent sales, from your history").
//  Kept on this device (localStorage) so the demo works with no account and no
//  network. In DEMO mode it starts with two seeded rows, clearly labelled DEMO.
// ============================================================================
import { state } from "./state.js";

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
import { CROPS } from "./crops.js";
import { toast, rupees, demoBadge } from "./ui.js";
import { receiptHTML, receiptText, printReceipt, receiptTotals } from "./receipt.js";
import { shareText } from "./share.js";

const KEY = "km_sales_v1";

const DEMO_SEED = [
  { id: "s-demo-1", date: "2026-09-12", crop: "paddy", market: "Village trader", qty: 8,  price: 2050 },
  { id: "s-demo-2", date: "2026-09-26", crop: "paddy", market: "Tinsukia Mandi", qty: 6,  price: 2240 }
];

// Some contexts (file:// pages, strict iframes) block localStorage entirely —
// fall back to memory so the sales log still works during a demo.
let MEM = null;
export function loadSales(){
  try {
    const raw = (window.__kmSafeLS || localStorage).getItem(KEY);
    return JSON.parse(raw || "null") || (MEM || []);
  } catch { return MEM || []; }
}
function saveSales(list){
  MEM = list;
  try { (window.__kmSafeLS || localStorage).setItem(KEY, JSON.stringify(list)); } catch {}
}
// Examples are for an EXPLICIT demo only (?demo=1, or the offline file).
// A guest who never sold anything sees an empty log — his own numbers or none.
export function seedIfEmpty(isExplicitDemo){
  if (!isExplicitDemo) return;
  if (!loadSales().length) saveSales(DEMO_SEED);
}
// What to put in the empty price box: the live rate if the feed has handed us
// one, otherwise a plain prompt. Never an invented figure.
export function livePriceHint(){
  const crop = state.season?.crop;
  const rows = (state.markets || []).filter(r => r && !r.pickup && r.price > 0);
  const gov = rows.length ? rows.slice().sort((a, b) => b.price - a.price)[0] : null;
  const top = gov;
  // The box suggests the best rate the government feed actually published today.
  // With no live row it says what to type — it never invents a number.
  if (gov && crop) return String(Math.round(top.price));
  return 'what the mandi paid you';
}

export function addSale(rec){
  const list = loadSales();
  list.unshift({ ...rec, id: "s" + Date.now() });
  saveSales(list);
  return list;
}
export function deleteSale(id){
  const list = loadSales().filter(s => s.id !== id);
  saveSales(list);
  return list;
}

const fmtDate = iso => {
  const d = new Date(iso + "T00:00:00");
  return isNaN(d) ? iso : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

export function salesSummary(){
  const list = loadSales();
  const totals = list.reduce((a, s) => {
    a.qty += s.qty || 0;
    a.value += (s.qty || 0) * (s.price || 0);
    return a;
  }, { qty: 0, value: 0 });
  const bestSale = list.slice().sort((a, b) => (b.price || 0) - (a.price || 0))[0] || null;
  return { count: list.length, totalQtl: totals.qty, totalValue: totals.value,
           avgPrice: totals.qty ? Math.round(totals.value / totals.qty) : 0, bestSale };
}

// ---------------------------------------------------------------------------
//  "Mera rate vs mandi" — the farmer's own selling price, next to today's rate.
//  Only for THIS season's crop, only when the government/MANDI feed actually
//  published a price today, and always labelled "aaj ke bhaav pe": the comparison
//  is a reference for today, never a claim about what he should have got in
//  September. With no rate, the line does not appear at all.
// ---------------------------------------------------------------------------
export function salesBenchmark(){
  const crop = state.season?.crop;
  if (!crop) return null;
  const mine = loadSales().filter(x => x.crop === crop && x.qty > 0 && x.price > 0);
  if (!mine.length) return null;
  const qty = mine.reduce((a, x) => a + x.qty, 0);
  const value = mine.reduce((a, x) => a + x.qty * x.price, 0);
  const avg = Math.round(value / qty);
  const mandis = (state.markets || []).filter(r => r && !r.pickup && r.price > 0);
  if (!mandis.length) return null;
  const top = mandis.slice().sort((a, b) => b.price - a.price)[0];
  return {
    crop, qty, avg, mandi: top.name, mandiPrice: Math.round(top.price),
    perQtl: Math.round(top.price - avg),
    total: Math.round((top.price - avg) * qty),
  };
}

export function salesCardHTML(){
  const s = salesSummary();
  if (!s.count) return "";
  return `
    <div class="card" style="margin-top:14px">
      <b style="color:var(--green)">Your recent sales</b>
      <div class="statlabel" style="margin-top:6px">from your history</div>
      <div class="salelist">
        ${loadSales().slice(0, 3).map(x => `
          <div class="salerow">
            <span class="saledate">${fmtDate(x.date)}</span>
            <span class="salemkt">${esc(x.market)}</span>
            <span class="saleprice">${rupees(x.price)}<span class="dim">/qtl</span></span>
          </div>`).join("")}
      </div>
      <div class="sourcenote">${s.totalQtl} quintals sold so far · average ${rupees(s.avgPrice)}/qtl</div>
    </div>`;
}

export function renderSales(){
  const v = document.getElementById("view-sales");
  if (!v) return;
  const list = loadSales();
  const s = salesSummary();
  const crops = Object.entries(CROPS || {}).map(([k, c]) => `<option value="${k}" ${k === state.season?.crop ? "selected" : ""}>${c.label}</option>`).join("");
  const marketOptions = (state.markets || []).map(m => `<option value="${esc(m.name)}">${esc(m.name)}</option>`).join("");

  v.innerHTML = `
    <h2>My sales ${state.demo ? demoBadge() : ""}</h2>
    <p class="sub">Log what you actually sold — the app uses it to track your real average price.</p>

    <div class="card">
      <div class="grid3">
        <div><div class="statlabel">Total sold</div><div class="stat">${s.totalQtl}<span class="statlabel"> qtl</span></div></div>
        <div><div class="statlabel">Total value</div><div class="stat orange">${rupees(s.totalValue)}</div></div>
        <div><div class="statlabel">Your average price</div><div class="stat">${rupees(s.avgPrice)}<span class="statlabel"> /qtl</span></div></div>
      </div>
      ${s.bestSale ? `<div class="sourcenote">Best sale: ${rupees(s.bestSale.price)}/qtl at ${esc(s.bestSale.market)} on ${fmtDate(s.bestSale.date)}.</div>` : ""}
      ${(() => { const b = salesBenchmark(); if (!b) return "";
        const up = b.perQtl > 0;
        return `<div class="caveat" style="margin-top:10px;border-color:${up ? '#FBEAEA' : 'var(--line)'}">
          <b>Aaj ke bhav pe:</b> aapka ${b.crop} ka ${b.qty} qtl average <b>${rupees(b.avg)}/qtl</b>
          · aaj ${b.mandi} me <b>${rupees(b.mandiPrice)}/qtl</b>
          ${up
            ? `— aaj <b>${rupees(b.perQtl)}/qtl zyada</b> milta (${rupees(b.total)} poore maal pe).`
            : `— aaj ka bhav aapke average se <b>${rupees(-b.perQtl)}/qtl kam</b> hai.`}
          <span class="statlabel" style="display:block;margin-top:4px">
            Ye aaj ke bhav se tulna hai — jis din aapne becha, us din ka bhav alag tha.</span>
        </div>`; })()}
    </div>

    <div class="card" style="margin-top:14px">
      <b>Record a sale</b>
      <div class="frow" style="margin-top:10px">
        <label>Date<input id="slDate" type="date" value="${new Date().toISOString().slice(0, 10)}"></label>
        <label>Crop<select id="slCrop">${crops}</select></label>
        <label>Market
          ${marketOptions
            ? `<select id="slMarket">${marketOptions}</select>`
            : `<input id="slMarket" type="text" placeholder="e.g. Jorhat Mandi">`}
        </label>
        <label>Quantity (quintals)<input id="slQty" type="number" min="0.1" step="0.1" value="${state.season?.quantityQtl ?? ""}"></label>
        <label>Price ₹/quintal<input id="slPrice" type="number" min="1" step="1" placeholder="${livePriceHint()}"></label>
        <label>Buyer (kharidar)<input id="slParty" placeholder="e.g. Jorhat Traders"></label>
        <label>Cut (kataut) ₹<input id="slCuts" type="number" min="0" step="1" placeholder="0"></label>
        <button class="btn" id="slAdd">Add sale</button>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <b>Your sales history</b>${state.demo && list.length
        ? ` <span class="chip demo">SAMPLE</span>
           <button class="btnlink" id="clearSample" style="margin-left:8px">Sample rows hatao</button>` : ''}
      ${list.length ? `
        <div class="tablewrap" style="margin-top:10px">
          <table>
            <tr><th>Date</th><th>Crop</th><th>Market</th><th>Qty (qtl)</th><th>Price ₹/qtl</th><th>Value</th><th></th></tr>
            ${list.map(x => `
              <tr>
                <td>${fmtDate(x.date)}</td>
                <td>${esc(CROPS?.[x.crop]?.label || x.crop)}</td>
                <td><b>${esc(x.market)}</b></td>
                <td>${x.qty}</td>
                <td>${rupees(x.price)}</td>
                <td class="pos">${rupees((x.qty || 0) * (x.price || 0))}</td>
                <td>
                  <button class="btnlink" data-rcpt="${x.id}">receipt</button>
                  <button class="btnlink" data-del="${x.id}">remove</button>
                </td>
              </tr>`).join("")}
          </table>
        </div>`
        : `<div class="empty">No sales recorded yet. Add the first one above — or set the crop in
           <b>Season &amp; Crop</b> so the market list can suggest where you sold.</div>`}
      ${state.demo && list.some(x => String(x.id).startsWith("s-demo")) ? `
        <div class="caveat">The two rows dated 12 Sep and 26 Sep are <b>DEMO examples</b> (they match the walkthrough
        demo). Remove them and add your own real sales — everything else updates from your numbers.</div>` : ""}
      <div id="rcptHost"></div>
      <div class="sourcenote">Saved on this device only${state.demo ? " (demo mode)" : ""}. Nothing is uploaded.</div>
    </div>
  `;

  // Examples in a demo build can be wiped in one tap.
  const cs = document.getElementById('clearSample');
  if (cs) cs.onclick = () => { saveSales([]); renderSales(); };

  document.getElementById("slAdd").onclick = () => {
    const rec = {
      date: document.getElementById("slDate").value || new Date().toISOString().slice(0, 10),
      crop: document.getElementById("slCrop").value,
      market: document.getElementById("slMarket").value.trim() || "—",
      qty: Number(document.getElementById("slQty").value) || 0,
      price: Number(document.getElementById("slPrice").value) || 0,
      party: document.getElementById("slParty")?.value.trim() || "",
      deductions: Number(document.getElementById("slCuts")?.value) || 0
    };
    if (!rec.qty || !rec.price) return toast("Add quantity and price per quintal.");
    addSale(rec);
    toast("Sale recorded ✓");
    renderSales();
  };
  v.querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
    deleteSale(b.dataset.del);
    toast("Removed");
    renderSales();
  });

  // ---- receipt: see it, print it, send it ----
  v.querySelectorAll("[data-rcpt]").forEach(b => b.onclick = () => {
    const sale = loadSales().find(x => x.id === b.dataset.rcpt);
    if (!sale) return;
    const cropLabel = CROPS?.[sale.crop]?.label || sale.crop;
    const withLabel = { ...sale, cropLabel };
    const host = document.getElementById("rcptHost");
    if (!host) return;
    host.innerHTML = `
      ${receiptHTML(withLabel)}
      <div class="row2" style="margin-top:10px">
        <button class="btn small" id="rcptShare">📲 WhatsApp</button>
        <button class="btn ghost small" id="rcptPrint">🖨 Print / PDF</button>
      </div>`;
    host.scrollIntoView({ behavior: "smooth", block: "nearest" });
    document.getElementById("rcptShare").onclick = () => shareText(receiptText(withLabel));
    document.getElementById("rcptPrint").onclick = () => {
      const r = printReceipt(withLabel);
      if (!r.ok) toast("Print blocked — allow popups for this page");
    };
  });
}
