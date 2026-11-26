# Current architecture

## Browser

HTML/CSS and JavaScript ES modules under `src/`. `state.js` holds current UI state; `ui.js` routes between views. `access.js` checks verified-account status for the UI and reads the signed-in user's separate desk approval before privileged posting. It is not a trusted authorization server.

`firebase.js` lazy-loads Firebase Auth/Firestore. The auth-state subscription remains active after an initial signed-out result. The bounded Google popup flow recovers the button rather than forcing a cross-origin redirect. Email/password sign-up sends a verification email; the check action reloads the user and refreshes the ID token.

`app.js` opens the app only after a verified, non-anonymous Firebase user arrives. Demo/local query flags no longer enter a guest mode. A login wall is not encryption, and it does not stop someone reading public JavaScript or their own local cached data.

## Firestore

`firestore.rules` requires a verified non-anonymous ID token. Ownership is derived from `request.auth.uid`, not a user-editable profile role.

- `users/{uid}`: own-account document access; counter validation.
- `deskApprovals/{uid}`: that verified account can inspect its approval; all client writes denied. Owner grants/revokes through Firebase Console or a separately trusted Admin SDK.
- `mandiReports/{id}`: verified reads; approved desk required for create/update; owner-only changes/deletion. Daily counter bound to server IST day, count and a report document ID.
- `demands/{id}`: verified reads; approved desk creates; owner closes with only status/closedAt changes or deletes.
- `demandResponses/{id}`: verified farmer creates against an existing open demand and actual desk recipient; only sender/recipient reads.
- Unmatched paths remain denied. This does not add new group/subcollection permissions.

Per-account quotas do not prevent many-account abuse. Counter-only increments can waste the caller's own allowance but do not grant more. Concurrent client batches can fail and require retry; they are not a robust server-side rate-limiter. A report's display date is client metadata, not a server-certified observation date; the quota day is server-validated.

## Public data and hosting

Existing feed and chat relays are separate deployments referenced in `config.js`. This repository's Worker configuration uploads static assets only; it does not replace relay code or audit relay authentication, secrets or quotas. Public government/weather data remains public upstream.

## Offline / installed app

The service worker caches application assets. Returning Firebase sessions and cached records may work offline, but fresh sign-in and desk approval checks require network. Full offline operation on every physical device is not certified. Approval checks fail closed on submission if they cannot be read; rules make the final cloud decision. Old cached assets may remain until a service-worker update activates.

Preserve `.well-known/assetlinks.json` and the existing production host to avoid breaking the Android trusted-web association. It contains public signing fingerprints, not private signing keys.
