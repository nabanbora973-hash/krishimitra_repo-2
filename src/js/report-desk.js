// ============================================================================
//  MANDI REPORT DESK  —  the screen a mandi / trader sees instead of a verdict
// ----------------------------------------------------------------------------
//  The desk answers one question a day, per crop: "aaj ka rate kya hai?"
//  That answer becomes the farmer's price at that gate, carried by Firestore.
//
//  A trader at the gate will not walk through a five-screen form, so this is one
//  card, one number, one button.
// ============================================================================
import { state } from './state.js';
import { CROPS } from './crops.js';
import { toast } from './ui.js';
import { isMandi, myMandi, MANDI } from './roles.js';
import { submitReport, removeReport, allReports, istToday, reportStatusLine,
         seedBoardFromDevice, pullReportsFromCloud, reportFor,
         reportsForCrop, pendingWrites, flushPending, SUPPORTED_CROPS } from './mandi-feed.js';
import { compressImage, dataUrlBytes, MAX_PHOTO_BYTES } from './photo.js';
import { leaderboard, trustFor, trustText, rateHistory, sparkline } from './trust.js';
import { rateMessage, shareText } from './share.js';
import { mandiAt } from './map.js';
import { gateSnapshot, gateText, gateThreshold, setGateThreshold, gateAlertsOn,
         setGateAlerts, gateAlert } from './gate-watch.js';
import { notify } from './rate-alerts.js';
import { openDemands, myDemands } from './demand.js';
import { todayPurchases, purchaseTotals } from './purchases.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rupees = n => (n == null ? '—' : '₹' + Number(n).toLocaleString('en-IN'));
// Report timestamps are stored as epoch ms; the desk reads them in IST.
const clock = ts => {
  if (!ts) return '';
  const d = new Date(ts + 5.5 * 3600e3);
  let h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  const ap = h < 12 ? 'AM' : 'PM';
  h = h % 12 || 12;
  return `${h}:${m} ${ap} IST`;
};

const draft = { crop: 'paddy', modal: '', min: '', max: '', note: '', photo: null };

const cloudOn = () => !state.demo && !!state.user?.uid && state.user.uid !== 'demo';

export function renderReportDesk(){
  const v = document.getElementById('view-dashboard');
  if (!v || !isMandi()) return;

  seedBoardFromDevice();
  const m = myMandi();
  const mine = allReports().filter(r => r.date === istToday() &&
    ((r.mandiId && r.mandiId === m.id) || r.mandiName === m.name));
  const loaded = Object.keys(CROPS || {}).filter(k => SUPPORTED_CROPS.includes(k));
  const crops = loaded.length ? loaded : SUPPORTED_CROPS;
  if (!crops.includes(draft.crop)) draft.crop = crops[0];
  const posted = new Set(mine.map(r => r.crop));

  v.innerHTML = `
    <h2>Report desk <span class="chip reported">MANDI</span></h2>
    <p class="sub">You are reporting for <b>${esc(m.name || 'your mandi')}</b>${m.district ? `, ${esc(m.district)}` : ''}.
      Every rate posted here is the price farmers near your gate see today.</p>
    ${pendingWrites() ? `<div class="syncbar">⏳ <b>${pendingWrites()}</b> rate${pendingWrites() > 1 ? 's' : ''}
      waiting to sync — they are saved on this phone and will upload on their own.
      <button class="btn ghost small" id="rdFlush" style="margin-left:8px">Try now</button></div>` : ''}

    ${bulkCardHTML(crops, posted, mine)}

    <div class="grid">
      <div class="card">
        <b style="color:var(--green)">Aaj ka rate batao</b>
        <p class="statlabel" style="margin:6px 0 10px">One crop at a time. Posting again for the same crop
          replaces today's rate — a correction, never a second price.</p>

        <label>Crop</label>
        <select id="rdCrop">
          ${crops.map(k => `<option value="${k}" ${draft.crop === k ? 'selected' : ''}>
             ${esc(CROPS?.[k]?.label || k)}${posted.has(k) ? ' ✓ posted' : ''}</option>`).join('')}
        </select>

        <label>Modal price — ₹ per quintal <span style="color:var(--red)">*</span></label>
        <input id="rdModal" inputmode="numeric" placeholder="e.g. 2310" value="${esc(draft.modal)}">

        <div class="row2">
          <div><label>Lowest</label><input id="rdMin" inputmode="numeric" placeholder="2250" value="${esc(draft.min)}"></div>
          <div><label>Highest</label><input id="rdMax" inputmode="numeric" placeholder="2360" value="${esc(draft.max)}"></div>
        </div>

        <label>Board ki photo (optional)</label>
        <div class="photorow">
          <input id="rdPhoto" type="file" accept="image/*" capture="environment">
          <span class="statlabel" id="rdPhotoInfo">Photo proof — farmers ko dikhega ki rate gate se aaya.</span>
        </div>
        <div id="rdPhotoPrev"></div>

        <label>Note for farmers (optional)</label>
        <input id="rdNote" maxlength="120" placeholder="e.g. moist paddy, weighbridge open till 4 pm" value="${esc(draft.note)}">

        <button class="btn" id="rdSubmit" style="width:100%;margin-top:12px">Post today's rate</button>
        <div class="herr" id="rdErr"></div>
        <p class="statlabel" style="margin-top:8px">
          ${cloudOn()
            ? '✓ Cloud on — a rate posted here reaches farmers on any phone, in seconds.'
            : 'This device only right now. <b>Sign in</b> to share it with farmers on other phones.'}
        </p>
      </div>

      <div class="card">
        <b style="color:var(--green)">Aaj tumne kya post kiya</b>
        <div style="margin-top:10px">
          ${mine.length ? mine.map(r => `
            <div class="rdrow">
              <div>
                <b>${esc(CROPS?.[r.crop]?.label || r.crop)}</b>
                <div class="statlabel">modal ${rupees(r.modal)}${r.min && r.max ? ` · ${rupees(r.min)}–${rupees(r.max)}` : ''}
                  · ${clock(r.at)}</div>
                ${r.note ? `<div class="statlabel dim">“${esc(r.note)}”</div>` : ''}
              </div>
              <button class="btn ghost small" data-del="${esc(r.crop)}">Remove</button>
            </div>`).join('')
            : '<p class="empty">Nothing posted yet today. The first rate is the one that matters.</p>'}
        </div>
        <div class="statlabel" style="margin-top:14px">
          <b>${mine.length}</b> of ${crops.length} crops posted today
        </div>
        <button class="btn ghost small" id="rdPull" style="margin-top:8px">
          ${cloudOn() ? 'Refresh from other mandis' : 'Cloud off in demo mode'}
        </button>
        <div class="statlabel" id="rdPullOut" style="margin-top:6px"></div>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <b style="color:var(--green)">What a farmer sees when you post</b>
      <div class="srclist" style="margin-top:10px">
        <div><span class="chip reported">REPORTED</span> ${esc(m.name || 'your mandi')} — today's rate, posted from this desk</div>
        <div><span class="chip live">LIVE</span> Weather at the farm — Open-Meteo</div>
        <div><span class="chip demo">RULES</span> Transport, net price and the sell verdict — calculated on the farmer's phone</div>
      </div>
      <p class="sourcenote" style="margin-top:10px">
        The app never relabels your figure as government data. Your mandi's name and the posting time travel
        with it, so a farmer can see exactly where the number came from.
      </p>
      ${reportStatusLine() ? `<p class="sourcenote">${reportStatusLine()}</p>` : ''}
    </div>

    ${historyCard(m)}
    ${trustCard(m)}

    <div class="card" style="margin-top:14px">
      <b style="color:var(--green)">Aaj doosri mandiyan kya keh rahi hain</b>
      <p class="statlabel" style="margin:6px 0 10px">A mandi does not drive anywhere to sell — what it
        needs is the competing rate. This is today's board, as posted by other gates.</p>
      ${leaderboardStrip(m)}
      ${competitorTable(m)}
    </div>

    ${gateCard(m)}
    ${deskShortcutsHTML()}

    <div class="card" style="margin-top:14px">
      <b style="color:var(--green)">Apna rate farmers ko bhejo</b>
      <p class="statlabel" style="margin:6px 0 10px">Aaj jo post kiya, wo seedha WhatsApp par bhej sakte ho —
        rate, range aur note ke saath.</p>
      <button class="btn small" id="rdShare">📲 WhatsApp par bhejo</button>
    </div>

    <div class="card" style="margin-top:14px">
      <b style="color:var(--green)">Why this matters</b>
      <p class="sourcenote" style="margin-top:8px">
        The government feed answers only Indian IPs and rate-limits fast. One mandi posting one rate a day is a
        price a farmer can act on — same day, same gate. Twenty mandis doing it covers a district.
      </p>
    </div>`;

  wireDesk(m, crops);

  // One nudge a day, only when another gate is genuinely ahead of this one.
  try {
    const snap = gateSnapshot({ markets: state.markets || [], myName: m.name });
    const alert = gateAlert(snap);
    if (alert){
      notify([{ crop: draft.crop, price: snap.bestOther.price, mandiName: snap.bestOther.name,
                direction: 'above' }]);
      toast(alert.title);
    }
  } catch (e){ console.warn('Gate watch failed:', e.message); }
}

// Today's board, highest first — the number a mandi actually competes on.
// Where my gate stands against every other gate the app can see. Small card,
// one sentence, because at 7am the desk wants a number, not a dashboard.
// ---------------------------------------------------------------------------
//  BULK ENTRY — a gate keeps one number per crop, not a five-field form.
//
//  The single-crop form below is right for a correction or a photo. But at 7 am
//  a trader has five crops on the board and two farmers waiting; tapping through
//  five screens is how a desk ends up empty and every farmer sees the same
//  week-old rate. So this card is one line per crop: type the number, hit one
//  button, done. Blank rows are skipped — never posted as zero.
// ---------------------------------------------------------------------------
function bulkCardHTML(crops, posted, mine){
  const rows = crops.map(k => {
    const prev = (mine || []).find(r => r.crop === k);
    return `<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--line-soft)">
      <div style="flex:1;min-width:0">
        <b style="font-size:15.5px">${esc(CROPS?.[k]?.label || k)}</b>
        ${prev ? `<span class="chip live" style="margin-left:6px">${rupees(prev.modal)}</span>` : ''}
      </div>
      <input class="bulkprice" data-crop="${k}" inputmode="numeric"
             placeholder="${prev ? 'badlo' : '₹/qtl'}"
             style="width:110px;margin:0;text-align:right;padding:8px 10px">
    </div>`;
  }).join('');
  return `<div class="card" id="bulkCard" style="margin-top:14px">
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px">
      <b style="color:var(--green)">Aaj ke saare rate — ek saath</b>
      <span class="statlabel">${posted.size}/${crops.length} ho gaya</span>
    </div>
    <p class="statlabel" style="margin:6px 0 8px">
      Jis fasal ka rate hai wahan number daalo, baaki khali chhod do. Ek button — sab post.
    </p>
    ${rows}
    <button class="btn" id="bulkPost" style="width:100%;margin-top:12px">Sab post karo</button>
    <div class="herr" id="bulkErr"></div>
    <p class="statlabel" style="margin-top:8px">
      Rate sirf aaj ke liye hai. Dobara daalne se aaj ka rate badal jayega — naya rate nahi banega.
    </p>
  </div>`;
}

function gateCard(m){
  const snap = gateSnapshot({ markets: state.markets || [], myName: m.name });
  const th = gateThreshold();
  const on = gateAlertsOn();
  return `
    <div class="card" style="margin-top:14px">
      <div class="cardhead">
        <b style="color:var(--green)">Aapka gate vs baaki</b>
        <span class="chip ${snap.position === 'behind' ? 'demo' : 'reported'}">
          ${snap.position === 'ahead' ? 'AHEAD' : snap.position === 'behind' ? 'BEHIND'
            : snap.position === 'level' ? 'LEVEL' : 'NO RATE YET'}</span>
      </div>
      <p class="statlabel" style="margin:6px 0 10px">${gateText(snap)}</p>
      <div class="gsnap">
        <div><div class="statlabel">Your rate</div><div class="stat">${snap.myRate != null ? '₹' + Math.round(snap.myRate).toLocaleString('en-IN') : '—'}</div></div>
        <div><div class="statlabel">${snap.bestOther ? snap.bestOther.name : 'Next gate'}</div>
          <div class="stat">${snap.bestOther ? '₹' + Math.round(snap.bestOther.price).toLocaleString('en-IN') : '—'}</div></div>
        <div><div class="statlabel">Gap</div>
          <div class="stat ${snap.diff != null && snap.diff < 0 ? 'orange' : ''}">${snap.diff == null ? '—' : (snap.diff >= 0 ? '+' : '−') + '₹' + Math.abs(Math.round(snap.diff)).toLocaleString('en-IN')}</div></div>
      </div>
      <div class="gset">
        <label class="wscheck"><input type="checkbox" id="gwOn" ${on ? 'checked' : ''}> Tell me once a day when I fall behind</label>
        <label class="wscheck">By more than ₹<input type="number" id="gwTh" min="10" max="500" step="10" value="${th}" style="width:80px"> /qtl</label>
      </div>
    </div>`;
}

// Two things the desk does every day, one tap away from the desk screen.
function deskShortcutsHTML(){
  const demands = myDemands().filter(d => (d.status || 'open') === 'open');
  const open = openDemands();
  const t = purchaseTotals(todayPurchases());
  return `
    <div class="grid" style="margin-top:14px">
      <div class="card">
        <b style="color:var(--green)">Demand board</b>
        <p class="statlabel" style="margin:6px 0 10px">${demands.length
          ? `<b>${demands.length}</b> open post${demands.length > 1 ? 's' : ''} · ${open.length} on the board in all`
          : 'No open demand — post what you need and farmers commit quintals.'}</p>
        <button class="btn small" id="rdGoDemand" type="button">Open demand board →</button>
      </div>
      <div class="card">
        <b style="color:var(--green)">Buy list</b>
        <p class="statlabel" style="margin:6px 0 10px">${t.count
          ? `Today: <b>${t.qty} qtl</b> from ${t.farmers} farmer${t.farmers === 1 ? '' : 's'} · ${'₹' + Math.round(t.net).toLocaleString('en-IN')} payable`
          : 'No lots yet today. Each entry gives the farmer a slip.'}</p>
        <button class="btn small" id="rdGoBuy" type="button">Open buy list →</button>
      </div>
    </div>`;
}

function historyCard(m){
  const crop = draft.crop;
  const pts = rateHistory(m.id, crop, 30, m.name);
  const label = CROPS?.[crop]?.label || crop;
  if (pts.length < 2){
    return `<div class="card" style="margin-top:14px">
      <b style="color:var(--green)">${esc(label)} — pichhle 30 din</b>
      <p class="empty" style="margin-top:8px">Abhi ${pts.length} din ka data hai. Roz post karte raho —
        graph apne aap banta jaayega (2 din se shuru).</p>
    </div>`;
  }
  const first = pts[0].price, last = pts[pts.length - 1].price;
  const change = Math.round(((last - first) / (first || 1)) * 100);
  return `<div class="card" style="margin-top:14px">
    <div class="cardhead"><b style="color:var(--green)">${esc(label)} — pichhle 30 din</b>
      <span class="${change >= 0 ? 'pos' : 'neg'}">${change >= 0 ? '+' : ''}${change}%</span></div>
    <p class="statlabel" style="margin:4px 0 8px">${pts.length} din ka apna rate · ₹${first} → ₹${last}</p>
    ${sparkline(pts.map(p => ({ ...p, price: p.price })), { w: 260, h: 54 })}
  </div>`;
}

// How reliably this gate reports — the thing a farmer should judge it on.
function trustCard(m){
  const t = trustFor(m.id, m.name);
  const days = new Set(allReports().map(r => r.date)).size;
  return `<div class="card" style="margin-top:14px">
    <b style="color:var(--green)">Reporting trust</b>
    <div class="grid" style="margin-top:10px">
      <div><div class="statlabel">Is hafte</div>
        <div class="stat">${t.thisWeek}<span class="statlabel">/7 din</span></div></div>
      <div><div class="statlabel">Total din</div>
        <div class="stat">${days}</div></div>
      <div><div class="statlabel">Status</div>
        <div style="margin-top:6px"><span class="chip ${t.label === 'reliable' ? 'live' : 'demo'}">${t.label.toUpperCase()}</span></div></div>
    </div>
    <p class="statlabel" style="margin-top:10px">${esc(trustText(t))} — ye wahi hai jo farmer dekh sakta hai.</p>
  </div>`;
}

// Every other gate's price for the crop this desk trades most, side by side.
// Blank rows are honest: no report means no price, never a guess.
// The highest rate on the board today, whoever posted it.
function leaderboardStrip(m){
  const top = leaderboard(draft.crop, 3);
  if (!top.length) return '';
  return `<div class="leaderstrip">
    ${top.map(r => `<div class="leaditem ${r.mandiId === m.id ? 'me' : ''}">
      <span class="rank">#${r.rank}</span>
      <b>${esc(r.mandiName)}</b>
      <span class="pos">${rupees(r.modal)}</span>
    </div>`).join('')}
  </div>`;
}

function competitorTable(m){
  const crop = draft.crop;
  const all = reportsForCrop(crop);
  const others = all.filter(r => !((r.mandiId && r.mandiId === m.id) || r.mandiName === m.name));
  const mine = all.find(r => (r.mandiId && r.mandiId === m.id) || r.mandiName === m.name);
  if (!others.length && !mine) {
    return `<p class="empty">Kisi ne aaj ${esc(CROPS?.[crop]?.label || crop)} ka rate nahi daala.
      Pehla rate tumhara ho sakta hai.</p>`;
  }
  const rows = [...others, ...(mine ? [{ ...mine, _mine: true }] : [])]
    .sort((a, b) => (b.modal || 0) - (a.modal || 0));
  return `<div class="tablewrap"><table>
    <tr><th>Mandi</th><th>${esc(CROPS?.[crop]?.label || crop)} ₹/qtl</th><th>Range</th><th>Posted</th></tr>
    ${rows.map(r => `<tr class="${r._mine ? 'best' : ''}">
      <td><b>${esc(r.mandiName)}</b>${r._mine ? ' <span class="chip reported">YOU</span>' : ''}
        ${r.district ? `<div class="statlabel">${esc(r.district)}</div>` : ''}</td>
      <td class="pos">${rupees(r.modal)}</td>
      <td class="dim">${r.min && r.max ? rupees(r.min) + '–' + rupees(r.max) : '—'}</td>
      <td class="dim">${clock(r.at)}</td>
    </tr>`).join('')}
  </table></div>`;
}

// Bulk: one pass over the inputs, one report per filled row. Sequential on
// purpose — the cloud write is small and a burst of parallel writes on a 2-bar
// connection is how half the rates end up in the retry queue.
function wireBulk(m){
  const btn = document.getElementById('bulkPost');
  if (!btn) return;
  btn.onclick = async () => {
    const err = document.getElementById('bulkErr');
    if (err) err.textContent = '';
    const inputs = [...document.querySelectorAll('.bulkprice')];
    const filled = inputs
      .map(i => ({ crop: i.dataset.crop, raw: String(i.value || '').replace(/[^\d]/g, '') }))
      .filter(x => x.raw && Number(x.raw) > 0);
    if (!filled.length){
      if (err) err.textContent = 'Koi rate nahi daala — kam se kam ek fasal ka number likho.';
      return;
    }
    btn.disabled = true;
    const label = btn.textContent;
    let done = 0;
    for (const f of filled){
      btn.textContent = `Posting ${done + 1}/${filled.length}…`;
      try {
        await submitReport({
          mandiId: m.id, mandiName: m.name, district: m.district,
          crop: f.crop, modal: Number(f.raw), min: '', max: '',
          note: '', photo: null, reporter: state.profile?.name || ''
        });
        done++;
      } catch (e){
        if (err) err.textContent = `${f.crop}: ${e.message || 'post nahi hua'}`;
      }
    }
    btn.disabled = false;
    btn.textContent = label;
    if (done) toast(`${done} rate post ho gaya ✓`);
    renderReportDesk();
  };
}

function wireDesk(m, crops){
  wireBulk(m);
  const get = id => document.getElementById(id);

  // ---- gate watch controls
  const gwOn = get('gwOn');
  if (gwOn) gwOn.onchange = () => {
    setGateAlerts(gwOn.checked);
    toast(gwOn.checked ? 'A daily nudge when you fall behind — on' : 'Daily nudge off');
  };
  const gwTh = get('gwTh');
  if (gwTh) gwTh.onchange = () => {
    const t = setGateThreshold(gwTh.value);
    gwTh.value = t;
    toast(`Nudge when you are ₹${t}/qtl behind`);
  };

  // ---- one-tap routes into the two new desk screens
  const goDemand = get('rdGoDemand');
  if (goDemand) goDemand.onclick = () => document.querySelector('[data-view="demand"]')?.click();
  const goBuy = get('rdGoBuy');
  if (goBuy) goBuy.onclick = () => document.querySelector('[data-view="deskbuy"]')?.click();
  const catchDraft = () => {
    draft.crop  = get('rdCrop')?.value  || draft.crop;
    draft.modal = get('rdModal')?.value || '';
    draft.min   = get('rdMin')?.value   || '';
    draft.max   = get('rdMax')?.value   || '';
    draft.note  = get('rdNote')?.value  || '';
  };
  ['rdCrop', 'rdModal', 'rdMin', 'rdMax', 'rdNote'].forEach(id => {
    const el = get(id);
    if (el) el.addEventListener('change', catchDraft);
  });

  // ---- photo: compressed on the device before it is stored ----
  const photoEl = get('rdPhoto');
  if (photoEl) photoEl.onchange = async () => {
    const file = photoEl.files && photoEl.files[0];
    const info = get('rdPhotoInfo');
    const prev = get('rdPhotoPrev');
    if (!file) return;
    if (info) info.textContent = 'Photo chhoti kar rahe hain…';
    try {
      const out = await compressImage(file);
      if (dataUrlBytes(out.dataUrl) > MAX_PHOTO_BYTES){
        draft.photo = null;
        if (prev) prev.innerHTML = '';
        if (info) info.textContent = 'Photo bahut badi hai — dobara try karo.';
        return;
      }
      draft.photo = out.dataUrl;
      if (info) info.textContent = `✓ Photo ready — ${out.width}×${out.height}, ${Math.round(out.bytes / 1024)} KB`;
      if (prev) prev.innerHTML = `<img class="proofprev" src="${out.dataUrl}" alt="board photo preview">
        <button class="btn ghost small" id="rdPhotoClear" type="button">Hatao</button>`;
      const clr = get('rdPhotoClear');
      if (clr) clr.onclick = () => {
        draft.photo = null; photoEl.value = '';
        if (prev) prev.innerHTML = '';
        if (info) info.textContent = 'Photo proof — farmers ko dikhega ki rate gate se aaya.';
      };
    } catch (e){
      draft.photo = null;
      if (info) info.textContent = '✗ ' + e.message;
    }
  };

  const flushBtn = get('rdFlush');
  if (flushBtn) flushBtn.onclick = async () => {
    flushBtn.disabled = true; flushBtn.textContent = 'Sending…';
    const r = await flushPending();
    toast(r.sent ? `${r.sent} rate bhej diye ✓` : 'Abhi bhi cloud tak nahi pahunche — device par safe hain');
    renderReportDesk();
  };

  const shareBtn = get('rdShare');
  if (shareBtn) shareBtn.onclick = () => {
    const mineToday = allReports().find(r => r.date === istToday() && r.crop === draft.crop &&
      ((r.mandiId && r.mandiId === m.id) || r.mandiName === m.name));
    if (!mineToday) return toast('Pehle aaj ka rate post karo');
    shareText(rateMessage({
      mandiName: m.name, cropLabel: CROPS?.[mineToday.crop]?.label || mineToday.crop,
      modal: mineToday.modal, min: mineToday.min, max: mineToday.max,
      note: mineToday.note, date: istToday()
    }));
  };

  const btn = get('rdSubmit');
  if (btn) btn.onclick = async () => {
    catchDraft();
    const err = get('rdErr');
    if (err) err.textContent = '';
    btn.disabled = true; btn.textContent = 'Posting…';
    const res = await submitReport({
      mandiId: m.id, mandiName: m.name, district: m.district,
      crop: draft.crop, modal: draft.modal, min: draft.min, max: draft.max,
      note: draft.note, reporter: state.profile?.name || 'Mandi desk',
      photo: draft.photo
    });
    btn.disabled = false; btn.textContent = "Post today's rate";
    if (!res.ok){ if (err) err.textContent = res.error; return; }
    draft.modal = ''; draft.min = ''; draft.max = ''; draft.note = ''; draft.photo = null;
    toast(res.cloud
      ? 'Rate posted — farmers on other phones can see it ✓'
      : 'Rate saved on this phone and queued — it uploads when the cloud is reachable');
    renderReportDesk();
    document.dispatchEvent(new CustomEvent('km:data-changed'));
  };

  document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const crop = b.getAttribute('data-del');
    const rep = allReports().find(r => r.date === istToday() && r.crop === crop &&
      ((r.mandiId && r.mandiId === m.id) || r.mandiName === m.name));
    if (!rep) return;
    await removeReport(rep);
    toast("Today's rate removed");
    renderReportDesk();
  });

  const pull = get('rdPull');
  if (pull) pull.onclick = async () => {
    pull.disabled = true;
    const out = get('rdPullOut');
    if (out) out.textContent = 'Checking…';
    const r = await pullReportsFromCloud({ timeoutMs: 5000 });
    if (out) out.textContent = r.count
      ? `✓ ${r.count} report${r.count > 1 ? 's' : ''} pulled for today.`
      : (cloudOn() ? 'No reports from other mandis yet today.' : 'Demo mode — this device only.');
    pull.disabled = false;
    renderReportDesk();
  };
}

// The farmer-side check: what does the board say for a given crop and gate?
export const reportedPriceFor = (mandiName, crop, opts) => reportFor(mandiName, crop, opts);

export const ROLE_MANDI = MANDI;
