// ============================================================================
//  ALERTS — explicit, rules-based notices. Every alert states WHY it fired.
//  Sources: the risk engine (weather + crop stage), the price feed status,
//  price-vs-average movement, and the farmer's own sales log.
// ============================================================================
import { state } from "./state.js";
import { CROPS } from "./crops.js";
import { rupees } from "./ui.js";
import { decide } from "./sell.js";
import { addAlert, allAlerts, removeAlert, checkAlerts, bestPriceFor, alertText } from "./rate-alerts.js";

export function buildAlerts(){
  const alerts = [];
  const d = decide();
  const src = state.priceSource || {};
  const crop = d.crop || {};

  // 1) weather risk during a sensitive stage
  if (d.rainRisk){
    alerts.push({ level: "high", title: `Rain risk in the next 3 days (up to ${d.maxRain}%)`,
      why: `${crop.label || "Your crop"} is at '${d.season?.stage}' — a stage that ${crop.label || "it"} is sensitive to. Consider harvesting/selling before the spell.` });
  }

  // 2) price above / below the recorded average
  if (d.points.length >= 2){
    if (d.abovePct >= 3)
      alerts.push({ level: "good", title: `Price is ${d.abovePct.toFixed(1)}% above your ${d.points.length}-day average`,
        why: `${d.local?.name || "Your market"} reports ${rupees(d.today)}/qtl today vs an average of ${rupees(Math.round(d.avg))}. Good levels to lock in.` });
    else if (d.abovePct <= -3)
      alerts.push({ level: "medium", title: `Price is ${Math.abs(d.abovePct).toFixed(1)}% below your ${d.points.length}-day average`,
        why: `Today's ${rupees(d.today)}/qtl is below the ${rupees(Math.round(d.avg))} average${d.storable ? " — and this crop stores, so waiting is possible" : " — but this crop does not keep long"}.` });
  }

  // 3) a market worth the trip — or the honest version: there isn't one
  if (d.best && d.nearest && d.best.id === d.nearest.id){
    alerts.push({ level: "good", title: `${d.best.name} pays best — and it is the one next door`,
      why: `${rupees(d.best.netPerQtl)}/qtl net after ${rupees(d.best.transport)}/qtl transport over ${d.best.distanceKm} km.
            No market further away pays enough to cover the drive today. ≈ ${rupees(d.best.earnings)} on ${d.qty} quintals.` });
  } else if (d.best && d.spreadNet >= 60){
    alerts.push({ level: "good", title: `${d.best.name} pays ${rupees(d.spreadNet)}/qtl more than your nearest market`,
      why: `${d.best.name} nets ${rupees(d.best.netPerQtl)}/qtl after ${rupees(d.best.transport)}/qtl transport (${d.best.distanceKm} km), against ${rupees(d.nearest.netPerQtl)}/qtl at ${d.nearest.name} (${d.nearest.distanceKm} km). ≈ ${rupees(d.best.earnings)} on ${d.qty} quintals.` });
  }

  // 4) how trustworthy today's numbers are — said plainly
  if (src.source === "LIVE"){
    alerts.push({ level: "info", title: `Prices are LIVE from AGMARKNET (Govt of India)`,
      why: `Government-reported figures${src.govDate ? `, arrival date ${src.govDate}` : ""}, fetched from data.gov.in.` });
  } else if (src.source === "LAST KNOWN"){
    alerts.push({ level: "medium", title: `Using the last government price this device saw`,
      why: `The AGMARKNET feed was unreachable just now${src.govDate ? ` — showing ${src.govDate}` : ""}. Verify before a large sale.` });
  } else {
    alerts.push({ level: "info", title: `Showing prototype (DEMO) prices`,
      why: `${(src.error || "The government feed is not connected right now").toString().slice(0, 160)} — the app switches to LIVE automatically when the feed is reachable.` });
  }

  // 5) storage economics, when the crop keeps
  if (d.storable && d.storageCost)
    alerts.push({ level: "info", title: `Storage costs about ${rupees(d.storageCost)}/qtl for ${d.storageWeeks} week${d.storageWeeks > 1 ? "s" : ""}`,
      why: `At ${rupees(d.signals.storagePerQtlWeek)}/qtl/week. Holding only pays if the price rises more than that.` });

  // 6) sunday/holiday gap — mandis don't report daily
  alerts.push({ level: "info", title: `Mandi price feeds skip Sundays & government holidays`,
    why: `On those days the app keeps the last reported figure and shows its date, so you always know how fresh a price is.` });

  return alerts;
}

export function renderAlerts(){
  const v = document.getElementById("view-alerts");
  if (!v) return;
  const alerts = buildAlerts();
  const order = { high: 0, medium: 1, good: 2, info: 3 };
  alerts.sort((a, b) => order[a.level] - order[b.level]);
  const chip = l => ({ high: '<span class="chip red">ACT NOW</span>',
                       medium: '<span class="chip demo">WATCH</span>',
                       good: '<span class="chip live">GOOD</span>',
                       info: '<span class="chip">INFO</span>' }[l]);

  v.innerHTML = `
    <h2>Alerts</h2>
    <p class="sub">Everything KrishiMitra is watching for you — each one says <b>why</b> it fired. Rules-based, no black box.</p>
    <div class="alertlist">
      ${alerts.map(a => `
        <div class="alert ${a.level}">
          ${chip(a.level)}
          <div><b>${a.title}</b><div class="dim" style="margin-top:3px">${a.why}</div></div>
        </div>`).join("")}
    </div>
    <div class="sourcenote">Alerts are generated on this device from the government price feed, live weather and your own farm
    details. Nothing is sent anywhere.</div>

    ${priceAlertHTML()}`;

  wirePriceAlerts();
}

// ---------------------------------------------------------------------------
//  "Bhav ₹2,400 cross kare to batao" — the alert the farmer sets himself
// ---------------------------------------------------------------------------
function priceAlertHTML(){
  const list = allAlerts();
  const best = bestPriceFor(state.season?.crop || 'paddy');
  const cropOpts = Object.entries(CROPS || {})
    .map(([k, c]) => `<option value="${k}" ${k === (state.season?.crop || 'paddy') ? 'selected' : ''}>${c.label}</option>`)
    .join('');
  return `
    <div class="card" style="margin-top:16px">
      <b style="color:var(--green)">Price alerts</b>
      <p class="statlabel" style="margin:6px 0 10px">
        Apna number set karo — bhav us line ko cross kare to app batayegi.
        ${best ? `Aaj <b>${state.season?.crop ? (CROPS?.[state.season.crop]?.label || state.season.crop) : 'paddy'}</b> ka best <b>₹${best.price}</b> (${best.market}).` : ''}
      </p>

      <div class="frow">
        <label>Crop<select id="paCrop">${cropOpts}</select></label>
        <label>When price is
          <select id="paDir">
            <option value="above">above (upar)</option>
            <option value="below">below (neeche)</option>
          </select>
        </label>
        <label>₹ per quintal<input id="paPrice" inputmode="numeric" placeholder="e.g. 2400"
          value="${best ? Math.round(best.price * 1.05) : ''}"></label>
      </div>
      <button class="btn small" id="paAdd">Add alert</button>
      <div class="herr" id="paErr"></div>

      <div class="alertlist" style="margin-top:12px">
        ${list.length ? list.map(a => {
          const label = CROPS?.[a.crop]?.label || a.crop;
          const fired = !!a.firedAt;
          return `<div class="alert ${fired ? 'good' : 'info'}">
            <span class="chip ${fired ? 'live' : 'demo'}">${fired ? 'FIRED' : 'WATCHING'}</span>
            <div style="flex:1">
              <b>${label} ${a.direction === 'above' ? '↑' : '↓'} ₹${a.price}/qtl</b>
              <div class="dim" style="margin-top:3px">
                ${fired ? `Crossed — ab ₹${a.lastSeen}${a.mandiName ? ' · ' + a.mandiName : ''}` :
                  'Aaj ke best bhav se compare hoga jab app khulega.'}
              </div>
            </div>
            <button class="btn ghost small" data-del-alert="${a.id}">Remove</button>
          </div>`;
        }).join('') : '<p class="empty">Abhi koi alert nahi. Ek set karo — phir app tumhe yaad dilayegi.</p>'}
      </div>
    </div>`;
}

function wirePriceAlerts(){
  const btn = document.getElementById('paAdd');
  if (!btn) return;
  btn.onclick = () => {
    const err = document.getElementById('paErr');
    if (err) err.textContent = '';
    const r = addAlert({
      crop: document.getElementById('paCrop').value,
      direction: document.getElementById('paDir').value,
      price: document.getElementById('paPrice').value
    });
    if (!r.ok){ if (err) err.textContent = r.error; return; }
    renderAlerts();
  };
  document.querySelectorAll('[data-del-alert]').forEach(b => b.onclick = () => {
    removeAlert(b.getAttribute('data-del-alert'));
    renderAlerts();
  });
}
