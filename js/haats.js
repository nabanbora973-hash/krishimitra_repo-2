// ============================================================================
//  HAAT & BAZAR — the market that is not on any government register
// ----------------------------------------------------------------------------
//  Assam buys and sells at haats: one village, one weekday, a few hours. Most of
//  them appear in no APMC register, so data.gov.in will never carry them — 15 of
//  226 mandis report; the haat next door reports nothing at all.
//
//  So this view does the only thing that can work without the government: the
//  farmers who stand in that haat put the price in themselves.
//
//  Three rules it lives by:
//   1. A WEEKDAY IS NEVER GUESSED. "Naharkatia Weekly Haat" — which day? We do not
//      know, so it says "din pata nahi" and asks. A wrong day sends a farmer to an
//      empty field with a full cart.
//   2. ONE REPORT IS NOT A PRICE. A rate carries how many people said it and how
//      old it is. A community number never wears the LIVE badge that the
//      government feed earns.
//   3. IT ANSWERS THE REAL QUESTION. Not "what is the rate" but "haat me bechun
//      ya mandi le jaun" — in rupees, after the trip.
// ============================================================================
import { state } from './state.js';
import { CROPS } from './crops.js';
import { rupees, rupees1, toast } from './ui.js';
import { driveTime, hasCoords, geoUri } from './map.js';
import { reportFor, submitReport, SUPPORTED_CROPS } from './mandi-feed.js';
import { loadDataset, compareMarkets } from './markets.js';

const DAYS  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_HI = { Sun: 'Ravivar', Mon: 'Somvar', Tue: 'Mangalvar', Wed: 'Budhwar',
                 Thu: 'Brihaspativar', Fri: 'Shukravar', Sat: 'Shanivar' };
const STORE = 'km_haats_local';

const norm  = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const esc   = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayIdx = () => new Date(Date.now() + 5.5 * 3600e3).getUTCDay();

// ---------------------------------------------------------------------------
//  the list: what we hold, plus what this phone has added
// ---------------------------------------------------------------------------
export function localHaats(){
  try { return JSON.parse(localStorage.getItem(STORE) || '[]'); } catch { return []; }
}
export function saveLocalHaat(h){
  const all = localHaats().filter(x => x.id !== h.id);
  all.push(h);
  try { localStorage.setItem(STORE, JSON.stringify(all)); } catch {}
  return h;
}

// One shape for both sources, so nothing downstream has to care where a haat
// came from. `source` is kept because the UI must be able to say which one it is:
// a haat this phone invented is not the same as one the registry knows.
// The registry is loaded once and kept here, so the view renders synchronously
// after the first call — a haat list that flickers in after a network round trip
// is a list nobody trusts.
let REGISTRY = null;
export async function preloadHaats(){
  if (REGISTRY) return REGISTRY;
  try {
    const d = await loadDataset();
    REGISTRY = (d?.markets || []).filter(m => m.kind === 'haat' || m.kind === 'bazar');
  } catch { REGISTRY = []; }
  return REGISTRY;
}

export function allHaats(){
  const reg = (REGISTRY || [])
    .filter(m => m.kind === 'haat' || m.kind === 'bazar')
    .map(m => ({ ...m, source: 'registry', addedBy: null }));
  const mine = localHaats().filter(h => !reg.some(r => r.id === h.id))
    .map(h => ({ ...h, source: 'phone' }));
  return [...reg, ...mine];
}

export function haatsOnDay(day, list = allHaats()){
  return list.filter(h => h.day === day);
}

// Distance is the only ordering a farmer plans with: the nearest haat that is
// open today beats a famous one two hours away.
export function byDistance(list){
  return [...list].sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
}

// ---------------------------------------------------------------------------
//  the price, as the community knows it
// ---------------------------------------------------------------------------
export function haatPrice(haat, crop){
  if (!haat || !crop) return null;
  // allowStale on purpose: reportFor() hides anything older than a few days,
  // which is right for a price you might act on — but a haat rate that is four
  // days old is still a real observation, and hiding it would leave the farmer
  // thinking nobody has ever priced this haat. It is shown, and labelled old.
  const r = reportFor(haat.name, crop, { mandiId: 'haat:' + haat.id, allowStale: true });
  if (!r) return null;
  const ageMin = Math.max(0, Math.round((Date.now() - (r.at || 0)) / 60000));
  const age = ageMin < 60 ? `${ageMin} min pehle`
            : ageMin < 1440 ? `${Math.round(ageMin / 60)} ghante pehle`
            : `${Math.round(ageMin / 1440)} din pehle`;
  // Never more confident than the evidence: one person said it, so it says one.
  const reporters = Number(r.reporters || 1);
  return { modal: r.modal, min: r.min, max: r.max, age, ageMin, reporters,
           stale: ageMin > 3 * 1440, reporters1: r.reporter || '' };
}

// The honest badge. A community rate is a neighbour's word, not an exchange.
export function priceBadge(p){
  if (!p) return '';
  const n = p.reporters > 1 ? `${p.reporters} log ne bataya` : '1 banda bola';
  return `<span class="chip community" title="Kisan ne bataya — sarkari rate nahi">${n} · ${esc(p.age)}</span>`;
}

// ---------------------------------------------------------------------------
//  haat or mandi — the question behind the question
// ---------------------------------------------------------------------------
//  A haat is closer and costs nothing to reach, but usually pays less. A mandi
//  pays more but takes a truck and a day. This compares them in rupees per
//  quintal for the crop the farmer is actually selling, and says which wins by
//  how much — including the trip.
export function haatVsMandi(haat, crop, qty){
  const hp = haatPrice(haat, crop);
  if (!hp) return null;
  // state.markets is filled when the Compare view renders. A farmer who opens
  // Haat first has an empty list — and the whole point of this line is the
  // comparison, so an empty list must not become "mandi ka net nahi mila".
  // Compute it on demand, from the same function the table uses.
  let rows = state.markets || [];
  if (!rows.some(m => m.netPerQtl != null)) {
    try { rows = compareMarkets(crop, Number(qty) > 0 ? Number(qty) : (state.season?.quantityQtl || 10)); }
    catch { rows = []; }
  }
  rows = rows.filter(m => m.crop === crop || !m.crop);
  const usable = rows.filter(m => m.netPerQtl != null && m.reachable !== false)
    .sort((a, b) => b.netPerQtl - a.netPerQtl);
  const best = usable[0];
  // Why there is no mandi to compare against matters to the farmer: "no mandi in
  // reach" is good news for the haat, "rate not loaded" is not news at all.
  const anyInReach = rows.some(m => m.reachable !== false && m.netPerQtl != null);
  const reason = best ? null : (rows.length && !anyInReach ? 'far' : 'none');
  const q = Number(qty) > 0 ? Number(qty) : (state.season?.quantityQtl || 1);
  // The haat is walked to; nobody hires a truck for eight kilometres of village
  // road. So the haat's number is its rate, and the mandi's is its net.
  const haatNet = hp.modal;
  if (!best) return { haatNet, mandiNet: null, qty: q, diff: null, reason };
  const diff = haatNet - best.netPerQtl;
  return { haatNet, mandiNet: best.netPerQtl, mandiName: best.name, qty: q,
           diff, total: Math.round(diff * q) };
}

// ---------------------------------------------------------------------------
//  the view
// ---------------------------------------------------------------------------
const ICON_PIN = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="10" r="2.4" fill="currentColor"/></svg>`;

function dayChip(h){
  if (h.day === 'daily') return `<span class="chip hday daily">Roz</span>`;
  if (h.day)             return `<span class="chip hday">${esc(DAY_HI[h.day] || h.day)}</span>`;
  return `<span class="chip hday unknown" title="Hum nahi jaante — aap batao">din pata nahi</span>`;
}

function haatRow(h, crop, qty){
  const p = haatPrice(h, crop);
  const cmp = p ? haatVsMandi(h, crop, qty) : null;
  const isToday = h.day === 'daily' || h.day === DAYS[todayIdx()];
  return `
  <div class="hrow${isToday ? ' today' : ''}" data-haat="${esc(h.id)}">
    <div class="hmain">
      <div class="hname">
        ${esc(h.name)}
        ${h.source === 'phone' ? '<span class="chip phone" title="Is phone par add kiya">aapka</span>' : ''}
        ${isToday ? '<span class="chip open">aaj</span>' : ''}
      </div>
      <div class="hmeta">
        ${dayChip(h)}
        ${h.distanceKm != null ? `<span class="dim">${h.distanceKm} km · ${driveTime(h.distanceKm) || ''}</span>` : ''}
        ${h.district ? `<span class="dim">${esc(h.district)}</span>` : ''}
        ${hasCoords(h) ? `<button type="button" class="maplink" data-hpin="${esc(h.id)}" title="Map par dekho">${ICON_PIN}</button>` : ''}
      </div>
      ${p ? `<div class="hprice">
        <b>${rupees(p.modal)}</b><span class="dim">/qtl</span>
        ${p.min && p.max && p.min !== p.max ? `<span class="dim">· ${rupees(p.min)}–${rupees(p.max)}</span>` : ''}
        ${priceBadge(p)}
      </div>` : `<div class="hnoprice">Aaj ka bhav nahi hai. <button type="button" class="hlink" data-hsay="${esc(h.id)}">Aap batao →</button></div>`}
      ${cmp ? `<div class="hvs ${cmp.diff >= 0 ? 'haatwin' : 'mandiwin'}">
        ${cmp.mandiNet == null
          ? (cmp.reason === 'far'
              ? `Haat ${rupees(cmp.haatNet)} · 150 km me koi mandi nahi — haat hi nazdeek hai`
              : `Haat ${rupees(cmp.haatNet)} · mandi ka rate abhi nahi mila`)
          : cmp.diff >= 0
            ? `Haat me bechna ${rupees(Math.abs(cmp.diff))}/qtl behtar — ${esc(cmp.mandiName)} se`
            : `Mandi le jaana ${rupees(Math.abs(cmp.diff))}/qtl behtar — ${esc(cmp.mandiName)} (safar ke baad)`}
        ${cmp.diff != null && Math.abs(cmp.total) >= 1 ? `<span class="dim"> · ${rupees(Math.abs(cmp.total))} poore ${cmp.qty} qtl par</span>` : ''}
      </div>` : ''}
    </div>
    <div class="hact">
      <button type="button" class="btn ghost small" data-hsay="${esc(h.id)}">Bhav daalo</button>
    </div>
  </div>`;
}

export function renderHaat(el = document.getElementById('view-haats')){
  if (!el) return;
  const crop = state.season?.crop || 'paddy';
  const qty  = state.season?.quantityQtl;
  const list = byDistance(allHaats());
  const tod  = haatsOnDay(DAYS[todayIdx()], list);
  const daily = list.filter(h => h.day === 'daily' && !tod.includes(h));
  const openToday = [...tod, ...daily];

  el.innerHTML = `
  <div class="hwrap">
    <div class="hhead">
      <h2>Haat aur Bazar</h2>
      <div class="sub">Sarkari feed me sirf APMC mandi aati hain. Haat, paikar aur bazar — jahan asli bikri hoti hai — kisi register me nahi. Isliye yahan bhav kisan khud daalte hain.</div>
      <div class="hcropline">Bhav dikha rahe hain: <b>${esc(CROPS[crop]?.label || crop)}</b>${state.season ? '' : ' <span class="dim">(season set nahi — default paddy)</span>'}</div>
    </div>

    <div class="hbox">
      <div class="hboxtitle">Aaj — ${DAY_HI[DAYS[todayIdx()]]}</div>
      ${openToday.length
        ? openToday.map(h => haatRow(h, crop, qty)).join('')
        : `<div class="hnone">Aaj ka koi haat hamare paas darj nahi hai. Neeche se apna haat add karo — naam, gaon aur din. Ek haat add karne se aas-paas ke sab kisanon ko fayda hoga.</div>`}
    </div>

    <div class="hbox">
      <div class="hboxtitle">Sab haat aur bazar <span class="dim">(${list.length})</span></div>
      ${list.length ? list.map(h => haatRow(h, crop, qty)).join('')
        : '<div class="hnone">Abhi koi haat darj nahi hai.</div>'}
      <div class="hnote">Doosre din ke haat bhi upar hain — din unke chip me likha hai.
        Din nahi pata? Wahi sabse zaroori cheez hai jo aap bata sakte ho.</div>
    </div>

    <div class="hbox">
      <div class="hboxtitle">Apna haat add karo</div>
      <form id="hAdd" class="hform">
        <label>Haat / bazar ka naam<input name="name" required maxlength="60" placeholder="jaise Sonari Haat"></label>
        <label>Gaon / kasba<input name="village" maxlength="50" placeholder="jaise Sonari"></label>
        <label>Din
          <select name="day">
            <option value="">Pata nahi</option>
            <option value="daily">Roz lagta hai</option>
            ${DAYS.map(d => `<option value="${d}">${DAY_HI[d]}</option>`).join('')}
          </select>
        </label>
        <label class="hcheck"><input type="checkbox" name="useLoc" checked> Meri location se doori nikaalo</label>
        <div class="hrowbtns">
          <button class="btn" type="submit">Add karo</button>
          <span class="dim hformnote">Abhi ye aapke phone par rehta hai.</span>
        </div>
      </form>
    </div>
  </div>`;

  wire(el);
}

function wire(el){
  // price entry, inline under the row it belongs to
  el.querySelectorAll('[data-hsay]').forEach(b => {
    b.onclick = () => openSay(el, b.dataset.hsay);
  });
  el.querySelectorAll('[data-hpin]').forEach(b => {
    b.onclick = async () => {
      const h = allHaats().find(x => x.id === b.dataset.hpin);
      if (!h) return;
      // The mandi sheet already knows how to draw a map and a trip; a haat is
      // the same shape of question.
      try {
        const { openMandiSheet } = await import('./mandi-sheet.js');
        openMandiSheet({ id: h.id, name: h.name, district: h.district, lat: h.lat, lng: h.lng,
                         distanceKm: h.distanceKm, kind: 'haat' });
      } catch (e) { toast('Map nahi khula.'); }
    };
  });

  const form = el.querySelector('#hAdd');
  if (form) form.onsubmit = e => {
    e.preventDefault();
    const f = new FormData(form);
    const name = String(f.get('name') || '').trim();
    if (name.length < 2) { toast('Haat ka naam likho.'); return; }
    const id = 'local-' + norm(name);
    if (allHaats().some(h => h.id === id)) { toast('Ye haat pehle se list me hai.'); return; }
    const p = state.profile || {};
    const useLoc = f.get('useLoc');
    const h = {
      id, name,
      district: String(f.get('village') || '').trim() || p.district || '',
      day: String(f.get('day') || '') || null,
      lat: useLoc && p.lat != null ? p.lat : null,
      lng: useLoc && p.lng != null ? p.lng : null,
      distanceKm: useLoc && p.lat != null ? 0 : null,
      kind: 'haat', source: 'phone', addedAt: Date.now()
    };
    saveLocalHaat(h);
    toast('Haat add ho gaya.');
    renderHaat(el);
  };
}

// ---------------------------------------------------------------------------
//  "aap batao" — the price form, right where the gap is
// ---------------------------------------------------------------------------
function openSay(el, haatId){
  const h = allHaats().find(x => x.id === haatId);
  if (!h) return;
  const crop = state.season?.crop || 'paddy';
  const host = el.querySelector('[data-haat="' + CSS.escape(haatId) + '"]') || el;
  host.querySelector('.hsayform')?.remove();

  const box = document.createElement('div');
  box.className = 'hsayform';
  box.innerHTML = `
    <div class="hsayhead">${esc(h.name)} — aaj ka bhav</div>
    <div class="hsayrow">
      <select class="hsaycrop">
        ${SUPPORTED_CROPS.map(c => `<option value="${c}"${c === crop ? ' selected' : ''}>${esc(CROPS[c]?.label || c)}</option>`).join('')}
      </select>
      <input class="hsayprice" type="number" inputmode="numeric" min="1" max="999999"
             placeholder="₹ / qtl" aria-label="Aaj ka bhav per quintal">
      <button type="button" class="btn small hsaygo">Daalo</button>
      <button type="button" class="btn ghost small hsayx" aria-label="Band karo">✕</button>
    </div>
    <div class="dim hsayhint">Jo aapne aaj gate par dekha. Naam nahi poochha jayega.</div>`;
  host.appendChild(box);
  box.querySelector('.hsayprice').focus();
  box.querySelector('.hsayx').onclick = () => box.remove();

  const go = async () => {
    const price = Number(box.querySelector('.hsayprice').value);
    const c = box.querySelector('.hsaycrop').value;
    if (!price || price <= 0) { toast('Bhav likho — jaise 2050'); return; }
    const btn = box.querySelector('.hsaygo');
    btn.disabled = true; btn.textContent = '…';
    const r = await submitReport({
      mandiId: 'haat:' + h.id, mandiName: h.name, district: h.district || '',
      crop: c, modal: price
    });
    if (!r.ok) { toast(r.error || 'Nahi gaya.'); btn.disabled = false; btn.textContent = 'Daalo'; return; }
    toast(r.cloud === false ? 'Phone me save ho gaya — signal aane par khud jayega.' : 'Bhav daal diya.');
    renderHaat(el);
  };
  box.querySelector('.hsaygo').onclick = go;
  box.querySelector('.hsayprice').onkeydown = e => { if (e.key === 'Enter') go(); };
}

// Exported for the tests and for anything that wants the day names.
export { DAYS, DAY_HI };
