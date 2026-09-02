/* NEURAL AI STUDIO — admin panel (client-demo).
   Admin "unlimited" = quota check dilewati + view semua user. Di produksi ini TIDAK boleh
   jalan di client: role dicek server-side (middleware Next) dan panel di-gate RBAC. */
(function () {
  const n = window.NAS;
  const root = document.body; root.innerHTML = '';
  document.documentElement.dataset.theme = n.store.settings.get().theme;
  root.appendChild(n.ui.nav('admin.html'));
  const wrap = n.h('div.wrap', { style: { padding: '18px 20px 40px', display: 'flex', flexDirection: 'column', gap: '14px' } });
  root.appendChild(wrap);
  if (n.store.settings.get().cursor && matchMedia('(pointer:fine)').matches) n.ui.cursorTrail();

  n.auth.init().then(() => {
    if (!n.auth.isAdmin()) return gate();
    render();
  });

  function gate() {
    const email = n.h('input.inp', { placeholder: 'email admin', type: 'email' });
    const pw = n.h('input.inp', { type: 'password', placeholder: 'password', autocomplete: 'current-password' });
    const err = n.h('p.small.bad', { text: '' });
    const go = async () => {
      err.textContent = '';
      try {
        const me = await n.auth.login(email.value, pw.value);
        if (me.role !== 'admin') throw new Error('Akun ' + me.email + ' bukan admin. (role di-user lain tidak bisa dinaikkan dari halaman ini — itu justru yang harusnya cuma server yang boleh.)');
        wrap.innerHTML = ''; render();
      } catch (e) { err.textContent = '✕ ' + e.message; }
    };
    email.addEventListener('keydown', e => e.key === 'Enter' && go());
    pw.addEventListener('keydown', e => e.key === 'Enter' && go());
    wrap.appendChild(n.h('div.card.gate.col', null, [
      n.h('span.tag', { text: '⛨ admin only' }),
      n.h('h2', { text: 'Masuk sebagai admin', style: { margin: '2px 0 6px' } }),
      n.h('label.fl', { text: 'email' }), email,
      n.h('label.fl', { text: 'password' }), pw,
      err,
      n.h('div.row', null, [n.h('button.btn.pri', { text: 'masuk', onclick: go }),
        n.h('button.btn.sm.gho', { text: 'isi otomatis', onclick: () => { const u = (n.CFG.DEMO_USERS || []).find(x => x.role === 'admin'); if (!u) return n.ui.toast('Tidak ada akun demo di device ini — bikin secrets.local.js atau daftar dulu.', 'warn', 6000); email.value = u.email; pw.value = u.pw; go(); } })]),
      n.h('p.tiny.mute', { text: 'Di build demo ini credential admin = akun yang di-seed di localStorage (lihat ADMIN.md). Setelah di-deploy, hapus seed-nya dan pakai NextAuth + tabel Role.' })
    ]));
  }

  function render() {
    const me = n.auth.me();
    wrap.innerHTML = '';
    wrap.appendChild(n.h('div.row.spread', null, [
      n.h('div', null, [n.h('span.tag', { text: '⛨ Control Room' }), n.h('h1', { text: 'Admin panel', style: { margin: '2px 0 0' } })]),
      n.h('div.row', null, [n.h('span.badge.adm', { text: 'role: admin · quota bypass' }), n.h('button.btn.sm', { text: 'keluar', onclick: () => n.auth.logout() })])
    ]));
    wrap.appendChild(n.h('div.card', { style: { borderColor: 'color-mix(in srgb,var(--mg) 40%,transparent)' } },
      n.h('p.small.dim', { html: '<b>Unlimited</b> di sini artinya: <code>quota()</code> mengembalikan <code>∞</code> untuk role admin dan log/usage semua user terlihat. Ini <b>bukan</b> fitur keamanan — di Next.js versi RBAC-nya di <code>app/api/*</code> middleware + kolom <code>role</code> di Postgres. Semua aksi panel ini mutasi lokal.' })));

    const host = n.h('div');
    wrap.appendChild(host);
    n.ui.tabbed(host, [
      { id: 'ov', label: '📊 Overview', render: overview },
      { id: 'users', label: '👥 Users', render: usersTab },
      { id: 'content', label: '💬 Threads & images', render: contentTab },
      { id: 'keys', label: '⚷ API keys', render: keysTab },
      { id: 'log', label: '⧗ Event log', render: logTab },
      { id: 'sys', label: '⚙ System', render: sysTab }
    ]);
  }

  /* ---------------- overview ---------------- */
  function overview() {
    const users = n.store.users.all(), th = n.store.threads.all(), im = n.store.images.all(), ac = n.store.activity.all();
    const perDay = {};
    ac.forEach(a => { const d = new Date(a.at).toISOString().slice(5, 10); perDay[d] = (perDay[d] || 0) + 1; });
    const days = Object.keys(perDay).sort().slice(-21);
    const max = Math.max(1, ...days.map(d => perDay[d]));
    const kinds = {};
    ac.forEach(a => kinds[a.kind] = (kinds[a.kind] || 0) + 1);
    const models = {};
    th.forEach(t => (t.messages || []).forEach(m => { if (m.meta) models[t.model || '?'] = (models[t.model || '?'] || 0) + 1; }));
    const stat = (l, v, s) => n.h('div.stat', null, [n.h('i'), n.h('span', { text: l }), n.h('b', { text: String(v) }), s && n.h('span.tiny.dim', { text: s })]);
    const topUser = Object.entries(users.reduce((a, u) => (a[u.email] = ac.filter(x => x.user === u.email).length, a), {})).sort((a, b) => b[1] - a[1]).slice(0, 8);
    return n.h('div.col', { style: { gap: '14px' } }, [
      n.h('div.grid.g4', null, [stat('user', users.length, 'terdaftar di device ini'), stat('thread', th.length, th.reduce((a, t) => a + (t.messages || []).length, 0) + ' pesan'),
        stat('image', im.length, im.reduce((a, x) => a + (x.dataUrl?.length || 0), 0) / 1e6 | 0 ? (im.reduce((a, x) => a + (x.dataUrl?.length || 0), 0) / 1.4e6 | 0) + ' MB base64' : '0 MB'),
        stat('event', ac.length, Object.keys(kinds).length + ' jenis')]),
      n.h('div.card', null, [n.h('div.row.spread', null, [n.h('div.kicker', { text: 'aktivitas / hari (21 hari)' }), n.h('span.tiny.dim', { text: days.length ? max + ' puncak/hari' : 'belum ada data' })]),
        n.h('div.spark', null, days.length ? days.map(d => n.h('i', { style: { height: Math.max(2, perDay[d] / max * 56) + 'px' }, title: d + ': ' + perDay[d] })) : [n.h('div.empty', { text: 'belum ada aktivitas' })])]),
      n.h('div.grid.g2', null, [
        n.h('div.card', null, [n.h('div.kicker', { text: 'pemakaian per fitur' }),
          n.h('div.col', null, Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => n.h('div.row', null, [
            n.h('span.mono.tiny', { text: k, style: { width: '112px' } }),
            n.h('i', { style: { height: '9px', background: 'var(--grad)', borderRadius: '5px', width: (v / Math.max(1, Math.max(...Object.values(kinds))) * 100) + '%', minWidth: '2px', display: 'block' } }),
            n.h('span.tiny.dim', { text: v })])))]),
        n.h('div.card', null, [n.h('div.kicker', { text: 'user teraktif' }),
          n.h('div.col', null, topUser.map(([e, c]) => n.h('div.row.spread', null, [n.h('span.small', { text: e }), n.h('span.badge.free', { text: c + ' event' })])))])
      ]),
      n.h('div.card', null, [n.h('div.kicker', { text: 'health provider (ping live)' }), n.h('div.row.mt', { id: 'adminHealth' })])
    ]);
  }

  /* ---------------- users ---------------- */
  function usersTab() {
    const box = n.h('div.scroll');
    const q = n.h('input.inp', { placeholder: 'cari email/nama…' });
    const draw = () => {
      const me = n.auth.me();
      const rows = n.store.users.all().filter(u => !q.value || (u.email + u.name).toLowerCase().includes(q.value.toLowerCase()));
      const t = n.h('table.t');
      t.appendChild(n.h('tr', null, ['user', 'role', 'tier', 'quota hari ini', 'keys', 'terakhir', 'aksi'].map(x => n.h('th', { text: x }))));
      rows.forEach(u => {
        const acts = n.store.activity.all().filter(a => a.user === u.email);
        const tr = n.h('tr' + (u.role === 'admin' ? '.role-admin' : ''), null, [
          n.h('td', null, [n.h('b.small', { text: u.name }), n.h('div.tiny.dim', { text: u.email + (u.bio ? ' · ' + u.bio.slice(0, 40) : '') })]),
          n.h('td', { html: '<span class="badge ' + (u.role === 'admin' ? 'adm' : 'free') + '">' + u.role + '</span>' }),
          n.h('td', { html: '<span class="badge ' + u.tier + '">' + u.tier + '</span>' }),
          n.h('td.mono.tiny', { text: (n.CFG.QUOTA[u.tier] === Infinity ? '∞' : n.CFG.QUOTA[u.tier]) }),
          n.h('td.mono.tiny', { text: String((u.apiKeys || []).length) }),
          n.h('td.tiny.dim', { text: u.lastLogin ? n.when(u.lastLogin) : 'belum pernah' }),
          n.h('td', null, [
            n.h('button.btn.sm', { text: u.role === 'admin' ? 'turunkan' : 'jadikan admin', onclick: () => n.ui.confirm(u.email + ': ' + (u.role === 'admin' ? 'turunkan dari admin' : 'naikkan ke admin'), () => { n.store.users.put({ ...u, role: u.role === 'admin' ? 'user' : 'admin' }); draw(); }) }),
            n.h('button.btn.sm', { text: u.banned ? 'unban' : 'ban', onclick: () => { n.store.users.put({ ...u, banned: !u.banned }); draw(); } }),
            n.h('select.inp', { style: { width: '108px', display: 'inline-block' }, onchange: (e) => { n.store.users.put({ ...u, tier: e.target.value }); draw(); } }, ['free', 'pro', 'enterprise'].map(x => n.h('option', { value: x, text: x, selected: u.tier === x }))),
            u.email !== me.email ? n.h('button.btn.sm.dgr', { text: 'hapus', onclick: () => n.ui.confirm('Hapus akun ' + u.email + ' + reset datanya?', () => { n.store.users.del(u.id); draw(); }, true) }) : null
          ].filter(Boolean))
        ]);
        t.appendChild(tr);
      });
      box.innerHTML = ''; box.appendChild(t);
      cnt.textContent = rows.length + ' user · ' + rows.filter(u => u.role === 'admin').length + ' admin · ' + rows.filter(u => u.banned).length + ' banned';
    };
    const cnt = n.h('span.tiny.dim', null);
    q.oninput = draw;
    const seedDemo = () => {
      ['raka', 'nadia', 'dimas', 'sinta', 'bagas'].forEach((nm, i) => {
        const email = nm + '@neuralstudio.dev';
        if (n.store.users.all().some(u => u.email === email)) return;
        n.store.users.put({ id: n.uid('usr'), email, name: nm[0].toUpperCase() + nm.slice(1), role: 'user', tier: ['free', 'pro', 'free', 'enterprise', 'pro'][i], pwHash: 'seed-demo-no-pw', createdAt: Date.now() - i * 86400000, lastLogin: Date.now() - i * 3600000, apiKeys: [], banned: i === 4 });
      });
      for (let i = 0; i < 60; i++) {
        const u = n.store.users.all()[i % 5];
        n.store.activity.put({ id: n.uid('act'), at: Date.now() - Math.random() * 20 * 86400000, kind: ['chat', 'image', 'download', 'tool.qr', 'billing'][i % 5], detail: 'seed demo event ' + i, user: u.email, bytes: (Math.random() * 9000) | 0 });
      }
      draw(); n.ui.toast('60 event + 5 user demo dibuat buat lihat-lihat panel.', 'ok');
    };
    draw();
    return n.h('div.col', { style: { gap: '10px' } }, [
      n.h('div.row', null, [n.h('div', { style: { flex: 1 } }, q), n.h('button.btn.sm', { text: '+ user manual', onclick: () => {
        const e2 = n.h('input.inp', { placeholder: 'email' }), p2 = n.h('input.inp', { placeholder: 'password awal', type: 'text', value: 'ChangeMe#2026' });
        n.ui.modal({ title: 'tambah user', body: n.h('div.col', null, [e2, p2]), footer: [n.h('button.btn.sm.pri', { text: 'buat', onclick: async () => { await n.auth.signup({ email: e2.value, pw: p2.value }); draw(); document.querySelector('.modal').remove(); n.ui.toast('User dibuat.', 'ok'); } })] });
      } }), n.h('button.btn.sm', { text: '⚡ seed data demo', onclick: seedDemo }), n.h('button.btn.sm', { text: '⤓ csv', onclick: () => n.ui.download(new Blob([n.tools.toCsv(n.store.users.all().map(({ pwHash, ...u }) => u))], { type: 'text/csv' }), 'users.csv') })]),
      cnt, box]);
  }

  /* ---------------- content moderation ---------------- */
  function contentTab() {
    const box = n.h('div.col', { style: { gap: '10px' } });
    const draw = () => {
      box.innerHTML = '';
      const th = n.store.threads.all().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 40);
      if (!th.length) box.appendChild(n.h('div.empty', { text: 'belum ada thread' }));
      th.forEach(t => {
        const txt = (t.messages || []).map(m => m.content).join(' ');
        const flags = [];
        const bad = /(sambungan listrik|nomor rekening orang|ktp|password =|api[_-]?key\s*[:=]\s*\S{16,}|credit\s*card)/i;
        if (bad.test(txt)) flags.push('keyword sensitif');
        if (txt.length > 24000) flags.push('panjang ' + Math.round(txt.length / 1024) + 'k char');
        box.appendChild(n.h('div.card', null, [
          n.h('div.row.spread', null, [
            n.h('div', null, [n.h('b.small', { text: t.title }), n.h('div.tiny.dim', { text: (t.messages || []).length + ' pesan · ' + (t.model || '?') + ' · ' + new Date(t.updatedAt).toLocaleString('id-ID') })]),
            n.h('div.row', null, [flags.map(f => n.h('span.badge.adm', { text: f })),
              n.h('button.btn.sm.gho', { text: 'buka', onclick: () => { sessionStorage.setItem('nas_open_thread', t.id); location.href = 'chat.html'; } }),
              n.h('button.btn.sm.gho', { text: '⤓ json', onclick: () => n.ui.download(new Blob([JSON.stringify(t, null, 2)], { type: 'application/json' }), t.title.replace(/\W+/g, '-') + '.json') }),
              n.h('button.btn.sm.dgr', { text: 'hapus', onclick: () => n.ui.confirm('Hapus thread "' + t.title + '"?', () => { n.store.threads.del(t.id); draw(); }, true) })])
          ]),
          n.h('pre.out', { style: { maxHeight: '120px' }, text: txt.slice(0, 500) || '(kosong)' })
        ]));
      });
      const im = n.store.images.all().slice(0, 24);
      if (im.length) {
        box.appendChild(n.h('div.card', null, [n.h('div.kicker', { text: 'galeri user (moderasi)' }), n.h('div.gal', null, im.map(r => n.h('figure', null, [
          n.h('img', { src: r.dataUrl, alt: r.prompt.slice(0, 40) }),
          n.h('figcaption', null, [n.h('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, text: (r.prompt || '').slice(0, 26) }),
            n.h('button.btn.sm.gho', { text: '✕', onclick: () => { n.store.images.del(r.id); draw(); } })])
        ])))]));
      }
    };
    draw();
    return n.h('div.col', null, [n.h('div.row.spread', null, [n.h('p.small.dim', { text: 'Moderasi manual: daftar thread + penanda heuristik. Di produksi: path ini baca dari Postgres + pg_trgm search + abuse classifier.' }), n.h('button.btn.sm', { text: '↻ reload', onclick: draw })]), box]);
  }

  /* ---------------- keys ---------------- */
  function keysTab() {
    const draw = () => {
      const rows = n.store.keys.all();
      box.innerHTML = '';
      const t = n.h('table.t');
      t.appendChild(n.h('tr', null, ['key', 'label', 'owner', 'rate', 'calls', 'dibuat', 'aksi'].map(x => n.h('th', { text: x }))));
      rows.forEach(k => t.appendChild(n.h('tr', null, [
        n.h('td.mono.tiny', { text: k.key.slice(0, 16) + '…' }),
        n.h('td', { text: k.label }), n.h('td.tiny.dim', { text: k.owner }),
        n.h('td.mono.tiny', { text: k.rate + '/m' }), n.h('td.mono.tiny', { text: String(k.calls) }),
        n.h('td.tiny.dim', { text: new Date(k.createdAt).toLocaleDateString('id-ID') }),
        n.h('td', null, [k.revoked ? n.h('span.badge.free', { text: 'revoked' }) : n.h('button.btn.sm.dgr', { text: 'revoke', onclick: () => { n.auth.revokeKey(k.id); draw(); } })])
      ])));
      box.appendChild(t);
      stat.textContent = rows.length + ' key · ' + rows.filter(k => k.revoked).length + ' revoked · ' + rows.reduce((a, k) => a + k.calls, 0) + ' total call';
    };
    const box = n.h('div.scroll'), stat = n.h('span.tiny.dim', null);
    draw();
    return n.h('div.card', null, [n.h('div.row.spread', null, [n.h('div.kicker', { text: 'semua API key (admin view)' }), n.h('button.btn.sm', { text: '⤓ csv', onclick: () => n.ui.download(new Blob([n.tools.toCsv(n.store.keys.all().map(k => ({ ...k, key: k.key.slice(0, 10) + '…', keyHash: k.keyHash.slice(0, 10) + '…' })))], { type: 'text/csv' }), 'keys.csv') })]), box, stat,
      n.h('p.tiny.warn.mt', { text: 'Key ditampilkan terpotong — yang disimpan cuma hash. Kalau ada yang bocor, revoke di sini lalu regenerate.' })]);
  }

  /* ---------------- event log ---------------- */
  function logTab() {
    const box = n.h('div.scroll', { style: { maxHeight: '58vh' } });
    const kind = n.h('select.inp', null, ['semua', ...[...new Set(n.store.activity.all().map(a => a.kind))]].map((k, i) => n.h('option', { value: k, text: k, selected: i === 0 })));
    const q = n.h('input.inp', { placeholder: 'cari detail…' });
    const draw = () => {
      const rows = n.store.activity.all().filter(a => (kind.value === 'semua' || a.kind === kind.value) && (!q.value || a.detail.toLowerCase().includes(q.value.toLowerCase())));
      const t = n.h('table.t');
      t.appendChild(n.h('tr', null, ['waktu', 'user', 'kind', 'detail'].map(x => n.h('th', { text: x }))));
      rows.slice(0, 600).forEach(r => t.appendChild(n.h('tr', null, [
        n.h('td.tiny.mono.dim', { text: new Date(r.at).toISOString().replace('T', ' ').slice(0, 19) }),
        n.h('td.tiny', { text: r.user }),
        n.h('td', { html: '<span class="badge free">' + n.esc(r.kind) + '</span>' }),
        n.h('td.small', { text: r.detail })])));
      box.innerHTML = ''; box.appendChild(t);
      cnt.textContent = rows.length + ' event ditampilkan (maks 600)';
    };
    const cnt = n.h('span.tiny.dim', null);
    kind.onchange = draw; q.oninput = draw; draw();
    return n.h('div.card', null, [n.h('div.row', null, [n.h('div', { style: { width: '180px' } }, kind), n.h('div', { style: { flex: 1 } }, q),
      n.h('button.btn.sm', { text: '⤓ ndjson', onclick: () => n.ui.download(new Blob([n.store.activity.all().map(r => JSON.stringify(r)).join('\n')], { type: 'application/x-ndjson' }), 'events.ndjson') }),
      n.h('button.btn.sm.dgr', { text: 'clear', onclick: () => n.ui.confirm('Kosongkan event log?', () => { n.store.activity.clear(); draw(); }, true) })]),
      cnt, box]);
  }

  /* ---------------- system ---------------- */
  function sysTab() {
    const info = {
      app: n.CFG.APP + ' v' + n.CFG.VERSION,
      build: n.CFG.BUILD,
      transport: n.CFG.BASE ? 'proxy ' + n.CFG.BASE : 'direct browser → provider',
      storage: n.store.persisted ? 'localStorage (' + quotaUsed() + ')' : 'in-memory (tidak persisten)',
      providerKeys: Object.fromEntries(Object.entries(n.keyInfo()).map(([k, v]) => [k, v.set ? 'set · ' + v.masked : 'kosong'])),
      models: { chat: Object.values(n.CFG.PROVIDERS).flatMap(p => p.chat.map(m => p.name + '/' + m.id)), image: n.CFG.PROVIDERS.gemini.image, stt: n.CFG.PROVIDERS.groq.stt, tts: n.CFG.PROVIDERS.groq.tts },
      quotaPolicy: n.CFG.QUOTA,
      sw: 'service worker: ' + ('serviceWorker' in navigator ? (navigator.serviceWorker.controller ? 'active' : 'terdaftar?cek') : 'tidak didukung')
    };
    function quotaUsed() { try { let s = 0; for (const k in localStorage) if (k.startsWith('nas1:')) s += localStorage[k].length; return (s / 1048576).toFixed(2) + ' MB'; } catch (e) { return '?'; } }
    const pre = n.h('pre.out', { text: JSON.stringify(info, null, 2) });
    const health = n.h('div.row');
    n.ui.health(health);
    return n.h('div.col', { style: { gap: '12px' } }, [
      n.h('div.card', null, [n.h('div.kicker', { text: 'konfigurasi runtime' }), pre]),
      n.h('div.card', null, [n.h('div.kicker', { text: 'provider health' }), health, n.h('p.tiny.mute', { text: '410 = model EOL di sisi provider · 401/403 = key · 200 = jalan. Klik buat re-ping.' })]),
      n.h('div.card', null, [n.h('div.kicker', { text: 'operasi berbahaya' }),
        n.h('div.row.mt', null, [
          n.h('button.btn.sm', { text: '⤓ snapshot DB lengkap', onclick: () => n.ui.download(new Blob([n.store.exportAll()], { type: 'application/json' }), 'admin-snapshot.json') }),
          n.h('button.btn.sm.dgr', { text: 'reset semua data user', onclick: () => n.ui.confirm('Hapus threads+images+log+keys semua user di device ini?', () => { n.store.threads.clear(); n.store.images.clear(); n.store.activity.clear(); n.store.keys.clear(); n.ui.toast('Bersih. Reload untuk refresh angka.', 'ok'); }, true) }),
          n.h('button.btn.sm.dgr', { text: 'factory reset (termasuk akun)', onclick: () => n.ui.confirm('Termasuk akun & sesi. Lanjut?', () => { n.store.reset(); n.store.users.clear(); n.store.session.set(null); location.href = 'index.html'; }, true) })
        ]),
        n.h('p.tiny.warn.mt', { text: 'Panel ini SENGAJA bisa diakses siapa pun yang tahu credential demo. Jangan pernah pakai build statis ini untuk data asli — pindahin guard-nya ke server sebelum deploy.' })])
    ]);
  }
})();
