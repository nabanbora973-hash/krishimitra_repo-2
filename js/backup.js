// ============================================================================
//  Your data — backup, restore, and optional cloud sync
// ----------------------------------------------------------------------------
//  KrishiMitra keeps everything on the farmer's phone (localStorage). That is a
//  deliberate privacy choice, and it has one honest cost: lose the phone, lose
//  the record. This module closes that gap in the two ways that actually work:
//
//    1. A backup file the farmer owns — download it, send it to himself on
//       WhatsApp, restore it on any phone. No account, no server, works offline.
//    2. Optional cloud sync through Firebase, OFF by default. It only turns on
//       when the owner has pasted a real Firebase config; until then the panel
//       says so plainly instead of pretending.
//
//  Nothing here uploads a farmer's data unless he has signed in and asked for it.
// ============================================================================
import { toast } from "./ui.js";
import { state } from "./state.js";
import { lastSyncedAt, pushAllToCloud } from "./store.js";
import { firebaseConfig } from "./config.js";

const KEYS = [
  "km_demo_profile",
  "km_demo_season",
  "km_demo_guidanceLog",
  "km_sales_v1",
  "km_registered"
];

function ls(){
  try { return window.__kmSafeLS || localStorage; } catch { return null; }
}

// ---------- is cloud actually configured? ----------
export function cloudConfigured(){
  const key = String(firebaseConfig?.apiKey || "");
  return !!key && !/PASTE/i.test(key) && !!firebaseConfig?.projectId && !/PASTE/i.test(firebaseConfig.projectId);
}

// ---------- backup ----------
export function collectData(){
  const s = ls();
  const out = { _app: "KrishiMitra", _version: 1, _exportedAt: new Date().toISOString(), data: {} };
  if (!s) return out;
  for (const k of KEYS){
    const raw = s.getItem(k);
    if (raw != null) out.data[k] = raw;
  }
  return out;
}

export function downloadBackup(){
  const payload = collectData();
  const n = Object.keys(payload.data).length;
  if (!n){ toast("Nothing to back up yet — add your farm and crop first"); return; }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `krishimitra-backup-${stamp}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast(`Backup saved — ${n} records. Keep it in WhatsApp "Message yourself".`);
  return payload;
}

// ---------- restore ----------
export async function restoreFromFile(file){
  const text = await file.text();
  let payload;
  try { payload = JSON.parse(text); } catch { toast("That file is not a KrishiMitra backup"); return false; }
  if (!payload || payload._app !== "KrishiMitra" || !payload.data){
    toast("That file is not a KrishiMitra backup"); return false;
  }
  const s = ls();
  if (!s){ toast("This browser blocks storage — restore is not possible here"); return false; }
  let n = 0;
  for (const [k, v] of Object.entries(payload.data)){
    if (!KEYS.includes(k)) continue;
    s.setItem(k, v); n++;
  }
  toast(`Restored ${n} records — reloading`);
  setTimeout(() => location.reload(), 900);
  return true;
}

// ---------- the panel ----------
export function dataCardHTML(){
  const cloud = cloudConfigured();
  return `
    <div class="card" style="margin-top:14px" id="dataCard">
      <b style="color:var(--green)">Your data lives on this phone</b>
      <p class="statlabel" style="margin:6px 0 0">
        No account needed, nothing uploaded. That is why the app works offline — and why a backup is worth having.
      </p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        <button class="btn small" id="btnBackup">⬇ Download backup</button>
        <label class="btn ghost small" style="cursor:pointer;margin:0">
          ⬆ Restore from backup
          <input type="file" id="fileRestore" accept="application/json,.json" style="display:none">
        </label>
      </div>
      <div class="statlabel" style="margin-top:10px">${cloudStatusLine(cloud)}</div>
      ${cloud && signedIn() ? `<button class="btn ghost small" id="btnSyncNow" style="margin-top:10px">☁ Sync now</button>` : ''}
    </div>`;
}

function signedIn(){
  return !!(state.user?.uid && state.user.uid !== 'demo');
}

function cloudStatusLine(cloud){
  if (!cloud)
    return `Cloud sync is <b style="color:var(--red)">not configured</b> in this build, so nothing is uploaded anywhere.
            The backup file above is the honest way to move a record to a new phone.`;
  if (!signedIn())
    return `Cloud sync is <b style="color:var(--green)">available</b> — sign in to sync across phones. Until you do,
            nothing leaves this device.`;
  const t = lastSyncedAt();
  return `Cloud sync is <b style="color:var(--green)">on</b> for <b>${state.user.email || 'this account'}</b>`
       + (t ? ` · last sync ${new Date(t).toLocaleString()}` : ' · not synced yet');
}

export function wireDataCard(){
  const b = document.getElementById("btnBackup");
  if (b) b.onclick = () => downloadBackup();
  const f = document.getElementById("fileRestore");
  if (f) f.onchange = () => { if (f.files && f.files[0]) restoreFromFile(f.files[0]); };
  const sy = document.getElementById("btnSyncNow");
  if (sy) sy.onclick = async () => {
    sy.disabled = true; sy.textContent = 'Syncing…';
    const r = await pushAllToCloud();
    toast(r.ok ? 'Synced to the cloud' : 'Could not sync — ' + (r.reason || 'offline'));
    sy.disabled = false; sy.textContent = '☁ Sync now';
  };
}
