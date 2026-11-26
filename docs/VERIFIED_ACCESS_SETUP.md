# KrishiMitra v13 — verified accounts and manual desk approval

## What this changes
This update replaces optional-account access with a verified-account login wall. It does NOT establish that every account is a genuine farmer/business. Google sign-in and email verification establish control of an email account. Manual desk approval is a separate human decision made by the app owner.

- Guest button removed; no phone-session/device-only login conversion.
- Signed-out, anonymous and unverified users stay on the login/verification view. Demo/local query flags no longer enter the app. Router, back navigation and showApp are guarded.
- Email/password sign-up sends a Firebase verification email. The verification screen has resend, refresh/check and account-switch actions. The check reloads the Firebase user and refreshes the signed ID token before returning to the app.
- Firestore users, demands, responses, reports and approval reads require a verified non-anonymous token under the rules provided.
- Creating demands and creating/updating mandi reports ALSO requires deskApprovals/{FirebaseUID}.approved == true.
- Any verified account can use farmer functions and respond to an open demand. Existing owner-only close/delete behaviour remains; revoking desk approval blocks new demand creation and report create/update, not removal of their own posts.
- Only Firebase Console / trusted Admin SDK can write approval documents. NO client, including a self-claimed admin, can grant approval. There is NO new in-app admin panel.
- Existing users are NOT automatically approved to post. The owner also needs an approval record if posting mandi reports/demands through the app.
- Profile role and approval are separate. Choosing the mandi role does not grant posting rights.

## Files
1. krishimitra-v13-verified-access-upload.zip: static website for EXISTING raspy-dust-3258 Worker; includes latest Sunrise UI, auth listener, quota and contrast fixes, with no 3D.
2. krishimitra-v13-firestore-rules.txt: complete replacement Firestore rules. Do not upload this text file as a website asset.

## Deployment — do both together
1. Back up the current Firestore rules and note the current Cloudflare deployment.
2. Make sure you can access Firebase project kishimitra as owner/admin. In Authentication > Sign-in method, Google and Email/Password must be enabled. Authentication email-template delivery and authorized domains need to be valid for your production site; do not send private keys or passwords to anyone.
3. When ready to upload immediately afterward: Firestore Database > Rules. Paste ALL of krishimitra-v13-firestore-rules.txt, replacing the existing rules, and Publish.
4. Cloudflare Workers & Pages > existing raspy-dust-3258 > upload extracted contents of krishimitra-v13-verified-access-upload.zip. Keep index.html at root and include hidden .well-known. Do NOT change the portfolio Pages project or API relays.
5. Reopen/reload app to activate km-pwa-v445-verified-access. Existing unverified password accounts will need verification. Existing verified accounts can still sign in, but require desk approval before public posting.
6. Old app clients may get permission errors until they update. A website update does not instantly replace assets in every installed/offline browser. Do not restore permissive rules to support old clients.

## Approve a desk — Firebase Console only
First check the person/business yourself through a trusted channel. Possession of a UID, verified inbox or display name alone is NOT verification of a business.

1. Ask the desk to sign in and finish email verification. Their Farm Profile includes an account UID for approval requests. Alternatively, find their exact account in Firebase > Authentication > Users and copy its UID. Use the UID, not email, phone or display name. Verify it matches the intended account.
2. Open Firebase > Firestore Database > Data.
3. Create collection `deskApprovals` if it does not exist.
4. Document ID: paste that exact Firebase Authentication UID (NOT Auto-ID).
5. Add field `approved`, type **boolean**, value **true**. Do not use string "true".
6. Save. The desk can retry posting; approval is checked against Firestore on each submission and enforced by rules.
7. To revoke, set the same field to boolean false or delete that approval document. This blocks future privileged posting, not previously created public documents. Review/remove previously problematic posts separately using the Console as needed.

Example document path (use a REAL UID from Authentication):
`deskApprovals/<the account's actual Firebase UID>`
Fields: `approved` (boolean) = true.

Do not add `admin: true` or `approved: true` to users/{uid}; those do NOT grant desk permission in these rules.

## Acceptance checks after publishing
- Signed out: no guest button; /?demo=1 and /?local=1#markets stay at login.
- Email/password new account: verification screen, email arrives; cannot access the app until verified. Check spam and Firebase email settings if mail doesn't arrive.
- After opening the email link: return to app and use “I have verified my email”.
- Verified Google account: app opens; old cached clients may need reopen/reload.
- Verified but unapproved: profile/board usable; report and demand posting rejected with approval message.
- Approve the correct UID in Console: one genuine report/demand saves to cloud.
- Revoke that UID: a new public posting is rejected.
- A verified farmer can respond to an existing open demand; unrelated users cannot read the response.

## Test evidence and limits
45 emulator assertions passed against the supplied rules (including earlier ownership/quota tests and new verification/approval tests). 21 browser assertions passed with Firebase CDN requests blocked to exercise fail-closed login; 320, 390, 768 and 1365px layouts checked. These browser tests do NOT perform a real Google login or send/receive an actual email. Auth listener mocked regression tests are separate. Syntax, asset references, signing-file equality and ZIP integrity checked before delivery.

Not a full penetration test. Static HTML/JS and public upstream government/weather APIs are not made private by a login wall. Client-side checks can be modified; signed Firebase tokens and Firestore rules enforce cloud access. Existing device caches/local records are not encrypted or securely erased by this change. Existing cached copies may remain on devices. Account verification and approval do not eliminate fake accounts, credential theft or abuse. No Firebase Console IAM, API relay protection, Storage rules, App Check, payment, or independent identity verification audit is certified by this update. Permissions for unmatched Firestore collections remain denied; this does not newly enable subcollections or group-cloud features.
