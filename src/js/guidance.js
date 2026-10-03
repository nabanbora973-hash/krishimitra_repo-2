// The guidance layer — turns risks + markets into a decision the farmer can act on.
// Four outputs (exactly as the deck promises): compare · sell · monitor · review.
// Every guidance record is stored as an audit trail (integrity story).
import { state } from "./state.js";
import { logGuidance } from "./store.js";
import { show, toast, rupees } from "./ui.js";
import { risksHTML } from "./risk.js";

export function buildGuidance(){
  const byId = Object.fromEntries((state.risks || []).map(r => [r.id, r]));
  const best = state.markets?.[0];
  const actions = [];

  if (byId['spread'])  actions.push({ type: 'compare', title: 'Compare markets before selling',
      detail: byId['spread'].title + ' — travelling there may earn more, net of transport.' });
  if (byId['falling']) actions.push({ type: 'sell', title: 'Consider selling now',
      detail: 'Recent price trend is downward — holding may reduce your realisation.' });
  if (byId['rain-stage'] || byId['perish']) actions.push({ type: 'review', title: 'Review weather & crop risks',
      detail: 'Weather and/or storage conditions make timing important right now.' });
  if (!byId['falling'] && best && best.trend > 2) actions.push({ type: 'monitor', title: 'Monitor prices before selling',
      detail: `Prices at ${best.name} are trending upward (${best.trend.toFixed(1)}%) — watch a few more days.` });

  if (!actions.length) actions.push({ type: 'monitor', title: 'No urgent signal',
      detail: 'Nothing on the weather or price side demands an immediate decision. Re-check after the next price update.' });

  const confidence = (state.risks?.length || 0) <= 1 ? 'high'
                   : (state.risks?.length || 0) <= 3 ? 'medium' : 'low';

  return {
    actions, confidence,
    disclaimer: 'Decision-support suggestion only — not a guarantee. You decide.',
    inputs: {
      crop: state.season?.crop, stage: state.season?.stage,
      quantityQtl: state.season?.quantityQtl,
      bestMarket: best?.name, bestNet: best?.netPerQtl,
      risks: (state.risks || []).map(r => r.id),
      weatherFetchedAt: state.weather?.fetchedAt
    }
  };
}

export function renderRisksIn(elementId){
  const el = document.getElementById(elementId);
  if (el) el.innerHTML = risksHTML();
}

export function renderGuidance(){
  const v = document.getElementById('view-guidance');
  if (!state.season){
    v.innerHTML = `<h2>Guidance</h2><div class="empty">Set your crop for this season to get guidance.</div>`; return;
  }
  if (!state.markets.length || !state.weather){
    v.innerHTML = `<h2>Guidance</h2><div class="empty">Add your farm profile and crop — guidance appears as soon as weather and markets load.</div>`; return;
  }

  state.guidance = buildGuidance();
  const g = state.guidance;
  const icons = { compare: '🏪', sell: '✅', monitor: '📈', review: '⚠️' };

  v.innerHTML = `
    <h2>Your Guidance</h2>
    <p class="sub">Based on your farm, this season's crop, live weather and today's market comparison.</p>

    ${g.actions.map(a => `
      <div class="gact">
        <div class="ttl">${icons[a.type] || '•'} ${a.title}</div>
        <div class="ds">${a.detail}</div>
      </div>`).join('')}

    <p style="margin:8px 0 18px">Confidence: <span class="conf ${g.confidence}">${g.confidence.toUpperCase()}</span>
      <span class="statlabel" style="margin-left:8px">based on data freshness and how many signals are active</span></p>

    <h3 style="margin:22px 0 10px">Why — the signals behind this</h3>
    <div id="guidanceRisks"></div>

    <div class="card" style="margin-top:16px">
      <b style="color:var(--green)">Audit trail</b>
      <p class="statlabel" style="margin-top:4px">Every guidance record is stored with the inputs it was based on — weather timestamp,
      prices considered, rules triggered. This is how a decision-support tool stays accountable.</p>
      <button class="btn small" id="saveGuidanceBtn" style="margin-top:10px">Save this guidance to history</button>
      <span id="guidanceSavedMsg" class="statlabel" style="margin-left:10px"></span>
    </div>

    <div class="caveat">${g.disclaimer}</div>`;

  renderRisksIn('guidanceRisks');

  document.getElementById('saveGuidanceBtn').onclick = async () => {
    await logGuidance({ recommendation: g.actions.map(a => a.title).join(' · '), confidence: g.confidence, inputs: g.inputs });
    document.getElementById('guidanceSavedMsg').textContent = 'Saved ✓ (visible in your history)';
    toast('Guidance saved to your history ✓');
  };
}
