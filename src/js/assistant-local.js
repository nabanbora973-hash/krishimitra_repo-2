// Local assistant — answers real questions from THIS farm's data, with no API key.
//
// Why this exists: the Gemini path needs a key nobody has on the demo laptop, and
// its fallback used to dump the same generic guidance for every crop and village.
// This engine composes the answer out of the farmer's own numbers — crop, stage,
// quantity, village, weather and the ranked market list — so the reply changes
// when any of those change. When a Gemini key IS configured, assistant.js prefers
// the model and keeps this as the offline fallback.
import { state } from "./state.js";
import { CROPS } from "./crops.js";
import { bestMarket } from "./markets.js";

const r0 = n => Number.isFinite(n) ? '₹' + Math.round(n).toLocaleString('en-IN') : '—';
const one = n => (Math.round(n * 10) / 10).toLocaleString('en-IN');

/* ------------------------------------------------------------------ context */

// One plain object describing the farm as it stands right now.
// Exported so tests (and the app) can pass a synthetic farm in.
export function contextSnapshot(){
  const p = state.profile || {};
  const s = state.season || {};
  const crop = CROPS[s.crop] || null;
  const w = state.weather?.data;
  // Only rows whose net price is a real number — a mandi with no distance set
  // has no honest net figure and must never surface as "₹NaN".
  const markets = (state.markets || [])
    .filter(m => Number.isFinite(m.netPerQtl) && Number.isFinite(m.price))
    .map(m => ({ name: m.name, price: m.price, net: m.netPerQtl,
                 distanceKm: m.distanceKm, trend: m.trend }));
  // The assistant must name the market the farmer would actually drive to,
  // not the one with the highest price on the board.
  const chosen = bestMarket(state.markets);
  const best = chosen
    ? (markets.find(m => m.name === chosen.name) || markets[0] || null)
    : (markets[0] || null);

  let weather = null;
  if (w){
    const d = w.daily || {};
    weather = {
      tempC: w.current ? Math.round(w.current.temperature_2m) : null,
      humidity: w.current ? w.current.relative_humidity_2m : null,
      rainNow: w.current ? w.current.precipitation : null,
      rainChance: (d.precipitation_probability_max || []).slice(0, 3),
      rainSum: (d.precipitation_sum || []).slice(0, 3),
      maxT: (d.temperature_2m_max || []).slice(0, 3),
      minT: (d.temperature_2m_min || []).slice(0, 3)
    };
  }

  return {
    name: (p.name || '').trim(),
    village: (p.village || '').trim(),
    district: (p.district || '').trim(),
    state: (p.state || '').trim(),
    acres: p.acres ?? null,
    soil: p.soil || null,
    irrigation: p.irrigation || null,
    cropKey: s.crop || null,
    cropLabel: crop ? crop.label : (s.crop || null),
    variety: s.variety || null,
    stage: s.stage || null,
    quantityQtl: s.quantityQtl ?? null,
    sowingDate: s.sowingDate || null,
    storageDays: crop ? crop.storageLifeDays : null,
    perishable: crop ? !!crop.perishable : false,
    rainSensitive: crop ? (crop.rainSensitiveStages || []) : [],
    weather,
    markets,
    best,
    risks: (state.risks || []).map(r => ({ id: r.id, title: r.title, severity: r.severity }))
  };
}

/* ------------------------------------------------------------------ intents */

const HAS = (q, words) => words.some(w => q.includes(w));

function detectIntent(q){
  if (HAS(q, ['hello','hi ','hey','namaste','namaskar','ram ram','good morning','good evening','oi'])) return 'greeting';
  if (HAS(q, ['who am i','my profile','my farm','my details','mera khet','my land','my soil'])) return 'profile';
  if (HAS(q, ['rain','barish','baarish','paani','monsoon','weather','mausam','forecast','temperature','garmi','heat'])) return 'weather';
  if (HAS(q, ['where','best market','which market','kahan','mandi','haat','compare','market'])) return 'market';
  if (HAS(q, ['store','storage','rakh','godown','hold','shelf','spoil','kharab'])) return 'storage';
  if (HAS(q, ['pest','disease','keet','insect','blight','fungus','rot','bimari','ilaj'])) return 'pest';
  if (HAS(q, ['fertilizer','urea','khad','manure','npk','dap','potash'])) return 'fert';
  if (HAS(q, ['how much','kitna','split','partial','how many quintal','share','aadha'])) return 'quantity';
  if (HAS(q, ['why','kyun','reason','explain','kaise'])) return 'why';
  if (HAS(q, ['sell','bech','bikri','wait','hold','abhi','now','when'])) return 'sell';
  if (HAS(q, ['price','bhav','daam','rate','msp','kitne ka'])) return 'price';
  if (HAS(q, ['harvest','kab katna','katai','cutting','ready'])) return 'harvest';
  if (HAS(q, ['help','kya kar','what can you','options','kya bata'])) return 'help';
  return 'snapshot';
}

/* ------------------------------------------------------------------ helpers */

const NEED_CROP = 'Set your crop first — open “Season & Crop” and save it, then ask me again. ' +
                  'Everything I say is computed from that crop, your village and today’s prices.';

function bestLine(c){
  const b = c.best;
  if (!b) return 'No ranked market right now — prices have not loaded.';
  const near = c.markets.find(m => m.distanceKm != null) || b;
  return `Best net price: ${b.name} at ${r0(b.net)}/qtl (${b.distanceKm != null ? b.distanceKm + ' km away' : 'distance unknown'})`;
}

function rainLine(c){
  if (!c.weather) return 'live weather has not loaded yet';
  const w = c.weather;
  const chances = (w.rainChance || []).filter(x => x != null);
  if (!chances.length) return 'no rain forecast data';
  const max = Math.max(...chances);
  const day = ['today','tomorrow','day 3'][chances.indexOf(max)] || 'next days';
  return max >= 60 ? `rain is likely (${max}% on ${day})`
       : max >= 30 ? `some rain possible (${max}% on ${day})`
       : `mostly dry (highest chance just ${max}% over three days)`;
}

function weatherLine(c){
  const w = c.weather;
  if (!w) return 'Live weather is not available right now — I will not guess it.';
  const parts = [];
  if (w.tempC != null) parts.push(`${w.tempC}°C now`);
  if (w.humidity != null) parts.push(`${w.humidity}% humidity`);
  if (w.rainNow != null && w.rainNow > 0) parts.push(`${one(w.rainNow)} mm rain right now`);
  return `In ${c.village || 'your area'}: ${parts.join(', ')}. ${rainLine(c)}.`;
}

function sellAnswer(c){
  if (!c.cropKey) return NEED_CROP;
  const b = c.best;
  const qty = c.quantityQtl || 0;
  if (!b) return `I have no ranked market for ${c.cropLabel} yet, so I cannot price a sell decision honestly.`;
  const spread = c.markets.length > 1 ? b.net - c.markets[c.markets.length - 1].net : null;
  const trendUp = b.trend != null && b.trend > 1;
  const trendDown = b.trend != null && b.trend < -1;

  const verdict = c.perishable ? 'sell now'
    : trendDown ? 'sell a large part now'
    : trendUp ? 'sell part now, hold the rest'
    : 'sell part now, hold the rest';

  const holdQtl = c.perishable ? 0 : Math.round(qty * 0.4 * 10) / 10;
  const sellQtl = Math.round((qty - holdQtl) * 10) / 10;

  const lines = [
    `For ${one(qty)} qtl of ${c.cropLabel}${c.variety ? ' (' + c.variety + ')' : ''} at ${c.stage || 'unknown'} stage — my call: ${verdict}.`,
    `${bestLine(c)}${spread ? `, a spread of ${r0(spread)}/qtl across the mandis I can see` : ''}.`
  ];
  if (qty) {
    lines.push(c.perishable
      ? `It only stores about ${c.storageDays} days, so selling all ${one(qty)} qtl now is the safe route.`
      : `That means about ${one(sellQtl)} qtl now (${r0(sellQtl * b.net)}) and ${one(holdQtl)} qtl held back (${r0(holdQtl * b.net)} at today's price).`);
  }
  lines.push(trendDown ? 'Trend is against holding — prices fell recently.'
    : trendUp ? 'Trend is mildly upward, which is why I keep a portion back.'
    : 'Trend is flat, so there is no reward for holding everything.');
  return lines.join(' ');
}

function marketAnswer(c){
  if (!c.cropKey) return NEED_CROP;
  if (!c.markets.length) return `No ${c.cropLabel} prices loaded yet.`;
  const top = c.markets.slice(0, 3)
    .map((m, i) => `${i + 1}. ${m.name} — ${r0(m.price)}/qtl, net ${r0(m.net)}${m.distanceKm != null ? ` (${m.distanceKm} km)` : ''}`)
    .join('\n');
  const b = c.best;
  const qty = c.quantityQtl || 0;
  return `For ${c.cropLabel} from ${c.village || 'your village'}, ranked by what you actually keep after transport:\n${top}\n\n` +
    `Take ${b.name}: ${r0(b.net)}/qtl × ${one(qty)} qtl = ${r0(b.net * qty)}. ` +
    `The sticker price is not the answer — transport is already subtracted.`;
}

function storageAnswer(c){
  if (!c.cropKey) return NEED_CROP;
  const d = c.storageDays;
  if (c.perishable) return `${c.cropLabel} is perishable — roughly ${d} days of usable storage. Do not plan around holding it; ` +
    `sell the bulk now at ${c.best ? c.best.name : 'the best mandi'} and treat any delay as a loss.`;
  return `${c.cropLabel} keeps about ${d} days in ordinary storage, so holding is a real option but not a free one. ` +
    `Every extra day costs moisture and handling risk; the ${r0((c.best?.net || 0))}/qtl at ${c.best ? c.best.name : 'your best mandi'} today is the benchmark you need to beat.`;
}

function rainAnswer(c){
  const w = c.weather;
  if (!w) return 'Live weather is not available right now — I will not guess rainfall for you.';
  const sens = c.rainSensitive && c.stage && c.rainSensitive.includes(c.stage);
  const head = `${c.village || 'Your area'}: ${w.tempC}°C, ${w.humidity}% humidity. ${rainLine(c)}.`;
  if (!c.cropKey) return head + ' Set your crop and I can tell you whether that matters for your stage.';
  return head + (sens
    ? ` That matters: ${c.cropLabel} at ${c.stage} stage is rain-sensitive, so plan harvest or covering now rather than later.`
    : ` Your ${c.cropLabel} is at ${c.stage || 'an unknown'} stage, which is not the most rain-sensitive window — watch it, but no panic.`);
}

function quantityAnswer(c){
  if (!c.cropKey) return NEED_CROP;
  const qty = c.quantityQtl || 0;
  const b = c.best;
  if (!qty || !b) return 'I need both your expected quantity and a ranked market to split the sale.';
  if (c.perishable) return `All ${one(qty)} qtl. ${c.cropLabel} stores only about ${c.storageDays} days — splitting a perishable sale just spreads the risk of loss.`;
  const hold = Math.round(qty * 0.4 * 10) / 10, sell = Math.round((qty - hold) * 10) / 10;
  return `About ${one(sell)} qtl now and ${one(hold)} qtl held. At ${b.name}'s ${r0(b.net)}/qtl that is ` +
    `${r0(sell * b.net)} in hand and ${r0(hold * b.net)} still exposed to the market — a split that keeps you liquid without betting everything on one price.`;
}

function profileAnswer(c){
  if (!c.acres) return 'Your farm is not registered yet — tap “Register your farm” to add name, village, land and crop.';
  return `${c.name || 'You'} — ${c.acres} acre${c.acres == 1 ? '' : 's'} at ${c.village}${c.district ? ', ' + c.district : ''}` +
    `${c.state ? ', ' + c.state : ''}. Soil ${c.soil}, ${c.irrigation} irrigation. ` +
    `This season: ${c.cropLabel || 'no crop set'}${c.stage ? ' at ' + c.stage : ''}${c.quantityQtl ? ', ' + one(c.quantityQtl) + ' qtl expected' : ''}.`;
}

function pestAnswer(c){
  const base = 'I cannot diagnose a photo, and I will not pretend to. For leaf spots, wilting or borer damage, take a close photo of the affected leaf and stem to your nearest Krishi Vigyan Kendra or call the Kisan Call Centre on 1800-180-1551 — free, in your language.';
  return c.cropKey ? `${base} Your ${c.cropLabel} is at ${c.stage || 'an unknown'} stage, so mention that when you call.` : base;
}

function fertAnswer(c){
  if (!c.cropKey) return NEED_CROP + ' Fertiliser advice depends on the crop and stage.';
  return `I will not give a blind dose — soil test results decide nitrogen, phosphorus and potash. ` +
    `What I can say: ${c.cropLabel} at ${c.stage || 'this stage'} on ${c.soil || 'your'} soil with ${c.irrigation || 'your'} irrigation ` +
    `is the context a KVK officer needs. Get a soil test (₹100–300) before buying urea you may not need.`;
}

function harvestAnswer(c){
  if (!c.cropKey) return NEED_CROP;
  const stage = c.stage || 'unknown';
  const ready = ['maturity','harvest','fruiting','pod-filling'].includes(stage);
  return `${c.cropLabel} is at ${stage}${c.sowingDate ? ` (sown ${c.sowingDate})` : ''}. ` +
    (ready ? `That is close to harvest — ${rainLine(c)}. Check grain/fruit moisture before you book a truck.`
           : `Not harvest window yet. ${rainLine(c)} is the thing to watch from now on.`);
}

function whyAnswer(c){
  const g = (c.risks || []).map(r => `• ${r.title}`).join('\n');
  return `The signals active for your farm right now:\n${g || '• nothing urgent fired'}\n\n` +
    `Those come from your crop stage, the price series and the forecast — not from a model guessing. ` +
    `Every rule that fires states why it fired.`;
}

function greetingAnswer(c){
  const h = new Date().getHours();
  const hello = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return `${hello}${c.name ? ', ' + c.name.split(' ')[0] : ''}. ` +
    (c.cropKey
      ? `You have ${one(c.quantityQtl || 0)} qtl of ${c.cropLabel} at ${c.stage || 'an unknown'} stage near ${c.village}. ${bestLine(c)}. Ask me whether to sell, where to sell, or about the rain.`
      : 'Register your farm and I can talk about your actual crop, prices and weather.');
}

function helpAnswer(c){
  const can = ['should I sell now', 'which mandi pays best', 'what does the rain mean for my crop',
               'how much should I sell', 'how long can I store it', 'explain the signals'];
  return `I answer from your own farm data${c.cropKey ? ` — ${c.cropLabel} at ${c.village}` : ''}. Try:\n` +
    can.map(x => '• ' + x).join('\n');
}

function snapshotAnswer(c){
  if (!c.cropKey) return NEED_CROP;
  return `${one(c.quantityQtl || 0)} qtl ${c.cropLabel} at ${c.stage || 'unknown'} stage in ${c.village || 'your village'}. ` +
    `${bestLine(c)}. ${rainLine(c)}. Ask about selling, markets, storage or the weather.`;
}

/* ------------------------------------------------------------------ engine */

export function answerLocally(question, ctx){
  const c = ctx || contextSnapshot();
  const q = (' ' + String(question || '').toLowerCase() + ' ').replace(/\s+/g, ' ');
  const intent = detectIntent(q);

  const text = ({
    greeting: greetingAnswer,
    profile:  profileAnswer,
    weather:  rainAnswer,
    market:   marketAnswer,
    storage:  storageAnswer,
    pest:     pestAnswer,
    fert:     fertAnswer,
    quantity: quantityAnswer,
    harvest:  harvestAnswer,
    why:      whyAnswer,
    sell:     sellAnswer,
    price:    marketAnswer,
    help:     helpAnswer,
    snapshot: snapshotAnswer
  }[intent] || snapshotAnswer)(c);

  return { intent, text, local: true, ctx: c };
}
