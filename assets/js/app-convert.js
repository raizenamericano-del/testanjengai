/* NEURAL AI STUDIO — Convert Hub.
   Prinsip: kalau transcode beneran gak bisa di browser, gue kasih re-wrap + keterangan jujur,
   bukan tombol yang pura-pura sukses. Semua file dibaca via FileReader/canvas/WebCodecs —
   gak ada satu byte pun yang ke server (kecuali kamu sendiri yang manggil AI).
   Aturan penulisan: semua const dideklarasiin di atas, DOM dirangkai pake .append() —
   const yang dipakai sebelum dideklarasiin = TDZ crash (uda 6× kejadian di build ini). */
(function () {
  const n = window.NAS;
  const root = document.body; root.innerHTML = '';
  root.appendChild(n.ui.nav('convert.html'));
  document.documentElement.dataset.theme = n.store.settings.get().theme;
  if (n.store.settings.get().cursor && matchMedia('(pointer:fine)').matches) n.ui.cursorTrail();

  const wrap = n.h('div.wrap', { style: { padding: '18px 20px 40px', maxWidth: '1120px', display: 'flex', flexDirection: 'column', gap: '12px' } });
  root.appendChild(wrap);

  /* ---------------- shared bits ---------------- */
  const pick = (accept, multiple, onfiles) => {
    const box = n.h('div.drop', { style: { padding: '18px', cursor: 'pointer', textAlign: 'center' } });
    const inp = n.h('input', { type: 'file', accept, multiple: !!multiple, class: 'hide' });
    inp.onchange = () => { const f = [...inp.files]; if (f.length) { onfiles(f); paint(); } };
    const paint = () => { box.innerHTML = ''; box.append(n.h('div.small', { text: multiple ? 'klik / seret file ke sini (boleh banyak)' : 'klik / seret 1 file ke sini' }), inp, ...((box._files || []).map(row))); };
    const row = (f, i) => n.h('div.frow', { style: { width: '100%', marginTop: '7px' } }, [
      n.h('b', { text: f.name }), n.h('span.mono.tiny.dim', { text: n.bytes(f.size) }),
      multiple && n.h('button.btn.sm.gho', { text: '✕', onclick: () => { box._files.splice(i, 1); sync(); } })
    ]);
    const sync = () => { box._files = [...inp.files]; paint(); };
    box.onclick = () => inp.click();
    box.ondragover = (e) => { e.preventDefault(); box.classList.add('hot'); };
    box.ondragleave = () => box.classList.remove('hot');
    box.ondrop = (e) => {
      e.preventDefault(); box.classList.remove('hot');
      const files = [...e.dataTransfer.files].filter(f => !accept || new RegExp(accept.replace(/[.,|]/g, '|').replace(/\*/g, '.*'), 'i').test(f.type) || true);
      try { const dt = new DataTransfer(); (box._files || []).concat(files).forEach(f => dt.items.add(f)); inp.files = dt.files; } catch (err) { }
      sync(); onfiles(box._files);
    };
    box._files = [];
    paint();
    return { el: box, get files() { return box._files; } };
  };
  const fmts = (list, val, on) => {
    const box = n.h('div.cfmt');
    list.forEach(f => box.appendChild(n.h('button.btn.sm' + (f === val ? '.pri' : '.gho'), { text: f, onclick: (e) => { [...box.children].forEach(b => { b.className = 'btn sm gho'; }); e.target.className = 'btn sm pri'; on(f); } })));
    return box;
  };
  const bar = n.h('div.bar');
  const prog = (p, label) => { bar.firstElementChild ? bar.firstChild.style.width = Math.round(p * 100) + '%' : bar.appendChild(n.h('i')); bar.title = label || ''; };
  const out = n.h('pre.out.hide');
  const show = (...kids) => { out.classList.remove('hide'); out.innerHTML = ''; n.append(out, kids); };
  const go = (label, fn, cls) => {
    const b = n.h('button', { class: cls || 'btn sm pri', text: label, onclick: async (e) => {
      b.disabled = true; const t = b.textContent; b.textContent = 'ngolah…'; prog(.2, 'jalan');
      try { await fn(); prog(1, 'selesai'); } catch (err) { show('✕ ' + err.message + (err.note ? '\n' + err.note : '')); n.ui.toast(err.message, 'err', 6000); }
      finally { b.disabled = false; b.textContent = t; setTimeout(() => prog(0, ''), 1200); }
    } });
    return b;
  };
  const dl = (blob, name) => n.h('button.btn.sm.gho', { text: '⤓ ' + name, onclick: () => n.ui.download(blob, name) });
  const note = (html) => n.h('p.tiny.mute.side-note', { html });
  const slider = (label, v, min, max, step, on) => {
    const r = n.h('input', { type: 'range', min, max, step, value: v, class: 'range' }), s = n.h('span.num', { text: String(v) });
    r.oninput = () => { s.textContent = r.value; on && on(+r.value); };
    return n.h('div', null, [n.h('label.fl', { text: label }), n.h('div.rowlab', null, [r, s])]);
  };
  const parseRanges = (str, total) => {
    const s = String(str || '').trim();
    if (!s) return [[0, total - 1]];
    return s.split(',').map(part => {
      const m = part.trim().match(/^(\d+)(?:-(\d+))?$/); if (!m) return null;
      const a = +m[1] - 1, b = m[2] ? +m[2] - 1 : a;
      return a >= 0 && b < total && b >= a ? [a, b] : null;
    }).filter(Boolean);
  };
  const table = (head, rows) => {
    const t = n.h('table.t');
    t.appendChild(n.h('thead', null, n.h('tr', null, head.map(h => n.h('th', { text: h })))));
    t.appendChild(n.h('tbody', null, rows.map(r => n.h('tr', null, r.map(c => n.h('td', typeof c === 'object' ? c : { text: String(c) }))))));
    return t;
  };

  /* ---------------- 1. PDF ---------------- */
  function pdfTab() {
    const box = n.h('div.col', { style: { gap: '10px' } });
    const files = pick('.pdf,application/pdf', true, f => { box.querySelectorAll('.cnt').forEach(x => x.remove()); box.appendChild(n.h('span.cnt.tiny.dim', { text: f.length + ' file dipilih' })); });
    const ranges = n.h('input.inp', { placeholder: 'range halaman, mis. 1-3,5,8-10 (kosong = per halaman)', value: '' });
    box.append(
      n.h('h3', { text: 'PDF merge · split · compress · ke teks', style: { margin: 0 } }),
      n.h('p.small.dim', { text: 'Pakai pdf-lib (dimuat dari CDN saat dipakai, ±500 KB). Semua di memory browser.' }),
      files.el,
      n.h('div.g2', { style: { display: 'grid', gap: '10px' } }, [
        n.h('div.col', { style: { gap: '6px' } }, [
          n.h('div.kicker', { text: 'gabung (urutan = urutan pilih)' }),
          go('⤓ merge → 1 pdf', async () => {
            if (files.files.length < 2) throw new Error('Pilih minimal 2 file pdf.');
            const r = await n.tools.pdf.merge(files.files);
            show('✓ ' + files.files.length + ' file → ' + r.pages + ' halaman · ' + n.bytes(r.blob.size));
            box.appendChild(dl(r.blob, 'merged.pdf'));
            n.store.log('convert.pdf.merge', files.files.length + ' file');
          })]),
        n.h('div.col', { style: { gap: '6px' } }, [
          n.h('div.kicker', { text: 'pisah per range' }), ranges,
          go('⤓ split → zip', async () => {
            const f = files.files[0]; if (!f) throw new Error('Pilih 1 file pdf dulu.');
            const probe = await n.tools.pdf.merge([f]);
            const jobs = await n.tools.pdf.split(f, parseRanges(ranges.value, probe.pages));
            const entries = [];
            for (const j of jobs) entries.push(await n.zipFile(j.name, j.blob));
            const z = n.zip(entries);
            show('✓ ' + jobs.length + ' bagian · ' + jobs.map(j => j.name + ' (' + n.bytes(j.blob.size) + ')').join('\n'));
            box.appendChild(dl(z, 'split.zip'));
          })])
      ]),
      n.h('div.g2', { style: { display: 'grid', gap: '10px' } }, [
        n.h('div.col', { style: { gap: '6px' } }, [
          n.h('div.kicker', { text: 'kompres' }),
          go('⇩ compress', async () => {
            const f = files.files[0]; if (!f) throw new Error('Pilih 1 file pdf.');
            const r = await n.tools.pdf.compress(f, p => prog(p * .8, 're-save'));
            show('sebelum ' + n.bytes(r.before) + ' → sesudah ' + n.bytes(r.after) + '  (' + r.saved + ' lebih kecil)\n' + r.note);
            box.appendChild(dl(r.blob, f.name.replace(/\.pdf$/i, '') + '-pressed.pdf'));
          }, 'btn sm'),
          note('Ini re-save + object streams, bukan downsample gambar. Kalau pdf-nya isinya scan 300dpi, penghematan nyata baru kerasa setelah raster ke JPEG (tab Image).')]),
        n.h('div.col', { style: { gap: '6px' } }, [
          n.h('div.kicker', { text: 'ecak teks' }),
          go('⇥ ke teks / markdown', async () => {
            const f = files.files[0]; if (!f) throw new Error('Pilih 1 file pdf.');
            const r = await n.tools.pdf.text(f);
            const md = r.text.split('\n').filter(x => x.trim()).map(x => x).join('\n\n');
            show('engine: ' + r.engine + (r.pages ? ' · ' + r.pages + ' halaman' : '') + '\n\n' + (md.slice(0, 4000) + (md.length > 4000 ? '\n…(' + md.length + ' char total)' : '')));
            box.appendChild(n.h('button.btn.sm.gho', { text: '⤓ .md', onclick: () => n.ui.download(new Blob([md], { type: 'text/markdown' }), f.name.replace(/\.pdf$/i, '') + '.md') }));
            box.appendChild(n.h('button.btn.sm.gho', { text: '⤓ .txt', onclick: () => n.ui.download(new Blob([r.text], { type: 'text/plain' }), f.name.replace(/\.pdf$/i, '') + '.txt') }));
          }, 'btn sm')])
      ]),
      bar, out
    );
    return box;
  }

  /* ---------------- 2. image ---------------- */
  function imageTab() {
    const box = n.h('div.col', { style: { gap: '10px' } });
    let format = 'webp', quality = .85, maxDim = 0;
    const files = pick('image/*', true, () => { });
    box.append(
      n.h('h3', { text: 'Gambar: png ↔ jpg ↔ webp ↔ avif · resize · massal', style: { margin: 0 } }),
      files.el,
      n.h('div.g2', null, [
        n.h('div.col', { style: { gap: '6px' } }, [n.h('label.fl', { text: 'format keluaran' }),
          fmts(['webp', 'jpg', 'png', 'avif', 'ico-strip'].filter(f => f !== 'avif' || n.tools.encodes('image/avif')), format, f => format = f),
          note('Format dibatasi encoder browser. App cek capability dulu: kalau AVIF/GIF gak bisa di-encode, kamu dikasih tau — gak pernah diam-diam ngeluarin PNG.')]),
        n.h('div.col', { style: { gap: '6px' } }, [
          slider('kualitas', 85, 30, 100, 1, v => quality = v / 100),
          slider('batas sisi terpanjang (0 = asli)', 0, 0, 4096, 64, v => maxDim = v)])
      ]),
      go('⇄ konversi semua', async () => {
        const list = files.files; if (!list.length) throw new Error('Pilih gambar dulu.');
        const results = [];
        let i = 0;
        for (const f of list) {
          prog(++i / list.length, f.name);
          try {
            if (format === 'ico-strip') { const im = await n.img.load(URL.createObjectURL(f)); results.push({ name: f.name.replace(/\.\w+$/, '') + '.ico', blob: await n.img.icoBlob(im, [16, 32, 48, 180]) }); continue; }
            const r = await n.tools.convertImage(f, format, quality, maxDim || undefined);
            results.push({ name: f.name.replace(/\.\w+$/, '') + '.' + (format === 'jpg' ? 'jpg' : format), blob: r.blob, from: f.size, to: r.blob.size });
          } catch (e) { results.push({ name: f.name, error: e.message }); }
        }
        const okRows = results.filter(r => !r.error);
        show(results.map(r => r.error ? '✕ ' + r.name + ' — ' + r.error : '✓ ' + r.name + '  ' + n.bytes(r.from) + ' → ' + n.bytes(r.to) + ' (' + (r.to / r.from * 100).toFixed(0) + '%)').join('\n')
          + '\n\n' + okRows.length + '/' + results.length + ' berhasil · format ' + format + ' · q=' + quality + (maxDim ? ' · max ' + maxDim + 'px' : ''));
        if (okRows.length === 1) box.appendChild(dl(okRows[0].blob, okRows[0].name));
        else if (okRows.length > 1) {
          (async () => { const entries = []; for (const r of okRows) entries.push(await n.zipFile(r.name, r.blob)); box.appendChild(dl(n.zip(entries), 'converted.zip')); })();
        }
        n.store.log('convert.image', format + ' ×' + okRows.length);
      }),
      bar, out
    );
    return box;
  }

  /* ---------------- 3. audio ---------------- */
  function audioTab() {
    const box = n.h('div.col', { style: { gap: '10px' } });
    let target = 'mp3', bitrate = 128;
    const files = pick('audio/*,.mp3,.wav,.ogg,.m4a,.flac,.opus,.aac', true, () => { });
    box.append(
      n.h('h3', { text: 'Audio: transcode + potong', style: { margin: 0 } }),
      files.el,
      n.h('div.g2', null, [
        n.h('div.col', { style: { gap: '6px' } }, [n.h('label.fl', { text: 'format keluaran' }), fmts(['mp3', 'wav', 'ogg', 'opus', 'flac', 'webm'], target, f => target = f),
          note('WAV = penulis PCM punya sendiri (100% offline). mp3/ogg/flac butuh encoder: kalau gak ada di browser, hasilnya WAV + keterangannya. Jangan harap "bitrate persis" dari re-wrap.')]),
        n.h('div.col', { style: { gap: '6px' } }, [slider('bitrate (kbps)', 128, 48, 320, 8, v => bitrate = v),
          n.h('div.row', null, [n.h('label.fl', { text: 'potong dari' }), n.h('input.inp', { id: 'afrom', type: 'number', value: 0, min: 0, step: .1, style: { maxWidth: '100px' } }), n.h('label.fl', { text: 'sampai' }), n.h('input.inp', { id: 'ato', type: 'number', value: 0, min: 0, step: .1, style: { maxWidth: '100px' } })])])
      ]),
      go('⇄ transcode', async () => {
        const list = files.files; if (!list.length) throw new Error('Pilih file audio dulu.');
        const from = +(document.getElementById('afrom').value || 0), to = +(document.getElementById('ato').value || 0);
        const rows = [];
        let i = 0;
        for (const f of list) {
          prog(++i / list.length, f.name);
          let src = f;
          if (to > from) {
            const buf = await n.tools.decodeAudio(f);
            const sr = buf.sampleRate, a = Math.floor(from * sr), b = Math.min(buf.length, Math.floor(to * sr));
            const AC = window.AudioContext || window.webkitAudioContext; const ac = new AC();
            const outB = ac.createBuffer(buf.numberOfChannels, b - a, sr);
            for (let c = 0; c < buf.numberOfChannels; c++) outB.copyToChannel(buf.getChannelData(c).subarray(a, b), c);
            src = new Blob([n.tools.wavEncode(outB)], { type: 'audio/wav' });
          }
          const r = await n.tools.encodeBlob(src, 'audio/' + target, bitrate * 1000);
          rows.push({ name: f.name.replace(/\.\w+$/, '') + '.' + (r.engine.indexOf('WAV') === 0 && target !== 'wav' ? 'wav' : target), blob: r.blob, engine: r.engine, from: f.size, to: r.blob.size });
        }
        show(rows.map(r => '✓ ' + r.name + '  ' + n.bytes(r.from) + ' → ' + n.bytes(r.to) + '  [' + r.engine + ']').join('\n'));
        if (rows.length === 1) box.appendChild(dl(rows[0].blob, rows[0].name));
        else (async () => { const entries = []; for (const r of rows) entries.push(await n.zipFile(r.name, r.blob)); box.appendChild(dl(n.zip(entries), 'audio.zip')); })();
        n.store.log('convert.audio', target + ' ×' + rows.length);
      }),
      bar, out
    );
    return box;
  }

  /* ---------------- 4. video ---------------- */
  function videoTab() {
    const box = n.h('div.col', { style: { gap: '10px' } });
    const files = pick('video/*,.mp4,.webm,.mov,.mkv', false, async (f) => {
      probeOut.innerHTML = '';
      try {
        const p = await n.tools.probeMedia(f[0]);
        const rows = Object.entries(p).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => [k, typeof v === 'number' ? (k.indexOf('ms') >= 0 || k === 'duration' ? (v / 1000).toFixed(2) + ' s' : v) : String(v)]);
        n.append(probeOut, table(['properti', 'nilai'], rows));
        probeOut.classList.remove('hide');
        if (p.width) { trimFrom.max = trimTo.max = trimTo.value = Math.round(p.duration / 1000); trimFrom.value = 0; }
      } catch (e) { probeOut.classList.remove('hide'); probeOut.textContent = 'probe gagal: ' + e.message; }
    });
    const trimFrom = n.h('input.inp', { type: 'number', value: 0, min: 0, step: .1, style: { maxWidth: '110px' } });
    const trimTo = n.h('input.inp', { type: 'number', value: 0, min: 0, step: .1, style: { maxWidth: '110px' } });
    const probeOut = n.h('pre.out.hide');
    box.append(
      n.h('h3', { text: 'Video: probe metadata + potong (WebCodecs)', style: { margin: 0 } }),
      files.el,
      n.h('p.small.dim', { text: 'Probe jalan di semua browser (baca header via <video>). Potong = decode → re-encode vp9/avc via WebCodecs: butuh Chrome/Edge 100+. Gak ada ffmpeg di browser, dan stream-copy belum bisa.' }),
      n.h('div.row', null, [n.h('label.fl', { text: 'dari (detik)' }), trimFrom, n.h('label.fl', { text: 'sampai' }), trimTo,
        go('✂ potong + unduh', async () => {
          const f = files.files[0]; if (!f) throw new Error('Pilih video dulu.');
          const a = +trimFrom.value, b = +trimTo.value; if (!(b > a)) throw new Error('Sampai harus > dari.');
          const r = await n.tools.trimVideo(f, a, b, p => prog(p, 'encoding'));
          show('✓ ' + (b - a).toFixed(2) + ' detik → ' + n.bytes(r.blob.size) + ' (' + r.type + ', ' + r.frames + ' frame)');
          box.appendChild(dl(r.blob, f.name.replace(/\.\w+$/, '') + '-cut.' + (r.type.indexOf('webm') >= 0 ? 'webm' : 'mp4')));
          n.store.log('convert.video', (b - a).toFixed(1) + 's');
        }),
        go('↻ transcode webm', async () => {
          const f = files.files[0]; if (!f) throw new Error('Pilih video dulu.');
          const r = await n.tools.trimVideo(f, 0, 1e9, p => prog(p, 'encoding')).catch(e => { if (e.code === 'noenc') throw new Error('WebCodecs gak ada — pakai /api/media/trim (ffmpeg) di server, dokumennya di server/nextjs-map.md §media.'); throw e; });
          show('✓ webm utuh ' + n.bytes(r.blob.size)); box.appendChild(dl(r.blob, f.name.replace(/\.\w+$/, '') + '.webm'));
        }, 'btn sm gho')]),
      probeOut, bar, out
    );
    return box;
  }

  /* ---------------- 5. dokumen ---------------- */
  function docTab() {
    const box = n.h('div.col', { style: { gap: '10px' } });
    let out2 = 'markdown';
    const files = pick('.pdf,.docx,.xlsx,.pptx,.txt,.md,.csv,.json,.html', true, () => { });
    box.append(
      n.h('h3', { text: 'Dokumen → markdown / teks / csv / json', style: { margin: 0 } }),
      files.el,
      n.h('label.fl', { text: 'format keluaran' }), fmts(['markdown', 'text', 'html', 'csv', 'json'], out2, f => out2 = f),
      go('⇄ ubah', async () => {
        const list = files.files; if (!list.length) throw new Error('Pilih file dulu.');
        const parts = [];
        let i = 0;
        for (const f of list) {
          prog(++i / list.length, f.name);
          const r = await n.ai.extract(f);
          if (!r.text || r.text.length < 4) { parts.push({ name: f.name, text: '(gak ada teks yang bisa diextract — kemungkinan hasil scan. OCR butuh worker: tesseract.js di server.)', kind: r.kind }); continue; }
          let text = r.text;
          if (out2 === 'html') text = '<!doctype html><meta charset="utf-8"><title>' + n.esc(f.name) + '</title>\n\n' + n.md(text);
          if (out2 === 'json') text = JSON.stringify({ source: f.name, kind: r.kind, chars: text.length, text }, null, 2);
          parts.push({ name: f.name, text, kind: r.kind });
        }
        show(parts.map(p => p.name + '  [' + p.kind + ']  ' + p.text.length + ' char').join('\n') + '\n\n─────\n\n' + parts.map(p => '## ' + p.name + '\n\n' + p.text).join('\n\n').slice(0, 6000));
        const ext = { markdown: 'md', text: 'txt', html: 'html', json: 'json', csv: 'csv' }[out2];
        if (parts.length === 1) box.appendChild(dl(new Blob([parts[0].text], { type: 'text/plain' }), parts[0].name.replace(/\.\w+$/, '') + '.' + ext));
        else (async () => { const entries = []; for (const p of parts) entries.push(await n.zipFile(p.name.replace(/\.\w+$/, '') + '.' + ext, new Blob([p.text], { type: 'text/plain' }))); box.appendChild(dl(n.zip(entries), 'converted.zip')); })();
        n.store.log('convert.doc', out2 + ' ×' + parts.length);
      }),
      note('csv keluaran cuma relevan buat file tabel (xlsx/csv) — pake tool Table di ⚙ Tools biar bisa milih sheet & header. DOCX/XLSX dibaca dari XML dalamnya, gak perlu library.'),
      bar, out
    );
    return box;
  }

  /* ---------------- 6. archive ---------------- */
  function zipTab() {
    const box = n.h('div.col', { style: { gap: '10px' } });
    const folder = n.h('input.inp', { value: 'files', placeholder: 'nama folder di dalam zip', style: { maxWidth: '260px' } });
    const files = pick('', true, () => { });
    box.append(
      n.h('h3', { text: 'ZIP: bikin & buka arsip', style: { margin: 0 } }),
      files.el, folder,
      n.h('div.row', null, [
        go('⇩ bikin .zip', async () => {
          const list = files.files; if (!list.length) throw new Error('Pilih file dulu.');
          const entries = [];
          let i = 0;
          for (const f of list) { prog(++i / list.length, f.name); entries.push(await n.zipFile((folder.value.trim() ? folder.value.trim().replace(/\/$/, '') + '/' : '') + f.name, f)); }
          const z = n.zip(entries);
          show('✓ ' + entries.length + ' file · ' + n.bytes(list.reduce((a, b) => a + b.size, 0)) + ' → ' + n.bytes(z.size) + ' (stored, tanpa kompresi)');
          box.appendChild(dl(z, 'arsip.zip'));
        }),
        go('⇧ buka .zip', async () => {
          const f = files.files.find(x => /\.zip$/i.test(x.name)) || files.files[0]; if (!f) throw new Error('Pilih file zip.');
          const got = await n.ai.unzip(f);
          const keys = Object.keys(got);
          if (!keys.length) throw new Error('Arsip kosong / format gak dikenal.');
          const total = keys.reduce((a, k) => a + got[k].length, 0);
          show(keys.map(k => '  ' + k + '  ' + n.bytes(got[k].length)).join('\n') + '\n\n' + keys.length + ' file · ' + n.bytes(total));
          const entries = keys.map(k => ({ name: k, data: got[k] }));
          box.appendChild(dl(n.zip(entries), 'extracted.zip'));
          box.appendChild(n.h('button.btn.sm.gho', { text: '⤓ file teks pertama', onclick: () => { const k = keys.find(x => /\.(txt|md|csv|json|xml|html)$/.test(x)) || keys[0]; n.ui.download(new Blob([got[k]]), k.split('/').pop()); } }));
        }, 'btn sm')
      ]),
      note('Penulis ZIP di build ini metode "stored" (tanpa deflate) — file masuk utuh, ukuran ya segitu. Buat kompresi nyata (mis. ngirim 200 foto), jalankan di server: <code>zip -9</code> / qpdf. Pembaca ZIP pakai DecompressionStream, jadi docx/xlsx bisa dibuka.'),
      bar, out
    );
    return box;
  }

  /* ---------------- mount ---------------- */
  wrap.appendChild(n.h('div.row.spread', null, [
    n.h('div', null, [
      n.h('span.tag', { text: '⇋ Convert Hub' }),
      n.h('h1', { text: 'Konversi file, tanpa upload', style: { margin: '2px 0 0' } })
    ]),
    n.h('div.row', null, [n.h('span.pill', { html: '<i class="live"></i>file gak ninggalin device' }), n.h('span.pill', { id: 'quotaPill' })])
  ]));
  wrap.appendChild(n.h('p.small.dim', { text: '6 mesin konversi yang beneran jalan di browser + keterangan jujur soal yang gak bisa. Yang butuh ffmpeg/GPU (kompres video, OCR, kompresiLossless) ditandai dan didokumentasiin di server/nextjs-map.md.' }));
  const host = n.h('div');
  wrap.appendChild(host);
  const tabber = n.ui.tabbed(host, [
    { id: 'pdf', label: '⎙ PDF', render: pdfTab },
    { id: 'image', label: '🖼 Gambar', render: imageTab },
    { id: 'audio', label: '🎧 Audio', render: audioTab },
    { id: 'video', label: '🎬 Video', render: videoTab },
    { id: 'doc', label: '📄 Dokumen', render: docTab },
    { id: 'zip', label: '🗜 ZIP', render: zipTab }
  ]);
  if (location.hash) tabber.go(location.hash.slice(1));
  n.convert = { tabs: ['pdf', 'image', 'audio', 'video', 'doc', 'zip'], go: (id) => tabber.go(id), parseRanges };
  root.appendChild(n.ui.foot());
  n.ui.quotaPill();
  n.store.log('page', 'convert');
})();
