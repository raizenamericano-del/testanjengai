/* NEURAL AI STUDIO — persistence layer.
   localStorage today, Prisma tomorrow: every collection below maps 1:1 to a table in
   server/schema.prisma so the swap is a fetch() rewrite, not a data migration. */
(function (n) {
  const NS = 'nas1:';
  const mem = {};
  const hasLS = (() => { try { localStorage.setItem(NS + 't', '1'); localStorage.removeItem(NS + 't'); return true; } catch (e) { return false; } })();

  function read(k, d) {
    try { const raw = hasLS ? localStorage.getItem(NS + k) : mem[k]; return raw == null ? d : JSON.parse(raw); }
    catch (e) { return d; }
  }
  function write(k, v) {
    const raw = JSON.stringify(v);
    if (hasLS) { try { localStorage.setItem(NS + k, raw); } catch (e) { n.ui && n.ui.toast('Storage penuh — pakai session ini saja.', 'warn'); } }
    else mem[k] = raw;
    return v;
  }

  function coll(name) {
    return {
      key: name,
      all: () => read(name, []),
      save: (rows) => write(name, rows),
      put: (row) => { const r = read(name, []); const i = r.findIndex(x => x.id === row.id); if (i >= 0) r[i] = row; else r.unshift(row); write(name, r.slice(0, 500)); return row; },
      del: (id) => write(name, read(name, []).filter(x => x.id !== id)),
      get: (id) => read(name, []).find(x => x.id === id),
      clear: () => write(name, [])
    };
  }

  n.uid = (p) => (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  n.store = {
    persisted: hasLS,
    threads: coll('threads'),
    images: coll('images'),
    activity: coll('activity'),
    keys: coll('apikeys'),
    users: coll('users'),
    shorts: coll('shorts'),
    settings: {
      get: () => Object.assign({ theme: 'dark', motion: true, cursor: true, provider: 'groq', model: n.CFG.DEFAULT_CHAT, imageModel: n.CFG.DEFAULT_IMAGE, sys: 'Kamu adalah NEURAL AI STUDIO, asisten teknis yang jujur, ringkas, dan jago ngoding. jawab dalam bahasa user (default: Indonesia santai tapi padat).' }, read('settings', {})),
      set: (patch) => write('settings', Object.assign(read('settings', {}), patch))
    },
    session: {
      get: () => read('session', null),
      set: (u) => write('session', u),
      out: () => write('session', null)
    },
    usage: () => read('usage', { day: new Date().toISOString().slice(0, 10), n: 0 }),
    bumpUsage: (k) => {
      const u = n.store.usage(); const day = new Date().toISOString().slice(0, 10);
      if (u.day !== day) { u.day = day; u.n = 0; }
      u.n += 1; write('usage', u);
      const lim = n.CFG.QUOTA[(n.auth && n.auth.me() || { tier: 'free' }).tier] ?? 100;
      if (u.n > lim) { const e = new Error('Kuota harian ' + lim + ' request sudah habis. Upgrade ke Pro atau tunggu besok.'); e.code = 'quota'; throw e; }
      return { used: u.n, limit: lim };
    },
    log: (kind, detail, meta) => {
      const row = { id: n.uid('act'), at: Date.now(), kind, detail: String(detail || '').slice(0, 300), user: (n.auth.me() || {}).email || 'anon', bytes: 0 };
      Object.assign(row, meta || {});
      n.store.activity.put(row); return row;
    },
    exportAll: () => JSON.stringify({
      app: 'NEURAL AI STUDIO', at: new Date().toISOString(),
      threads: n.store.threads.all(), images: n.store.images.all().map(({ data, ...m }) => m),
      activity: n.store.activity.all(), apiKeys: n.store.keys.all().map(k => ({ ...k, key: k.key.slice(0, 12) + '…' }))
    }, null, 2),
    reset: () => ['threads', 'images', 'activity', 'keys', 'shorts', 'usage', 'settings'].forEach(k => {
      if (k === 'settings') return localStorage && localStorage.removeItem(NS + k);
      n.store[k].clear();
    })
  };

  /* blob/dataURL helpers */
  n.dataUrlToBlob = async (du) => (await fetch(du)).blob();
  n.blobToDataUrl = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
  n.buf8 = async (b) => { const ab = await b.arrayBuffer(); return new Uint8Array(ab, ab.byteOffset, ab.byteLength); };  // never trust Blob-backed buffers
  n.bytes = (b) => b > 1048576 ? (b / 1048576).toFixed(2) + ' MB' : b > 1024 ? (b / 1024).toFixed(1) + ' KB' : b + ' B';
  n.when = (t) => { const s = (Date.now() - t) / 1000; if (s < 60) return 'baru saja'; if (s < 3600) return Math.floor(s / 60) + ' mnt lalu'; if (s < 86400) return Math.floor(s / 3600) + ' jam lalu'; return Math.floor(s / 86400) + ' hr lalu'; };
})(window.NAS);
