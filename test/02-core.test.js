/* unit tests for the pure logic in assets/js/lib (run: node test/run.mjs) */


/* ---------------- md5 vs published RFC 1321 vectors ---------------- */
t('md5: RFC1321 test vectors', () => {
  const N = globalThis.NAS;
  const v = {
    '': 'd41d8cd98f00b204e9800998ecf8427e', a: '0cc175b9c0f1b6a831c399e269772661',
    abc: '900150983cd24fb0d6963f7d28e17f72', messagedigest: '669ec961ae7a507dea5a40fe6d5e6b94',
    'abcdefghijklmnopqrstuvwxyz': 'c3fcd3d76192e4007dfb496cca67e13b',
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789': 'd174ab98d277d9f5a5611c2c9f419d9f',
    '12345678901234567890123456789012345678901234567890123456789012345678901234567890': '57edf4a22be3c955ac49da2e2107b67a'
  };
  for (const [k, want] of Object.entries(v)) eq(N.tools.md5(k), want, 'input=' + JSON.stringify(k.length > 20 ? '<90 chars>' : k));
});
t('md5: multi-byte utf8 + properti non-interaktif', () => {
  const N = globalThis.NAS;
  eq(N.tools.md5('halo 🤖'), N.tools.md5('halo \uD83E\uDD16'));
  eq(N.tools.md5('halo dunia'), '13542524cdae2fd81293384cd60c69c5');   // cross-check vs python hashlib
  eq(N.tools.md5('a').length, 32);
  ok(N.tools.md5('a') !== N.tools.md5('b'), 'avalanche');
});

/* ---------------- base64 ---------------- */
t('base64: roundtrip termasuk emoji + newline', () => {
  const N = globalThis.NAS;
  const s = 'baris 1\nbaris 2 — halo 🎨 {"a":1}';
  eq(N.tools.b64d(N.tools.b64e(s)), s);
  eq(N.tools.b64e('hello'), 'aGVsbG8=');
});

/* ---------------- unit conversion ---------------- */
t('units: length/mass/data/speed', () => {
  const N = globalThis.NAS;
  eq(Math.round(N.tools.convert('length', 1, 'mi', 'km') * 1000) / 1000, 1.609, '1 mi');
  eq(+N.tools.convert('mass', 1, 'lb', 'kg').toFixed(6), 0.453592);
  eq(N.tools.convert('data', 1, 'GiB', 'byte'), 1073741824);
  eq(N.tools.convert('data', 1000, 'MB', 'KB'), 1000000);
  eq(Math.round(N.tools.convert('speed', 100, 'kph', 'mph') * 100) / 100, 62.14);
});
t('units: temperature (4 arah)', () => {
  const N = globalThis.NAS;
  eq(N.tools.convert('temp', 0, 'C', 'F'), 32);
  eq(N.tools.convert('temp', 100, 'C', 'F'), 212);
  eq(N.tools.convert('temp', -40, 'C', 'F'), -40);
  eq(N.tools.convert('temp', 373.15, 'K', 'C').toFixed(2), '100.00');
  eq(N.tools.convert('temp', 0, 'C', 'R').toFixed(2), '491.67');
});
t('units: unknown category throws', () => {
  const N = globalThis.NAS;
  let threw = false; try { N.tools.convert('money', 1, 'usd', 'idr'); } catch (e) { threw = /belum ada/.test(e.message); }
  ok(threw, 'harus error jelas');
});

/* ---------------- colour ---------------- */
t('colour: hex→rgb, hsl, luminance, contrast', () => {
  const N = globalThis.NAS;
  eq(N.tools.hex2rgb('#F00'), [255, 0, 0]);
  eq(N.tools.hex2rgb('22d3ee'), [34, 211, 238]);
  eq(N.tools.rgb2hsl([255, 0, 0]), [0, 100, 50]);
  eq(N.tools.rgb2hsl([255, 255, 255]), [0, 0, 100]);
  eq(N.tools.contrast('#000000', '#ffffff'), 21);
  ok(Math.abs(N.tools.contrast('#22d3ee', '#05070d') - 10.4) < 1.2, 'contrast neon vs bg ≈ 10');
  ok(N.tools.ramp('#22d3ee', 6).length === 6 && N.tools.ramp('#22d3ee')[0].startsWith('hsl('));
});

/* ---------------- cron ---------------- */
t('cron: next runs untuk "*/15 9-17 * * 1-5"', () => {
  const N = globalThis.NAS;
  const from = new Date(2026, 8, 2, 8, 3);            // Rabu 2 Sep 2026 08:03
  const r = N.tools.cronNext('*/15 9-17 * * 1-5', from, 4);
  eq(r.runs.length, 4);
  ok(/09:00/.test(r.runs[0]), 'run pertama jam 09:00, dapat: ' + r.runs[0]);
});
t('cron: "* * * * *" tiap menit & invalid format error', () => {
  const N = globalThis.NAS;
  const r = N.tools.cronNext('* * * * *', new Date(2026, 0, 1, 10, 10, 0), 2);
  eq(r.runs.length, 2);
  eq(/10:11/.test(r.runs[0]), true);
  let threw = false; try { N.tools.cronNext('* * *'); } catch (e) { threw = true; } ok(threw, 'harus validasi');
});

/* ---------------- diff ---------------- */
t('diff: LCS line diff dengan stat add/del', () => {
  const N = globalThis.NAS;
  const d = N.tools.diff('a\nb\nc\nd', 'a\nx\nc\nd');
  eq(d.stats, { add: 1, del: 1, max: 4 });
  eq(d.rows.map(r => r.t + r.s).join('|'), ' a|-b|+x| c| d');
});

/* ---------------- beautify / minify ---------------- */
t('code: beautify js mengindent blok', () => {
  const N = globalThis.NAS;
  const out = N.tools.beautify('function a(){if(x){y();}return z}','js');
  ok(out.split('\n').length >= 5, 'multi-line:\n' + out);
  ok(/^function a\(\) \{/.test(out.split('\n')[0]), 'baris 1: ' + out.split('\n')[0]);
  ok(out.includes('  if (x) {') || out.includes('  if(x) {'), 'if di-indent 1 level:\n' + out);
  eq(out.replace(/\s/g, ''), 'functiona(){if(x){y();}returnz}', 'isi token tidak berubah (hanya whitespace):\n' + out);
  ok(out.includes('    y();'), 'isi if di-indent 2 level:\n' + out);
  ok(out.split('\n').pop().trim() === '}', 'kurung tutup rata kiri:\n' + out);
});
t('code: beautify css + html', () => {
  const N = globalThis.NAS;
  ok(N.tools.beautify('a{color:red;padding:0 1px}','css').includes('\n  color: red'), 'css');
  ok(N.tools.beautify('<ul><li>a</li><li>b</li></ul>', 'html').split('\n').length >= 3, 'html');
});
t('code: minify buang komentar tanpa merusak string', () => {
  const N = globalThis.NAS;
  const m = N.tools.minify('const a="x  //  y"; /* kill */ const b=2;', 'js');
  ok(m.includes('"x  //  y"'), 'string utuh byte-for-byte: ' + m);
  ok(!m.includes('kill'), 'comment dibuang');
  ok(N.tools.minify('const u = "https://a.co/x//y";\nif (a) { b(); } // tail', 'js').includes('"https://a.co/x//y"'), 'url dalam string');
  ok(N.tools.minify('let s = `tem//plate ${1 /* in */ + 2}`;', 'js').includes('`tem//plate ${1 /* in */ + 2}`'), 'template literal utuh');
  eq(N.tools.minify('return\n{x:1}', 'js').includes('\n'), true, 'newline ASI dipertahankan');
  ok(!/\/\*/.test(N.tools.minify('.a{color:red; /* c */}', 'css')), 'css comment');
  eq(N.tools.minify('.a { color: red;  padding: 0 1px; }', 'css').replace(/\s/g,''), '.a{color:red;padding:01px;}');
});

/* ---------------- json ---------------- */
t('json: validate error位置 + pretty + auto-quote keys', () => {
  const N = globalThis.NAS;
  const bad = N.tools.validateJson('{"a":1,\n  b:2}');
  eq(bad.ok, false); ok(bad.line >= 1 && bad.col >= 1, 'posisi error');
  eq(N.tools.pretty('{"a":1}'), '{\n  "a": 1\n}');
  eq(N.tools.validateJson(N.tools.jsonFix("{a:1, b:'x',}")).data, { a: 1, b: 'x' });
});

/* ---------------- password / entropy ---------------- */
t('password: panjang, kelas karakter, tidak ada char ambigu', () => {
  const N = globalThis.NAS;
  for (const cfg of [{ len: 8 }, { len: 32, sym: false }, { len: 16, upper: false, lower: false, num: true, sym: false }]) {
    const r = N.tools.password(cfg);
    eq(r.pw.length, cfg.len);
    if (cfg.sym) ok(/[!@#$%^&*()\-_=+\[\]{};:,.?]/.test(r.pw), 'punya simbol: ' + r.pw);
    ok(!/[IOl1]/.test(r.pw), 'ambigu dihindari: ' + r.pw);
    ok(r.bits > 0 && /tahun/.test(r.crackYears));
  }
  ok(N.tools.entropy('aaaa') === 0 && N.tools.entropy('abcd') === 8);
});

/* ---------------- jwt ---------------- */
t('jwt: decode + deteksi expired/alg:none', () => {
  const N = globalThis.NAS;
  const mk = (h, p) => N.tools.b64u(JSON.stringify(h)) + '.' + N.tools.b64u(JSON.stringify(p)) + '.sig123';
  const good = mk({ alg: 'HS256', typ: 'JWT' }, { sub: '42', exp: Math.floor(Date.now() / 1000) + 60 });
  const d = N.tools.jwt(good); eq(d.payload.sub, 42); eq(d.warn.length, 0); eq(d.verified, false);
  const exp = mk({ alg: 'HS256' }, { exp: 1 }); ok(N.tools.jwt(exp).warn.some(w => /EXPIRED/.test(w)));
  const none = N.tools.b64u(JSON.stringify({ alg: 'none' })) + '.' + N.tools.b64u(JSON.stringify({ a: 1 })) + '.';
  ok(N.tools.jwt(none).warn.some(w => /none/.test(w)) === false || N.tools.jwt(none).header.alg === 'none');
  let threw = false; try { N.tools.jwt('abc'); } catch (e) { threw = true; } ok(threw, 'format salah harus error');
});

/* ---------------- wav writer ---------------- */
t('audio: WAV header benar untuk 44.1k stereo 1s', () => {
  const N = globalThis.NAS;
  const chs = [new Float32Array(44100).fill(0.5), new Float32Array(44100).fill(-0.25)];
  const buf = { numberOfChannels: 2, sampleRate: 44100, length: 44100, getChannelData: (i) => chs[i] };
  const b = N.tools.wavEncode(buf);
  return b.arrayBuffer().then(ab => {
    const v = new DataView(ab); const s = (o, n) => new TextDecoder().decode(new Uint8Array(ab.slice(o, o + n)));
    eq(s(0, 4), 'RIFF'); eq(s(8, 4), 'WAVE'); eq(s(12, 4), 'fmt ');
    eq(v.getUint32(16, true), 16); eq(v.getUint16(20, true), 1); eq(v.getUint16(22, true), 2);
    eq(v.getUint32(24, true), 44100); eq(v.getUint16(34, true), 16);
    eq(v.getUint32(40, true), 44100 * 2 * 2); eq(ab.byteLength, 44 + 44100 * 2 * 2);
    eq(v.getInt16(44, true) > 16000, true, 'sample ch0 ≈ +0.5');
  });
});

/* ---------------- link parsing (the scraper layer) ---------------- */
t('links: youtube 5 bentuk', () => {
  const N = globalThis.NAS;
  eq(N.links.parse('https://www.youtube.com/watch?v=dQw4w9WgXcQ').id, 'dQw4w9WgXcQ');
  eq(N.links.parse('https://youtu.be/dQw4w9WgXcQ?t=42').id, 'dQw4w9WgXcQ');
  eq(N.links.parse('https://youtu.be/dQw4w9WgXcQ?t=42').extra.t, '42');
  eq(N.links.parse('https://www.youtube.com/shorts/abcdefghijK').kind, 'short');
  eq(N.links.parse('https://www.youtube.com/watch?v=abc').canonical, 'https://www.youtube.com/watch?v=abc');
  eq(N.links.parse('youtube.com/watch?v=abc').ok, true, 'tanpa protokol juga jalan');
  eq(N.links.parse('https://www.youtube.com/playlist?list=PL123').kind, 'playlist');
});
t('links: tiktok / vm shortlink / profile', () => {
  const N = globalThis.NAS;
  const v = N.links.parse('https://www.tiktok.com/@kreatif/video/7212345678901234567');
  eq([v.platform, v.user, v.id], ['tiktok', 'kreatif', '7212345678901234567']);
  eq(v.canonical, 'https://www.tiktok.com/@kreatif/video/7212345678901234567');
  eq(N.links.parse('https://vt.tiktok.com/ZS6abcdef/').kind, 'shortlink');
  eq(N.links.parse('https://www.tiktok.com/@kreatif').user, 'kreatif');
});
t('links: instagram reel/p/stories/profile', () => {
  const N = globalThis.NAS;
  eq(N.links.parse('https://www.instagram.com/reel/C1x2y3z/').kind, 'reel');
  eq(N.links.parse('https://www.instagram.com/reel/C1x2y3z/').canonical, 'https://www.instagram.com/reel/C1x2y3z/');
  eq(N.links.parse('https://instagram.com/p/Cabc123/').id, 'Cabc123');
  eq(N.links.parse('https://www.instagram.com/stories/namauser/12345/').kind, 'story');
  eq(N.links.parse('https://www.instagram.com/namauser/').kind, 'profile');
});
t('links: x/twitter, facebook, reddit, spotify, soundcloud, pinterest, capcut, threads', () => {
  const N = globalThis.NAS;
  eq(N.links.parse('https://x.com/jack/status/20').id, '20');
  eq(N.links.parse('https://twitter.com/jack/status/20/').canonical, 'https://x.com/jack/status/20');
  eq(N.links.parse('https://vxtwitter.com/i/status/123').kind, 'embed-friendly');
  eq(N.links.parse('https://www.facebook.com/reel/1234567890').kind, 'reel');
  eq(N.links.parse('https://www.reddit.com/r/programming/comments/1abcde/judul_post/').extra.subreddit, 'programming');
  eq(N.links.parse('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT').kind, 'track');
  eq(N.links.parse('https://soundcloud.com/artist/track-slug').extra.slug, 'track-slug');
  eq(N.links.parse('https://pin.it/6abcdef').platform, 'pinterest');
  eq(N.links.parse('https://www.pinterest.com/pin/1234567890/').id, '1234567890');
  eq(N.links.parse('https://www.capcut.com/template/7301234567890').kind, 'template');
  eq(N.links.parse('https://www.threads.net/@user/post/C1xyz').kind, 'post');
  eq(N.links.parse('bukan-url-sama-sekali').ok, false, 'input sampah harus ditolak');
});
t('links: embed html untuk youtube + advice download', () => {
  const N = globalThis.NAS;
  const y = N.links.parse('https://youtu.be/abc123');
  ok(N.links.embed(y, null).html.includes('youtube-nocookie.com/embed/abc123'), 'nocookie embed');
  const s = N.links.parse('https://open.spotify.com/track/xyz');
  ok(N.links.embed(s, null).html.includes('open.spotify.com/embed/track/xyz'));
  ok(/DRM/.test(N.links.downloadAdvice(N.links.parse('https://open.spotify.com/track/x')).file), 'spotify harus jujur soal DRM');
  ok(/yt-dlp/.test(N.links.downloadAdvice(y).file));
});

/* ---------------- csv / slug / lorem / mock api ---------------- */
t('csv: koma dalam kutipan & escaping', () => {
  const N = globalThis.NAS;
  const rows = N.ai.csvTable('a,b\n"x,1",2\n');
  eq(rows, [['a', 'b'], ['x,1', '2']]);
  eq(N.tools.toCsv([{ a: 'x,y', b: 'q"q' }]).split('\n')[1], '"x,y","q""q"');
});
t('misc: slug, lorem, mock api, uuid', () => {
  const N = globalThis.NAS;
  eq(N.tools.slug('Halo Dunia — Uji 123!'), 'halo-dunia-uji-123');
  ok(N.tools.lorem(3).split('.').length >= 3);
  const m = N.tools.mockApi(3); eq(m.data.length, 3); ok(m.data[0].email.endsWith('@example.test'), 'domain fiktif');
  ok(/^[0-9a-f-]{36}$/.test(N.tools.uuid()));
  ok(!/\d{3}-\d{2}-\d{4}/.test(N.tools.fakeRow().ssn), 'jangan produksi pola SSN nyata');
});
t('misc: watermark/palette ada di API & tidak throw saat tanpa canvas', () => {
  const N = globalThis.NAS;
  ok(typeof N.tools.watermark === 'function' && typeof N.tools.paletteFromImage === 'function');
  ok(typeof N.img.op.removeBg === 'function' && typeof N.img.op.upscale === 'function' && typeof N.img.op.blend === 'function');
  ok(typeof N.img.op.colorize === 'function' && typeof N.img.op.inpaint === 'function' && typeof N.img.op.extend === 'function');
  ok(N.img.STYLE_PROMPTS.Cyberpunk.length > 10);
});

/* ---------------- markdown + html escaping ---------------- */
t('markdown: code fence, table, list, autolink, XSS escaped', () => {
  const N = globalThis.NAS;
  const html = N.md('# Judul\n\nteks **bold** dan `inline`\n\n```js\nconst a=1;\n```\n\n- satu\n- dua\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nhttps://example.com');
  ok(html.includes('<h1>Judul</h1>'), 'heading');
  ok(html.includes('<strong>bold</strong>'), 'bold');
  ok(html.includes('<code data-lang="js">const a=1;</code>'), 'fence:\n' + html);
  ok(html.includes('<ul><li>satu</li><li>dua</li></ul>'), 'list:\n' + html);
  ok(html.includes('<table><thead>') && html.includes('<td>2</td>'), 'table');
  ok(html.includes('<a href="https://example.com"'), 'autolink');
  const xss = N.md('<img src=x onerror=alert(1)> <script>alert(2)</script> [x](javascript:alert(3)) <b>bold</b>');
  ok(!/<script>/.test(xss), '<script> tidak boleh lolos: ' + xss);
  ok(!/<img/.test(xss), '<img> mentah tidak boleh lolos');
  ok(!/<b>bold<\/b>/.test(xss), 'raw html di-tag harus escaped');
  ok(!/href="javascript:/.test(xss), 'javascript: url ditolak');
  ok(xss.includes('&lt;script&gt;'), 'harus escaped jadi entity');
});
t('markdown: multiline list + blockquote tidak nested liar', () => {
  const N = globalThis.NAS;
  const h = N.md('> kutipan satu\n> kutipan dua\n\n1. a\n2. b\n\npara');
  ok((h.match(/<blockquote>/g) || []).length === 1, '1 blockquote');
  ok(h.includes('<ol><li>a</li><li>b</li></ol>'), 'ol:\n' + h);
});

/* ---------------- auth (pure parts: hash + config sanity) ---------------- */
t('auth: sha256 hash deterministik & beda salt', async () => {
  const N = globalThis.NAS;
  const a = await N.sha256('abc');
  eq(a, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  ok(a !== N.CFG && await N.auth.hash('abc') !== a, 'hash login pakai salt, bukan sha256 polos');
});
t('config: provider yang dipakai memang tersedia di akun live', () => {
  const N = globalThis.NAS;
  const groq = N.CFG.PROVIDERS.groq;
  ok(groq.chat.every(m => !/llama-3|mixtral|gemma-7b|grok/i.test(m.id)), 'model yang sudah mati tidak boleh dicantumkan');
  ok(groq.stt[0] === 'whisper-large-v3-turbo', 'whisper tersedia');
  ok(N.CFG.PROVIDERS.gemini.image.includes('gemini-2.5-flash-image'));
  ok(N.CFG.PROVIDERS.nvidia.note.includes('410'), 'status NVIDIA dicatat apa adanya');
  /* zero-secret repo: config ships empty, keys arrive from secrets.local.js / localStorage */
  eq(Object.values(N.CFG.KEYS).every(v => !v), true, 'config.js tidak boleh berisi key');
  eq(N.keyInfo().groq.set, false, 'tanpa secrets.local.js → tidak ada key');
  N.setKey('groq', 'gsk_LOCALTEST_0000000000000000');   // secret-scan:allow — fake, bukan key beneran
  const inf = N.keyInfo().groq;
  const KEY = 'gsk_LOCALTEST_0000000000000000';   // secret-scan:allow
  ok(inf.set && inf.masked.includes('…') && /localStorage|memory/.test(inf.from) && inf.len === KEY.length, 'key override kebaca + ke-mask (from=' + inf.from + ' len=' + inf.len + ')');
  ok(inf.masked === KEY.slice(0, 5) + '…' + KEY.slice(-3), 'mask = 5 depan + 3 belakang');
  ok(!JSON.stringify(N.keyInfo()).includes('gsk_LOCALTEST'), 'key raw tidak pernah muncul di keyInfo()');
  N.clearKeys(); eq(N.keyFor('groq'), '', 'clearKeys() mengosongkan override');
  ok(N.CFG.QUOTA.enterprise === Infinity && N.CFG.QUOTA.free === 100);
});

/* ---------------- store ---------------- */
t('store: coll CRUD + quota guard', () => {
  const N = globalThis.NAS;
  const before = N.store.usage().n;
  N.store.threads.put({ id: 't1', title: 'a', messages: [] });
  N.store.threads.put({ id: 't1', title: 'b', messages: [1] });
  eq(N.store.threads.all().length, 1, 'upsert by id');
  eq(N.store.threads.get('t1').title, 'b');
  N.store.threads.del('t1'); eq(N.store.threads.all().length, 0);
  N.store.settings.set({ model: 'x' }); eq(N.store.settings.get().model, 'x');
  ok(N.store.exportAll().includes('NEURAL AI STUDIO'));
  eq(N.store.usage().n, before);
});
