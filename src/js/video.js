// Demo-video feature: adds a "▶ Watch demo" button to the topbar and a
// lightweight modal player (<video>). Works in BOTH builds:
//   • hosted / multi-file site  → plays media/demo.mp4
//   • single-file double-click  → plays media/demo.mp4 when that folder sits
//     next to the HTML file; otherwise shows an honest "file not found" note.
// No external services, no YouTube embed — the video ships with the project,
// which keeps the offline demo laptop working with no internet.

const VIDEO_SRC = 'media/demo.mp4';
const POSTER    = 'media/poster.jpg';

// ---------- modal player (built once, on demand) ----------
function buildModal(){
  if (document.getElementById('videoModal')) return;

  const wrap = document.createElement('div');
  wrap.id = 'videoModal';
  wrap.className = 'vmodal';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-label', 'KrishiMitra demo video');
  wrap.innerHTML = `
    <div class="vmodal-box">
      <button class="vmodal-close" id="videoClose" aria-label="Close video">✕</button>
      <video id="demoVideo" controls playsinline preload="metadata" poster="${POSTER}">
        <source src="${VIDEO_SRC}" type="video/mp4">
      </video>
      <div class="vmodal-missing" id="videoMissing" style="display:none">
        <b>Demo video file not found.</b>
        Keep the <code>media</code> folder (containing <code>demo.mp4</code>) next to this page,
        or open the hosted version of the site.
      </div>
      <div class="vmodal-note">
        <b>KrishiMitra walkthrough</b> · 2 min 15 s
        <span class="vsep">·</span>
        <a href="${VIDEO_SRC}" download>Download the video</a>
        <span class="dim">Prices shown are ILLUSTRATIVE DEMO DATA.</span>
      </div>
    </div>`;
  document.body.appendChild(wrap);

  const video = wrap.querySelector('#demoVideo');
  const missing = wrap.querySelector('#videoMissing');

  const showMissing = () => {
    missing.style.display = 'block';
    video.style.display = 'none';
  };
  video.addEventListener('error', showMissing);
  const srcEl = video.querySelector('source');
  if (srcEl) srcEl.addEventListener('error', showMissing);

  wrap.querySelector('#videoClose').onclick = closeVideo;
  wrap.addEventListener('click', e => { if (e.target === wrap) closeVideo(); });
}

export function openVideo(){
  buildModal();
  const m = document.getElementById('videoModal');
  m.classList.add('open');
  document.body.classList.add('noscroll');
  const v = document.getElementById('demoVideo');
  if (v && v.style.display !== 'none'){
    const p = v.play();
    if (p && p.catch) p.catch(() => {});   // autoplay policy — user can press play
  }
}

export function closeVideo(){
  const m = document.getElementById('videoModal');
  if (!m) return;
  m.classList.remove('open');
  document.body.classList.remove('noscroll');
  const v = document.getElementById('demoVideo');
  if (v) v.pause();
}

// ---------- inline card for the Dashboard ----------
export function videoCardHTML(){
  return `
    <div class="vcard" onclick="window.kmOpenVideo && window.kmOpenVideo()" role="button" tabindex="0">
      <img class="vthumb" src="${POSTER}" alt="" onerror="this.style.display='none'">
      <div class="vmeta">
        <b>See KrishiMitra in action</b>
        <span class="dim">2-minute walkthrough — sell decision, market comparison, alerts &amp; recent sales.</span>
      </div>
      <span class="btn orange small vplay">▶ Watch demo</span>
    </div>`;
}

// ---------- topbar button + global hook ----------
function injectButton(){
  const bar = document.getElementById('topbar');
  if (!bar || document.getElementById('demoVideoBtn')) return;
  const btn = document.createElement('button');
  btn.id = 'demoVideoBtn';
  btn.className = 'btn orange small';
  btn.type = 'button';
  btn.textContent = '▶ Watch demo';
  btn.onclick = openVideo;
  const anchor = document.getElementById('installBtn');
  if (anchor && anchor.parentNode === bar) bar.insertBefore(btn, anchor);
  else bar.appendChild(btn);
}

window.kmOpenVideo = openVideo;
window.kmCloseVideo = closeVideo;

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeVideo(); });

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectButton);
else injectButton();

// Topbar is static HTML, but re-check once the app is shown (belt & braces).
document.addEventListener('km:app-shown', injectButton);
