// ============================================================================
//  WHO IS USING THE APP  —  two roles, one codebase
// ----------------------------------------------------------------------------
//  farmer  → sells produce, reads prices, gets the sell/hold verdict
//  mandi   → runs a mandi / trading desk, POSTS today's rate for its own gate
//
//  The mandi role is what makes the price feed independent of data.gov.in: the
//  mandi publishes the number, Firestore carries it, and the farmer next door
//  reads it the same day — no government API key, no server.
// ============================================================================
import { state } from './state.js';
import { show } from './ui.js';

export const ROLE_KEY = 'km_role';
export const FARMER = 'farmer';
export const MANDI  = 'mandi';

// The 39 mandis KrishiMitra already holds. The desk picks from this list so a
// report always lands on a market the farmer's comparison can match.
export const MANDIS = [
  // id comes straight from data/market-data.json, so a report posted by a desk
  // matches the same row the farmer's table already shows.
  { id:'duliajan', name:'Duliajan Daily Bazaar' },
  { id:'naharkatia', name:'Naharkatia Weekly Haat' },
  { id:'digboi', name:'Digboi Main Bazaar' },
  { id:'namrup', name:'Namrup Bazaar' },
  { id:'jorhat', name:'Jorhat Mandi' },
  { id:'tinsukia', name:'Tinsukia Mandi' },
  { id:'sivasagar', name:'Sivasagar Mandi' },
  { id:'dibrugarh', name:'Dibrugarh Mandi' },
  { id:'nagaon-mandi', name:'Nagaon Mandi' },
  { id:'guwahati-fancy-bazar', name:'Guwahati Fancy Bazar' },
  { id:'tezpur-mandi', name:'Tezpur Mandi' },
  { id:'silchar-mandi', name:'Silchar Mandi' },
  { id:'golaghat-mandi', name:'Golaghat Mandi' },
  { id:'north-lakhimpur-mandi', name:'North Lakhimpur Mandi' },
  { id:'barpeta-road-mandi', name:'Barpeta Road Mandi' },
  { id:'bongaigaon-mandi', name:'Bongaigaon Mandi' },
  { id:'karimganj-mandi', name:'Karimganj Mandi' },
  { id:'morigaon-mandi', name:'Morigaon Mandi' },
  { id:'dhubri-mandi', name:'Dhubri Mandi' },
  { id:'diphu-mandi', name:'Diphu Mandi' },
  { id:'mushalpur-mandi', name:'Mushalpur Mandi' },
  { id:'pathsala-mandi', name:'Pathsala Mandi' },
  { id:'biswanath-chariali-mandi', name:'Biswanath Chariali Mandi' },
  { id:'sonari-mandi', name:'Sonari Mandi' },
  { id:'kajalgaon-mandi', name:'Kajalgaon Mandi' },
  { id:'mangaldoi-mandi', name:'Mangaldoi Mandi' },
  { id:'dhemaji-mandi', name:'Dhemaji Mandi' },
  { id:'haflong-mandi', name:'Haflong Mandi' },
  { id:'goalpara-mandi', name:'Goalpara Mandi' },
  { id:'hailakandi-mandi', name:'Hailakandi Mandi' },
  { id:'hojai-mandi', name:'Hojai Mandi' },
  { id:'amingaon-mandi', name:'Amingaon Mandi' },
  { id:'kokrajhar-mandi', name:'Kokrajhar Mandi' },
  { id:'garamur-mandi', name:'Garamur Mandi' },
  { id:'nalbari-mandi', name:'Nalbari Mandi' },
  { id:'mankachar-mandi', name:'Mankachar Mandi' },
  { id:'tamulpur-mandi', name:'Tamulpur Mandi' },
  { id:'udalguri-mandi', name:'Udalguri Mandi' },
  { id:'hamren-mandi', name:'Hamren Mandi' }
];

export const MANDI_NAMES = MANDIS.map(m => m.name);

// The dataset id for a mandi name — the only key both sides agree on.
export const idForName = name => {
  const hit = MANDIS.find(m => m.name === name);
  return hit ? hit.id : mandiId(name);
};

// The gate / trader row at the top of the bundled dataset. Not an APMC, but it
// is where most smallholders actually sell — a mandi desk can report for it too.
export const FARM_GATE_NAME = 'Village trader';

const GENERIC = /\b(mandi|market|bazaar|bazar|haat|weekly|daily|main|apmc)\b/gi;
export const mandiId = name =>
  String(name || '')
    .replace(GENERIC, ' ')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Which mandi a desk is reporting for (set at registration, editable in profile).
export function myMandi(){
  const p = state.profile || {};
  const name = p.mandiName || p.village || '';
  return { name, id: p.mandiId || idForName(name), district: p.district || '' };
}

// Role lives on the device AND in the profile. The device copy answers before
// the profile has loaded; the profile copy is what survives a new phone.
export function role(){
  if (state.profile?.role === MANDI) return MANDI;
  if (state.profile?.role === FARMER) return FARMER;
  if (state.role === MANDI || state.role === FARMER) return state.role;
  try { return localStorage.getItem(ROLE_KEY) === MANDI ? MANDI : FARMER; } catch { return FARMER; }
}

export function setRole(r){
  const v = r === MANDI ? MANDI : FARMER;
  state.role = v;
  // role() prefers the profile, so the in-memory profile must move with the
  // toggle. Persisting it is the caller's job (profile.js / register.js).
  if (state.profile) state.profile = { ...state.profile, role: v };
  try { localStorage.setItem(ROLE_KEY, v); } catch {}
  applyRole();
  return v;
}

export const isMandi = () => role() === MANDI;

// Hide the farmer-only screens for a mandi desk. Done in the DOM rather than the
// router, so a link that lands on a farmer view still renders.
// Screens that belong to a farmer's day, not a mandi's. "markets" is on this
// list because a mandi does not drive to another mandi to sell — it wants the
// competing rates, and those live inside the report desk itself.
const FARMER_ONLY = ['sell', 'alerts', 'sales', 'guidance', 'season', 'markets'];
// The other way round: a farmer does not key a purchase register.
const MANDI_ONLY = ['deskbuy'];

export function applyRole(){
  const r = role();
  if (typeof document === 'undefined' || !document.body) return;
  document.body.setAttribute('data-role', r);
  for (const v of FARMER_ONLY){
    const b = document.querySelector(`.navbtn[data-view="${v}"]`);
    if (b) b.style.display = r === MANDI ? 'none' : '';
  }
  for (const v of MANDI_ONLY){
    const b = document.querySelector(`.navbtn[data-view="${v}"]`);
    if (b) b.style.display = r === MANDI ? '' : 'none';
  }
  const profileBtn = document.querySelector('.navbtn[data-view="profile"]');
  if (profileBtn) profileBtn.textContent = r === MANDI ? 'Mandi Profile' : 'Farm Profile';
  const dashBtn = document.querySelector('.navbtn[data-view="dashboard"]');
  if (dashBtn) dashBtn.textContent = r === MANDI ? 'Report desk' : 'Dashboard';
  const chip = document.getElementById('rolechip');
  if (chip){
    chip.textContent = r === MANDI ? '🏪 Mandi' : '👨‍🌾 Farmer';
    chip.style.display = '';
  }
  // The screen on display must belong to the role we just applied. Without this
  // a farmer who was registered on a device that had been used as a mandi desk
  // stayed on the report desk with the mandi nav — the role said farmer, the
  // app looked like a mandi.
  const active = document.querySelector('.view.active');
  const showing = active && active.id.startsWith('view-') ? active.id.slice(5) : '';
  if (showing === 'dashboard' && r !== MANDI) show('sell');
  if (showing && r === MANDI && FARMER_ONLY.includes(showing)) show('dashboard');
}

// Default landing screen for the role.
export const MANDI_VIEWS = MANDI_ONLY;
export const homeView = () => (isMandi() ? 'dashboard' : 'sell');
