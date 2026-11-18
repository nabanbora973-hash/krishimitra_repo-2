// ============================================================================
//  FIELD FEEDBACK — one tap, no form, no account, no network needed to save.
//  During the farmer test the phone goes from hand to hand. What a farmer says
//  while holding it is worth more than any survey, and it is lost the moment the
//  phone comes back. So: one tap opens three big buttons, the answer is stored on
//  this device and shown to the tester (More → "Test feedback"), and it can be
//  copied in one tap to send on WhatsApp. Nothing leaves the phone on its own.
// ============================================================================
import { toast } from "./ui.js";
import { state } from "./state.js";

const KEY = "km_field_feedback";
const ls = () => { try { return (window.__kmSafeLS || localStorage); } catch { return { getItem: () => null, setItem() {} }; } };

export function loadFeedback(){
  try { return JSON.parse(ls().getItem(KEY) || "[]") || []; } catch { return []; }
}
function save(list){ try { ls().setItem(KEY, JSON.stringify(list.slice(0, 200))); } catch {} }

export function addFeedback(verdict, note){
  const list = loadFeedback();
  list.unshift({
    id: "f" + Date.now(),
    verdict, note: String(note || "").slice(0, 400),
    at: new Date().toISOString(),
    crop: state.season?.crop || state.profile?.crop || null,
    village: state.profile?.village || null,
    rate: (state.markets || [])[0]?.price ?? null
  });
  save(list);
  return list;
}

function sheetHTML(){
  return `
  <div id="fbSheet" class="card km-sheet" style="position:fixed;inset:auto 0 0 0;z-index:9999;margin:0;
       border-radius:20px 20px 0 0;box-shadow:0 -12px 40px rgba(0,0,0,.25);padding:18px 16px 26px;
       background:var(--surface);max-height:86vh;overflow:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <b style="font-size:18px;color:var(--green-900)">Kaisa laga?</b>
      <button id="fbClose" style="border:0;background:transparent;font-size:22px;line-height:1">×</button>
    </div>
    <div class="statlabel" style="margin-bottom:14px">Ek tap — bas. Kuch nahi likhna padega.</div>
    <button class="btn" id="fbGood" style="width:100%;margin-bottom:8px">Kaam ka laga</button>
    <button class="btn ghost" id="fbConfused" style="width:100%;margin-bottom:8px">Samajh nahi aaya</button>
    <button class="btn ghost" id="fbWrong" style="width:100%;margin-bottom:12px">Rate galat hai</button>
    <label class="statlabel" for="fbNote">Kuch kehna hai? (optional — bolein, main likh leta hoon)</label>
    <input id="fbNote" placeholder="e.g. 'meri mandi me 2300 chal raha hai'"
           style="width:100%;margin-top:6px;padding:12px;border:1px solid #DDEBE1;border-radius:12px">
    <button class="btn orange" id="fbSave" style="width:100%;margin-top:10px">Save</button>
  </div>`;
}

export function openFeedback(){
  if (document.getElementById("fbSheet")) return;
  const host = document.createElement("div");
  host.innerHTML = sheetHTML();
  document.body.appendChild(host.firstElementChild);
  const close = () => { document.getElementById("fbSheet")?.remove(); };
  document.getElementById("fbClose").onclick = close;
  const record = (verdict) => {
    const note = document.getElementById("fbNote")?.value || "";
    addFeedback(verdict, note);
    close();
    toast("Shukriya — note ho gaya");
  };
  document.getElementById("fbGood").onclick = () => record("good");
  document.getElementById("fbConfused").onclick = () => record("confused");
  document.getElementById("fbWrong").onclick = () => record("wrong");
  document.getElementById("fbSave").onclick = () => {
    const note = document.getElementById("fbNote")?.value || "";
    record(note.trim() ? "note" : "good");
  };
}

export function feedbackText(){
  const list = loadFeedback();
  if (!list.length) return "";
  const label = { good: "theek laga", confused: "samajh nahi aaya", wrong: "rate galat", note: "note" };
  return "KrishiMitra test feedback\n" + list.map(f =>
    `- ${new Date(f.at).toLocaleString("en-IN")} — ${label[f.verdict] || f.verdict}` +
    (f.village ? ` · ${f.village}` : "") +
    (f.crop ? ` · ${f.crop}` : "") +
    (f.rate ? ` · app ka rate ₹${Math.round(f.rate)}` : "") +
    (f.note ? `\n   "${f.note}"` : "")
  ).join("\n");
}
