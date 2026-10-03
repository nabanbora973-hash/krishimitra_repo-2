// ============================================================================
//  ALERTS — explicit, rules-based notices. Every alert states WHY it fired.
//  Sources: the risk engine (weather + crop stage), the price feed status,
//  price-vs-average movement, and the farmer's own sales log.
// ============================================================================
import { state } from "./state.js";
import { CROPS } from "./crops.js";
import { rupees } from "./ui.js";
import { decide } from "./sell.js";

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

  // 3) a market worth the trip
  if (d.best && d.spreadNet > 0){
    alerts.push({ level: "good", title: `${d.best.name} pays ${rupees(d.spreadNet)}/qtl more than your nearest market`,
      why: `${rupees(d.best.price)}/qtl vs ${rupees(d.nearest.price)} — after ${rupees(d.best.transport)}/qtl transport (${d.best.distanceKm} km). ≈ ${rupees(d.best.earnings)} on ${d.qty} quintals.` });
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
    details. Nothing is sent anywhere.</div>`;
}
