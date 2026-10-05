// Farm profile — permanent details, geocoded live (Open-Meteo geocoding, no key).
import { state } from "./state.js";
import { saveProfile } from "./store.js";
import { show, toast, liveBadge } from "./ui.js";

export function renderProfile(){
  const v = document.getElementById('view-profile');
  const p = state.profile || {};
  v.innerHTML = `
    <h2>Farm Profile ${liveBadge()}</h2>
    <p class="sub">Set once, keep forever. Only your crop details change each season.</p>
    <div class="card" style="max-width:560px">
      <label>Village / Town</label>
      <input id="village" placeholder="e.g. Duliajan" value="${p.village || ''}">
      <button class="btn small" id="findLoc" type="button">Find my location</button>
      <p id="geoResult" class="statlabel" style="margin:8px 0 18px">${p.lat ? `✓ Saved location: ${p.village} (${(+p.lat).toFixed(2)}, ${(+p.lng).toFixed(2)})` : 'We look up your location to fetch local weather.'}</p>
      <label>Land size (acres)</label>
      <input id="acres" type="number" step="0.1" min="0" value="${p.acres ?? ''}">
      <label>Soil type</label>
      <select id="soil">
        ${['Alluvial','Clay','Loamy','Sandy','Laterite'].map(s => `<option ${p.soil === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
      <label>Irrigation</label>
      <select id="irrigation">
        ${['Rain-fed','Canal','Borewell / Tube well','River / Pond lift'].map(s => `<option ${p.irrigation === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
      <button class="btn" id="saveProfileBtn" style="width:100%">Save profile</button>
    </div>`;

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

  document.getElementById('saveProfileBtn').onclick = async () => {
    if (!geo) return toast('Click "Find my location" first');
    const profile = {
      village: geo.name,
      lat: geo.latitude, lng: geo.longitude,
      acres: parseFloat(document.getElementById('acres').value || 0),
      soil: document.getElementById('soil').value,
      irrigation: document.getElementById('irrigation').value,
      savedAt: Date.now()
    };
    state.profile = profile;
    const res = await saveProfile(profile);
    toast(res.local ? 'Profile saved locally ✓' : 'Profile saved ✓');
    document.dispatchEvent(new CustomEvent('km:data-changed'));
    show('season');
  };
}
