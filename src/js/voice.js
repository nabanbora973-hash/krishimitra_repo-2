// ============================================================================
//  VOICE  —  speak to the app, and let the app speak back
// ----------------------------------------------------------------------------
//  A farmer who cannot read comfortably can still talk. Two directions:
//
//  IN   — Web Speech Recognition turns a spoken question into text for the
//         assistant. Language follows the app language (hi-IN / as-IN / en-IN).
//  OUT  — Speech Synthesis reads the verdict aloud, so the number is understood
//         without reading a table.
//
//  Both are optional browser APIs. When they are missing the buttons say so
//  instead of failing silently — no fake "listening" state.
// ============================================================================
import { getLang } from './i18n.js';

const SR = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

export const voiceInputSupported = () => !!SR;
export const voiceOutputSupported = () =>
  typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined';

const bc = lang => ({ hi: 'hi-IN', as: 'as-IN', en: 'en-IN' }[lang] || 'en-IN');

// One-shot recognition. Resolves with { text } or { error }.
export function listenOnce({ timeoutMs = 8000 } = {}){
  if (!SR) return Promise.resolve({ error: 'unsupported' });
  return new Promise(resolve => {
    let done = false;
    const rec = new SR();
    rec.lang = bc(getLang());
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;

    const finish = res => { if (!done){ done = true; try { rec.stop(); } catch {} resolve(res); } };
    const timer = setTimeout(() => finish({ error: 'timeout' }), timeoutMs);

    rec.onresult = e => {
      clearTimeout(timer);
      const text = e.results?.[0]?.[0]?.transcript?.trim() || '';
      finish(text ? { text } : { error: 'empty' });
    };
    rec.onerror = e => { clearTimeout(timer); finish({ error: e.error || 'error' }); };
    rec.onend = () => { clearTimeout(timer); if (!done) finish({ error: 'ended' }); };

    try { rec.start(); }
    catch (e){ clearTimeout(timer); finish({ error: String(e.message || e) }); }
  });
}

// Read a short message aloud. Cancels whatever was speaking first, so a second
// tap never leaves two voices talking over each other.
export function speak(text, { rate = 0.95 } = {}){
  if (!voiceOutputSupported()) return { ok: false, error: 'unsupported' };
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text || ''));
    u.lang = bc(getLang());
    u.rate = rate;
    window.speechSynthesis.speak(u);
    return { ok: true };
  } catch (e){ return { ok: false, error: String(e.message || e) }; }
}

export function stopSpeaking(){
  try { window.speechSynthesis?.cancel(); } catch {}
}

// Strip markdown-ish noise so the spoken version sounds like a sentence.
export const speakable = text => String(text || '')
  .replace(/[#*_`>]/g, ' ')
  .replace(/₹\s?([\d,]+)/g, '$1 rupees')
  .replace(/\s+/g, ' ')
  .trim();
