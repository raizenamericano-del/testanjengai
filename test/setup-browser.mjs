#!/usr/bin/env node
/* One-time setup for the browser smoke test (test/e2e.mjs) in a bare sandbox:
     1. npm install (puppeteer as devDependency)
     2. download chrome-headless-shell
     3. pull the .so files Chrome needs (libnss3, libatk…) out of Debian .debs into test/.browsersys/lib
        — no root, no apt, because the sandbox can't `apt-get install`.
   run: node test/setup-browser.mjs      then:  npm run test:e2e
   Everything it writes is git-ignored (node_modules/, test/.browsersys/). */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const LIB = path.join(ROOT, 'test', '.browsersys', 'lib');
const DEBS = path.join(ROOT, 'test', '.browsersys', 'debs');
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', ...opts });
const cap = (cmd, args) => { try { return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return ''; } };

/* 1 ─ deps */
if (!fs.existsSync(path.join(ROOT, 'node_modules', 'puppeteer'))) {
  console.log('▸ npm install');
  if (run('npm', ['i', '--no-audit', '--no-fund']).status !== 0) { console.error('npm install gagal'); process.exit(1); }
} else console.log('✓ puppeteer sudah ada');

/* 2 ─ browser */
let bin = cap('bash', ['-lc', `ls -d $HOME/.cache/puppeteer/chrome-headless-shell/linux-*/chrome-headless-shell-linux64/chrome-headless-shell 2>/dev/null | tail -1`]);
if (!bin) {
  console.log('▸ download chrome-headless-shell');
  run('npx', ['--yes', 'puppeteer', 'browsers', 'install', 'chrome-headless-shell@stable']);
  bin = cap('bash', ['-lc', `ls -d $HOME/.cache/puppeteer/chrome-headless-shell/linux-*/chrome-headless-shell-linux64/chrome-headless-shell 2>/dev/null | tail -1`]);
}
if (!bin) { console.error('gak nemu chrome-headless-shell — set PUPPETEER_EXECUTABLE_PATH manual.'); process.exit(1); }
console.log('✓ browser:', bin);

/* 3 ─ shared libs */
fs.mkdirSync(LIB, { recursive: true }); fs.mkdirSync(DEBS, { recursive: true });
const missing = cap('bash', ['-lc', `LD_LIBRARY_PATH=${LIB} ldd ${bin} | grep 'not found' | awk '{print $1}' | sort -u`]).split('\n').filter(Boolean);
const PKGS = ['libnss3', 'libnspr4', 'libasound2t64', 'libatk1.0-0t64', 'libatk-bridge2.0-0t64', 'libatspi2.0-0t64', 'libxdamage1', 'libxkbcommon0', 'libcups2t64', 'libdrm2', 'libgbm1', 'libxcomposite1', 'libxdamage1', 'libxrandr2', 'libpango-1.0-0', 'libcairo2'];
if (missing.length) {
  console.log(`▸ ${missing.length} lib hilang → ambil dari debian (.deb, tanpa root)`);
  const have = new Set(fs.readdirSync(LIB));
  for (const p of PKGS) {
    if (fs.readdirSync(DEBS).some(f => f.startsWith(p + '_'))) continue;
    run('apt-get', ['download', p], { cwd: DEBS, stdio: 'ignore' });
  }
  for (const d of fs.readdirSync(DEBS).filter(f => f.endsWith('.deb'))) {
    const dir = path.join(DEBS, d.replace(/\.deb$/, ''));
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(path.join(dir, 'usr'))) {
      run('ar', ['x', path.join(DEBS, d)], { cwd: dir, stdio: 'ignore' });
      for (const t of ['data.tar.xz', 'data.tar.zst', 'data.tar.gz', 'data.tar']) {
        if (fs.existsSync(path.join(dir, t))) { run('tar', ['-xf', t], { cwd: dir, stdio: 'ignore' }); break; }
      }
    }
    const walk = (dd) => { for (const e of fs.readdirSync(dd, { withFileTypes: true })) {
      const f = path.join(dd, e.name);
      if (e.isDirectory()) walk(f);
      else if (e.name.includes('.so')) { const dst = path.join(LIB, e.name); if (!fs.existsSync(dst)) fs.copyFileSync(f, dst); }
    } };
    const usr = path.join(dir, 'usr', 'lib');
    if (fs.existsSync(usr)) walk(usr);
  }
}
const still = cap('bash', ['-lc', `LD_LIBRARY_PATH=${LIB} ldd ${bin} | grep -c 'not found'`]);
console.log(still === '0' || still === '' ? `✓ semua dependensi beres (${fs.readdirSync(LIB).length} file di test/.browsersys/lib)` : `⚠ masih ada ${still} lib missing — e2e bisa fail, sisanya butuh apt root`);
fs.writeFileSync(path.join(ROOT, 'test', '.browsersys', 'env.sh'),
  `export LD_LIBRARY_PATH=${LIB}\nexport PUPPETEER_EXECUTABLE_PATH=${bin}\n`);
console.log('\naktifin buat jalanin test:\n  source test/.browsersys/env.sh && npm run test:e2e');
