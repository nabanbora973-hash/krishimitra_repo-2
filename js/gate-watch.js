// ============================================================================
//  GATE WATCH — what my gate pays vs what the next gate pays.
// ----------------------------------------------------------------------------
//  A mandi desk lives or dies on one number: its own rate compared with the
//  gates around it. If Nagaon is ₹60 above me for three days, the farmers go to
//  Nagaon — and nobody tells me. This compares my posted rate with every other
//  mandi the app holds, says where I stand, and can nudge me once a day when I
//  am the one losing the farmers.
//
//  It never invents a competitor rate: every figure comes from state.markets —
//  government feed, a reported gate, or the bundled dataset, labelled by the
//  app's usual honesty ladder.
// ============================================================================
import { state } from './state.js';

const KEY = 'km_gate_watch_v1';

const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
const write = o => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch {} };

export const gateThreshold = () => Number(read().threshold) || 50;
export function setGateThreshold(v){
  const t = Math.max(10, Math.min(500, Math.round(Number(v) || 50)));
  write({ ...read(), threshold: t });
  return t;
}
export const gateAlertsOn = () => read().alerts !== false;
export function setGateAlerts(on){ write({ ...read(), alerts: !!on }); return !!on; }

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Where do I stand? `markets` are the ranked rows the app already shows.
export function gateSnapshot({ markets = [], myName = '', myRate = null } = {}){
  const me = norm(myName);
  const others = (markets || []).filter(r => r && r.price != null && norm(r.name) !== me && !/trader|village/i.test(r.name));
  const mineRow = (markets || []).find(r => norm(r.name) === me) || null;
  const rate = myRate != null ? Math.round(myRate) : (mineRow?.price ?? null);
  const best = others.slice().sort((a, b) => b.price - a.price)[0] || null;
  const lowest = others.slice().sort((a, b) => a.price - b.price)[0] || null;
  const diff = best && rate != null ? rate - best.price : null;
  const rank = best && rate != null
    ? 1 + others.filter(r => r.price > rate).length
    : null;

  const position = diff == null ? 'nodata'
    : diff > 15 ? 'ahead'
    : diff < -15 ? 'behind'
    : 'level';

  return {
    myName: mineRow?.name || myName || 'your gate',
    myRate: rate,
    bestOther: best ? { name: best.name, price: best.price } : null,
    lowestOther: lowest ? { name: lowest.name, price: lowest.price } : null,
    diff, rank, total: others.length + (rate != null ? 1 : 0), position,
    nearestGap: best ? Math.abs(best.price - (lowest?.price ?? best.price)) : null
  };
}

export function gateText(s){
  if (s.myRate == null) return 'Post today’s rate and this compares you with every other gate.';
  if (!s.bestOther) return 'No other gate has a price today — yours is the only number on the board.';
  if (s.position === 'ahead')
    return `You are ₹${Math.round(s.diff)}/qtl above ${s.bestOther.name} — farmers will come to you today.`;
  if (s.position === 'behind')
    return `${s.bestOther.name} pays ₹${Math.round(-s.diff)}/qtl more than you — expect bags to go there.`;
  return `Within ₹${Math.abs(Math.round(s.diff))}/qtl of ${s.bestOther.name} — level with the market.`;
}

// One nudge a day, only when the desk is actually losing on price.
export function gateAlert(s, { today = null, threshold = gateThreshold() } = {}){
  if (!gateAlertsOn() || !s || s.position !== 'behind') return null;
  if (Math.abs(s.diff) < threshold) return null;
  const day = today || new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const st = read();
  if (st.lastAlertDate === day) return null;
  write({ ...st, lastAlertDate: day });
  return {
    title: `${s.bestOther.name} is ₹${Math.round(-s.diff)} above you`,
    body: `You are at ₹${s.myRate}/qtl, they are at ₹${s.bestOther.price}. Consider matching it before the morning arrivals.`
  };
}

export const _internal = { KEY };
