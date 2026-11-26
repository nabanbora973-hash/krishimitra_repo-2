// ============================================================================
//  SAFAR KA KHARCHA  —  what the trip to a mandi actually costs in fuel
// ----------------------------------------------------------------------------
//      diesel rate at his pump  ×  (km there and back)  ÷  his vehicle's km/l
//
//  WHY THE RATE IS NEVER PRE-FILLED
//  Published Assam diesel prices disagreed by ₹8/litre in the same week
//  (₹88.73 · ₹89.46 · ₹97.23 across sources on 01-02 Nov 2026). Inventing one
//  would put a wrong number under a real farmer's nose. So the app shows three
//  published reference chips, he taps the one closest to his pump — or types the
//  exact figure from the pump board. Until he does, NO fuel cost is shown.
//  A blank is honest; a guess is not. Round trip is deliberate.
// ============================================================================
const KEY = "km_fuel_v1";
const ls = () => { try { return window.__kmSafeLS || localStorage; } catch { return null; } };

export const DIESEL_CHIPS = [
  { v: 89,  note: "kuch sources" },
  { v: 93,  note: "beech ka" },
  { v: 97,  note: "Guwahati list" }
];
export const MILEAGE_CHIPS = [
  { v: 5,  label: "Tractor-trolley" },
  { v: 8,  label: "Pickup / Bolero" },
  { v: 12, label: "Chhota gaadi" }
];
const DEFAULTS = { rate: null, kmpl: 8, qtl: null };

export function getFuel(){
  let saved = null;
  try { saved = JSON.parse(ls()?.getItem(KEY) || "null"); } catch { saved = null; }
  const f = { ...DEFAULTS, ...(saved || {}) };
  const rate = Number(f.rate), kmpl = Number(f.kmpl), qtl = Number(f.qtl);
  return { rate: rate > 0 ? rate : null, kmpl: kmpl > 0 ? kmpl : DEFAULTS.kmpl,
           qtl: qtl > 0 ? qtl : null };
}
export function setFuel(patch = {}){
  const next = { ...getFuel(), ...patch };
  if (next.rate != null && !(Number(next.rate) > 0)) next.rate = null;
  if (!(Number(next.kmpl) > 0)) next.kmpl = DEFAULTS.kmpl;
  if (next.qtl != null && !(Number(next.qtl) > 0)) next.qtl = null;
  try { ls()?.setItem(KEY, JSON.stringify(next)); } catch {}
  return next;
}
export const fuelReady = () => getFuel().rate != null;

export function tripCost(km, f = getFuel()){
  if (!f.rate || !isFinite(km) || km <= 0) return null;
  return Math.round(((km * 2) / f.kmpl) * f.rate);
}
export function fuelPerQtl(km, qtl, f = getFuel()){
  const trip = tripCost(km, f);
  const q = qtl ?? f.qtl;
  if (trip == null || !q) return null;
  return Math.round(trip / q);
}
export function fuelUnits(km, f = getFuel()){
  if (!f.rate || !isFinite(km) || km <= 0) return null;
  return Math.round(((km * 2) / f.kmpl) * 10) / 10;
}
// An icon, not an emoji: Android < 12 and some Linux/Mac font stacks draw the
// lorry as an empty box, which looks like a bug on a farmer's screen.
export const ICON_TRUCK = `<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"
  style="vertical-align:-1.5px;margin-right:3px">
  <path d="M2 7h10v9H2z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
  <path d="M12 10h4l3 3v3h-7z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
  <circle cx="6" cy="18" r="1.6" fill="currentColor"/><circle cx="16.5" cy="18" r="1.6" fill="currentColor"/>
</svg>`;

export function fuelLine(km, qtl){
  const f = getFuel();
  const trip = tripCost(km, f);
  if (trip == null) return "";
  const perQtl = fuelPerQtl(km, qtl, f);
  const L = fuelUnits(km, f);
  return `${ICON_TRUCK}₹${trip.toLocaleString('en-IN')} aana-jaana` +
         (L ? ` · ${L} L` : "") +
         (perQtl != null ? ` · ₹${perQtl}/qtl` : "");
}
export function fuelStripHTML({ qtl = null, compact = false } = {}){
  const f = getFuel();
  const chips = DIESEL_CHIPS.map(c =>
    `<button type="button" class="fuelchip${f.rate === c.v ? ' on' : ''}" data-fuel-rate="${c.v}">₹${c.v}</button>`).join("");
  const miles = MILEAGE_CHIPS.map(c =>
    `<button type="button" class="fuelchip mile${f.kmpl === c.v ? ' on' : ''}" data-fuel-mileage="${c.v}">${c.v} km/l</button>`).join("");
  return `
  <div class="card fuel-strip" style="margin-top:14px;${compact ? 'padding:14px' : ''}">
    <b style="color:var(--green)">${ICON_TRUCK.replace('width="13" height="13"', 'width="16" height="16"')} Safar ka kharcha — tel ka hisaab</b>
    <div class="statlabel" style="margin:6px 0 10px">
      Pump pe likha diesel ka rate daalo. Iske bina table kiraye ki gaadi (Tata Ace) ke rate se hisaab karti hai — apna tel daalne pe wahi sasta padta hai.
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <span class="fuelchip on static">Diesel ₹</span>
      <input class="fuel-rate" inputmode="decimal" placeholder="pump ka rate"
             value="${f.rate ?? ''}" style="width:110px;padding:10px;border:1px solid #DDEBE1;border-radius:10px">
      <span class="dim" style="font-size:13.5px">/litre</span>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${chips}</div>
    <div class="statlabel" style="margin-top:4px;font-size:12px">
      Ye teen rate Oct–Nov 2026 ke public listings me dikhe (₹88.73 / ₹89.46 / ₹97.23). Apne pump ka asli rate better hai.
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px;align-items:center">
      <span class="dim" style="font-size:13.5px">Gaadi:</span>${miles}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center">
      <span class="fuelchip on static">Maal</span>
      <input class="fuel-qtl" inputmode="numeric" placeholder="kitne qtl le jaoge"
             value="${qtl ?? f.qtl ?? ''}" style="width:170px;padding:10px;border:1px solid #DDEBE1;border-radius:10px">
      <span class="dim" style="font-size:13.5px">qtl</span>
    </div>
    <div id="fuelOut" class="statlabel" style="margin-top:10px;color:var(--green)">${fuelReady()
      ? `Har mandi ke neeche ab ₹ me kharcha dikhega. Aana-jaana ka pura safar ginn rahe hain.`
      : `Rate daalo — phir har mandi ke neeche "₹ aana-jaana" dikhega.`}</div>
  </div>`;
}
export function wireFuelStrips(onChange){
  const strips = document.querySelectorAll('.fuel-strip');
  if (!strips.length) return;
  const repaint = () => { if (onChange) onChange(); };
  strips.forEach(strip => {
    strip.querySelectorAll('[data-fuel-rate]').forEach(b => {
      b.onclick = () => {
        setFuel({ rate: Number(b.dataset.fuelRate) });
        strip.querySelectorAll('[data-fuel-rate]').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        const inp = strip.querySelector('.fuel-rate');
        if (inp) inp.value = b.dataset.fuelRate;
        repaint();
      };
    });
    strip.querySelectorAll('[data-fuel-mileage]').forEach(b => {
      b.onclick = () => {
        setFuel({ kmpl: Number(b.dataset.fuelMileage) });
        strip.querySelectorAll('[data-fuel-mileage]').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        repaint();
      };
    });
    const rate = strip.querySelector('.fuel-rate');
    if (rate) rate.onchange = () => { setFuel({ rate: Number(String(rate.value).replace(/[^\d.]/g, '')) || null }); repaint(); };
    const qtl = strip.querySelector('.fuel-qtl');
    if (qtl) qtl.onchange = () => { setFuel({ qtl: Number(String(qtl.value).replace(/[^\d.]/g, '')) || null }); repaint(); };
  });
}
