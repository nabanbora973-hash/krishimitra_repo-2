// ============================================================================
//  WHOLESALE — most farmers now sell to a trader, a mill or a wholesale buyer
//  instead of carrying the sack to the mandi gate.
// ----------------------------------------------------------------------------
//  The headline rate is the wrong number to compare. A mandi quote is minus
//  transport and (in most states) minus commission, hamali, weighing cut, and
//  the money arrives in two to four days. A wholesale buyer often quotes lower
//  per quintal but picks up at the farm, pays cash, and cuts nothing.
//
//  So this module compares NET rupees per quintal, from what the farmer says
//  about the offer. It also answers the only question that matters at the gate:
//  "what must he pay me per quintal before this beats the mandi?" — the
//  break-even rate. Everything is plain arithmetic, shown line by line, so the
//  farmer can argue with the trader using the screen.
// ============================================================================

const KEY = 'km_wholesale_v1';

// What locked money costs. ₹1 lakh stuck for a month is not free — this is the
// interest a farmer pays on a crop loan, roughly 1.5% a month. Used only to
// price a payment delay, never added to a cash sale.
export const CREDIT_PCT_PER_MONTH = 1.5;

export const DEFAULT_OFFER = {
  buyer: '',
  rate: 0,
  pickup: true,        // buyer collects at the farm → no transport
  km: 0,               // distance to the buyer when not picked up
  commissionPct: 0,    // arthiya / commission agent — usually 0 on a wholesale deal
  hamaliPerQtl: 0,     // loading / unloading / stitching
  kaataPct: 0.5,       // weighing cut — half a percent short on the scale is normal
  days: 0              // payment after N days (0 = cash)
};

export function loadOffer(){
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || 'null');
    return o && typeof o === 'object' ? { ...DEFAULT_OFFER, ...o } : null;
  } catch { return null; }
}

export function saveOffer(o){
  const clean = { ...DEFAULT_OFFER, ...o, savedAt: Date.now() };
  try { localStorage.setItem(KEY, JSON.stringify(clean)); } catch {}
  return clean;
}

export function clearOffer(){
  try { localStorage.removeItem(KEY); } catch {}
}

// One wholesale offer → every rupee counted, per quintal.
export function offerNet(offer = {}, { transportPerQtl = 0 } = {}){
  const rate        = Math.max(0, +offer.rate || 0);
  const kaataPct    = Math.max(0, +offer.kaataPct || 0);
  const commission  = Math.max(0, +offer.commissionPct || 0);
  const hamali      = Math.max(0, +offer.hamaliPerQtl || 0);
  const days        = Math.max(0, +offer.days || 0);
  const freight     = offer.pickup ? 0 : Math.max(0, transportPerQtl);

  const weighCut  = rate * kaataPct / 100;
  const afterWeigh = rate - weighCut;
  const commissionCut = afterWeigh * commission / 100;
  const afterComm = afterWeigh - commissionCut;
  const creditCost = afterComm * (days / 30) * (CREDIT_PCT_PER_MONTH / 100);
  const net = afterComm - hamali - freight - creditCost;

  return { rate, weighCut, afterWeigh, commissionCut, afterComm,
           hamali, freight, creditCost, net, days };
}

// The rate at which a wholesale offer exactly matches the mandi's net price.
// Solve: rate·(1−kaata)·(1−commission) − hamali − freight − credit = mandiNet.
export function breakEven(offer = {}, { transportPerQtl = 0, mandiNet = 0 } = {}){
  const k = 1 - Math.max(0, +offer.kaataPct || 0) / 100;
  const c = 1 - Math.max(0, +offer.commissionPct || 0) / 100;
  const credit = (Math.max(0, +offer.days || 0) / 30) * (CREDIT_PCT_PER_MONTH / 100);
  const denom = k * c - credit;
  if (denom <= 0.01) return null;                      // costs eat every rupee
  const freight = offer.pickup ? 0 : Math.max(0, transportPerQtl);
  return (Math.max(0, mandiNet) + (+offer.hamaliPerQtl || 0) + freight) / denom;
}

// The whole comparison, in one object the UI can print line by line.
export function compare(offer, { bestMarket = null, qty = 0 } = {}){
  const mandiNet = bestMarket?.netPerQtl ?? 0;
  const transportPerQtl = bestMarket?.transport ?? 0;
  const w = offerNet(offer, { transportPerQtl });
  const be = breakEven(offer, { transportPerQtl, mandiNet });
  const diffPerQtl = w.net - mandiNet;
  const diffTotal = diffPerQtl * (qty || 0);
  const near = Math.abs(diffPerQtl) < 10;              // ₹10/qtl is rounding, not advice

  const verdict = !w.rate ? 'none'
    : near ? 'same'
    : diffPerQtl > 0 ? 'wholesale' : 'mandi';

  return {
    offer: { ...offer }, wholesale: w, mandiNet, transportPerQtl,
    mandiName: bestMarket?.name || '', diffPerQtl, diffTotal,
    breakEven: be, qty, verdict,
    verdictText: !w.rate
      ? 'Type the rate the buyer offered — the comparison appears here.'
      : near
        ? `The two are within ₹${Math.abs(Math.round(diffPerQtl))}/qtl of each other. Take the one that pays today.`
        : diffPerQtl > 0
          ? `The buyer is ahead by ₹${Math.round(diffPerQtl)}/qtl — ₹${Math.round(diffTotal).toLocaleString('en-IN')} on ${qty || 0} quintals.`
          : `The mandi is still ahead by ₹${Math.round(-diffPerQtl)}/qtl — ₹${Math.round(-diffTotal).toLocaleString('en-IN')} on ${qty || 0} quintals.`,
    breakEvenText: be == null
      ? 'With these cuts no wholesale rate can beat the mandi — fix the commission or the payment delay.'
      : `Ask for at least ₹${Math.round(be).toLocaleString('en-IN')}/qtl. Below that, the mandi pays more after its own costs.`
  };
}

// WhatsApp / native-share text — the numbers a farmer can forward to the trader.
export function offerText(cmp, { cropLabel = 'crop', qty = 0 } = {}){
  const w = cmp.wholesale;
  if (!w.rate) return '';
  const lines = [
    `🤝 Wholesale vs mandi — ${cropLabel}${qty ? `, ${qty} quintals` : ''}`,
    cmp.offer.buyer ? `Buyer: ${cmp.offer.buyer}` : '',
    `Trader ₹${Math.round(w.rate).toLocaleString('en-IN')}/qtl → ₹${Math.round(w.net).toLocaleString('en-IN')}/qtl net`,
    cmp.mandiName
      ? `Best mandi (${cmp.mandiName}) → ₹${Math.round(cmp.mandiNet).toLocaleString('en-IN')}/qtl net`
      : '',
    cmp.verdict === 'wholesale'
      ? `Buyer is ahead by ₹${Math.round(cmp.diffPerQtl)}/qtl${qty ? ` (₹${Math.round(cmp.diffTotal).toLocaleString('en-IN')})` : ''}.`
      : cmp.verdict === 'mandi'
        ? `Mandi is ahead by ₹${Math.round(-cmp.diffPerQtl)}/qtl${qty ? ` (₹${Math.round(-cmp.diffTotal).toLocaleString('en-IN')})` : ''}.`
        : 'Both within ₹10/qtl — take the one that pays today.',
    cmp.breakEven != null ? `Break-even rate: ₹${Math.round(cmp.breakEven).toLocaleString('en-IN')}/qtl.` : '',
    w.days > 0 ? `Payment in ${w.days} days — ₹${Math.round(w.creditCost).toLocaleString('en-IN')}/qtl is the cost of waiting.` : 'Cash on the spot.',
    '— KrishiMitra'
  ];
  return lines.filter(Boolean).join('\n');
}
