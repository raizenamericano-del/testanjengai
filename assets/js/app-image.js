/* NEURAL AI STUDIO — image lab: generation + real canvas edit pipeline + gallery */
(function () {
  const n = window.NAS;
  let current = null;       /* dataURL sumber untuk editor */
  const size = n.h('span.mono.tiny.dim', { text: '—' });   // hoisted: setStage() touches it
  let busy = false;
  /* the lab re-renders the gallery via this ref; gallerySection() fills it in */
  let refreshGallery = () => { };

  const root = document.body;
  root.innerHTML = '';
  root.appendChild(n.ui.nav('image.html'));
  const wrap = n.h('div.wrap', { style: { padding: '18px 20px 40px', display: 'flex', flexDirection: 'column', gap: '16px' } });
  root.appendChild(wrap);
  document.documentElement.dataset.theme = n.store.settings.get().theme;
  if (n.store.settings.get().cursor && matchMedia('(pointer:fine)').matches) n.ui.cursorTrail();

  wrap.appendChild(n.h('div.row.spread', null, [
    n.h('div', null, [n.h('span.tag', { text: '❖ Image Lab' }), n.h('h1', { text: 'Generate, edit, export', style: { margin: '2px 0 0' } })]),
    n.h('div.row', null, [n.h('span.pill', null, 'engine: ' + n.CFG.PROVIDERS.gemini.image.join(' · ')), n.h('span.pill', { id: 'quota' })])
  ]));

  /* stage refs must exist before stage() is called by the render at the top of the file */
  let canvas = null;
  const stageBox = n.h('div', { id: 'preview' });

  const lab = n.h('div.lab');
  lab.append(leftPanel(), stage());
  wrap.appendChild(lab);
  wrap.appendChild(gallerySection());

  /* ============================ left: controls ============================ */
  function leftPanel() {
    const prompt = n.h('textarea.inp', { rows: 4, placeholder: 'deskripsikan subjek, gaya, cahaya, lens…  (ctrl+enter = generate)' });
    const negative = n.h('input.inp', { placeholder: 'blurry, watermark, teks, extra fingers' });
    let style = 'Realistic', aspect = '1:1', count = 1, model = n.CFG.DEFAULT_IMAGE;
    const styles = n.h('div.row', { style: { gap: '5px' } }, Object.keys(n.img.STYLE_PROMPTS).map(s =>
      n.h('button.chip' + (s === style ? '.on' : ''), { text: s, onclick: (e) => { style = s; [...styles.children].forEach(b => b.classList.toggle('on', b === e.target)); } })));
    const asp = n.h('div.seg', null, ['1:1', '16:9', '9:16'].map(a => n.h('button' + (a === aspect ? '.on' : ''), { text: a, onclick: (e) => { aspect = a; [...asp.children].forEach(b => b.classList.toggle('on', b === e.target)); } })));
    const cnt = n.h('input', { type: 'range', min: 1, max: 4, value: 1, class: 'range' });
    const cntOut = n.h('span.num', { text: '1' });
    cnt.oninput = () => { count = +cnt.value; cntOut.textContent = count + (count > 1 ? ' (variasi)' : ''); };
    const modelSel = n.h('select.inp', null, n.CFG.PROVIDERS.gemini.image.map(m => n.h('option', { value: m, text: m, selected: m === model })));
    modelSel.onchange = () => { model = modelSel.value; n.store.settings.set({ imageModel: model }); };

    const refBox = n.h('div');
    const refIn = n.h('input', { type: 'file', accept: 'image/*', class: 'hide' });
    let refData = null;
    refIn.onchange = async () => {
      const f = refIn.files[0]; if (!f) return;
      refData = await n.blobToDataUrl(f); refData = { b64: refData.split(',')[1], type: f.type };
      refBox.innerHTML = '';
      refBox.append(n.h('img', { src: (await n.blobToDataUrl(f)), style: { borderRadius: '9px', border: '1px solid var(--line)', maxHeight: '86px' } }),
        n.h('button.btn.sm.gho', { text: '✕ hapus ref', onclick: () => { refData = null; refBox.innerHTML = ''; } }));
    };

    const go = async () => {
      const p = prompt.value.trim();
      if (!p) return n.ui.toast('Isi prompt dulu.', 'warn');
      if (busy) return;
      busy = true; const btn = genBtn; const t0 = Date.now(); btn.textContent = 'Generating…'; btn.disabled = true;
      try {
        const items = await n.img.batch({ prompt: p, negative: negative.value, style, aspect, model, reference: refData }, count, (_, i) => n.ui.progress(prog, (i + 1) / count, 'variasi ' + (i + 1) + '/' + count));
        items.forEach(it => { n.store.images.put({ id: n.uid('img'), at: Date.now(), prompt: it.prompt, dataUrl: it.dataUrl, model: it.model, style, aspect, source: 'lab' }); n.store.log('image', it.prompt.slice(0, 80)); });
        setStage(items[0].dataUrl);
        refreshGallery();
        n.ui.toast(count + ' gambar jadi dalam ' + ((Date.now() - t0) / 1000).toFixed(1) + 's', 'ok');
        n.ui.quotaPill();
      } catch (e) {
        n.ui.progress(prog, 0, '');
        n.ui.modal({ title: 'Generate gagal', body: n.h('div.col', null, [
          n.h('pre.out', { text: (e.message || String(e)) + (e.status ? '\nHTTP ' + e.status : '') }),
          e.hint && n.h('p.warn.small', { text: '→ ' + e.hint }),
          n.h('p.dim.small', { text: 'Model lain yang bisa dicoba: ' + n.CFG.PROVIDERS.gemini.image.join(', ') + '. Atau aktifkan proxy + NVIDIA FLUX (server/dev-proxy.mjs).' })
        ]) });
      } finally { busy = false; btn.textContent = '✦ Generate'; btn.disabled = false; n.ui.progress(prog, 0, ''); }
    };
    const genBtn = n.h('button.btn.pri.lg', { text: '✦ Generate', style: { width: '100%' }, onclick: go });
    prompt.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) go(); });
    const prog = n.h('div');

    return n.h('aside.card.col', { style: { gap: '12px' } }, [
      n.h('div', null, [n.h('label.fl', { text: 'Prompt' }), prompt]),
      n.h('div', null, [n.h('label.fl', { text: 'Negative prompt' }), negative]),
      n.h('div', null, [n.h('label.fl', { text: 'Style preset' }), styles]),
      n.h('div.row', null, [n.h('div', { style: { flex: 1 } }, [n.h('label.fl', { text: 'Aspect ratio' }), asp]),
        n.h('div', { style: { flex: 1 } }, [n.h('label.fl', { text: 'Batch' }), n.h('div.rowlab', null, [cnt, cntOut])])]),
      n.h('div', null, [n.h('label.fl', { text: 'Model' }), modelSel]),
      n.h('div', null, [n.h('label.fl', { text: 'Image-to-image (opsional)' }),
        n.h('button.btn.sm', { text: '📎 pilih gambar referensi', onclick: () => refIn.click() }), refBox, refIn,
        n.h('p.tiny.mute', { text: 'Dikirim sebagai inline_data ke model — dipakai untuk edit/variasi, bukan upload ke Cloudinary.' })]),
      prog, genBtn,
      n.h('p.tiny.mute', { text: 'Catatan: tidak ada Cloudinary/DB — galeri disimpan di localStorage device ini (dataURL). Sinkron antar-device butuh server + bucket.' })
    ]);
  }

  /* ============================ right: stage + editor ============================ */
  function setStage(dataUrl) {
    current = dataUrl;
    n.img.paint(stageBox, dataUrl).then(c => { canvas = c; stageBox.appendChild(c); size.textContent = c.width + '×' + c.height + ' px'; });
  }
  function getCanvas() { if (!canvas) throw new Error('Belum ada gambar. Generate dulu atau buka file.'); return canvas; }
  function apply(c, label) {
    canvas = c; stageBox.innerHTML = ''; stageBox.appendChild(c);
    size.textContent = c.width + '×' + c.height + ' px';
    hist.unshift({ label, canvas: c }); hist = hist.slice(0, 8);
    histList.innerHTML = ''; hist.forEach((x, i) => histList.appendChild(n.h('button.item', { onclick: () => apply(x.canvas, 'undo → ' + x.label), html: '<span class="nm">' + (i === 0 ? '▣' : '·') + ' ' + n.esc(x.label) + '</span><span class="d">' + x.canvas.width + '×' + x.canvas.height + '</span>' })));
  }
  let hist = [];

  function stage() {
    const histList = n.h('div.list');           // hoisted: used by the section() calls below
    const open = n.h('input', { type: 'file', accept: 'image/*', class: 'hide' });
    open.onchange = async () => { const f = open.files[0]; if (f) { setStage(await n.blobToDataUrl(f)); n.store.log('image.open', f.name); } };

    const num = (v, min, max, step) => { const out = { v }; const r = n.h('input', { type: 'range', min, max, step, value: v, class: 'range' }); const lab = n.h('span.num', { text: v }); r.oninput = () => { out.v = +r.value; lab.textContent = r.value; }; return { el: n.h('div.rowlab', null, [r, lab]), out }; };

    /* ops */
    const up = num(2, 2, 4, 1), sharp = num(.35, 0, 1, .05);
    const upscaleBtn = n.h('button.btn.sm.opbtn', { text: '⤢ HD upscale', onclick: () => { const c = n.img.op.upscale(getCanvas(), up.out.v, sharp.out.v); apply(c, 'upscale ' + up.out.v + '×'); } });
    const tol = num(42, 8, 90, 1), feat = num(1.4, 0, 3, .1);
    const rmbtn = n.h('button.btn.sm.opbtn', { text: '◻ hapus background', onclick: () => { n.ui.toast('Flood-fill berbasis warna tepi — bagus buat foto studio/polos. Untuk rambut/kain rumit pakai server (rembg/RMBG-2.0).', '', 5200); apply(n.img.op.removeBg(getCanvas(), tol.out.v, feat.out.v), 'remove bg'); } });
    const lv = num(.6, 0, .95, .05), sat = num(1.15, .4, 2, .05), warm = num(0, -1, 1, .05), clar = num(.4, 0, 1, .05);
    const enh = n.h('button.btn.sm.opbtn', { text: '✨ enhance / denoise', onclick: () => apply(n.img.op.enhance(getCanvas(), { levels: lv.out.v, sat: sat.out.v, warm: warm.out.v, clarity: clar.out.v }), 'enhance') });
    const cst = num(.45, 0, 1, .05);
    const col = n.h('button.btn.sm.opbtn', { text: '🎨 colorize B/W', onclick: () => apply(n.img.op.colorize(getCanvas(), cst.out.v), 'colorize') });
    let styleKind = 'ghibli'; const sst = num(.75, .2, 1, .05);
    const sty = n.h('button.btn.sm.opbtn', { text: '🖌 style transfer', onclick: () => apply(n.img.op.stylize(getCanvas(), styleKind, sst.out.v), 'style ' + styleKind) });
    const styleSel = n.h('div.seg', null, ['ghibli', 'comic', 'oil', 'blueprint', 'duotone', 'pixel'].map(s => n.h('button' + (s === styleKind ? '.on' : ''), { text: s, onclick: (e) => { styleKind = s; [...styleSel.children].forEach(b => b.classList.toggle('on', b === e.target)); } })));
    const rad = num(26, 6, 90, 1);
    const inp = n.h('button.btn.sm.opbtn', { text: '🧽 object remover (lukis area → proses)', onclick: () => { startBrush(rad.out.v); } });
    const dl = num(.25, 0, .5, .01), dr = num(.25, 0, .5, .01), dt = num(.15, 0, .5, .01), db = num(.15, 0, .5, .01);
    const ext = n.h('button.btn.sm.opbtn', { text: '↹ outpaint / extend', onclick: () => apply(n.img.op.extend(getCanvas(), { l: dl.out.v, r: dr.out.v, t: dt.out.v, b: db.out.v }), 'extend') });
    const wmText = n.h('input.inp', { placeholder: '© namamu', value: '© NEURAL AI STUDIO' });
    const wmb = n.h('button.btn.sm.opbtn', { text: '▨ watermark', onclick: async () => { apply(await n.tools.watermark(getCanvas(), wmText.value), 'watermark'); } });
    const pal = n.h('button.btn.sm.opbtn', { text: '◧ ekstrak palet warna', onclick: async () => {
      try { const r = await n.tools.paletteFromImage(canvas.toDataURL(), 8); showPalette(r.palette); } catch (e) { n.ui.toast(e.message, 'err'); }
    } });
    const faceIn = n.h('input', { type: 'file', accept: 'image/*', class: 'hide' });
    const fx = num(.5, 0, 1, .01), fy = num(.45, 0, 1, .01), fs = num(.35, .1, .9, .01), fr = num(0, -.6, .6, .01), ff = num(.18, .02, .5, .01);
    let faceImg = null;
    const faceState = n.h('span.tiny.mute', { text: 'belum ada gambar' });   // hoisted above faceIn.onchange
    faceIn.onchange = async () => { const f = faceIn.files[0]; if (f) { faceImg = await n.img.load(URL.createObjectURL(f)); faceState.textContent = '✓ ' + f.name; } };
    const swap = n.h('button.btn.sm.opbtn', { text: '⇆ face swap (geser manual)', onclick: () => {
      if (!faceImg) return n.ui.toast('Pilih gambar wajah sumber dulu.', 'warn');
      n.ui.toast('Metode: ellipse-mask + colour transfer. Bukan InsightFace — untuk hasil arcface presisi jalankan roop/insightface di worker.', '', 5200);
      apply(n.img.op.blend(getCanvas(), faceImg, { x: fx.out.v, y: fy.out.v, s: fs.out.v, rot: fr.out.v, feather: ff.out.v }), 'face swap');
    } });

    const section = (title, kids, note) => n.h('div.col', { style: { gap: '6px' } }, [
      n.h('div.kicker', { text: title }), ...kids, note && n.h('p.tiny.mute', { text: note })]);

    const exportRow = n.h('div.row', null, [
      n.h('button.btn.sm', { text: 'PNG', onclick: () => exp('png') }),
      n.h('button.btn.sm', { text: 'JPG', onclick: () => exp('jpg') }),
      n.h('button.btn.sm', { text: 'WEBP', onclick: () => exp('webp') }),
      n.h('button.btn.sm', { text: 'ICO', onclick: async () => { try { await n.img.ico(getCanvas(), slug()); n.ui.toast('favicon.ico diunduh', 'ok'); } catch (e) { n.ui.toast(e.message, 'err'); } } }),
      n.h('button.btn.sm', { text: '⤓ zip', onclick: zipOne }),
      n.h('button.btn.sm', { text: '⧉ copy', onclick: async () => { try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': await n.dataUrlToBlob(canvas.toDataURL()) })]); n.ui.toast('Gambar disalin ke clipboard ✓', 'ok'); } catch (e) { n.ui.toast('Clipboard gambar tidak didukung browser ini — pakai Download.', 'warn'); } } }),
      n.h('button.btn.sm.dgr', { text: 'reset', onclick: () => { if (hist[hist.length - 1]) return; setStage(current); } })
    ]);

    async function exp(fmt) { await n.img.export(getCanvas(), fmt, slug()); n.store.log('image.export', fmt); }
    async function zipOne() {
      const e = await n.zipFile(slug() + '.png', await fetch(canvas.toDataURL()).then(r => r.blob()));
      n.ui.download(n.zip([e]), slug() + '.zip');
    }
    function slug() { return (current && current.slug) || (hist[0]?.label || 'neural-ai'); }

    return n.h('div.col', { style: { gap: '12px', minWidth: 0 } }, [
      n.h('div.card', null, [
        n.h('div.row.spread', null, [
          n.h('div.row', null, [n.h('button.btn.sm', { text: '📂 buka gambar', onclick: () => open.click() }), open, size]),
          n.h('div.row', { style: { gap: '4px' } }, [n.h('span.badge.pro', { text: 'canvas 2d' }), n.h('span.badge.free', { text: 'offline' })])
        ]),
        stageBox,
        n.h('div.row.mt', null, [n.h('button.btn.sm.gho', { text: '↶ undo', onclick: () => { if (hist[1]) apply(hist[1].canvas, 'undo'); else if (current) setStage(current); } }), exportRow])
      ]),
      n.h('div.card.grid.g2', null, [
        section('Upscale', [upscaleBtn, up.el, n.h('div.rowlab', null, [sharp.el.children[0], sharp.el.children[1]])], 'Lanczos-ish resample + unsharp mask. Real-ESRGAN butuh worker.'),
        section('Background', [rmbtn, tol.el, feat.el]),
        section('Enhance', [enh, lv.el, sat.el, warm.el, clar.el]),
        section('Colorize', [col, cst.el], 'Heuristic tint per region 8×8 px — DeOldify asli cuma jalan di worker GPU.'),
        section('Style transfer', [styleSel, sty, sst.el]),
        section('Hapus objek', [inp, rad.el], 'Lukis area yang mau dihapus langsung di canvas, lalu tombol proses.'),
        section('Outpaint', [ext, dl.el, dr.el, dt.el, db.el]),
        section('Face swap', [n.h('button.btn.sm', { text: '📎 gambar wajah sumber', onclick: () => faceIn.click() }), faceIn, faceState, swap, fx.el, fy.el, fs.el, fr.el, ff.el], 'Untuk wajah orang lain: wajib izin subjek. Jangan dipakai bikin konten yang menyamar jadi orang nyata.'),
        section('Watermark / palet', [wmText, wmb, pal]),
        n.h('div.col', null, [n.h('div.kicker', { text: 'Riwayat' }), histList, n.h('span.tiny.mute.histEmpty', { text: 'belum ada' })])
      ])
    ]);
  }

  /* brush for object removal */
  let brush = null;
  function startBrush(radius) {
    const c = getCanvas();
    const host = stageBox;
    const overlay = n.img.canvasOf(c.width, c.height);
    Object.assign(overlay.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', cursor: 'crosshair', borderRadius: '6px' });
    overlay.id = 'brush';
    host.appendChild(overlay);
    const ox = n.img.ctx(overlay);
    const mask = n.img.canvasOf(c.width, c.height); const mx = n.img.ctx(mask);
    let painting = false;
    const pos = (e) => { const r = overlay.getBoundingClientRect(); return { x: (e.clientX - r.left) * c.width / r.width, y: (e.clientY - r.top) * c.height / r.height }; };
    const draw = (e) => { const p = pos(e); ox.fillStyle = 'rgba(251,113,133,.5)'; ox.beginPath(); ox.arc(p.x, p.y, radius, 0, 7); ox.fill();
      mx.fillStyle = '#fff'; mx.beginPath(); mx.arc(p.x, p.y, radius, 0, 7); mx.fill(); };
    overlay.onpointerdown = (e) => { painting = true; overlay.setPointerCapture(e.pointerId); draw(e); };
    overlay.onpointermove = (e) => { if (painting) draw(e); };
    overlay.onpointerup = () => {
      painting = false;
      const done = n.h('button.btn.sm.pri', { text: '⚙ proses inpaint', style: { position: 'absolute', right: '8px', top: '8px', zIndex: 3 } });
      done.onclick = () => {
        try { const out = n.img.op.inpaint(c, mask, radius * 1.4); overlay.remove(); done.remove(); apply(out, 'inpaint r=' + radius); n.ui.toast('Selesai. Buat tambal halus, follow-up /image buat refine area.', 'ok', 4600); }
        catch (e) { n.ui.toast(e.message, 'err'); }
      };
      host.appendChild(done);
    };
    brush = { overlay, mask };
  }

  function showPalette(pal) {
    const box = n.h('div.col');
    pal.forEach(p => box.appendChild(n.h('div.row', null, [
      n.h('i', { style: { width: '30px', height: '30px', borderRadius: '8px', background: p.hex, border: '1px solid var(--line)' } }),
      n.h('b.mono.small', { text: p.hex }), n.h('span.tiny.mute', { text: p.weight + '%' }),
      n.h('button.btn.sm.gho', { text: 'copy', onclick: () => n.ui.copy(p.hex, 'hex') })
    ])));
    const css = pal.map((p, i) => '--nas-p' + (i + 1) + ':' + p.hex + ';').join('\n');
    box.appendChild(n.h('pre.out.mt', { text: ':root{\n' + css + '}' }));
    n.ui.modal({ title: 'Palet ' + pal.length + ' warna', body: box, footer: [n.h('button.btn.sm', { text: 'copy CSS vars', onclick: () => n.ui.copy(':root{\n' + css + '}', 'CSS') })] });
  }

  /* ============================ gallery ============================ */
  function gallerySection() {
    const q = n.h('input.inp', { placeholder: 'cari prompt di galeri…' });
    const grid = n.h('div.gal');
    const bar = n.h('div.row.spread', null, [
      n.h('div.row', null, n.h('h2', { text: 'Galeri', style: { margin: 0 } })),
      n.h('div.row', null, [
        n.h('span.badge.free', { text: 'localStorage' }),
        n.h('button.btn.sm', { text: '⤓ export ZIP semua', onclick: zipAll }),
        n.h('button.btn.sm.dgr', { text: 'kosongkan', onclick: () => n.ui.confirm('Hapus seluruh galeri di device ini?', () => { n.store.images.clear(); refreshGallery(); n.ui.toast('Galeri dikosongkan.', 'ok'); }, true) })
      ])
    ]);
    async function zipAll() {
      const rows = n.store.images.all();
      if (!rows.length) return n.ui.toast('Galeri kosong.', 'warn');
      n.ui.toast('Menyiapkan ' + rows.length + ' file…', '', 1800);
      const entries = [];
      for (const r of rows) {
        const blob = await fetch(r.dataUrl).then(x => x.blob());
        entries.push(await n.zipFile('images/' + String(rows.length - entries.length).padStart(3, '0') + '.png', blob));
      }
      entries.push(await n.zipFile('prompts.json', new Blob([JSON.stringify(rows.map(({ dataUrl, ...m }) => m), null, 2)], { type: 'application/json' })));
      n.ui.download(n.zip(entries), 'neural-ai-gallery.zip');
      n.store.log('gallery.zip', entries.length + ' file');
    }
    q.oninput = render;
    function render() {
      grid.innerHTML = '';
      const term = q.value.toLowerCase();
      const rows = n.store.images.all().filter(r => !term || (r.prompt || '').toLowerCase().includes(term));
      if (!rows.length) { grid.appendChild(n.h('div.empty', { text: 'Belum ada gambar' + (term ? ' yang cocok' : '') + '.' })); return; }
      rows.forEach(r => {
        const open = n.h('button.btn.sm.gho', { text: 'edit', onclick: () => { setStage(r.dataUrl); scrollTo({ top: 200, behavior: 'smooth' }); } });
        const dl = n.h('button.btn.sm.gho', { text: '⤓', title: 'unduh png', onclick: () => n.ui.download(r.dataUrl, 'neural-' + r.id + '.png') });
        const del = n.h('button.btn.sm.gho', { text: '✕', onclick: () => { n.store.images.del(r.id); render(); } });
        const share = n.h('button.btn.sm.gho', { text: '⧉', title: 'salin caption untuk Twitter/X', onclick: () => n.ui.copy(r.prompt + '\n\n#AIArt dibuat dengan NEURAL AI STUDIO (' + r.model + ')', 'Caption') });
        grid.appendChild(n.h('figure', null, [
          n.h('img', { src: r.dataUrl, alt: r.prompt.slice(0, 60), loading: 'lazy' }),
          n.h('figcaption', null, [n.h('span', { style: { flex: '1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, text: r.prompt.slice(0, 38) }), dl, open, share, del])
        ]));
      });
      bar.firstChild.querySelectorAll('.badge.free').forEach(x => x.remove());
      bar.firstChild.prepend(n.h('span.badge.free', { text: rows.length + ' item' }));
    }
    refreshGallery = render;
    render();                                    // initial paint (no-op on a fresh device)
    return n.h('section.card.pad0', { style: { padding: '16px' } }, [bar, q, grid]);
  }
  n.ui.quotaPill();
  n.store.log('page', 'image');
})();
