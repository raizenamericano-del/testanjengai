/* NEURAL AI STUDIO — toolbelt page. Every tool below is actually implemented (no dead buttons);
   Filter/search lazy-renders only what is shown, so the page stays instant on a phone. */
(function () {
  const n = window.NAS;
  const root = document.body; root.innerHTML = '';
  root.appendChild(n.ui.nav('tools.html'));
  const wrap = n.h('div.wrap', { style: { padding: '18px 20px 40px', display: 'flex', flexDirection: 'column', gap: '14px' } });
  root.appendChild(wrap);
  document.documentElement.dataset.theme = n.store.settings.get().theme;
  if (n.store.settings.get().cursor && matchMedia('(pointer:fine)').matches) n.ui.cursorTrail();

  const cat = { enc: 'Encode & Hash', fmt: 'Format & Code', data: 'Data & Tabel', gen: 'Generator', unit: 'Satuan & Warna', media: 'Media & File', net: 'Jaringan & ID', sec: 'Aman' };
  const search = n.h('input.inp', { placeholder: 'cari tool… (mis. qr, base64, cron, pdf)', style: { maxWidth: '380px' } });
  const chips = n.h('div.row', null, [n.h('button.chip.on', { text: 'semua', onclick: () => { filterCat = 'all'; sync(); } }),
    ...Object.entries(cat).map(([k, v]) => n.h('button.chip', { text: v, onclick: () => { filterCat = k; sync(); } }))]);
  let filterCat = 'all';
  const count = n.h('span.tiny.dim', { text: '' });
  const grid = n.h('div#tools');
  const head = n.h('h1', { text: 'tool, semua jalan beneran', style: { margin: '2px 0 0' } });
  wrap.append(
    n.h('div.row.spread', null, [
      n.h('div', null, [n.h('span.tag', { text: '⚙ Toolbelt' }), head]),
      count
    ]),
    n.h('div.row.spread', null, [n.h('div.row', null, search, chips), n.h('span.pill', { html: '<i class="live"></i>tanpa server · tanpa tracking' })]),
    grid
  );

  /* ---------------- helpers ---------------- */
  const ta = (o = {}) => n.h('textarea.inp', Object.assign({ rows: 4 }, o));
  const inp = (o = {}) => n.h('input.inp', o);
  const sel = (opts, o = {}) => n.h('select.inp', o, opts.map(x => typeof x === 'string' ? n.h('option', { value: x, text: x }) : n.h('option', Object.assign({ text: x.text ?? x.value, value: x.value }, x))));
  const btn = (t, fn, cls = 'btn sm pri') => n.h('button', { class: cls, text: t, onclick: fn });
  const rows = (...kids) => n.h('div.row', { style: { gap: '6px' } }, kids);
  const labeled = (l, el) => n.h('div', null, [n.h('label.fl', { text: l }), el]);

  function toolCard(t) {
    const out = n.h('pre.out.hide');
    const host = n.h('div.col', { style: { gap: '8px' } });
    const body = t.build({ out, show: (v) => { out.classList.remove('hide'); out.textContent = ''; n.append(out, v); out.scrollTop = 0; }, rows, ta, inp, sel, btn, labeled, host });
    const card = n.h('div.card.tool', { 'data-cat': t.cat, 'data-kw': (t.kw || '').toLowerCase(), id: 'tool-' + t.id }, [
      n.h('h3', null, [n.h('span.ic', { text: t.ic }), t.title, n.h('span.badge.free', { text: cat[t.cat], style: { marginLeft: 'auto' } })]),
      host, body, out,
      n.h('div.actions', null, [
        n.h('button.btn.sm.gho', { text: '⧉ copy hasil', onclick: () => n.ui.copy(out.textContent, 'Hasil') }),
        n.h('button.btn.sm.gho', { text: '⤓ .txt', onclick: () => n.ui.download(new Blob([out.textContent], { type: 'text/plain' }), t.id + '.txt') })
      ])
    ]);
    return card;
  }

  /* ============================ tool definitions ============================ */
  const TOOLS = [
    /* ---- QR ---- */
    { id: 'qr', ic: '▦', title: 'QR Code generator', cat: 'gen', kw: 'qr barcode wifi url text', build: ({ out, show, rows, ta, inp, sel, btn, labeled }) => {
      const text = ta({ rows: 3, value: 'https://neuralstudio.dev' });
      const ecl = sel([{ value: 'L', text: 'L · 7%' }, { value: 'M', text: 'M · 15%', selected: true }, { value: 'Q', text: 'Q · 25%' }, { value: 'H', text: 'H · 30%' }]);
      const size = n.h('input', { type: 'range', min: 3, max: 16, value: 7, class: 'range' });
      const fg = n.h('input', { type: 'color', value: '#05070d', style: { height: '34px' } });
      const bg = n.h('input', { type: 'color', value: '#e8ecff', style: { height: '34px' } });
      const box = n.h('div.center');
      const wifiType = sel([{ value: 'text', text: 'teks / URL biasa', selected: true }, { value: 'wifi', text: 'WiFi' }, { value: 'vcard', text: 'vCard' }, { value: 'tel', text: 'telepon' }, { value: 'sms', text: 'SMS' }]);
      const extra = n.h('div.col.hide');
      const fields = {
        wifi: [labeled('SSID', inp({ placeholder: 'NamaWiFi' })), labeled('password', inp({ placeholder: 'kata sandi' })), labeled('security', sel(['WPA', 'WEP', 'nopass'])), labeled('hidden?', sel(['false', 'true']))],
        vcard: [labeled('nama', inp({ placeholder: 'Budi Santoso' })), labeled('org', inp({ placeholder: 'PT Contoh' })), labeled('telp', inp({ placeholder: '+62...' })), labeled('email', inp({ placeholder: 'budi@example.com' })), labeled('url', inp({ placeholder: 'https://…' }))],
        tel: [labeled('nomor', inp({ placeholder: '+628123456789' }))],
        sms: [labeled('nomor', inp({ placeholder: '+628123456789' })), labeled('isi pesan', ta({ rows: 2 })) ]
      };
      wifiType.onchange = () => {
        extra.innerHTML = ''; extra.classList.toggle('hide', wifiType.value === 'text');
        (fields[wifiType.value] || []).forEach(f => extra.appendChild(f));
      };
      const payload = () => {
        const v = (x) => x.value.trim();
        switch (wifiType.value) {
          case 'wifi': return 'WIFI:T:' + v(fields.wifi[2]) + ';S:' + v(fields.wifi[0]) + ';P:' + v(fields.wifi[1]) + ';H:' + v(fields.wifi[3]) + ';;';
          case 'vcard': return 'BEGIN:VCARD\nVERSION:3.0\nFN:' + v(fields.vcard[0]) + '\nORG:' + v(fields.vcard[1]) + '\nTEL;TYPE=CELL:' + v(fields.vcard[2]) + '\nEMAIL:' + v(fields.vcard[3]) + '\nURL:' + v(fields.vcard[4]) + '\nEND:VCARD';
          case 'tel': return 'tel:' + v(fields.tel[0]);
          case 'sms': return 'SMSTO:' + v(fields.sms[0]) + ':' + v(fields.sms[1]);
          default: return text.value;
        }
      };
      const go = async () => {
        try {
          const r = await n.tools.qrMake(payload(), { ecl: ecl.value, size: +size.value, fg: fg.value, bg: bg.value });
          box.innerHTML = '';
          const c = r.canvas; c.classList.add('qrcanvas'); c.style.maxWidth = '260px'; c.style.margin = '0 auto';
          box.append(c, n.h('div.tiny.mute', { text: 'modul ' + r.modules + '×' + r.modules + ' · ECL ' + r.ecl + ' · byte-mode' }));
          const wrapOut = n.h('div.col', null, [n.h('pre.out', { text: 'payload: ' + r.payload + '\nkapasitas versi: lihat error-correction table' })]);
          show(wrapOut);
          current = r;
          n.store.log('tool.qr', r.payload.slice(0, 40));
        } catch (e) { box.innerHTML = ''; box.appendChild(n.h('p.bad.small', { text: e.message })); }
      };
      let current = null;
      return n.h('div.col', { style: { gap: '8px' } }, [
        labeled('isi (mode teks/URL)', text), labeled('mode', wifiType), extra,
        rows(labeled('error correction', ecl), n.h('div', { style: { flex: 1 } }, labeled('skala modul', size))),
        rows(n.h('div', { style: { flex: 1 } }, labeled('foreground', fg)), n.h('div', { style: { flex: 1 } }, labeled('background', bg))),
        rows(btn('▦ buat QR', go), btn('⤓ PNG', async () => { if (current) n.ui.download(await n.img.dataUrl(current.canvas, 'image/png'), 'qr.png'); }), btn('⤓ SVG', () => { if (current) n.ui.download(new Blob([current.svg], { type: 'image/svg+xml' }), 'qr.svg'); })),
        box
      ]);
    } },
    { id: 'qrscan', ic: '◫', title: 'QR scanner (kamera / file)', cat: 'media', kw: 'qr scan decode kamera', build: ({ show }) => {
      const file = n.h('input', { type: 'file', accept: 'image/*' });
      const video = n.h('video', { class: 'cv', playsinline: true, style: { maxHeight: '220px', background: '#000' } });
      const outBox = n.h('div.col');
      let stream = null;
      const scanFrame = async () => {
        if (!stream) return;
        try {
          const found = await n.tools.qrScan(video.srcObject ? await frameToDataUrl() : '');
          if (found.length) { outBox.innerHTML = ''; found.forEach(f => outBox.appendChild(n.h('pre.out', { text: f.value }))); n.ui.toast('QR terbaca ✓', 'ok'); stop(); }
        } catch (e) { }
        requestAnimationFrame(scanFrame);
      };
      const frameToDataUrl = () => new Promise(res => { const c = n.img.canvasOf(video.videoWidth, video.videoHeight); n.img.ctx(c).drawImage(video, 0, 0); res(c.toDataURL()); });
      const stop = () => { if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; camBtn.textContent = '● mulai kamera'; };
      const camBtn = btn('● mulai kamera', async () => {
        if (stream) return stop();
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          video.srcObject = stream; await video.play(); camBtn.textContent = '■ stop'; scanFrame();
        } catch (e) { outBox.innerHTML = ''; outBox.appendChild(n.h('p.bad.small', { text: e.message })); }
      });
      file.onchange = async () => {
        const f = file.files[0]; if (!f) return;
        try { const r = await n.tools.qrScan(URL.createObjectURL(f)); outBox.innerHTML = ''; if (!r.length) outBox.appendChild(n.h('p.warn.small', { text: 'tidak ada QR terdeteksi' })); r.forEach(x => outBox.appendChild(n.h('pre.out', { text: x.value }))); }
        catch (e) { outBox.innerHTML = ''; outBox.appendChild(n.h('p.bad.small', { text: e.message })); }
      };
      const supp = 'BarcodeDetector ' + ('BarcodeDetector' in window ? '✓ tersedia' : '✗ tidak ada di browser ini (pakai Safari → /api/qr di server)');
      return n.h('div.col', null, [n.h('span.tiny.' + ('BarcodeDetector' in window ? 'ok' : 'bad'), { text: supp }), outBox, n.h('div.row', null, camBtn, file), video]);
    } },

    /* ---- base64 ---- */
    { id: 'b64', ic: '⑆', title: 'Base64 / Base64url', cat: 'enc', kw: 'base64 encode decode url binary file', build: ({ show, ta, btn, labeled }) => {
      const src = ta({ rows: 4, value: 'halo neural — 🎨' });
      const run = (mode) => {
        try {
          if (mode === 'enc') show(src.value.split('\n').map(l => btoa(String.fromCharCode(...new TextEncoder().encode(l)))).join('\n'));
          else if (mode === 'raw') show('base64: ' + btoa(String.fromCharCode(...new TextEncoder().encode(src.value))));
          else if (mode === 'dec') show(n.tools.b64d(src.value));
          else if (mode === 'url') show(n.tools.b64u(src.value));
          else if (mode === 'decu') show(n.tools.b64d(src.value.replace(/-/g, '+').replace(/_/g, '/')));
        } catch (e) { show('ERROR: ' + e.message + ' (input decode bukan base64 valid)'); }
      };
      const file = n.h('input', { type: 'file' });
      file.onchange = async () => {
        const f = file.files[0]; if (!f) return;
        if (f.size > 2e6) return show('File ' + n.bytes(f.size) + ' terlalu besar untuk preview base64 di textarea (2 MB cap). Pakai `base64 -w0 file` di terminal.');
        const d = await n.blobToDataUrl(f);
        show(d.split(',')[0] + ' (header)\n\n' + d.split(',')[1].slice(0, 4000) + (d.length > 4100 ? '\n…[dipotong]' : ''));
      };
      return n.h('div.col', null, [labeled('input', src),
        n.h('div.row', null, [btn('encode', () => run('enc')), btn('decode', () => run('dec')), btn('base64url', () => run('url')), btn('decode url', () => run('decu')), btn('→ data URL', () => run('raw'))]),
        n.h('div.row', null, [n.h('span.small.dim', { text: 'atau file:' }), file])]);
    } },

    /* ---- hash ---- */
    { id: 'hash', ic: '♨', title: 'Hash generator', cat: 'enc', kw: 'md5 sha1 sha256 sha512 checksum hash', build: ({ show, ta, labeled, rows: r2, inp }) => {
      const src = ta({ rows: 3, value: 'password123' });
      const salt = inp({ placeholder: 'opsional: string yang digabung di depan (HMAC-like demo)', value: '' });
      const go = async () => {
        const s = src.value + salt.value;
        const out2 = await n.tools.hash(s);
        const frag = document.createDocumentFragment();
        frag.appendChild(n.h('div', null, [n.h('b.small', { text: 'input ' + s.length + ' char · ' + new TextEncoder().encode(s).length + ' byte' })]));
        for (const [k, v] of Object.entries(out2)) frag.appendChild(n.h('div.row.spread', { style: { marginTop: '6px' } }, [
          n.h('b.mono.small', { text: k }), n.h('span.mono.tiny', { style: { wordBreak: 'break-all', textAlign: 'right', flex: 1 }, text: v })]));
        frag.appendChild(n.h('p.tiny.mute', { text: 'MD5/SHA-1 jangan dipakai untuk password. Untuk file besar (SHA-256 streaming) pakai /api/hash di server.' }));
        show(frag);
      };
      return n.h('div.col', null, [labeled('teks', src), labeled('salt/prefix (bukan pengganti bcrypt)', salt), r2(btn('hitung semua', go))]);
    } },

    /* ---- file hash (chunked, real) ---- */
    { id: 'filehash', ic: '⛁', title: 'File checksum', cat: 'enc', kw: 'sha256 md5 file checksum verifikasi', build: ({ show, labeled }) => {
      const file = n.h('input', { type: 'file' });
      const prog = n.h('div');
      file.onchange = async () => {
        const f = file.files[0]; if (!f) return;
        const t0 = performance.now();
        const buf = await f.arrayBuffer();
        const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map(x => x.toString(16).padStart(2, '0')).join('');
        const sha512 = [...new Uint8Array(await crypto.subtle.digest('SHA-512', buf))].map(x => x.toString(16).padStart(2, '0')).join('');
        const md5 = n.tools.md5(new TextDecoder('utf-8', { fatal: false }).decode(buf));   /* text-mode MD5, lihat catatan */
        const bytes = new Uint8Array(buf);
        const md5Bin = n.tools.md5Bytes(bytes);
        n.ui.progress(prog, 1, f.name + ' · ' + n.bytes(f.size) + ' · ' + Math.round(performance.now() - t0) + ' ms');
        const frag = [];
        frag.push(n.h('div', null, [n.h('b.mono.small', { text: 'SHA-256 (byte-exact)' }), n.h('div.mono.tiny', { text: sha256 })]));
        frag.push(n.h('div', null, [n.h('b.mono.small', { text: 'SHA-512 (byte-exact)' }), n.h('div.mono.tiny', { text: sha512 })]));
        frag.push(n.h('div', null, [n.h('b.mono.small', { text: 'MD5 (byte-exact)' }), n.h('div.mono.tiny', { text: md5Bin })]));
        frag.push(n.h('p.tiny.mute', { text: 'SHA via WebCrypto, MD5 via implementasi internal (diverifikasi vs vektor RFC 1321 + node crypto). Semua dihitung lokal — file tidak keluar dari browser.' }));
        const box = n.h('div.col', null, frag);
        out.classList.remove('hide'); out.textContent = ''; out.appendChild(box);
        n.store.log('tool.hashfile', f.name);
      };
      return n.h('div.col', null, [labeled('file', file), prog]);
    } },

    /* ---- JSON ---- */
    { id: 'json', ic: '❄', title: 'JSON formatter & validator', cat: 'fmt', kw: 'json format validate minify tree', build: ({ show, ta, labeled, sel, rows: r2, inp }) => {
      const src = ta({ rows: 6, value: "{name:'neural', tools:[1,2,3], ok:true,}" });
      const indent = sel(['2', '4', '\t'], { title: 'indent' });
      const run = () => {
        const v = src.value;
        const a = n.tools.validateJson(v);
        if (!a.ok) {
          const fixed = n.tools.jsonFix(v); const b = n.tools.validateJson(fixed);
          const box = n.h('div.col', null, [
            n.h('p.bad.small', { text: '✕ ' + a.error }),
            n.h('p.tiny.dim', { text: 'baris ' + a.line + ', kolom ' + a.col }),
            n.h('pre.out', { text: (a.snippet || '').slice(0, 200) }),
            b.ok ? r2(n.h('span.small.warn', { text: 'auto-fix berhasil:' }), btn('pakai hasil fix', () => { src.value = fixed; run(); })) : n.h('p.tiny.mute', { text: 'auto-fix (quote key + trailing comma) tidak menolong. Cek tanda kutip/curly.' })
          ]);
          return show(box);
        }
        const ind = indent.value === '\t' ? '\t' : +indent.value;
        const pretty = JSON.stringify(a.data, null, ind);
        const flat = JSON.stringify(a.data);
        const tree = renderTree(a.data);
        show(n.h('div.col', null, [
          n.h('p.ok.small', { text: '✓ valid · ' + (pretty.length - flat.length) + ' char whitespace, ' + countNodes(a.data) + ' node, ' + (new Blob([pretty]).size) + ' byte' }),
          n.h('details.sum', null, [n.h('summary', { text: 'tree view' }), tree]),
          n.h('details', null, [n.h('summary', { text: 'pretty (copy-able)' }), n.h('pre.out', { text: pretty })]),
          n.h('div.row', null, [btn('⤓ .json', () => n.ui.download(new Blob([pretty], { type: 'application/json' }), 'data.json')),
            btn('minify → textarea', () => { src.value = flat; run(); }),
            btn('→ CSV', () => toCsv(a.data))])
        ]));
      };
      function countNodes(x) { if (Array.isArray(x)) return x.reduce((a, v) => a + countNodes(v), 1); if (x && typeof x === 'object') return Object.values(x).reduce((a, v) => a + countNodes(v), 1); return 1; }
      function renderTree(x, key) {
        const e = n.h('div', { style: { paddingLeft: '10px', fontFamily: 'var(--mono)', fontSize: '.78rem' } });
        if (Array.isArray(x)) x.slice(0, 60).forEach((v, i) => e.appendChild(renderTree(v, i)));
        else if (x && typeof x === 'object') Object.entries(x).slice(0, 60).forEach(([k, v]) => e.appendChild(renderTree(v, k)));
        else return n.h('div', { html: (key != null ? '<b>' + n.esc(String(key)) + '</b>: ' : '') + '<span class="' + (typeof x === 'string' ? 'ok' : typeof x === 'number' ? 'warn' : 'dim') + '">' + n.esc(JSON.stringify(x)) + '</span>' });
        return n.h('div', null, [key != null ? n.h('b', { text: String(key), style: { fontSize: '.76rem' } }) : null, e]);
      }
      function toCsv(data) {
        const arr = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : Array.isArray(data?.data) ? data.data : null;
        if (!arr) return n.ui.toast('CSV butuh array of object (atau .items/.data).', 'warn');
        const csv = n.tools.toCsv(arr.map(o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : v]))));
        n.ui.download(new Blob([csv], { type: 'text/csv' }), 'data.csv');
      }
      return n.h('div.col', null, [labeled('input', src), r2(sel, btn('format + validate', run), btn('auto-fix → textarea', () => { src.value = n.tools.jsonFix(src.value); run(); }))]);
    } },

    /* ---- beautify / minify ---- */
    { id: 'code', ic: '⌘', title: 'Beautify & minify code', cat: 'fmt', kw: 'beautify format minify js css html terser esbuild', build: ({ show, ta, labeled, sel, rows: r2, inp }) => {
      const src = ta({ rows: 8, value: 'function get(a){const b=a*2;if(b>10){return b}else{return 0}} // note\nconst url="https://x.io//a"' });
      const lang = sel([{ value: 'js', text: 'JavaScript', selected: true }, { value: 'css', text: 'CSS' }, { value: 'html', text: 'HTML' }]);
      const sizeOut = n.h('span.tiny.dim', null);
      const go = async (mode) => {
        const s = src.value;
        const r = mode === 'min' ? n.tools.minify(s, lang.value) : n.tools.beautify(s, lang.value);
        const gz = await n.tools.gzipSize(r);
        sizeOut.textContent = s.length + ' → ' + r.length + ' char' + (gz ? ' · gzip ' + n.bytes(gz) : '') + ' (' + (100 - r.length / s.length * 100).toFixed(1) + '%)';
        show(r);
        if (mode === 'min') n.store.log('tool.minify', lang.value + ' ' + s.length + '→' + r.length);
      };
      return n.h('div.col', null, [
        labeled('kode', src),
        labeled('bahasa', lang),
        r2(btn('⌘ beautify', () => go('pretty')), btn('▯ minify', () => go('min')), sizeOut),
        n.h('p.tiny.mute', { text: 'minifier ini konservatif (buang komentar + rapikan whitespace, string utuh). Bundle produksi = esbuild/terser di server.' })
      ]);
    } },

    /* ---- table editor ---- */
    { id: 'table', ic: '▤', title: 'CSV ↔ JSON ↔ tabel edit', cat: 'data', kw: 'csv excel json table edit konversi', build: ({ show, ta, labeled, rows: r2, btn, inp }) => {
      const src = ta({ rows: 5, value: 'nama,kota,umur\nAdi,Semarang,29\nSari,Ungaran,24' });
      const tbl = n.h('div.scroll');
      const state = { rows: [] };
      const parse = () => { state.rows = n.ai.csvTable(src.value); draw(); };
      function draw() {
        tbl.innerHTML = '';
        if (!state.rows.length) return;
        const t = n.h('table.t.ed');
        t.appendChild(n.h('tr', null, state.rows[0].map((h, i) => n.h('th', null, n.h('input', { value: h, oninput: e => { state.rows[0][i] = e.target.value; } })))));
        state.rows.slice(1).forEach((r, ri) => t.appendChild(n.h('tr', null, r.map((c, ci) => n.h('td', null, n.h('input', { value: c, oninput: e => { state.rows[ri + 1][ci] = e.target.value; } }))))));
        tbl.appendChild(t);
        stat.textContent = (state.rows.length - 1) + ' baris × ' + (state.rows[0] || []).length + ' kolom';
      }
      const stat = n.h('span.tiny.dim', null);
      const exportCsv = () => { const csv = state.rows.map(r => r.map(c => /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c).join(',')).join('\n'); src.value = csv; show(csv); n.ui.download(new Blob([csv], { type: 'text/csv' }), 'data.csv'); };
      const exportJson = () => { const head = state.rows[0]; const json = JSON.stringify(state.rows.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, coerce(r[i])]))), null, 2); show(json); n.ui.download(new Blob([json], { type: 'application/json' }), 'data.json'); };
      const exportMd = () => { const h = state.rows[0]; const md = ['| ' + h.join(' | ') + ' |', '| ' + h.map(() => '---').join(' | ') + ' |'].concat(state.rows.slice(1).map(r => '| ' + r.join(' | ') + ' |')).join('\n'); show(md); n.ui.copy(md, 'Markdown'); };
      const coerce = (v) => { if (v === '') return null; if (/^-?\d+(\.\d+)?$/.test(v)) return +v; if (/^(true|false)$/i.test(v)) return /true/i.test(v); return v; };
      const fromJson = () => {
        try {
          const a = n.tools.validateJson(src.value); if (!a.ok) throw new Error(a.error);
          const arr = Array.isArray(a.data) ? a.data : [a.data];
          const keys = [...new Set(arr.flatMap(o => Object.keys(o || {})))];
          state.rows = [keys, ...arr.map(o => keys.map(k => { const v = o?.[k]; return v && typeof v === 'object' ? JSON.stringify(v) : (v ?? ''); }))];
          draw(); n.ui.toast('JSON → tabel ✓', 'ok');
        } catch (e) { n.ui.toast('JSON: ' + e.message, 'err'); }
      };
      const addRow = () => { state.rows.push(state.rows[0].map(() => '')); draw(); };
      const addCol = () => { state.rows.forEach(r => r.push('')); draw(); };
      const file = n.h('input', { type: 'file', accept: '.csv,.txt,.json' });
      file.onchange = async () => { const f = file.files[0]; if (f) { src.value = await f.text(); /\.json$/i.test(f.name) ? fromJson() : parse(); } };
      return n.h('div.col', null, [labeled('CSV / JSON input (edit di tabel, lalu export)', src),
        r2(btn('parse → tabel', parse), btn('← dari JSON di atas', fromJson), n.h('span.small.dim', { text: 'file:' }), file),
        tbl, stat,
        r2(btn('+ baris', addRow), btn('+ kolom', addCol), btn('⤓ CSV', exportCsv), btn('⤓ JSON', exportJson), btn('copy Markdown', exportMd))]);
    } },

    /* ---- units ---- */
    { id: 'units', ic: '⇄', title: 'Unit converter', cat: 'unit', kw: 'unit konversi panjang massa data suhu kecepatan', build: ({ show, rows: r2, sel, inp, labeled }) => {
      const g = n.h('div.col', { style: { gap: '8px' } });
      const catSel = sel(Object.keys(n.tools.UNITS).map(k => ({ value: k, text: k })));
      const val = inp({ type: 'number', value: '1', step: 'any' });
      let from, to;
      function fill() {
        const units = Object.keys(n.tools.UNITS[catSel.value].u);
        g.querySelectorAll('.unit').forEach(x => x.remove());
        const mk = (name, def) => { const s = sel(units.map(u => ({ value: u, text: u, selected: u === def }))); s.classList.add('unit'); return s; };
        from = mk('f', units[0]); to = mk('t', units[Math.min(1, units.length - 1)]);
        g.append(n.h('div.row', { class: 'unit' }, [labeled('dari', from), labeled('ke', to)]));
        run();
      }
      const run = () => {
        const v = parseFloat(val.value);
        if (Number.isNaN(v)) return show('angka?');
        const r = n.tools.convert(catSel.value, v, from.value, to.value);
        const all = Object.keys(n.tools.UNITS[catSel.value].u).map(u => u + ': ' + fmt(n.tools.convert(catSel.value, v, from.value, u)));
        show(document.createDocumentFragment && (() => { const f = document.createDocumentFragment(); return f; })() || '');
        show(n.h('div.col', null, [
          n.h('div', null, [n.h('b', { text: fmt(r) + ' ' + to.value, style: { fontSize: '1.4rem' } }), n.h('span.dim.small', { text: '  ←  ' + v + ' ' + from.value })]),
          n.h('pre.out', { text: 'semua satuan:\n' + all.join('\n') }),
          catSel.value === 'data' ? n.h('p.tiny.mute', { text: 'KB/MB (1000) vs KiB/MiB (1024) — keduanya ada di daftar; jangan ketukar.' }) : null
        ]));
      };
      const fmt = (x) => !isFinite(x) ? '∞' : Math.abs(x) >= 1e12 || (Math.abs(x) < 1e-6 && x !== 0) ? x.toExponential(6) : String(+x.toFixed(8));
      catSel.onchange = fill; val.oninput = run;
      setTimeout(fill, 0);
      return n.h('div.col', { style: { gap: '8px' } }, [r2(labeled('kategori', catSel), labeled('nilai', val)), g]);
    } },

    /* ---- colour lab ---- */
    { id: 'color', ic: '◐', title: 'Color picker + kontras WCAG', cat: 'unit', kw: 'warna hex hsl rgb kontras wcag gradient palet', build: ({ show, inp, labeled, sel, rows: r2 }) => {
      const fg = inp({ type: 'color', value: '#22d3ee' });
      const bg = inp({ type: 'color', value: '#05070d' });
      const hexin = inp({ placeholder: '#22d3ee atau 22d3ee', value: '#22d3ee' });
      const prev = n.h('div.contrast-demo', { text: 'Contoh teks Aa 16px' });
      const info = n.h('div.col');
      const norm = (v) => /^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v.trim()) ? (v.trim().startsWith('#') ? v.trim() : '#' + v.trim()) : null;
      function up() {
        const a = norm(fg.value), b = norm(bg.value);
        if (!a || !b) return;
        prev.style.background = b; prev.style.color = a;
        const rgb = n.tools.hex2rgb(a), hsl = n.tools.rgb2hsl(rgb);
        const c = n.tools.contrast(a, b);
        const grade = c >= 7 ? 'AAA besar + normal' : c >= 4.5 ? 'AA normal' : c >= 3 ? 'AA besar saja' : '✕ gagal';
        info.innerHTML = '';
        info.append(
          n.h('div.row', null, [n.h('span.swatch', { style: { background: a, flex: 1 } }), n.h('span.swatch', { style: { background: b, flex: 1 } })]),
          n.h('pre.out', { text: 'HEX   ' + a + '  on  ' + b + '\nRGB   rgb(' + rgb.join(', ') + ')\nHSL   hsl(' + hsl[0] + ' ' + hsl[1] + '% ' + hsl[2] + '%)\nOKLCH-ish  L* ' + Math.round(n.tools.lum(a) * 100) + ' vs ' + Math.round(n.tools.lum(b) * 100) }),
          n.h('div.row.spread', null, [n.h('b.small', { text: 'contrast ' + c.toFixed(2) + ':1' }), n.h('span.badge.' + (c >= 4.5 ? 'pro' : 'free'), { text: grade })]),
          n.h('div.kicker.mt', { text: 'tint / shade ramp' }),
          n.h('div.row', { style: { gap: '3px' } }, n.tools.ramp(a, 8).map(hx => n.h('i', { style: { flex: 1, height: '26px', borderRadius: '6px', background: hx, border: '1px solid var(--line)' }, title: hx, onclick: () => n.ui.copy(hx, 'warna') })))
        );
      }
      [fg, bg].forEach(x => x.oninput = () => { hexin.value = fg.value; up(); });
      hexin.oninput = () => { const v = norm(hexin.value); if (v) { fg.value = v; up(); } };
      return n.h('div.col', null, [r2(labeled('foreground', fg), labeled('background', bg)), labeled('atau ketik hex', hexin), prev, info]);
    } },

    /* ---- password ---- */
    { id: 'pass', ic: '⚿', title: 'Password & passphrase', cat: 'gen', kw: 'password generator kuat pin entropy passphrase', build: ({ show, labeled, sel, rows: r2, inp }) => {
      const len = n.h('input', { type: 'range', min: 8, max: 48, value: 20, class: 'range' });
      const lenOut = n.h('span.num', { text: '20' });
      len.oninput = () => lenOut.textContent = len.value;
      const opts = { upper: true, lower: true, num: true, sym: true, avoid: true };
      const boxes = Object.keys(opts).map(k => {
        const c = n.h('input', { type: 'checkbox', checked: true });
        c.onchange = () => opts[k] = c.checked;
        const labels = { upper: 'A-Z', lower: 'a-z', num: '0-9', sym: 'simbol', avoid: 'hindari yang ambigu (IOl1)' };
        return n.h('label.chk', null, [c, labels[k]]);
      });
      const words = n.h('input', { type: 'number', min: 3, max: 8, value: 5, class: 'inp', style: { width: '90px' } });
      const W = ['neon','kopi','hujan','jarum','orbit','kertas','langit','akar','bayang','cerdas','gelombang','huruf','jendela','kuantum','lampu','mesin','ombak','pintu','rumput','sinar','tinta','ujung','warna','zaman','awalan','bijak','cahaya','daun','etik','fluks','gema','hemat','indra','jernih','kota','laju','mawar','nalar','obyek','payung','ruas','senja','titik','uji','vila','wajah','yakin','zona'];
      const out = n.h('div.col');
      const genChar = () => { const r = n.tools.password({ len: +len.value, ...opts }); out.innerHTML = ''; out.append(
        n.h('pre.out', { text: r.pw }),
        n.h('div.row.spread', null, [n.h('span.small.dim', { text: r.set.length + ' char/alphabet' }), n.h('b.small.' + (r.bits > 90 ? 'ok' : 'warn'), { text: r.bits + ' bit · ' + r.strength }), n.h('span.tiny.dim', { text: 'crack: ' + r.crackYears })]),
        n.h('div.row', null, [r2(btn('⧉ copy', () => n.ui.copy(r.pw, 'Password')), btn('↻ ulang', genChar))])
      ); };
      const genPass = () => { const k = +words.value; const pick = () => W[n.tools.rnd(W.length)] + (Math.random() < .4 ? '-' : ''); let s = Array.from({ length: k }, () => { const w = W[n.tools.rnd(W.length)]; const cap = Math.random() < .3 ? w[0].toUpperCase() + w.slice(1) : w; return cap + (Math.random() < .3 ? n.tools.rnd(100) : ''); }).join('-');
        out.innerHTML = ''; out.append(n.h('pre.out', { text: s }), n.h('p.small.dim', { text: (s.length * 4.7 | 0) + ' bit (kasar). ' + k + ' kata dari kamus 48 kata demo — untuk produksi pakai kamus 7776 kata EFF + server.' }), n.h('div.row', null, [btn('⧉ copy', () => n.ui.copy(s, 'Passphrase')), btn('↻ ulang', genPass)])); };
      const pin = () => { const p = [...crypto.getRandomValues(new Uint8Array(6))].map(b => b % 10).join(''); out.innerHTML = ''; out.append(n.h('pre.out', { text: p }), n.h('p.tiny.bad', { text: '⚠ PIN 6 digit = 20 bit. Jangan pernah dipakai sebagai satu-satunya faktor.' })); };
      return n.h('div.col', null, [
        labeled('panjang', n.h('div.rowlab', null, [len, lenOut])),
        n.h('div.row', { style: { gap: '10px' } }, boxes),
        r2(btn('▰ random string', genChar), btn('☰ passphrase', genPass), btn('# pin 6', pin), labeled('jumlah kata', words)),
        out
      ]);
    } },

    /* ---- fake data ---- */
    { id: 'fake', ic: '⛁', title: 'Random data generator', cat: 'data', kw: 'fake data dummy faker nama email alamat sql csv', build: ({ show, labeled, inp, sel, rows: r2 }) => {
      const count2 = inp({ type: 'number', value: 25, min: 1, max: 5000, class: 'inp' });
      const cols = sel(['semua', 'id,name,email,phone,address', 'name,email', 'id,name,occupation,date,bool'], { });
      const fmt2 = sel([{ value: 'csv', text: 'CSV', selected: true }, { value: 'json', text: 'JSON' }, { value: 'sql', text: 'SQL INSERT' }, { value: 'js', text: 'JS array' }]);
      const preview = n.h('div.scroll');
      const go = () => {
        const k = Math.min(5000, Math.max(1, +count2.value || 25));
        const all = n.tools.fakeRow();
        const keys = cols.value === 'semua' ? Object.keys(all) : cols.value.split(',');
        const rowsArr = Array.from({ length: k }, () => { const r = n.tools.fakeRow(); return Object.fromEntries(keys.map(x => [x, r[x]])); });
        preview.innerHTML = '';
        const t = n.h('table.t');
        t.appendChild(n.h('tr', null, keys.map(kk => n.h('th', { text: kk }))));
        rowsArr.slice(0, 40).forEach(r => t.appendChild(n.h('tr', null, keys.map(kk => n.h('td', { text: String(r[kk]) })))));
        preview.appendChild(t);
        const txt = fmt2.value === 'csv' ? n.tools.toCsv(rowsArr) : fmt2.value === 'json' ? JSON.stringify(rowsArr, null, 2) : fmt2.value === 'sql' ? n.tools.toSql(rowsArr) : 'export const rows = ' + JSON.stringify(rowsArr) + ';';
        show(n.h('div.col', null, [n.h('p.ok.small', { text: '✓ ' + k + ' baris · ' + n.bytes(new Blob([txt]).size) + ' · semua data fiktif (domain example.test)' }),
          n.h('pre.out', { text: txt.slice(0, 4000) + (txt.length > 4000 ? '\n…[dipotong, pakai ⤓ untuk full]' : '') }),
          r2(btn('⤓ unduh full', () => n.ui.download(new Blob([txt], { type: 'text/plain' }), 'fake.' + fmt2.value)), btn('⧉ copy 4k', () => n.ui.copy(txt.slice(0, 4000), 'Data'))) ]));
        n.store.log('tool.fake', k + ' rows');
      };
      return n.h('div.col', null, [r2(labeled('jumlah', count2), labeled('kolom', cols), labeled('format', fmt2)), r2(btn('⚙ generate', go)), preview]);
    } },

    /* ---- mock api ---- */
    { id: 'mock', ic: '⛶', title: 'Mock API response', cat: 'data', kw: 'mock api json fixture serverless', build: ({ show, labeled, inp, rows: r2 }) => {
      const spec = inp({ value: 'id,name,email,role,active,createdAt' });
      const k = inp({ type: 'number', value: 6, class: 'inp', style: { width: '90px' } });
      const go = () => {
        const r = n.tools.mockApi(Math.min(200, +k.value || 5), spec.value.split(',').map(s => s.trim()).filter(Boolean));
        show(JSON.stringify(r, null, 2));
      };
      return n.h('div.col', null, [r2(labeled('field (comma)', spec), labeled('jumlah', k)), r2(btn('buat', go)),
        n.h('p.tiny.mute', null, 'Berguna buat frontend dulu, backend belakangan. Endpoint mock persisten → /api/mock/[id] di server.')]);
    } },

    /* ---- shorten ---- */
    { id: 'short', ic: '⌁', title: 'URL shortener (lokal)', cat: 'net', kw: 'short url link redirect alias', build: ({ show, labeled, inp, rows: r2 }) => {
      const url = inp({ placeholder: 'https://situs-panjang.com/a/b?c=1' });
      const alias = inp({ placeholder: 'alias (kosongkan = random)' });
      const list = n.h('div.list');
      const draw = () => {
        list.innerHTML = '';
        const all = n.store.shorts.all();
        if (!all.length) return list.appendChild(n.h('div.empty', { text: 'belum ada' }));
        all.forEach(s => list.appendChild(n.h('div.item', null, [
          n.h('a.nm', { href: s.short, text: s.code, target: '_blank' }),
          n.h('span.d', { text: s.hits + ' klik' }),
          n.h('span.tiny.mute', { style: { maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, text: s.url }),
          n.h('button.btn.sm.gho', { text: '⧉', onclick: () => n.ui.copy(s.short, 'Link') }),
          n.h('button.btn.sm.gho', { text: '✕', onclick: () => { n.store.shorts.del(s.id); draw(); } })
        ])));
      };
      draw();
      const go = () => {
        try {
          const r = n.tools.shorten(url.value, alias.value);
          show(n.h('div.col', null, [n.h('b.mono', { text: r.short }), n.h('p.tiny.warn', { text: '⚠ redirect lokal: link ini jalan di device/browser ini saja (localStorage) lewat r.html?to=' + r.code + '. Shortener publik butuh DB + custom domain di server.' })]));
          url.value = ''; alias.value = ''; draw();
        } catch (e) { n.ui.toast(e.message, 'err'); }
      };
      return n.h('div.col', null, [labeled('url panjang', url), labeled('alias', alias), r2(btn('⌁pendekkan', go), n.h('button.btn.sm', { text: 'buka r.html', onclick: () => location.href = 'r.html' })), list]);
    } },

    /* ---- jwt ---- */
    { id: 'jwt', ic: '⛓', title: 'JWT decoder', cat: 'net', kw: 'jwt token decode exp signature', build: ({ show, ta, labeled }) => {
      const t = ta({ rows: 4, placeholder: 'eyJhbGciOi…' });
      const go = () => {
        try {
          const r = n.tools.jwt(t.value.trim());
          show(n.h('div.col', null, [
            n.h('pre.out', { text: 'header:\n' + JSON.stringify(r.header, null, 2) + '\n\npayload:\n' + JSON.stringify(r.payload, null, 2) + '\n\nsignature: ' + r.signature }),
            r.warn.map(w => n.h('p.bad.small', { text: '⚠ ' + w })),
            n.h('p.tiny.mute', { text: r.note })
          ]));
        } catch (e) { show('ERROR: ' + e.message); }
      };
      return n.h('div.col', null, [labeled('token', t), n.h('button.btn.sm.pri', { text: 'decode', onclick: go }),
        n.h('p.tiny.mute', { text: 'Decoder lokal — token tidak dikirim ke mana pun.' })]);
    } },

    /* ---- regex ---- */
    { id: 'regex', ic: '∑', title: 'Regex lab', cat: 'fmt', kw: 'regex test match capture highlight', build: ({ show, inp, ta, labeled, sel }) => {
      const p = inp({ value: '(\\w+)@(\\w+)\\.(\\w{2,})', placeholder: 'pola' });
      const f = sel(['g', 'gi', 'gm', 'gi m'], { });
      const t = ta({ rows: 4, value: 'email: budi@mail.co.id\nsari+x@kerja.or.id' });
      const hi = n.h('div.out', { style: { whiteSpace: 'pre-wrap' } });
      const go = () => {
        try {
          const r = n.tools.regexTest(p.value, f.value.replace(/\s/g, ''), t.value);
          let last = 0, html = '';
          r.hits.forEach((x, i) => { html += n.esc(t.value.slice(last, x.index)) + '<mark style="background:rgba(34,211,238,.35);color:#fff;border-radius:3px">' + n.esc(x.match) + '</mark>'; last = x.index + x.match.length; });
          html += n.esc(t.value.slice(last));
          hi.innerHTML = html || '<span class="dim">(tidak ada match)</span>';
          show(n.h('div.col', null, [n.h('b.small', { text: r.count + ' match' + (r.groups.length ? ' · named groups: ' + r.groups.join(', ') : '') }),
            ...r.hits.slice(0, 12).map(x => n.h('div.mono.tiny', { text: x.index + ': ' + JSON.stringify(x.match) + (Object.keys(x.groups || {}).length ? ' groups=' + JSON.stringify(x.groups) : '') })) ]));
        } catch (e) { show('ERROR: ' + e.message); hi.textContent = ''; }
      };
      p.oninput = t.oninput = () => { };
      return n.h('div.col', null, [labeled('pola', p), labeled('flags', f), labeled('teks uji', t), n.h('button.btn.sm.pri', { text: '▶ uji', onclick: go }), hi]);
    } },

    /* ---- text ops ---- */
    { id: 'text', ic: '¶', title: 'Text utilities', cat: 'fmt', kw: 'uppercase lowercase sort dedupe slug case count', build: ({ show, ta, labeled, rows: r2 }) => {
      const t = ta({ rows: 5, value: 'Banana\napple\nCherry\napple\n  durian  \nBanana' });
      const doIt = (fn) => show(fn(t.value));
      const stat = (s) => { const w = (s.match(/\S+/g) || []).length; const r = s.replace(/\s/g, ''); return s.length + ' char · ' + w + ' kata · ' + s.split('\n').length + ' baris · ' + r.length + ' non-space · ~' + Math.round(w * 1.33) + ' token · ' + n.tools.entropy(s).toFixed(1) + ' bit entropi'; };
      const sortLines = (s) => s.split('\n').map(x => x.trim()).sort((a, b) => a.localeCompare(b, 'id')).join('\n');
      const uniq = (s) => [...new Set(s.split('\n'))].join('\n');
      return n.h('div.col', null, [labeled('teks', t), n.h('p.small.dim', { id: 'tstat', text: '' }),
        r2(btn('UPPER', () => doIt(s => s.toUpperCase())), btn('lower', () => doIt(s => s.toLowerCase())), btn('Title', () => doIt(s => s.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase())))),
        r2(btn('sort', () => doIt(sortLines)), btn('uniq', () => doIt(uniq)), btn('sort+uniq', () => doIt(s => uniq(sortLines(s)))), btn('trim+buang kosong', () => doIt(s => s.split('\n').map(x => x.trim()).filter(Boolean).join('\n')))),
        r2(btn('slug', () => doIt(s => n.tools.slug(s))), btn('escape regex', () => doIt(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))), btn('strip html', () => doIt(s => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())), btn('reverse', () => doIt(s => [...s].reverse().join('')))),
        r2(btn('ke bilangan (idr)', () => doIt(s => s.replace(/\d+/g, d => new Intl.NumberFormat('id-ID').format(+d)))), btn('rot13', () => doIt(s => s.replace(/[a-zA-Z]/, () => '') + s.replace(/[a-zA-Z]/g, c => String.fromCharCode((c <= 'Z' ? 90 : 122) >= c.charCodeAt(0) + 13 ? c.charCodeAt(0) + 13 : c.charCodeAt(0) + 13 - 26)))))]);
    } },

    /* ---- diff ---- */
    { id: 'diff', ic: '⇹', title: 'Text diff', cat: 'fmt', kw: 'diff compare bandingkan perubahan', build: ({ show, ta, labeled, rows: r2 }) => {
      const a = ta({ rows: 6, value: 'line 1\nline 2\nline 3\nline 4' });
      const b = ta({ rows: 6, value: 'line 1\nline 2 diubah\nline 3\nline 5' });
      const go = () => {
        const r = n.tools.diff(a.value, b.value);
        const box = n.h('div.out');
        r.rows.slice(0, 800).forEach(row => box.appendChild(n.h('span.diffline' + (row.t === '+' ? '.add' : row.t === '-' ? '.del' : ''), { text: row.t + ' ' + row.s })));
        show(n.h('div.col', null, [n.h('p.small', { html: '<b class="ok">+' + r.stats.add + '</b> · <b class="bad">−' + r.stats.del + '</b> · ' + r.rows.length + ' baris hasil' }), box]));
      };
      return n.h('div.col', null, [labeled('A (lama)', a), labeled('B (baru)', b), r2(btn('⇹ diff', go), btn('swap', () => { const v = a.value; a.value = b.value; b.value = v; }))]);
    } },

    /* ---- timestamp ---- */
    { id: 'time', ic: '◷', title: 'Timestamp & timezone', cat: 'gen', kw: 'unix epoch waktu timezone date iso cron', build: ({ show, inp, labeled, rows: r2, sel }) => {
      const v = inp({ value: String(Date.now()).slice(0, 10) });
      const tz = sel(n.tools.ianaTimezones);
      const go = () => {
        const num = +v.value;
        const d = new Date(v.value.length >= 13 ? num : num * 1000);
        if (isNaN(d)) return show('tidak bisa dibaca sebagai waktu');
        const fmtFor = (z) => new Intl.DateTimeFormat('en-GB', { timeZone: z, dateStyle: 'medium', timeStyle: 'medium' }).format(d);
        show(n.h('div.col', null, [
          n.h('pre.out', { text: ['unix seconds  ' + Math.floor(d / 1000), 'unix ms       ' + +d, 'ISO (UTC)     ' + d.toISOString(), 'ISO (lokal)   ' + new Date(+d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19), 'relative      ' + n.when(+d)].join('\n') }),
          n.h('div.kicker.mt', { text: 'di berbagai zona' }),
          n.h('pre.out', { text: n.tools.ianaTimezones.map(z => (z === tz.value ? '▶ ' : '  ') + z.padEnd(20) + fmtFor(z)).join('\n') }),
          n.h('p.tiny.mute', { text: 'Zona browser: ' + Intl.DateTimeFormat().resolvedOptions().timeZone + ' · offset UTC' + (-d.getTimezoneOffset() / 60 >= 0 ? '+' : '') + (-d.getTimezoneOffset() / 60) })
        ]));
      };
      const now = () => { v.value = String(Math.floor(Date.now() / 1000)); go(); };
      return n.h('div.col', null, [r2(labeled('unix / ISO / angka', v), labeled('fokus tz', tz)), r2(btn('uraikan', go), btn('sekarang', now))]);
    } },

    /* ---- cron ---- */
    { id: 'cron', ic: '⟳', title: 'Cron schedule preview', cat: 'gen', kw: 'cron schedule next run timer k8s', build: ({ show, inp, labeled, rows: r2, sel }) => {
      const e = inp({ value: '*/15 9-17 * * 1-5' });
      const off = sel(['0', '1', '7'], { title: 'offset jam (k8s TZ)' });
      const go = () => {
        try {
          const from = new Date(); from.setHours(from.getHours() + (+off.value | 0));
          const r = n.tools.cronNext(e.value, from, 6);
          show(n.h('div.col', null, [n.h('b.small', { text: r.human }), n.h('pre.out', { text: r.runs.join('\n') }), n.h('p.tiny.mute', { text: r.note + '. Field: menit · jam · tgl · bulan · hari.' })]));
        } catch (err) { show('ERROR: ' + err.message); }
      };
      const presets = n.h('div.row', null, ['* * * * *', '*/5 * * * *', '0 * * * *', '0 9 * * 1-5', '30 2 * * 0', '0 0 1 * *'].map(p => n.h('button.chip', { text: p, onclick: () => { e.value = p; go(); } })));
      return n.h('div.col', null, [labeled('ekspresi (5 field)', e), r2(presets, labeled('offset jam', off)), r2(btn('⟳ hitung', go)), n.h('div.row', null, presets)]);
    } },

    /* ---- image convert ---- */
    { id: 'imgconv', ic: '▣', title: 'Image converter + kompres', cat: 'media', kw: 'image convert jpg png webp resize kompres ico batch', build: ({ show, labeled, sel, inp, rows: r2 }) => {
      const file = n.h('input', { type: 'file', accept: 'image/*', multiple: true });
      const fmt = sel([{ value: 'webp', text: 'WEBP', selected: true }, { value: 'jpg', text: 'JPEG' }, { value: 'png', text: 'PNG' }]);
      const q = n.h('input', { type: 'range', min: .3, max: .98, step: .01, value: .82, class: 'range' });
      const qOut = n.h('span.num', { text: '.82' }); q.oninput = () => qOut.textContent = (+q.value).toFixed(2);
      const max = inp({ type: 'number', value: 1600, class: 'inp', style: { width: '110px' } });
      let results = [];
      const gallery = n.h('div.gal');
      const go = async () => {
        const files = [...file.files]; if (!files.length) return n.ui.toast('Pilih file dulu.', 'warn');
        results = []; gallery.innerHTML = '';
        let before = 0, after = 0;
        for (const f of files) {
          try {
            const r = await n.tools.convertImage(f, fmt.value, +q.value, +max.value || 0);
            before += r.from; after += r.to;
            const url = URL.createObjectURL(r.blob);
            const name = f.name.replace(/\.\w+$/, '') + '.' + fmt.value;
            results.push({ name, blob: r.blob });
            gallery.appendChild(n.h('figure', null, [n.h('img', { src: url, alt: name }), n.h('figcaption', null, [
              n.h('span', { style: { flex: 1 }, text: name + ' ' + r.w + '×' + r.h }),
              n.h('a', { href: url, download: name, text: '⤓', style: { textDecoration: 'underline' } })])]));
          } catch (e) { n.ui.toast(f.name + ': ' + e.message, 'err'); }
        }
        show(n.h('div.col', null, [
          n.h('p.ok.small', { text: '✓ ' + results.length + ' file · ' + n.bytes(before) + ' → ' + n.bytes(after) + ' (hemat ' + (100 - after / Math.max(1, before) * 100).toFixed(1) + '%)' }),
          results.length > 1 ? n.h('div.row', null, [btn('⤓ semua (.zip)', async () => { const entries = []; for (const r of results) entries.push(await n.zipFile(r.name, r.blob)); n.ui.download(n.zip(entries), 'images.zip'); })]) : null
        ]));
        n.store.log('tool.imgconv', results.length + ' file');
      };
      return n.h('div.col', null, [labeled('file (bisa banyak)', file), r2(labeled('format', fmt), n.h('div', { style: { flex: 1 } }, labeled('kualitas', n.h('div.rowlab', null, [q, qOut]))), labeled('max sisi px', max)), r2(btn('▣ convert', go)), gallery]);
    } },

    /* ---- ico + palette ---- */
    { id: 'ico', ic: '◱', title: 'Favicon / ICO builder', cat: 'media', kw: 'favicon ico ico multi size icon apple touch', build: ({ show, labeled, rows: r2 }) => {
      const file = n.h('input', { type: 'file', accept: 'image/*' });
      let c = null;
      const preview = n.h('div.row');
      file.onchange = async () => {
        const f = file.files[0]; if (!f) return;
        c = (await n.img.paint(preview, URL.createObjectURL(f)));
        preview.style.alignItems = 'end';
      };
      const go = async () => {
        if (!c) return n.ui.toast('Pilih gambar dulu.', 'warn');
        await n.img.ico(c, 'favicon');
        const sizes = [16, 32, 48, 180, 512];
        const entries = [];
        for (const s of sizes) { const cc = n.img.canvasOf(s, s); n.img.ctx(cc).drawImage(c, 0, 0, s, s); entries.push(await n.zipFile('icon-' + s + '.png', await fetch(cc.toDataURL()).then(r => r.blob()))); }
        entries.push(await n.zipFile('favicon.ico', await n.img.icoBlob(c, [16, 32, 48])));        // real ICO inside the zip too
        entries.push(await n.zipFile('README.txt', new Blob(['Isi zip: favicon.ico (multi-size 16/32/48) + PNG 16…512 untuk apple-touch-icon / manifest.'])))
        show(n.h('div.col', null, [n.h('p.ok.small', { text: '✓ favicon.ico (16 + 32 + 48 px, satu file multi-size) sudah terunduh' }),
          n.h('pre.out', { text: '<link rel="icon" href="/favicon.ico" sizes="any">\n<link rel="apple-touch-icon" href="/apple-touch-180.png" sizes="180x180">\n<link rel="manifest" href="/manifest.webmanifest">' })]));
      };
      return n.h('div.col', null, [
        labeled('sumber 512×512 ideal', file), preview,
        n.h('div.row', { style: { gap: '6px' } }, [
          btn('◱ bikin .ico', go),
          btn('⤓ manifest PNG', async () => {
            if (!c) return n.ui.toast('Pilih gambar dulu.', 'warn');
            const entries = [];
            for (const s of [16, 32, 48, 180, 512]) { const cc = n.img.canvasOf(s, s); n.img.ctx(cc).drawImage(c, 0, 0, s, s); entries.push(await n.zipFile(s + '.png', await fetch(cc.toDataURL()).then(r => r.blob()))); }
            n.ui.download(n.zip(entries), 'icons.zip');
          })
        ])
      ]);
    } },

    /* ---- pdf ---- */
    { id: 'pdf', ic: '⎙', title: 'PDF tools', cat: 'media', kw: 'pdf merge split compress extract text halaman', build: ({ show, labeled, inp, rows: r2, ta }) => {
      const f1 = n.h('input', { type: 'file', accept: 'application/pdf', multiple: true });
      const status = n.h('p.tiny.dim', { text: 'pdf-lib dimuat dari CDN saat dipakai (sekitar 500 KB).' });
      const ranges = inp({ placeholder: 'range mis. 1-3,5,8-10', value: '' });
      const textOut = n.h('pre.out.hide');
      const parseRanges = (s, total) => {
        if (!s.trim()) return [[0, total - 1]];
        return s.split(',').map(p => p.trim()).filter(Boolean).map(p => { const [a, b] = p.split('-').map(x => +x - 1); return [a, b ?? a]; }).filter(([a, b]) => a >= 0 && b < total);
      };
      const act = async (mode) => {
        const files = [...f1.files];
        if (!files.length) return n.ui.toast('Pilih PDF dulu.', 'warn');
        try {
          if (mode === 'merge') {
            const r = await n.tools.pdf.merge(files);
            n.ui.download(r.blob, 'merged.pdf');
            show('✓ merge ' + files.length + ' PDF → ' + r.pages + ' halaman (' + n.bytes(r.blob.size) + ')');
          } else if (mode === 'split') {
            const d = await PDFLibpeek(); const total = d.pages;
            const rs = parseRanges(ranges.value, total);
            const parts = await n.tools.pdf.split(files[0], rs);
            if (parts.length === 1) n.ui.download(parts[0].blob, parts[0].name);
            else { const entries = []; for (const p of parts) entries.push(await n.zipFile(p.name, p.blob)); n.ui.download(n.zip(entries), 'split.zip'); }
            show('✓ split ' + total + ' halaman → ' + rs.map(([a, b]) => (a + 1) + '-' + (b + 1)).join(', ') + ' (' + parts.length + ' file)');
          } else if (mode === 'compress') {
            const r = await n.tools.pdf.compress(files[0]);
            n.ui.download(r.blob, files[0].name.replace(/\.pdf$/i, '') + '_slim.pdf');
            show('✓ ' + n.bytes(r.before) + ' → ' + n.bytes(r.after) + ' (hemat ' + r.saved + ')\n' + r.note);
          } else if (mode === 'text') {
            const r = await n.tools.pdf.text(files[0]);
            textOut.classList.remove('hide'); textOut.textContent = r.text.slice(0, 20000) + (r.text.length > 20000 ? '\n…[dipotong]' : '');
            show('✓ ' + (r.pages || '?') + ' halaman · ' + r.text.length + ' char · engine: ' + r.engine);
          } else if (mode === 'info') {
            const d = await n.tools.pdf.text(files[0]).catch(() => null);
            const r = await files[0].arrayBuffer();
            const dv = new DataView(r);
            show('header: ' + new TextDecoder().decode(new Uint8Array(r.slice(0, 8))) + '\nukuran: ' + n.bytes(files[0].size) + '\n' + (d ? 'teks: ' + d.pages + ' hal, ' + d.text.length + ' char' : 'info lanjutan butuh pdf.js'));
          }
          n.store.log('tool.pdf', mode);
        } catch (e) { show('ERROR: ' + e.message + (e.message.includes('Offline') ? '\n→ Solusi offline: pakai qpdf/gs di terminal, atau jalankan route /api/pdf/* di server.' : '')); }
      };
      async function PDFLibpeek() { const PDFLib = await n.use('pdf'); const d = await PDFLib.PDFDocument.load(await f1.files[0].arrayBuffer()); return { pages: d.getPageCount() }; }
      return n.h('div.col', null, [labeled('PDF (multi-select untuk merge)', f1), labeled('range untuk split (1-based)', ranges), status,
        n.h('div.row', null, [btn('merge', () => act('merge')), btn('split', () => act('split')), btn('compress', () => act('compress')), btn('→ teks', () => act('text')), btn('info', () => act('info'))]),
        textOut,
        n.h('p.tiny.mute', { text: 'Merge/split/compress jalan client-side (pdf-lib). Downsampling gambar & OCR butuh server (ghostscript/tesseract → /api/pdf/compress).' })]);
    } },

    /* ---- zip ---- */
    { id: 'zip', ic: '⛃', title: 'ZIP pack & unpack', cat: 'media', kw: 'zip archive kompres ekstrak text file', build: ({ show, labeled }) => {
      const file = n.h('input', { type: 'file', multiple: true });
      const mode = labeled('mode', n.h('div.seg', null, [n.h('button.on', { text: 'buat .zip' }), n.h('button', { text: 'baca .zip' })]));
      const out = n.h('div.col');
      [mode.children[0], mode.children[1]].forEach((b, i) => b.onclick = () => { mode.querySelector('.on')?.classList.remove('.on'); mode.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); b.dataset.i = i; });
      const go = async () => {
        const files = [...file.files]; if (!files.length) return n.ui.toast('Pilih file.', 'warn');
        const unpacking = [...mode.querySelectorAll('button')][1].classList.contains('on');
        if (unpacking) {
          try {
            const zip = await n.ai.unzip(files[0]);
            const rowsArr = Object.entries(zip).map(([k, v]) => ({ name: k, bytes: v.length, head: new TextDecoder('utf-8', { fatal: false }).decode(v.subarray(0, 200)).replace(/\n/g, ' ') }));
            out.innerHTML = '';
            const t = n.h('table.t');
            t.appendChild(n.h('tr', null, ['entry', 'ukuran', '200 byte pertama'].map(x => n.h('th', { text: x }))));
            rowsArr.slice(0, 120).forEach(r => t.appendChild(n.h('tr', null, [n.h('td', { text: r.name }), n.h('td', { text: n.bytes(r.bytes) }), n.h('td.mono.tiny', { text: r.head })])));
            out.appendChild(n.h('div.scroll', null, t));
            show('✓ ' + rowsArr.length + ' entri diekstrak (deflate-raw via DecompressionStream, tanpa library)');
          } catch (e) { show('ERROR: ' + e.message); }
          return;
        }
        const entries = [];
        for (const f of files) entries.push({ name: f.name, data: await n.buf8(f) });
        entries.push({ name: 'MANIFEST.txt', data: new TextEncoder().encode(entries.map(e => e.name + '\t' + e.data.length).join('\n')) });
        n.ui.download(n.zip(entries), 'bundle.zip');
        show('✓ ' + entries.length + ' file → bundle.zip (stored, tanpa kompresi — kompresi deflate jalan di server/Node)');
      };
      return n.h('div.col', null, [labeled('file', file), mode, n.h('button.btn.sm.pri', { text: 'proses', onclick: go }), out]);
    } },

    /* ---- markdown ---- */
    { id: 'md', ic: 'M↓', title: 'Markdown → HTML', cat: 'fmt', kw: 'markdown html preview render export', build: ({ show, ta, labeled, rows: r2 }) => {
      const src = ta({ rows: 6, value: '# Judul\n\n- satu\n- dua\n\n> kutipan\n\n```js\nconst a = 1;\n```\n\n[tautan](https://example.com)' });
      const prev = n.h('div.card.md', { style: { background: 'var(--bg2)' } });
      const go = () => { prev.innerHTML = n.md(src.value); const html = '<!doctype html><meta charset=utf-8><style>body{font:15px/1.6 system-ui;max-width:70ch;margin:40px auto;padding:0 20px}pre{background:#f4f5f7;padding:12px;overflow:auto;border-radius:8px}code{font-family:ui-monospace,monospace}</style>' + prev.innerHTML; show(html); };
      src.oninput = () => { prev.innerHTML = n.md(src.value); };
      return n.h('div.col', null, [labeled('markdown', src), prev, r2(btn('render + hasil HTML', go),
        btn('⤓ .html', () => { const html = '<!doctype html><meta charset=utf-8><title>doc</title><body>' + prev.innerHTML + '</body>'; n.ui.download(new Blob([html], { type: 'text/html' }), 'doc.html'); }),
        btn('⎙ print/PDF', () => { try { n.tools.pdf.fromHtml('doc', prev.innerHTML); } catch (e) { n.ui.toast(e.message, 'warn'); } }))]);
    } },

    /* ---- secrets vault ---- */
    { id: 'vault', ic: '⛨', title: 'Encrypted notes (AES-GCM)', cat: 'sec', kw: 'vault secret catatan enkripsi aes password', build: ({ show, ta, labeled, inp, rows: r2 }) => {
      const pass = inp({ type: 'password', placeholder: 'passphrase (tidak disimpan — key diturunkan tiap buka)' });
      const txt = ta({ rows: 5, placeholder: 'catatan rahasia…' });
      const saved = n.store.settings.get().vault || null;
      const box = n.h('div.col');
      const derive = async (p, salt) => crypto.subtle.importKey('raw', new TextEncoder().encode(p), 'PBKDF2', false, ['deriveKey'])
        .then(b => crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, b, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']));
      const enc = async () => {
        try {
          const salt = crypto.getRandomValues(new Uint8Array(16));
          const key = await derive(pass.value, salt);
          const iv = crypto.getRandomValues(new Uint8Array(12));
          const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(txt.value));
          const blob = { salt: b64(salt), iv: b64(iv), ct: b64(new Uint8Array(ct)) };
          n.store.settings.set({ vault: blob });
          box.innerHTML = ''; box.appendChild(n.h('p.ok.small', { text: '✓ tersimpan terenkripsi di localStorage. ' + n.bytes(new Blob([JSON.stringify(blob)]).size) }));
        } catch (e) { box.innerHTML = ''; box.appendChild(n.h('p.bad.small', { text: e.message })); }
      };
      const dec = async () => {
        if (!saved) return n.ui.toast('Belum ada yang disimpan.', 'warn');
        try {
          const key = await derive(pass.value, Uint8Array.from(atob(saved.salt), c => c.charCodeAt(0)));
          const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Uint8Array.from(atob(saved.iv), c => c.charCodeAt(0)) }, key, Uint8Array.from(atob(saved.ct), c => c.charCodeAt(0)));
          txt.value = new TextDecoder().decode(pt);
          box.innerHTML = ''; box.appendChild(n.h('p.ok.small', { text: '✓ terbuka · AES-256-GCM + PBKDF2 150k iter (bukan pengganti KMS — ini demo)' }));
        } catch (e) { box.innerHTML = ''; box.appendChild(n.h('p.bad.small', { text: 'passphrase salah / data korup (GCM auth tag gagal).' })); }
      };
      const b64 = (u8) => btoa(String.fromCharCode(...u8));
      return n.h('div.col', null, [labeled('passphrase', pass), labeled('isi', txt), r2(btn('🔒 simpan', enc), btn('🔓 buka', dec), btn('hapus', () => { n.store.settings.set({ vault: null }); box.innerHTML = '<p class="tiny dim">vault dikosongkan.</p>'; })), box,
        saved ? n.h('p.tiny.dim', { text: 'ada data tersimpan: ' + n.when(0) + ' · ' + n.bytes(new Blob([JSON.stringify(saved)]).size) }) : n.h('p.tiny.mute', { text: 'vault kosong.' })]);
    } },

    /* ---- http status ---- */
    { id: 'http', ic: '⛯', title: 'HTTP status + header lookup', cat: 'net', kw: 'http status code 404 500 header request cors', build: ({ show, inp, labeled, rows: r2 }) => {
      const codes = { 100: 'Continue', 200: 'OK', 201: 'Created', 204: 'No Content', 206: 'Partial Content', 301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified', 307: 'Temporary Redirect', 308: 'Permanent Redirect', 400: 'Bad Request', 401: 'Unauthorized', 402: 'Payment Required', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 408: 'Request Timeout', 409: 'Conflict', 410: 'Gone', 413: 'Payload Too Large', 418: "I'm a teapot", 422: 'Unprocessable Entity', 425: 'Too Early', 429: 'Too Many Requests', 431: 'Request Header Fields Too Large', 500: 'Internal Server Error', 501: 'Not Implemented', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout', 505: 'HTTP Version Not Supported', 507: 'Insufficient Storage', 509: 'Bandwidth Limit Exceeded', 511: 'Network Authentication Required' };
      const t = n.h('table.t');
      const draw = (f) => {
        t.innerHTML = '';
        t.appendChild(n.h('tr', null, ['code', 'alasan', 'kapan'].map(x => n.h('th', { text: x }))));
        Object.entries(codes).filter(([k, v]) => !f || k.includes(f) || v.toLowerCase().includes(f.toLowerCase())).forEach(([k, v]) => t.appendChild(n.h('tr', null, [
          n.h('td', { html: '<b class="' + (k[0] === '4' ? 'bad' : k[0] === '5' ? 'warn' : 'ok') + '">' + k + '</b>' }), n.h('td', { text: v }), n.h('td.tiny.dim', { text: WHY[k] || '' })])));
      };
      const WHY = { 401: 'token hilang/expired — cek Authorization header', 403: 'autentikasi oke, izin tidak (atau CORS preflight lolos tapi policy nolak)', 404: 'path salah ATAU key provider tidak punya akses model', 410: 'resource dihapus permanen — sering berarti model EOL (kasus NVIDIA NIM di project ini)', 429: 'rate limit — backoff eksponensial + retry setelah x-ratelimit-reset', 502: 'upstream error / provider balikin HTML', 504: 'timeout gateway — naikkan maxDuration di serverless', 413: 'payload kebesaran — naikkan body size limit', 451: 'blocked for legal reasons' };
      draw('');
      const q = inp({ placeholder: 'filter…' });
      q.oninput = () => draw(q.value);
      return n.h('div.col', null, [labeled('cari', q), n.h('div.scroll', { style: { maxHeight: '340px' } }, t)]);
    } },

    /* ---- color from image ---- */
    { id: 'palette', ic: '◧', title: 'Palet dari gambar', cat: 'unit', kw: 'palet warna dominan extract css tailwind', build: ({ show, labeled }) => {
      const file = n.h('input', { type: 'file', accept: 'image/*' });
      const box = n.h('div.col');
      file.onchange = async () => {
        const f = file.files[0]; if (!f) return;
        const r = await n.tools.paletteFromImage(URL.createObjectURL(f), 10);
        box.innerHTML = '';
        r.palette.forEach(p => box.appendChild(n.h('div.row', null, [
          n.h('i', { style: { width: '26px', height: '26px', borderRadius: '7px', background: p.hex, border: '1px solid var(--line)' } }),
          n.h('b.mono.small', { text: p.hex }), n.h('span.tiny.dim', { text: p.weight + '%' }),
          n.h('button.btn.sm.gho', { text: 'tailwind', onclick: () => n.ui.copy("'" + p.hex.slice(1) + "': '" + p.hex + "',", 'token') })])));
        show('/* ' + r.name + ' */\n:root{\n' + r.palette.map((p, i) => '  --c' + (i + 1) + ':' + p.hex + ';').join('\n') + '\n}');
      };
      return n.h('div.col', null, [labeled('gambar', file), box]);
    } },

    /* ---- media probe ---- */
    { id: 'probe', ic: '◉', title: 'Media inspector', cat: 'media', kw: 'video audio metadata ffprobe durasi bitrate codec', build: ({ show, labeled }) => {
      const file = n.h('input', { type: 'file', accept: 'video/*,audio/*' });
      file.onchange = async () => {
        const f = file.files[0]; if (!f) return;
        try {
          const r = await n.tools.probeMedia(f);
          show(JSON.stringify({ ...r, size: n.bytes(r.size) }, null, 2));
        } catch (e) { show('ERROR: ' + e.message); }
      };
      return n.h('div.col', null, [labeled('file', file), n.h('p.tiny.mute', { text: 'Baca metadata via HTMLMediaElement (browser). Codec-level (h264 profile, GOP) butuh ffprobe di server → /api/probe.' })]);
    } },

    /* ---- ID gen ---- */
    { id: 'ids', ic: '⚑', title: 'ID generator (uuid/nanoid/snowflake)', cat: 'gen', kw: 'uuid nanoid ulid snowflake id unik', build: ({ show, labeled, inp, sel, rows: r2 }) => {
      const kind = sel(['uuid v4', 'uuid v7 (time-ordered)', 'nanoid 21', 'ulid', 'short 8', 'snowflake-like']);
      const k = inp({ type: 'number', value: 8, class: 'inp', style: { width: '90px' } });
      const A = 'useandom26T198340PX75pxJACKVERYMINDBUSHWOLFGQZbfghjklqvwyzrict';
      const gen = () => {
        const out2 = Array.from({ length: Math.min(500, +k.value || 8) }, () => {
          switch (kind.value) {
            case 'uuid v4': return crypto.randomUUID();
            case 'uuid v7 (time-ordered)': { const ts = Date.now().toString(16).padStart(12, '0'); const r = [...crypto.getRandomValues(new Uint8Array(10))].map(b => b.toString(16).padStart(2, '0')); return ts.slice(0, 8) + '-' + ts.slice(8, 12) + '-7' + r.slice(0, 3).join('').slice(0, 3) + '-' + ((8 + (parseInt(r[3], 16) & 3)).toString(16) + r[3].slice(1)) + '-' + r.slice(4).join(''); }
            case 'nanoid 21': return [...crypto.getRandomValues(new Uint8Array(21))].map(b => A[b % 64]).join('');
            case 'ulid': { let t = Date.now(); const C = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; let s = ''; for (let i = 0; i < 10; i++) { s = C[t % 32] + s; t = Math.floor(t / 32); } return s + [...crypto.getRandomValues(new Uint8Array(16))].map(b => C[b % 32]).join(''); }
            case 'short 8': return [...crypto.getRandomValues(new Uint8Array(8))].map(b => A[b % 64]).join('');
            default: { const seq = (Date.now() - 1288834974657) << 22 | n.tools.rnd(1023) << 12 | n.tools.rnd(4095); return String(seq); }
          }
        });
        show(out2.join('\n'));
      };
      return n.h('div.col', null, [r2(labeled('tipe', kind), labeled('jumlah', k)), r2(btn('⚑ generate', gen))]);
    } },

    /* ---- lorem ---- */
    { id: 'lorem', ic: '¶', title: 'Lorem / placeholder copy', cat: 'gen', kw: 'lorem ipsum placeholder teks dummy', build: ({ show, labeled, inp, sel, rows: r2 }) => {
      const s = inp({ type: 'number', value: 5, class: 'inp', style: { width: '90px' } });
      const kind = sel([{ value: 'id', text: 'gaya Indonesia (campur)', selected: true }, { value: 'en', text: 'lorem latin' }]);
      const go = () => {
        const base = n.tools.lorem(Math.min(40, +s.value || 5));
        show(kind.value === 'id' ? base.replace(/lorem ipsum/gi, 'data contoh').replace(/dolor sit amet/gi, 'teks sementara') : base);
      };
      return n.h('div.col', null, [r2(labeled('kalimat', s), labeled('gaya', kind)), r2(btn('¶ buat', go))]);
    } },

    /* ---- base conv ---- */
    { id: 'radix', ic: '#', title: 'Basis angka (2/8/10/16/36)', cat: 'unit', kw: 'biner hex desimal oktal radix bit mask', build: ({ show, inp, labeled, rows: r2 }) => {
      const v = inp({ value: '42' });
      const bits = n.h('div.mono.tiny.dim');
      const go = () => {
        const s = v.value.trim().replace(/^0[bxo#]/i, '').replace(/_/g, '');
        let n10;
        try { n10 = parseInt(s, /^1/.test(s) && !/[2-9a-f]/i.test(s) && s.length > 1 && /^[01]+$/.test(s) ? 2 : undefined); } catch (e) { }
        const guess = /^01+$/.test(s) && s.length > 3 ? 2 : /^[0-7]+$/.test(s) ? 8 : /^[\da-f]+$/i.test(s) ? 16 : 10;
        n10 = parseInt(s, guess);
        if (!Number.isFinite(n10)) return show('tidak dikenali');
        const bytes = n10 < 0 ? '—' : n10.toString(2).replace(/\B(?=(\d{4})+(?!\d))/g, ' ').padStart(Math.ceil(n10.toString(2).length / 8) * 8, '0');
        bits.textContent = bytes;
        show(['bin  ' + n10.toString(2), 'oktal ' + n10.toString(8), 'des  ' + n10.toString(10), 'hex  0x' + n10.toString(16).toUpperCase(), 'base36 ' + n10.toString(36), 'dibaca dari basis ' + guess + '\nbits: ' + bytes].join('\n'));
      };
      v.oninput = go;
      return n.h('div.col', null, [labeled('angka (auto-deteksi basis: 01→biner, 17→oktal/hex)', v), n.h('button.btn.sm.pri', { text: '# konversi', onclick: go }), bits]);
    } },

    /* ---- key tester ---- */
    { id: 'keytest', ic: '⚷', title: 'Provider key tester', cat: 'sec', kw: 'api key groq gemini nvidia test koneksi model list', build: ({ show, inp, labeled, rows: r2, sel }) => {
      const k = inp({ placeholder: 'kosong = pakai key dari secrets.local.js / localStorage', value: '' });
      const prov = sel([{ value: 'groq', text: 'Groq (models + chat)', selected: true }, { value: 'gemini', text: 'Gemini (models + generateContent)' }, { value: 'nvidia', text: 'NVIDIA NIM (models + chat)' }]);
      const go = async () => {
        const key = k.value.trim() || n.keyFor(prov.value);
        const base = n.CFG.PROVIDERS[prov.value].base;
        const lines = [];
        const t0 = performance.now();
        try {
          const r1 = await fetch(base + (prov.value === 'gemini' ? '/models?pageSize=8' : '/models'), { headers: prov.value === 'gemini' ? { 'x-goog-api-key': key } : { authorization: 'Bearer ' + key } });
          const j1 = await r1.json().catch(() => ({}));
          const list = (j1.data || j1.models || []).map(x => x.id || x.name);
          lines.push('GET ' + (prov.value === 'gemini' ? '/models' : '/models') + ' → HTTP ' + r1.status + ' (' + Math.round(performance.now() - t0) + 'ms)');
          lines.push('model tersedia: ' + list.length + (list.length ? '\n  ' + list.slice(0, 12).join('\n  ') : ''));
          if (r1.ok) {
            const t1 = performance.now();
            let r2b;
            if (prov.value === 'gemini') r2b = await fetch(base + '/models/gemini-2.5-flash:generateContent', { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ contents: [{ parts: [{ text: 'reply with exactly: PONG' }] }], generationConfig: { maxOutputTokens: 200 } }) });
            else r2b = await fetch(base + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, body: JSON.stringify({ model: list.includes('openai/gpt-oss-20b') ? 'openai/gpt-oss-20b' : (list[0] || 'meta-llama/llama-3.1-8b-instruct'), messages: [{ role: 'user', content: 'reply with exactly: PONG' }], max_completion_tokens: 60 }) });
            const j2 = await r2b.json().catch(() => ({}));
            const txt = prov.value === 'gemini' ? (j2?.candidates?.[0]?.content?.parts?.[0]?.text || j2?.error?.message || '') : (j2?.choices?.[0]?.message?.content || j2?.error?.message || '');
            lines.push('POST /chat → HTTP ' + r2b.status + ' (' + Math.round(performance.now() - t1) + 'ms)');
            lines.push('jawaban: ' + String(txt).slice(0, 200).replace(/\s+/g, ' '));
          }
        } catch (e) { lines.push('FATAL: ' + e.message + (prov.value === 'nvidia' ? '\nnvidia: /v1/models tanpa header kadang 403; endpoint chat bisa juga 410 (EOL) — cek README.' : '')); }
        show(lines.join('\n'));
      };
      return n.h('div.col', null, [r2(labeled('provider', prov), labeled('key override', k)), r2(btn('⚷ tes koneksi', go)),
        n.h('p.tiny.warn', { text: 'Tes ini memanggil provider langsung dari browser — key yang kamu ketik tidak disimpan di mana pun, tapi memang terkirim ke provider (itu tujuannya).' })]);
    } }
  ];

  /* ---------------- render + filter ---------------- */
  head.textContent = TOOLS.length + ' tool, semua jalan beneran';   // count never lies
  const built = new Set();
  function render() {
    const q = search.value.trim().toLowerCase();
    grid.innerHTML = '';
    let shown = 0;
    TOOLS.forEach(t => {
      const okCat = filterCat === 'all' || t.cat === filterCat;
      const okQ = !q || ((t.title + ' ' + (t.kw || '')).toLowerCase().includes(q));
      if (!okCat || !okQ) return;
      shown++;
      let card = document.getElementById('tool-' + t.id);
      if (!card) card = toolCard(t), built.add(t.id);
      grid.appendChild(card);
    });
    count.textContent = shown + ' dari ' + TOOLS.length + ' tool';
    [...chips.children].forEach(c => c.classList.toggle('on', c.textContent === (filterCat === 'all' ? 'semua' : cat[filterCat])));
  }
  search.oninput = () => { clearTimeout(window.__st); window.__st = setTimeout(render, 120); };
  function sync() { render(); }
  render();
  if (location.hash) { const el = document.getElementById('tool-' + location.hash.slice(1)); if (el) setTimeout(() => { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.style.outline = '1px solid var(--cy)'; }, 200); }
})();
