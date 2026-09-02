/* NEURAL AI STUDIO — account: auth, usage, API keys, billing sim, history, settings.
   SECURITY NOTE (baca kalau mau production): bagian auth di sini simulasi browser.
   Yang wajib pindah ke server: verifikasi password, sesi (httpOnly cookie), pembuatan API key,
   pencatatan kuota, dan Stripe webhook. Lihat server/nextjs-map.md §auth. */
(function () {
  const n = window.NAS;
  const root = document.body; root.innerHTML = '';
  root.appendChild(n.ui.nav('account.html'));
  const wrap = n.h('div.wrap', { style: { padding: '18px 20px 40px', display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '1080px' } });
  root.appendChild(wrap);
  document.documentElement.dataset.theme = n.store.settings.get().theme;
  if (n.store.settings.get().cursor && matchMedia('(pointer:fine)').matches) n.ui.cursorTrail();

  const host = n.h('div');
  wrap.appendChild(host);
  n.auth.init().then(render);

  const tabs = () => [
    { id: 'overview', label: '◐ Ringkasan', render: overview },
    { id: 'keys', label: '⚷ API keys', render: keys },
    { id: 'billing', label: '💳 Billing', render: billing },
    { id: 'history', label: '⧗ History', render: history },
    { id: 'settings', label: '⚙ Settings', render: settings }
  ];
  let tabber;
  function render() {
    host.innerHTML = '';
    const me = n.auth.me();
    host.appendChild(n.h('div.row.spread', null, [
      n.h('div', null, [n.h('span.tag', { text: '👤 Account' }), n.h('h1', { text: me ? 'Halo, ' + me.name : 'Masuk dulu', style: { margin: '2px 0 0' } })]),
      me ? n.h('div.row', null, [n.h('span.badge.' + (me.role === 'admin' ? 'adm' : me.tier), { text: me.role === 'admin' ? 'admin' : me.tier }), n.h('button.btn.sm', { text: 'logout', onclick: () => n.auth.logout() })]) : n.h('span.pill', { text: 'mode tamu' })
    ]));
    if (!me) host.appendChild(loginCard());
    tabber = n.ui.tabbed(host, tabs());
    if (location.hash) tabber.go(location.hash.slice(1));
  }

  /* demo credentials come from window.NAS_SECRETS.DEMO_USERS — never hard-coded in the repo
     (GitHub push protection blocks repos that ship passwords, and it should). */
  function demoCard(email, pw, submit) {
    const users = (n.CFG.DEMO_USERS || []);
    if (!users.length) return n.h('div.col', { style: { gap: '8px' } }, [
      n.h('p.small.dim', { html: 'Belum ada akun demo. Bikin <code>secrets.local.js</code> (lihat <code>secrets.example.js</code>) atau langsung daftar — akun pertama di device ini jadi admin.' }),
      n.h('button.btn.sm.pri', { text: '+ daftar akun baru', onclick: () => n.ui.toast('Klik "butuh akun? daftar" di form kiri, isi email + password minimal 8 karakter.', 'ok', 5000) })
    ]);
    return n.h('div.col', { style: { gap: '8px' } }, [
      n.h('pre.out', { text: users.map(u => (u.role === 'admin' ? 'admin ' : 'user  ') + u.email + ' / ' + u.pw).join('\n') }),
      n.h('div.row', null, users.map(u => n.h('button.btn.sm', {
        text: '⚡ isi sebagai ' + (u.role === 'admin' ? 'admin' : 'user'),
        onclick: () => { signup = false; email.value = u.email; pw.value = u.pw; submit(); }
      })))
    ]);
  }

  /* guest gate: tab builders that need a user return this instead of touching me.* */
  const gate = (what) => n.h('div.card.col', { style: { gap: '8px', maxWidth: '520px' } }, [
    n.h('h3', { text: 'Belum ada user di device ini' }),
    n.h('p.small.dim', { text: what + ' menempel ke akun (localStorage). Masuk dulu pakai salah satu akun demo di atas, atau daftar.' }),
    n.h('button.btn.sm.pri', { text: '↑ ke form login', onclick: () => document.querySelector('.card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) })
  ]);

  /* ---------------- login / signup ---------------- */
  function loginCard() {
    const email = n.h('input.inp', { type: 'email', placeholder: 'email', autocomplete: 'username' });
    const pw = n.h('input.inp', { type: 'password', placeholder: 'password', autocomplete: 'current-password' });
    const name = n.h('input.inp', { placeholder: 'nama (untuk daftar)', class: 'hide' });
    const err = n.h('p.small.bad', { text: '' });
    let signup = false;
    const submit = async (e) => {
      e?.preventDefault?.();
      err.textContent = '';
      try {
        if (signup) await n.auth.signup({ email: email.value, pw: pw.value, name: name.value });
        else await n.auth.login(email.value, pw.value);
        n.ui.toast('✓ masuk sebagai ' + email.value, 'ok'); render();
      } catch (e2) { err.textContent = '✕ ' + e2.message; }
    };
    const btn = n.h('button.btn.pri', { text: 'Masuk', onclick: submit });
    const toggle = n.h('button.btn.sm.gho', { text: 'butuh akun? daftar', onclick: () => { signup = !signup; name.classList.toggle('hide', !signup); btn.textContent = signup ? 'Buat akun' : 'Masuk'; toggle.textContent = signup ? 'sudah punya akun? masuk' : 'butuh akun? daftar'; } });
    [email, pw].forEach(i => i.addEventListener('keydown', e => e.key === 'Enter' && submit(e)));
    return n.h('div.card.grid.g2', null, [
      n.h('form.col', { onsubmit: submit, style: { gap: '8px' } }, [
        n.h('label.fl', { text: 'email' }), email,
        n.h('label.fl', { text: 'password' }), pw, name, err,
        n.h('div.row', null, [btn, toggle]),
        n.h('p.tiny.mute', { text: 'Oauth Google/GitHub (NextAuth) cuma jalan di server — tombolnya ada di versi Next.js. Ini login lokal device.' })
      ]),
      n.h('div.col', null, [
        n.h('div.kicker', { text: 'akun demo (dari secrets.local.js)' }),
        demoCard(email, pw, submit),
        n.h('p.tiny.warn', { text: 'Akun ini ada di localStorage device kamu — bukan akun asli, bukan untuk login ke mana pun.' })
      ])
    ]);
  }

  /* ---------------- overview ---------------- */
  function overview() {
    const me = n.auth.me(); if (!me) return gate('overview');
    const q = n.auth.quota();
    const threads = n.store.threads.all(), images = n.store.images.all(), acts = n.store.activity.all().filter(a => a.user === me?.email);
    const box = n.h('div.grid.g4');
    const stat = (l, v, s) => n.h('div.stat', null, [n.h('span', { text: l }), n.h('b', { text: v }), s && n.h('span.tiny.dim', { text: s })]);
    const avatarBox = n.h('div.avatar', { id: 'av' }, (me.name || me.email).slice(0, 2).toUpperCase());
    const avFile = n.h('input', { type: 'file', accept: 'image/*', onchange: async () => {
      const f = avFile.files[0]; if (!f) return;
      const url = URL.createObjectURL(f);
      avatarBox.innerHTML = '';
      avatarBox.appendChild(n.h('img', { src: url, alt: 'avatar', style: { width: '100%', height: '100%', objectFit: 'cover' } }));
      n.store.users.put({ ...me, avatar: url }); n.ui.toast('Avatar di-set (URL blob lokal).', 'ok');
    } });
    avatarBox.appendChild(avFile);
    const bio = n.h('textarea.inp', { rows: 2, placeholder: 'bio singkat…', value: me.bio || '' });
    bio.onchange = () => n.store.users.put({ ...me, bio: bio.value });
    const pct = q.limit === Infinity ? 0 : Math.min(1, q.used / q.limit);
    return n.h('div.col', { style: { gap: '14px' } }, [
      n.h('div.card', null, [
        n.h('div.row', { style: { gap: '16px', alignItems: 'flex-start' } }, [
          avatarBox,
          n.h('div', { style: { flex: 1 } }, [
            n.h('h2', { text: me.name, style: { margin: '0 0 2px' } }),
            n.h('div.dim.small', { text: me.email + ' · member sejak ' + new Date(me.createdAt).toLocaleDateString('id-ID') }),
            bio
          ]),
          n.h('div.col', { style: { alignItems: 'flex-end' } }, [n.h('span.badge.' + (me.role === 'admin' ? 'adm' : me.tier), { text: me.role === 'admin' ? 'ADMIN' : me.tier.toUpperCase() }),
            n.h('span.tiny.mute', { text: (me.role === 'admin' ? 'unlimited' : q.left + ' request sisa') })])
        ])
      ]),
      box, n.h('div.card', null, [
        n.h('div.row.spread', null, [n.h('b.small', { text: 'pemakaian hari ini' }), n.h('span.mono.tiny.dim', { text: q.used + ' / ' + (q.limit === Infinity ? '∞' : q.limit) })]),
        n.h('div.meter.mt', null, n.h('i', { style: { width: (pct * 100) + '%' } })),
        q.limit !== Infinity && pct > .8 ? n.h('p.tiny.warn.mt', { text: 'Sisa ' + q.left + '. Upgrade untuk naik ke ' + n.CFG.TIERS.pro.price + '$/bln.' }) : null
      ]),
      n.h('div.grid.g4', null, [
        stat('threads', threads.length, (threads.reduce((a, t) => a + (t.messages || []).length, 0)) + ' pesan'),
        stat('gambar', images.length, 'galeri lokal'),
        stat('aksi tercatat', acts.length, 'activity log'),
        stat('api keys', (me.apiKeys || []).length, n.store.keys.all().filter(k => !k.revoked).length + ' aktif')
      ])
    ].filter(Boolean));
  }

  /* ---------------- API keys ---------------- */
  function keys() {
    const me = n.auth.me(); if (!me) return gate('keys');
    const list = n.h('div.list');
    const label = n.h('input.inp', { placeholder: 'label (mis. "server produksi")' });
    const rate = n.h('input.inp', { type: 'number', value: 1000, style: { maxWidth: '120px' } });
    const draw = () => {
      list.innerHTML = '';
      const rows = n.store.keys.all();
      if (!rows.length) list.appendChild(n.h('div.empty', { text: 'belum ada key' }));
      rows.forEach(k => {
        list.appendChild(n.h('div.item', null, [
          n.h('span.nm.mono', { text: k.key.slice(0, 14) + '…' + k.key.slice(-4) }),
          n.h('span.d', { text: k.label }),
          n.h('span.chip', { text: k.calls + ' call' }),
          k.revoked ? n.h('span.badge.free', { text: 'revoked' }) : n.h('span.badge.pro', { text: 'live' }),
          n.h('button.btn.sm.gho', { text: '⧉', onclick: () => n.ui.copy(k.key, 'Key') }),
          !k.revoked && n.h('button.btn.sm.dgr', { text: 'revoke', onclick: () => { n.auth.revokeKey(k.id); draw(); } })
        ]));
      });
    };
    draw();
    const mk = async () => {
      const r = await n.auth.createKey(label.value, +rate.value);
      draw(); label.value = '';
      n.ui.modal({
        title: 'Key baru — sekali tampil saja',
        body: n.h('div.col', null, [n.h('pre.out', { text: r.key }), n.h('p.warn.small', { text: 'Disimpan sebagai sha256 hash di device ini; plaintext tidak bisa diambil lagi. Simpan sekarang.' }),
          n.h('pre.out', { text: 'curl -H "Authorization: Bearer ' + r.key + '" ' + location.origin + '/api/chat \\\n  -d \'{"model":"openai/gpt-oss-20b","messages":[{"role":"user","content":"hi"}]}\'' })]),
        footer: [n.h('button.btn.sm.pri', { text: '⧉ copy key', onclick: () => n.ui.copy(r.key, 'Key') })]
      });
    };
    return n.h('div.col', { style: { gap: '12px' } }, [
      n.h('div.card', null, [
        n.h('div.kicker', { text: 'buat key baru' }),
        n.h('div.row.mt', null, [n.h('div', { style: { flex: 1 } }, label), n.h('div', null, n.h('label.fl', { text: 'rate/menit' }), rate), n.h('button.btn.pri', { text: '⚷ generate', onclick: mk })]),
        n.h('p.tiny.mute', { text: 'Di produksi: key dibuat server (crypto.randomBytes), disimpan sebagai hash + prefix 8 char buat lookup, dan dicek di middleware tiap request. Format sengaja mirip sk_live_ biar gampang dibedakan.' })
      ]),
      n.h('div.card', null, [n.h('div.row.spread', null, [n.h('div.kicker', { text: 'key kamu' }), n.h('span.tiny.dim', { text: n.auth.revealKeys().length + ' total' })]), list])
    ]);
  }

  /* ---------------- billing ---------------- */
  function billing() {
    const me = n.auth.me(); if (!me) return gate('billing');
    const box = n.h('div.grid.g3');
    for (const [k, t] of Object.entries(n.CFG.TIERS)) {
      const now = me.tier === k;
      box.appendChild(n.h('div.card' + (now ? '.hot' : ''), null, [
        n.h('div.row.spread', null, [n.h('h3', { text: t.name, style: { margin: 0 } }), now && n.h('span.badge.pro', { text: 'aktif' })]),
        n.h('div', null, [n.h('b', { text: t.price ? '$' + t.price : 'Gratis', style: { fontSize: '1.7rem' } })]),
        n.h('ul', { style: { paddingLeft: '18px', margin: '8px 0' } }, t.perks.map(p => n.h('li.small.dim', { text: p }))),
        n.h('button.btn' + (now ? '' : '.pri'), { text: now ? 'sudah aktif' : 'checkout $' + t.price, disabled: now, onclick: () => checkout(k) })
      ]));
    }
    async function checkout(tier) {
      if (n.CFG.BASE) {
        try {
          const r = await fetch(n.CFG.BASE + '/api/billing/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tier, email: me.email }) });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
          if (j.url) { location.href = j.url; return; }
          n.auth.setTier(tier); n.store.log('billing', 'upgrade → ' + tier); render();
          n.ui.toast('Stripe stub: tier di-update.', 'ok');
        } catch (e) { n.ui.toast('Stripe: ' + e.message, 'err', 6000); }
        return;
      }
      const done = n.ui.modal({
        title: 'Simulasi Stripe Checkout',
        body: n.h('div.col', null, [
          n.h('p.dim.small', { text: 'Build statis tidak bisa memegang stripe_secret_key (itu rahasia server). Jadi: preview flow-nya, lalu set tier lokal.' }),
          n.h('pre.out', { text: 'client → POST /api/billing/checkout {tier}\nserver → stripe.checkout.sessions.create({\n  mode:"subscription", line_items:[{price, quantity:1}],\n  success_url, cancel_url, metadata:{userId}\n})\nclient → redirect session.url\nstripe → webhook /api/stripe/webhook  (checkout.session.completed)\nserver → prisma.user.update({tier:"pro", currentPeriodEnd})' }),
          n.h('div.row', null, [
            n.h('button.btn.sm.gho', { text: 'batal', onclick: () => done.close() }),
            n.h('button.btn.sm.pri', { text: 'ya, set tier lokal → ' + tier, onclick: () => { n.auth.setTier(tier); n.store.log('billing', 'sim upgrade → ' + tier); done.close(); render(); n.ui.toast('Tier = ' + tier + ' (simulasi, tanpa uang).', 'ok'); } })
          ])
        ])
      });
    }
    return n.h('div.col', { style: { gap: '12px' } }, [
      n.h('div.card', null, [n.h('div.kicker', { text: 'status langganan' }),
        n.h('div.row.mt', null, [n.h('span.badge.' + (me.role === 'admin' ? 'adm' : me.tier), { text: me.role === 'admin' ? 'admin · unlimited' : me.tier }), n.h('span.dim.small', { text: 'kuota ' + (n.CFG.QUOTA[me.tier] === Infinity ? '∞' : n.CFG.QUOTA[me.tier]) + ' request/hari · ' + n.auth.quota().used + ' terpakai' })])]),
      box,
      n.h('div.card', null, [n.h('div.kicker', { text: 'metode pembayaran (stub)' }),
        n.h('p.small.dim', { text: 'Card field tidak pernah menyentuh server kamu kalau pakai Stripe Checkout/Elements — tokenisasi di browser Stripe. Stub ini cuma menyimpan 4 digit terakhir untuk tampilan.' }),
        n.h('div.row', null, [n.h('input.inp', { placeholder: '•••• •••• •••• 4242', maxlength: 19, id: 'cardnum' }), n.h('button.btn.sm', { text: 'simpan', onclick: () => { const v = document.getElementById('cardnum').value.replace(/\D/g, ''); n.store.users.put({ ...me, card: v.slice(-4) ? '••••' + v.slice(-4) : 'belum diisi' }); n.ui.toast('Stub card disimpan: ' + (me.card || '••••' + v.slice(-4)), 'ok'); } })])])
    ]);
  }

  /* ---------------- history ---------------- */
  function history() {
    const me = n.auth.me(); if (!me) return gate('history');
    const q = n.h('input.inp', { placeholder: 'filter detail / kind…' });
    const box = n.h('div.scroll', { style: { maxHeight: '520px' } });
    const draw = () => {
      const all = n.store.activity.all().filter(a => me.role === 'admin' || a.user === me.email);
      const term = q.value.toLowerCase();
      const rows = all.filter(r => !term || (r.kind + ' ' + r.detail).toLowerCase().includes(term));
      box.innerHTML = '';
      const t = n.h('table.t');
      t.appendChild(n.h('tr', null, ['waktu', 'kind', 'detail', 'user'].map(x => n.h('th', { text: x }))));
      rows.slice(0, 400).forEach(r => t.appendChild(n.h('tr', null, [
        n.h('td.tiny.mono.dim', { text: new Date(r.at).toLocaleString('id-ID') }),
        n.h('td', { html: '<span class="badge free">' + n.esc(r.kind) + '</span>' }),
        n.h('td.small', { text: r.detail }),
        me.role === 'admin' ? n.h('td.tiny.dim', { text: r.user }) : null
      ].filter(Boolean))));
      box.appendChild(t);
      stat.textContent = rows.length + ' entri' + (me.role === 'admin' ? ' (mode admin: semua user)' : '');
    };
    const stat = n.h('span.tiny.dim', null);
    q.oninput = draw; draw();
    return n.h('div.col', { style: { gap: '10px' } }, [
      n.h('div.row', null, [n.h('div', { style: { flex: 1 } }, q),
        n.h('button.btn.sm', { text: '⤓ csv', onclick: () => n.ui.download(new Blob([n.tools.toCsv(n.store.activity.all().map(({ id, ...r }) => r))], { type: 'text/csv' }), 'history.csv') }),
        n.h('button.btn.sm', { text: '⤓ markdown', onclick: () => n.ui.download(new Blob(['# Activity\n\n' + n.store.activity.all().map(r => '- **' + r.kind + '** ' + r.detail + '  \n  ' + new Date(r.at).toISOString()).join('\n')], { type: 'text/markdown' }), 'history.md') }),
        n.h('button.btn.sm.dgr', { text: 'hapus log', onclick: () => n.ui.confirm('Hapus seluruh log aktivitas?', () => { n.store.activity.clear(); draw(); }, true) })]),
      stat, box
    ]);
  }

  /* ---------------- settings ---------------- */
  function settings() {
    const s = n.store.settings.get();
    const theme = n.h('div.seg', null, ['dark', 'light'].map(t => n.h('button' + (t === s.theme ? '.on' : ''), { text: t, onclick: () => { n.ui.theme(t); [...theme.children].forEach(x => x.classList.toggle('on', x.textContent === t)); } })));
    const sw = (label, key, hint) => {
      const c = n.h('input', { type: 'checkbox', checked: !!s[key] });
      c.onchange = () => n.store.settings.set({ [key]: c.checked });
      return n.h('label.chk', { style: { padding: '6px 0' } }, [c, n.h('span', null, [label, hint && n.h('div.tiny.mute', { text: hint })])]);
    };
    const sys = n.h('textarea.inp', { rows: 4, value: s.sys });
    sys.onchange = () => { n.store.settings.set({ sys: sys.value }); n.ui.toast('System prompt disimpan.', 'ok'); };
    const base = n.h('input.inp', { value: n.CFG.BASE || '', placeholder: 'kosong = direct dari browser · /api = lewat proxy' });
    const applyBase = () => { n.CFG.BASE = base.value.trim(); n.ui.toast('BASE = "' + (n.CFG.BASE || '(kosong, direct)') + '" — reload supaya semua modul konsisten.', 'ok', 6000); };
    const keyRows = () => n.h('div.col', { style: { gap: '6px' } }, ['groq', 'groq2', 'gemini', 'nvidia'].map(k => {
      const info = n.keyInfo()[k];
      const i = n.h('input.inp', { type: 'password', value: '', placeholder: info.set ? 'tersimpan (' + info.masked + ' · ' + info.from + ') — ketik untuk ganti' : k + ' key' });
      const save = n.h('button.btn.sm', { text: 'set', onclick: () => {
        const v = i.value.trim();
        if (!v) return n.ui.toast('Isi dulu key-nya.', 'warn');
        n.setKey(k, v); n.ui.toast(k + ' key disimpan di localStorage device ini.', 'ok'); i.value = ''; drawKeys();
      } });
      return n.h('div.row', null, [n.h('span.small.dim', { text: k, style: { width: '70px' } }), i, save]);
    }));
    const keysHost = n.h('div');
    const drawKeys = () => { keysHost.innerHTML = ''; keysHost.appendChild(keyRows()); };
    drawKeys();
    const wipeKeys = n.h('button.btn.sm.dgr', { text: 'hapus semua key dari device', onclick: () => n.ui.confirm('Key di localStorage + config bakal dikosongin.', () => { n.clearKeys(); drawKeys(); n.ui.toast('Key dibersihkan.', 'ok'); }, true) });
    return n.h('div.grid.g2', null, [
      n.h('div.card.col', null, [
        n.h('div.kicker', { text: 'tampilan' }), theme,
        sw('custom neon cursor', 'cursor', 'dimatikan otomatis di touch device'),
        sw('animasi & motion', 'motion', 'hormati prefers-reduced-motion juga'),
        n.h('div.kicker.mt', { text: 'AI default' }),
        n.h('label.fl', { text: 'system prompt (dipakai semua tool yang manggil model)' }), sys
      ]),
      n.h('div.card.col', null, [
        n.h('div.kicker', { text: 'transport' }),
        n.h('label.fl', { text: 'NAS.CFG.BASE' }), base, n.h('button.btn.sm.pri', { text: 'terapkan', onclick: applyBase }),
        n.h('p.tiny.mute', { text: 'Proxy mode = key tidak pernah ada di browser. Direct mode = praktis buat demo, tapi key-nya publik di source.' }),
        n.h('div.kicker.mt', { text: 'provider keys' }), keysHost, wipeKeys,
        n.h('p.tiny.mute', { text: 'Key disimpan di localStorage device ini (atau secrets.local.js yang tidak ikut ke git). Repo ini sendiri nol secret — makanya bisa di-push ke GitHub tanpa kena push protection.' }),
        n.h('div.kicker.mt', { text: 'data' }),
        n.h('div.row', null, [
          n.h('button.btn.sm', { text: '⤓ export semua (json)', onclick: () => n.ui.download(new Blob([n.store.exportAll()], { type: 'application/json' }), 'neural-ai-studio-export.json') }),
          n.h('label.btn.sm', { text: '⤒ import', onclick: null }, [n.h('input', { type: 'file', accept: '.json', style: { display: 'none' }, onchange: async (e) => {
            try { const j = JSON.parse(await e.target.files[0].text()); ['threads', 'images', 'activity', 'keys'].forEach(k => { if (Array.isArray(j[k])) j[k].forEach(r => n.store[k].put(r)); }); n.ui.toast('Import selesai: ' + (j.threads?.length || 0) + ' thread, ' + (j.images?.length || 0) + ' image.', 'ok'); } catch (err) { n.ui.toast('Import gagal: ' + err.message, 'err'); }
          } })]),
          n.h('button.btn.sm.dgr', { text: 'reset semua', onclick: () => n.ui.confirm('Hapus SEMUA data app di device ini (threads, galeri, log, keys)?', () => { n.store.reset(); location.reload(); }, true) })
        ])
      ])
    ]);
  }
})();
