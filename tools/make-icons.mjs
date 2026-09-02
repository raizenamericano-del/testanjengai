#!/usr/bin/env node
/* NEURAL AI STUDIO — generate icon set (PNG 192/512 + maskable + multi-size .ico) dari assets/icon.svg.
   Sekalian jadi smoke test buat n.img.icoBlob(): arsip .ico yang dihasilkannya diperiksa byte-per-byte
   (header, jumlah gambar, BITMAPINFOHEADER, panjang AND mask) — ICO yang salah bikin browser
   ngasih "broken image" di tab, dan itu gak ketahuan sama sekali cuma dari ngeliat kode.
   butuh puppeteer (npm i) — kalau gak ada, lewatin: file fallback udah di-commit. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'assets');
let puppeteer;
try { ({ default: puppeteer } = await import('puppeteer')); }
catch { console.log('puppeteer gak terpasang → bikin ikon pakai headless renderer gak bisa. Lewat (fallback file udah ada).'); process.exit(0); }

const SYS = path.join(ROOT, 'test', '.browsersys');
let EXEC;
if (fs.existsSync(path.join(SYS, 'env.sh'))) {
  const t = fs.readFileSync(path.join(SYS, 'env.sh'), 'utf8');
  const ld = t.match(/LD_LIBRARY_PATH=(\S+)/)?.[1], ex = t.match(/PUPPETEER_EXECUTABLE_PATH=(\S+)/)?.[1];
  if (ld) process.env.LD_LIBRARY_PATH = [ld, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
  if (ex) EXEC = ex;
}
const PORT = 4341;
const srv = spawnSync ? (await import('node:child_process')).spawn('node', ['test/static-server.mjs', String(PORT)], { cwd: ROOT, stdio: 'ignore' }) : null;
await new Promise(r => setTimeout(r, 600));

const svg = fs.readFileSync(path.join(OUT, 'icon.svg'), 'utf8');
const b = await puppeteer.launch({ headless: 'shell', ...(EXEC ? { executablePath: EXEC } : {}), args: ['--no-sandbox'] });
const p = await b.newPage();
await p.goto(`http://127.0.0.1:${PORT}/tools/_iconpage.html`, { waitUntil: 'domcontentloaded' });
try { await p.waitForFunction(() => window.NAS && NAS.img && NAS.img.icoBlob, { timeout: 8000 }); }
catch (e) { console.error('harness gagal: ' + (await p.title())); throw e; }

const res = await p.evaluate(async (svgText) => {
  const n = window.NAS;
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
  await new Promise((ok, no) => { img.onload = ok; img.onerror = no; });
  const paint = async (size) => {
    const c = n.img.canvasOf(size, size); const x = n.img.ctx(c);
    if (!x) throw new Error('no 2d context');
    x.fillStyle = '#05070d'; x.fillRect(0, 0, size, size);
    x.drawImage(img, 0, 0, size, size);
    return c;
  };
  const png = async (size) => {
    const buf = await (await fetch((await paint(size)).toDataURL('image/png'))).arrayBuffer();
    return Array.from(new Uint8Array(buf));
  };
  const icoBlob = await n.img.icoBlob(await paint(256), [16, 32, 48, 180]);   // PNG 512 buat manifest; .ico gak perlu gede-gede
  const ico = Array.from(new Uint8Array(await icoBlob.arrayBuffer()));
  return { 192: await png(192), 512: await png(512), ico };
}, svg);
await b.close(); srv.kill();

fs.writeFileSync(path.join(OUT, 'icon-192.png'), Buffer.from(res[192]));
fs.writeFileSync(path.join(OUT, 'icon-512.png'), Buffer.from(res[512]));
fs.writeFileSync(path.join(OUT, 'icon.png'), Buffer.from(res[192]));
fs.writeFileSync(path.join(OUT, 'favicon.ico'), Buffer.from(res.ico));

/* ---- verify the ICO we just wrote ---- */
const ico = Buffer.from(res.ico);
const dv = new DataView(ico.buffer, ico.byteOffset, ico.byteLength);
const reserved = dv.getUint16(0, true), type = dv.getUint16(2, true), num = dv.getUint16(4, true);
const sizes = [];
for (let i = 0; i < num; i++) {
  const o = 6 + i * 16;
  sizes.push({ w: ico[o] || 256, h: ico[o + 1] || 256, bytes: dv.getUint32(o + 8, true), off: dv.getUint32(o + 12, true) });
}
const problems = [];
if (reserved !== 0 || type !== 1) problems.push(`header salah (reserved=${reserved} type=${type}, harus 0/1)`);
if (num !== 4) problems.push(`jumlah gambar ${num}, harus 4`);
for (const s of sizes) {
  const h = s.off;
  const biSize = dv.getUint32(h, true), biW = dv.getInt32(h + 4, true), biH = dv.getInt32(h + 8, true), planes = dv.getUint16(h + 12, true), bpp = dv.getUint16(h + 14, true);
  const maskRow = Math.ceil(s.w / 32) * 4, want = 40 + s.w * s.h * 4 + s.h * maskRow;
  if (s.w > 256) problems.push(`${s.w}px: ICO cuma boleh sampai 256`);
  if (biSize !== 40) problems.push(`${s.w}px: BITMAPINFOHEADER.biSize=${biSize} (harus 40) → browser anggap corrupt`);
  if (biW !== s.w || biH !== s.h * 2) problems.push(`${s.w}px: dimensi ${biW}×${biH}, harus ${s.w}×${s.h * 2}`);
  if (planes !== 1 || bpp !== 32) problems.push(`${s.w}px: planes/bpp ${planes}/${bpp}, harus 1/32`);
  if (s.bytes !== want) problems.push(`${s.w}px: panjang entri ${s.bytes}, harus ${want} (termasuk AND mask)`);
  if (h + s.bytes > ico.length) problems.push(`${s.w}px: numpuk keluar file`);
}
const pngOk = (buf) => buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
if (!pngOk(res[192]) || !pngOk(res[512])) problems.push('PNG magic salah');
const w192 = res[192][16] * 16777216 + res[192][17] * 65536 + res[192][18] * 256 + res[192][19];
const w512 = res[512][16] * 16777216 + res[512][17] * 65536 + res[512][18] * 256 + res[512][19];
if (w192 !== 192 || w512 !== 512) problems.push(`ukuran PNG salah: ${w192}/${w512}`);

console.log(problems.length ? '⚠ ' + problems.join('\n⚠ ') : `✓ icon-192.png (${res[192].length}B) · icon-512.png (${res[512].length}B) · favicon.ico (${ico.length}B, ${num} ukuran: ${sizes.map(s => s.w).join('/')})`);
console.log(`✓ ICO valid: BITMAPINFOHEADER + XOR/AND mask per ukuran, byteOffset tiap entri = ${(sizes.map(s => s.off).join(', '))}`);
process.exit(problems.length ? 1 : 0);
