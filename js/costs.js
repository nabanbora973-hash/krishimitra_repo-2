// ============================================================================
//  COSTS — every rupee the app subtracts, and where that rupee came from
// ----------------------------------------------------------------------------
//  WHY THIS FILE EXISTS
//    Two numbers used to be hard-coded guesses:
//       transport ₹1 / km / quintal        (a round number, no source)
//       storage   ₹180 / quintal / week    (set to "match the video" — invented)
//    A wrong storage cost does not just look bad, it flips the whole verdict:
//    at ₹180/week every "hold and sell later" loses money, so the app would say
//    SELL NOW for the wrong reason. Numbers a farmer plans his year around must
//    be sourced, printed, and editable.
//
//  THE DEFAULTS AND THEIR SOURCES
//    Transport — hired truck, Assam rate card (Tata Ace: ₹250 base + ₹25/km):
//        a 10 km trip = 250 + 25×10×2 (there and back) = ₹750 for 10 qtl
//        = ₹75/qtl.  Longer trips spread the base fare out.
//    Storage — Govt of India project report (APICOL, 3000 MT cold store):
//        potato rent ₹150–175 per quintal for a 7–8 month season.
//        7–8 months ≈ 30–34 weeks → ₹4.4–5.8 per quintal per WEEK.
//        Default taken at the middle: ₹5/qtl/week.
//    These are the defaults. They are NOT the farmer's numbers, and the app
//    says so on screen. He can replace any of them in one place, and the change
//    is kept on his device.
// ============================================================================

const KEY = 'km_costs_v1';

export const COST_DEFAULTS = {
  // hired truck (the normal case — most smallholders do not own a lorry)
  hireBase: 250,          // ₹ per trip, Tata Ace base fare (Assam rate card)
  hirePerKm: 25,          // ₹ per km per truck
  loadQtl: 10,            // quintals sent in one trip
  // storage
  storagePerQtlWeek: 5,   // ₹/qtl/week — derived from ₹150–175/qtl/season
};

export const COST_SOURCES = {
  hireBase: 'Tata Ace base fare ₹250 (Assam rate card, 2025)',
  hirePerKm: 'Tata Ace ₹25/km (Assam rate card, 2025)',
  loadQtl: 'a full small-truck load of grain (~10 quintals)',
  storagePerQtlWeek: '₹150–175/qtl for a 7–8 month season (Govt of India cold-store project report)',
};

// What the farmer typed, if anything. Anything missing falls back to the default.
let OVERRIDES = {};
try {
  const raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(KEY) : null;
  if (raw) OVERRIDES = JSON.parse(raw) || {};
} catch { OVERRIDES = {}; }

export function getCosts(){
  const out = { ...COST_DEFAULTS };
  for (const k of Object.keys(COST_DEFAULTS)){
    const v = Number(OVERRIDES[k]);
    if (isFinite(v) && v > 0) out[k] = v;
  }
  return out;
}

export function setCosts(partial){
  for (const [k, v] of Object.entries(partial || {})){
    if (!(k in COST_DEFAULTS)) continue;          // no stray keys
    const n = Number(v);
    if (!isFinite(n) || n <= 0) delete OVERRIDES[k];   // blank/0 = use default
    else OVERRIDES[k] = n;
  }
  try { localStorage.setItem(KEY, JSON.stringify(OVERRIDES)); } catch {}
  return getCosts();
}

export function resetCosts(){
  OVERRIDES = {};
  try { localStorage.removeItem(KEY); } catch {}
  return getCosts();
}

export const hasOverrides = () => Object.keys(OVERRIDES).length > 0;
export const whichOverridden = () =>
  Object.keys(COST_DEFAULTS).filter(k => OVERRIDES[k] != null);

// ---------------------------------------------------------------------------
//  The two numbers the rest of the app asks for
// ---------------------------------------------------------------------------
//  A hired truck is charged for the whole vehicle, both ways, plus a base fare.
//  So the per-quintal price falls as the load grows — which is exactly why a
//  group of farmers sharing one lorry pays less than one farmer alone.
export function hireTripCost(km, c = getCosts()){
  if (!(km > 0)) return null;
  return Math.round(c.hireBase + c.hirePerKm * km * 2);      // there and back
}

export function hirePerQtl(km, qtl, c = getCosts()){
  const trip = hireTripCost(km, c);
  const q = qtl || c.loadQtl;
  if (trip == null || !(q > 0)) return null;
  return Math.round(trip / q);
}

// Storage for a holding period, in weeks (the unit farmers and cold stores use).
export function storageCost(qtl, weeks, c = getCosts()){
  if (!(qtl > 0) || !(weeks > 0)) return null;
  return Math.round(c.storagePerQtlWeek * qtl * weeks);
}

// The single line printed under every transport figure, so a farmer always
// knows whether he is looking at his own diesel, a hired truck, or a guess.
export function transportBasisLabel(){
  return hasOverrides()
    ? 'aapke daale hue number'
    : 'Tata Ace ka rate (₹250 + ₹25/km) ÷ 10 qtl';
}

// ---------------------------------------------------------------------------
//  The card a farmer actually touches: his own kiraya and his own storage rate.
//  Every field is optional — a blank box means "use the sourced default", and
//  the card says which numbers are currently his and which are ours.
// ---------------------------------------------------------------------------
export function costsCardHTML(rupees){
  const c = getCosts();
  const mine = whichOverridden();
  const box = (key, label, unit, hint) => `
    <label style="display:block;margin-top:10px">
      <span class="statlabel">${label}</span>
      <input class="cost-in" data-cost="${key}" inputmode="decimal" value="${c[key]}"
             style="width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:10px;font:inherit">
      <span class="statlabel">${unit}${hint ? ' · ' + hint : ''}</span>
    </label>`;

  return `<div class="card" style="margin-top:14px" id="costsCard">
    <div class="cardhead"><b>Kiraya aur storage — apne number</b>
      ${mine.length ? `<span class="chip" style="margin-left:auto">aapke ${mine.length} number</span>`
                    : `<span class="chip demo" style="margin-left:auto">default</span>`}</div>
    <p class="sourcenote" style="margin:-4px 0 4px">
      Ye do kharch kisan ke apne hote hain — gaadi ka kiraya jagah-jagah badalta hai, cold store ka
      rate bhi. Yahan jo hai wo <b>sourced default</b> hai, aapka number nahi. Badlo, aur poori
      table turant aapke hisaab se ban jayegi.</p>

    ${box('hireBase', 'Gaadi ka base kiraya', '₹ per trip', COST_SOURCES.hireBase)}
    ${box('hirePerKm', 'Kitna per km', '₹ per km', COST_SOURCES.hirePerKm)}
    ${box('loadQtl', 'Ek trip me kitna maal', 'quintal', COST_SOURCES.loadQtl)}
    ${box('storagePerQtlWeek', 'Storage', '₹ per quintal per week', COST_SOURCES.storagePerQtlWeek)}

    <div class="caveat" style="margin-top:12px">
      <b>Abhi ka hisaab:</b> 10 km ka trip = ${rupees(hirePerQtl(10))}/qtl ·
      50 km = ${rupees(hirePerQtl(50))}/qtl · 50 km me 25 qtl (gaadi share) = ${rupees(hirePerQtl(50, 25))}/qtl ·
      storage ${rupees(c.storagePerQtlWeek)}/qtl/hafta
    </div>
    <button class="btn ghost small" id="btnCostReset" style="width:100%;margin-top:10px">
      Default pe wapas</button>
  </div>`;
}

export function wireCostsCard(onChange){
  const card = document.getElementById('costsCard');
  if (!card) return;
  card.querySelectorAll('.cost-in').forEach(inp => {
    const apply = () => {
      const key = inp.dataset.cost;
      setCosts({ [key]: inp.value });      // blank / 0 → default
      onChange && onChange();
    };
    inp.onchange = apply;
    inp.onblur = apply;
  });
  const reset = document.getElementById('btnCostReset');
  if (reset) reset.onclick = () => { resetCosts(); onChange && onChange(); };
}
