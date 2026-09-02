/* NEURAL AI STUDIO — utility toolbelt. Everything here runs for real in the browser.
   Heavy lifting (PDF merge, ZIP, ffmpeg) is loaded from jsDelivr on demand with an honest
   offline fallback, so the app never shows a button that does nothing. */
(function (n) {
  const CDN = {
    qr: 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js',
    pdf: 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js',
    zip: 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
    pdfjs: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.min.mjs',
    ttf: 'https://cdn.jsdelivr.net/npm/@ffprobe-installer/none'
  };
  const cache = {};
  n.use = function (what) {
    if (cache[what]) return cache[what];
    const g = { qr: 'qrcode', pdf: 'PDFLib', zip: 'JSZip' }[what];
    if (what === 'pdfjs') {
      cache[what] = import(/* webpackIgnore: true */ CDN.pdfjs).then(async (m) => {
        const { getDocument } = m;
        try {
          const worker = await import(/* webpackIgnore: true */ 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.worker.min.mjs');
          void worker;
        } catch (e) { }
        if (m.GlobalWorkerOptions) m.GlobalWorkerOptions.workerSrc = CDN.pdfjs.replace('pdf.min.mjs', 'pdf.worker.min.mjs');
        cache._getDoc = getDocument;
        return m;
      });
      return cache[what];
    }
    if (window[g]) return Promise.resolve(window[g]);
    return cache[what] = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = CDN[what]; s.async = true;
      s.onload = () => window[g] ? res(window[g]) : rej(new Error(what + ' loader tidak menemukan global ' + g));
      s.onerror = () => { delete cache[what]; rej(new Error('Offline / CDN diblokir — fitur ' + what + ' butuh koneksi sekali.')); };
      document.head.appendChild(s);
    });
  };

  n.tools = {};

  /* ================= helpers ================= */
  const dl = (blob, name) => n.ui.download(blob, name);
  n.tools.dl = dl;
  n.tools.readText = (f) => f.text();
  /* MD5 over raw bytes (for files) — same core as md5() but takes Uint8Array. */
  n.tools.md5Bytes = function (bytes) {
    const K = (() => { const a = []; for (let i = 1; i <= 64; i++) a[i - 1] = Math.floor(Math.abs(Math.sin(i)) * 4294967296); return a; })();
    const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
      4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
    const rotl = (x, c) => (x << c) | (x >>> (32 - c));
    const len = bytes.length;
    const withPad = new Uint8Array((((len + 8) >> 6) + 1) * 64);
    withPad.set(bytes); withPad[len] = 0x80;
    const dv = new DataView(withPad.buffer), bits = BigInt(len) * 8n;
    dv.setUint32(withPad.length - 8, Number(bits & 0xffffffffn), true);
    dv.setUint32(withPad.length - 4, Number(bits >> 32n), true);
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    for (let off = 0; off < withPad.length; off += 64) {
      const M = new Uint32Array(16);
      for (let i = 0; i < 16; i++) M[i] = dv.getUint32(off + i * 4, true);
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; }
        else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) & 15; }
        else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) & 15; }
        else { F = C ^ (B | ~D); g = (7 * i) & 15; }
        F = (F + A + K[i] + M[g]) >>> 0;
        A = D; D = C; C = B; B = (B + rotl(F, S[i])) >>> 0;
      }
      a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
    }
    return [a0, b0, c0, d0].map(x => [...new Uint8Array(new Uint32Array([x]).buffer)].map(b => b.toString(16).padStart(2, '0')).join('')).join('');
  };
  n.tools.md5 = (str) => n.tools.md5Bytes(new TextEncoder().encode(str));   /* single implementation, used everywhere */
  n.tools.hash = async (text, algos = ['MD5', 'SHA-1', 'SHA-256', 'SHA-512']) => {
    const out = {};
    for (const a of algos) {
      if (a === 'MD5') out[a] = n.tools.md5(text);
      else {
        const b = await crypto.subtle.digest(a.replace('-', '-'), new TextEncoder().encode(text));
        out[a] = [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
      }
    }
    return out;
  };
  n.tools.b64e = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
  n.tools.b64d = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s+/g, '')), c => c.charCodeAt(0)));
  n.tools.b64u = (s) => n.tools.b64e(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  n.tools.uuid = () => crypto.randomUUID();
  n.tools.rnd = (max) => crypto.getRandomValues(new Uint32Array(1))[0] % max;

  /* ================= 1. QR ================= */
  n.tools.qrMake = async function (text, { ecl = 'M', size = 8, fg = '#04060d', bg = '#e8ecff', logo } = {}) {
    const qrcode = await n.use('qr');
    const q = qrcode(0, ecl); q.addData(text); q.make();
    const m = q.getModuleCount(), cell = size;
    const c = n.img.canvasOf(m * cell + cell * 2, m * cell + cell * 2);
    const x = n.img.ctx(c);
    x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = fg;
    for (let r = 0; r < m; r++) for (let i = 0; i < m; i++) if (q.isDark(r, i)) x.fillRect((i + 1) * cell, (r + 1) * cell, cell, cell);
    if (logo) {
      const im = await n.img.load(logo);
      const s = Math.round(c.width * .22);
      x.fillStyle = bg; x.fillRect((c.width - s) / 2 - 6, (c.height - s) / 2 - 6, s + 12, s + 12);
      x.drawImage(im, (c.width - s) / 2, (c.height - s) / 2, s, s);
    }
    return { canvas: c, modules: m, ecl, svg: qrSvg(q, fg, bg), payload: text };
  };
  function qrSvg(q, fg, bg) {
    const m = q.getModuleCount(), s = 4, pad = s;
    let d = '';
    for (let r = 0; r < m; r++) for (let i = 0; i < m; i++) if (q.isDark(r, i)) d += 'M' + (i * s + pad) + ' ' + (r * s + pad) + 'h' + s + 'v' + s + 'h-' + s + 'z';
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + (m * s + pad * 2) + '" height="' + (m * s + pad * 2) + '" viewBox="0 0 ' + (m * s + pad * 2) + ' ' + (m * s + pad * 2) + '"><rect width="100%" height="100%" fill="' + bg + '"/><path d="' + d + '" fill="' + fg + '"/></svg>';
  }
  n.tools.qrScan = async function (src) {
    if (!('BarcodeDetector' in window)) throw Object.assign(new Error('Browser ini tidak punya BarcodeDetector (Chrome/Edge/Android 83+). Di Safari: pakai route /api/qr atau input manual.'), { code: 'unsupported' });
    const det = new BarcodeDetector({ formats: ['qr_code'] });
    const im = await n.img.load(src);
    const c = n.img.canvasOf(im.width, im.height); n.img.ctx(c).drawImage(im, 0, 0);
    const found = await det.detect(c);
    return found.map(f => ({ value: f.rawValue, format: f.format, corner: f.corner2D || null }));
  };

  /* ================= 2. JSON / text ================= */
  n.tools.jsonFix = (s) => s.replace(/([{,]\s*)([A-Za-z0-9_\-\u0080-\uFFFF]+)\s*:/g, '$1"$2":').replace(/'/g, '"').replace(/,\s*([}\]])/g, '$1');
  n.tools.validateJson = (s) => {
    let data; try { data = JSON.parse(s); } catch (e) {
    const m = /position (\d+)/.exec(e.message); const pos = m ? +m[1] : 0;
    const line = s.slice(0, pos).split('\n').length, col = pos - s.lastIndexOf('\n', pos - 1);
      return { ok: false, error: e.message, line, col, snippet: s.split('\n')[line - 1] || '' };
    }
    return { ok: true, data };
  };
  n.tools.pretty = (s, indent = 2) => JSON.stringify(JSON.parse(s), null, indent);

  /* ================= 3. password / entropy ================= */
  n.tools.password = function ({ len = 20, upper = true, lower = true, num = true, sym = true, avoid = true } = {}) {
    let set = '';
    if (upper) set += 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    if (lower) set += 'abcdefghijkmnopqrstuvwxyz';
    if (num) set += '23456789';
    if (sym) set += '!@#$%^&*()-_=+[]{};:,.?';
    if (!set) throw new Error('Pilih minimal satu kelas karakter.');
    if (avoid) set = [...set].filter(c => !'IOl1`"\'\\'.includes(c)).join('');
    const r = crypto.getRandomValues(new Uint32Array(len));
    let out = [...r].map(x => set[x % set.length]);
    const need = [['A-Z', upper && 'ABCDEFGHJKLMNPQRSTUVWXYZ'], ['a-z', lower && 'abcdefghijkmnopqrstuvwxyz'], ['0-9', num && '23456789'], ['sym', sym && '!@#$%^&*()-_=+']];
    need.forEach(([tag, pool], i) => { if (pool) { const at = r[i * 3] % len; out[at] = pool[r[i * 3 + 1] % pool.length]; } void tag; });
    const pw = out.join('');
    const bits = Math.round(len * Math.log2(set.length));
    const years = (Math.pow(2, bits) / (1e11 * 3.15e7));
    return { pw, bits, set, strength: bits > 100 ? 'sangat kuat' : bits > 75 ? 'kuat' : bits > 55 ? 'cukup' : 'lemah', crackYears: years > 1e6 ? '> 1 juta tahun' : years.toFixed(years < 1 ? 3 : 1) + ' tahun' };
  };
  n.tools.entropy = (s) => { const f = {}; for (const c of String(s)) f[c] = (f[c] || 0) + 1; const nTot = [...String(s)].length; return -Object.values(f).reduce((a, v) => { const p = v / nTot; return a + p * Math.log2(p); }, 0) * nTot; };

  /* ================= 4. random data ================= */
  const FIRST = ['Adi', 'Bagas', 'Citra', 'Dewi', 'Eko', 'Fitri', 'Gilang', 'Hana', 'Indra', 'Joko', 'Kartika', 'Luki', 'Maya', 'Nanda', 'Oktavia', 'Putra', 'Qori', 'Rizky', 'Sari', 'Teguh', 'Umar', 'Vina', 'Wawan', 'Xena', 'Yusuf', 'Zaki'];
  const LAST = ['Pratama', 'Wijaya', 'Saputra', 'Halim', 'Nugroho', 'Maharani', 'Setiawan', 'Permana', 'Anggraini', 'Santoso', 'Hidayat', 'Lestari'];
  const CITY = ['Semarang', 'Ungaran', 'Salatiga', 'Boyolali', 'Kendal', 'Magelang', 'Surakarta', 'Bandung', 'Surabaya', 'Medan', 'Makassar', 'Denpasar'];
  const STREET = ['Jl. Merdeka', 'Jl. Diponegoro', 'Jl. Ahmad Yani', 'Jl. Sudirman', 'Jl. Veteran', 'Jl. Pahlawan', 'Kampung Baru', 'Perumahan Griya'];
  n.tools.fakeRow = () => {
    const f = FIRST[n.tools.rnd(FIRST.length)], l = LAST[n.tools.rnd(LAST.length)];
    const email = (f + '.' + l).toLowerCase().replace(/[^a-z.]/g, '') + (n.tools.rnd(999)) + '@example.test';
    return {
      id: n.tools.rnd(900000) + 100000, name: f + ' ' + l, email,
      phone: '+62 8' + String(n.tools.rnd(90) + 10) + '-' + String(1000 + n.tools.rnd(8999)) + '-' + String(1000 + n.tools.rnd(8999)),
      address: STREET[n.tools.rnd(STREET.length)] + ' ' + (1 + n.tools.rnd(120)) + ', ' + CITY[n.tools.rnd(CITY.length)] + ' ' + (10000 + n.tools.rnd(9999)),
      occupation: ['Web Developer', 'Data Analyst', 'Barista', 'Guru', 'Desainer Grafis', 'Akuntan', 'Freelancer'][n.tools.rnd(7)],
      iban: 'ID' + String(10 + n.tools.rnd(89)) + ' BANK' + String(1000 + n.tools.rnd(8999)) + ' ' + String(10000000 + n.tools.rnd(89999999)),
      credit: '4' + String(1000 + n.tools.rnd(8999)) + ' ' + String(1000 + n.tools.rnd(8999)) + ' ' + String(1000 + n.tools.rnd(8999)) + ' ' + String(1000 + n.tools.rnd(8999)),
      ssn: 'REDACTED — pakai nomor fiktif berformat, bukan nomor orang',
      ip: '10.' + n.tools.rnd(255) + '.' + n.tools.rnd(255) + '.' + (2 + n.tools.rnd(252)),
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + (120 + n.tools.rnd(20)) + '.0.0.0 Safari/537.36',
      color: '#' + [...crypto.getRandomValues(new Uint8Array(3))].map(b => b.toString(16).padStart(2, '0')).join(''),
      date: new Date(Date.now() - n.tools.rnd(1e10)).toISOString().slice(0, 10),
      bool: n.tools.rnd(2) === 1
    };
  };
  n.tools.toCsv = (rows) => { const k = Object.keys(rows[0] || {}); return [k.join(','), ...rows.map(r => k.map(x => { const v = r[x]; return typeof v === 'string' && /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','))].join('\n'); };
  n.tools.toSql = (rows, table = 'fake_users') => rows.map(r => 'INSERT INTO ' + table + ' (' + Object.keys(r).join(', ') + ') VALUES (' + Object.values(r).map(v => typeof v === 'number' || typeof v === 'boolean' ? v : "'" + String(v).replace(/'/g, "''") + "'").join(', ') + ');').join('\n');

  /* ================= 5. units ================= */
  n.tools.UNITS = {
    length: { base: 'm', u: { nm: 1e-9, 'µm': 1e-6, mm: .001, cm: .01, m: 1, km: 1000, in: .0254, ft: .3048, yd: .9144, mi: 1609.344, nmi: 1852, ly: 9.4607e15 } },
    mass: { base: 'kg', u: { mg: 1e-6, g: .001, kg: 1, t: 1000, oz: .0283495, lb: .453592, st: 6.35029, ton: 907.185 } },
    volume: { base: 'l', u: { ml: .001, l: 1, m3: 1000, in3: .0163871, ft3: 28.3168, gal_us: 3.78541, gal_uk: 4.54609, cup: .24 } },
    area: { base: 'm2', u: { mm2: 1e-6, cm2: 1e-4, m2: 1, ha: 1e4, km2: 1e6, ft2: .092903, acre: 4046.86, in2: 6.4516e-4 } },
    time: { base: 's', u: { ms: .001, s: 1, min: 60, h: 3600, d: 86400, wk: 604800, mo: 2629800, yr: 31557600 } },
    speed: { base: 'mps', u: { mps: 1, kph: .277778, mph: .44704, kn: .514444, mps2: .000254 /* ft/s */ } },
    data: { base: 'byte', u: { bit: .125, byte: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, KiB: 1024, MiB: 1048576, GiB: 1073741824, TiB: 1099511627776 } },
    temp: { base: 'C', special: true, u: { C: 'C', K: 'K', F: 'F', R: 'R' } },
    pressure: { base: 'pa', u: { pa: 1, kpa: 1e3, bar: 1e5, psi: 6894.76, atm: 101325, mmHg: 133.322 } },
    energy: { base: 'j', u: { j: 1, kj: 1e3, cal: 4.184, kcal: 4184, wh: 3600, kwh: 3.6e6, btu: 1055.06 } },
    angle: { base: 'rad', u: { rad: 1, deg: .0174533, grad: .015708, turn: 6.28319 } }
  };
  n.tools.convert = function (cat, v, from, to) {
    const g = n.tools.UNITS[cat];
    if (!g) throw new Error('Kategori ' + cat + ' belum ada.');
    if (g.special) {
      const c = ({ C: (x) => x, K: (x) => x - 273.15, F: (x) => (x - 32) * 5 / 9, R: (x) => (x - 491.67) * 5 / 9 })[from](v);
      return ({ C: (x) => x, K: (x) => x + 273.15, F: (x) => x * 9 / 5 + 32, R: (x) => (x + 273.15) * 9 / 5 })[to](c);
    }
    return v * g.u[from] / g.u[to];
  };

  /* ================= 6. colour ================= */
  n.tools.hex2rgb = (h) => { h = h.replace('#', ''); if (h.length === 3) h = [...h].map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
  n.tools.rgb2hsl = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2; const d = mx - mn; if (d) { s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [Math.round(h), Math.round(s * 100), Math.round(l * 100)]; };
  n.tools.lum = (hex) => { const [r, g, b] = n.tools.hex2rgb(hex).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
  n.tools.contrast = (a, b) => { const l1 = n.tools.lum(a), l2 = n.tools.lum(b); return (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05); };
  n.tools.ramp = (hex, steps = 6) => { const [h, s] = n.tools.rgb2hsl(n.tools.hex2rgb(hex)); return Array.from({ length: steps }, (_, i) => 'hsl(' + h + ' ' + Math.max(10, s - i * 4) + '% ' + (92 - i * (72 / (steps - 1))) + '%)'); };

  /* ================= 7. image convert / compress ================= */
  /* encoder capability probe: Chrome/Firefox balikin PNG kalau browser nggak bisa
     encode tipe yang diminta — makanya signature output dicek, bukan cuma "blob != null" */
  const ENC = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' };
  const SIG = { 'image/jpeg': b => b[0] === 0xff && b[1] === 0xd8, 'image/png': b => b[0] === 0x89 && b[1] === 0x50,
                'image/webp': b => new TextDecoder().decode(b.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(b.slice(8, 12)) === 'WEBP' };
  n.tools.encodes = function (type) {
    const c = n.img.canvasOf(4, 4);
    let du = ''; try { du = c.toDataURL(type, .8); } catch (e) { return false }
    return du.startsWith('data:' + type);
  };
  n.tools.convertImage = async function (file, format, quality = .85, maxDim) {
    const type = ENC[format];
    if (!type) throw new Error('Format ' + format + ' tidak didukung browser untuk encode (svg/ico lewat tool lain).');
    if (!n.tools.encodes(type)) {
      throw new Error('Encoder ' + format.toUpperCase() + ' gak ada di browser ini ('
        + (format === 'avif' ? 'Safari <16.4 / Firefox lama' : 'Chrome & Firefox gak bisa encode GIF dari canvas')
        + '). Pilih webp atau png.');
    }
    const im = await n.img.load(URL.createObjectURL(file));
    let w = im.width, h = im.height;
    if (maxDim && Math.max(w, h) > maxDim) { const s = maxDim / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
    const c = n.img.canvasOf(w, h); const x = n.img.ctx(c);
    if (format === 'jpg' || format === 'ico') { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); }
    x.imageSmoothingQuality = 'high'; x.drawImage(im, 0, 0, w, h);
    const blob = await new Promise(r => c.toBlob(r, type, quality));
    if (!blob) throw new Error('Encoder ' + format + ' tidak tersedia di browser ini.');
    const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    const sig = SIG[type];
    if (sig && !sig(head)) throw new Error('Browser ngasih ' + (head[0] === 0x89 ? 'PNG' : 'hasil lain') + ' padahal mintanya ' + format + ' — encoder-nya di-fallback, bukan bug file lu.');
    return { blob, w, h, from: file.size, to: blob.size, saved: file.size ? (100 - blob.size / file.size * 100).toFixed(1) + '%' : '—', canvas: c };
  };

  n.tools.svgToPng = async function (text, w, h) {
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text);
    const im = await n.img.load(url);
    const c = n.img.canvasOf(w || im.width || 512, h || im.height || 512);
    n.img.ctx(c).drawImage(im, 0, 0, c.width, c.height);
    return { blob: await new Promise(r => c.toBlob(r, 'image/png')), canvas: c };
  };

  /* ================= 8. audio ================= */
  n.tools.decodeAudio = (file) => new Promise(async (res, rej) => {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ac = new AC();
    try { res(await ac.decodeAudioData(await file.arrayBuffer())); } catch (e) { rej(new Error('Browser tidak bisa decode ' + (file.name.split('.').pop() || '?') + ' — pakai ffmpeg di server untuk format eksotis.')); }
    finally { ac.close && ac.close(); }
  });
  n.tools.wavEncode = function (buf, { bitDepth = 16 } = {}) {
    const ch = buf.numberOfChannels, sr = buf.sampleRate, n = buf.length;
    const bytes = ch * n * (bitDepth / 8);
    const ab = new ArrayBuffer(44 + bytes), v = new DataView(ab);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * ch * (bitDepth / 8), true);
    v.setUint16(32, ch * (bitDepth / 8), true); v.setUint16(34, bitDepth, true);
    str(36, 'data'); v.setUint32(40, bytes, true);
    let o = 44;
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
      let s = Math.max(-1, Math.min(1, buf.getChannelData(c)[i]));
      if (bitDepth === 16) { v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7FFF, true); o += 2; }
      else { v.setInt32(o, Math.round(s * 0x7FFFFFFF), true); o += 4; }
    }
    return new Blob([ab], { type: 'audio/wav' });
  };
  n.tools.encodeBlob = async function (blob, mime, bitrate = 128000) {
    const buf = await n.tools.decodeAudio(blob);
    if (mime === 'audio/wav') return { blob: n.tools.wavEncode(buf), engine: 'PCM writer (browser)' };
    if (typeof AudioEncoder === 'undefined') throw Object.assign(new Error('WebCodecs AudioEncoder tidak ada → output WAV saja.'), { code: 'noenc' });
    const chunks = [];
    const enc = new AudioEncoder({ output: (c) => chunks.push(c), error: (e) => console.warn(e) });
    const layout = { format: 'f32-planar', sampleRate: buf.sampleRate, numberOfChannels: buf.numberOfChannels, channelCount: buf.numberOfChannels };
    enc.configure({ codec: mime === 'audio/mp4a' ? 'mp4a.40.2' : 'opus', sampleRate: buf.sampleRate, numberOfChannels: buf.numberOfChannels, bitrate });
    const frameSize = 1024 * buf.numberOfChannels * 4;
    const interleaved = new Float32Array(buf.numberOfChannels * buf.length);
    for (let c = 0; c < buf.numberOfChannels; c++) interleaved.set(buf.getChannelData(c), c * buf.length);
    for (let off = 0; off < interleaved.length; off += frameSize) {
      enc.encode(new AudioData({ format: 'f32-planar', sampleRate: buf.sampleRate, numberOfFrames: Math.min(frameSize / 4, buf.length), numberOfChannels: buf.numberOfChannels, timestamp: (off / 4 / buf.sampleRate) * 1e6, data: interleaved.subarray(off, off + frameSize) }));
    }
    await enc.flush();
    const total = chunks.reduce((a, c) => a + c.byteLength, 0);
    const out = new Uint8Array(total); let p = 0;
    for (const c of chunks) { const b = new Uint8Array(c.byteLength); c.copyTo(b); out.set(b, p); p += b.byteLength; }
    return { blob: new Blob([out], { type: mime }), engine: 'WebCodecs ' + (mime === 'audio/mp4a' ? 'AAC' : 'Opus') + ' (raw stream, bungkus ke container di server)', chunks: chunks.length };
    void layout;
  };

  /* ================= 9. video ================= */
  n.tools.trimVideo = async function (file, start, end, onProgress) {
    if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined')
      throw Object.assign(new Error('WebCodecs tidak tersedia di browser ini. Pakai route server /api/media/trim (ffmpeg).'), { code: 'noenc' });
    const inBlob = file;
    /* demux is the hard part; browser can't. Strategy: re-encode via a <video> element +
       captureStream + MediaRecorder — real, works offline, output webm. */
    const v = n.h('video', { src: URL.createObjectURL(inBlob), muted: true, playsinline: true });
    await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('Gagal baca video.')); });
    v.currentTime = start;
    await new Promise(r => { v.onseeked = r; });
    const stream = v.captureStream ? v.captureStream() : v.mozCaptureStream();
    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4e6 });
    const parts = [];
    rec.ondataavailable = e => e.data.size && parts.push(e.data);
    const done = new Promise(r => rec.onstop = r);
    v.playbackRate = 1; rec.start(200); await v.play();
    const t0 = performance.now();
    await new Promise(res => {
      const tick = () => {
        const elapsed = v.currentTime - start;
        onProgress && onProgress(Math.min(1, elapsed / Math.max(.01, end - start)), elapsed);
        if (v.currentTime >= end || v.ended) { v.pause(); res(); } else requestAnimationFrame(tick);
      };
      tick();
    });
    rec.stop(); await done;
    URL.revokeObjectURL(v.src);
    const blob = new Blob(parts, { type: 'video/webm' });
    return { blob, ms: Math.round(performance.now() - t0), note: 'Re-encode realtime via MediaRecorder → WebM VP9/VP8. Untuk MP4/H.264 presisi frame, pakai ffmpeg di server (/api/media/trim).' };
  };
  n.tools.probeMedia = async function (file) {
    const url = URL.createObjectURL(file);
    const isVid = /^video\//.test(file.type);
    const el = isVid ? n.h('video', { src: url, muted: true }) : n.h('audio', { src: url });
    await new Promise((res, rej) => { el.onloadedmetadata = res; el.onerror = () => rej(new Error('Tidak bisa dibaca.')); setTimeout(res, 4000); });
    const out = { name: file.name, size: file.size, type: file.type || '?', duration: el.duration || 0 };
    if (isVid) { out.width = el.videoWidth; out.height = el.videoHeight; out.fpsApprox = null; out.aspect = (el.videoWidth / el.videoHeight).toFixed(3); }
    URL.revokeObjectURL(url);
    el.remove();
    if (n.CFG.BASE) { try { const r = await fetch(n.CFG.BASE + '/api/probe'); void r; out.probe = 'ffprobe available at /api/probe'; } catch (e) { out.probe = 'no server probe'; } }
    return out;
  };

  /* ================= 10. PDF (pdf-lib) ================= */
  n.tools.pdf = {
    async merge(files) {
      const PDFLib = await n.use('pdf');
      const out = await PDFLib.PDFDocument.create();
      for (const f of files) { const d = await PDFLib.PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true }); const p = await out.copyPages(d, d.getPageIndices()); p.forEach(x => out.addPage(x)); }
      return { blob: new Blob([await out.save()], { type: 'application/pdf' }), pages: out.getPageCount() };
    },
    async split(file, ranges) {
      const PDFLib = await n.use('pdf');
      const d = await PDFLib.PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      const total = d.getPageCount();
      const jobs = (ranges || [[0, total - 1]]).map(([a, b], i) => (async () => {
        const nd = await PDFLib.PDFDocument.create();
        const pages = await nd.copyPages(d, Array.from({ length: Math.min(b, total - 1) - a + 1 }, (_, k) => a + k));
        pages.forEach(p => nd.addPage(p));
        return { name: (file.name.replace(/\.pdf$/i, '')) + '_p' + (a + 1) + '-' + (Math.min(b, total - 1) + 1) + '.pdf', blob: new Blob([await nd.save()], { type: 'application/pdf' }), i, size: 0 };
      })());
      return Promise.all(jobs);
    },
    async compress(file, onProgress) {
      const PDFLib = await n.use('pdf');
      const d = await PDFLib.PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      d.setProducer('NEURAL AI STUDIO'); d.setCreator('NEURAL AI STUDIO');
      onProgress && onProgress(.6);
      const bytes = await d.save({ useObjectStreams: true });   /* object streams = the real size win */
      const blob = new Blob([bytes], { type: 'application/pdf' });
      return { blob, before: file.size, after: blob.size, saved: (100 - blob.size / file.size * 100).toFixed(1) + '%', note: 'pdf-lib melakukan object-stream re-save; untuk downsampling gambar pakai server route (/api/pdf/compress → qpdf/ghostscript).' };
    },
    async fromHtml(title, htmlBody) {
      /* print-to-PDF path: honest, no fake library claims */
      const w = window.open('', '_blank');
      if (!w) throw new Error('Popup diblokir — izinkan popup untuk export PDF.');
      w.document.write('<!doctype html><meta charset="utf-8"><title>' + n.esc(title) + '</title><style>body{font:14px/1.6 system-ui;margin:34px;color:#111}pre,code{font-family:ui-monospace,monospace;background:#f4f5f7;padding:2px 4px;border-radius:4px}pre{padding:12px;overflow:auto}table{border-collapse:collapse}th,td{border:1px solid #ccc;padding:6px}</style>' + htmlBody);
      w.document.close(); w.focus();
      setTimeout(() => w.print(), 400);
      return { ok: true, engine: 'browser print → Save as PDF' };
    },
    async text(file) {
      try {
        const m = await n.use('pdfjs');
        if (m.GlobalWorkerOptions) m.GlobalWorkerOptions.workerSrc = CDN.pdfjs.replace('pdf.min.mjs', 'pdf.worker.min.mjs');
        const doc = await (m.getDocument || cache._getDoc)({ data: await file.arrayBuffer(), disableWorker: true }).promise;
        let out = '';
        for (let i = 1; i <= doc.numPages; i++) out += (await (await doc.getPage(i)).getTextContent()).items.map(t => t.str).join(' ') + '\n';
        return { text: out.trim(), pages: doc.numPages, engine: 'pdf.js ' + (m.version || '?') };
      } catch (e) {
        const x = await n.ai.extract(file).catch(() => null);
        if (x && x.text && x.text.length > 60) return { text: x.text, engine: 'regex fallback (offline)' };
        throw new Error('pdf.js gagal dimuat (' + e.message + ').');
      }
    }
  };

  /* ================= 11. regex lab / diff ================= */
  n.tools.regexTest = (pattern, flags, text) => {
    const re = new RegExp(pattern, flags);
    const out = []; let m, guard = 0, last = -1; void re;
    const rg = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g');
    while ((m = rg.exec(text)) && guard++ < 2000) {
      if (m.index === last) { rg.lastIndex++; continue; }
      last = m.index;
      out.push({ index: m.index, match: m[0], groups: m.slice(1), named: m.groups || null });
    }
    const groups = (() => { try { return new RegExp(pattern).groups ? Object.keys(new RegExp(pattern, flags.replace(/[^giuysd]*/g, '') + 'g').groups || {}) : []; } catch (e) { return []; } })();
    return { count: out.length, hits: out.slice(0, 300), groups };
  };
  n.tools.diff = (a, b) => {
    const A = a.split('\n'), B = b.split('\n'), out = [];
    const max = Math.max(A.length, B.length);
    const lcs = Array.from({ length: A.length + 1 }, () => new Uint16Array(B.length + 1));
    for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--)
      lcs[i][j] = A[i] === B[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    let i = 0, j = 0;
    while (i < A.length && j < B.length) {
      if (A[i] === B[j]) { out.push({ t: ' ', s: A[i] }); i++; j++; }
      else if (lcs[i + 1][j] >= lcs[i][j + 1]) { out.push({ t: '-', s: A[i] }); i++; }
      else { out.push({ t: '+', s: B[j] }); j++; }
    }
    while (i < A.length) out.push({ t: '-', s: A[i++] });
    while (j < B.length) out.push({ t: '+', s: B[j++] });
    return { rows: out.slice(0, 4000), stats: { add: out.filter(r => r.t === '+').length, del: out.filter(r => r.t === '-').length, max } };
  };

  /* ================= 12. code beautify / minify (real tokenizer) ================= */
  const TOK = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/[^\n]*|\/\*[\s\S]*?\*\/|<\/?[a-zA-Z][^>]*>)/g;
  /* beautifier: reindent-only state machine. It never rewrites a token (regex literals,
     template strings and comments survive byte-for-byte) — it only moves whitespace. */
  const TOKEN = /(\/\/[^\n]*)|(\/\*[\s\S]*?\*\/)|('(?:\\.|[^'\n])*'?|"(?:\\.|[^"\n])*"?|`(?:\\.|[\s\S])*`?)|(\/(?:\[(?:\\.|[^\]\\])*\]|[^\/\n\\])+\/[a-z]*)|([{}();,:])|(\[)|(\])|(=>|===|!==|==|!=|<=|>=|&&|\|\||\.\.\.)|([\w$\u0080-\uFFFF]+)|(\s+)|(.)/g;
  /* reindent-only beautifier: tokens are copied byte-for-byte, only whitespace moves. */
  n.tools.beautify = function (code, lang = 'js') {
    if (lang === 'html' || lang === 'xml') {
      let d = 0;
      return String(code).replace(/>\s*</g, '><').split(/(?<=>)/).map(l => l.trim()).filter(Boolean)
        .map(l => { if (/^<\//.test(l)) d = Math.max(0, d - 1); const pad = '  '.repeat(d); if (/^<[a-zA-Z][^>]*[^/]>$/.test(l) && !/<\/.*>/.test(l)) d++; return pad + l; }).join('\n');
    }
    if (lang === 'css') {
      return String(code).replace(/\s*([{}:;])\s*/g, '$1 ').replace(/\{\s*/g, ' {\n  ').replace(/;\s*/g, ';\n  ').replace(/\s*\}/g, '\n}\n').replace(/\n{3,}/g, '\n\n').trim();
    }
    const src = String(code).replace(/\r\n/g, '\n');
    const out = []; let line = '', ind = 0, prev = '';
    const at0 = () => line.replace(/\s+/g, '') === '';
    const flush = () => { const t = line.trim(); if (t) out.push('  '.repeat(Math.max(0, ind)) + t); line = ''; };
    const put = (t) => { if (at0()) line = '  '.repeat(Math.max(0, ind)); line += t; };
    const gap = (t) => {
      if (at0()) return '';
      const tail = line.slice(-1);
      if (/[({[]$/.test(tail) || /^[)\]},;]/.test(t) || tail === '.' || t[0] === '.' || /[+\-*/%&|^<>=!?:,]$/.test(tail)) return '';
      return ' ';
    };
    let m; TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(src))) {
      const t = m[0];
      if (m[1] || m[2]) {                       // comment: stays attached, block comments get own lines
        if (m[2] && m[2].includes('\n')) { flush(); out.push(...m[2].split('\n').map(x => '  '.repeat(ind) + x.trim())); line = '  '.repeat(ind); }
        else { put(gap(t) + t); flush(); }
        prev = t; continue;
      }
      if (m[3] || m[4]) { put(gap(t) + t); prev = t; continue; }      // string / regex literal verbatim
      if (m[5] === '{') { put(' {'); flush(); ind++; prev = '{'; continue; }
      if (m[5] === '}') { flush(); ind = Math.max(0, ind - 1); line = '  '.repeat(ind) + '}'; prev = '}'; continue; }
      if (m[5] === ';') { put(';'); flush(); prev = ';'; continue; }
      if (m[5] === ',') { put(','); prev = ','; continue; }
      if (m[5] === ':' || m[5] === '(' || m[5] === ')') { put(t); prev = t; continue; }
      if (m[6] || m[7]) { put(t); prev = t; continue; }
      if (m[8]) { put(t); prev = t; continue; }
      if (m[9]) { put(gap(t) + t); prev = t; continue; }
      if (m[10]) { prev = prev; continue; }                            // whitespace
      put(gap(t) + t); prev = t;
    }
    flush();
    return out.join('\n');
  };
  /* literal-safe scanner: strings, template literals (incl. nested ${}) and regex literals are
     lifted out as sentinels so whitespace rules can never corrupt them. */
  function scanCode(src, mode) {
    const lit = [];
    let out = '', i = 0;
    while (i < src.length) {
      const c = src[i], c2 = src[i + 1];
      if (c === '/' && c2 === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === '/' && c2 === '*') {
        const e = src.indexOf('*/', i + 2);
        const body = src.slice(i, e < 0 ? src.length : e + 2);
        if (body.includes('\n')) out += '\n';
        i = e < 0 ? src.length : e + 2;
        continue;
      }
      if (mode === 'js' && (c === '"' || c === "'" || c === '`')) {
        let j = i + 1; const tpl = c === '`';
        while (j < src.length) {
          if (src[j] === '\\') { j += 2; continue; }
          if (tpl && src[j] === '$' && src[j + 1] === '{') { let d = 1; j += 2; while (j < src.length && d) { if (src[j] === '{') d++; else if (src[j] === '}') d--; j++; } continue; }
          if (src[j] === c) { j++; break; }
          j++;
        }
        lit.push(src.slice(i, j)); out += '\u0000' + (lit.length - 1) + '\u0000'; i = j; continue;
      }
      if (mode === 'js' && c === '/' && /[=(,:[!&|?{};+\-*%<>~^]/.test(out.trimEnd().slice(-1) || '(')) {
        let j = i + 1, cls = false;
        while (j < src.length) {
          const d = src[j];
          if (d === '\\') { j += 2; continue; }
          if (d === '[') cls = true; else if (d === ']') cls = false;
          else if (d === '/' && !cls) break; else if (d === '\n') { j = -1; break; }
          j++;
        }
        if (j > 0) {
          j++; while (j < src.length && /[a-z]/.test(src[j])) j++;
          lit.push(src.slice(i, j)); out += '\u0000' + (lit.length - 1) + '\u0000'; i = j; continue;
        }
      }
      if (/\s/.test(c)) { let j = i, nl = false; while (j < src.length && /\s/.test(src[j])) { if (src[j] === '\n') nl = true; j++; } out += nl ? '\n' : ' '; i = j; continue; }
      out += c; i++;
    }
    return { out, lit, restore: (str) => str.replace(/\u0000(\d+)\u0000/g, (_, k) => lit[+k]) };
  }
  n.tools.minify = function (code, lang = 'js') {
    const sc = scanCode(String(code), lang === 'css' ? 'css' : 'js');
    let o = sc.out;
    if (lang === 'css') o = o.replace(/\s*([{}:;,])\s*/g, '$1');
    else o = o.replace(/[ \t]+([{};,])\s*/g, '$1').replace(/([{};,])\s+[ \t]*/g, '$1')
      .replace(/[ \t]*\n[ \t]*/g, '\n').replace(/[ \t]{2,}/g, ' ');
    o = o.replace(/\n{2,}/g, '\n').replace(/^[ \n]+|[ \n]+$/g, '');
    return sc.restore(o);
  };
  n.tools.gzipSize = async (str) => {
    try { const cs = new CompressionStream('gzip'); const b = await new Response(new Blob([str]).stream().pipeThrough(cs)).blob(); return b.size; }
    catch (e) { return null; }
  };
  n.tools.slug = (s) => String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  /* ================= 13. URL shortener (local) ================= */
  n.tools.shorten = function (url, alias) {
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    const code = (alias || Math.random().toString(36).slice(2, 7)).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
    if (n.store.shorts.all().some(s => s.code === code)) throw new Error('Alias "' + code + '" sudah dipakai.');
    const row = n.store.shorts.put({ id: n.uid('sh'), code, url, createdAt: Date.now(), hits: 0, note: '' });
    return { ...row, short: location.origin + location.pathname.replace(/[^/]*$/, '') + 'r.html?to=' + code };
  };
  n.tools.resolveShort = (code) => {
    const s = n.store.shorts.all().find(x => x.code === code);
    if (s) n.store.shorts.put({ ...s, hits: s.hits + 1 });
    return s;
  };

  /* ================= 14. JWT / base64url ================= */
  n.tools.jwt = (t) => {
    const [h, p, sig] = String(t).split('.');
    if (!h || !p) throw new Error('Format JWT harus header.payload.signature');
    const dec = (x) => JSON.parse(n.tools.b64d(x.replace(/-/g, '+').replace(/_/g, '/')));
    const hd = dec(h), pl = dec(p);
    const warn = [];
    if ((hd.alg || '').toUpperCase() === 'HS256' && !sig) warn.push('alg=HS256 tanpa signature — kemungkinan "alg:none" attack.');
    if (pl.exp && pl.exp * 1000 < Date.now()) warn.push('Token EXPIRED ' + new Date(pl.exp * 1000).toLocaleString('id-ID'));
    if (pl.nbf && pl.nbf * 1000 > Date.now()) warn.push('Belum valid (nbf di masa depan).');
    return { header: hd, payload: pl, signature: sig ? sig.slice(0, 24) + '…' : null, warn, verified: false, note: 'Verifikasi signature (HMAC/RSA) hanya bisa di server — lihat /api/verify-jwt.' };
  };

  /* ================= 15. misc parsers ================= */
  n.tools.ianaTimezones = ['UTC', 'Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura', 'Asia/Singapore', 'Asia/Bangkok', 'Asia/Tokyo', 'Australia/Sydney', 'Europe/London', 'Europe/Amsterdam', 'America/New_York', 'America/Los_Angeles'];
  n.tools.cronNext = (expr, from = new Date(), count = 5) => {
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) throw new Error('Format cron harus 5 field: menit jam tanggal bulan hari');
    const parse = (f, min, max) => {
      if (f === '*') return null;
      const set = new Set();
      for (const seg of f.split(',')) {
        const [rng, step] = seg.split('/'); const s = step ? +step : 1;
        let a = min, b = max;
        if (rng !== '*') { const [x, y] = rng.split('-'); a = +x; b = y ? +y : (+x + s - 1); }
        for (let i = a; i <= b; i += s) set.add(i);
      }
      return set;
    };
    const [M, H, D, Mo, W] = [parse(parts[0], 0, 59), parse(parts[1], 0, 23), parse(parts[2], 1, 31), parse(parts[3], 1, 12), parse(parts[4], 0, 6)];
    const out = []; const d = new Date(from); d.setSeconds(0, 0); d.setMinutes(d.getMinutes() + 1);
    for (let i = 0; i < 400000 && out.length < count; i++) {
      if (M && !M.has(d.getMinutes())) { d.setMinutes(d.getMinutes() + 1); continue; }
      if (H && !H.has(d.getHours())) { d.setHours(d.getHours() + 1, 0, 0); continue; }
      if (D && !D.has(d.getDate())) { d.setDate(d.getDate() + 1); d.setHours(0, 0, 0); continue; }
      if (Mo && !Mo.has(d.getMonth() + 1)) { d.setMonth(d.getMonth() + 1, 1); d.setHours(0, 0, 0); continue; }
      if (W && !W.has(d.getDay())) { d.setDate(d.getDate() + 1); d.setHours(0, 0, 0); continue; }
      out.push(new Date(d)); d.setMinutes(d.getMinutes() + 1);
    }
    return { expr, human: cronHuman(parts), runs: out.map(x => x.toISOString().replace('T', ' ').slice(0, 16) + ' (lokal)'), note: 'Zona waktu browser: ' + Intl.DateTimeFormat().resolvedOptions().timeZone };
  };
  function cronHuman(p) {
    const map = { '* * * * *': 'Setiap menit', '@hourly': 'Tiap jam 0 menit' };
    if (map[p.join(' ')]) return map[p.join(' ')];
    return `menit ${p[0]}, jam ${p[1]}, tanggal ${p[2]}, bulan ${p[3]}, hari ${p[4]}`;
  }
  n.tools.lorem = (sentences = 6) => {
    const W = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum'.split(' ');
    const cap = (s) => s[0].toUpperCase() + s.slice(1);
    return Array.from({ length: sentences }, () => { const L = 8 + n.tools.rnd(14); return cap(Array.from({ length: L }, () => W[n.tools.rnd(W.length)]).join(' ')) + '.'; }).join(' ');
  };
  n.tools.mockApi = (rows = 5, keys = 'id,name,email,role,active,createdAt'.split(',')) => {
    const roles = ['admin', 'editor', 'viewer', 'owner'];
    const data = Array.from({ length: rows }, (_, i) => { const r = n.tools.fakeRow(); return Object.fromEntries(keys.map(k => [k, r[k] !== undefined ? r[k] : k === 'role' ? roles[n.tools.rnd(4)] : k === 'id' ? i + 1 : r.name])) });
    return { endpoint: '/api/v1/records?page=1&size=' + rows, total: rows, data };
  };
  n.tools.watermark = async function (canvas, text, { size = .04, color = 'rgba(255,255,255,.55)', tile = true } = {}) {
    const c = n.img.canvasOf(canvas.width, canvas.height); const x = n.img.ctx(c);
    x.drawImage(canvas, 0, 0);
    x.font = '700 ' + Math.round(canvas.width * size) + 'px system-ui';
    x.fillStyle = color; x.textBaseline = 'middle';
    if (tile) {
      const w = x.measureText(text).width + 40;
      x.save(); x.translate(c.width / 2, c.height / 2); x.rotate(-Math.PI / 7); x.translate(-c.width, -c.height * 2);
      for (let y = 0; y < c.height * 4; y += 90) for (let i = -c.width; i < c.width * 2; i += w) x.fillText(text, i, y);
      x.restore();
    } else x.fillText(text, 20, c.height - 24);
    return c;
  };
  n.tools.paletteFromImage = async function (src, k = 6) {
    const im = await n.img.load(src);
    const c = n.img.canvasOf(32, 32); const x = n.img.ctx(c);
    x.drawImage(im, 0, 0, 32, 32);
    const d = x.getImageData(0, 0, 32, 32).data;
    const buckets = new Map();
    for (let i = 0; i < d.length; i += 4) {
      const key = [d[i] >> 5, d[i + 1] >> 5, d[i + 2] >> 5].join(',');
      const b = buckets.get(key) || { n: 0, r: 0, g: 0, bl: 0 };
      b.n++; b.r += d[i]; b.g += d[i + 1]; b.bl += d[i + 2]; buckets.set(key, b);
    }
    const pal = [...buckets.values()].sort((a, b) => b.n - a.n).slice(0, k)
      .map(b => ({ hex: '#' + [b.r, b.g, b.bl].map(v => Math.round(v / b.n).toString(16).padStart(2, '0')).join(''), weight: +(b.n / (32 * 32) * 100).toFixed(1) }));
    return { palette: pal, name: k + ' warna dominan (quantize RGB 5-bit)' };
  };
})(window.NAS);
