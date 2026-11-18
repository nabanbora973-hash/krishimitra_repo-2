// Gemini assistant — grounded in THIS farm's context (the difference between
// "a chatbot" and KrishiMitra's assistant). Fails over to rule-based guidance.
import { state } from "./state.js";

// Farmer-typed text must never be parsed as markup (live XSS test, 2026-11-08).
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
import { GEMINI_API_KEY, GEMINI_MODEL, CHAT_PROXIES } from "./config.js";
import { CROPS } from "./crops.js";
import { buildGuidance } from "./guidance.js";
import { toast } from "./ui.js";
import { answerLocally, contextSnapshot } from "./assistant-local.js";
import { listenOnce, voiceInputSupported, speak, speakable } from "./voice.js";

const URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Is a real key configured (vs the PASTE_ placeholder)?
function keyConfigured(){
  return !!GEMINI_API_KEY && !GEMINI_API_KEY.startsWith('PASTE');
}

// Where do answers come from?
//   'proxy'  → our worker holds the key (the only safe option on a public site)
//   'direct' → a key pasted into config.js (local development only)
//   'local'  → no AI at all; the rules engine answers from this farm's numbers
export function aiMode(){
  if (CHAT_PROXIES && CHAT_PROXIES.length) return 'proxy';
  if (keyConfigured()) return 'direct';
  return 'local';
}

function buildContext(){
  const p = state.profile || {};
  const s = state.season || {};
  const crop = CROPS[s.crop];
  const w = state.weather?.data;
  const wx = w ? {
    current: `${Math.round(w.current.temperature_2m)}°C, humidity ${w.current.relative_humidity_2m}%`,
    next3: (w.daily.precipitation_probability_max || []).slice(0, 3).map(x => (x ?? 0) + '%').join(', '),
    maxT: Math.round(Math.max(...(w.daily.temperature_2m_max || []).slice(0, 3).map(x => x ?? 0)))
  } : null;
  const mk = (state.markets || []).slice(0, 4)
    .map(m => `${m.name}: ₹${m.price}/qtl, ${m.distanceKm} km, net ₹${m.netPerQtl}/qtl`).join('; ');

  const srcLabel = (state.markets || []).some(m => m.live) ? 'aaj ka sarkari data' : 'prototype ka demo data';

  // A short prompt on purpose. Earlier this was a list of "STRICT RULES", which
  // made the assistant sound like a form and answer like a lawyer. What a farmer
  // wants is someone who knows his crop and his village and talks straight.
  // The farm data is the only thing that has to be in here — everything else is
  // best left to the model, which already knows farming.
  return `You are KrishiMitra — a friendly farm advisor in Assam, India. You help farmers with their crops, soil, seed, pests, weather, storage and where to sell.

Here is this farmer's own data for today. Use it when it is relevant to what he asks:
- Farm: ${p.acres ?? '?'} acres, soil ${p.soil ?? '?'}, irrigation ${p.irrigation ?? '?'}, village ${p.village ?? '?'}
- Crop this season: ${crop ? crop.label : s.crop ?? 'not set'}${s.variety ? ' (' + s.variety + ')' : ''}, stage ${s.stage ?? '?'}, about ${s.quantityQtl ?? '?'} quintals, sown ${s.sowingDate ?? '?'}
- Weather: ${wx ? `${wx.current}, next 3 days rain ${wx.next3}, max ${wx.maxT}°C` : 'not loaded'}
- Mandi rates: ${mk || 'not loaded'} (${srcLabel})

Talk like a person, in the same language and script the farmer writes in (Hindi, Assamese or English). Keep it short — a few sentences. If you don't know something or the data isn't there, just say so and tell him what to check instead.`;
}

export async function askGemini(question){
  // Preferred path: our relay. No key in this file, nothing for a visitor to copy.
  // Each relay is tried in turn — the first one that answers with a real reply
  // wins, so a single dead deployment cannot take the assistant down with it.
  if (CHAT_PROXIES && CHAT_PROXIES.length){
    let lastErr = null;
    for (const base of CHAT_PROXIES){
      try {
        const r = await fetch(String(base).replace(/\/+$/, '') + '/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ system: buildContext(), messages: [{ role: 'user', content: question }] })
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.status === 'ok' && j.text) return String(j.text).trim();
        lastErr = new Error(j.message || ('chat proxy HTTP ' + r.status));
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('No relay answered');
  }
  // Local development only — a key literally in the page. Never deploy like this.
  const body = {
    systemInstruction: { parts: [{ text: buildContext() }] },
    contents: [{ role: 'user', parts: [{ text: question }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 350 }
  };
  const r = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error('Gemini HTTP ' + r.status);
  const j = await r.json();
  const text = j.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
  if (!text) throw new Error('Empty response from Gemini');
  return text.trim();
}

// ---------- Chat UI ----------
const QUICK = [
  'Should I sell my crop this week?',
  'What does the rain forecast mean for my crop?',
  'Which market is best for me today?'
];

export function renderAssistant(){
  const v = document.getElementById('view-assistant');
  v.innerHTML = `
    <h2>Ask KrishiMitra ${aiMode() === 'local' ? '<span class="chip demo" style="vertical-align:middle">LOCAL</span>' : '<span class="chip" style="vertical-align:middle">AI</span>'}</h2>
    <p class="sub">${aiMode() === 'local'
      ? 'Answers are computed on this device from your crop, village, weather and the ranked mandi list — no API key, no internet call.'
      : aiMode() === 'proxy'
        ? 'Answers come from Gemini through our own server — the key stays on the server, your farm details are sent only with the question you type.'
        : 'Answers use your farm, your crop and today\'s weather and market context.'}</p>
    <div class="ctxstrip" id="ctxstrip"></div>
    <div class="quick">
      ${QUICK.map(q => `<button data-q="${q}">${q}</button>`).join('')}
    </div>
    <div id="chatlog"></div>
    <div class="chatrow">
      <input id="chatInput" placeholder="Ask about your crop, weather or markets…">
      <button class="btn ghost" id="chatMic" ${voiceInputSupported() ? '' : 'disabled title="Is browser me voice nahi"'} aria-label="Bol ke poochho">🎤</button>
      <button class="btn" id="chatSend">Ask</button>
    </div>
    <div class="caveat">AI-assisted interpretation only — decision support, not a guarantee. If the assistant is unavailable,
    you'll be shown your rule-based guidance instead.</div>`;

  const log = document.getElementById('chatlog');
  const input = document.getElementById('chatInput');

  // Show, in one line, exactly which farm the answers are about — so it is obvious
  // that the reply is not a canned block.
  const strip = document.getElementById('ctxstrip');
  const paintCtx = () => {
    const c = contextSnapshot();
    strip.innerHTML = c.cropKey
      ? `<b>${c.quantityQtl ? c.quantityQtl + ' qtl ' : ''}${esc(c.cropLabel)}</b> · ${esc(c.stage) || 'stage unknown'}
         · ${esc(c.village) || 'village not set'}${c.best ? ` · best: ${esc(c.best.name)} ${'₹' + Math.round(c.best.net).toLocaleString('en-IN')}/qtl` : ''}`
      : '<b>No crop set</b> · register your farm or open Season &amp; Crop to get real answers';
  };
  paintCtx();
  window.kmRepaintAssistant = paintCtx;   // let the router refresh this line

  const addMsg = (text, cls) => {
    const div = document.createElement('div');
    div.className = 'msg ' + cls;
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    return div;
  };

  async function send(q){
    if (!q || !q.trim()) return;
    input.value = '';
    addMsg(q, 'user');

    // No Gemini key configured → the built-in assistant answers from this farm's
    // own numbers (crop, stage, quantity, village, weather, ranked markets).
    // Same input, same farm → same answer; change the crop or village and it changes.
    if (aiMode() === 'local'){
      const { text } = answerLocally(q);
      addMsg(text, 'ai');
      return;
    }

    const pending = addMsg('Thinking…', 'sys');
    try {
      const answer = await askGemini(q);
      pending.remove();
      addMsg(answer, 'ai');
    } catch (e) {
      pending.remove();
      addMsg(answerLocally(q).text, 'ai');
      // Say which of the two things happened — "the model is down" and "the key
      // was never set on the server" look identical to a farmer otherwise.
      const notOn = /not switched on|no_key/i.test(e.message || '');
      addMsg(notOn
        ? '(AI abhi server par on nahi hua (key nahi hai) — yeh jawab app ke apne rules engine se aaya hai, aapke farm ke numbers par.)'
        : '(AI ne jawab nahi diya — yeh jawab app ke apne rules engine se aaya hai, aapke farm ke numbers par.)', 'sys');
      toast(notOn ? 'AI abhi on nahi — farm ke numbers se jawab diya' : 'AI unavailable — answered from your farm data instead');
      console.warn('Gemini error:', e.message);
    }
  }

  document.addEventListener('km:data-changed', paintCtx);
  document.getElementById('chatSend').onclick = () => send(input.value);

  // ---- speak the question ----
  const mic = document.getElementById('chatMic');
  if (mic) mic.onclick = async () => {
    if (mic.dataset.on === '1') return;
    mic.dataset.on = '1'; mic.textContent = '●';
    const placeholder = input.placeholder;
    input.placeholder = 'Sun rahe hain…';
    const r = await listenOnce();
    mic.dataset.on = '0'; mic.textContent = '🎤';
    input.placeholder = placeholder;
    if (r.text){ input.value = r.text; send(r.text); }
    else if (r.error && r.error !== 'unsupported'){
      addMsg(r.error === 'not-allowed'
        ? 'Microphone permission band hai — browser settings me allow karo.'
        : 'Awaaz samajh nahi aayi — dobara koshish karo.', 'sys');
    }
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') send(input.value); });
  v.querySelectorAll('.quick button').forEach(b => b.onclick = () => send(b.dataset.q));
}

// ---- inspection hook -------------------------------------------------------
// Lets a judge (or the test suite) ask the assistant directly and see the exact
// farm context it answered from. Nothing in the UI depends on it.
if (typeof window !== 'undefined'){
  window.kmAssistant = {
    answer: (question, ctx) => answerLocally(question, ctx),
    context: () => contextSnapshot()
  };
}
