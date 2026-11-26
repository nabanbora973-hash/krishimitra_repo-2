# Existing GitHub repo mein latest v13 dalna

Target: https://github.com/nabanbora973-hash/krishimitra_repo-2

This package is prepared locally. Nothing has been pushed to GitHub.

## Recommended: patch in a fresh clone

Use a computer with Git installed. Download and extract this delivery bundle. Open a terminal in its folder (where krishimitra-v13.patch is present):

```bash
git clone https://github.com/nabanbora973-hash/krishimitra_repo-2.git
cd krishimitra_repo-2
git switch -c update-v13-verified-access
git apply --check ../krishimitra-v13.patch
git apply ../krishimitra-v13.patch
git status --short
git diff --stat
```

If the check fails, STOP. Your main branch may have changed since baseline ae416ad347dbe2095328285aacc342093f79a3b3. Do not force it or discard your changes; send the error for a rebase/merge.

Review, optionally run tests per README, then:

```bash
git add -A
git commit -m "Sync deployed v13 verified access and desk approvals"
git push -u origin update-v13-verified-access
```

Sign in through your own Git credential manager/browser if prompted. Never paste a GitHub token/password into chat.

Open the repo on GitHub, choose **Compare & pull request**, review changed files, then merge into main. This updates the SAME repo and keeps its history. No new repo is created. Only you perform the push/merge.

## Source ZIP

`krishimitra-v13-source.zip` contains the complete proposed source tree with a top folder `krishimitra_repo-2/`, including hidden .well-known signing association and Git dotfiles. It does not contain .git, node_modules, deployment output or credentials.

Do not merely drag the ZIP onto GitHub: GitHub will store the ZIP rather than unpack it. Copying its extracted files over an existing tree alone also leaves retired files behind. The patch above includes intentional deletions and is preferred.

## What's updated

Latest stable NO3D v13 source is under src/, with Firestore rules, setup docs and tests. Old account-free offline artifact/auth-stubbing builders are removed. Check CHANGES.txt for the file summary and docs/RELEASE-v13.md for details.

Tests: 7/7 local suites, 45 emulator checks and 21 signed-out browser checks passed; build passed. Real account/inbox end-to-end test not performed. Important: the pinned development/test dependency tree has 37 npm audit findings, including one critical transitive dependency. This is disclosed in docs/VALIDATION.md; it is NOT a clean tooling security audit. These packages are not included in the static build. Don't blindly run force-fix.

Your latest website/rules are already deployed per our earlier check. Updating Git alone does not necessarily redeploy the manually uploaded Worker, and does not publish Firestore rules automatically. There is no need to replace a working deployment just to save its current source in Git.
