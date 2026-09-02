/* Static scan for the two bug classes that actually broke this app:
   1. TDZ — a `const`/`let` in the same function scope referenced by a line BEFORE its declaration
      (happened 5×: stageBox, histList, faceState, size, input).
   2. `n.h('div.x')` kids passed as trailing args (n.h takes (tag, attrs, kids)).
   Usage: node test/scan-tdz.mjs [dir]     → exits 1 on findings (heuristic, read before trusting). */
import { readFileSync, readdirSync } from 'node:fs';
const dir = process.argv[2] || 'assets/js';
const files = readdirSync(dir).filter(f => f.endsWith('.js')).map(f => dir + '/' + f);
const DECL = /^(\s*)(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/;
let findings = [];
for (const f of files) {
  const lines = readFileSync(f, 'utf8').split('\n');
  /* function-scoped regions: from a line starting with `function name(` to matching brace depth */
  const depth0 = (i) => { let d = 0; for (let k = 0; k <= i; k++) { d += (lines[k].match(/[{]/g) || []).length - (lines[k].match(/[}]/g) || []).length; } return d; };
  const bodies = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/\bfunction\b|=>\s*\{/.test(lines[i]) || !/\{/.test(lines[i])) continue;
    const start = i, d0 = depth0(i - 1);
    for (let j = i; j < lines.length; j++) {
      if (j > i && depth0(j - 1) <= d0) { bodies.push([start, j - 1]); i = j; break; }
    }
  }
  const seen = new Set();
  for (const [a, b] of bodies) {
    const decls = new Map();
    for (let i = a; i <= b; i++) { const m = lines[i].match(DECL); if (m && !decls.has(m[2])) decls.set(m[2], i); }
    for (const [name, di] of decls) {
      for (let i = a; i < di; i++) {
        if (i === di) continue;
        if (depth0(i) !== depth0(di)) continue;              // inner scope ≠ same TDZ window
        const insideLoop = (k) => { let d = 0; for (let j = k; j >= a; j--) { d += (lines[j].match(/[}]/g) || []).length - (lines[j].match(/{/g) || []).length; if (d < 0) return /^\s*(for|if|while|switch)\s*\(/.test(lines[j]); if (d > 0) return false; } return false; };
        if (insideLoop(i) && insideLoop(di)) continue;       // same-name bindings in sibling blocks (for…of) — not one TDZ
        const line = lines[i];
        if (/^\s*(\/\/|\*|\/\*)/.test(line) || /\bfunction\b[^)]*\bname\b/.test(line)) continue;
        const before = line.replace(/(['"`])(?:\\.|(?!\1)[\s\S])*\1/g, "''");       // strip strings
        const re = new RegExp('(?<![\\w$.])' + name.replace(/\$/g, '\\$') + '\\b');
        if (!re.test(before)) continue;
        const key = f + ':' + (i + 1) + ':' + name;
        if (seen.has(key)) continue; seen.add(key);
        findings.push({ file: f, use: i + 1, decl: di + 1, name, snippet: lines[i].trim().slice(0, 110), guard: /=>|function|\bevent|onclick|oninput|onchange|addEventListener|setTimeout|\.then\(/.test(line) });
      }
    }
  }
}
const hard = findings.filter(x => !x.guard);
const soft = findings.filter(x => x.guard);
for (const x of [...hard, ...soft]) console.log((x.guard ? '~  ' : '✕  ') + x.file + ':' + x.use + '  `' + x.name + '` dipakai di baris ' + x.use + ', dideklarasiin ' + (x.decl - x.use) + ' baris kemudian (decl:' + x.decl + ')' + (x.guard ? '  [didalam closure → cek sendiri]' : '') + '\n     ' + x.snippet);
console.log(`\n${hard.length} probable TDZ (top-level statement sebelum deklarasi), ${soft.length} in-closure (kemungkinan aman).`);
process.exit(hard.length ? 1 : 0);
