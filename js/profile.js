import { mountApprovalInfo } from "./access.js";
// Farm profile — permanent details, geocoded live (Open-Meteo geocoding, no key).
import { state } from "./state.js";
import { saveProfile } from "./store.js";
import { show, toast, liveBadge } from "./ui.js";
import { getPosition, reverseGeocode, gpsSupported } from "./geo.js";
import { townPickerHTML, wireTownPicker, townPlace, placeLabel } from "./places.js";
import { wireDataCard } from "./backup.js";
import { role, setRole, isMandi, MANDI, FARMER, MANDIS, MANDI_NAMES, idForName } from "./roles.js";
import { myGroup, makeCode, joinGroup, leaveGroup, setMyStock, groupSummary,
         combinedStock, pushGroupToCloud, pullGroupFromCloud } from "./fpo.js";
import { state as appState } from "./state.js";

// Every value below is typed by the farmer and then printed back into HTML.
// In TEXT it is an XSS risk; inside value="…" a single quote mark closes the
// attribute and the rest becomes a tag. One helper, both contexts, because
// forgetting it in one place is the whole bug.
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function renderProfile(){
  queueMicrotask(mountApprovalInfo);
  const v = document.getElementById('view-profile');
  const p = state.profile || {};
  const mandi = isMandi();
  v.innerHTML = `
    <h2>${mandi ? 'Mandi Profile' : 'Farm Profile'} ${liveBadge()}</h2>
    <p class="sub">${mandi
      ? 'The gate you report for. Your rates are published under this name.'
      : 'Set once, keep forever. Only your crop details change each season.'}</p>

    <div class="card" style="max-width:560px;margin-bottom:14px">
      <b style="color:var(--green)">I am a ${mandi ? 'mandi desk' : 'farmer'}</b>
      <p class="statlabel" style="margin:6px 0 10px">${mandi
        ? 'You post today\'s rate for your gate. Switch to the farmer view any time to see what your rates look like from the other side.'
        : 'You sell produce and read prices. If you also run a mandi, switch — you can post rates for it.'}</p>
      <button class="btn ghost small" id="switchRoleBtn">
        ${mandi ? '👨‍🌾 See the farmer view' : '🏪 I run a mandi — open the report desk'}
      </button>
    </div>

    ${mandi ? `<div class="card" style="max-width:560px;margin-bottom:14px">
      <label>Mandi you report for</label>
      <select id="pMandi">
        ${MANDIS.map(m => `<option value="${m.name}" ${p.mandiName === m.name ? 'selected' : ''}>${m.name}</option>`).join('')}
        ${p.mandiName && !MANDI_NAMES.includes(p.mandiName)
          ? `<option selected>${esc(p.mandiName)}</option>` : ''}
      </select>
      <p class="statlabel" style="margin:6px 0 0">Farmers near this gate see your posted rate with the
        <b>REPORTED</b> label — never as government data.</p>
    </div>` : ''}

    <div class="card" style="max-width:560px">
      <label>Full name</label>
      <input id="pname" placeholder="e.g. Naban Borah" value="${esc(p.name)}">
      <label>Mobile number</label>
      <input id="pphone" inputmode="numeric" placeholder="+91 98765 43210" value="${esc(p.phone)}">
      <label>${mandi ? 'Town / campus' : 'Village / Town'}</label>
      <input id="village" placeholder="e.g. Duliajan" value="${esc(p.village)}">
      <button class="btn small" id="findLoc" type="button">Find my location</button>
      ${gpsSupported() ? `<button class="btn orange small" id="gpsLoc" type="button">📡 Use GPS</button>` : ''}
      ${townPickerHTML('pTown', { selected: p.village })}
      <p id="geoResult" class="statlabel" style="margin:8px 0 18px">${p.lat ? `✓ Saved location: ${esc(p.village)} (${(+p.lat).toFixed(2)}, ${(+p.lng).toFixed(2)})` : 'We look up your location to fetch local weather.'}</p>
      <label>District</label>
      <input id="pdistrict" placeholder="e.g. Dibrugarh" value="${esc(p.district)}">
      <label>State</label>
      <input id="pstate" placeholder="e.g. Assam" value="${esc(p.state)}">
      <label>Land size (acres)</label>
      <input id="acres" type="number" step="0.1" min="0" value="${esc(p.acres ?? '')}">
      <label>Soil type</label>
      <select id="soil">
        ${['Alluvial','Clay','Loamy','Sandy','Laterite'].map(s => `<option ${p.soil === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
      <label>Irrigation</label>
      <select id="irrigation">
        ${['Rain-fed','Canal','Borewell / Tube well','River / Pond lift'].map(s => `<option ${p.irrigation === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
      <button class="btn" id="saveProfileBtn" style="width:100%">Save profile</button>
    </div>
    ${fpoCardHTML()}

    <!-- One honest line, no control panel. A farmer does not need to configure
         his own app; the numbers are labelled where they are used. -->
    <div class="statlabel" style="margin:16px 2px 0">
      Bhav: AGMARKNET (data.gov.in) · Doori: tumhare set kiye hue km se · Sab kuch isi phone par.
    </div>
    <div style="display:flex;gap:8px;margin:10px 2px 4px">
      <button class="btn ghost small" id="btnBackup" style="flex:1">⬇ Backup</button>
      <label class="btn ghost small" style="flex:1;cursor:pointer;margin:0;text-align:center">
        ⬆ Restore
        <input type="file" id="fileRestore" accept="application/json,.json" style="display:none">
      </label>
    </div>`;

  wireDataCard();
  wireFpo();

  let geo = p.lat ? { latitude: p.lat, longitude: p.lng, name: p.village } : null;

  document.getElementById('findLoc').onclick = async () => {
    const name = document.getElementById('village').value.trim();
    const res = document.getElementById('geoResult');
    if (!name) return (res.textContent = 'Type a village or town name first.');
    res.textContent = 'Looking up…';
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en&format=json`;
      const r = await fetch(url);
      const j = await r.json();
      if (!j.results || !j.results.length) throw new Error('Location not found — try a nearby town name.');
      const g = j.results[0];
      geo = { latitude: g.latitude, longitude: g.longitude, name: g.name };
      res.textContent = `✓ Found: ${g.name}${g.admin1 ? ', ' + g.admin1 : ''} (${g.latitude.toFixed(2)}, ${g.longitude.toFixed(2)})`;
    } catch (e) {
      res.textContent = '✗ ' + e.message;
    }
  };

  // GPS says no → the town table still answers, offline and without a prompt.
  wireTownPicker('pTown', t => {
    const place = townPlace(t);
    geo = { latitude: place.lat, longitude: place.lng, name: place.village };
    document.getElementById('village').value = place.village;
    const dEl = document.getElementById('pdistrict'); if (dEl && !dEl.value) dEl.value = place.district;
    const sEl = document.getElementById('pstate');    if (sEl && !sEl.value) sEl.value = place.state;
    const res = document.getElementById('geoResult');
    if (res) res.textContent = `✓ ${placeLabel(place)} (${place.lat.toFixed(2)}, ${place.lng.toFixed(2)}) — distances measured from here.`;
    toast(`📍 ${place.village} — press Save profile`);
  });

  const gpsBtn = document.getElementById('gpsLoc');
  if (gpsBtn) gpsBtn.onclick = async () => {
    const res = document.getElementById('geoResult');
    gpsBtn.disabled = true; res.textContent = 'Getting a GPS fix…';
    try {
      const { lat, lng, accuracyM } = await getPosition();
      const place = await reverseGeocode(lat, lng);
      geo = { latitude: lat, longitude: lng, name: place.village || 'Current location' };
      if (place.village) document.getElementById('village').value = place.village;
      if (place.district) document.getElementById('pdistrict').value = place.district;
      if (place.state) document.getElementById('pstate').value = place.state;
      res.textContent = `✓ GPS: ${place.village || 'your position'}${place.district ? ', ' + place.district : ''}`
        + ` (${lat.toFixed(4)}, ${lng.toFixed(4)}, ±${Math.round(accuracyM)} m) — distances now measured from here.`;
      toast('Location set from GPS ✓');
    } catch (e){
      res.textContent = '✗ ' + e.message;
    } finally { gpsBtn.disabled = false; }
  };

  const roleBtn = document.getElementById('switchRoleBtn');
  if (roleBtn) roleBtn.onclick = async () => {
    const next = isMandi() ? FARMER : MANDI;
    if (next === MANDI && !state.profile?.mandiName){
      // Switching into a desk without a gate yet: send them to pick one.
      toast('Pick the mandi you report for in Farm Profile first');
      show('profile');
      return;
    }
    setRole(next);
    if (state.profile){
      state.profile = { ...state.profile, role: next };
      await saveProfile(state.profile);
    }
    toast(next === MANDI ? 'Mandi desk — post today\'s rate' : 'Farmer view');
    document.dispatchEvent(new CustomEvent('km:role-changed', { detail: next }));
    renderProfile();
    show(next === MANDI ? 'dashboard' : 'sell');
  };

  document.getElementById('saveProfileBtn').onclick = async () => {
    if (!geo) return toast('Click "Find my location" first');
    const mandiName = document.getElementById('pMandi')?.value || p.mandiName || '';
    const profile = {
      ...state.profile,
      name: document.getElementById('pname').value.trim(),
      phone: document.getElementById('pphone').value.trim(),
      district: document.getElementById('pdistrict').value.trim(),
      state: document.getElementById('pstate').value.trim(),
      village: geo.name,
      lat: geo.latitude, lng: geo.longitude,
      acres: parseFloat(document.getElementById('acres').value || 0),
      soil: document.getElementById('soil').value,
      irrigation: document.getElementById('irrigation').value,
      role: role(),
      ...(mandiName ? { mandiName, mandiId: idForName(mandiName) } : {}),
      savedAt: Date.now()
    };
    state.profile = profile;
    const res = await saveProfile(profile);
    toast(res.local ? 'Profile saved locally ✓' : 'Profile saved ✓');
    document.dispatchEvent(new CustomEvent('km:data-changed'));
    show(isMandi() ? 'dashboard' : 'season');
  };
}

// ---------------------------------------------------------------------------
//  FARMER GROUP — many small farms, one negotiation
// ---------------------------------------------------------------------------
function fpoCardHTML(){
  const g = myGroup();
  const sum = groupSummary();
  if (!g){
    return `
    <div class="card" style="max-width:560px;margin-top:14px">
      <b style="color:var(--green)">Farmer group (FPO)</b>
      <p class="statlabel" style="margin:6px 0 10px">
        Akela 20 quintal — gate ka bhav. Saath me 40 kisan, 800 quintal — baat-cheet.
        Ek group code se judo.</p>
      <div class="row2">
        <input id="fpoCode" placeholder="Group code (e.g. KM4X2A)" maxlength="8">
        <button class="btn" id="fpoJoin">Join</button>
      </div>
      <button class="btn ghost small" id="fpoCreate" style="margin-top:6px">Naya group banao</button>
      <div class="herr" id="fpoErr"></div>
      <p class="statlabel" style="margin-top:8px">Group sirf kaam ki cheez rakhta hai — naam, fasal, kitna maal.</p>
    </div>`;
  }
  const stock = combinedStock(g);
  return `
  <div class="card" style="max-width:560px;margin-top:14px">
    <div class="cardhead">
      <b style="color:var(--green)">Farmer group · ${g.code}</b>
      <button class="btn ghost small" id="fpoLeave">Leave</button>
    </div>
    <div class="grid" style="margin-top:10px">
      <div><div class="statlabel">Members</div><div class="stat">${sum.members}</div></div>
      <div><div class="statlabel">Combined stock</div><div class="stat">${sum.totalQtl}<span class="statlabel"> qtl</span></div></div>
    </div>
    <div class="tablewrap" style="margin-top:10px">
      <table>
        <tr><th>Crop</th><th>Quantity (qtl)</th><th>Members</th></tr>
        ${stock.length ? stock.map(r => `<tr><td><b>${r.label}</b></td><td class="pos">${r.qty}</td><td>${r.members}</td></tr>`).join('')
          : '<tr><td colspan="3" class="dim">Abhi koi maal nahi — apna stock daalo.</td></tr>'}
      </table>
    </div>
    <div class="frow" style="margin-top:10px">
      <label>Mera maal (qtl)<input id="fpoQty" type="number" min="0" step="1"
        value="${esc((g.members.find(m => m.uid === (appState.user?.uid || 'device')) || {}).qty ?? '')}"></label>
      <label>&nbsp;<button class="btn small" id="fpoSave">Update</button></label>
    </div>
    <button class="btn ghost small" id="fpoSync" style="margin-top:8px">Sync with group (cloud)</button>
    <div class="statlabel" id="fpoMsg" style="margin-top:6px">
      ${g.cloud ? '✓ Cloud se synced' : 'Is device par saved. Cloud se judne ke liye share karo.'}
    </div>
  </div>`;
}

function wireFpo(){
  const err = document.getElementById('fpoErr');
  const joinBtn = document.getElementById('fpoJoin');
  if (joinBtn) joinBtn.onclick = () => {
    const code = document.getElementById('fpoCode').value;
    const r = joinGroup(code);
    if (!r.ok){ if (err) err.textContent = r.error; return; }
    renderProfile();
  };
  const createBtn = document.getElementById('fpoCreate');
  if (createBtn) createBtn.onclick = () => {
    const code = makeCode();
    joinGroup(code);
    renderProfile();
    document.getElementById('fpoMsg')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  const leaveBtn = document.getElementById('fpoLeave');
  if (leaveBtn) leaveBtn.onclick = () => { leaveGroup(); renderProfile(); };
  const saveBtn = document.getElementById('fpoSave');
  if (saveBtn) saveBtn.onclick = () => {
    const r = setMyStock(document.getElementById('fpoQty').value, appState.season?.crop);
    if (!r.ok){ document.getElementById('fpoMsg').textContent = r.error; return; }
    renderProfile();
  };
  const syncBtn = document.getElementById('fpoSync');
  if (syncBtn) syncBtn.onclick = async () => {
    const g = myGroup();
    const out = document.getElementById('fpoMsg');
    if (out) out.textContent = 'Syncing…';
    const up = await pushGroupToCloud();
    const down = await pullGroupFromCloud(g.code);
    if (out) out.textContent = (down.ok || up.ok)
      ? '✓ Group synced — members aur stock update ho gaya'
      : 'Cloud off hai (demo mode ya sign-in nahi). Device par sab safe hai.';
    renderProfile();
  };
}
