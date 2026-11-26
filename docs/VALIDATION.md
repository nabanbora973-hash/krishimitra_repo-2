# Validation of the repository sync

Executed against this prepared source:

- `npm test`: 7/7 suites passed (feed, onboarding, PWA, language, release regression, mocked auth flow, access/package contract).
- `npm run test:rules`: 45 emulator assertions passed using demo-krishimitra-security, not production.
- `BASE_URL=http://127.0.0.1:8100/ npm run test:browser`: 21 signed-out browser checks passed.
- `npm run build`: static copy succeeded, including Android association.
- `git diff --check`: passed before packaging.
- Source compared with delivered v13 upload archive: only js/live-prices.js comment wording differs; runtime code and Android association preserved.

## Dependency warning — not resolved

The pinned development/test dependency tree reported **37 npm audit findings: 28 moderate, 8 high, 1 critical** during preparation. They include transitive Firebase CLI dependencies and the emulator test SDK tree. The automatic suggested fixes include major version changes/downgrades; they were NOT blindly applied. These tooling dependencies are not copied into the static deployment by `npm run build`. This is NOT a clean dependency audit or a claim that browser SDK dependencies have been audited.

Run these test tools only on trusted local source. A separate dependency upgrade and emulator compatibility retest is needed before claiming a clean development supply chain. `npm ci` may emit these warnings. Do not use `npm audit fix --force` without reviewing and retesting the resulting major changes.

## Limits

Browser checks block Firebase CDN requests and validate fail-closed UI behaviour, not actual Google/inbox end-to-end authentication. No production data writes, account approval or GitHub push performed. No physical-device performance guarantee. Production deployment/rules are separate from this Git sync.
