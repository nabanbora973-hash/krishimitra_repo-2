// Rules-based risk assessment — deterministic, inspectable, explainable.
// Every rule states WHY, in plain language. (This is the Q&A armour.)
import { state } from "./state.js";
import { CROPS } from "./crops.js";
import { renderRisksIn } from "./guidance.js";

export function assessRisks(){
  const { weather, season, markets } = state;
  const risks = [];
  if (!weather || !season || !markets || !markets.length){ state.risks = risks; return risks; }

  const crop = CROPS[season.crop];
  const d = weather.data.daily;
  const rain3 = (d.precipitation_probability_max || []).slice(0, 3).map(x => x ?? 0);
  const maxRain = rain3.length ? Math.max(...rain3) : 0;
  const maxT = Math.max(...(d.temperature_2m_max || []).slice(0, 3).map(x => x ?? -99));
  const ranked = markets.filter(m => m.knownDistance !== false && m.netPerQtl != null);
  const best = ranked[0];
  const nearest = ranked.length ? ranked.reduce((a, b) => (a.distanceKm < b.distanceKm ? a : b)) : null;
  // Same model as the deck: extra price at the far market − transport to reach it.
  const gain = (best && nearest) ? Math.round((best.price - nearest.price) - best.transport) : 0;

  // RULE 1 — rain during a sensitive stage
  if (crop && maxRain >= 60 && crop.rainSensitiveStages.includes(season.stage)){
    risks.push({ id: 'rain-stage', severity: 'high', title: 'Rain risk during a sensitive stage',
      why: `Up to ${maxRain}% rain probability in the next 3 days, while the crop is at '${season.stage}' — the stage where ${crop.label} is most weather-sensitive.` });
  }

  // RULE 2 — heat stress
  if (maxT >= 36){
    risks.push({ id: 'heat', severity: 'medium', title: 'Heat stress likely',
      why: `Forecast highs up to ${Math.round(maxT)}°C in the next 3 days.` });
  }

  // RULE 3 — falling price trend
  if (best.trend <= -4){
    risks.push({ id: 'falling', severity: 'high', title: 'Prices falling recently',
      why: `${best.name} is ${best.trend.toFixed(1)}% over the recent period — waiting may cost you money.` });
  }

  // RULE 4 — market spread opportunity (a positive signal, still logged)
  if (gain >= 100){
    risks.push({ id: 'spread', severity: 'opportunity', title: `₹${gain}/quintal available at ${best.name}`,
      why: `${best.name} pays ₹${best.price} vs ₹${nearest.price} at ${nearest.name}, minus ₹${best.transport}/qtl transport to get there — net +₹${gain}/qtl, ≈ ₹${gain * (season.quantityQtl || 0)} on ${season.quantityQtl} quintals.` });
  }

  // RULE 5 — perishability clock
  if (crop && crop.perishable && crop.storageLifeDays <= 7){
    risks.push({ id: 'perish', severity: 'medium', title: `Short storage life (~${crop.storageLifeDays} days)`,
      why: `${crop.label} cannot wait long — decide within days, not weeks.` });
  }

  state.risks = risks;
  return risks;
}

export function refreshRisks(){
  assessRisks();
  renderRisksIn('dashRisks');
  renderRisksIn('guidanceRisks');
  return state.risks;
}

export function risksHTML(){
  if (!state.risks || !state.risks.length)
    return `<p class="empty">No risk signals with the current data — that is itself information: nothing urgent on the weather or price side.</p>`;
  return state.risks.map(r => `
    <div class="risk ${r.severity}">
      <div class="t">${r.severity === 'opportunity' ? '💰' : (r.severity === 'high' ? '⚠️' : '•')} ${r.title}</div>
      <div class="why">${r.why}</div>
    </div>`).join('');
}
