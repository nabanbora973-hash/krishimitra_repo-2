// ============================================================================
//  PHONE OTP SIGN-IN  —  "number daalo, code aaya?"
// ----------------------------------------------------------------------------
//  Two modes, and the app is honest about which one is running:
//
//  REAL  — Firebase Phone Auth sends a genuine SMS. Works only when the Firebase
//          project is on the Blaze plan (Google charges per SMS) AND the phone
//          provider is enabled. When it works, the user is signed in for real.
//
//  DEMO  — no SMS provider, no billing, no signal. The app generates a 6-digit
//          code ON THIS DEVICE and shows it on screen, clearly labelled DEMO.
//          The session is a local device account: the app works fully, cloud
//          backup is off until a real sign-in.
//
//  The switch is automatic: try Firebase, fall back to demo, and say so. A
//  farmer must never hit a dead screen because a cloud service is not billed.
// ============================================================================
import { state } from './state.js';

const SESSION_KEY = 'km_phone_session_v1';
const OTP_TTL_MS  = 5 * 60 * 1000;      // a code is good for five minutes
const RESEND_MS   = 30 * 1000;          // and not again for thirty seconds

let confirmer = null;                    // Firebase ConfirmationResult, when real
let demoCode  = null;                    // the code we generated ourselves
let demoPhone = null;
let sentAt    = 0;
let recaptcha = null;

export const normalisePhone = raw => {
  const d = String(raw || '').replace(/\D/g, '');
  // Accept "+91 98765 43210", "919876543210" and "9876543210".
  const ten = d.length > 10 ? d.slice(-10) : d;
  return /^[6-9]\d{9}$/.test(ten) ? ten : null;      // Indian mobile series
};
export const prettyPhone = ten => ten ? `+91 ${ten.slice(0,5)} ${ten.slice(5)}` : '';
export const isDemoOtp = () => !!demoCode;
export const secondsLeft = () => Math.max(0, Math.ceil((RESEND_MS - (Date.now() - sentAt)) / 1000));

// ---------------------------------------------------------------- send
export async function sendOtp(phone10){
  const ten = normalisePhone(phone10);
  if (!ten) return { ok: false, error: 'Enter a 10-digit Indian mobile number.' };

  // ---- try the real thing first ----
  try {
    const fb = await import('./firebase.js');
    // Firebase is lazy now: without this await the SDK is not there yet and we
    // would silently fall back to the demo code even with a working network.
    await fb.loadFirebase();
    if (fb.auth && fb.RecaptchaVerifier && fb.signInWithPhoneNumber){
      if (!recaptcha){
        recaptcha = new fb.RecaptchaVerifier(fb.auth, 'otpRecaptcha', { size: 'invisible' });
      }
      confirmer = await fb.signInWithPhoneNumber(fb.auth, '+91' + ten, recaptcha);
      demoCode = null; demoPhone = ten; sentAt = Date.now();
      return { ok: true, mode: 'real', phone: ten };
    }
  } catch (e){
    // Not billed, provider off, no signal — all land here. Fall through to demo.
    try { recaptcha?.clear?.(); } catch {}
    recaptcha = null; confirmer = null;
    console.info('Real OTP unavailable:', e.code || e.message);
  }

  // ---- no real SMS path: say so. Never invent a code. ----------------------
  //  An on-screen code that no SMS produced is a fake login. A farmer would
  //  believe his number was verified. It was not. So we stop here.
  return {
    ok: false,
    error: 'Phone sign-in is not switched on yet (no SMS provider). ' +
           'Use Google or email, or continue without an account — the app works fully on this phone.'
  };
}

// ---------------------------------------------------------------- verify
export async function verifyOtp(code){
  const c = String(code || '').replace(/\D/g, '');
  if (c.length !== 6) return { ok: false, error: 'Enter the 6-digit code.' };
  if (!sentAt || Date.now() - sentAt > OTP_TTL_MS)
    return { ok: false, error: 'That code has expired — send a new one.' };

  // ---- real path ----
  if (confirmer){
    try {
      const cred = await confirmer.confirm(c);
      confirmer = null;
      return { ok: true, mode: 'real', user: cred.user };
    } catch (e){
      const map = {
        'auth/invalid-verification-code': 'That code is wrong — check the SMS again.',
        'auth/code-expired':              'That code expired — send a new one.',
        'auth/too-many-requests':         'Too many tries. Wait a minute.'
      };
      return { ok: false, error: map[e.code] || 'Could not verify that code.' };
    }
  }

  // ---- nothing to verify against: no code was ever sent ---------------------
  sentAt = 0;
  return { ok: false, error: 'No code was sent. Continue without an account — everything works on this phone.' };
}

// ---------------------------------------------------------------- session
export function phoneSession(){
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (!s || !s.phone) return null;
    if (Date.now() - (s.at || 0) > 30 * 86400e3) return null;   // 30 days
    return s;
  } catch { return null; }
}

export function clearPhoneSession(){
  try { localStorage.removeItem(SESSION_KEY); } catch {}
  demoCode = null; confirmer = null; demoPhone = null; sentAt = 0;
}

export function resetOtp(){
  demoCode = null; confirmer = null; demoPhone = null; sentAt = 0;
}
