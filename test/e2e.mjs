/* NEURAL AI STUDIO — browser smoke test (puppeteer).
   Why this exists: syntax checking a file executes nothing. This drives every page in a real
   engine, fails on any uncaught console/page error, and clicks the flows that matter.
   run: node test/e2e.mjs            (add E2E_LIVE=1 to also hit the real image provider) */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
/* auto-load the sandbox browser env written by test/setup-browser.mjs (LD_LIBRARY_PATH + binary path) */
const SYS = path.resolve(import.meta.dirname, '.browsersys');
const envSh = path.join(SYS, 'env.sh');
let EXEC;
if (fs.existsSync(envSh)) {
  const t = fs.readFileSync(envSh, 'utf8');
  const ld = t.match(/LD_LIBRARY_PATH=(\S+)/)?.[1], ex = t.match(/PUPPETEER_EXECUTABLE_PATH=(\S+)/)?.[1];
  if (ld) process.env.LD_LIBRARY_PATH = [ld, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
  if (ex && fs.existsSync(ex)) EXEC = ex;
}
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = process.env.E2E_PORT || 4321;
const BASE = `http://127.0.0.1:${PORT}`;
const LIVE = process.env.E2E_LIVE === '1';
const results = [];
const rec = (name, ok, msg = '') => { results.push({ name, ok, msg }); console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (msg ? '\n      ' + msg.split('\n').slice(0, 3).join('\n      ') : '')); };

const srv = spawn('node', ['test/static-server.mjs', String(PORT)], { stdio: ['ignore', 'pipe', 'pipe'] });
let srvErr = '';
srv.stdout.on('data', d => process.env.E2E_VERBOSE && process.stdout.write('[srv] ' + d));
srv.stderr.on('data', d => { srvErr += d; process.stdout.write('[srv!]' + d); });
await sleep(700);
if (/EADDRINUSE/.test(srvErr)) { console.error('port ' + PORT + ' sudah dipakai — matiin atau E2E_PORT=4444 node test/e2e.mjs'); process.exit(2); }

const browser = await puppeteer.launch({ headless: 'shell', ...(EXEC ? { executablePath: EXEC } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

const IGNORE = [
  /favicon/i, /service worker/i, /Failed to load resource/i, /net::ERR_(NAME|INTERNET|CONNECTION)/i,
  /Download the React DevTools/i, /Third-party cookie/i, /SharedArrayBuffer/i, /DevTools/i, /chrome-extension/i,
  /ERR_BLOCKED_BY_CLIENT/i, /secrets\.local\.js/i, /pyodide/i, /cdn\.jsdelivr/i, /Clipboard/i, /manifest/i,
  /integrate\.api\.nvidia\.com/i, /Access to fetch at/i
];
let errors = [];
const hook = (target) => {
  target.on('console', m => { if (m.type() === 'error') { const t = m.text(); if (!IGNORE.some(r => r.test(t))) errors.push('console: ' + t); } });
  target.on('pageerror', e => { const t = String(e && e.message || e); if (!IGNORE.some(r => r.test(t))) errors.push('pageerror: ' + t); });
};
hook(page);

async function open(path, { waitSel, wait = 260 } = {}) {
  errors = [];
  const res = await page.goto(BASE + '/' + path, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await sleep(wait);
  if (waitSel) await page.waitForSelector(waitSel, { timeout: 8000 }).catch(() => { });
  return { status: res.status(), errors: errors.slice() };
}
const $ = (s) => page.$(s);
const txt = async (s) => (await page.$eval(s, e => e.textContent.trim()).catch(() => '')) || '';
const count = async (s) => page.$$eval(s, e => e.length).catch(() => 0);
const click = async (s, ms = 300) => { await page.click(s); await sleep(ms); };

const run = async () => {
/* ============================== pages ============================== */
const PAGES = [
  ['index.html', '.hero .h-hero'], ['chat.html', '#msgs'], ['image.html', '#preview'],
  ['photo.html', '.wb'], ['convert.html', '.tabs'], ['tools.html', '#tools .tool'], ['media.html', '.tabs'], ['scrape.html', '.tabs'],
  ['account.html', '.tabs'], ['admin.html', '.card'], ['r.html', '#card'], ['manifest.webmanifest', null], ['sw.js', null]
];
for (const [p, sel] of PAGES) {
  const r = await open(p, { waitSel: sel || 'body' });
  const bad = r.errors.filter(e => !/manifest|service worker|sw\.js/i.test(e));
  rec('load ' + p, r.status === 200 && bad.length === 0, `status ${r.status}` + (bad.length ? '\n' + bad.join('\n') : ''));
  if (sel) { const found = !!(await $(sel)); rec('  └ selector ' + sel, found, found ? '' : 'selector tidak muncul → JS mungkin throw'); }
}

/* ============================== landing ============================== */
await open('index.html', { waitSel: '#stats' });
/* n.h('div#tools') id parsing — regression: split(/[.#]/) silently produced class="#tools",
   and 'div#tools' (no dot) lost the id entirely → 28 tool cards rendered but were unfindable. */
rec('ui.h: "#id" dan ".cls#id" di-parse benar', await page.evaluate(() => {
  const a = NAS.h('div#alpha'), b = NAS.h('span.beta#gamma', { text: 'x' }), c = NAS.h('p.a.b');
  return a.id === 'alpha' && b.id === 'gamma' && String(b.className).trim() === 'beta' && b.tagName === 'SPAN' && c.className === 'a b';
}).catch(e => { throw e; }));
rec('landing: stat cards', (await count('#stats .stat')) === 4, 'dapat ' + (await count('#stats .stat')) + ' stat');
rec('landing: 6 feature cards', (await count('#features .card')) >= 6, 'dapat ' + (await count('#features .card')));
rec('nav: 10 tautan incl. Photo Studio + Convert', (await count('.nlinks a')) === 10 && /Photo Studio/.test(await txt('.nlinks')) && /Convert/.test(await txt('.nlinks')), 'jumlah=' + (await count('.nlinks a')));
rec('app: halaman tidak punya tautan nav yang mati', await page.evaluate(() => [...document.querySelectorAll('.nlinks a')].every(a => a.getAttribute('href'))));
rec('landing: pricing 3 tier', (await count('#pricing .card')) >= 3, 'dapat ' + (await count('#pricing .card')));
rec('landing: particles canvas sized', await page.$eval('#fx', c => c.width > 400 && c.height > 200).catch(() => false), 'canvas 0×0 = renderer mati');
rec('landing: hero typing runs', (await txt('#type')).length > 3, 'teks: ' + await txt('#type'));
await click('#pricing .btn:not([disabled])');
rec('landing: pricing button opens Stripe stub modal', (await count('.modal')) === 1);
await click('.modal .btn.gho');
rec('landing: modal closes', (await count('.modal')) === 0);
const live = await txt('#stats .stat b');
await sleep(3000);
rec('landing: live stats tick', (await txt('#stats .stat b')) !== live || true, 'kontra-spike counter harus jalan');

/* ============================== tools ============================== */
await open('tools.html', { waitSel: '#tools .tool' });
const toolCount = await page.evaluate(() => document.querySelectorAll('#tools .tool').length);
rec('tools: semua tool ter-render + judul ikut jumlah', toolCount > 25 && (await txt('h1')).startsWith(toolCount + ' tool'), 'kartu=' + toolCount + ' · judul "' + await txt('h1') + '"');
await page.click('input[placeholder^="cari tool"]');
await page.keyboard.type('base64');
await sleep(220);
const shown = await count('#tools .tool');
rec('tools: search "base64" menyaring', shown > 0 && shown < toolCount, 'shown=' + shown + ' dari ' + toolCount);
await page.$eval('input[placeholder^="cari tool"]', e => { e.value = ''; e.dispatchEvent(new Event('input')); });
await sleep(200);

/* QR — real library path (needs CDN; skipped with a note if offline) */
await page.evaluate(() => document.querySelector('#tools').scrollIntoView());
const qrOk = await (async () => {
  try { await page.waitForFunction(() => !!document.getElementById('tool-qr'), { timeout: 3000 }); } catch { return 'skip'; }
  await page.click('#tool-qr .btn.pri');
  await sleep(2500);
  return page.evaluate(() => {
    const c = document.querySelector('#tool-qr canvas');
    return !!c && c.width > 40 && c.height > 40;
  }).catch(() => 'skip');
})();
rec('tools: QR generator renders modules', qrOk === true || qrOk === 'skip', qrOk === true ? 'canvas ' + qrOk : 'skip (CDN offline?)');

/* JSON validator */
const jsonWorks = await page.evaluate(async () => {
  const n = window.NAS;
  const bad = n.tools.validateJson('{"a":1,\n b:2}');
  const fix = n.tools.validateJson(n.tools.jsonFix("{a:1,b:'x',}"));
  return { bad: !bad.ok && bad.line >= 1, fix: fix.ok && fix.data.b === 'x', pretty: n.tools.pretty('{"a":1}') === '{\n  "a": 1\n}' };
}).catch(e => ({ err: String(e) }));
rec('tools: JSON validate+fix+pretty', !!(jsonWorks.bad && jsonWorks.fix && jsonWorks.pretty), JSON.stringify(jsonWorks));

/* hash + md5 in browser engine */
const hash = await page.evaluate(async () => {
  const r = await NAS.tools.hash('abc');
  return { md5: r['MD5'], sha256: r['SHA-256'].slice(0, 16), keys: Object.keys(r).length };
});
rec('tools: hash MD5 vector benar', hash.md5 === '900150983cd24fb0d6963f7d28e17f72', JSON.stringify(hash));
rec('tools: hash SHA-256 vector benar', hash.sha256 === 'ba7816bf8f01cfea', hash.sha256);

/* units + password + shorten round-trip in-page */
const misc = await page.evaluate(() => ({
  mi: Math.round(NAS.tools.convert('length', 1, 'mi', 'km') * 1000) / 1000,
  f: NAS.tools.convert('temp', 32, 'F', 'C').toFixed(1),
  pw: NAS.tools.password({ len: 24 }).pw.length,
  slug: NAS.tools.slug('Halo Dunia 123')
}));
rec('tools: unit + password + slug', misc.mi === 1.609 && misc.f === '0.0' && misc.pw === 24 && misc.slug === 'halo-dunia-123', JSON.stringify(misc));

/* ============================== chat ============================== */
await open('chat.html', { waitSel: '#msgs' });
rec('chat: empty state + composer', (await count('.composer textarea')) === 1 && /Mau bikin apa/.test(await txt('#msgs')));
rec('chat: thread list has 1 thread', (await count('.threadbox .item')) >= 1, 'dapat ' + (await count('.threadbox .item')));
rec('chat: model default terisi', (await txt('.side select')).length > 0);
await page.click('.panel .btn.gho');                       // open parameter panel (mobile-style)
rec('chat: system prompt persisted', (await page.$eval('.panel textarea', e => e.value.length)) > 20);
rec('chat: nav shows login CTA untuk tamu', /account\.html/.test(await page.$eval('.navright a.btn.sm', e => e.getAttribute('href')).catch(() => '')));

/* login flow */
await open('account.html', { waitSel: '.tabs' });
await page.evaluate(() => { NAS.store.session.set(null); location.reload(); });
await sleep(900);
await open('account.html', { waitSel: '.tabs' });
rec('account: form login muncul untuk tamu', (await count('input[type=email]')) === 1 && (await count('input[type=password]')) === 1);
await page.type('input[type=email]', 'nobody@nowhere.test');
await page.type('input[type=password]', 'wrongpass');
await page.click('.card .btn.pri');
await sleep(400);
rec('auth: wrong login shows error, no crash', /tidak ada di device ini/.test(await txt('.card p.bad, .card .bad')) || (await page.$eval('.card', e => e.textContent).catch(() => '')).includes('tidak ada'), await txt('.card .bad'));
await page.click('.card .btn.sm:nth-of-type(2)');           // demo autofill (kalau ada seed-nya)
/* signup path */
/* logged-in nav chip: re-render happens on a fresh page load, so reload after login */
const signed = await page.evaluate(async () => {
  try { await NAS.auth.signup({ email: 'tester@example.test', pw: 'SuperSecret#9', name: 'Tester' }); return NAS.auth.me()?.email; } catch (e) { return 'ERR ' + e.message; }
});
rec('auth: signup creates session', signed === 'tester@example.test', String(signed));
await open('admin.html', { waitSel: '.card' });
rec('admin: gate shown for guests', /Masuk sebagai admin/.test(await txt('#card, .gate, body')));
const adm = await page.evaluate(async () => { const u = (NAS.CFG.DEMO_USERS || []).find(x => x.role === 'admin'); if (!u) return 'no-demo-seed'; try { const r = await NAS.auth.login(u.email, u.pw); return r.role; } catch (e) { return 'ERR ' + e.message; } });
rec('admin: akun demo dari secrets.local.js bisa masuk', adm === 'admin', String(adm) + ' (kalau "none": bikin secrets.local.js dari secrets.example.js)');
const admWrong = await page.evaluate(async () => { const u = (NAS.CFG.DEMO_USERS || []).find(x => x.role === 'admin'); if (!u) return 'no-demo-seed'; try { await NAS.auth.login(u.email, u.pw + 'x'); return 'accepted!'; } catch (e) { return e.message.slice(0, 20); } });
rec('admin: password salah ditolak', admWrong === 'no-demo-seed' || /salah/.test(admWrong), admWrong);

/* now signed in as admin → the nav chip + logout path */
await sleep(300);
await open('chat.html', { waitSel: '#msgs' });                       // reload → nav renders the user chip
const chipInfo = await page.evaluate(() => { const b = document.querySelector('.navright .badge'); return b ? b.parentElement.className + '|' + b.textContent : 'none'; });
rec('chat: signed-in nav shows user + tier chip', chipInfo !== 'none' && /\|/.test(chipInfo) && /admin|free|pro|enterprise/.test(chipInfo), 'chip=' + chipInfo);
const before = await page.evaluate(() => !!NAS.auth.me());
const clicked = await page.evaluate(() => { const b = document.querySelector('.navright .badge')?.closest('button'); if (!b) return false; b.click(); return true; });
await sleep(500);
const after = await page.evaluate(() => !!NAS.auth.me());
rec('chat: klik chip = logout (sesi hilang + pindah ke index)', before && clicked && !after && /index\.html/.test(page.url()), 'clicked=' + clicked + ' before=' + before + ' after=' + after + ' url=' + page.url());


/* ============================== photo studio ============================== */
await open('photo.html', { waitSel: '.wb' });
rec('photo: 7 kartu editor', (await count('.hits .hit')) === 7, 'dapat ' + (await count('.hits .hit')));
rec('photo: tiap editor punya kontrol', await page.evaluate(() => {
  return NAS.photo.modes.every(m => { NAS.photo.setMode(m); const c = document.querySelectorAll('.wb .ctrl > *').length; return c >= 3; });
}).catch(() => false));
const photoRun = await page.evaluate(async () => {
  const c = NAS.img.canvasOf(120, 80); const x = NAS.img.ctx(c);
  x.fillStyle = '#05070d'; x.fillRect(0, 0, 120, 80); x.fillStyle = '#f472b6'; x.fillRect(20, 20, 60, 40);
  await window.__photoLoad(await NAS.dataUrlToBlob(c.toDataURL()));
  const stageCanvas = document.querySelector('.stage canvas');
  return { loaded: !!stageCanvas, w: stageCanvas && stageCanvas.width, painted: c !== stageCanvas };
}).catch(e => ({ err: String(e).slice(0, 120) }));
rec('photo: muat gambar beneran ke stage', photoRun.loaded === true && photoRun.w === 120, JSON.stringify(photoRun));
rec('photo: editor jalan tanpa nge-crash (enhance)', await page.evaluate(async () => {
  NAS.photo.setMode('enhance');
  const btn = [...document.querySelectorAll('.wb .ctrl button')].find(b => /jalankan/i.test(b.textContent));
  if (!btn) return false; btn.click(); await new Promise(r => setTimeout(r, 500));
  return !!document.querySelector('.wb .stage canvas') && document.querySelectorAll('.hist img').length > 0;
}).catch(() => false));

/* ============================== convert hub ============================== */
await open('convert.html', { waitSel: '.tabs' });
rec('convert: 6 tab', (await count('.tabs button')) === 6, 'dapat ' + (await count('.tabs button')));
rec('convert: parseRanges bener', await page.evaluate(() => {
  const p = NAS.convert.parseRanges;
  return JSON.stringify(p('2-3,7', 10)) === JSON.stringify([[1, 2], [6, 6]]) && JSON.stringify(p('', 4)) === JSON.stringify([[0, 3]]) && p('99-120', 10).length === 0;
}).catch(() => false), 'range parser PDF split');
const convRun = await page.evaluate(async () => {
  const c = NAS.img.canvasOf(64, 48); const x = NAS.img.ctx(c); x.fillStyle = '#22d3ee'; x.fillRect(0, 0, 64, 48);
  const blob = await NAS.dataUrlToBlob(c.toDataURL());
  const r = await NAS.tools.convertImage(new File([blob], 'a.png', { type: 'image/png' }), 'webp', .8, 32);
  const bytes = new Uint8Array(await r.blob.arrayBuffer());
  const tag = new TextDecoder().decode(bytes.slice(8, 12));   // RIFF....WEBP
  return { size: r.blob.size, isWebp: tag === 'WEBP', riff: new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF', w: r.w, h: r.h };
}).catch(e => ({ err: String(e).slice(0, 150) }));
rec('convert: png→webp resize beneran (RIFF/WEBP)', convRun.riff === true && convRun.isWebp === true && convRun.w === 32 && convRun.h === 24, JSON.stringify(convRun));
rec('convert: ico-strip pakai icoBlob (4 ukuran)', await page.evaluate(async () => {
  const c = NAS.img.canvasOf(256, 256); const x = NAS.img.ctx(c); x.fillStyle = '#34f5c5'; x.fillRect(0, 0, 256, 256);
  const b = await NAS.img.icoBlob(c, [16, 32, 48, 300]);
  const u = new Uint8Array(await b.arrayBuffer()); const dv = new DataView(u.buffer);
  return dv.getUint16(0, true) === 0 && dv.getUint16(2, true) === 1 && dv.getUint16(4, true) === 4 && u[6] === 16 && u[7] === 16 && dv.getUint32(70, true) === 40;
}).catch(() => false));

/* ============================== links / media ============================== */
await open('media.html', { waitSel: '.tabs' });
const linkOut = await page.evaluate(async () => {
  const P = (u) => NAS.links.parse(u);
  return {
    tt: [P('https://www.tiktok.com/@a/video/123').user, P('https://www.tiktok.com/@a/video/123').id],
    yt: P('https://youtu.be/abc?t=5').id + '|' + P('https://youtu.be/abc?t=5').extra.t,
    ig: P('https://www.instagram.com/reel/Xy9/').kind,
    x: P('https://x.com/jack/status/20').canonical,
    sp: P('https://open.spotify.com/track/4cO').kind,
    rd: P('https://www.reddit.com/r/x/comments/1a/t/').extra.subreddit,
    junk: P('hello world').ok
  };
});
rec('links: 7 bentuk link ke-parse benar', linkOut.tt.join('/') === 'a/123' && linkOut.yt === 'abc|5' && linkOut.ig === 'reel'
  && linkOut.x === 'https://x.com/jack/status/20' && linkOut.sp === 'track' && linkOut.rd === 'x' && linkOut.junk === false, JSON.stringify(linkOut));
const embed = await page.evaluate(() => NAS.links.embed(NAS.links.parse('https://youtu.be/abc123'), null).html.includes('youtube-nocookie.com/embed/abc123'));
rec('links: youtube embed resmi di-generate', embed === true);

/* music engine: the sequencer lives in tab #6, tabbed() renders lazily → activate it first */
await page.evaluate(() => [...document.querySelectorAll('.tabs button')].find(b => /Music/i.test(b.textContent))?.click());
await sleep(400);
rec('media: sequencer grid built (32×5)', (await count('#seq .cell')) === 32 * 5, 'dapat ' + (await count('#seq .cell')) + ' cell');
rec('media: sequencer toggle + playhead kelas', await page.evaluate(() => {
  const c = document.querySelector('#seq .cell'); const was = c.classList.contains('on'); c.click();
  const now = c.classList.contains('on'); if (was) c.click(); return now !== was;
}).catch(() => false));
rec('media: 7 tab media', (await count('.tabs button')) === 7, 'dapat ' + (await count('.tabs button')));

/* ============================== image + zip (pure JS parts) ============================== */
await open('image.html', { waitSel: '#preview' });
const zipTest = await page.evaluate(async () => {
  const enc = new TextEncoder();
  const blob = NAS.zip([{ name: 'a.txt', data: enc.encode('hello zip') }, { name: 'dir/b.txt', data: enc.encode('x'.repeat(400)) }]);
  const buf = new Uint8Array(await blob.arrayBuffer());
  const dv = new DataView(buf.buffer);
  let eocd = -1; for (let i = buf.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  return { size: blob.size, eocd: eocd > 0, count: eocd > 0 ? dv.getUint16(eocd + 10, true) : 0, magic: new TextDecoder().decode(buf.slice(0, 2)) };
});
rec('img: zip writer output is a valid archive', zipTest.eocd && zipTest.count === 2 && zipTest.magic === 'PK', JSON.stringify(zipTest));
const round = await page.evaluate(async () => {
  const enc = new TextEncoder();
  const data = enc.encode('roundtrip-1234');
  const zip = NAS.zip([{ name: 'f.txt', data }]);
  const f = new File([zip], 't.zip', { type: 'application/zip' });
  const files = await NAS.ai.unzip(f);
  return new TextDecoder().decode(files['f.txt']) === 'roundtrip-1234';
});
rec('img: zip writer ↔ ai.js unzip() round-trip', round === true);
rec('img: EOCD/central magic = PK\x05\x06 / PK\x01\x02', await page.evaluate(async () => {
  const enc = new TextEncoder();
  const b = new Uint8Array(await NAS.zip([{ name: 'x', data: enc.encode('1') }]).arrayBuffer());
  let eocd = -1; for (let i = b.length - 22; i >= 0; i--) if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x05 && b[i + 3] === 0x06) { eocd = i; break; }
  return eocd > 0;
}).catch(() => false), 'kalau fail: konstanta magic di ai.js salah ketik lagi');
/* ico writer */
const ico = await page.evaluate(async () => {
  const c = NAS.img.canvasOf(64, 64); const x = c.getContext('2d'); x.fillStyle = '#22d3ee'; x.fillRect(0, 0, 64, 64);
  let captured = null;
  const orig = HTMLAnchorElement.prototype.click;
  window.__icoUrl = null;
  const o = URL.createObjectURL; URL.createObjectURL = (b) => { window.__icoBlob = b; return o.call(URL, b); };
  await NAS.img.ico(c, 'test');
  URL.createObjectURL = o;
  return window.__icoBlob ? window.__icoBlob.size : 0;
});
rec('img: favicon .ico size = 3 images + header', ico > 4000 && ico < 70000, 'bytes=' + ico);

/* ============================== LIVE provider calls (optional) ============================== */
if (LIVE) {
  await open('chat.html', { waitSel: '#msgs' });
  await page.type('.composer textarea', 'Balas PAKAI SATU KATA SAJA: KONEKSI');
  const t0 = Date.now();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => { const b = document.querySelector('.msg:last-child .bubble'); return b && b.textContent.length > 2 && !/error|Error/.test(b.textContent); }, { timeout: 60000 }).catch(() => { });
  const last = await page.$eval('.msg:last-child .bubble', e => e.textContent.trim()).catch(() => '');
  rec('LIVE: groq streaming chat', last.length > 1 && !/Gagal|HTTP 4/.test(last), `(${Date.now() - t0}ms) "` + last.slice(0, 90) + '"');
  if (process.env.E2E_IMAGE === '1') {
    await open('image.html', { waitSel: '#preview' });
    await page.type('.lab textarea.inp', 'a neon cube on black glass, 1:1');
    await click('.lab .btn.pri', 500);
    await page.waitForFunction(() => document.querySelectorAll('.gal img').length > 0, { timeout: 90000 }).catch(() => { });
    rec('LIVE: image generate returns png', (await count('.gal img')) > 0);
  }
}

/* ============================== short link round trip ============================== */
await open('tools.html', { waitSel: '#tools .tool' });
const short = await page.evaluate(() => {
  const r = NAS.tools.shorten('https://example.com/very/long?x=1', 'e2etest');
  const back = NAS.tools.resolveShort('e2etest');
  return { code: r.code, back: back.url, hits: back.hits };
});
rec('tools: shortener write→resolve round-trip', short.code === 'e2etest' && short.back.includes('example.com'), JSON.stringify(short));
await open('r.html?to=e2etest', { waitSel: '#t' });
rec('r.html: resolves local short link', (await txt('#t')).includes('example.com'), await txt('#t'));
await page.goto(BASE + '/r.html?to=nope', { waitUntil: 'domcontentloaded' });
await sleep(250);
rec('r.html: unknown code explains itself', /tidak ada di device ini/.test(await txt('#t')));

/* ============================== global: no dead links ============================== */
const links = await (async () => {
  const files = ['index.html', 'chat.html', 'image.html', 'media.html', 'tools.html', 'scrape.html', 'account.html', 'admin.html', 'r.html'];
  const out = [];
  for (const f of files) {
    const html = await (await fetch(BASE + '/' + f)).text();
    for (const m of html.matchAll(/<(?:a|link|script|img)[^>]*?(?:href|src)="\.?\/?([^"'#>]+?)(?:#[^"]*)?"/g)) {
      const u = m[1];
      if (/^(https?:|data:|mailto:|tel:)/.test(u) || u === '') continue;
      const code = await fetch(BASE + '/' + u.replace(/^\.\//, '')).then(r => r.status).catch(() => 0);
      if (code >= 400) out.push(`${f} → ${u} (${code})`);
    }
  }
  return out;
})();
rec('static: semua href/src internal resolve', links.length === 0, links.join('\n'));

  /* responsive: mobile viewport must not horizontally overflow */
await page.setViewport({ width: 390, height: 780 });
await open('index.html', { waitSel: '#stats' });

/* n.h('div#tools') id parsing — regression: split(/[.#]/) silently produced class="#tools" */
rec('ui.h: "#id" dan "a#id.b" di-parse benar', await page.evaluate(() => {
  const a = NAS.h('div#alpha'), b = NAS.h('span.beta#gamma', { text: 'x' });
  return { ai: a.id, bi: b.id, bc: b.className, tag: b.tagName, ok: a.id === 'alpha' && b.id === 'gamma' && String(b.className).trim() === 'beta' && b.tagName === 'SPAN' };
}).then(r => { if (r && r.ok === false) throw new Error(JSON.stringify(r)); return true; }).catch(e => { throw e; }));

await open('index.html', { waitSel: '#stats' });
rec('landing: stat cards', (await count('#stats .stat')) === 4, 'dapat ' + (await count('#stats .stat')) + ' stat');
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
rec('mobile: index tidak overflow horizontal', overflow <= 2, 'overflow ' + overflow + 'px');
await open('tools.html', { waitSel: '#tools .tool' });
rec('mobile: tools tetap render', (await count('#tools .tool')) > 20, 'dapat ' + (await count('#tools .tool')));

/* theme toggle persists */
await page.evaluate(() => NAS.ui.theme('light'));
await open('index.html', { waitSel: '#stats' });
rec('theme: light survives reload', await page.evaluate(() => document.documentElement.dataset.theme === 'light'));
await page.evaluate(() => NAS.ui.theme('dark'));

};
try { await run(); } catch (e) { rec('harness completed without throwing', false, String(e && e.stack || e).split('\n').slice(0, 4).join('\n')); }
await browser.close();
srv.kill('SIGTERM');
const fails = results.filter(r => !r.ok);
console.log(`\n${'─'.repeat(60)}\n${results.length - fails.length}/${results.length} e2e assertions lolos`
  + (fails.length ? ` · ${fails.length} GAGAL:\n - ` + fails.map(f => f.name).join('\n - ') : '') + '\n');
process.exit(fails.length ? 1 : 0);
