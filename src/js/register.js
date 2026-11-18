// First-run registration — a farmer sets up their farm in three short steps.
// No account needed: details stay on this device (Firestore only if signed in).
import { state } from "./state.js";
import { saveProfile, saveSeason } from "./store.js";
import { show, toast, setUserChip, showApp } from "./ui.js";
import { CROPS, suggestStage } from "./crops.js";
import { renderAuth } from "./auth.js";
import { getPosition, reverseGeocode, gpsSupported } from "./geo.js";
import { townPickerHTML, wireTownPicker, townPlace, placeLabel } from "./places.js";
import { MANDIS, MANDI, FARMER, setRole, idForName } from "./roles.js";

const SOILS = ['Alluvial', 'Clay', 'Loamy', 'Sandy', 'Laterite'];
const IRRIGATION = ['Rain-fed', 'Canal', 'Borewell / Tube well', 'River / Pond lift'];
const STATES = ['Assam', 'Andhra Pradesh', 'Bihar', 'Chhattisgarh', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra',
  'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim',
  'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Arunachal Pradesh', 'Goa', 'Jammu & Kashmir', 'Other'];

const daysAgo = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let step = 1;
let draft = null;

function draftFromState(){
  // A first registration starts blank — never pre-filled with the demo farm —
  // so the farmer is entering their own details, not someone else's.
  const s = state.season || {};
  return {
    role: FARMER, mandiName: '', mandiOther: '',
    name: '', phone: '', village: '', district: '', stateName: 'Assam',
    lat: null, lng: null, gps: false,
    acres: '', soil: 'Loamy', irrigation: 'Rain-fed',
    crop: s.crop || 'paddy',
    variety: s.variety || 'Common',
    sowingDate: s.sowingDate || daysAgo(60),
    quantityQtl: ''
  };
}

export function renderRegister(){
  draft = draftFromState();
  step = 1;
  const host = document.getElementById('view-auth');
  host.innerHTML = `
    <div class="regwrap">
      <div class="regcard">
        <div class="reghead">
          <div class="logo">🌱</div>
          <h1>Register your farm</h1>
          <p class="regsub">Three short steps. No account needed — your details stay on this device.</p>
        </div>

        <div class="regsteps">
          <div class="regstep" data-s="1"><b>1</b><span>You</span></div>
          <div class="regstep" data-s="2"><b>2</b><span>Farm</span></div>
          <div class="regstep" data-s="3"><b>3</b><span>Crop</span></div>
        </div>
        <div class="regbar"><i id="regBar"></i></div>

        <div id="regBody"></div>

        <div class="regnav">
          <button class="btn ghost small" id="regBack" type="button">Back</button>
          <button class="btn" id="regNext" type="button">Next →</button>
        </div>
        <div class="herr" id="regErr"></div>

        <div class="regfoot">
          <a class="demo-link" href="#" id="regSkip">Skip for now — explore the demo</a>
          ${state.demo ? '' : '<a class="demo-link" href="#" id="regLogin">Already have an account? Log in</a>'}
        </div>
      </div>
    </div>`;

  document.getElementById('regBack').onclick = () => { if (step > 1){ step--; draw(); } };
  document.getElementById('regNext').onclick = next;
  document.getElementById('regSkip').onclick = e => { e.preventDefault(); skip(); };
  const login = document.getElementById('regLogin');
  if (login) login.onclick = e => { e.preventDefault(); renderAuth(); };

  draw();
}

// ---------------------------------------------------------------- steps
function rolePickHTML(){
  return `
    <div class="regq">Who are you?</div>
    <div class="rolepick">
      <button type="button" class="rolecard ${draft.role === FARMER ? 'on' : ''}" data-role="${FARMER}">
        <span>👨‍🌾</span><b>Farmer</b>
        <small>I grow and sell produce. Show me prices and the sell verdict.</small>
      </button>
      <button type="button" class="rolecard ${draft.role === MANDI ? 'on' : ''}" data-role="${MANDI}">
        <span>🏪</span><b>Mandi / trader</b>
        <small>I run a mandi or a trading desk. I post today's rate.</small>
      </button>
    </div>`;
}

function mandiFieldsHTML(){
  return `
    <label>Which mandi do you report for? <span style="color:var(--red)">*</span></label>
    <select id="rMandi">
      ${MANDIS.map(m => `<option value="${m.name}" ${draft.mandiName === m.name ? 'selected' : ''}>${m.name}</option>`).join('')}
    </select>
    <p class="statlabel" style="margin:-6px 0 8px">This is the gate your rate will be published under.
      Pick “Other” to type a name that is not on the list.</p>
    <label>Not on the list?</label>
    <input id="rMandiOther" placeholder="type your mandi or haat name" value="${esc(draft.mandiOther)}">`;
}

function step1HTML(){
  const mandi = draft.role === MANDI;
  return `
    ${rolePickHTML()}
    <div class="regq">${mandi ? 'Who is reporting?' : 'Who is farming?'}</div>
    <label>Full name</label>
    <input id="rName" placeholder="e.g. Naban Borah" autocomplete="name" value="${esc(draft.name)}">

    <label>Mobile number</label>
    <div class="phonewrap">
      <span>+91</span>
      <input id="rPhone" inputmode="numeric" maxlength="10" placeholder="10-digit number"
             autocomplete="tel-national" value="${esc(draft.phone)}">
    </div>

    ${mandi ? mandiFieldsHTML() : `    <label>Village / Town</label>
    <div class="row2">
      <input id="rVillage" placeholder="e.g. Duliajan" value="${esc(draft.village)}">
      <button class="btn ghost small" id="rFind" type="button">📍 Find</button>
    </div>`}
    ${mandi ? '' : `${gpsSupported() ? `<button class="btn orange small" id="rGps" type="button" style="width:100%;margin:-6px 0 6px">
      📡 Use my current location (GPS)</button>` : ''}
    ${townPickerHTML('rTown', { selected: draft.village })}
    <p id="rGeo" class="statlabel">${
      draft.lat != null
        ? `✓ Location set (${(+draft.lat).toFixed(2)}, ${(+draft.lng).toFixed(2)})${draft.gps ? ' · read from GPS' : ' · from the town list'}`
        : 'GPS asks the browser for permission. If it says no, pick your town above — the distances are the same.'
    }</p>`}

    <label>District</label>
    <input id="rDistrict" placeholder="e.g. Dibrugarh" value="${esc(draft.district)}">

    <label>State</label>
    <select id="rState">
      ${STATES.map(s => `<option ${draft.stateName === s ? 'selected' : ''}>${s}</option>`).join('')}
    </select>`;
}

function step2HTML(){
  return `
    <div class="regq">Tell us about your land</div>
    <label>Land size (acres)</label>
    <input id="rAcres" type="number" step="0.1" min="0" placeholder="e.g. 2"
           value="${esc(draft.acres)}">

    <label>Soil type</label>
    <select id="rSoil">
      ${SOILS.map(s => `<option ${draft.soil === s ? 'selected' : ''}>${s}</option>`).join('')}
    </select>

    <label>Irrigation</label>
    <select id="rIrr">
      ${IRRIGATION.map(s => `<option ${draft.irrigation === s ? 'selected' : ''}>${s}</option>`).join('')}
    </select>

    <p class="caveat">Land size drives the transport and storage cost per quintal — it is
    why a small farm and a large farm get different answers from the same price.</p>`;
}

function step3HTML(){
  const crops = Object.entries(CROPS);
  return `
    <div class="regq">What are you growing this season?</div>
    <label>Crop</label>
    <select id="rCrop">
      ${crops.map(([k, c]) => `<option value="${k}" ${draft.crop === k ? 'selected' : ''}>${c.label}</option>`).join('')}
    </select>

    <label>Variety</label>
    <input id="rVariety" placeholder="e.g. Local / Hybrid" value="${esc(draft.variety)}">

    <label>Sowing date</label>
    <input id="rSow" type="date" value="${esc(draft.sowingDate)}">

    <label>Expected harvest (quintals)</label>
    <input id="rQty" type="number" min="1" step="1" placeholder="e.g. 27"
           value="${esc(draft.quantityQtl)}">

    <p class="caveat" id="rStage">Stage is worked out from your sowing date — you can change it later.</p>`;
}

function wire(){
  const bind = (id, key, ev) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener(ev || 'input', () => { draft[key] = el.value; });
  };
  if (step === 1){
    document.querySelectorAll('.rolecard').forEach(b => b.onclick = () => {
      draft.role = b.dataset.role === MANDI ? MANDI : FARMER;
      draw();                                   // re-render: the form itself changes
    });
    bind('rName', 'name');
    if (draft.role === MANDI){
      bind('rMandi', 'mandiName', 'change');
      bind('rMandiOther', 'mandiOther');
    }
    bind('rPhone', 'phone');
    bind('rVillage', 'village');
    // No permission needed: the town table answers instantly and offline.
    wireTownPicker('rTown', t => {
      const place = townPlace(t);
      draft.lat = place.lat; draft.lng = place.lng; draft.gps = false;
      draft.village = draft.village || place.village;
      draft.district = draft.district || place.district;
      draft.stateName = 'Assam';
      const v = document.getElementById('rVillage'); if (v) v.value = draft.village;
      const dEl = document.getElementById('rDistrict'); if (dEl) dEl.value = draft.district;
      const sEl = document.getElementById('rState'); if (sEl) sEl.value = 'Assam';
      const out = document.getElementById('rGeo');
      if (out) out.textContent = `✓ ${placeLabel(place)} — distances measured from here.`;
    });
    bind('rDistrict', 'district');
    bind('rState', 'stateName', 'change');
    const findBtn = document.getElementById('rFind');
    if (findBtn) findBtn.onclick = locate;
    const gpsBtn = document.getElementById('rGps');
    if (gpsBtn) gpsBtn.onclick = useGps;
    const ph = document.getElementById('rPhone');
    ph.addEventListener('input', () => { ph.value = ph.value.replace(/\D/g, '').slice(0, 10); });
  } else if (step === 2){
    bind('rAcres', 'acres');
    bind('rSoil', 'soil', 'change');
    bind('rIrr', 'irrigation', 'change');
  } else {
    bind('rCrop', 'crop', 'change');
    bind('rVariety', 'variety');
    bind('rSow', 'sowingDate', 'change');
    bind('rQty', 'quantityQtl');
    const note = document.getElementById('rStage');
    const update = () => {
      if (!CROPS[draft.crop] || !draft.sowingDate) return;
      const { stage, days } = suggestStage(draft.crop, draft.sowingDate);
      note.textContent = `Day ${days} since sowing — stage will be set to “${stage}”. You can change it later.`;
    };
    document.getElementById('rCrop').addEventListener('change', update);
    document.getElementById('rSow').addEventListener('change', update);
    update();
  }
}

function draw(){
  const mandi = draft.role === MANDI;
  document.querySelectorAll('.regstep').forEach(el => {
    const s = +el.dataset.s;
    // A mandi desk is a one-step registration: the step rail reflects that.
    const shown = mandi ? s === 1 : true;
    el.style.display = shown ? '' : 'none';
    el.classList.toggle('on', s === step);
    el.classList.toggle('done', s < step);
    const label = el.querySelector('span');
    if (label && s === 1) label.textContent = mandi ? 'Mandi' : 'You';
  });
  const total = mandi ? 1 : 3;
  document.getElementById('regBar').style.width = (step / total * 100) + '%';
  document.getElementById('regBack').style.visibility = step === 1 ? 'hidden' : 'visible';
  document.getElementById('regNext').textContent = mandi ? 'Create my mandi desk ✓'
    : (step === 3 ? 'Register my farm ✓' : 'Next →');
  document.getElementById('regErr').textContent = '';
  document.getElementById('regBody').innerHTML =
    step === 1 ? step1HTML() : step === 2 ? step2HTML() : step3HTML();
  wire();
}

// ---------------------------------------------------------------- live location
// One tap: read the device GPS, turn it into a place name, fill the form.
// The coordinates are what the market distances are measured from, so this is
// what makes "closest mandi" true for wherever the farmer is standing.
async function useGps(){
  const btn = document.getElementById('rGps');
  const out = document.getElementById('rGeo');
  if (!out) return;
  btn.disabled = true; btn.textContent = '📡 Getting your location…';
  out.textContent = 'Asking the device for a GPS fix…';
  try {
    const { lat, lng, accuracyM } = await getPosition();
    draft.lat = lat; draft.lng = lng; draft.gps = true;
    out.textContent = `✓ GPS fix (±${Math.round(accuracyM)} m). Looking up the nearest town…`;
    const place = await reverseGeocode(lat, lng);
    if (place.village && !draft.village){
      draft.village = place.village;
      const v = document.getElementById('rVillage'); if (v) v.value = place.village;
    }
    if (place.district && !draft.district){
      draft.district = place.district;
      const dEl = document.getElementById('rDistrict'); if (dEl) dEl.value = place.district;
    }
    if (place.state && STATES.includes(place.state)){
      draft.stateName = place.state;
      const sEl = document.getElementById('rState'); if (sEl) sEl.value = place.state;
    }
    out.textContent = `✓ ${place.village || 'Location'}${place.district ? ', ' + place.district : ''} — `
      + `lat ${lat.toFixed(4)}, lng ${lng.toFixed(4)} (±${Math.round(accuracyM)} m). `
      + 'Market distances will be measured from here.';
  } catch (e){
    out.textContent = '✗ ' + e.message
      + (e.denied ? ' Pick your town in the list above — no permission needed.' : '');
    const picker = document.getElementById('rTown');
    if (e.denied && picker) picker.focus();
  } finally {
    btn.disabled = false; btn.textContent = '📡 Use my current location (GPS)';
  }
}

// ---------------------------------------------------------------- geocoding
async function locate(){
  const out = document.getElementById('rGeo');
  if (!out) return;
  const q = (draft.village || '').trim();
  if (q.length < 2){ out.textContent = 'Type a village or town first.'; return; }
  out.textContent = 'Looking up…';
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`;
    const r = await fetch(url);
    const j = await r.json();
    if (!j.results || !j.results.length) throw new Error('No match — try a nearby town.');
    const g = j.results[0];
    draft.lat = g.latitude;
    draft.lng = g.longitude;
    if (!draft.district && g.admin2) draft.district = g.admin2;
    if (g.admin1 && STATES.includes(g.admin1)) draft.stateName = g.admin1;
    out.textContent = `✓ Found ${g.name}${g.admin1 ? ', ' + g.admin1 : ''} — weather will use this.`;
  } catch (e){
    out.textContent = '✗ ' + e.message + ' You can still register; weather will use your district.';
  }
}

// ---------------------------------------------------------------- validate + save
function chosenMandi(){
  const other = (draft.mandiOther || '').trim();
  return other || draft.mandiName || '';
}

function problem(){
  if (step === 1){
    if ((draft.name || '').trim().length < 2) return 'Please enter your full name.';
    if (!/^\d{10}$/.test(String(draft.phone).replace(/\D/g, ''))) return 'Mobile number must be 10 digits.';
    if (draft.role === MANDI){
      if (chosenMandi().length < 2) return 'Please pick or type the mandi you report for.';
    } else {
      if ((draft.village || '').trim().length < 2) return 'Please enter your village or town.';
      if ((draft.district || '').trim().length < 2) return 'Please enter your district.';
    }
  }
  if (step === 2){
    const a = parseFloat(draft.acres);
    if (!isFinite(a) || a <= 0) return 'Land size must be more than 0 acres.';
  }
  if (step === 3){
    const q = parseFloat(draft.quantityQtl);
    if (!isFinite(q) || q <= 0) return 'Expected harvest must be more than 0 quintals.';
    if (!draft.sowingDate) return 'Please pick a sowing date.';
  }
  return null;
}

async function next(){
  const bad = problem();
  if (bad){ document.getElementById('regErr').textContent = bad; return; }
  // A mandi desk has nothing to say about acres or sowing dates — one step is
  // the whole registration, which is the point: a trader at the gate will not
  // fill three screens to post a price.
  if (draft.role === MANDI){ await finish(); return; }
  if (step < 3){
    if (step === 1 && draft.lat == null) locate();   // fire and forget — never blocks
    step++;
    draw();
    return;
  }
  await finish();
}

async function finish(){
  const btn = document.getElementById('regNext');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  if (draft.role === MANDI) return finishMandi(btn);

  const { stage } = suggestStage(draft.crop, draft.sowingDate);
  const profile = {
    name:       (draft.name || '').trim(),
    phone:      '+91' + String(draft.phone).replace(/\D/g, ''),
    village:    (draft.village || '').trim(),
    district:   (draft.district || '').trim(),
    state:      draft.stateName,
    lat:        draft.lat, lng: draft.lng,
    acres:      parseFloat(draft.acres),
    soil:       draft.soil,
    irrigation: draft.irrigation,
    role:       FARMER,
    savedAt:    Date.now()
  };
  const season = {
    crop: draft.crop,
    variety: (draft.variety || '').trim(),
    sowingDate: draft.sowingDate,
    stage,
    quantityQtl: parseFloat(draft.quantityQtl)
  };

  state.profile = profile;
  state.season = season;

  let local = true;
  try {
    const r1 = await saveProfile(profile);
    await saveSeason(season);
    local = r1.local !== false;
  } catch (e){ console.warn('Save failed, kept in memory:', e.message); }

  try {
    localStorage.setItem('km_registered', '1');
    const uid = state.user?.uid;
    if (uid && uid !== 'demo') localStorage.setItem('km_registered_' + uid, '1');
  } catch (e){}

  setUserChip(profile.name);
  setRole(FARMER);            // device copy, nav, chip — a signup must not inherit the last role
  showApp();
  document.dispatchEvent(new CustomEvent('km:data-changed'));
  show('sell');
  toast(`Welcome, ${profile.name.split(' ')[0]} — farm registered ${local ? 'on this device' : ''} ✓`);
}

// A mandi desk: no farm, no season. The gate it reports for is the profile.
async function finishMandi(btn){
  const mandiName = chosenMandi();
  const profile = {
    name:      (draft.name || '').trim(),
    phone:     '+91' + String(draft.phone).replace(/\D/g, ''),
    role:      MANDI,
    mandiName,
    mandiId:   idForName(mandiName),
    district:  (draft.district || '').trim(),
    state:     draft.stateName,
    savedAt:   Date.now()
  };

  state.profile = profile;
  state.season  = null;                       // a desk does not hold stock
  let local = true;
  try {
    const r = await saveProfile(profile);
    local = r.local !== false;
  } catch (e){ console.warn('Save failed, kept in memory:', e.message); }

  setRole(MANDI);
  try {
    localStorage.setItem('km_registered', '1');
    const uid = state.user?.uid;
    if (uid && uid !== 'demo') localStorage.setItem('km_registered_' + uid, '1');
  } catch (e){}

  setUserChip(profile.name);
  showApp();
  document.dispatchEvent(new CustomEvent('km:data-changed'));
  show('dashboard');                          // the report desk lives here
  toast(`${mandiName} desk ready — post today's rate ✓`);
}

function skip(){
  try { localStorage.setItem('km_registered', 'skipped'); } catch (e){}
  showApp();
  show('sell');
  toast('Demo mode — you can register any time from Farm Profile');
}

export { skip };
