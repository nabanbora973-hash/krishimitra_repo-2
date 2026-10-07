// UI helpers: router, badges, toast, formatting, states. No imports.
export function show(viewId){
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById('view-' + viewId);
  if (el) el.classList.add('active');
  document.querySelectorAll('.navbtn').forEach(b =>
    b.classList.toggle('on', b.dataset.view === viewId));
  window.scrollTo({ top: 0 });
}

export function hideApp(){ document.getElementById('app').style.display = 'none'; }
export function showApp(){ document.getElementById('app').style.display = 'block'; }
export function setDemoBanner(on){
  document.getElementById('demobanner').style.display = on ? 'block' : 'none';
}
// Same banner, but with text we can update once we know where prices came from.
export function setDemoBannerText(html){
  const el = document.getElementById('demobanner');
  if (!el) return;
  el.innerHTML = html;
  el.style.display = 'block';
}
export function setUserChip(text){ document.getElementById('userchip').textContent = text || ''; }

export const liveBadge = () => '<span class="chip live">LIVE</span>';
export const demoBadge = () => '<span class="chip demo">DEMO</span>';

export function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('on'), 2600);
}

export function loadingHTML(text = 'Loading…'){ return `<p class="loading">${text}</p>`; }
export function errorHTML(msg){
  return `<div class="errorbox">${msg}</div>`;
}
export function emptyHTML(msg){ return `<div class="empty">${msg}</div>`; }

// ---- formatting ----
export const rupees   = n => '₹' + Math.round(n).toLocaleString('en-IN');
export const rupees1  = n => '₹' + (Math.round(n * 10) / 10).toLocaleString('en-IN');
export const pct      = n => (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
export const qtl      = n => n + ' qtl';

export function timeAgo(ts){
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return mins + 'm ago';
  const h = Math.floor(mins / 60);
  if (h < 24)     return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}
export const clockStr = ts => new Date(ts).toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'});

export const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// "What's next" roadmap — shown at the bottom of the Dashboard.
export function roadmapCardHTML(){
  const items = [
    ["LIVE market feeds", "AGMARKNET / data.gov.in daily prices — connected, with weekly history build-up"],
    ["Storage + transport", "partner rates for cold storage and shared transport to the mandi"],
    ["Voice + local languages", "Assamese · Bengali · Hindi — ask by voice, hear the answer"],
    ["IoT crop sensing", "soil moisture and storage temperature feeding the same decision engine"]
  ];
  return `
    <div class="card" style="margin-top:14px">
      <b style="color:var(--green)">What's next</b>
      <div class="statlabel" style="margin-top:4px">Built to grow with the farmer</div>
      <div class="roadmap">
        ${items.map(([t, d]) => `<div class="rmitem"><span class="chip ${t.startsWith("LIVE") ? "live" : "demo"}">${t.startsWith("LIVE") ? "LIVE" : "NEXT"}</span><div><b>${t}</b><div class="dim">${d}</div></div></div>`).join("")}
      </div>
    </div>`;
}
