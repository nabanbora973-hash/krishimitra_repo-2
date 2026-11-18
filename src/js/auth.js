// Auth screen: renders the login/signup form and wires the buttons.
import { auth, login, signup, onAuthStateChanged, logout, signInWithGoogle } from "./firebase.js";
import { sendOtp, verifyOtp, normalisePhone, prettyPhone, resetOtp, phoneSession } from "./otp.js";
import { state } from "./state.js";
import { cloudConfigured } from "./backup.js";
import { t } from "./i18n.js";
import { PHONE_SIGNIN } from "./config.js";

export function renderAuth(){
  const v = document.getElementById('view-auth');
  const sess = phoneSession();
  if (sess && !state.user){
    // A phone session is a device account: the number was verified, but there is
    // no Firebase user behind it. Marked local so profile writes stay on device.
    state.demo = true;
    state.localMode = true;
    state.user = { uid: sess.uid, email: '', phone: '+91' + sess.phone, isDemoAccount: true };
  }
  v.innerHTML = `
    <div class="card authcard">
      <div class="logo"><svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">
        <path d="M24 43c0-9 0-15 0-20" stroke="#0B4A2F" stroke-width="3" stroke-linecap="round" fill="none"/>
        <path d="M24 24C13 24 7 17 7 7c10 0 17 6 17 17z" fill="#0B4A2F"/>
        <path d="M24 30c11 0 17-7 17-17-10 0-17 6-17 17z" fill="#17784A"/>
      </svg></div>
      <h1>KrishiMitra</h1>
      <div class="tag">Know Your Market. Choose Your Moment.</div>

      <!-- ONE decision on the first screen. A farmer who wants a price should
           never meet Google / OTP / email before he meets a number. -->
      <button class="btn" id="btnLocal" style="width:100%;padding:15px;font-size:18px;margin-top:16px">
        ${t('auth.start')}</button>
      <div class="statlabel" style="margin-top:8px">${t('auth.noaccount')}</div>

      <button class="btn ghost" id="btnShowSignin" style="width:100%;margin-top:16px;font-weight:600">
        ${t('auth.haveAccount')}</button>

      <div id="signinPane" style="display:none;margin-top:16px;border-top:1px solid #DDEBE1;padding-top:14px">
        <button class="btn google" id="btnGoogle" type="button">
          <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
            <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-2.8-.4-4.1H24v7.8h12.1c-.2 2-1.5 5-4.4 7l6.7 5.2c3.9-3.6 6.7-8.9 6.7-15.9z"/>
            <path fill="#34A853" d="M24 46c6 0 11-2 14.6-5.4l-6.9-5.4c-1.9 1.3-4.4 2.2-7.7 2.2-5.9 0-10.9-3.9-12.7-9.3l-7.1 5.5C7.8 41.1 15.3 46 24 46z"/>
            <path fill="#FBBC05" d="M11.3 28.1c-.5-1.4-.8-2.9-.8-4.1s.3-2.7.8-4.1l-7.1-5.5C2.5 17.2 1.7 20.5 1.7 24s.8 6.8 2.5 9.6l7.1-5.5z"/>
            <path fill="#EA4335" d="M24 9.5c3.3 0 5.6 1.4 6.9 2.6l5.1-5C32.2 3.6 28.6 2 24 2 15.3 2 7.8 6.9 4.2 14.4l7.1 5.5C13.1 14.5 18.1 9.5 24 9.5z"/>
          </svg>
          <span>Continue with Google</span>
        </button>

        <div class="orsep"><i></i><span>or use your email</span><i></i></div>

        <input id="email" type="email" placeholder="Email" autocomplete="email">
        <input id="pass" type="password" placeholder="Password (min 6 characters)" autocomplete="current-password">
        <button class="btn" id="btnLogin" style="width:100%">Log in</button>
        <button class="btn orange" id="btnSignup" style="width:100%;margin-top:8px">Create account</button>

        <div id="phoneBlock" style="display:none;margin-top:12px">
          <div class="orsep"><i></i><span>or use your phone</span><i></i></div>
          <div id="otpBox" class="otpbox">
            <div class="phonerow">
              <span class="cc">+91</span>
              <input id="otpPhone" inputmode="numeric" maxlength="10" placeholder="10-digit mobile number" autocomplete="tel-national">
              <button class="btn small" id="btnSendOtp" type="button">Send OTP</button>
            </div>
            <div id="otpCodeWrap" style="display:none">
              <input id="otpCode" inputmode="numeric" maxlength="6" placeholder="6-digit code" autocomplete="one-time-code">
              <button class="btn" id="btnVerifyOtp" type="button" style="width:100%">Verify &amp; continue</button>
              <p class="statlabel" id="otpNote" style="margin-top:8px"></p>
            </div>
          </div>
          <div id="otpRecaptcha"></div>
        </div>

        <div id="autherr" style="margin-top:10px;font-size:13.5px;line-height:1.45"></div>
        <button class="btn ghost" id="btnBackGuest" style="width:100%;margin-top:10px;font-weight:600">
          ← ${t('auth.start')}</button>
        <div class="statlabel" style="margin-top:8px">${t('auth.whyAccount')}</div>
      </div>
    </div>`;

  // A note, not a wall. Amber, small, and never the last word on the screen.
  const err = (m, kind) => {
    const el = document.getElementById('autherr');
    if (!el) return;
    el.textContent = m || '';
    el.style.color = kind === 'ok' ? '#0B4A2F' : '#6E3F0B';
    el.style.background = m ? (kind === 'ok' ? '#EDF4EF' : '#EDF4EF') : 'transparent';
    el.style.borderRadius = '10px';
    el.style.padding = m ? '10px 12px' : '0';
  };

  // ---------------- phone OTP ----------------
  const phoneEl = document.getElementById('otpPhone');
  const sendBtn = document.getElementById('btnSendOtp');
  const codeWrap = document.getElementById('otpCodeWrap');
  const note = document.getElementById('otpNote');

  phoneEl.addEventListener('input', () => { phoneEl.value = phoneEl.value.replace(/\D/g,'').slice(0,10); });

  sendBtn.onclick = async () => {
    err('');
    const ten = normalisePhone(phoneEl.value);
    if (!ten) return err('Enter a 10-digit Indian mobile number.');
    sendBtn.disabled = true; sendBtn.textContent = 'Sending…';
    const r = await sendOtp(ten);
    sendBtn.disabled = false;
    if (!r.ok){
      sendBtn.textContent = 'Send OTP';
      document.getElementById('otpCodeWrap').style.display = 'none';
      return err(r.error);
    }

    codeWrap.style.display = 'block';
    sendBtn.textContent = 'Resend';
    phoneEl.setAttribute('readonly', 'readonly');
    // Only ever say this when an SMS really went out.
    note.innerHTML = 'Code sent to <b>' + prettyPhone(ten) + '</b>. It may take a few seconds.';
    document.getElementById('otpCode').focus();
  };

  document.getElementById('btnVerifyOtp').onclick = async () => {
    err('');
    const btn = document.getElementById('btnVerifyOtp');
    btn.disabled = true; btn.textContent = 'Checking…';
    const r = await verifyOtp(document.getElementById('otpCode').value);
    btn.disabled = false; btn.textContent = 'Verify & continue';
    if (!r.ok) return err(r.error);
    if (r.mode === 'demo') location.reload();     // boot with the device session
  };

  const gbtn = document.getElementById('btnGoogle');
  if (gbtn) gbtn.onclick = async () => {
    err('');
    gbtn.disabled = true;
    gbtn.querySelector('span').textContent = 'Opening Google…';
    try {
      const res = await signInWithGoogle();
      // null = the full-page path has started and the browser is about to
      // leave this page. Say that, instead of leaving "Opening Google…" up.
      if (res === null) gbtn.querySelector('span').textContent = 'Redirecting to Google…';
    }
    catch (e){
      const code = e.code || e.message || '';
      err(friendly(code));
      gbtn.disabled = false;
      gbtn.querySelector('span').textContent = 'Continue with Google';
    }
  };
  const val = id => document.getElementById(id).value.trim();

  document.getElementById('btnLogin').onclick = async () => {
    err('');
    try { await login(val('email'), val('pass')); }
    catch (e) { err(friendly(e.code || e.message)); }
  };
  document.getElementById('btnSignup').onclick = async () => {
    err('');
    if (val('pass').length < 6) return err('Password must be at least 6 characters.');
    try { await signup(val('email'), val('pass')); }
    catch (e) { err(friendly(e.code || e.message)); }
  };
  // Primary path: straight into the app, no account.
  const local = document.getElementById('btnLocal');
  if (local) local.onclick = () => { location.href = '?local=1'; };
  const backGuest = document.getElementById('btnBackGuest');
  if (backGuest) backGuest.onclick = () => { location.href = '?local=1'; };

  // Phone sign-in exists in the UI only when an SMS really goes out.
  if (PHONE_SIGNIN){
    const pb = document.getElementById('phoneBlock');
    if (pb) pb.style.display = 'block';
  }

  // Sign-in is behind one tap; the first screen stays a single decision.
  const pane = document.getElementById('signinPane');
  const showBtn = document.getElementById('btnShowSignin');
  if (showBtn && pane) showBtn.onclick = () => {
    pane.style.display = 'block';
    showBtn.style.display = 'none';
  };

  // Enter key submits login
  document.getElementById('pass').addEventListener('keydown', ev => {
    if (ev.key === 'Enter') document.getElementById('btnLogin').click();
  });
}

function friendly(code){
  const map = {
    'auth/invalid-email':        'That email address looks invalid.',
    'auth/user-not-found':       'No account found — create one below.',
    'auth/wrong-password':       'Wrong password — try again.',
    'auth/invalid-credential':   'Email or password is incorrect.',
    'auth/email-already-in-use': 'That email already has an account — log in instead.',
    'auth/too-many-requests':    'Too many attempts. Wait a minute and retry.',
    'auth/operation-not-allowed':'Email sign-in is not switched on yet. The app works fully without an account — tap “Start”.',
    'auth/unauthorized-domain':  'Sign-in is not switched on for this web address yet. The app works fully without an account — tap “Start”.',
    'auth/account-exists-with-different-credential':
      'This email already has an account with a password — log in with email instead.',
    'auth/popup-closed-by-user': 'Google sign-in was closed before finishing.',
    'auth/popup-blocked':        'Your browser blocked the popup — trying a full-page sign-in…',
    'auth/cancelled-popup-request': 'Google sign-in was cancelled.',
    'auth/network-request-failed-google': 'Network problem — check your connection.',
    'auth/network-request-failed':'Network problem — check your internet connection.'
  };
  return map[code] || 'Something went wrong: ' + code;
}

// Called once from app.js — fires whenever auth state changes.
export function initAuth(onUser){
  onAuthStateChanged(auth, async user => {
    state.user = user;
    await onUser(user);
  });
}

export { logout };
