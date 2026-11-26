// ============================================================================
//  SHARE  —  one tap to WhatsApp, plus the native share sheet where it exists
// ----------------------------------------------------------------------------
//  In rural Assam the network IS WhatsApp. A verdict the farmer cannot forward is
//  a verdict that stays on one phone; a verdict he can forward reaches his
//  brother, his neighbour and the village group by evening.
//
//  Everything shared is plain text with the numbers in it — so it reads correctly
//  even where the app is not installed and the link does not open.
// ============================================================================
import { state } from './state.js';

const rup = n => (n == null || !isFinite(n) ? '—' : '₹' + Math.round(n).toLocaleString('en-IN'));

// Every forward is an advertisement with a door back to the app. Without this
// line the message travels the village but the app never gains a user: the
// farmer who receives it has no way to open it himself.
const APP_URL = 'https://raspy-dust-3258.nabanbora973.workers.dev';

// The message a farmer would actually type. Short lines, no jargon, source named.
export function verdictMessage({ cropLabel, verdict, topMarket, price, net, qty, source, govDate } = {}){
  const lines = [];
  lines.push(`🌱 KrishiMitra — ${cropLabel || 'crop'} update`);
  if (verdict) lines.push(`👉 ${verdict}`);
  if (topMarket) {
    lines.push('');
    lines.push(`📍 ${topMarket}${price != null ? ` — ${rup(price)}/qtl` : ''}`);
    if (net != null) lines.push(`   safar kharcha nikaal ke ${rup(net)}/qtl`);
    if (qty && net != null) lines.push(`   ${qty} qtl ≈ ${rup(net * qty)}`);
  }
  lines.push('');
  if (source === 'LIVE')        lines.push(`Source: AGMARKNET, Govt of India (${govDate || 'today'})`);
  else if (source === 'REPORTED') lines.push('Source: rate posted by the mandi today');
  else if (source === 'LAST KNOWN') lines.push(`Source: last government figure seen (${govDate || 'earlier'})`);
  else                          lines.push('Source: prototype data (DEMO)');
  lines.push('');
  lines.push(`KrishiMitra app: ${APP_URL}`);
  return lines.join('\n');
}

// A mandi forwarding its own rate to its farmer list.
export function rateMessage({ mandiName, cropLabel, modal, min, max, note, date } = {}){
  const l = [];
  l.push(`🏪 ${mandiName || 'Mandi'} — ${cropLabel || 'rate'}`);
  l.push(`आज का भाव: ${rup(modal)}/qtl${min && max ? ` (${rup(min)}–${rup(max)})` : ''}`);
  if (note) l.push(`📝 ${note}`);
  if (date) l.push(date);
  l.push('');
  l.push(`KrishiMitra se bheja gaya — ${APP_URL}`);
  return l.join('\n');
}

export const waLink = text => `https://wa.me/?text=${encodeURIComponent(text)}`;

// Returns how it was shared, so the UI can say something true.
export async function shareText(text, { title = 'KrishiMitra', preferNative = true } = {}){
  if (preferNative && typeof navigator !== 'undefined' && navigator.share){
    try {
      await navigator.share({ title, text });
      return { ok: true, how: 'native' };
    } catch (e){
      if (e && e.name === 'AbortError') return { ok: false, how: 'cancelled' };
      // fall through to WhatsApp / clipboard
    }
  }
  if (typeof window !== 'undefined' && window.open){
    window.open(waLink(text), '_blank', 'noopener');
    return { ok: true, how: 'whatsapp' };
  }
  return { ok: false, how: 'none' };
}

export async function copyText(text){
  try {
    if (navigator.clipboard?.writeText){ await navigator.clipboard.writeText(text); return true; }
  } catch {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand && document.execCommand('copy');
    ta.remove();
    return !!ok;
  } catch { return false; }
}

// Build the farmer's share text from live state, so callers do not re-derive it.
export function currentVerdictText(){
  const s = state;
  const rows = s.markets || [];
  const top = rows.find(r => r.netPerQtl != null) || null;
  return verdictMessage({
    cropLabel: s.season?.crop,
    qty: s.season?.quantityQtl,
    topMarket: top?.name,
    price: top?.price,
    net: top?.netPerQtl,
    source: s.priceSource?.source,
    govDate: s.priceSource?.govDate
  });
}
