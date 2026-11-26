# KrishiMitra

A student-built crop-price decision prototype. It compares reported mandi prices, farm inputs and estimated transport costs, with weather and harvest context.

**Production:** https://raspy-dust-3258.nabanbora973.workers.dev/

## Current release

`v445-verified-access` (dashboard upload package v13).

- Sunrise login UI; no guest-entry button or demo/local query-string entry.
- Google sign-in or email/password account with verified email required.
- Public mandi price/demand posting additionally requires a server-managed desk approval.
- Firestore rules enforce verified identity, ownership, response recipients and report quotas.
- Original Android signing association is preserved at `src/.well-known/assetlinks.json`.

Email verification confirms control of an inbox, **not** that an account belongs to a genuine farmer or business. Desk approval requires the owner's independent checks. No blanket security or adoption claim is made.

## Repository layout

| Path | Purpose |
|---|---|
| `src/` | Actual production website, including hidden signing association |
| `firestore.rules` | Matching verified-account / manual-approval rules |
| `firebase.json` | Rules path and local emulator configuration |
| `wrangler.toml` | Static assets target: existing `raspy-dust-3258` Worker |
| `tests/` | Unit, auth-flow, access, emulator and browser checks |
| `docs/VERIFIED_ACCESS_SETUP.md` | Rules publication, approval and acceptance steps |
| `docs/ARCHITECTURE.md` | Boundaries, data flows and limitations |
| `docs/RELEASE-v13.md` | Migration notes from the earlier repository snapshot |

## Run locally

Use Node.js 20+ and Python 3. The pinned emulator tooling also needs Java 11+; a supported Java LTS is preferable.

```bash
npm ci
npm run dev
```

Open `http://localhost:8000`. This serves `src/` and **does not bypass authentication**. Real login needs Firebase providers enabled, network access and an authorized local hostname in Firebase. Email verification and posting approvals remain required. No private server key belongs in this website.

## Tests

```bash
npm test
npm run test:rules
```

`test:rules` uses the **demo-krishimitra-security** emulator project and test identities. It does not write production data. Do not change the test project to your live project.

For browser checks, leave `npm run dev` running in another terminal, then:

```bash
npx playwright install chromium
# On a Linux machine missing browser libraries: npx playwright install-deps chromium
npm run test:browser
```

The browser suite blocks the Firebase SDK network request to verify a fail-closed signed-out flow. It is **not** an actual Google/inbox end-to-end test. Browser evidence goes to ignored `test-results/`.

## Build and deploy

```bash
npm run build
```

This copies `src/` to `dist/`, including `.well-known`. No account-free single-file app is generated. The older standalone guest artifact and its auth-stubbing builder have been retired.

Preferred dashboard workflow:

1. Back up current rules and deployment.
2. Firebase project `kishimitra` > Firestore > Rules: publish the root `firestore.rules`.
3. Immediately afterward, Cloudflare > existing **raspy-dust-3258** > upload the **contents** of `dist/` or `src/`, with `index.html` at root and hidden `.well-known` included.
4. Reopen the app and test real verified sign-in, profile save and approved/unapproved posting.

Publishing to GitHub alone does not necessarily deploy the manually uploaded Worker. Website deployment also does not publish Firestore rules automatically. The separate feed/AI relay Workers are outside this static website deployment and are not replaced by it.

Advanced CLI deployment is possible with your own authenticated accounts using `npx wrangler deploy` and `npx firebase-tools deploy --only firestore:rules --project kishimitra`, but only after reviewing the deployment scope. The default test/build scripts do not deploy anything.

## Approve a mandi desk

After checking the intended person/business, use the exact UID from Firebase Authentication:

`deskApprovals/{actualFirebaseUID}` → `approved` = boolean **true**.

Only Console/trusted Admin SDK writes can grant this. The website cannot approve itself. To revoke future privileged posting, set false or remove that approval record. Even the owner's account needs an approval record to post through the app. See the setup guide for complete steps.

## Data and security boundaries

- Prices are reported observations, not a promise of a current sale price. Check their reporting dates.
- Transport and return figures are estimates, not guaranteed proceeds or investment advice.
- Static HTML/JS and upstream public government/weather APIs are not private just because the app shows a login screen.
- Frontend checks are for user flow; signed Firebase tokens and Firestore rules enforce cloud authorization.
- Existing local/cache data is not encrypted or securely erased by this update. Browser/device testing remains necessary.
- Older application clients may hit permission errors until they update. Do not loosen rules to accommodate old clients.
- Never commit private keys, service-account JSON, `.env` secrets, user documents or tokens. Firebase web configuration identifies the project; it is not an admin credential.

## License

MIT. See `LICENSE`.
