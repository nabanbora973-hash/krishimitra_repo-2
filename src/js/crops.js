// Crop knowledge table + seasonal crop setup (deck: "Seasonal Crop Setup").
// The knowledge table is the domain intelligence the risk engine reads.
import { state } from "./state.js";
import { saveSeason } from "./store.js";
import { show, toast, emptyHTML } from "./ui.js";

export let CROPS = {};

export async function loadCrops(){
  if (Object.keys(CROPS).length) return CROPS;
  const r = await fetch("data/crops.json");
  CROPS = await r.json();
  return CROPS;
}

// Auto-suggest crop stage from days since sowing (farmer can override).
export function suggestStage(cropKey, sowingDateISO){
  const days = Math.floor((Date.now() - new Date(sowingDateISO)) / 86400000);
  const stages = CROPS[cropKey].stages;
  let suggested = Object.keys(stages).at(-1);
  for (const [name, [a, b]] of Object.entries(stages)){
    if (days >= a && days <= b){ suggested = name; break; }
  }
  return { stage: suggested, days: Math.max(days, 0) };
}

export function renderSeason(){
  const v = document.getElementById('view-season');
  const crops = Object.entries(CROPS);
  v.innerHTML = `
    <h2>Season &amp; Crop Setup</h2>
    <p class="sub">This season's crop — update it every season in a few steps. Your farm profile stays permanent.</p>
    <div class="card" style="max-width:560px">
      <label>Crop</label>
      <select id="cropSel">${crops.map(([k,c]) => `<option value="${k}">${c.label}</option>`).join('')}</select>
      <label>Variety</label>
      <input id="variety" placeholder="e.g. Local / Hybrid (optional)">
      <label>Sowing date</label>
      <input id="sowDate" type="date">
      <label>Expected harvest quantity (quintals)</label>
      <input id="qty" type="number" min="1" step="1" value="20">
      <div id="stagePreview" class="caveat" style="display:none"></div>
      <label style="margin-top:12px;display:block">Stage <span style="font-weight:400">(auto-suggested — you can override)</span></label>
      <select id="stageSel"></select>
      <button class="btn" id="saveSeasonBtn" style="width:100%">Save this season</button>
    </div>`;

  const cropSel = document.getElementById('cropSel');
  const sowDate = document.getElementById('sowDate');
  const stageSel = document.getElementById('stageSel');
  const preview = document.getElementById('stagePreview');

  if (state.season){   // pre-fill if a season exists
    cropSel.value = state.season.crop || 'paddy';
    document.getElementById('variety').value = state.season.variety || '';
    sowDate.value = state.season.sowingDate || '';
    document.getElementById('qty').value = state.season.quantityQtl || 20;
  } else {
    sowDate.value = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  }

  function refreshStages(){
    const crop = CROPS[cropSel.value];
    if (!crop) return;                       // crop table not loaded yet — guard
    const names = Object.keys(crop.stages);
    stageSel.innerHTML = names.map(n => `<option value="${n}">${n}</option>`).join('');
    if (sowDate.value){
      const { stage, days } = suggestStage(cropSel.value, sowDate.value);
      stageSel.value = stage;
      const [a, b] = crop.stages[stage];
      preview.style.display = 'block';
      preview.textContent = `Day ${days} since sowing · suggested stage: ${stage} (typical window: day ${a}–${b} for ${crop.label}).`
        + (stage === names.at(-1) && days > b ? ' Past the typical harvest window — check your field.' : '');
    }
  }
  cropSel.onchange = refreshStages;
  sowDate.onchange = refreshStages;
  refreshStages();

  document.getElementById('saveSeasonBtn').onclick = async () => {
    const season = {
      crop: cropSel.value,
      variety: document.getElementById('variety').value.trim(),
      sowingDate: sowDate.value,
      stage: stageSel.value,
      quantityQtl: parseFloat(document.getElementById('qty').value || 20),
      savedAt: Date.now()
    };
    if (!season.sowingDate) return toast('Please pick a sowing date');
    state.season = season;
    const res = await saveSeason(season);
    toast(res.local ? 'Season saved locally ✓' : 'Season saved ✓');
    document.dispatchEvent(new CustomEvent('km:data-changed'));
    show('markets');
  };
}

// Small helper used by the dashboard
export function seasonSummary(){
  if (!state.season) return emptyHTML('No crop set for this season — go to <b>Season &amp; Crop</b>.');
  const c = CROPS[state.season.crop];
  return `<p><b>${c ? c.label : state.season.crop}</b>${state.season.variety ? ' · ' + state.season.variety : ''}
    · stage: <b>${state.season.stage}</b></p>
    <p class="statlabel">Sown ${state.season.sowingDate} · expected ${state.season.quantityQtl} quintals</p>`;
}
