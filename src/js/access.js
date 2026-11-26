// UI checks improve feedback; Firestore rules enforce cloud authorization.
import { state } from './state.js';
export function verifiedAccount(user = state.user) {
  return !!(user && user.uid && user.uid !== 'demo' && !user.isAnonymous && !user.isDemoAccount && user.emailVerified === true);
}
export async function requireDeskApproval() {
  if (!verifiedAccount()) return { ok: false, error: 'Sign in with a verified email account first.' };
  try {
    const fb = await import('./firebase.js');
    const snap = await fb.getDoc(fb.doc(fb.db, 'deskApprovals', state.user.uid));
    return snap.exists() && snap.data().approved === true
      ? { ok: true }
      : { ok: false, error: 'Posting is not approved for this account yet. Share your account UID from Farm Profile with the app owner for manual desk verification.' };
  } catch {
    return { ok: false, error: 'Desk approval could not be checked. Connect to the internet and try again. No public post was sent.' };
  }
}
export function mountApprovalInfo() {
  const host = document.getElementById('view-profile');
  if (!host || !verifiedAccount()) return;
  host.querySelector('#kmDeskApprovalInfo')?.remove();
  const card = document.createElement('div');
  card.className = 'card'; card.id = 'kmDeskApprovalInfo';
  const title = document.createElement('h3'); title.textContent = 'Public posting approval';
  const copy = document.createElement('p'); copy.textContent = 'Verified accounts can use the app. Posting mandi prices or demands also needs manual desk approval from the app owner. Email verification alone does not verify a business.';
  const label = document.createElement('p'); label.textContent = 'Your account UID (share with the owner to request approval):';
  const uid = document.createElement('code'); uid.textContent = state.user.uid; uid.style.overflowWrap = 'anywhere';
  card.append(title, copy, label, uid); host.append(card);
}
