// Checks the deploy package really is an installable app (PWA):
// manifest, icons, service worker, the tags in the page, and valid JSON/JS.
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'src');
const out = [];
const check = (n, c, x) => out.push(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  → ' + x : ''}`);

const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');

// --- manifest ---
let man = null;
try { man = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); } catch (e) { }
check('manifest.json exists and parses', !!man);
if (man) {
  check('has name + short_name', !!man.name && !!man.short_name, man.short_name);
  check('display = standalone (real app window, no browser chrome)', man.display === 'standalone');
  check('start_url + scope set', man.start_url === '/' && man.scope === '/');
  check('theme + background colours set', !!man.theme_color && !!man.background_color, man.theme_color);
  const sizes = (man.icons || []).map(i => i.sizes);
  check('icons 192 + 512 present', sizes.includes('192x192') && sizes.includes('512x512'), sizes.join(', '));
  check('maskable icon present (Android adaptive icon)', (man.icons || []).some(i => String(i.purpose || '').includes('maskable')));
  (man.icons || []).forEach(i => check(`icon file exists: ${i.src}`,
    fs.existsSync(path.join(dir, i.src)), i.src));
}

// --- page tags ---
check('page links the manifest', /<link rel="manifest" href="manifest\.json">/.test(html));
check('page sets theme-color', /name="theme-color"/.test(html));
check('iOS: apple-touch-icon present', /rel="apple-touch-icon"/.test(html));
check('iOS: add-to-home-screen meta present', /apple-mobile-web-app-capable/.test(html));
check('page registers the service worker (http/https only)', /serviceWorker/.test(html) && /register\('sw\.js'\)/.test(html));
check('SW registration skipped on file:// (demo laptop unaffected)', /\/\^https\?:\//.test(html));

// --- service worker ---
const sw = fs.readFileSync(path.join(dir, 'sw.js'), 'utf8');
check('sw.js: install handler (pre-caches the app)', /addEventListener\('install'/.test(sw) && /addAll/.test(sw));
check('sw.js: activate handler cleans old caches', /addEventListener\('activate'/.test(sw) && /caches\.delete/.test(sw));
check('sw.js: fetch handler', /addEventListener\('fetch'/.test(sw));
check('sw.js: price API never cached (always live)', /\/api\//.test(sw) && /return;/.test(sw));
check('sw.js: navigation falls back to the cached app', /mode === 'navigate'/.test(sw) && /caches\.match\('\/'\)/.test(sw));

console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} checks passed`);
process.exit(failed ? 1 : 0);
