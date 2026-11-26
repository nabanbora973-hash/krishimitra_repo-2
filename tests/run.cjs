const { spawnSync } = require('child_process');
const path = require('path');
const files = ['feed_test.cjs', 'onboarding_test.cjs', 'pwa_test.cjs', 'language_test.cjs', 'release_fix_test.cjs', 'auth_flow_test.cjs', 'access_contract_test.cjs'];
let failed = 0;
for (const file of files) {
  console.log('\n=== ' + file + ' ===');
  const result = spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  if (result.status !== 0) failed++;
}
console.log('\n' + (files.length - failed) + '/' + files.length + ' suites passed. Firestore emulator and browser suites run separately.');
process.exitCode = failed ? 1 : 0;
