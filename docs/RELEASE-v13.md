# Sync the production app back to Git

## Baseline

Prepared against public branch `main` at commit `ae416ad` (short SHA; see delivery notes for full revision). The public repository snapshot was behind the manually deployed app. Application files are taken from the verified-access v13 deployment archive rather than from the abandoned 3D experiment.

## Included

- Sunrise login UI and farm SVG.
- Ongoing auth-state listener, bounded popup wait and retry feedback.
- Recommendation-reason contrast fixes.
- Mandatory verified identity, verification email actions and no guest fallback.
- Manual desk approval checks and matching root Firestore rules.
- Report quota binding, canonical new demand IDs and response recipient validation.
- Android signing association and current service-worker cache version.
- Unit/access/auth regression tests, 45-rule emulator assertions and signed-out browser tests.
- Cloudflare static deployment config and matching setup/architecture docs.

## Deliberately retired

Obsolete hosting configuration, the account-free standalone artifact, auth-stubbing build tools, and tests that asserted those obsolete deployment paths have been removed. They remain available in Git history. `npm run build` now copies the current authenticated application without changing its auth semantics. Old numerical-claim documents point to current documentation rather than present historical claims as verified current facts.

Screenshots and the MIT license are preserved from the public repository. No portfolio, DeepTrace or JalNetra source is included or changed.

## Adoption and migration

The website, repository, Firestore rules and relay deployments are different things. A Git commit alone is not evidence of deployment. See README for the dashboard deployment workflow. Existing old cached clients may be denied cloud operations until updated. Old pending records/historical documents are not migrated automatically by these rules.

## Not certified by this sync

Real Google/inbox sign-in on the owner's device, actual business identity, complete offline relaunch, account recovery, independent security audit, all mobile browsers, Firebase Console IAM, Storage rules and API relay protection. Do not turn automated test counts into performance, adoption or security guarantees.
