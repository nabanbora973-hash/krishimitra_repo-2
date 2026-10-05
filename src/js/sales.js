// ============================================================================
//  MY SALES — the farmer's own sale log ("Your recent sales, from your history").
//  Kept on this device (localStorage) so the demo works with no account and no
//  network. In DEMO mode it starts with two seeded rows, clearly labelled DEMO.
// ============================================================================
import { state } from "./state.js";
import { CROPS } from "./crops.js";
import { toast, rupees, demoBadge } from "./ui.js";

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
export function seedIfEmpty(isDemo){
  if (!isDemo) return;
  if (!loadSales().length) saveSales(DEMO_SEED);
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
            <span class="salemkt">${x.market}</span>
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
  const marketOptions = (state.markets || []).map(m => `<option value="${m.name}">${m.name}</option>`).join("");

  v.innerHTML = `
    <h2>My sales ${state.demo ? demoBadge() : ""}</h2>
    <p class="sub">Log what you actually sold — the app uses it to track your real average price.</p>

    <div class="card">
      <div class="grid3">
        <div><div class="statlabel">Total sold</div><div class="stat">${s.totalQtl}<span class="statlabel"> qtl</span></div></div>
        <div><div class="statlabel">Total value</div><div class="stat orange">${rupees(s.totalValue)}</div></div>
        <div><div class="statlabel">Your average price</div><div class="stat">${rupees(s.avgPrice)}<span class="statlabel"> /qtl</span></div></div>
      </div>
      ${s.bestSale ? `<div class="sourcenote">Best sale: ${rupees(s.bestSale.price)}/qtl at ${s.bestSale.market} on ${fmtDate(s.bestSale.date)}.</div>` : ""}
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
        <label>Price ₹/quintal<input id="slPrice" type="number" min="1" step="1" placeholder="e.g. 2310"></label>
        <button class="btn" id="slAdd">Add sale</button>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <b>Your sales history</b>
      ${list.length ? `
        <div class="tablewrap" style="margin-top:10px">
          <table>
            <tr><th>Date</th><th>Crop</th><th>Market</th><th>Qty (qtl)</th><th>Price ₹/qtl</th><th>Value</th><th></th></tr>
            ${list.map(x => `
              <tr>
                <td>${fmtDate(x.date)}</td>
                <td>${CROPS?.[x.crop]?.label || x.crop}</td>
                <td><b>${x.market}</b></td>
                <td>${x.qty}</td>
                <td>${rupees(x.price)}</td>
                <td class="pos">${rupees((x.qty || 0) * (x.price || 0))}</td>
                <td><button class="btnlink" data-del="${x.id}">remove</button></td>
              </tr>`).join("")}
          </table>
        </div>`
        : `<div class="empty">No sales recorded yet. Add the first one above — or set the crop in
           <b>Season &amp; Crop</b> so the market list can suggest where you sold.</div>`}
      ${state.demo && list.some(x => String(x.id).startsWith("s-demo")) ? `
        <div class="caveat">The two rows dated 12 Sep and 26 Sep are <b>DEMO examples</b> (they match the walkthrough
        video). Remove them and add your own real sales — everything else updates from your numbers.</div>` : ""}
      <div class="sourcenote">Saved on this device only${state.demo ? " (demo mode)" : ""}. Nothing is uploaded.</div>
    </div>
  `;

  document.getElementById("slAdd").onclick = () => {
    const rec = {
      date: document.getElementById("slDate").value || new Date().toISOString().slice(0, 10),
      crop: document.getElementById("slCrop").value,
      market: document.getElementById("slMarket").value.trim() || "—",
      qty: Number(document.getElementById("slQty").value) || 0,
      price: Number(document.getElementById("slPrice").value) || 0
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
}
