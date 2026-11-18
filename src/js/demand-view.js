// ============================================================================
//  DEMAND BOARD — one screen, two jobs.
//    mandi desk : post what it needs, read the commitments that come back.
//    farmer     : see who is buying, commit quintals, keep the reply on record.
// ============================================================================
import { state } from './state.js';
import { CROPS } from './crops.js';
import { isMandi, myMandi } from './roles.js';
import { SUPPORTED_CROPS, istToday } from './mandi-feed.js';
import { openDemands, myDemands, postDemand, closeDemand, respond, responsesFor,
         myResponses, demandById, daysLeft, demandText, sampleDemands } from './demand.js';
import { toast } from './ui.js';
import { shareText } from './share.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const label = k => esc(CROPS?.[k]?.label || k);
const when = d => {
  const n = daysLeft(d);
  return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`;
};
const money = n => '₹' + Math.round(n).toLocaleString('en-IN');

let FORM_OPEN = null;   // which demand's "I can supply" box is open

// A guest cannot write to a public board (the rules require a signed-in uid),
// so the honest next step is the account screen, not a retry button.
async function wireSignIn(root){
  const { startAuthScreen } = await import('./app.js');
  root.querySelectorAll('[data-signin]').forEach(b => b.onclick = () => {
    try { startAuthScreen(); } catch {}
  });
}

export function renderDemand(){
  const v = document.getElementById('view-demand');
  if (!v) return;
  if (isMandi()) renderDesk(v); else renderFarmer(v);
}

// ------------------------------------------------------------------ desk side
function renderDesk(v){
  const crops = SUPPORTED_CROPS;
  const mine = myDemands().slice().sort((a, b) => (b.at || 0) - (a.at || 0));
  const today = istToday();
  const maxDate = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
  const defDate = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);

  v.innerHTML = `
    <h2>Demand board <span class="chip reported">MANDI</span></h2>
    <p class="sub">Tell the farmers near your gate what you need. They commit quintals; you see
      who is coming before the truck reaches you.</p>

    <div class="card">
      <b style="color:var(--green)">Post what you need</b>
      <p class="statlabel" style="margin:6px 0 10px">One post per requirement — crop, quintals, the most you will pay, and the day you need it.</p>
      <div class="wf2">
        <label>Crop<select id="dmCrop">${crops.map(k => `<option value="${k}">${label(k)}</option>`).join('')}</select></label>
        <label>Quintals needed<input id="dmQty" type="number" inputmode="numeric" min="1" step="1" placeholder="e.g. 200"></label>
        <label>Max ₹ per quintal<input id="dmPrice" type="number" inputmode="numeric" min="0" step="1" placeholder="e.g. 2100"></label>
        <label>Needed by<input id="dmDate" type="date" value="${defDate}" min="${today}" max="${maxDate}"></label>
      </div>
      <label>Note (optional)<input id="dmNote" type="text" maxlength="160" placeholder="e.g. A-grade, cash on delivery"></label>
      <p id="dmErr" class="statlabel" style="color:var(--red);margin:6px 0"></p>
      <button class="btn" id="dmPost" type="button">Post to the board</button>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="cardhead"><b>My posts</b>
        <span class="chip">${mine.filter(d => d.status !== 'closed').length} open</span></div>
      ${mine.length ? mine.map(d => {
        const rs = responsesFor(d.id);
        const committed = rs.reduce((s, r) => s + (r.qtyQtl || 0), 0);
        const closed = d.status === 'closed';
        return `<div class="dmcard ${closed ? 'closed' : ''}">
          <div class="dmhead">
            <b>${label(d.crop)} · ${d.qtyQtl} qtl</b>
            <span class="chip ${closed ? '' : 'reported'}">${closed ? 'closed' : 'open'}</span>
            <span class="dmrate">up to ${money(d.maxPrice)}/qtl</span>
          </div>
          <div class="statlabel">Needed ${when(d)} (${esc(d.needBy)})${d.note ? ` · “${esc(d.note)}”` : ''}</div>
          <div class="dmcommitted">${committed
            ? `<b>${committed} qtl promised</b> by ${rs.length} farmer${rs.length > 1 ? 's' : ''}`
            : 'No farmer has committed yet.'}</div>
          ${rs.length ? `<table class="minitable dmtab">
            ${rs.map(r => `<tr>
              <td><b>${esc(r.name)}</b>${r.village ? ` <span class="statlabel">${esc(r.village)}</span>` : ''}</td>
              <td>${r.qtyQtl} qtl</td>
              <td>${money(r.price)}/qtl</td>
              <td>${r.phone ? `<a href="https://wa.me/${String(r.phone).replace(/\D/g, '')}" target="_blank" rel="noopener">WhatsApp</a>` : '—'}</td>
            </tr>`).join('')}
          </table>` : ''}
          <div class="dmbtns">
            ${closed ? '' : `<button class="btn ghost small" data-close="${esc(d.id)}" type="button">Close this demand</button>`}
            ${d.sample ? '' : `<button class="btn ghost small" data-share="${esc(d.id)}" type="button">📲 Share</button>`}
          </div>
        </div>`;
      }).join('') : `<p class="statlabel">Nothing posted yet. Your first demand will show here with the
        farmers who committed to it.</p>`}
    </div>`;

  const err = document.getElementById('dmErr');
  document.getElementById('dmPost').onclick = async () => {
    const btn = document.getElementById('dmPost');
    btn.disabled = true;
    const r = await postDemand({
      crop: document.getElementById('dmCrop').value,
      qtyQtl: document.getElementById('dmQty').value,
      maxPrice: document.getElementById('dmPrice').value,
      needBy: document.getElementById('dmDate').value,
      note: document.getElementById('dmNote').value
    });
    btn.disabled = false;
    if (!r.ok){
      err.innerHTML = esc(r.error) + (r.needAuth ? ` <button class="btn small" type="button" data-signin>Sign in</button>` : '');
      if (r.needAuth) wireSignIn(v);
      return;
    }
    toast(r.queued
      ? (r.reason === 'auth'
          ? 'Is phone par post hua. Farmers tak pahunchane ke liye Sign in karo.'
          : 'Posted on this phone — it will reach farmers when you are online')
      : 'Posted — farmers near your gate can see it now');
    renderDemand();
  };

  v.querySelectorAll('[data-close]').forEach(b => b.onclick = async () => {
    await closeDemand(b.dataset.close);
    toast('Demand closed — farmers see it as filled');
    renderDemand();
  });
  v.querySelectorAll('[data-share]').forEach(b => b.onclick = async () => {
    const d = demandById(b.dataset.share);
    if (d) await shareText(demandText(d, { cropLabel: CROPS?.[d.crop]?.label || d.crop }));
  });
}

// ---------------------------------------------------------------- farmer side
function renderFarmer(v){
  const crop = state.season?.crop || null;
  const all = openDemands();
  const forMe = crop ? all.filter(d => d.crop === crop) : all;
  // Nothing real on the board yet. A brand-new board would read as a broken
  // screen, so show three clearly-labelled examples of what a post looks like —
  // and say plainly that nobody is actually buying through them.
  const isSample = !all.length;
  const shown = isSample ? sampleDemands(crop) : (forMe.length ? forMe : all);
  const mine = myResponses().slice().sort((a, b) => (b.at || 0) - (a.at || 0));

  v.innerHTML = `
    <h2>Demand board ${isSample ? '<span class="chip demo">SAMPLE</span>' : ''}</h2>
    <p class="sub">Mandi desks and traders post what they need. Commit your quintals before you
      load the tractor — a written commitment is better than a phone call.</p>

    ${!isSample && !state.user?.uid ? `<div class="caveat" style="margin:0 0 14px">
      Board public hai — padhne ke liye account nahi chahiye. Par <b>commit karne ke liye
      Sign in</b> karna padega, warna dusra phone aapka reply nahi dekh payega.
    </div>` : ''}

    ${isSample ? `<div class="caveat" style="margin:0 0 14px">
      <b>Ye sirf namoone hain (sample).</b> Abhi koi asli mandi desk board par nahi hai — neeche
      dikh raha har post ek udaharan hai, asli sauda nahi. Jab koi desk post karega, wahi yahan
      asli board ki tarah dikhega.
    </div>` : ''}

    ${shown.length ? shown.map(d => {
      const rs = responsesFor(d.id);
      const committed = rs.reduce((s, r) => s + (r.qtyQtl || 0), 0);
      const left = Math.max(0, d.qtyQtl - committed);
      const open = FORM_OPEN === d.id;
      const already = mine.some(r => r.demandId === d.id);
      return `<div class="card dmcard ${d.sample ? 'dmsample' : ''}">
        <div class="dmhead">
          <b>${esc(d.deskName)}${d.district ? `, ${esc(d.district)}` : ''}</b>
          <span class="chip ${d.sample ? 'demo' : 'reported'}">${d.sample ? 'EXAMPLE' : 'BUYING'}</span>
          <span class="dmrate">up to ${money(d.maxPrice)}/qtl</span>
        </div>
        <div class="dmmain">${label(d.crop)} · <b>${d.qtyQtl} quintals</b> · needed ${when(d)}
          ${d.note ? `<div class="statlabel">“${esc(d.note)}”</div>` : ''}
          <div class="statlabel">${committed ? `${committed} qtl already promised · ` : ''}${left} qtl still open</div>
        </div>
        <div class="dmbtns">
          <button class="btn small" data-supply="${esc(d.id)}" type="button"
            ${d.sample || left <= 0 || already ? 'disabled' : ''}>
            ${d.sample ? 'Sample post' : already ? 'You replied ✓' : left <= 0 ? 'Fully committed' : 'I can supply'}</button>
          ${d.sample ? '' : `<button class="btn ghost small" data-share="${esc(d.id)}" type="button">📲 Share</button>`}
        </div>
        ${d.sample ? '' : `<div class="supply ${open ? 'on' : ''}" id="sup-${esc(d.id)}">
          <div class="wf2">
            <label>Quintals I can bring<input id="sq-${esc(d.id)}" type="number" min="1" max="${left || d.qtyQtl}" step="1" placeholder="e.g. 20"></label>
            <label>My price ₹/qtl<input id="sp-${esc(d.id)}" type="number" min="100" step="1" value="${d.maxPrice}"></label>
          </div>
          <label>Name the desk should note<input id="sn-${esc(d.id)}" type="text" value="${esc(state.profile?.name || '')}" placeholder="your name"></label>
          <p class="statlabel" id="se-${esc(d.id)}" style="color:var(--red)"></p>
          <button class="btn" data-send="${esc(d.id)}" type="button">Send my commitment</button>
        </div>`}
      </div>`;
    }).join('') : `<div class="empty">No desk is buying right now.<br><br>
      <span class="caveat" style="display:inline-block">Set a price alert in <b>Alerts</b> — you will
      hear the moment your crop's rate crosses your number.</span></div>`}

    <div class="card" style="margin-top:14px">
      <b>My replies</b>
      ${mine.length ? `<table class="minitable">
        ${mine.map(r => `<tr>
          <td>${esc(r.deskName)}<div class="statlabel">${label(r.demandCrop)}</div></td>
          <td>${r.qtyQtl} qtl</td>
          <td>${money(r.price)}/qtl</td>
        </tr>`).join('')}
      </table>` : `<p class="statlabel">Nothing yet. When you commit, the desk sees your name,
        quintals and price — and you keep the same record here.</p>`}
    </div>`;

  v.querySelectorAll('[data-supply]').forEach(b => b.onclick = () => {
    FORM_OPEN = FORM_OPEN === b.dataset.supply ? null : b.dataset.supply;
    renderDemand();
  });
  v.querySelectorAll('[data-send]').forEach(b => b.onclick = async () => {
    const id = b.dataset.send;
    const r = await respond(id, {
      name: document.getElementById(`sn-${id}`)?.value,
      qtyQtl: document.getElementById(`sq-${id}`)?.value,
      price: document.getElementById(`sp-${id}`)?.value
    });
    const err = document.getElementById(`se-${id}`);
    if (!r.ok){
      if (err) err.innerHTML = esc(r.error) + (r.needAuth ? ` <button class="btn small" type="button" data-signin>Sign in</button>` : '');
      if (r.needAuth) wireSignIn(v);
      return;
    }
    FORM_OPEN = null;
    toast(r.queued
      ? (r.reason === 'auth'
          ? 'Is phone me saved. Cloud par bhejne ke liye pehle Sign in karo.'
          : 'Saved on this phone — the desk gets it when you are online')
      : 'Sent — the desk sees your commitment now');
    renderDemand();
  });
  v.querySelectorAll('[data-share]').forEach(b => b.onclick = async () => {
    const d = demandById(b.dataset.share);
    if (d) await shareText(demandText(d, { cropLabel: CROPS?.[d.crop]?.label || d.crop }));
  });
}

// A one-line strip for the Sell screen: the best open offer for this crop.
export function demandStripHTML(){
  const crop = state.season?.crop;
  if (!crop) return '';
  const d = openDemands({ crop })
    .sort((a, b) => b.maxPrice - a.maxPrice)[0];
  if (!d) return '';
  return `<div class="wshint dmstrip">
    <b>${esc(d.deskName)} is buying ${label(crop)}</b>
    <span>${d.qtyQtl} qtl needed ${when(d)} · up to ${money(d.maxPrice)}/qtl</span>
    <button class="btn ghost small" type="button"
      onclick="document.querySelector('[data-view=demand]').click()">Reply →</button>
  </div>`;
}
