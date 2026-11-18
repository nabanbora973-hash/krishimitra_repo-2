// ============================================================================
//  MSP — the government's floor price, next to today's mandi rate
// ----------------------------------------------------------------------------
//  A farmer selling paddy at ₹2,200 when the support price is ₹2,441 is losing
//  ₹241 a quintal and does not know it. That gap is the single most expensive
//  thing this app can put on screen — so it does, with the year and source, and
//  it refuses to invent a number for a crop that has no MSP.
//
//  FIGURES: CCEA decision of 13 May 2026, kharif marketing season 2026-27
//  (paddy common ₹2,441 · Grade A ₹2,461) and the rabi 2026-27 wheat figure
//  (₹2,585). MUSTARD is the one rabi oilseed this app prices (₹6,200, 2026-27).
//
//  Vegetables (tomato, potato, brinjal, cabbage) have NO MSP in India. The card
//  says so instead of showing a made-up floor — a fake MSP would be worse than
//  no MSP, because a farmer could plan a crop around it.
//
//  Updating this file once a year (May for kharif, October for rabi) is the
//  whole maintenance job. The season label is printed on screen, so an old
//  table looks old instead of looking wrong.
// ============================================================================

export const MSP_SEASON = '2026-27';
export const MSP_SOURCE = 'CCEA, 13 May 2026';

// ₹ per quintal. cropKey matches data/crops.json.
const MSP = {
  paddy:   { price: 2441, label: 'Paddy (common)', gradeA: 2461 },
  mustard: { price: 6200, label: 'Mustard / Rapeseed' },
};

export const mspFor = cropKey => MSP[cropKey] || null;

// "₹241 kam" / "₹50 zyada" — how today's rate sits against the floor.
export function mspGap(cropKey, mandiPrice){
  const m = mspFor(cropKey);
  if (!m || !(mandiPrice > 0)) return null;
  return Math.round(mandiPrice - m.price);
}

// The card. `best` is the ranked winner the table already computed, `cropKey`
// is the season crop. It prints nothing at all when there is nothing true to say.
export function mspCardHTML(cropKey, best, rupees){
  const m = mspFor(cropKey);
  const cropLabel = { paddy: 'Paddy', mustard: 'Mustard' }[cropKey] || 'is fasal';

  // Vegetables: say it plainly. This is not a dead end — it tells the farmer
  // why the number he keeps hearing about does not apply to his crop, and then
  // shows him the floor prices this app DOES hold, so the panel teaches instead
  // of leaving three-quarters of a phone screen blank. (That blank is exactly
  // what made this look like a broken section.)
  if (!m) {
    const have = Object.entries(MSP);
    return `<div class="card" style="margin-top:14px" id="mspNone">
      <div class="cardhead"><b>Sarkari MSP</b>
        <span class="chip demo" style="margin-left:auto">${MSP_SEASON} par ${cropLabel} ka MSP nahi</span></div>

      <p class="sourcenote" style="margin:-4px 0 10px">
        ${cropLabel} jaise sabzi-fal ke liye Bharat me <b>koi MSP nahi</b> hota.
        MSP ki list me 23 fasal hain — dhan, gehu, sarson, dal, tilhan — sabzi
        aur fal usme nahi aate. Inka bhav sirf mandi me aavat aur demand se banta hai,
        isliye yahan koi floor price nahi dikhaya jaata. <b>Jo rate board pe hai wahi sach hai.</b></p>

      <div class="statlabel" style="margin-bottom:6px">Jin faslon ka MSP hota hai — aur jo ye app price karta hai</div>
      <div class="tablewrap">
        <table>
          <tr><th>Fasal</th><th>MSP ${MSP_SEASON}</th><th>Grade A</th></tr>
          ${have.map(([k, v]) => `<tr>
            <td><b>${v.label}</b></td>
            <td>${rupees(v.price)}<span class="statlabel"> /qtl</span></td>
            <td>${v.gradeA ? rupees(v.gradeA) + '<span class="statlabel"> /qtl</span>' : '<span class="dim">—</span>'}</td>
          </tr>`).join('')}
        </table>
      </div>
      <div class="sourcenote" style="margin-top:8px">
        Source: ${MSP_SOURCE} · ${MSP_SEASON}.
        ${have.some(([k]) => k !== cropKey)
          ? `Agar aap <b>${have.map(([, v]) => v.label.split(' /')[0].replace(' (common)', '')).join('</b> ya <b>')}</b> bechte hain,
             to <b>Season &amp; Crop</b> me wo fasal chuno — phir yahan MSP se seedhi tulna dikhegi.`
          : ''}
      </div>

      ${best && best.price > 0 ? `<div class="statlabel" style="margin-top:10px;padding-top:9px;border-top:1px solid #EDF4EF">
        Aaj ki sabse achhi mandi: <b>${best.name}</b> · ${rupees(best.price)}/qtl</div>` : ''}
    </div>`;
  }

  const gap = best ? mspGap(cropKey, best.price) : null;
  const below = gap != null && gap < 0;

  return `<div class="card" style="margin-top:14px" id="mspCard">
    <div class="cardhead"><b>Sarkari MSP vs mandi ka rate</b>
      <span class="chip demo" style="margin-left:auto">${MSP_SEASON}</span></div>
    <div class="grid2" style="margin-top:6px">
      <div>
        <div class="statlabel">MSP · ${m.label}</div>
        <div class="stat">${rupees(m.price)}<span class="statlabel"> /qtl</span></div>
        ${m.gradeA ? `<div class="statlabel">Grade A: ${rupees(m.gradeA)}/qtl</div>` : ''}
      </div>
      <div>
        <div class="statlabel">${best ? `Mandi de rahi hai · ${best.name}` : 'Mandi ka rate'}</div>
        <div class="stat ${below ? 'orange' : ''}">${best ? rupees(best.price) : '—'}<span class="statlabel"> /qtl</span></div>
        ${gap != null ? `<div class="statlabel" style="color:${below ? '#A80E1F' : '#0B4A2F'};font-weight:700">
          ${below ? `${rupees(-gap)} MSP se kam` : `${rupees(gap)} MSP se zyada`}</div>` : ''}
      </div>
    </div>
    ${below ? `<div class="caveat" style="margin-top:12px;border-color:var(--red-50)">
      <b>MSP se neeche bik raha hai.</b> Apne block ke <b>FCI / CMR procurement kendra</b> ya
      NAFED se poocho — paddy ka sarkari kharid ka kendra har zile me khulta hai
      (registration PACS/ e-Kisan portal se). Mandi ka rate dekh ke hi bech dena
      zaroori nahi.
    </div>` : `<div class="sourcenote" style="margin-top:10px">
      MSP sirf tab bachata hai jab sarkari kharid chalu ho — mandi ka bhav usse upar
      ho to bechne me koi nuksan nahi.</div>`}
    <div class="sourcenote" style="margin-top:8px">
      MSP: ${MSP_SOURCE} · ${MSP_SEASON}. Ye sarkari floor hai, kharid ki guarantee nahi —
      har rajy me kharid ka apna tareeka hai.</div>
  </div>`;
}
