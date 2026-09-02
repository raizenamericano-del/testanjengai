/* NEURAL AI STUDIO — landing page */
(function () {
  const n = window.NAS;
  n.ui.mount({ page: 'index.html', footer: true, motion: false });

  /* particle network (canvas, no three.js) */
  const fx = document.getElementById('fx');
  n.ui.particles(fx);
  if (fx) new ResizeObserver(() => n.ui.particles(fx)).observe(fx.parentElement);

  /* typing */
  n.ui.typing(document.getElementById('type'), [
    'chat multi-model + voice + file upload.',
    'image lab: generate, upscale, remove-bg, inpaint.',
    'link intel untuk TikTok / IG / YouTube / X.',
    '30+ utility tool yang beneran jalan di browser.',
    'thread, quota, API key, admin panel.'
  ], 42);

  /* live stats — same shape a Socket.io "stats" event would push */
  const stats = n.ui.liveStats(document.getElementById('stats'), {
    chats: 12480 + n.store.threads.all().reduce((a, t) => a + (t.messages || []).length, 0),
    images: 6712 + n.store.images.all().length
  });
  document.addEventListener('visibilitychange', () => document.hidden ? stats.stop() : null);

  n.ui.health(document.getElementById('health'));

  /* feature cards with 3D hover */
  const FEATURES = [
    ['◈', 'AI Chat lanjutan', 'Streaming multi-model (GPT-OSS, Qwen3.6, Gemini), thread, upload PDF/DOCX/XLSX/CSV, /image, voice input Whisper, interpreter Python/JS via Pyodide.', 'chat.html'],
    ['❖', 'Image Lab', 'Generate + image-to-image, 6 style, aspect 1:1/16:9/9:16, batch, upscale 2–4×, background remover, colorizer, style transfer, inpaint/outpaint, galeri + export ZIP/ICO.', 'image.html'],
    ['⇩', 'Media & Downloader', 'Identifikasi 11 platform, resolve shortlink, preview oEmbed resmi, trim video WebCodecs, convert MP3/WAV/Opus, probe media.', 'media.html'],
    ['◱', 'Data & Scrape', 'Ekstrak metadata HTML, CSV↔JSON↔Table, Google Trends (RSS), competitor snapshot, regex lab, diff view.', 'scrape.html'],
    ['⚙', 'Utility Toolbelt', 'QR gen+scan, Base64/Base64url, MD5/SHA1/SHA256/SHA512, JSON fix+validate, beautify/minify, units, warna, password, fake data, cron, JWT.', 'tools.html'],
    ['⛨', 'User + Admin', 'Login, tier, kuota harian terhitung, API key (hash + revoke), log aktivitas, panel admin, export/import JSON.', 'admin.html']
  ];
  const host = document.getElementById('features');
  host.appendChild(n.h('div.row.spread.mb', null, [
    n.h('div', null, [n.h('span.tag', { text: 'Fitur' }), n.h('h2', { text: 'Enam pilar, satu shell', style: { margin: '4px 0 0' } })]),
    n.h('a.small.dim', { href: 'README.md', text: 'Lihat daftar lengkap 20+ →' })
  ]));
  FEATURES.forEach(([ic, t, d, href]) => {
    const card = n.h('a.card.tilt', { href, style: { display: 'block' } }, [
      n.h('div.feat', null, [n.h('div.ic', { text: ic }), n.h('div', null, [n.h('h3', { text: t, style: { margin: '0 0 4px' } }), n.h('p.dim.small', { text: d })])]),
      n.h('div.row.mt', null, [n.h('span.chip', { text: 'buka' }), n.h('span.tiny.mute', { text: 'app/' + href })])
    ]);
    card.style.background = 'linear-gradient(180deg,var(--panel),color-mix(in srgb,var(--panel) 60%,var(--bg)))';
    n.ui.tilt3d(card);
    host.appendChild(card);
  });

  /* testimonials (fake, labelled as demo) */
  const T = [
    ['Raka — indie dev', 'Tool JSON + hash + QR-nya udah nutup 80% workflow-ku, tanpa buka 6 tab.'],
    ['Nadia — content team', 'Image lab jalan tanpa server. Upscale + remove-bg client-side itu yang gue butuh.'],
    ['Bagas — agensi', 'Downloader-nya jujur: preview + embed resmi, bukan scraper abal-abal yang mati seminggu.'],
    ['Dimas — ML eng', 'Model list-nya realistis (bukan nulis GPT-4 di README doang). Respect.'],
    ['Sinta — student', 'Chat + voice input + export markdown. Buat ngerjain tugas cepat banget.']
  ];
  const mq = document.querySelector('#testi > div');
  const card = (a, q) => n.h('div.card.quote', null, [n.h('p.small', { text: '“' + q + '”' }), n.h('span.tiny.dim', { text: '— ' + a })]);
  [...T, ...T].forEach(([a, q]) => mq.appendChild(card(a, q)));
  mq.parentElement.title = 'Testimonial demo (fiktif) — ganti dengan yang asli sebelum launch';

  /* pricing */
  const P = document.getElementById('pricing');
  P.appendChild(n.h('div', null, [n.h('span.tag', { text: 'Pricing' }), n.h('h2', { text: 'Bayar yang dipakai', style: { margin: '4px 0 0' } })]));
  for (const [k, t] of Object.entries(n.CFG.TIERS)) {
    const isPro = k === 'pro';
    P.appendChild(n.h('div.card' + (isPro ? '.hot' : ''), null, [
      isPro && n.h('span.badge.pro', { text: 'paling populer' }),
      n.h('h3', { text: t.name, style: { margin: '8px 0 2px' } }),
      n.h('div', null, [n.h('b', { text: t.price ? '$' + t.price : 'Gratis', style: { fontSize: '2rem', fontWeight: 900 } }), n.h('span.dim.small', { text: t.price ? ' /bln' : '' })]),
      n.h('p.dim.small', { text: t.blurb }),
      n.h('ul', { style: { margin: '10px 0', paddingLeft: '18px' } }, t.perks.map(p => n.h('li.small', { text: p }))),
      n.h('button.btn' + (isPro ? '.pri' : ''), { text: k === 'enterprise' ? 'Hubungi sales' : 'Mulai', style: { width: '100%' }, onclick: () => buy(k) })
    ]));
  }
  function buy(tier) {
    if (!n.CFG.BASE) return n.ui.modal({
      title: 'Stripe checkout: belum bisa jalan di build ini',
      body: n.h('div.col', null, [
        n.h('p.dim.small', { text: 'Charge card harus dibuat di server (PaymentIntent + secret key). Yang ada di scaffold:' }),
        n.h('pre.out', { text: 'POST /api/billing/checkout {tier}\n→ Stripe Checkout Session (stub: langsung set user.tier)\nWEBHOOK /api/stripe/webhook → prorate + update Prisma' }),
        n.h('div.row', null, [
          n.h('button.btn.gho', { text: 'Tutup', onclick: () => document.querySelector('.modal').remove() }),
          n.h('a.btn.pri', { href: 'account.html', text: 'Simulasi upgrade di Account →', onclick: () => sessionStorage.setItem('upgrade', tier) })
        ])
      ])
    });
    n.auth.setTier(tier); n.ui.toast('Tier di-set ke ' + tier + ' (mode proxy).', 'ok');
  }

  /* key exposure warning */
  const info = n.keyInfo();
  document.getElementById('keywarn').innerHTML =
    'Key provider (Groq / NVIDIA / Gemini) pernah ditulis mentah-mentah di prompt publik. ' +
    'Anggap <b>sudah bocor</b>: revoke &amp; buat ulang di console masing-masing, lalu set lewat env var di server. ' +
    'Repo ini sengaja <b>zero secret</b>: taruh key di <code>secrets.local.js</code> (git-ignored) atau jalanin proxy server.';
  const chips = document.getElementById('keychips');
  for (const [k, v] of Object.entries(info)) chips.appendChild(n.h('span.chip', null, [
    n.h('i.live', { style: { background: v.set ? 'var(--am)' : 'var(--mute)', boxShadow: 'none' } }), k + ' ', n.h('b.mono', { text: v.masked || '—' })
  ]));
  chips.appendChild(n.h('button.btn.sm', { text: 'Revoke & ganti key', onclick: () => location.href = 'account.html#settings' }));

  /* architecture snippet */
  document.getElementById('arch').textContent =
`neural-ai-studio/
├─ index.html chat.html image.html media.html tools.html scrape.html
├─ account.html admin.html r.html manifest.webmanifest sw.js
├─ assets/css/app.css              ← design system (dark default)
├─ assets/js/lib/
│   ├─ config.js   provider + model + quota (verified live)
│   ├─ ui.js       dom/markdown/toast/modal/particles/stats
│   ├─ store.js    localStorage ⇄ (nanti) Prisma
│   ├─ auth.js     login/tier/apikey ⇄ (nanti) NextAuth
│   ├─ ai.js       groq+gemini streaming, whisper, pyodide, pdf/docx/xlsx
│   ├─ img.js      gen + upscale/removebg/colorize/stylize/inpaint/zip/ico
│   ├─ tools.js    qr, hash, json, beautify, units, color, wav, trim…
│   └─ links.js    11 platform parser + oEmbed + embed + advice
├─ server/
│   ├─ dev-proxy.mjs               ← CORS+key+quota+cache (Node, no deps)
│   ├─ schema.prisma               ← User/Thread/Message/Image/ApiKey/Event
│   └─ nextjs-map.md               ← resep App Router per halaman
└─ test/run.mjs                    ← 30 unit test (node test/run.mjs)`;
})();
