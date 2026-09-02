/* NEURAL AI STUDIO — chat client (threading, streaming, files, /image, voice, sandbox) */
(function () {
  const n = window.NAS;
  /* hoisted: side-panel quick prompts reference these before composer() runs */
  let input, sendBtn, micBtn, attachBox;
  const PROMPTS = [
    ['Review kode', 'Review kode berikut, tunjukkan bug & perbaikan dalam diff:\n\n```js\n\n```'],
    ['Refactor + test', 'Refactor fungsi ini agar pure + tulis unit test (Vitest):\n\n'],
    ['Jelaskan singkat', 'Jelaskan konsep ini dalam 5 kalimat + 1 analogi, lalu 1 contoh kode:\n\n'],
    ['Prompt image', '/image potret produk tech, studio lighting, latar gradient neon, 1:1'],
    ['Ringkas file', 'Ringkas attachment jadi: inti, angka penting, risiko, next step.'],
    ['SQL', 'Tulis PostgreSQL untuk: top 10 user berdasarkan jumlah request 7 hari terakhir, termasuk yang belum aktivasi email.'],
    ['Regex', 'Buat regex untuk UUID v4 + jelaskan tiap part, lalu 5 test case positif/negatif.'],
    ['Bhs. Inggris → ID', 'Terjemahkan ke Indonesia natural (bukan kaku), jaga istilah teknis:\n\n']
  ];;   // hoisted: used by the side panel built below
  const P = n.CFG.PROVIDERS;
  let state = {
    provider: n.store.settings.get().provider,
    model: n.store.settings.get().model,
    thread: null, atts: [], busy: false, ctrl: null, useSearch: false, useSandbox: false,
    ctx: 8000 /* rough token budget of history sent back */
  };

  /* ---------- shell ---------- */
  const root = document.body;
  root.innerHTML = '';
  root.appendChild(n.ui.nav('chat.html'));
  const main = n.h('div.main');
  const chat = n.h('div.chat');
  const side = n.h('aside.side');
  const stage = n.h('div', { style: { display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 } });
  const msgs = n.h('div.msgs', { id: 'msgs' });
  const panel = n.h('aside.panel');
  chat.append(side, stage, panel);
  stage.append(msgs, buildComposer());
  main.appendChild(chat);
  root.appendChild(main);
  document.documentElement.dataset.theme = n.store.settings.get().theme;
  if (n.store.settings.get().cursor && matchMedia('(pointer:fine)').matches) n.ui.cursorTrail();

  /* ---------- sidebar ---------- */
  const threadList = n.h('div.threadbox.list');
  side.append(
    n.h('button.btn.pri', { text: '+ Chat baru', onclick: newThread }),
    n.h('div.row', { style: { gap: '4px' } }, [
      n.h('button.btn.sm.gho', { text: '⤓ MD', title: 'Export thread ini sebagai Markdown', onclick: () => exportThread('md') }),
      n.h('button.btn.sm.gho', { text: '⤓ JSON', onclick: () => exportThread('json') }),
      n.h('button.btn.sm.gho', { text: '⎙ PDF', onclick: () => exportThread('pdf') })
    ]),
    n.h('div.kicker', { text: 'Threads' }), threadList,
    n.h('div', { style: { marginTop: 'auto' } }, [
      n.h('div.kicker', { text: 'Model' }),
      modelPicker(),
      n.h('button.btn.sm.gho.mt', { html: '↻ refresh daftar Groq', style: { width: '100%' }, onclick: refreshModels })
    ])
  );

  function modelPicker() {
    const sel = n.h('select.inp');
    const fill = () => {
      sel.innerHTML = '';
      const prov = state.provider;
      (P[prov]?.chat || []).forEach(m => sel.appendChild(n.h('option', { value: prov + '::' + m.id, text: m.label + ' · ' + m.id, selected: (prov + '::' + state.model) === (prov + '::' + m.id) })));
      if (!P[prov].chat.length) sel.appendChild(n.h('option', { text: '(provider ini tidak punya model aktif — lihat README)' }));
    };
    const tabs = n.h('div.seg', null, Object.keys(P).map(p => n.h('button' + (p === state.provider ? '.on' : ''), {
      text: P[p].name.split(' ')[0], onclick: (e) => {
        state.provider = p; const first = P[p].chat[0]; if (first) state.model = first.id;
        [...tabs.children].forEach(b => b.classList.toggle('on', b.textContent.startsWith(P[p].name.split(' ')[0])));
        fill(); n.store.settings.set({ provider: p, model: state.model });
      }
    })));
    sel.onchange = () => { const [, ...rest] = sel.value.split('::'); state.model = rest.join('::'); n.store.settings.set({ model: state.model }); };
    fill();
    return n.h('div.col', { style: { gap: '6px' } }, [tabs, sel]);
  }
  async function refreshModels() {
    try {
      const list = await n.ai.groqModels();
      const chat = list.filter(m => !/prompt-guard|whisper|orpheus|tts/i.test(m.id));
      P.groq.chat = chat.map(m => ({ id: m.id, label: m.label, note: (m.ctx ? (m.ctx / 1024 | 0) + 'k ctx' : '') }));
      n.ui.toast('Groq: ' + chat.length + ' model terdeteksi (live).', 'ok');
      location.reload();
    } catch (e) { n.ui.toast('Gagal ambil daftar model: ' + e.message, 'err', 7000); }
  }

  /* ---------- right panel ---------- */
  const sysTa = n.h('textarea.inp', { rows: 4, value: n.store.settings.get().sys });
  sysTa.onchange = () => n.store.settings.set({ sys: sysTa.value });
  panel.append(
    n.h('div.row.spread', null, [n.h('span.kicker', { text: 'Parameter' }), n.h('button.btn.sm.gho', { text: '✕', onclick: () => panel.classList.remove('open') })]),
    n.h('div', null, [n.h('label.fl', { text: 'System prompt' }), sysTa]),
    n.h('div', null, [
      n.h('label.fl', { text: 'Budget konteks (pesan) ' }),
      (function () {
        const r = n.h('input', { type: 'range', min: '2', max: '40', value: '12', class: 'range' });
        const o = n.h('option', { text: '' }); void o;
        r.oninput = () => { state.ctxMsgs = +r.value; };
        return n.h('div.row', null, [r, n.h('span.mono.tiny.dim', { text: '12 pesan terakhir' })]);
      })()
    ]),
    n.h('label.chk', null, [n.h('input', { type: 'checkbox', onchange: (e) => state.useSearch = e.target.checked }), 'Cari web dulu sebelum jawab (butuh proxy + TAVILY_API_KEY)']),
    n.h('label.chk', null, [n.h('input', { type: 'checkbox', onchange: (e) => state.useSandbox = e.target.checked }), 'Sandbox: jalankan kode dari jawaban (Pyodide)']),
    n.h('details.sum', null, [
      n.h('summary', { text: 'Sandbox Python / JS' }),
      (function () {
        const ta = n.h('textarea.inp', { rows: 6, placeholder: 'print(sum(range(101)))', value: 'import math\nprint([math.factorial(i) for i in range(1,8)])' });
        const out = n.h('pre.out', { text: '// output', style: { maxHeight: '180px' } });
        return [ta, n.h('div.row.mt', null, [
          n.h('button.btn.sm.pri', { text: '▶ Run Python', onclick: async (e) => { e.target.textContent = '…booting'; try { const r = await n.ai.sandbox.runPython(ta.value, s => e.target.textContent = s); out.textContent = [r.output, r.error ? 'ERROR: ' + r.error : '', 'result: ' + r.result].filter(Boolean).join('\n') || '(kosong)'; } catch (err) { out.textContent = 'ERROR ' + err.message; } e.target.textContent = '▶ Run Python'; } }),
          n.h('button.btn.sm', { text: 'Run JS', onclick: async () => { const r = await n.ai.sandbox.runJS(ta.value); out.textContent = [r.output, r.error ? 'ERROR: ' + r.error : '', 'result: ' + r.result].filter(Boolean).join('\n') || '(kosong)'; } })
        ]), out];
      })()
    ]),
    n.h('details.sum', null, [
      n.h('summary', { text: 'Prompt cepat' }),
      n.h('div.col', { style: { gap: '4px' } }, PROMPTS.map(([t, p]) => n.h('button.item', { onclick: () => { input.value = p; input.focus(); }, html: '<span class="nm">' + n.esc(t) + '</span>' })))
    ]),
    n.h('div', { style: { marginTop: 'auto' } }, [n.h('button.btn.sm.gho', { text: '⚙ panel', onclick: () => panel.classList.toggle('open'), style: { width: '100%' } })])
  );

  /* ---------- composer ---------- */
  function buildComposer() {
    input = n.h('textarea.inp', { placeholder: 'Tanya apa aja — /image <prompt> buat gambar, @mention file… (Enter kirim, Shift+Enter baris baru)', rows: '1' });
    const fileIn = n.h('input', { type: 'file', multiple: true, accept: '.pdf,.docx,.xlsx,.pptx,.csv,.txt,.md,.json,.png,.jpg,.jpeg,.webp,.gif', class: 'hide' });
    fileIn.onchange = () => addFiles(fileIn.files);
    attachBox = n.h('div.row', { style: { gap: '5px' } });
    sendBtn = n.h('button.btn.pri', { text: 'Kirim ▸', onclick: () => send() });
    micBtn = n.h('button.btn', { text: '🎙', title: 'Rekam suara → Whisper (Groq)' });
    micBtn.onclick = record;
    const upBtn = n.h('button.btn', { text: '📎', title: 'Lampirkan file', onclick: () => fileIn.click() });
    const drop = n.h('div.drop', { style: { padding: '8px', margin: '0 12px' }, onclick: () => fileIn.click() }, [
      n.h('div.row', { style: { gap: '8px', justifyContent: 'space-between' } }, [
        n.h('span.small.dim', { html: 'Taruh file di sini — <b>PDF, DOCX, XLSX, PPTX, CSV, TXT, gambar</b> (dibaca lokal, tanpa upload ke pihak ketiga)' }),
        n.h('span.chip', { text: 'client-side' })
      ]),
      attachBox
    ]);
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('hot'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('hot'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('hot'); addFiles(e.dataTransfer.files); });
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    input.addEventListener('input', () => {
      input.style.height = 'auto'; input.style.height = Math.min(180, input.scrollHeight) + 'px';
      const w = (input.value.match(/\S+/g) || []).length;
      meta.textContent = w ? '~' + Math.round(w * 1.33) + ' token' : '';
    });
    const meta = n.h('span.tiny.mute', { text: '' });
    return n.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, [
      drop,
      n.h('div.composer', null, [upBtn, micBtn, n.h('div', { style: { flex: 1 } }, input),
        n.h('button.btn', { text: '⚙', title: 'Parameter', onclick: () => panel.classList.toggle('open') }), sendBtn]),
      n.h('div.row.spread', { style: { padding: '0 12px 8px' } }, [meta, n.h('span.tiny.mute', { text: 'model: ' + state.model })])
    ]);
  }

  async function addFiles(list) {
    for (const f of list) {
      const chip = n.h('span.att', null, [n.h('b', { text: f.name }), n.h('span.tiny.mute', { text: n.bytes(f.size) }), n.h('button.btn.sm.gho', { text: '✕' })]);
      attachBox.appendChild(chip);
      chip.lastChild.onclick = () => { state.atts = state.atts.filter(a => a.file !== f); chip.remove(); };
      try {
        const x = await n.ai.extract(f);
        state.atts.push({ file: f, extracted: x });
        chip.title = (x.kind || 'file') + ' · ' + ((x.text || '').length) + ' char diekstrak';
        chip.insertBefore(n.h('span.tiny.ok', { text: '✓ ' + (x.kind || '') }), chip.lastChild);
      } catch (e) {
        chip.insertBefore(n.h('span.tiny.bad', { text: '✕ ' + e.message.slice(0, 40) }), chip.lastChild);
      }
    }
  }

  /* ---------- voice ---------- */
  async function record() {
    if (!navigator.mediaDevices?.getUserMedia) return n.ui.toast('Browser tidak mengizinkan rekaman (butuh HTTPS).', 'err');
    if (state.rec) { stopRec(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mr = new MediaRecorder(stream); const chunks = [];
      mr.ondataavailable = e => chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        micBtn.classList.remove('rec'); micBtn.textContent = '🎙';
        const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
        if (blob.size < 2000) return n.ui.toast('Rekaman terlalu pendek.', 'warn');
        n.ui.toast('Transkripsi ' + n.bytes(blob.size) + ' …', '', 1400);
        try {
          const txt = await n.ai.stt(blob, 'id');
          input.value = (input.value + ' ' + txt).trim(); input.dispatchEvent(new Event('input'));
          n.ui.toast('Voice → teks ✓', 'ok');
        } catch (e) { n.ui.toast('Whisper gagal: ' + e.message + (e.hint ? '\n' + e.hint : ''), 'err', 7000); }
      };
      state.rec = mr; mr.start();
      micBtn.classList.add('rec'); micBtn.textContent = '■ stop';
    } catch (e) { n.ui.toast('Mic ditolak: ' + e.message, 'err'); }
  }
  function stopRec() { if (state.rec?.state !== 'inactive') state.rec.stop(); state.rec = null; }

  /* ---------- threads ---------- */
  function newThread() {
    const t = { id: n.uid('th'), title: 'Chat baru', createdAt: Date.now(), updatedAt: Date.now(), messages: [], model: state.model, provider: state.provider };
    n.store.threads.put(t); state.thread = t; renderThreads(); renderMsgs();
  }
  function renderThreads() {
    threadList.innerHTML = '';
    const all = n.store.threads.all().sort((a, b) => b.updatedAt - a.updatedAt);
    if (!all.length) threadList.appendChild(n.h('div.empty', { text: 'Belum ada thread.' }));
    all.forEach(t => {
      const el = n.h('div.item' + (state.thread?.id === t.id ? '.on' : ''), null, [
        n.h('span.nm', { text: t.title }), n.h('span.d', { text: n.when(t.updatedAt) }),
        n.h('button.btn.sm.gho', { text: '✕', title: 'Hapus' })
      ]);
      el.onclick = (e) => { if (e.target.tagName === 'BUTTON') return; state.thread = t; renderThreads(); renderMsgs(); };
      el.lastChild.onclick = (e) => { e.stopPropagation(); n.ui.confirm('Hapus thread "' + t.title + '"?', () => { n.store.threads.del(t.id); if (state.thread?.id === t.id) { state.thread = null; newThread(); } renderThreads(); renderMsgs(); }); };
      threadList.appendChild(el);
    });
  }
  function renderMsgs() {
    msgs.innerHTML = '';
    const list = state.thread?.messages || [];
    if (!list.length) {
      msgs.appendChild(n.h('div', { style: { margin: 'auto', maxWidth: '620px', textAlign: 'center', padding: '20px' } }, [
        n.h('h2', { html: 'Halo. <span class="grad-txt">Mau bikin apa?</span>' }),
        n.h('p.dim.small', { text: 'Model aktif: ' + state.model + ' · ' + P[state.provider].name + '. Coba salah satu:' }),
        n.h('div.grid.g2.mt', null, PROMPTS.slice(0, 4).map(([t, p]) => n.h('button.card', { style: { textAlign: 'left', cursor: 'pointer' }, onclick: () => { input.value = p; input.focus(); }, html: '<b class="small">' + n.esc(t) + '</b><div class="tiny dim" style="margin-top:4px">' + n.esc(p.slice(0, 60).replace(/\n/g, ' ')) + '…</div>' })))
      ]));
      return;
    }
    list.forEach((m, i) => msgs.appendChild(msgEl(m, i)));
    msgs.scrollTop = msgs.scrollHeight;
  }
  function msgEl(m, idx) {
    const isUser = m.role === 'user';
    const body = n.h('div.bubble.md');
    if (m.html) body.innerHTML = m.html; else body.innerHTML = n.md(m.content || '');
    if (m.images) m.images.forEach(src => body.appendChild(n.h('img.img-in', { src, alt: 'generated' })));
    const el = n.h('div.msg' + (isUser ? '.u' : ''), null, [
      n.h('div.av', { text: isUser ? ((n.auth.me() || {}).name || 'you').slice(0, 2).toUpperCase() : 'AI' }),
      n.h('div.bd', null, [
        n.h('div.who', { html: (isUser ? 'kamu' : (m.model || state.model)) + (m.meta ? ' · <span class="mono">' + m.meta + '</span>' : '') }),
        body,
        !isUser && n.h('div.row.mt', { style: { gap: '4px' } }, [
          n.h('button.btn.sm.gho', { text: '↻ regen', onclick: () => regen(idx) }),
          n.h('button.btn.sm.gho', { text: '⧉ copy', onclick: () => n.ui.copy(m.content, 'Jawaban') }),
          n.h('button.btn.sm.gho', { text: '🔊', title: 'Bacakan', onclick: () => speak(m.content) })
        ])
      ])
    ]);
    return el;
  }
  async function speak(text) {
    const clean = String(text).replace(/```[\s\S]*?```/g, ' (kode dilewati ) ').replace(/[#*_`>|-]/g, ' ').slice(0, 1400);
    try {
      const r = await n.ai.tts(clean);
      if (r.speech) {
        const u = new SpeechSynthesisUtterance(clean); u.lang = 'id-ID'; u.rate = 1.03;
        speechSynthesis.cancel(); speechSynthesis.speak(u);
        n.ui.toast('Dibacakan pakai Web Speech API (fallback).', '', 2600);
      } else {
        const url = URL.createObjectURL(r.blob); const a = new Audio(url); a.play();
        n.ui.toast('TTS via ' + r.engine, 'ok');
      }
    } catch (e) { n.ui.toast('TTS gagal: ' + e.message, 'err'); }
  }
  async function regen(idx) {
    const t = state.thread;
    t.messages = t.messages.slice(0, idx);
    n.store.threads.put({ ...t, updatedAt: Date.now() });
    renderMsgs(); await run();
  }

  /* ---------- send ---------- */
  async function send() {
    const raw = input.value.trim();
    if (!raw || state.busy) return;
    if (!state.thread) newThread();
    const t = state.thread;
    const isImg = /^\/image\s+/i.test(raw);
    t.messages.push({ role: 'user', content: raw, at: Date.now(), files: state.atts.map(a => a.file.name) });
    if (t.title === 'Chat baru') t.title = raw.replace(/^\/\w+\s*/, '').slice(0, 44) || 'Chat baru';
    n.store.threads.put({ ...t, updatedAt: Date.now() });
    input.value = ''; input.style.height = 'auto'; input.dispatchEvent(new Event('input'));
    const done = state.atts.length; state.atts = []; attachBox.innerHTML = '';
    renderThreads(); renderMsgs();
    await run(isImg ? { imageOnly: raw.replace(/^\/image\s*/i, ''), } : {});
    if (done) n.ui.toast(done + ' file siap dipakai lagi (masih di thread).', '', 2200);
  }

  async function run(extra = {}) {
    state.busy = true; sendBtn.disabled = true; sendBtn.textContent = 'Generating…';
    const t = state.thread;
    const placeholder = { role: 'assistant', content: '', model: state.model, at: Date.now() };
    t.messages.push(placeholder);
    let bubble = msgs.lastChild?.querySelector('.bubble');
    if (!bubble) { renderMsgs(); bubble = msgs.lastChild.querySelector('.bubble'); }
    const spinner = n.h('span.typing', null, [n.h('i'), n.h('i'), n.h('i')]);
    bubble.innerHTML = ''; bubble.appendChild(spinner);
    msgs.scrollTop = msgs.scrollHeight;

    try {
      if (extra.imageOnly) {
        const r = await n.img.generate({ prompt: extra.imageOnly, model: n.store.settings.get().imageModel, aspect: '1:1' });
        t.messages[t.messages.length - 1] = { ...placeholder, content: 'Gambar dibuat: ' + extra.imageOnly, images: [r.dataUrl], meta: r.model };
        n.store.images.put({ id: n.uid('img'), at: Date.now(), prompt: extra.imageOnly, dataUrl: r.dataUrl, model: r.model, source: 'chat' });
        n.store.log('image', extra.imageOnly, { via: 'chat' });
        renderMsgs(); return;
      }
      const hist = t.messages.slice(0, -1).filter(m => m.content && m.role !== 'system');
      const ctxLimit = state.ctxMsgs || 12;
      const slice = hist.slice(-ctxLimit).map(m => ({ role: m.role, content: m.content }));
      let sys = n.store.settings.get().sys;
      const files = hist.flatMap(m => m.filesText || []);
      if (files.length) sys += '\n\nKonteks lampiran dari user:\n' + files.join('\n').slice(0, 24000);
      if (state.useSearch) {
        try { const s = await n.ai.search(hist.at(-1)?.content || ''); sys += '\n\nHasil web terkini:\n' + JSON.stringify(s).slice(0, 4000); }
        catch (e) { n.ui.toast('Web search: ' + e.message, 'warn', 6000); }
      }
      state.ctrl = new AbortController();
      const res = await n.ai.chat({
        provider: state.provider, model: state.model, messages: slice, system: sys, stream: true,
        onDelta: (_, acc) => { bubble.innerHTML = n.md(acc); msgs.scrollTop = msgs.scrollHeight; t.messages[t.messages.length - 1].content = acc; }
      });
      const final = res.text || t.messages[t.messages.length - 1].content;
      t.messages[t.messages.length - 1] = { ...placeholder, content: final, meta: (final.length / 4 | 0) + 't' };
      if (state.useSandbox) {
        const code = (final.match(/```python\n([\s\S]*?)```/) || final.match(/```py\n([\s\S]*?)```/) || [])[1];
        if (code) {
          const r = await n.ai.sandbox.runPython(code);
          t.messages[t.messages.length - 1].content = final + '\n\n### Hasil eksekusi sandbox\n```\n' + [r.output, r.error && 'ERROR: ' + r.error, 'result: ' + r.result].filter(Boolean).join('\n') + '\n```';
        }
      }
      n.store.log('chat', (slice.at(-1)?.content || '').slice(0, 90), { model: state.model, chars: final.length });
      msgs.scrollTop = msgs.scrollHeight;
    } catch (e) {
      const body = '```\n' + (e.message || String(e)) + (e.hint ? '\n→ ' + e.hint : '') + (e.body ? '\n' + String(e.body).slice(0, 300) : '') + '\n```';
      t.messages[t.messages.length - 1] = { ...placeholder, content: body, meta: 'error ' + (e.status || e.code || '') };
      if (e.code === 'quota') n.ui.toast(e.message, 'err', 6000);
      msgs.innerHTML = ''; t.messages.pop();
      renderMsgs();
      msgs.appendChild(n.h('div.card.bad', { style: { margin: '0 18px' }, html: n.md('⚠ ' + (e.message || '') + (e.hint ? '\n\n' + e.hint : '')) }));
    } finally {
      n.store.threads.put({ ...t, updatedAt: Date.now(), model: state.model });
      state.busy = false; state.ctrl = null;
      sendBtn.disabled = false; sendBtn.textContent = 'Kirim ▸';
      renderThreads(); if (state.busy === false) renderMsgs();
      n.ui.quotaPill();
    }
  }

  /* ---------- export ---------- */
  function exportThread(kind) {
    const t = state.thread; if (!t) return n.ui.toast('Tidak ada thread aktif.', 'warn');
    const mdOut = '# ' + t.title + '\n\n' + t.messages.map(m => '**' + m.role + '**' + (m.model ? ' _(via ' + m.model + ')_' : '') + '\n\n' + (m.content || '') + (m.images ? '\n!' + '[' + 'generated' + ']' + '(' + m.images[0].slice(0, 24) + '…[data-url])' : '')).join('\n\n---\n\n');
    if (kind === 'md') n.ui.download(new Blob([mdOut], { type: 'text/markdown' }), (t.title.replace(/\W+/g, '-').slice(0, 40) || 'thread') + '.md');
    if (kind === 'json') n.ui.download(new Blob([JSON.stringify({ ...t, messages: t.messages.map(({ images, ...m }) => m) }, null, 2)], { type: 'application/json' }), 'thread.json');
    if (kind === 'pdf') {
      try { n.tools.pdf.fromHtml(t.title, n.md(mdOut)); }
      catch (e) { n.ui.toast('PDF: ' + e.message, 'warn', 5000); }
    }
    n.store.log('export', kind + ' ' + t.title);
  }

  newThread(); renderThreads(); renderMsgs();
  n.store.log('page', 'chat');
})();
