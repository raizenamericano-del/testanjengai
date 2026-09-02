/* NEURAL AI STUDIO — media lab: link intel (11 platform), video/audio tools, TTS,
   procedural music engine (real WebAudio), slideshow video generator (real canvas capture). */
(function () {
  const n = window.NAS;
  const root = document.body; root.innerHTML = '';
  root.appendChild(n.ui.nav('media.html'));
  const wrap = n.h('div.wrap', { style: { padding: '18px 20px 40px', display: 'flex', flexDirection: 'column', gap: '14px' } });
  root.appendChild(wrap);
  document.documentElement.dataset.theme = n.store.settings.get().theme;
  if (n.store.settings.get().cursor && matchMedia('(pointer:fine)').matches) n.ui.cursorTrail();

  wrap.appendChild(n.h('div.row.spread', null, [
    n.h('div', null, [n.h('span.tag', { text: '⇩ Media Lab' }), n.h('h1', { text: 'Link intel & media tools', style: { margin: '2px 0 0' } })]),
    n.h('span.pill', { html: '<b class="warn">catatan:</b> identifikasi + preview resmi, bukan ripper' })
  ]));
  wrap.appendChild(n.h('div.card.warn', { style: { borderColor: 'color-mix(in srgb,var(--am) 40%,transparent)', background: 'color-mix(in srgb,var(--am) 8%,transparent)' } },
    n.h('p.small.dim', { html: '<b>Kenapa tidak ada tombol "Download TikTok/IG/YT"?</b> Mengambil file video dari platform itu melanggar ToS mereka, butuh endpoint tak resmi yang mati tiap minggu, dan di script bot yang kamu kirim endpoint-nya adalah mirror anonim (<code>tikwm.com</code>, <code>savett.cc</code>, <code>izuka-api.xyz</code>) yang bisa lihat setiap URL yang user kamu tempel. Tool di halaman ini: deteksi platform → parse ID → resolve shortlink (via proxy) → preview oEmbed resmi → embed player resmi → tombol buka di platform. Buat konten <b>milik sendiri</b>, tambahkan worker yt-dlp-mu sendiri di <code>/api/media/fetch</code> (README §downloader).' })));

  const host = n.h('div');
  wrap.appendChild(host);
  n.ui.tabbed(host, [
    { id: 'links', label: '🔗 Link Analyzer', render: linksTab },
    { id: 'video', label: '🎬 Video trim + probe', render: videoTab },
    { id: 'audio', label: '🎧 Audio convert + record', render: audioTab },
    { id: 'tts', label: '🗣 Text → Speech', render: ttsTab },
    { id: 'music', label: '🎹 Music Maker', render: musicTab },
    { id: 'vidgen', label: '🤖 AI Video / Slideshow', render: vidgenTab },
    { id: 'clone', label: '🧬 Voice clone', render: cloneTab }
  ]);
  n.store.log('page', 'media');

  /* ============================ 1. link analyzer ============================ */
  function linksTab() {
    const url = n.h('input.inp', { placeholder: 'tempel link TikTok / IG / YouTube / X / FB / Pinterest / Reddit / Spotify / SoundCloud / CapCut / Threads' });
    const res = n.h('div.col', { style: { gap: '12px' } });
    const go = async () => {
      res.innerHTML = ''; res.appendChild(n.h('div.skel', { style: { height: '120px' } }));
      const info = n.links.parse(url.value);
      res.innerHTML = '';
      if (!info.ok) return res.appendChild(n.h('div.card.bad', { text: info.error }));
      const adv = n.links.downloadAdvice(info);
      const embed = n.links.embed(info, null);
      res.appendChild(n.h('div.card.grid.g2', null, [
        n.h('div.col', null, [
          n.h('span.tag', { text: 'platform terdeteksi' }),
          n.h('h2', { text: info.label, style: { margin: '2px 0' } }),
          n.h('div.row', null, [info.kind && n.h('span.chip', { text: 'jenis: ' + info.kind }), info.user && n.h('span.chip', { text: '@' + info.user }), info.id && n.h('span.chip', { text: 'id: ' + String(info.id).slice(0, 22) })]),
          n.h('pre.out.mt', { text: JSON.stringify({ url: info.url, host: info.host, canonical: info.canonical, query: info.query, extra: info.extra }, null, 2) })
        ]),
        n.h('div.col', null, [
          n.h('span.tag', { text: 'tindak lanjut' }),
          n.h('div.row', null, [
            n.h('a.btn.sm', { href: info.canonical, target: '_blank', rel: 'noopener', text: '↗ buka di ' + info.label }),
            n.h('button.btn.sm', { text: '⧉ salin canonical', onclick: () => n.ui.copy(info.canonical, 'URL') }),
            info.kind === 'shortlink' && n.h('button.btn.sm', { text: '⇣ resolve shortlink', onclick: resolve })
          ]),
          n.h('pre.out', { text: 'file: ' + adv.file + '\nlegal: ' + adv.legal }),
          n.h('p.tiny.mute', { text: 'Kalau kamu pemilik kontennya, ambil lewat menu resmi platform (TikTok "Download video", YouTube Studio → unduh, Instagram "Download your information").' })
        ])
      ]));
      const prev = n.h('div.card.col');
      res.appendChild(prev);
      prev.appendChild(n.h('div.row.spread', null, [n.h('span.kicker', { text: 'Preview resmi (oEmbed)' }), n.h('div.row', null, [
        n.h('button.btn.sm', { text: 'muat preview', onclick: load }), n.h('button.btn.sm.gho', { text: 'meta tag', onclick: loadMeta })
      ])]));
      async function load() {
        prev.querySelectorAll('.pbody').forEach(x => x.remove());
        const o = await n.links.oembed(info);
        const box = n.h('div.col.pbody', { style: { marginTop: '10px' } });
        if (!o.ok) { box.appendChild(n.h('p.warn.small', { text: 'oEmbed: ' + o.why })); prev.appendChild(box); return; }
        box.append(
          o.thumbnail && n.h('img.thumb', { src: o.thumbnail, alt: 'thumbnail' }),
          n.h('h3', { text: o.title || '(tanpa judul)', style: { margin: '8px 0 2px' } }),
          n.h('div.row', null, [o.author && n.h('span.chip', { text: '👤 ' + o.author }), o.duration && n.h('span.chip', { text: '⏱ ' + o.duration + 's' }), o.provider && n.h('span.chip', { text: o.provider })]),
          embed.html && embed.kind !== 'oembed' ? n.h('div.embed.mt', { html: embed.html }) : n.h('div.embed.mt', { html: o.html || '' }),
          n.h('p.tiny.mute', { text: 'Konten di-embed dari server resmi ' + (o.provider || info.label) + ' — bukan hasil scrape file.' })
        );
        if (embed.needsScript) box.appendChild(n.h('p.tiny.mute', { text: 'Catatan: embed ' + info.label + ' butuh script resmi di halaman publik (widgets.js) — di halaman demo ini diblok sandbox, jadi yang tampil fallback blockquote.' }));
        prev.appendChild(box);
      }
      async function loadMeta() {
        prev.querySelectorAll('.pbody').forEach(x => x.remove());
        const m = await n.links.meta(info.canonical);
        const box = n.h('div.pbody');
        box.appendChild(n.h('pre.out', { text: m.ok ? JSON.stringify(m, null, 2) : 'meta: ' + m.why }));
        prev.appendChild(box);
      }
      async function resolve() {
        const r = await n.links.resolve(info.url);
        n.ui.toast(r.ok ? 'Redirect: ' + r.url : 'Resolve: ' + r.why, r.ok ? 'ok' : 'warn', 6000);
        if (r.ok) { url.value = r.url; go(); }
      }
    };
    url.addEventListener('keydown', e => e.key === 'Enter' && go());
    const paste = n.h('button.btn.sm', { text: '⎘ tempel', onclick: async () => { try { url.value = await navigator.clipboard.readText(); go(); } catch (e) { n.ui.toast('Clipboard diblokir — paste manual (Ctrl+V).', 'warn'); } } });
    return n.h('div.col', null, [
      n.h('div.row', null, [n.h('div', { style: { flex: 1 } }, url), n.h('button.btn.pri', { text: 'Analisis', onclick: go }), paste]),
      res,
      n.h('div.card', null, [
        n.h('div.kicker', { text: 'Coba cepat' }),
        n.h('div.row', null, [
          'https://vt.tiktok.com/ZS6Ab12/', 'https://www.instagram.com/reel/C1x2y3z/', 'https://youtu.be/dQw4w9WgXcQ',
          'https://x.com/jack/status/20', 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
          'https://www.reddit.com/r/DataHoarder/comments/1abcde/title/'
        ].map(s => n.h('button.chip', { text: s, onclick: () => { url.value = s; go(); } })))
      ])
    ]);
  }

  /* ============================ 2. video ============================ */
  function videoTab() {
    const file = n.h('input', { type: 'file', accept: 'video/*' });
    const vid = n.h('video', { class: 'cv', controls: true, style: { maxHeight: '46vh', background: '#000' } });
    const tl = n.h('div.timeline', null, n.h('div.sel', { style: { left: '0%', width: '12%' } }));
    const lab = n.h('div.row.spread.tiny.mono.dim');
    const prog = n.h('div');
    let meta = null, a = 0, b = 0;
    const setSel = () => {
      if (!meta) return;
      const s = a / meta.duration * 100, w = (b - a) / meta.duration * 100;
      tl.firstChild.style.left = s + '%'; tl.firstChild.style.width = Math.max(0, w) + '%';
      lab.innerHTML = ''; lab.append(n.h('span', { text: 'in ' + a.toFixed(2) + 's' }), n.h('span', { text: 'durasi ' + (b - a).toFixed(2) + 's' }), n.h('span', { text: 'out ' + b.toFixed(2) + 's' }));
    };
    file.onchange = async () => {
      const f = file.files[0]; if (!f) return;
      URL.revokeObjectURL(vid.src); vid.src = URL.createObjectURL(f);
      vid.onloadedmetadata = () => { meta = { duration: vid.duration, name: f.name, size: f.size, file: f }; a = 0; b = Math.min(5, vid.duration); setSel(); probe.textContent = JSON.stringify({ duration: +vid.duration.toFixed(2), w: vid.videoWidth, h: vid.videoHeight, size: n.bytes(f.size), type: f.type || '?' }, null, 1); };
      out.innerHTML = ''; out.appendChild(n.h('div.empty', { text: 'Setel in/out lalu tekan Proses.' }));
    };
    const probe = n.h('pre.out', { text: '// metadata muncul di sini' });
    const doTrim = async () => {
      if (!meta) return n.ui.toast('Pilih file video dulu.', 'warn');
      if (b - a < .2) return n.ui.toast('Rentang terlalu pendek.', 'warn');
      try {
        n.ui.progress(prog, .05, 'encode realtime… (sekitar ' + (b - a).toFixed(0) + ' detik)');
        const r = await n.tools.trimVideo(meta.file, a, b, (p, el) => n.ui.progress(prog, p * .95, 'encode ' + el.toFixed(1) + 's / ' + (b - a).toFixed(1) + 's'));
        n.ui.progress(prog, 1, 'selesai');
        const url = URL.createObjectURL(r.blob);
        out.innerHTML = '';
        out.append(
          n.h('div.row.spread', null, [n.h('b.small', { text: meta.name.replace(/\.\w+$/, '') + '_trim.webm' }), n.h('span.tiny.dim', { text: n.bytes(r.blob.size) + ' · ' + r.ms + 'ms' })]),
          n.h('video.cv.mt', { src: url, controls: true, style: { maxHeight: '34vh', background: '#000' } }),
          n.h('div.row.mt', null, [n.h('a.btn.sm.pri', { href: url, download: 'trim.webm', text: '⤓ unduh webm' }), n.h('span.tiny.mute', { text: r.note })])
        );
        n.store.log('video.trim', meta.name + ' ' + a.toFixed(1) + '-' + b.toFixed(1));
      } catch (e) { n.ui.progress(prog, 0, ''); n.ui.toast(e.message + (e.code === 'noenc' ? '' : ''), 'err', 7000); }
    };
    const slider = (get, set) => { const r = n.h('input', { type: 'range', min: 0, max: 1000, value: 0, class: 'range' }); r.oninput = () => { set(+r.value / 1000 * (meta ? meta.duration : 0)); setSel(); }; return { r, sync: (v) => { r.value = String(Math.round(v / (meta ? meta.duration : 1) * 1000)); } }; };
    const sa = slider(0, v => { a = Math.min(v, b - .1); if (meta) sa.sync(a); }), sb = slider(0, v => { b = Math.max(v, a + .1); });
    sb.r.oninput = () => { b = +sb.r.value / 1000 * (meta ? meta.duration : 0); setSel(); };
    sa.r.oninput = () => { a = +sa.r.value / 1000 * (meta ? meta.duration : 0); if (b <= a) b = Math.min(meta.duration, a + .1); setSel(); };
    const out = n.h('div.card');
    return n.h('div.split', null, [
      n.h('div.card.col', null, [
        n.h('div.kicker', { text: 'sumber' }), file,
        n.h('div.kicker.mt', { text: 'in point' }), sa.r,
        n.h('div.kicker', { text: 'out point' }), sb.r,
        tl, lab,
        n.h('div.row', null, [n.h('button.btn.sm', { text: '◀ prev 1s', onclick: () => { a = Math.max(0, a - 1); b = Math.max(a + .1, b - 1); sa.sync(a); setSel(); } }), n.h('button.btn.sm', { text: 'next 1s ▶', onclick: () => { if (meta) { a = Math.min(meta.duration - .1, a + 1); b = Math.min(meta.duration, a + (b - a)); sa.sync(a); setSel(); } } })]),
        prog,
        n.h('button.btn.pri', { text: '✂ Proses trim', onclick: doTrim }),
        n.h('p.tiny.mute', { text: 'Pipeline: <video> → captureStream → MediaRecorder(VP9/VP8, webm). Lossy & realtime. ffmpeg presisi = server /api/media/trim (contoh kode di server/nextjs-map.md).' })
      ]),
      n.h('div.col', null, [n.h('div.card.col', null, [n.h('div.kicker', { text: 'preview' }), vid, n.h('div.kicker.mt', { text: 'ffprobe-lite (browser)' }), probe]), out])
    ]);
  }

  /* ============================ 3. audio ============================ */
  function audioTab() {
    const file = n.h('input', { type: 'file', accept: 'audio/*,video/*' });
    const wave = n.h('canvas.wave');
    const info = n.h('pre.out', { text: '// pilih file audio dulu' });
    const fmt = n.h('select.inp', null, ['audio/wav', 'audio/webm;codecs=opus', 'audio/mp4a'].map(v => n.h('option', { value: v, text: v === 'audio/wav' ? 'WAV (PCM 16-bit)' : v === 'audio/webm;codecs=opus' ? 'Opus (WebM stream)' : 'AAC (mp4a.40.2 stream)' })));
    const br = n.h('select.inp', null, ['64000', '96000', '128000', '192000', '256000'].map((v, i) => n.h('option', { value: v, text: (+v / 1000) + ' kbps', selected: v === '128000' })));
    const gain = n.h('input', { type: 'range', min: .1, max: 3, step: .05, value: 1, class: 'range' });
    const fade = n.h('input', { type: 'range', min: 0, max: 5, step: .1, value: .6, class: 'range' });
    let buf = null;
    const g = n.h('span.tiny.dim', { text: '1.00×' });
    gain.oninput = () => g.textContent = (+gain.value).toFixed(2) + '×';
    file.onchange = async () => {
      const f = file.files[0]; if (!f) return;
      info.textContent = 'decode…';
      try {
        buf = await n.tools.decodeAudio(f);
        info.textContent = JSON.stringify({ name: f.name, size: n.bytes(f.size), sr: buf.sampleRate, ch: buf.numberOfChannels, dur: +buf.duration.toFixed(2) }, null, 1);
        draw();
      } catch (e) { info.textContent = 'ERROR: ' + e.message; }
    };
    function draw() {
      const dpr = Math.min(2, devicePixelRatio || 1);
      wave.width = wave.clientWidth * dpr; wave.height = 64 * dpr;
      const x = n.img.ctx(wave);
      x.clearRect(0, 0, wave.width, wave.height);
      if (!buf) return;
      const d = buf.getChannelData(0), step = Math.ceil(d.length / wave.width);
      x.strokeStyle = '#22d3ee'; x.lineWidth = dpr; x.beginPath();
      for (let i = 0, p = 0; i < wave.width; i++, p += step) {
        let mn = 1, mx = -1;
        for (let k = 0; k < step; k++) { const v = d[p + k] || 0; if (v < mn) mn = v; if (v > mx) mx = v; }
        x.moveTo(i * dpr, (0.5 + mn * .48) * wave.height); x.lineTo(i * dpr, (0.5 + mx * .48) * wave.height);
      }
      x.stroke();
    }
    const res = n.h('div.col');
    const run = async () => {
      if (!buf) return n.ui.toast('Belum ada file di-decode.', 'warn');
      const g0 = +gain.value, fd = +fade.value;
      const off = new OfflineAudioContext(buf.numberOfChannels, buf.length, buf.sampleRate);
      const src = off.createBufferSource(); src.buffer = buf;
      const gn = off.createGain(); gn.gain.value = g0;
      const fl = off.createGain();
      fl.gain.setValueAtTime(0, 0); fl.gain.linearRampToValueAtTime(1, fd);
      fl.gain.setValueAtTime(1, Math.max(fd, buf.duration - fd)); fl.gain.linearRampToValueAtTime(0, buf.duration);
      src.connect(gn); gn.connect(fl); fl.connect(off.destination); src.start();
      const outBuf = await off.startRendering();
      const mime = fmt.value;
      let blob, engine;
      try { const r = await n.tools.encodeBlob(new Blob([n.tools.wavEncode(outBuf)], { type: 'audio/wav' }), mime, +br.value); blob = r.blob; engine = r.engine; }
      catch (e) { if (e.code !== 'noenc') throw e; blob = n.tools.wavEncode(outBuf); engine = 'WAV (fallback, WebCodecs tidak ada)'; }
      const url = URL.createObjectURL(blob);
      res.innerHTML = '';
      res.append(
        n.h('div.row.spread', null, [n.h('b.small', { text: 'output · ' + engine }), n.h('span.tiny.dim', { text: n.bytes(blob.size) })]),
        n.h('audio', { src: url, controls: true, style: { width: '100%' } }),
        n.h('div.row', null, [n.h('a.btn.sm.pri', { href: url, download: 'converted.' + (mime.includes('wav') ? 'wav' : mime.includes('mp4a') ? 'm4a' : 'opus'), text: '⤓ unduh' }), n.h('span.tiny.mute', { text: mime.includes('wav') ? 'PCM mentah, siap diproses server' : 'raw stream — bungkus ke container MP4/OGG di server (/api/media/mux)' })])
      );
      n.store.log('audio.convert', file.files[0]?.name + ' → ' + mime);
    };
    /* recorder */
    const recBtn = n.h('button.btn.sm.pri', { text: '● rekam' });
    const recWave = n.h('canvas.wave');
    const recOut = n.h('div.col');
    let mr = null, chunks = [], recTimer = null;
    recBtn.onclick = async () => {
      if (mr) { mr.stop(); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true } });
        const ac = new AudioContext(); const an = ac.createAnalyser(); an.fftSize = 1024;
        ac.createMediaStreamSource(stream).connect(an);
        mr = new MediaRecorder(stream); chunks = [];
        mr.ondataavailable = e => chunks.push(e.data);
        mr.onstop = async () => {
          clearInterval(recTimer); stream.getTracks().forEach(t => t.stop()); ac.close();
          recBtn.textContent = '● rekam';
          const blob = new Blob(chunks, { type: mr.mimeType });
          const url = URL.createObjectURL(blob);
          recOut.innerHTML = '';
          recOut.append(n.h('audio', { src: url, controls: true, style: { width: '100%' } }),
            n.h('div.row', null, [n.h('a.btn.sm', { href: url, download: 'rekaman.webm', text: '⤓ webm' }),
              n.h('button.btn.sm', { text: '→ convert', onclick: async () => { try { const dt = new DataTransfer(); dt.items.add(new File([blob], 'rekaman.webm', { type: blob.type })); file.files = dt.files; file.dispatchEvent(new Event('change')); n.ui.toast('Rekaman dimuat ke panel convert →', 'ok'); } catch (e) { n.ui.toast('Browser menolak inject file ke input — unduh dulu lalu buka lagi lewat panel convert.', 'warn', 6000); } } }),
              n.h('button.btn.sm', { text: '→ transkripsi', onclick: async () => { try { recBtn.disabled = true; const t = await n.ai.stt(blob, 'id'); recOut.appendChild(n.h('pre.out', { text: t })); } catch (e) { n.ui.toast('Whisper: ' + e.message, 'err', 6000); } finally { recBtn.disabled = false; } } })]));
          mr = null;
        };
        mr.start(250); recBtn.textContent = '■ stop';
        const t0 = Date.now();
        recTimer = setInterval(() => {
          const d = new Uint8Array(an.frequencyBinCount); an.getByteTimeDomainData(d);
          const w = recWave.clientWidth * 2, h = 128; recWave.width = w; recWave.height = h;
          const x = n.img.ctx(recWave); x.clearRect(0, 0, w, h); x.strokeStyle = '#f472b6'; x.lineWidth = 2; x.beginPath();
          for (let i = 0; i < w; i++) { const v = d[Math.floor(i / w * d.length)] / 128 - 1; x.lineTo(i, h / 2 + v * h * .45); }
          x.stroke();
          recBtn.title = ((Date.now() - t0) / 1000).toFixed(1) + 's';
        }, 60);
      } catch (e) { n.ui.toast('Mic: ' + e.message, 'err'); }
    };
    return n.h('div.split', null, [
      n.h('div.card.col', null, [
        n.h('div.kicker', { text: 'file sumber' }), file, wave, info,
        n.h('div.kicker.mt', { text: 'output' }), fmt,
        n.h('div.row.spread', null, [n.h('span.small.dim', { text: 'bitrate' }), br]),
        n.h('div.row.spread', null, [n.h('span.small.dim', { text: 'gain' }), n.h('div', { style: { flex: 1 } }, [gain, g])]),
        n.h('div.row.spread', null, [n.h('span.small.dim', { text: 'fade in/out (s)' }), n.h('div', { style: { flex: 1 } }, fade)]),
        n.h('button.btn.pri', { text: '⚙ Convert + normalisasi', onclick: run })
      ]),
      n.h('div.col', null, [n.h('div.card.col', null, [n.h('div.kicker', { text: 'hasil' }), res]),
      n.h('div.card.col', null, [n.h('div.kicker', { text: 'rekam mic (MediaRecorder + analyser)' }), n.h('div.row', null, recBtn), recWave, recOut])])
    ]);
  }

  /* ============================ 4. TTS ============================ */
  function ttsTab() {
    const txt = n.h('textarea.inp', { rows: 6, placeholder: 'Tulis teks… (Groq Orpheus: english; fallback Web Speech: banyak bahasa termasuk id-ID)' });
    const voice = n.h('select.inp');
    const eng = n.h('select.inp', null, [n.h('option', { value: 'auto', text: 'auto (coba Groq → fallback Web Speech)' }), n.h('option', { value: 'web', text: 'Web Speech API saja (offline)' }), n.h('option', { value: 'groq', text: 'Groq Orpheus saja' })]);
    const rate = n.h('input', { type: 'range', min: .6, max: 1.6, step: .02, value: 1, class: 'range' });
    const pickVoices = () => {
      voice.innerHTML = '';
      const vs = speechSynthesis.getVoices();
      if (!vs.length) voice.appendChild(n.h('option', { text: '(browser tidak punya voice lokal)' }));
      vs.filter(v => /^id|^en/i.test(v.lang)).concat(vs.filter(v => !/^id|^en/i.test(v.lang))).forEach((v, i) => voice.appendChild(n.h('option', { value: v.name, text: v.name + ' · ' + v.lang })));
      if (!vs.length) ['tts-1-male-v3', 'tts-1-female-v3', 'tts-1-earcon-v3'].forEach(v => voice.appendChild(n.h('option', { value: v, text: v + ' (orpheus preset)' })));
    };
    pickVoices(); speechSynthesis.onvoiceschanged = pickVoices;
    const out = n.h('div.col');
    const go = async () => {
      const t = txt.value.trim(); if (!t) return n.ui.toast('Teks kosong.', 'warn');
      out.innerHTML = ''; out.appendChild(n.h('div.row', null, [n.h('span.spin'), n.h('span.small.dim', { text: 'menyiapkan…' })]));
      const e = eng.value;
      try {
        if (e !== 'web') {
          const r = await n.ai.tts(t, voice.value);
          if (r.speech && e === 'groq') throw new Error('Groq TTS tidak tersedia untuk key ini — pakai mode "auto" atau Web Speech.');
          if (!r.speech) { const url = URL.createObjectURL(r.blob); out.innerHTML = ''; out.append(n.h('audio', { src: url, controls: true, style: { width: '100%' } }), n.h('div.row.mt', null, [n.h('a.btn.sm', { href: url, download: 'suara.wav', text: '⤓ wav' }), n.h('span.tiny.dim', { text: 'engine: ' + r.engine })])); n.ui.quotaPill(); return; }
        }
        const u = new SpeechSynthesisUtterance(t);
        const v = speechSynthesis.getVoices().find(x => x.name === voice.value); if (v) u.voice = v;
        u.rate = +rate.value; u.lang = v?.lang || 'id-ID';
        speechSynthesis.cancel(); speechSynthesis.speak(u);
        out.innerHTML = '';
        out.append(n.h('div.ok.small', { text: '▶ diputar lewat Web Speech API (offline, gratis, tidak tercatat di kuota).' }),
          n.h('p.tiny.mute', { text: 'Web Speech tidak bisa diekspor ke file. Untuk MP3/WAV pakai worker server (ElevenLabs / Coqui / Piper — contoh di server/nextjs-map.md).' }));
      } catch (err) { out.innerHTML = ''; out.appendChild(n.h('pre.out', { text: (err.message || String(err)) + (err.hint ? '\n→ ' + err.hint : '') })); }
      n.store.log('tts', t.slice(0, 60));
    };
    return n.h('div.split', null, [
      n.h('div.card.col', null, [n.h('label.fl', { text: 'Teks' }), txt, n.h('div.row.spread', null, [n.h('div', { style: { flex: 1 } }, [n.h('label.fl', { text: 'Voice' }), voice]), n.h('div', { style: { width: '110px' } }, [n.h('label.fl', { text: 'rate' }), rate])]),
        n.h('label.fl', { text: 'Engine' }), eng, n.h('button.btn.pri', { text: '🔊 Putar / render', onclick: go }),
        n.h('p.tiny.mute', { text: 'Teks > 1800 char dipotong untuk Groq (batas demo). Batch panjang → /api/tts di server.' })]),
      n.h('div.card.col', null, [n.h('div.kicker', { text: 'output' }), out])
    ]);
  }

  /* ============================ 5. music maker (real WebAudio) ============================ */
  function musicTab() {
    const BPM = { value: 96 }, KEY = 'Amin', PROG = 'i-VI-III-VII';
    const CHORDS = {
      Amin: [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]],
      Dmin: [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]],
      Cmaj: [[48, 52, 55], [45, 48, 52], [50, 53, 57], [43, 47, 50]],
      Emaj: [[52, 56, 59], [47, 51, 54], [49, 53, 56], [44, 48, 51]],
      'F#min': [[54, 57, 61], [49, 53, 56], [57, 61, 64], [52, 56, 59]]
    };
    const ROWS = [
      { id: 'bass', label: 'BASS', oct: -12, type: 'triangle', dur: .34 },
      { id: 'pad', label: 'PAD', oct: 0, type: 'sine', dur: .9 },
      { id: 'pluck', label: 'PLUCK', oct: 12, type: 'square', dur: .12 },
      { id: 'kick', label: 'KICK', oct: 0, type: 'kick', dur: .18 },
      { id: 'hat', label: 'HAT', oct: 0, type: 'noise', dur: .05 }
    ];
    const STEPS = 32;
    const grid = ROWS.map(() => new Array(STEPS).fill(false));
    /* seed a pattern that already sounds like something */
    const seed = [[0, 8, 16, 24], [], [2, 6, 10, 14, 18, 22, 26, 30], [0, 8, 16, 24], [4, 12, 20, 28]];
    ROWS.forEach((r, y) => seed[y].forEach(x => grid[y][x] = true));
    const cells = [];
    const wrapGrid = n.h('div#seq');
    ROWS.forEach((r, y) => {
      wrapGrid.appendChild(n.h('div.lab', { text: r.label }));
      cells[y] = [];
      for (let x = 0; x < STEPS; x++) {
        const c = n.h('div.cell' + (grid[y][x] ? '.on' : ''), { onclick: () => { grid[y][x] = !grid[y][x]; c.classList.toggle('on', grid[y][x]); } });
        wrapGrid.appendChild(c); cells[y].push(c);
      }
    });
    const keySel = n.h('select.inp', null, Object.keys(CHORDS).map(k => n.h('option', { value: k, text: k })));
    const bpm = n.h('input', { type: 'range', min: 60, max: 170, value: 96, class: 'range' });
    const bpmOut = n.h('span.num', { text: '96 bpm' });
    bpm.oninput = () => { BPM.value = +bpm.value; bpmOut.textContent = bpm.value + ' bpm'; };
    const swing = n.h('input', { type: 'range', min: 0, max: .4, step: .02, value: .12, class: 'range' });
    const vol = n.h('input', { type: 'range', min: 0, max: 1, step: .02, value: .5, class: 'range' });

    let ac = null, master = null, delay = null, timer = null, step = 0, playing = false, nextT = 0;
    const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
    function voice(type, t, freq, dur, g) {
      if (type === 'kick') {
        const o = ac.createOscillator(), ga = ac.createGain();
        o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(48, t + .12);
        ga.gain.setValueAtTime(.9, t); ga.gain.exponentialRampToValueAtTime(.001, t + .2);
        o.connect(ga); ga.connect(master); o.start(t); o.stop(t + .22); return;
      }
      if (type === 'noise') {
        const b = ac.createBuffer(1, ac.sampleRate * .05, ac.sampleRate); const d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
        const s = ac.createBufferSource(); s.buffer = b; const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
        const ga = ac.createGain(); ga.gain.value = .3;
        s.connect(hp); hp.connect(ga); ga.connect(master); ga.connect(delay); s.start(t); return;
      }
      const o = ac.createOscillator(), ga = ac.createGain();
      o.type = type; o.frequency.value = freq;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = type === 'pad' ? 1400 : 4200;
      ga.gain.setValueAtTime(0, t); ga.gain.linearRampToValueAtTime(g, t + (type === 'pad' ? .18 : .008));
      ga.gain.exponentialRampToValueAtTime(.0008, t + dur);
      o.connect(f); f.connect(ga); ga.connect(master); ga.connect(delay);
      o.start(t); o.stop(t + dur + .05);
    }
    const stepDur = () => 60 / BPM.value / 4;
    function sched() {
      while (nextT < ac.currentTime + .12) {
        const s = step % STEPS;
        const bar = Math.floor(s / 8) % 4;
        const chord = (CHORDS[keySel.value] || CHORDS.Amin)[bar];
        ROWS.forEach((r, y) => {
          let on = grid[y][s];
          if (r.type === 'pad' && s % 8 === 0) on = true;
          if (r.id === 'bass' && s % 4 === 2) on = true;
          if (!on) return;
          const swingT = nextT + (s % 2 ? stepDur() * (+swing.value) * .5 : 0);
          const freq = hz(chord[(s / 2 | 0) % chord.length] + r.oct + (r.id === 'pluck' ? ((s * 3) % 12) - 6 : 0));
          voice(r.type, swingT, freq, r.dur * (stepDur() / .15), r.id === 'pad' ? .16 : .4);
        });
        cells.forEach((row, y) => row.forEach((c, x) => c.classList.toggle('play', x === s && playing)));
        nextT += stepDur(); step++;
      }
      if (playing) timer = setTimeout(sched, 25);
    }
    const playBtn = n.h('button.btn.pri', { text: '▶ play' });
    playBtn.onclick = () => {
      if (!ac) { ac = new AudioContext(); master = ac.createGain(); master.gain.value = +vol.value; const comp = ac.createDynamicsCompressor(); master.connect(comp); comp.connect(ac.destination); delay = ac.createDelay(1); delay.delayTime.value = stepDur() * 3; const fb = ac.createGain(); fb.gain.value = .3; delay.connect(fb); fb.connect(delay); const wet = ac.createGain(); wet.gain.value = .22; delay.connect(wet); wet.connect(ac.destination); }
      playing = !playing;
      if (playing) { nextT = ac.currentTime + .06; vol.oninput = () => master.gain.value = +vol.value; sched(); playBtn.textContent = '■ stop'; }
      else { clearTimeout(timer); playBtn.textContent = '▶ play'; cells.forEach(r => r.forEach(c => c.classList.remove('play'))); }
    };
    vol.oninput = () => { if (master) master.gain.value = +vol.value; };
    const render = async () => {
      playBtn.onclick(); /* stop live */
      n.ui.toast('Merender ' + (STEPS * stepDur()).toFixed(1) + 's ke WAV…', '', 2200);
      const sr = 44100, total = Math.ceil(STEPS * stepDur() * sr) + sr;
      const oc = new OfflineAudioContext(2, total, sr);
      const mg = oc.createGain(); mg.gain.value = +vol.value;
      const comp = oc.createDynamicsCompressor(); mg.connect(comp); comp.connect(oc.destination);
      const dl = oc.createDelay(1); dl.delayTime.value = stepDur() * 3;
      const fb = oc.createGain(); fb.gain.value = .3; dl.connect(fb); fb.connect(dl);
      const wet = oc.createGain(); wet.gain.value = .22; dl.connect(wet); wet.connect(mg);
      const hz2 = hz;
      const oldAC = ac, oldMaster = master, oldDelay = delay;
      ac = oc; master = mg; delay = dl;
      const v = voice;
      for (let s = 0; s < STEPS; s++) {
        const bar = Math.floor(s / 8) % 4; const chord = (CHORDS[keySel.value] || CHORDS.Amin)[bar]; const t = s * stepDur();
        ROWS.forEach((r, y) => {
          let on = grid[y][s];
          if (r.type === 'pad' && s % 8 === 0) on = true;
          if (r.id === 'bass' && s % 4 === 2) on = true;
          if (!on) return;
          const freq = hz2(chord[(s / 2 | 0) % chord.length] + r.oct);
          v(r.type, t + (s % 2 ? stepDur() * (+swing.value) * .5 : 0), freq, r.dur * (stepDur() / .15), r.id === 'pad' ? .16 : .4);
        });
      }
      const rendered = await oc.startRendering();
      ac = oldAC; master = oldMaster; delay = oldDelay;
      const blob = n.tools.wavEncode(rendered);
      const url = URL.createObjectURL(blob);
      renderOut.innerHTML = '';
      renderOut.append(n.h('div.row.spread', null, [n.h('b.small', { text: 'loop · ' + keySel.value + ' · ' + BPM.value + 'bpm' }), n.h('span.tiny.dim', { text: n.bytes(blob.size) + ' · 16-bit stereo' })]),
        n.h('audio', { src: url, controls: true, style: { width: '100%' } }),
        n.h('div.row', null, [n.h('a.btn.sm.pri', { href: url, download: 'neural-loop.wav', text: '⤓ unduh WAV' })]));
      n.store.log('music', keySel.value + ' ' + BPM.value);
    };
    const renderOut = n.h('div.col');
    const clear = n.h('button.btn.sm', { text: 'kosongkan', onclick: () => { grid.forEach(r => r.fill(false)); cells.forEach((row, y) => row.forEach((c, x) => c.classList.toggle('on', grid[y][x]))); } });
    const rnd = n.h('button.btn.sm', { text: '🎲 pola acak', onclick: () => { grid.forEach((r, y) => r.forEach((_, x) => { const p = ROWS[y].type === 'kick' ? .18 : ROWS[y].type === 'noise' ? .22 : .26; grid[y][x] = Math.random() < p; })); cells.forEach((row, y) => row.forEach((c, x) => c.classList.toggle('on', grid[y][x]))); } });
    return n.h('div.col', null, [
      n.h('div.card', null, [
        n.h('div.row.spread.mb', null, [
          n.h('div', null, [n.h('span.tag', { text: 'step sequencer 4×8' }), n.h('div.tiny.mute', { text: 'Suno API tidak punya akses publik/legit dari browser — engine di sini generator prosedural sungguhan (WebAudio), output WAV bisa dipakai.' })]),
          n.h('div.row', null, [playBtn, render])
        ]),
        wrapGrid,
        n.h('div.grid.g4.mt', null, [
          n.h('div', null, [n.h('label.fl', { text: 'Key / progression' }), keySel]),
          n.h('div', null, [n.h('label.fl', { text: 'Tempo' }), n.h('div.rowlab', null, [bpm, bpmOut])]),
          n.h('div', null, [n.h('label.fl', { text: 'Swing' }), swing]),
          n.h('div', null, [n.h('label.fl', { text: 'Volume' }), vol])
        ]),
        n.h('div.row.mt', null, [clear, rnd, n.h('span.tiny.mute', { text: 'klik kotak untuk toggle · chord berubah tiap 8 step mengikuti progression ' + PROG })])
      ]),
      n.h('div.card.col', null, [n.h('div.kicker', { text: 'render' }), renderOut, !renderOut.children.length && n.h('div.empty', { text: 'Tekan render untuk bikin WAV.' })])
    ]);
  }

  /* ============================ 6. AI video / slideshow ============================ */
  function vidgenTab() {
    const prompt = n.h('textarea.inp', { rows: 3, placeholder: 'mis: cinematic drone shot, sawah pagi berkabut, warna hangat, 5 detik' });
    const scenes = n.h('textarea.inp', { rows: 6, value: 'Neural AI Studio|2|22d3ee\n20+ tools|2|a855f7\njalur Next.js|2|f472b6' }, );
    scenes.placeholder = 'judul|detik|hexWarna — satu baris per scene';
    const fps = n.h('select.inp', null, [24, 30, 60].map(f => n.h('option', { value: f, text: f + ' fps', selected: f === 30 })));
    const sizeSel = n.h('select.inp', null, [['1280x720', '720p'], ['1920x1080', '1080p'], ['1080x1920', '9:16 reels'], ['1080x1080', 'square']].map(([v, l]) => n.h('option', { value: v, text: l })));
    const out = n.h('div.col');
    const render = async () => {
      const [w, h] = sizeSel.value.split('x').map(Number);
      const c = n.img.canvasOf(w, h); const x = n.img.ctx(c);
      const fpsN = +fps.value;
      const rows = scenes.value.split('\n').map(l => l.split('|')).filter(r => r[0]?.trim()).map(r => ({ t: r[0].trim(), d: Math.max(.5, +r[1] || 2), col: (r[2] || '22d3ee').trim() }));
      if (!rows.length) return n.ui.toast('Isi minimal 1 scene.', 'warn');
      const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m));
      if (!mime) return n.ui.toast('MediaRecorder video tidak didukung browser ini.', 'err');
      const stream = c.captureStream(fpsN);
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6e6 });
      const parts = []; rec.ondataavailable = e => e.data.size && parts.push(e.data);
      const done = new Promise(r => rec.onstop = r);
      rec.start(400);
      const totalFrames = rows.reduce((a, r) => a + r.d * fpsN, 0);
      let fi = 0;
      const drawFrame = () => {
        let acc = 0, cur = rows[0], local = 0;
        for (const r of rows) { if (fi < acc + r.d * fpsN) { cur = r; local = (fi - acc) / (r.d * fpsN); break; } acc += r.d * fpsN; }
        const g = x.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, '#05070d'); g.addColorStop(1, '#' + cur.col + '22');
        x.fillStyle = g; x.fillRect(0, 0, w, h);
        /* particles */
        for (let i = 0; i < 90; i++) {
          const px = ((i * 97.3 + fi * (1 + i % 3) * 1.7) % (w + 60)) - 30;
          const py = ((i * 173.7 + fi * (0.6 + (i % 5) * .18) * 1.3) % (h + 60)) - 30;
          x.fillStyle = 'rgba(' + (parseInt(cur.col.slice(0, 2), 16)) + ',' + (parseInt(cur.col.slice(2, 4), 16)) + ',' + (parseInt(cur.col.slice(4, 6), 16)) + ',' + (.12 + (i % 7) / 24) + ')';
          x.beginPath(); x.arc(px, py, 1 + (i % 3), 0, 7); x.fill();
        }
        /* link lines */
        x.strokeStyle = 'rgba(34,211,238,.10)'; x.lineWidth = 1;
        for (let i = 0; i < 24; i++) { x.beginPath(); x.moveTo((i * 231 + fi * 2) % w, 0); x.lineTo((i * 411) % w, h); x.stroke(); }
        const e = local < .18 ? local / .18 : local > .82 ? (1 - local) / .18 : 1;
        x.globalAlpha = e;
        x.fillStyle = '#fff'; x.font = '800 ' + Math.round(h * .085) + 'px system-ui'; x.textBaseline = 'middle';
        const tw = x.measureText(cur.t).width;
        x.fillText(cur.t, (w - tw) / 2 + (1 - e) * 40, h / 2);
        x.globalAlpha = e * .8; x.font = '600 ' + Math.round(h * .022) + 'px system-ui'; x.fillStyle = '#' + cur.col;
        x.fillText('NEURAL AI STUDIO · ' + new Date().getFullYear(), (w - x.measureText('NEURAL AI STUDIO').width * 6) / 2, h / 2 + h * .09);
        x.globalAlpha = 1;
        n.ui.progress(prog, fi / totalFrames, 'scene render ' + Math.round(fi / fpsN * 10) / 10 + 's / ' + (totalFrames / fpsN).toFixed(1) + 's');
      };
      await new Promise(res => {
        const tick = () => { drawFrame(); fi++; if (fi >= totalFrames) return res(); requestAnimationFrame(tick); };
        tick();
      });
      rec.stop(); await done;
      const blob = new Blob(parts, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      out.innerHTML = '';
      out.append(n.h('video', { src: url, controls: true, style: { width: '100%', borderRadius: '12px', border: '1px solid var(--line)' } }),
        n.h('div.row.mt', null, [n.h('a.btn.sm.pri', { href: url, download: 'slideshow.webm', text: '⤓ unduh webm' }), n.h('span.tiny.dim', { text: n.bytes(blob.size) + ' · ' + (totalFrames / fpsN).toFixed(1) + 's · ' + sizeSel.value })]),
        n.h('p.tiny.mute', { text: 'Ini render canvas→video sungguhan (bukan mockup). Model text-to-video generatif (Runway/Pika/Kling/Luma) tidak punya API publik yang bisa dipanggil browser; hubungkan via /api/video/gen (server/nextjs-map.md §video).' }));
      prog.innerHTML = '';
      n.store.log('video.gen', rows.length + ' scenes');
    };
    const prog = n.h('div');
    const ai = n.h('button.btn.sm', { text: '✨ tulis scene dari prompt', onclick: async () => {
      try {
        const t = await n.ai.ask('Buat storyboard 4 scene dari ide ini: "' + prompt.value + '". Balas HANYA 4 baris format judul|detik|hexWarna tanpa penjelasan.', { system: 'Kamu generator storyboard.' });
        scenes.value = t.split('\n').map(l => l.replace(/^[-\d.)\s]+/, '')).filter(l => /\|/.test(l)).join('\n') || scenes.value;
        n.ui.toast('Storyboard diisi lewat ' + state().model, 'ok');
      } catch (e) { n.ui.toast(e.message, 'err', 6000); }
    } });
    const state = () => ({ model: n.store.settings.get().model });
    return n.h('div.split', null, [
      n.h('div.card.col', null, [
        n.h('label.fl', { text: 'Prompt video generatif (Runway/Pika/Kling — butuh server)' }), prompt,
        n.h('p.tiny.mute', { text: 'Model generatif video TIDAK bisa dipanggil dari browser (tanpa CORS + butuh kunci rahasia). Tombol di bawah merender motion-graphics sungguhan pakai Canvas + MediaRecorder — hasil jadi, tanpa server.' }),
        n.h('label.fl.mt', { text: 'Scene (judul|detik|warna)' }), scenes,
        n.h('div.row', null, [n.h('div', { style: { flex: 1 } }, [n.h('label.fl', { text: 'ukuran' }), sizeSel]), n.h('div', { style: { flex: 1 } }, [n.h('label.fl', { text: 'fps' }), fps])]),
        prog,
        n.h('div.row', null, [n.h('button.btn.pri', { text: '⏵ render slideshow', onclick: render }), ai])
      ]),
      n.h('div.card.col', null, [n.h('div.kicker', { text: 'preview' }), out, n.h('div.empty', { text: 'belum ada render' })])
    ]);
  }

  /* ============================ 7. voice clone ============================ */
  function cloneTab() {
    return n.h('div.card', null, [
      n.h('h2', { text: 'Voice cloning: sengaja tidak diaktifkan sebagai tombol' }),
      n.h('div.col', { style: { gap: '10px' } }, [
        n.h('p.dim.small', { text: 'Meniru suara orang spesifik itu risiko nyata (penipuan, deepfake, pelanggaran hak suara). Build ini tidak menyambungkan ElevenLabs voice-clone langsung dari browser, dan tidak akan pura-pura sudah.' }),
        n.h('pre.out', { text: 'jalur yang benar (server-side, dengan consent tercatat):\n\nPOST /api/voice/clone   { sampleUrl, consentToken }\n  → simpan ke DB (user_id, consent_at, source)\n  → ElevenLabs /api/v1/voices/add  (instant clone, 1–5 menit sample)\n  → kembalikan voice_id; hanya user pemilik yang boleh memanggilnya\n  → setiap output diberi label "synthetic"\n\nYang wajib ada sebelum fitur ini ke-publish:\n  1. checkbox persetujuan + rekaman konfirmasi kalimat acak\n  2. rate limit + review manual untuk voice publik\n  3. watermark audio / metadata C2PA di file keluaran' }),
        n.h('div.row', null, [
          n.h('a.btn.sm', { href: 'account.html', text: 'kelola API key sendiri' }),
          n.h('span.tiny.mute', { text: 'Kalau kamu yang punya suara: tempel sample → simpan → pakai voice_id milikmu sendiri.' })
        ])
      ])
    ]);
  }
})();
