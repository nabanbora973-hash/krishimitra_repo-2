// ============================================================================
//  TRUST  —  leaderboard, reporting streak, and a price history you can see
// ----------------------------------------------------------------------------
//  A price is only worth what the source is worth. So every number here answers
//  a question a farmer actually asks:
//
//    leaderboard  → "aaj sabse zyada bhav kahan hai?"
//    streak       → "ye mandi roz rate daalti hai ya nahi?"   (trust)
//    history      → "kal kya tha?"                          (context)
//
//  Streak is deliberately weekly and forgiving: 5+ days in the last 7 is
//  "reliable". A mandi that posts once a month is not punished, just labelled.
// ============================================================================
import { allReports, istToday, reportsForCrop } from './mandi-feed.js';
import { CROPS } from './crops.js';

const DAY = 86400e3;
const istDay = ts => new Date(ts + 5.5 * 3600e3).toISOString().slice(0, 10);

// ---------- leaderboard ----------
// Today's posted rates, highest first. A crop filter keeps it relevant.
export function leaderboard(crop = null, limit = 8){
  const today = istToday();
  const rows = allReports().filter(r => r.date === today && (!crop || r.crop === crop));
  const byMandi = new Map();
  for (const r of rows){
    const k = r.mandiId || r.mandiName;
    const prev = byMandi.get(k);
    if (!prev || (r.modal || 0) > (prev.modal || 0)) byMandi.set(k, r);
  }
  return [...byMandi.values()]
    .sort((a, b) => (b.modal || 0) - (a.modal || 0))
    .slice(0, limit)
    .map((r, i) => ({ ...r, rank: i + 1, cropLabel: CROPS?.[r.crop]?.label || r.crop }));
}

// ---------- trust / streak ----------
export function trustFor(mandiId, mandiName){
  const all = allReports().filter(r =>
    (mandiId && r.mandiId === mandiId) || (!mandiId && r.mandiName === mandiName));
  const days = new Set(all.map(r => r.date));
  const today = istToday();
  const week = [];
  for (let i = 0; i < 7; i++){
    week.push(istDay(Date.now() - i * DAY));
  }
  const inWeek = week.filter(d => days.has(d)).length;
  const postedToday = days.has(today);
  let label = 'new';
  if (inWeek >= 5) label = 'reliable';
  else if (inWeek >= 2) label = 'regular';
  else if (inWeek === 1) label = 'occasional';
  return {
    mandiId: mandiId || null, mandiName, daysPosted: days.size,
    thisWeek: inWeek, postedToday, label,
    score: Math.round((inWeek / 7) * 100)
  };
}

export const trustText = t => {
  if (!t) return '';
  const map = {
    reliable: 'Roz rate daalti hai',
    regular: 'Hafte me kai baar',
    occasional: 'Kabhi-kabhi',
    new: 'Naya — abhi shuru'
  };
  return `${t.thisWeek}/7 din is hafte · ${map[t.label] || t.label}`;
};

// ---------- history ----------
// The days we actually have, oldest → newest. No interpolation, no invented
// points: a gap is a gap, and the chart shows it as one.
export function rateHistory(mandiId, crop, days = 30, mandiName){
  const since = istDay(Date.now() - days * DAY);
  const rows = allReports().filter(r =>
    (!crop || r.crop === crop) && r.date >= since &&
    ((mandiId && r.mandiId === mandiId) || (!mandiId && r.mandiName === mandiName)));
  const byDay = new Map();
  for (const r of rows){
    const prev = byDay.get(r.date);
    if (!prev || (r.at || 0) > (prev.at || 0)) byDay.set(r.date, r);
  }
  return [...byDay.values()]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map(r => ({ date: r.date, price: r.modal, source: 'REPORTED' }));
}

// A tiny inline sparkline — no library, no network, works offline.
export function sparkline(points, { w = 220, h = 44 } = {}){
  if (!points || points.length < 2) return '';
  const vals = points.map(p => p.price).filter(v => isFinite(v));
  if (vals.length < 2) return '';
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const step = w / (points.length - 1);
  const y = v => h - 4 - ((v - min) / span) * (h - 10);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)},${y(p.price).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  const rising = vals[vals.length - 1] >= vals[0];
  const colour = rising ? '#0B4A2F' : '#A80E1F';
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none"
      role="img" aria-label="price history, ${points.length} points">
    <path d="${d}" fill="none" stroke="${colour}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${((points.length - 1) * step).toFixed(1)}" cy="${y(last.price).toFixed(1)}" r="3" fill="${colour}"/>
  </svg>`;
}

// Today's board for one crop, as rows ready to render.
export const todayFor = crop => reportsForCrop(crop).filter(r => r.date === istToday());
