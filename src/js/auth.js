// Auth screen: renders the login/signup form and wires the buttons.
import { auth, login, signup, onAuthStateChanged, logout } from "./firebase.js";
import { state } from "./state.js";

export function renderAuth(){
  const v = document.getElementById('view-auth');
  v.innerHTML = `
    <div class="card authcard">
      <div class="logo">🌱</div>
      <h1>KrishiMitra</h1>
      <div class="tag">Know Your Market. Choose Your Moment.</div>
      <input id="email" type="email" placeholder="Email" autocomplete="email">
      <input id="pass" type="password" placeholder="Password (min 6 characters)" autocomplete="current-password">
      <button class="btn" id="btnLogin" style="width:100%">Log in</button>
      <button class="btn orange" id="btnSignup" style="width:100%;margin-top:8px">Create account</button>
      <div class="herr" id="autherr"></div>
      <a class="demo-link" href="?demo=1">▶ Try the offline demo instead (no login)</a>
      <a class="demo-link" href="#" onclick="window.kmOpenVideo && window.kmOpenVideo(); return false;">▶ Watch the 2-minute demo video</a>
    </div>`;

  const err = m => document.getElementById('autherr').textContent = m;
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
    'auth/operation-not-allowed':'Email/password sign-in is not enabled in Firebase (see Step 0.3).',
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
