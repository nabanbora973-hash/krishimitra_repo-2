const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
(async () => {
  const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const { verifiedAccount } = await import('../src/js/access.js');
  let count = 0;
  const check = (condition, name) => { assert(condition, name); console.log('PASS', ++count, name); };
  check(!verifiedAccount(null), 'signed-out identity rejected');
  check(!verifiedAccount({ uid: 'u', emailVerified: false }), 'unverified identity rejected');
  check(!verifiedAccount({ uid: 'u', emailVerified: true, isAnonymous: true }), 'anonymous identity rejected');
  check(!verifiedAccount({ uid: 'demo', emailVerified: true }), 'demo identity rejected');
  check(verifiedAccount({ uid: 'u', emailVerified: true }), 'verified identity accepted for UI');
  const auth = read('src/js/auth.js');
  check(!auth.includes('id="btnLocal"'), 'guest button absent');
  check(auth.includes('renderVerification') && auth.includes('resendVerification'), 'email checkpoint wired');
  check(!read('src/js/app.js').includes('function startGuest'), 'guest fallback absent');
  check(read('src/js/ui.js').includes('if (!verifiedAccount()) { hideApp(); show(\'auth\'); return; }'), 'history navigation guarded');
  check(read('firestore.rules').includes('allow write: if false;'), 'approval records not writable by clients');
  check(read('src/js/access.js').includes("'deskApprovals'"), 'posting reads separate approval collection');
  const sw = read('src/sw.js');
  check(sw.includes('v445-verified-access'), 'current cache version');
  const shell = sw.split('const SHELL = [')[1].split('];')[0];
  for (const match of shell.matchAll(/'([^']+)'/g)) {
    const asset = match[1];
    check(asset === '/' || fs.existsSync(path.join(__dirname, '..', 'src', asset)), 'cached asset exists: ' + asset);
  }
  const association = JSON.parse(read('src/.well-known/assetlinks.json'));
  check(association.some(item => item.target?.package_name === 'dev.workers.nabanbora973.raspy_dust_3258.twa'), 'existing Android package retained');
  console.log(count + ' access / package checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
