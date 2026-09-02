/* NEURAL AI STUDIO — AI client.
   Two transports, same contract:
     • direct  : browser → Groq / Google (both send Access-Control-Allow-Origin, verified 2026-09-02)
     • proxy   : browser → NAS.CFG.BASE/api/* (keys live server-side; REQUIRED for NVIDIA + Tavily)
   Everything is written so `proxy` is just a base URL swap — flip NAS.CFG.BASE and nothing else changes. */
(function (n) {
  const C = () => n.CFG;
  const keyOf = (p) => n.keyFor(p === 'gemini' ? 'gemini' : p);   // secrets.local.js ▸ localStorage ▸ proxy

  /* ---------------- transport ---------------- */
  async function req(url, { method = 'POST', headers = {}, body, raw } = {}) {
    if (C().BASE && !url.startsWith('blob:')) {
      const via = C().BASE + '/api/proxy?url=' + encodeURIComponent(url);
      const r = await fetch(via, { method, headers: Object.assign({ 'content-type': 'application/json' }, headers), body: raw ? body : (body ? JSON.stringify(body) : undefined) });
      return r;
    }
    const r = await fetch(url, { method, headers, body: raw ? body : (body ? JSON.stringify(body) : undefined) });
    return r;
  }
  async function fail(r) {
    let txt = ''; try { txt = (await r.text()).slice(0, 500); } catch (e) { }
    let msg = txt;
    try { const j = JSON.parse(txt); msg = j.error?.message || j.error || j.message || txt; } catch (e) { }
    const e = new Error(msg || ('HTTP ' + r.status));
    e.status = r.status; e.body = txt;
    if (r.status === 429) e.hint = 'Rate limit / kuota gratis provider habis — tunggu ~60 detik atau ganti model.';
    if (r.status === 403 || r.status === 401) e.hint = 'Key ditolak. Isi key di account.html ▸ Settings, taruh secrets.local.js, atau aktifkan proxy server.';
    if (r instanceof TypeError) e.hint = 'Network/CORS error. Jalankan `node server/dev-proxy.mjs` lalu set NAS.CFG.BASE="/api".';
    return e;
  }

  /* ---------------- payload builders ---------------- */
  function openaiBody({ model, messages, stream, temperature, maxTokens, tools }) {
    return {
      model, messages, stream: !!stream,
      temperature: temperature ?? 0.7, max_completion_tokens: maxTokens ?? 2048,
      ...(tools ? { tools } : {})
    };
  }
  function googleBody({ model, messages, system, stream, temperature, maxTokens }) {
    const contents = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: (Array.isArray(m.content) ? m.content : [{ type: 'text', text: m.content }]).map(p =>
        p.type === 'image' ? { inline_data: { mime_type: p.mime || 'image/png', data: p.b64 } } : { text: p.text || '' })
    }));
    return {
      contents,
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      generationConfig: { temperature: temperature ?? 0.7, maxOutputTokens: maxTokens ?? 2048, ...(stream ? {} : {}) }
    };
  }
  function endpoint(p, kind) {
    const base = C().PROVIDERS[p].base;
    if (C().PROVIDERS[p].kind === 'google') {
      if (kind === 'chat') return null;                       // needs model in path
      return base;
    }
    return base;
  }

  /* ---------------- SSE ---------------- */
  async function* sse(r) {
    const dec = new TextDecoder(); let buf = '';
    const reader = r.body.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n');
      buf = parts.pop();
      for (const line of parts) {
        const m = line.match(/^data:\s*(.*)$/);
        if (!m) continue;
        if (m[1].trim() === '[DONE]') { reader.releaseLock?.(); return; }
        try { yield JSON.parse(m[1]); } catch (e) { }
      }
    }
  }

  /* ---------------- chat ---------------- */
  /**
   * opts: { provider, model, messages:[{role,content|[{type:'text'|'image',...}]}], system,
   *         stream, onDelta, temperature, maxTokens }
   */
  n.ai = {};
  n.ai.chat = async function (opts) {
    n.store.bumpUsage('chat');
    const provider = opts.provider || n.store.settings.get().provider;
    const model = opts.model || n.store.settings.get().model;
    const messages = opts.messages.slice();
    const system = opts.system ?? n.store.settings.get().sys;
    let out = '';

    if (provider === 'gemini' || C().PROVIDERS[provider].kind === 'google') {
      const body = googleBody({ model, messages, system, stream: opts.stream, temperature: opts.temperature, maxTokens: opts.maxTokens });
      const url = C().PROVIDERS.gemini.base + '/models/' + model + ':generateContent' + (opts.stream ? ':streamGenerateContent?alt=sse' : '');
      const r = await req(url, { headers: { 'content-type': 'application/json', 'x-goog-api-key': keyOf('gemini') }, body });
      if (!r.ok) throw await fail(r);
      if (opts.stream) {
        for await (const j of sse(r)) {
          const t = j?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
          if (t) { out += t; opts.onDelta && opts.onDelta(t, out); }
        }
      } else {
        const j = await r.json();
        out = j?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
        opts.onDelta && opts.onDelta(out, out);
        if (!out) throw Object.assign(new Error('Model ' + model + ' tidak mengembalikan teks (finishReason=' + (j?.candidates?.[0]?.finishReason || j?.promptFeedback?.blockReason || 'unknown') + ').'), { status: 502 });
      }
      return { text: out, provider, model };
    }

    /* OpenAI-shape (Groq, NVIDIA NIM if ever re-enabled) */
    const msgs = (system ? [{ role: 'system', content: system }] : []).concat(
      messages.map(m => ({
        role: m.role,
        content: Array.isArray(m.content)
          ? m.content.map(p => p.type === 'image' ? { type: 'image_url', image_url: { url: 'data:' + (p.mime || 'image/png') + ';base64,' + p.b64 } } : { type: 'text', text: p.text })
          : m.content
      })));
    const body = openaiBody({ model, messages: msgs, stream: opts.stream, temperature: opts.temperature, maxTokens: opts.maxTokens });
    const url = C().PROVIDERS[provider].base + '/chat/completions';
    const r = await req(url, { headers: { 'content-type': 'application/json', authorization: 'Bearer ' + keyOf(provider) }, body });
    if (!r.ok) throw await fail(r);
    if (opts.stream) {
      for await (const j of sse(r)) {
        const d = j?.choices?.[0]?.delta || {};
        const t = d.content || (j?.choices?.[0]?.text) || '';
        if (t) { out += t; opts.onDelta && opts.onDelta(t, out); }
      }
    } else {
      const j = await r.json();
      out = j?.choices?.[0]?.message?.content ?? '';
      if (!out && j?.choices?.[0]?.message?.reasoning) out = '';
      opts.onDelta && opts.onDelta(out, out);
    }
    return { text: out, provider, model };
  };

  /* one-shot helper for tools ("ask the model to transform this text") */
  n.ai.ask = async (prompt, opts = {}) => (await n.ai.chat(Object.assign({ messages: [{ role: 'user', content: prompt }], system: opts.system ?? null }, opts))).text;

  /* ---------------- live model discovery ---------------- */
  n.ai.groqModels = async () => {
    const r = await req(C().PROVIDERS.groq.base + '/models', { method: 'GET', headers: { authorization: 'Bearer ' + keyOf('groq') } });
    if (!r.ok) throw await fail(r);
    return (await r.json()).data.map(m => ({ id: m.id, label: m.name || m.id, ctx: m.context_window, input: m.input_modalities })).sort((a, b) => a.id.localeCompare(b.id));
  };

  /* ---------------- speech to text (Groq Whisper — confirmed available) ---------------- */
  n.ai.stt = async function (blob, lang) {
    n.store.bumpUsage('stt');
    const fd = new FormData();
    fd.append('file', blob, 'voice.webm');
    fd.append('model', 'whisper-large-v3-turbo');
    fd.append('temperature', '0');
    if (lang) fd.append('language', lang);
    const url = C().PROVIDERS.groq.base + '/audio/transcriptions';
    const r = C().BASE
      ? await fetch(C().BASE + '/api/asr', { method: 'POST', body: fd })
      : await fetch(url, { headers: { authorization: 'Bearer ' + keyOf('groq') }, body: fd });
    if (!r.ok) throw await fail(r);
    return (await r.json()).text;
  };

  /* ---------------- text to speech (Groq Orpheus, WebAudio fallback) ---------------- */
  n.ai.tts = async function (text, voice, provider) {
    n.store.bumpUsage('tts');
    try {
      const fd = new FormData();
      fd.append('model', 'canopylabs/orpheus-v1-english');
      fd.append('input', text.slice(0, 1800));
      fd.append('response_format', 'wav');
      if (voice) fd.append('voice', voice);
      const r = await fetch(C().PROVIDERS.groq.base + '/audio/speech', { method: 'POST', headers: { authorization: 'Bearer ' + keyOf('groq') }, body: fd });
      if (r.ok) { const b = await r.blob(); return { blob: b, engine: 'Groq Orpheus' }; }
      throw await fail(r);
    } catch (e) {
      if (e.status === 402 || e.status === 429 || e.status === 404) {
        /* no TTS entitlement — use the browser's own engine (works offline, real audio) */
        return { speech: true, engine: 'Web Speech API (fallback)', text, voice };
      }
      throw e;
    }
  };

  /* ---------------- web search (Tavily must go through the proxy — no CORS) ---------------- */
  n.ai.search = async function (q) {
    if (!C().BASE) throw Object.assign(new Error('Web search butuh server proxy (Tavily tidak mengirim CORS header). Jalankan server/dev-proxy.mjs + isi TAVILY_API_KEY.'), { code: 'proxy' });
    const r = await fetch(C().BASE + '/api/search?q=' + encodeURIComponent(q));
    if (!r.ok) throw await fail(r);
    return r.json();
  };

  /* ---------------- code interpreter (Pyodide in browser — real sandbox) ---------------- */
  let pyodidePromise = null;
  n.ai.sandbox = {
    ready: false,
    async boot(onStatus) {
      if (window.pyodide) { this.ready = true; return window.pyodide; }
      onStatus && onStatus('mengunduh pyodide (~10 MB, sekali saja)…');
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js';
        s.onload = res; s.onerror = () => rej(new Error('Gagal memuat Pyodide (offline atau CDN diblokir).'));
        document.head.appendChild(s);
      });
      onStatus && onStatus('init runtime…');
      window.pyodide = await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/' });
      this.ready = true;
      onStatus && onStatus('siap');
      return window.pyodide;
    },
    async runPython(code, onStatus) {
      const py = await this.boot(onStatus);
      py.setStdout({ batched: () => { } });
      let out = '';
      py.setStdout({ batched: (s) => { out += s + '\n'; } });
      py.setStderr({ batched: (s) => { out += '[stderr] ' + s + '\n'; } });
      const t0 = performance.now();
      try {
        const res = await py.runPythonAsync(code);
        return { ok: true, output: out.trim(), result: res === undefined ? null : String(res), ms: Math.round(performance.now() - t0) };
      } catch (e) {
        return { ok: false, output: out.trim(), error: String(e.message || e).split('\n').slice(-4).join('\n'), ms: Math.round(performance.now() - t0) };
      }
    },
    async runJS(code) {
      const t0 = performance.now(); const logs = [];
      const fakeConsole = new Proxy({}, { get: (_, k) => (...a) => logs.push(a.map(x => typeof x === 'object' ? JSON.stringify(x, null, 1) : String(x)).join(' ')) });
      try {
        const fn = new Function('console', '"use strict";\n' + code);
        const r = fn(fakeConsole);
        return { ok: true, output: logs.join('\n'), result: r === undefined ? null : (typeof r === 'object' ? JSON.stringify(r, null, 1) : String(r)), ms: Math.round(performance.now() - t0) };
      } catch (e) {
        return { ok: false, output: logs.join('\n'), error: String(e.message || e), ms: Math.round(performance.now() - t0) };
      }
    }
  };

  /* ---------------- file extraction (PDF / DOCX / XLSX / CSV / TXT) ---------------- */
  /* ZIP reading without a library: scan the EOCD + local headers, inflate with DecompressionStream. */
  async function unzip(file) {
    const buf = await n.buf8(file);   // a Blob's ArrayBuffer can be a slice of a bigger pool
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);   // honour the view offset
    /* EOCD='PK\x05\x06' · central='PK\x01\x02' · local='PK\x03\x04' — typed as constants after
       a hand-typed 0x06054b4f (…4b4f = 'PK\x05O') silently broke every zip read. */
    const EOCD = 0x06054b50, CEN = 0x02014b50, LOC = 0x04034b50;
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) if (dv.getUint32(i, true) === EOCD) { eocd = i; break; }
    if (eocd < 0) throw new Error('Bukan arsip ZIP/Office yang valid.');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const files = {};
    const td = new TextDecoder();
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== CEN) break;
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const lh = dv.getUint32(p + 42, true);
      const name = td.decode(buf.subarray(p + 46, p + 46 + nlen));
      if (method === 0 && csize === 0 && /\.(xml|bin|txt)$/.test(name)) { /* empty file is fine */ }
      const lnl = dv.getUint16(lh + 26, true), lel = dv.getUint16(lh + 28, true);
      const start = lh + 30 + lnl + lel;
      const raw = buf.subarray(start, start + csize);
      let data = null;
      try {
        if (method === 0) data = raw;
        else if (method === 8) {
          const ds = new DecompressionStream('deflate-raw');
          const stream = new Blob([raw]).stream().pipeThrough(ds);
          data = new Uint8Array(await new Response(stream).arrayBuffer());
        }
      } catch (e) { }
      if (data) files[name] = data;
      p += 46 + nlen + elen + clen;
    }
    return files;
  }
  n.ai.unzip = unzip;

  function xmlText(s) {
    return s.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, m => m.replace(/<[^>]+>/g, ''))
      .replace(/<[^>]+>/g, ' ').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }
  n.ai.extract = async function (file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (['txt', 'md', 'js', 'ts', 'json', 'csv', 'log', 'html', 'css', 'py', 'xml', 'yml', 'yaml'].includes(ext)) {
      const t = await file.text();
      if (ext === 'csv') return { kind: 'csv', text: t, table: parseCsv(t) };
      return { kind: 'text', text: t };
    }
    if (ext === 'docx' || ext === 'xlsx' || ext === 'pptx') {
      const zip = await unzip(file);
      const td = new TextDecoder();
      if (ext === 'docx') {
        const x = zip['word/document.xml'];
        if (!x) throw new Error('word/document.xml tidak ketemu.');
        return { kind: 'docx', text: xmlText(td.decode(x)).replace(/(&amp;)/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') };
      }
      if (ext === 'pptx') {
        const slides = Object.keys(zip).filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k)).sort((a, b) => +a.match(/\d+/) - +b.match(/\d+/));
        return { kind: 'pptx', text: slides.map((s, i) => '## Slide ' + (i + 1) + '\n' + td.decode(zip[s]).replace(/<a:t>/g, '\n').replace(/<[^>]+>/g, '')).join('\n\n') };
      }
      const shared = zip['xl/sharedStrings.xml'] ? td.decode(zip['xl/sharedStrings.xml']).replace(/<\/t>/g, '\n').replace(/<[^>]+>/g, '') : '';
      const sheetNames = Object.keys(zip).filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k));
      let out = '';
      if (sheetNames.length) {
        const t = td.decode(zip[sheetNames[0]]);
        const rows = [...t.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map(mm =>
          [...mm[1].matchAll(/<c[^>]*?(?:t="(\w+)")?[^>]*>(?:<v>([\s\S]*?)<\/v>)?/g)]
            .map(c => c[1] === 's' ? (shared.split('\n')[+(c[2] || 0)] || '').trim() : (c[2] || ''))
        );
        out = rows.slice(0, 500).map(r => '| ' + r.join(' | ') + ' |').join('\n');
      }
      return { kind: 'xlsx', text: out || shared || '(sheet kosong)', table: null };
    }
    if (ext === 'pdf') {
      const t = await file.text().catch(() => '');
      const streams = [...t.matchAll(/stream\r?\n([\s\S]*?)endstream/g)].map(m => m[1]);
      let text = '';
      for (const s of streams) {
        try {
          const bin = s.slice(0, s.length);
          if (!/[^\x00-\x08\x09\x0a\x0c\x0d\x20-\xff]/.test(bin)) {
            const chunks = [...bin.matchAll(/\(((?:\\.|[^\\()])*)\)\s*Tj|\[((?:[^\]])*)\]\s*TJ/g)];
            for (const c of chunks) text += (c[1] || c[2] || '').replace(/\\[()\\]/g, m => m[1]).replace(/\)\s*-?\d+(?:\.\d+)?\s*\(/g, ' ').replace(/[()]/g, '') + ' ';
          }
        } catch (e) { }
      }
      if (text.trim().length > 40) return { kind: 'pdf', text: text.replace(/\s{2,}/g, ' ').trim(), note: 'ekstraksi dasar (tanpa pdf.js)' };
      throw new Error('PDF terenkripsi/kompresi — pakai route server /api/extract (pdfjs + Tika) untuk hasil lengkap.');
    }
    if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
      const b64 = (await n.blobToDataUrl(file)).split(',')[1];
      return { kind: 'image', b64, mime: file.type, name: file.name, text: '[gambar dilampirkan: ' + file.name + ']' };
    }
    return { kind: 'binary', text: '[binary ' + file.size + ' bytes — tidak bisa dibaca sebagai teks]' };
  };

  function parseCsv(t) {
    const lines = t.replace(/\r/g, '').split('\n').filter(l => l.length);
    const cell = (l) => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
    return lines.slice(0, 200).map(cell);
  }
  n.ai.csvTable = parseCsv;

  /* ---------------- attachments → prompt ---------------- */
  n.ai.attachmentsToPrompt = async function (files) {
    const parts = [], images = [];
    for (const f of files) {
      const x = await n.ai.extract(f);
      if (x.kind === 'image') { images.push({ type: 'image', b64: x.b64, mime: x.mime }); parts.push('FILE ' + f.name + ' (gambar)'); continue; }
      const body = (x.text || '').slice(0, 14000);
      parts.push('=== FILE: ' + f.name + ' (' + n.bytes(f.size) + (x.kind ? ', ' + x.kind : '') + ') ===\n' + body);
    }
    return { text: parts.join('\n\n'), images };
  };
})(window.NAS);
