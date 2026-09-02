/* Guard buat GitHub push protection: repo yang di-push gak boleh ngandung secret.
   Test ini nyapu semua file yang bakal ikut ke git (kecuali yang di-git-ignore) dan
   fail kalau nemu pola key/password. Jalanin sebelum commit: `npm run test:secrets`
   atau `node test/secret-scan.mjs --fix-hint`. */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.env.SCAN_ROOT ? path.resolve(process.env.SCAN_ROOT) : path.resolve(import.meta.dirname, '..');
const IGNORED = [/^secrets\.local\.js$/, /^\.env(\/|$|\.)/, /^node_modules\//, /^\.git\//, /^dist\//, /^\.next\//, /\/?zip-ref\.mjs$/];
const PATTERNS = [
  ['Groq key', /\bgsk_[A-Za-z0-9_]{20,}/],
  ['NVIDIA NIM key', /\bnvapi-[A-Za-z0-9_\-]{20,}/],
  ['Google API key', /\bAIza[0-9A-Za-z_\-]{30,}/],
  ['Gemini (AQ.) OAuth-ish key', /\bAQ\.[A-Za-z0-9_\-]{25,}/],
  ['OpenAI key', /\bsk-[A-Za-z0-9]{20,}/],
  ['Anthropic key', /\bsk-ant-[A-Za-z0-9_\-]{20,}/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{20,}/],
  ['AWS secret', /\b(?<![A-Z0-9])[A-Z0-9/+=]{40}(?![A-Z0-9])/, (line) => /aws|secret/i.test(line)],
  ['Stripe live key', /\bsk_live_[A-Za-z0-9]{16,}/],
  ['credential literal (pw/pass/key/token + quoted value)', /\b(?:pw|pass|passwd|password|apikey|api_key|token|secret)\s*[:=]\s*['"][^'"]{9,}['"]/i,
    (line, rel) => !/placeholder|example|ganti|input|type=|autocomplete|label|empty|kosong|['"]\s*\+|type\s*=\s*['"]password/i.test(line) && !/^secrets\.example\.js$/.test(rel)],
  ['private key block', /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/],
  ['password literal', /(?:password|passwd|pwd|secret|admin)\s*[:=]\s*['"][^'"]{6,}['"]/i,
    (line) => !/placeholder|example|ganti-saya|input|type=|autocomplete|['"]\s*\+|confirm|label/i.test(line)]
];
const gitignored = (() => {
  try { return fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')); }
  catch { return []; }
})();
const skip = (rel) => IGNORED.some(re => re.test(rel)) || gitignored.some(p => {
  const g = p.replace(/\/$/, '').replace(/\./g, '\\.').replace(/\*/g, '.*');
  return new RegExp('^' + g + '(\\.|$|/)').test(rel);
});
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.relative(ROOT, path.join(dir, e.name)).split(path.sep).join('/');
    if (skip(rel)) continue;
    if (e.isDirectory()) walk(path.join(dir, e.name), out);
    else if (fs.statSync(path.join(dir, e.name)).size < 3_000_000) out.push(rel);
  }
  return out;
};
const files = walk(ROOT);
const hits = [];
for (const rel of files) {
  const txt = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (/\0/.test(txt)) continue;                                     // binary
  txt.split('\n').forEach((line, i) => {
    if (/secret-scan:allow\b/.test(line)) return;                     // fake vector in a test = intentional
    for (const [label, re, extra] of PATTERNS) {
      if (!re.test(line)) continue;
      if (extra && !extra(line, rel)) continue;
      if (/^\s*(\*|\/\/|\/\*)/.test(line) && !re.exec(line)?.[0]?.length) continue;
      hits.push(`${rel}:${i + 1}  ${label}  ${line.trim().slice(0, 90)}`);
      break;
    }
  });
}
if (process.env.SCAN_VERBOSE) console.log('file yang ikut dipindai:\n  ' + files.join('\n  '));
console.log(`scan ${files.length} file (git-ignore dipatuhi) → ${hits.length} temuan`);
if (hits.length) {
  console.log('\n' + hits.join('\n'));
  console.log(`
CARA BERSIHIN:
  1. Pindah nilai aslinya ke secrets.local.js (browser) atau .env (server) — dua-duanya di-ignore.
  2. Key yang udah pernah ke-commit di mana pun = hangus → rotasi di console provider.
  3. Kalau udah ter-push dan history-nya kena: git filter-repo --invert-paths --path secrets.local.js
     lalu push --force, atau hapus repo-nya terus bikin baru dari ZIP.
  4. npm run test:secrets   # harus "0 temuan"
`);
  process.exit(1);
}
