/* NEURAL AI STUDIO — Photo Studio.
   7 editor, semua jalan di canvas 2D device sendiri (gak ada upload). Yang butuh model (Real-ESRGAN,
   rembg, DeOldify, InsightFace) ditandai jujur + ada tombol "generate AI" yang manggil provider kalau
   key-nya ada. Urutan deklarasi di file ini penting: semua const/let di atas, append di bawah —
   pola `const x` yang dipakai sebelum dideklarasiin bikin TDZ crash (udah kejadian 5× di build ini). */
(function () {
  const n = window.NAS;
  const root = document.body; root.innerHTML = '';
  root.appendChild(n.ui.nav('photo.html'));
  document.documentElement.dataset.theme = n.store.settings.get().theme;
  if (n.store.settings.get().cursor && matchMedia('(pointer:fine)').matches) n.ui.cursorTrail();

  const wrap = n.h('div.wrap', { style: { padding: '18px 20px 40px', maxWidth: '1180px' } });
  root.appendChild(wrap);

  /* ---------------- state ---------------- */
  let mode = location.hash.slice(1) || 'bg';
  let canvas = null;                 // working canvas (hasil terakhir)
  let base = null;                   // canvas sumber sebelum edit
  let hist = [];                     // [{label, dataUrl}]
  const stage = n.h('div.stage');
  const controls = n.h('div.ctrl');
  const strip = n.h('div.hist');
  const sizeLbl = n.h('span.mono.tiny.dim', { text: 'belum ada gambar' });
  const brushCursor = n.h('div', { id: 'brushcur' });
  document.body.appendChild(brushCursor);
  const EMPTY = 'Taruh gambar di sini — drag & drop, klik, atau paste (Ctrl+V)';

  const EDITORS = {
    bg:       { icon: '◻', title: 'Hapus background', blurb: 'Flood-fill dari tepi + feather. Buat foto studio/polos; rambut & kain rumit butuh model.', need: 'GPU worker (rembg / RMBG-2.0)' },
    enhance:  { icon: '✨', title: 'Enhance / denoise', blurb: 'Levels, clarity (unsharp), saturasi, kehangatan — per-pixel, real-time.', need: '' },
    colorize: { icon: '🎨', title: 'Colorize B/W', blurb: 'Tint per-region 8px + luminance mapping. Heuristik, bukan DeOldify.', need: 'DeOldify / CADM (GPU)' },
    style:    { icon: '🖌', title: 'Style transfer', blurb: '6 preset: ghibli, comic, oil, blueprint, duotone, pixel.', need: 'NST / AdaIN (GPU) buat hasil sinematik' },
    erase:    { icon: '🧽', title: 'Hapus objek', blurb: 'Lukis area yang mau diilangin → inpaint neighborhood-mean.', need: 'LaMa / stable-diffusion inpaint' },
    extend:   { icon: '↹', title: 'Outpaint / extend', blurb: 'Perlebar kanvas ke 4 sisi, tepi di-feather supaya nyambung.', need: 'SDXL-outpaint buat isi yang masuk akal' },
    face:     { icon: '⇆', title: 'Face swap manual', blurb: 'Overlay + colour transfer + feather, digeser manual. Tanpa pengenalan wajah.', need: 'InsightFace/roop — cuma di worker, dan butuh izin subjek' }
  };
  const STYLE_KINDS = ['ghibli', 'comic', 'oil', 'blueprint', 'duotone', 'pixel'];

  /* ---------------- helpers ---------------- */
  const num = (label, v, min, max, step, onchange) => {
    const r = n.h('input', { type: 'range', min, max, step, value: v, class: 'range' });
    const out = n.h('span.num', { text: String(v) });
    const push = () => { out.textContent = r.value; onchange && onchange(+r.value); };
    r.oninput = push;
    return { el: n.h('div', null, [n.h('label.fl', { text: label }), n.h('div.rowlab', null, [r, out])]), get value() { return +r.value; }, reset: (x) => { r.value = x; push(); } };
  };
  const seg = (opts, val, on) => {
    const box = n.h('div.seg', null, opts.map(o => n.h('button' + (o === val ? '.on' : ''), { text: o, onclick: (e) => { [...box.children].forEach(b => b.classList.remove('on')); e.target.classList.add('on'); on(o); } })));
    return box;
  };
  const act = (label, fn, cls = 'btn sm pri') => n.h('button', { class: cls, text: label, onclick: async (e) => {
    if (!canvas && label !== 'Muat dari file') return n.ui.toast('Muat gambar dulu.', 'warn');
    e.target.disabled = true; const t = e.target.textContent; e.target.textContent = '…';
    try { await fn(); } catch (err) { n.ui.toast(err.message || String(err), 'err', 5200); }
    finally { e.target.disabled = false; e.target.textContent = t; }
  } });
  const draw = (c, label) => {
    if (!c || !c.width) throw new Error('canvas kosong');
    canvas = c;
    stage.innerHTML = '';
    stage.appendChild(c);
    sizeLbl.textContent = c.width + '×' + c.height + ' px' + (label ? ' · ' + label : '');
    if (label) { hist.push({ label, dataUrl: c.toDataURL() }); hist = hist.slice(-12); drawStrip(); }
    n.ui.quotaPill();
  };
  const drawStrip = () => {
    strip.innerHTML = '';
    if (!hist.length) { strip.appendChild(n.h('span.tiny.mute', { text: 'riwayat edit muncul di sini (maks 12)' })); return; }
    hist.slice().reverse().forEach((h, i) => {
      const img = n.h('img', { src: h.dataUrl, title: h.label + ' · klik buat balik', onclick: () => revert(hist.length - 1 - i) });
      if (i === 0) img.classList.add('on');
      strip.appendChild(img);
    });
  };
  const revert = (idx) => { const h = hist[idx]; if (!h) return; hist = hist.slice(0, idx + 1); n.img.load(h.dataUrl).then(c0 => { const c = toCanvas(c0); canvas = c; armBrush(!!maskC); stage.innerHTML = ''; stage.appendChild(c); drawStrip(); n.store.log('photo.undo', h.label); }); };

  /* <img> hasil decode dijadiin <canvas> dulu — op.* butuh getImageData, dan
     element di stage harus selalu canvas biar undo/brush nempel di pixel yang sama */
  const toCanvas = (im) => { if (im.tagName === 'CANVAS') return im; const c = n.img.canvasOf(im.width, im.height); n.img.ctx(c).drawImage(im, 0, 0); return c; };
  async function loadFrom(blob) {
    const url = await n.blobToDataUrl(blob);
    const c = toCanvas(await n.img.load(url));
    base = c; hist = [];
    draw(c, null);
    n.store.images.put({ id: n.uid('img'), at: Date.now(), prompt: '(dimuat dari device)', dataUrl: url, model: 'local', source: 'photo', size: c.width + 'x' + c.height });
    n.store.log('photo.load', blob.name || blob.type, c.width * c.height);
  }
  const fileIn = n.h('input', { type: 'file', accept: 'image/*', class: 'hide' });
  fileIn.onchange = () => fileIn.files[0] && loadFrom(fileIn.files[0]);

  const drop = n.h('div.drop', { text: EMPTY, tabindex: '0', style: { minHeight: '140px', display: 'grid', placeItems: 'center', cursor: 'pointer' } });
  drop.onclick = () => fileIn.click();
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('hot'); };
  drop.ondragleave = () => drop.classList.remove('hot');
  drop.ondrop = async (e) => { e.preventDefault(); drop.classList.remove('hot'); const f = e.dataTransfer.files[0]; if (f) await loadFrom(f); };
  addEventListener('paste', async (e) => {
    const it = [...(e.clipboardData?.items || [])].find(x => x.type.startsWith('image/'));
    if (it) { const f = it.getAsFile(); if (f) { await loadFrom(f); n.ui.toast('Gambar dari clipboard dimuat ✓', 'ok'); } }
  });

  /* brush overlay for the erase editor */
  let painting = false, maskC = null, mctx = null;
  function armBrush(on) {
    if (!on) { stage.classList.remove('painting'); document.getElementById('brush')?.remove(); brushCursor.style.display = 'none'; return; }
    stage.classList.add('painting');
    const ov = n.img.canvasOf(canvas.width, canvas.height);
    ov.id = 'brush';
    Object.assign(ov.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', cursor: 'none' });
    mctx = ov.getContext('2d');
    maskC = ov;
    stage.appendChild(ov);
    const pos = (e) => { const r = ov.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * ov.width, y: (e.clientY - r.top) / r.height * ov.height }; };
    const dot = (x, y, r, col) => { mctx.fillStyle = col; mctx.beginPath(); mctx.arc(x, y, r, 0, 7); mctx.fill(); };
    ov.onpointerdown = (e) => { painting = true; ov.setPointerCapture(e.pointerId); const { x, y } = pos(e); dot(x, y, brushR.value, 'rgba(255,0,80,.45)'); dot(x, y, brushR.value, '#f00'); };
    ov.onpointermove = (e) => {
      const { x, y } = pos(e); const r = ov.getBoundingClientRect();
      Object.assign(brushCursor.style, { display: 'block', left: e.clientX + 'px', top: e.clientY + 'px', width: (brushR.value * 2 * r.width / ov.width) + 'px', height: (brushR.value * 2 * r.width / ov.width) + 'px' });
      if (!painting) return; dot(x, y, brushR.value, 'rgba(255,0,80,.45)'); dot(x, y, brushR.value, '#f00');
    };
    ov.onpointerup = () => { painting = false; };
    ov.onpointerleave = () => { painting = false; brushCursor.style.display = 'none'; };
  }
  const brushR = num('ukuran kuas', 26, 6, 120, 1);

  /* ---------------- per-editor controls ---------------- */
  const tol = num('toleransi warna tepi', 42, 8, 90, 1);
  const feather = num('feather edge', 1.4, 0, 6, .1);
  const lv = num('levels / contrast', .6, 0, .95, .05);
  const sat = num('saturasi', 1.12, .2, 2.4, .02);
  const warm = num('kehangatan', 0, -1, 1, .05);
  const clar = num('clarity (unsharp)', .4, 0, 1, .05);
  const cst = num('kekuatan tint', .45, 0, 1, .05);
  const sst = num('kekuatan style', .75, .1, 1, .05);
  const rad = num('radius blend', 26, 4, 90, 1);
  const padL = num('kiri', .25, 0, 1, .01), padR = num('kanan', .25, 0, 1, .01), padT = num('atas', .12, 0, 1, .01), padB = num('bawah', .12, 0, 1, .01);
  const fx = num('x wajah', .5, 0, 1, .01), fy = num('y wajah', .45, 0, 1, .01), fs = num('skala', .35, .05, 1.5, .01), frot = num('rotasi', 0, -.6, .6, .01), ffe = num('feather', .18, .02, .6, .01);
  let styleKind = 'ghibli', faceImg = null;
  const faceState = n.h('span.tiny.mute', { text: 'belum ada gambar wajah' });
  const faceIn = n.h('input', { type: 'file', accept: 'image/*', class: 'hide' });
  faceIn.onchange = async () => { const f = faceIn.files[0]; if (!f) return; faceImg = await n.img.load(URL.createObjectURL(f)); faceState.textContent = '✓ ' + f.name + ' · ' + faceImg.width + '×' + faceImg.height; };

  const needNote = (k) => EDITORS[k].need ? n.h('p.tiny.mute', { html: 'Butuh model/server buat hasil kelas studio: <b>' + EDITORS[k].need + '</b> — lihat <code>server/nextjs-map.md</code>. Yang kamu liat sekarang implementasi canvas asli, bukan placeholder.' }) : '';
  const aiBtn = (k) => n.h('details', null, [
    n.h('summary.small.dim', { text: '⌁ Alternatif: generate ulang dengan AI (butuh key)' }),
    n.h('p.tiny.mute', { text: 'Ngirim prompt + gambar referensi ke Gemini image, hasil masuk ke kanvas. Ini jalur yang sama kayak Image Lab.' }),
    n.h('textarea.inp', { rows: 2, id: 'aip', placeholder: 'prompt tambahan, mis. "studio lighting, 85mm, clean white background"' }),
    n.h('button.btn.sm.gho', { text: 'generate', onclick: async (e) => {
      if (!n.hasKey('gemini')) return n.ui.toast('Gak ada Gemini key — isi di account.html ▸ Settings atau pakai Image Lab.', 'warn', 5000);
      e.target.disabled = true; e.target.textContent = 'ngirim…';
      try {
        const extra = document.getElementById('aip').value.trim();
        const prompt = ({ bg: 'subject isolated on pure transparent-style white background, no shadow',
          enhance: 'ultra sharp clean photo, correct exposure, no noise', colorize: 'naturally colorized vintage photo, realistic skin tones',
          style: 'painted in ' + styleKind + ' style', erase: 'clean background, no object', extend: 'seamless extended background', face: 'same composition, face relit naturally' })[k] + (extra ? ', ' + extra : '');
        const r = await n.img.batch({ prompt, aspect: 'source', model: n.CFG.DEFAULT_IMAGE, reference: canvas.toDataURL() }, 1);
        if (r[0]?.dataUrl) { const c = await n.img.load(r[0].dataUrl); draw(c, 'AI ' + k); n.store.log('photo.ai', k + ' via gemini'); }
        else n.ui.toast('Provider gak ngasih gambar (mungkin rate limit).', 'warn', 5000);
      } catch (err) { n.ui.toast('AI: ' + err.message, 'err', 6500); }
      finally { e.target.disabled = false; e.target.textContent = 'generate'; }
    } })
  ]);

  const controlSets = {
    bg: () => [tol.el, feather.el, n.h('div.row', null, [
      act('◻ hapus background', () => draw(n.img.op.removeBg(canvas, tol.value, feather.value), 'remove bg')),
      act('↺ restore', () => draw(base, 'restore'), 'btn sm gho')]), needNote('bg'), aiBtn('bg')],
    enhance: () => [lv.el, sat.el, warm.el, clar.el,
      n.h('div.row', null, [act('✨ jalankan', () => draw(n.img.op.enhance(canvas, { levels: lv.value, sat: sat.value, warm: warm.value, clarity: clar.value }), 'enhance')), act('auto (0.6/1.15/0/.45)', () => { lv.reset(.6); sat.reset(1.15); warm.reset(0); clar.reset(.45); draw(n.img.op.enhance(canvas, { levels: .6, sat: 1.15, warm: 0, clarity: .45 }), 'enhance auto'); }, 'btn sm gho')]), needNote('enhance'), aiBtn('enhance')],
    colorize: () => [cst.el, act('🎨 colorize', () => draw(n.img.op.colorize(canvas, cst.value), 'colorize')), needNote('colorize'), aiBtn('colorize')],
    style: () => [seg(STYLE_KINDS, styleKind, (v) => { styleKind = v; }), sst.el,
      act('🖌 terapkan', () => draw(n.img.op.stylize(canvas, styleKind, sst.value), 'style ' + styleKind)), needNote('style'), aiBtn('style')],
    erase: () => [brushR.el, n.h('div.row', null, [
      act(painting ? '✋ selesai ngelukis' : '🖌 mulai lukis', () => { painting ? armBrush(false) : armBrush(true); }, 'btn sm'),
      act('🧽 proses', () => { if (!maskC) throw new Error('Lukis dulu area yang mau dihapus.'); draw(n.img.op.inpaint(canvas, maskC, rad.value), 'erase'); }),
      act('bersihin mask', () => { mctx && mctx.clearRect(0, 0, maskC.width, maskC.height); }, 'btn sm gho')]),
      n.h('p.tiny.mute', { text: 'Area merah = yang bakal diilangin. Algoritma: neighborhood-mean, radius ngikutin ukuran kuas.' })],
    extend: () => [padL.el, padR.el, padT.el, padB.el,
      act('↹ perlebar', () => draw(n.img.op.extend(canvas, { l: padL.value, r: padR.value, t: padT.value, b: padB.value }), 'extend')), needNote('extend'), aiBtn('extend')],
    face: () => [n.h('div.row', null, [n.h('button.btn.sm', { text: '📎 pilih gambar wajah', onclick: () => faceIn.click() }), faceIn, faceState]),
      fx.el, fy.el, fs.el, frot.el, ffe.el,
      n.h('div.row', null, [act('⇆ tempel', () => { if (!faceImg) throw new Error('Pilih gambar wajah dulu.'); draw(n.img.op.blend(canvas, faceImg, { x: fx.value, y: fy.value, s: fs.value, rot: frot.value, feather: ffe.value }), 'face blend'); }),
        act('⚠ kenapa manual', () => n.ui.modal({ title: 'Face swap: batasan yang gue pasang', body: n.h('div.col', null, [
          n.h('p.small', { text: 'Pengenalan/penimpaan wajah otomatis (ArcFace → insightface/roop) punya dua masalah: (1) butuh worker GPU + model 300MB, (2) gampang dipakai bikin konten yang menyamar jadi orang nyata.' }),
          n.h('p.small', { text: 'Jadi di build ini: geser-skala-feather manual, tanpa face-recognition. Kalau kamu butuh yang otomatis — pasang di worker sendiri, simpan audit log-nya, dan wajib izin subjek. Contoh desainnya ada di server/nextjs-map.md §media.' }),
          n.h('p.tiny.warn', { text: 'Dilarang: wajah orang lain tanpa izin, konten seksual, penipuan/impersonasi. Beberapa yurisdiksi udah nganggep ini pidana.' })
        ]), footer: [n.h('button.btn.sm.pri', { text: 'ngerti', onclick: (e) => e.target.closest('.modal').remove() })] }), 'btn sm gho')]),
      needNote('face'), aiBtn('face')]
  };

  /* ---------------- header / cards / workbench ---------------- */
  wrap.appendChild(n.h('div.row.spread', null, [
    n.h('div', null, [n.h('span.tag', { text: '❡ Photo Studio' }), n.h('h1', { text: '7 editor, nol upload', style: { margin: '2px 0 0' } })]),
    n.h('span.pill', { html: '<i class="live"></i>canvas 2D · offline' })
  ]));
  const cards = n.h('div.hits');
  Object.entries(EDITORS).forEach(([k, e]) => cards.appendChild(n.h('div.hit', {
    onclick: () => { location.hash = k; setMode(k); },
    style: k === mode ? { borderColor: 'color-mix(in srgb,var(--mg) 55%,transparent)' } : {}
  }, [n.h('div.g', { text: e.icon }), n.h('div', null, [n.h('b', { text: e.title }), n.h('p', { text: e.blurb })])])));
  wrap.appendChild(cards);

  const workbench = n.h('div.card.wb', { style: { marginTop: '14px' } });
  const exportRow = n.h('div.row', { style: { flexWrap: 'wrap' } }, [
    n.h('button.btn.sm.pri', { text: '⤓ png', onclick: () => exp('png') }),
    n.h('button.btn.sm', { text: 'jpg', onclick: () => exp('jpg') }),
    n.h('button.btn.sm', { text: 'webp', onclick: () => exp('webp') }),
    n.h('button.btn.sm', { text: 'ico', onclick: async () => { try { await n.img.ico(canvas, name()); n.ui.toast('favicon.ico diunduh', 'ok'); } catch (e) { n.ui.toast(e.message, 'err'); } } }),
    n.h('button.btn.sm.gho', { text: '⤓ zip (png+prompt)', onclick: async () => {
      const e = await n.zipFile(name() + '.png', await fetch(canvas.toDataURL()).then(r => r.blob()));
      const m = await n.zipFile('meta.json', new Blob([JSON.stringify({ mode, size: [canvas.width, canvas.height], history: hist.map(h => h.label), at: new Date().toISOString() }, null, 2)], { type: 'application/json' }));
      n.ui.download(n.zip([e, m]), name() + '.zip');
    } }),
    n.h('button.btn.sm.gho', { text: '↺ mulai ulang', onclick: () => { hist = []; drawStrip(); base && draw(base, null); armBrush(false); } })
  ]);
  function name() { return 'neural-' + mode + '-' + Date.now().toString(36).slice(-5); }
  async function exp(fmt) { if (!canvas) return n.ui.toast('Muat gambar dulu.', 'warn'); await n.img.export(canvas, fmt, name()); n.store.log('photo.export', fmt + ' ' + mode); }

  const title = n.h('h3', { text: '', style: { margin: 0 } });
  const sub = n.h('p.small.dim', { text: '', style: { margin: 0 } });
  const stageCard = n.h('div.col', { style: { gap: '10px', minWidth: 0 } }, [
    n.h('div.row.spread', null, [n.h('div.row', null, [n.h('button.btn.sm', { text: '📂 muat gambar', onclick: () => fileIn.click() }), fileIn, sizeLbl]), n.h('div.row', null, [n.h('span.badge.free', { text: 'device-only' }), n.h('span.badge.pro', { text: 'canvas 2d' })])]),
    stage,
    n.h('div.row', null, [n.h('button.btn.sm.gho', { text: '↶ undo', onclick: () => { if (hist.length > 1) { hist.pop(); revert(hist.length - 1); } else if (base) draw(base, null); } }), exportRow]),
    strip
  ]);

  function setMode(k) {
    mode = k;
    const e = EDITORS[k];
    title.textContent = e.icon + ' ' + e.title;
    sub.textContent = e.blurb;
    armBrush(false);
    controls.innerHTML = '';
    n.append(controls, [n.h('div.row.spread', null, [title, n.h('span.badge.free', { text: k })]), sub, ...controlSets[k]()]);
    [...cards.children].forEach((c, i) => { const on = Object.keys(EDITORS)[i] === k; c.style.borderColor = on ? 'color-mix(in srgb,var(--mg) 55%,transparent)' : ''; c.style.background = on ? 'color-mix(in srgb,var(--mg) 8%,var(--panel))' : ''; });
    /* repaint whatever we already have (mode switch must never wipe the picture) */
    stage.innerHTML = '';
    if (canvas) stage.appendChild(canvas);
    else if (base) stage.appendChild(base);
    else stage.appendChild(n.h('div.empty', { text: EMPTY }));
  }
  controls.appendChild(n.h('div.empty', { text: 'pilih editor di atas' }));
  workbench.append(controls, stageCard);
  wrap.append(drop, workbench);
  wrap.appendChild(n.h('p.tiny.mute', { style: { marginTop: '12px' }, html: 'Semua proses lokal: gambar gak pernah ninggalin browser, kecuali kamu sendiri yang pencet tombol "generate AI" di tiap editor. Data & riwayat numpuk di <code>localStorage</code> device ini — export/bersihin di account.html ▸ Settings.' }));

  /* hook buat test/otomasi (dan buat kamu iseng dari console): NAS.photo.load(blob) */
  n.photo = { load: loadFrom, get canvas() { return canvas; }, setMode, modes: Object.keys(EDITORS) };
  window.__photoLoad = (blob) => loadFrom(blob);
  setMode(EDITORS[mode] ? mode : 'bg');
  addEventListener('hashchange', () => { const k = location.hash.slice(1); if (EDITORS[k]) setMode(k); });
  drawStrip();
  n.ui.quotaPill();
  n.store.log('page', 'photo');
  root.appendChild(n.ui.foot());
})();
