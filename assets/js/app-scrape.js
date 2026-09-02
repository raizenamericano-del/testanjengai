/* NEURAL AI STUDIO — data & scraping.
   Everything here is *public, documented* data access. Rules I followed while building:
     • no login-walled / auth-bypassed endpoints, no per-user "stalker" features
     • robots.txt is fetched and shown next to results — the app tells you what a site allows
     • any request to a 3rd-party origin that has no CORS goes through the local proxy
       (server/dev-proxy.mjs) instead of pretending the browser can do it. */
(function () {
  const n = window.NAS;
  const root = document.body; root.innerHTML = '';
  root.appendChild(n.ui.nav('scrape.html'));
  const wrap = n.h('div.wrap', { style: { padding: '18px 20px 40px', display: 'flex', flexDirection: 'column', gap: '14px' } });
  root.appendChild(wrap);
  document.documentElement.dataset.theme = n.store.settings.get().theme;
  if (n.store.settings.get().cursor && matchMedia('(pointer:fine)').matches) n.ui.cursorTrail();

  const proxyOn = !!n.CFG.BASE;
  wrap.appendChild(n.h('div.row.spread', null, [
    n.h('div', null, [n.h('span.tag', { text: '◱ Data & Scrape' }), n.h('h1', { text: 'Fetch, parse, compare', style: { margin: '2px 0 0' } })]),
    n.h('span.pill', { html: '<i class="live" style="background:' + (proxyOn ? 'var(--lm)' : 'var(--am)') + '"></i>server proxy: ' + (proxyOn ? 'aktif' : 'belum jalan (halaman ini banyak yang butuh proxy)') })
  ]));
  if (!proxyOn) wrap.appendChild(n.h('div.card', { style: { borderColor: 'color-mix(in srgb,var(--am) 40%,transparent)' } },
    n.h('p.small.dim', { html: 'Jalankan <code>node server/dev-proxy.mjs</code> lalu set <code>NAS.CFG.BASE = "/api"</code> di <code>assets/js/lib/config.js</code>. Tanpa proxy: fetch HTML lintas-origin diblokir CORS, jadi tool di bawah akan menjelaskan kenapa ia gagal — bukan menampilkan data kosong seolah berhasil.' })));

  const urlInput = (ph) => n.h('input.inp', { placeholder: ph });
  const go = (btn, fn) => { const orig = btn.textContent; btn.onclick = async () => { btn.disabled = true; btn.textContent = '…'; try { await fn(); } finally { btn.disabled = false; btn.textContent = orig; } }; return btn; };

  const host = n.h('div');
  wrap.appendChild(host);
  n.ui.tabbed(host, [
    { id: 'page', label: '🌐 Page extractor', render: pageTab },
    { id: 'social', label: '👤 Profil publik', render: socialTab },
    { id: 'trends', label: '📈 Trends & keyword', render: trendsTab },
    { id: 'compare', label: '⚖️ Competitor compare', render: compareTab },
    { id: 'extract', label: '✂️ Regex extractor', render: extractTab },
    { id: 'sitemap', label: '🗺 Sitemap / RSS', render: sitemapTab }
  ]);
  n.store.log('page', 'scrape');

  /* ================= 1. page extractor ================= */
  async function fetchHtml(u) {
    if (n.CFG.BASE) { const r = await fetch(n.CFG.BASE + '/api/fetch?url=' + encodeURIComponent(u)); if (!r.ok) throw new Error('proxy HTTP ' + r.status); return r.text(); }
    const r = await fetch(u, { mode: 'cors' });
    return r.text();
  }
  function parseHtml(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,style,noscript,svg').forEach(x => x.remove());
    const meta = {};
    doc.querySelectorAll('meta[property],meta[name]').forEach(m => { const k = m.getAttribute('property') || m.getAttribute('name'); const v = m.getAttribute('content'); if (k && v && !meta[k]) meta[k] = v; });
    const links = [...doc.querySelectorAll('a[href]')].map(a => ({ text: a.textContent.trim().slice(0, 60), href: a.href, rel: a.getAttribute('rel') || '' })).filter(l => l.text);
    return {
      doc, title: doc.title || meta['og:title'] || '(no title)',
      desc: meta['description'] || meta['og:description'] || '',
      meta, links, images: [...doc.querySelectorAll('img[src]')].map(i => i.src).slice(0, 40),
      headings: [...doc.querySelectorAll('h1,h2,h3')].map(h => ({ lvl: +h.tagName[1], text: h.textContent.trim().slice(0, 90) })).filter(h => h.text).slice(0, 60),
      text: (doc.body?.textContent || '').replace(/\s+/g, ' ').trim(),
      canonical: meta['og:url'] || doc.querySelector('link[rel=canonical]')?.href || '',
      feeds: [...doc.querySelectorAll('link[rel=alternate][type*="xml"],link[rel=alternate][type*="atom"],link[rel=alternate][type*="rss"]')].map(l => l.href),
      wordCount: (doc.body?.textContent || '').split(/\s+/).filter(Boolean).length,
      hreflang: [...doc.querySelectorAll('link[rel=alternate][hreflang]')].map(l => l.hreflang + ' → ' + l.href)
    };
  }
  function pageTab() {
    const u = urlInput('https://contoh.com/artikel');
    const mode = n.h('div.seg', null, ['ringkasan', 'teks', 'links', 'meta', 'html mentah'].map((m, i) => n.h('button' + (i === 0 ? '.on' : ''), { text: m })));
    const out = n.h('div.col');
    const btn = n.h('button.btn.pri', { text: '🌐 ambil + parse' });
    btn.onclick = async () => {
      out.innerHTML = ''; out.appendChild(n.h('div.skel', { style: { height: '140px' } }));
      let html;
      try { html = await fetchHtml(u.value.trim()); }
      catch (e) {
        out.innerHTML = '';
        out.appendChild(n.h('div.card', null, [
          n.h('b.bad', { text: 'Fetch gagal: ' + e.message }),
          n.h('p.dim.small.mt', { text: 'Ini diharapkan: mayoritas situs tidak mengirim Access-Control-Allow-Origin, jadi browser menolak. Solusi = proxy. Kalau sudah dijalankan, set NAS.CFG.BASE="/api" lalu reload.' }),
          n.h('pre.out.mt', { text: '# terminal 1\ncd neural-ai-studio\nnode server/dev-proxy.mjs\n\n# config.js\nNAS.CFG.BASE = "/api"' })
        ]));
        return;
      }
      const r = parseHtml(html);
      const robots = await fetch(u.value.trim().replace(/\/$/, '') + '/robots.txt').then(x => x.ok ? x.text() : '(no robots.txt)').catch(() => '(tidak bisa dibaca dari browser — lewat proxy)');
      const which = [...mode.children].findIndex(b => b.classList.contains('on'));
      out.innerHTML = '';
      if (which === 0) out.appendChild(summary(r, robots));
      if (which === 1) out.appendChild(n.h('pre.out', { text: r.text.slice(0, 40000) }));
      if (which === 2) out.appendChild(linksTable(r.links));
      if (which === 3) out.appendChild(metaTable(r.meta));
      if (which === 4) out.appendChild(n.h('pre.out', { text: html.slice(0, 60000) }));
      n.store.log('scrape', u.value.slice(0, 60));
    };
    [...mode.children].forEach(b => b.onclick = () => { [...mode.children].forEach(x => x.classList.remove('on')); b.classList.add('on'); btn.click(); });
    function summary(r, robots) {
      const box = n.h('div.col');
      box.appendChild(n.h('div.card', null, [
        n.h('h2', { text: r.title, style: { marginTop: 0 } }),
        r.desc ? n.h('p.dim.small', { text: r.desc }) : null,
        n.h('div.kv.mt', null, [
          n.h('b', { text: 'words' }), n.h('span', { text: String(r.wordCount) }),
          n.h('b', { text: 'links' }), n.h('span', { text: r.links.length + ' anchor' }),
          n.h('b', { text: 'images' }), n.h('span', { text: String(r.images.length) }),
          n.h('b', { text: 'canonical' }), n.h('span.mono.tiny', { text: r.canonical || '—' }),
          n.h('b', { text: 'feeds' }), n.h('span', { html: r.feeds.map(f => '<a href="' + n.esc(f) + '" target="_blank" class="mono tiny">' + n.esc(f) + '</a>').join('<br>') || '—' }),
          n.h('b', { text: 'hreflang' }), n.h('span', { text: r.hreflang.join(' · ') || '—' })
        ]),
        n.h('div.row.mt', null, [n.h('span.badge.pro', { text: 'og:image' }), r.meta['og:image'] ? n.h('img.meta-img', { src: r.meta['og:image'], alt: 'og image' }) : n.h('span.tiny.mute', { text: 'tidak ada' })])
      ]));
      box.appendChild(n.h('div.card', null, [n.h('div.kicker', { text: 'Struktur heading' }), n.h('div.col', { style: { gap: '2px' } }, r.headings.map(h => n.h('div', { style: { paddingLeft: (h.lvl - 1) * 14 + 'px' }, html: '<b class="tiny mono dim">H' + h.lvl + '</b> ' + n.esc(h.text) })))]));
      box.appendChild(n.h('div.card', null, [n.h('div.kicker', { text: 'robots.txt — apa yang situs ini izinkan' }), n.h('pre.out', { text: String(robots).slice(0, 2000) }),
        n.h('p.tiny.mute', { text: 'Hormati Disallow/Crawl-delay. Kalau kamu mau nge-cron halaman ini secara rutin, yang benar: hubungi pemilik situs / pakai API resminya, bukan scrape.' })]));
      return box;
    }
    function linksTable(links) {
      const t = n.h('table.t');
      t.appendChild(n.h('tr', null, ['#', 'teks', 'href', 'rel'].map(x => n.h('th', { text: x }))));
      links.slice(0, 300).forEach((l, i) => t.appendChild(n.h('tr', null, [n.h('td', { text: String(i) }), n.h('td', { text: l.text }), n.h('td.mono.tiny', { text: l.href }), n.h('td.tiny.dim', { text: l.rel })])));
      return n.h('div.card', null, [n.h('div.row.spread', null, [n.h('b.small', { text: links.length + ' link' }), n.h('button.btn.sm', { text: '⤓ csv', onclick: () => n.ui.download(new Blob([n.tools.toCsv(links)], { type: 'text/csv' }), 'links.csv') })]), n.h('div.scroll', { style: { maxHeight: '520px' } }, t)]);
    }
    function metaTable(meta) {
      const keys = Object.keys(meta);
      const t = n.h('table.t');
      t.appendChild(n.h('tr', null, ['key', 'value'].map(x => n.h('th', { text: x }))));
      keys.forEach(k => t.appendChild(n.h('tr', null, [n.h('td.mono.tiny', { text: k }), n.h('td.small', { text: String(meta[k]).slice(0, 220) })])));
      return n.h('div.card', null, [n.h('b.small', { text: keys.length + ' meta tags' }), n.h('div.scroll', { style: { maxHeight: '480px' } }, t)]);
    }
    return n.h('div.col', null, [
      n.h('div.row', null, n.h('div', { style: { flex: 1 } }, u), btn),
      n.h('div.row', null, mode), out
    ]);
  }

  /* ================= 2. public profile ================= */
  function socialTab() {
    const u = urlInput('https://github.com/torvalds  ·  https://repo1.maven.org/maven2/  ·  https://www.gutenberg.org/ebooks/11');
    const note = n.h('p.tiny.mute', { text: 'Yang aman dipakai demo: GitHub (API publik ber-CORS), arsip publik, situs sendiri. Profil IG/TikTok/X TIDAK bisa dibaca tanpa token & melanggar ToS mereka — karena itu tidak dibuat di sini.' });
    const out = n.h('div.col');
    const btn = n.h('button.btn.pri', { text: '👤 ambil profil' });
    btn.onclick = async () => {
      const url = u.value.trim();
      out.innerHTML = ''; out.appendChild(n.h('div.skel', { style: { height: '120px' } }));
      try {
        const gh = url.match(/github\.com\/([\w.-]+)\/?$/i);
        if (gh) {
          const [me, repos] = await Promise.all([
            fetch('https://api.github.com/users/' + gh[1]).then(r => r.json()),
            fetch('https://api.github.com/users/' + gh[1] + '/repos?per_page=100&sort=updated').then(r => r.json())
          ]);
          if (me.message) throw new Error('GitHub: ' + me.message);
          const list = Array.isArray(repos) ? repos : [];
          const top = list.slice().sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 10);
          const langs = {}; list.forEach(r => { if (r.language) langs[r.language] = (langs[r.language] || 0) + 1; });
          out.innerHTML = '';
          out.appendChild(n.h('div.card.grid.g2', null, [
            n.h('div.row', null, [n.h('img', { src: me.avatar_url, alt: 'avatar', style: { width: '72px', height: '72px', borderRadius: '18px', border: '1px solid var(--line)' } }),
              n.h('div.col', null, [n.h('h3', { text: me.name || me.login, style: { margin: 0 } }), n.h('span.dim.small', { text: '@' + me.login }),
              n.h('div.row', null, [n.h('span.chip', { text: '⭐ ' + list.reduce((a, r) => a + r.stargazers_count, 0) }), n.h('span.chip', { text: 'repo ' + me.public_repos }), n.h('span.chip', { text: 'fol ' + me.followers })])])]),
            n.h('div.col', null, [me.bio ? n.h('p.small', { text: me.bio }) : null,
              n.h('pre.out', { text: Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([l, c]) => l.padEnd(16) + '█'.repeat(Math.min(24, c * 2)) + ' ' + c).join('\n') || '(no language data)' })])
          ]));
          const t = n.h('table.t');
          t.appendChild(n.h('tr', null, ['repo', '⭐', 'bahasa', 'update'].map(x => n.h('th', { text: x }))));
          top.forEach(r => t.appendChild(n.h('tr', null, [n.h('td', { html: '<a href="' + r.html_url + '" target="_blank">' + n.esc(r.name) + '</a>' }), n.h('td', { text: r.stargazers_count }), n.h('td', { text: r.language || '—' }), n.h('td.tiny.dim', { text: r.pushed_at?.slice(0, 10) })])));
          out.appendChild(n.h('div.card', null, [n.h('div.kicker', { text: 'top repos' }), t]));
          n.store.log('profile', 'github:' + gh[1]);
          return;
        }
        const html = await fetchHtml(url);
        const r = parseHtml(html);
        out.innerHTML = '';
        out.appendChild(n.h('div.card', null, [n.h('h3', { text: r.title }), n.h('pre.out', { text: r.text.slice(0, 4000) })]));
        note.textContent = 'Halaman ini dibaca lewat proxy/fetch langsung — bukan API terstruktur. Untuk angka engagement (follower, views) butuh API resmi + OAuth.';
      } catch (e) { out.innerHTML = ''; out.appendChild(n.h('div.card', null, [n.h('b.bad', { text: 'Gagal: ' + e.message }), n.h('p.dim.small.mt', { text: 'Coba GitHub public profile (ber-CORS), atau jalankan proxy untuk situs lain.' })])); }
    };
    return n.h('div.col', null, [n.h('div.row', null, n.h('div', { style: { flex: 1 } }, u), btn), note, out]);
  }

  /* ================= 3. trends ================= */
  function trendsTab() {
    const kw = n.h('input.inp', { value: 'ai generator', placeholder: 'kata kunci' });
    const geo = n.h('input.inp', { value: 'ID', placeholder: 'geo', style: { maxWidth: '110px' } });
    const tf = n.h('select.inp', null, ['now 7-d', 'now 1-m', 'now 3-m', 'now 12-m'].map((v, i) => n.h('option', { value: v, text: v, selected: i === 1 })));
    const out = n.h('div.col');
    const btn = n.h('button.btn.pri', { text: '📈 tarik data' });
    btn.onclick = async () => {
      out.innerHTML = '';
      const tryUrls = [
        'https://trends.google.com/trending/rss?geo=' + geo.value.toUpperCase(),
        'https://trends.google.com/trending/rss?geo=' + geo.value.toUpperCase() + '&hl=en'
      ];
      let xml = null, err = '';
      for (const t of tryUrls) {
        try { xml = await fetchHtml(t); break; } catch (e) { err = e.message; }
      }
      if (!xml) {
        out.appendChild(n.h('div.card', null, [n.h('b.bad', { text: 'Google Trends RSS tidak bisa dibaca langsung: ' + err }),
          n.h('p.dim.small.mt', { text: 'Butuh proxy (Google menolak XHR lintas-origin + kadang minta cookie). Alternatif tanpa kunci: Wikipedia Pageviews API (ber-CORS) — sudah disiapin di bawah.' })]));
        wiki(); return;
      }
      const doc = new DOMParser().parseFromString(xml, 'text/xml');
      const items = [...doc.querySelectorAll('item')].map(it => ({
        title: it.querySelector('news\\:title, title')?.textContent || '',
        traffic: it.querySelector('traffic')?.textContent || '',
        geo: it.querySelector('geo\\:traffic_dimension, region')?.textContent || '',
        link: it.querySelector('link')?.textContent || ''
      }));
      const box = n.h('div.card');
      const t = n.h('table.t');
      t.appendChild(n.h('tr', null, ['topik', 'volume', 'link'].map(x => n.h('th', { text: x }))));
      items.forEach((x, i) => t.appendChild(n.h('tr', null, [n.h('td', { text: (i + 1) + '. ' + x.title }), n.h('td.mono', { text: x.traffic }), n.h('td', { html: '<a class="mono tiny" target="_blank" href="' + n.esc(x.link) + '">↗</a>' })])));
      box.append(n.h('div.row.spread', null, [n.h('b.small', { text: 'Google trending · ' + geo.value.toUpperCase() }), n.h('button.btn.sm', { text: '⤓ csv', onclick: () => n.ui.download(new Blob([n.tools.toCsv(items)], { type: 'text/csv' }), 'trends.csv') })]), n.h('div.scroll', null, t));
      out.appendChild(box);
      out.appendChild(matchBox(items, kw.value));
      wiki();
      n.store.log('trends', kw.value);
    };
    function matchBox(items, key) {
      if (!key.trim()) return n.h('div');
      const hits = items.filter(i => (i.title + ' ' + i.geo).toLowerCase().includes(key.toLowerCase()));
      return n.h('div.card', null, [n.h('b.small', { text: hits.length + ' trending cocok dengan "' + key + '"' }),
        n.h('div.row', null, hits.slice(0, 20).map(h => n.h('span.chip', { text: h.title + ' · ' + h.traffic })))]);
    }
    async function wiki() {
      const box = n.h('div.card');
      box.appendChild(n.h('div.kicker', { text: 'alternatif ber-CORS: Wikipedia pageviews' }));
      try {
        const art = encodeURIComponent(kw.value || 'Artificial_intelligence');
        const url = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/' + art + '/monthly/2025010100/2026090100';
        const j = await fetch(url).then(r => r.json());
        const items = j.items || [];
        const max = Math.max(1, ...items.map(i => i.views));
        box.appendChild(items.length ? n.h('div.col', null, items.slice(-14).map(i => n.h('div.row', null, [
          n.h('span.mono.tiny.dim', { text: i.article ? '' : '', style: { width: '74px' } }),
          n.h('span.mono.tiny.dim', { text: i.year + '-' + String(i.month).padStart(2, '0') }),
          n.h('i', { style: { height: '10px', borderRadius: '5px', background: 'var(--grad)', width: (i.views / max * 100) + '%', flex: 'none', minWidth: '2px' } }),
          n.h('span.tiny.dim', { text: i.views.toLocaleString('en-US') })
        ]))) : n.h('p.tiny.mute', { text: 'kosong — artikel dengan nama itu tidak ada' }));
        box.appendChild(n.h('p.tiny.mute', { text: 'Endpoint: ' + url.replace('https://', '') }));
      } catch (e) { box.appendChild(n.h('p.tiny.bad', { text: 'wiki: ' + e.message })); }
      out.appendChild(box);
    }
    return n.h('div.col', null, [n.h('div.row', null, n.h('div', { style: { flex: 1 } }, kw), geo, tf, btn), out]);
  }

  /* ================= 4. competitor compare ================= */
  function compareTab() {
    const a = urlInput('https://stripe.com'); const b = urlInput('https://checkout.com');
    const out = n.h('div.col');
    const btn = n.h('button.btn.pri', { text: '⚖️ bandingkan' });
    btn.onclick = async () => {
      out.innerHTML = ''; out.appendChild(n.h('div.skel', { style: { height: '160px' } }));
      const run = async (u) => {
        try {
          const html = await fetchHtml(u);
          const r = parseHtml(html);
          const words = r.wordCount;
          const perf = { bytes: new Blob([html]).size };
          const ttf = (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || r.title;
          const schema = (html.match(/application\/ld\+json/g) || []).length;
          const h1 = r.headings.filter(h => h.lvl === 1).length;
          const imgs = r.images.length;
          const altOk = 0;
          const social = [...new Set(r.links.map(l => l.href).filter(h => /twitter|x\.com|linkedin|facebook|github|instagram/.test(h)).map(h => new URL(h).hostname))];
          return { url: u, title: ttf, words, bytes: perf.bytes, links: r.links.length, h1, imgs, schema, social, canonical: r.canonical, desc: r.desc, ok: true };
        } catch (e) { return { url: u, ok: false, error: e.message }; }
      };
      const [A, B] = await Promise.all([run(a.value.trim()), run(b.value.trim())]);
      const rows = [
        ['Title', x => x.title], ['Meta description', x => (x.desc || '').slice(0, 120) || '—'], ['Words', x => x.words],
        ['HTML size', x => n.bytes(x.bytes)], ['Internal/external links', x => x.links], ['H1 count', x => x.h1],
        ['Images', x => x.imgs], ['JSON-LD blocks', x => x.schema], ['Canonical', x => x.canonical || '—'],
        ['Social profiles', x => x.social.join(', ') || '—']
      ];
      const t = n.h('table.t');
      t.appendChild(n.h('tr', null, [n.h('th', { text: 'sinyal' }), n.h('th', { text: A.ok ? A.url : 'error' }), n.h('th', { text: B.ok ? B.url : 'error' }), n.h('th', { text: 'advantage' })]));
      rows.forEach(([label, fn]) => {
        const va = A.ok ? fn(A) : '—', vb = B.ok ? fn(B) : '—';
        let adv = '—';
        if (A.ok && B.ok && typeof va === 'number' && typeof vb === 'number') adv = va === vb ? 'seri' : (va > vb ? 'A' : 'B');
        t.appendChild(n.h('tr', null, [n.h('td.mono.tiny', { text: label }), n.h('td.small', { text: String(va) }), n.h('td.small', { text: String(vb) }), n.h('td', { text: adv })]));
      });
      out.innerHTML = '';
      out.appendChild(n.h('div.card', null, [n.h('div.row.spread', null, [n.h('b.small', { text: 'on-page snapshot' }), n.h('button.btn.sm', { text: '⤓ json', onclick: () => n.ui.download(new Blob([JSON.stringify([A, B], null, 2)], { type: 'application/json' }), 'compare.json') })]), t,
        (!A.ok || !B.ok) ? n.h('p.tiny.warn.mt', { text: 'Salah satu gagal: ' + (!A.ok ? A.error : B.error) + ' — biasanya butuh proxy.' }) : n.h('p.tiny.mute.mt', { text: 'Snapshot on-page saja (HTML publik). Core Web Vitals butuh CrUX API / Lighthouse di server: /api/lighthouse?url=' })]));
      const score = (() => {
        if (!A.ok || !B.ok) return null;
        const a2 = 12 * Math.log(Math.max(1, A.words)) + 2 * A.schema + 4 * (A.desc ? 1 : 0) + (A.h1 === 1 ? 3 : 0) + Math.log(Math.max(1, A.links));
        const b2 = 12 * Math.log(Math.max(1, B.words)) + 2 * B.schema + 4 * (B.desc ? 1 : 0) + (B.h1 === 1 ? 3 : 0) + Math.log(Math.max(1, B.links));
        return n.h('div.card', null, [n.h('b.small', { text: 'SEO-ish heuristic: ' + (a2 > b2 ? 'A menang' : a2 < b2 ? 'B menang' : 'seri') }), n.h('div.tiny.mute', { text: 'skor mentah A ' + a2.toFixed(1) + ' · B ' + b2.toFixed(1) + ' — bobotnya asal-asalan, pakai buat diskusi bukan laporan klien.' })]);
      })();
      if (score) out.appendChild(score);
      n.store.log('compare', A.url + ' vs ' + B.url);
    };
    return n.h('div.col', null, [n.h('div.row', null, n.h('div', { style: { flex: 1 } }, labeled('A', a)), n.h('div', { style: { flex: 1 } }, labeled('B', b)), btn),
      n.h('p.tiny.mute', { text: 'Yang TIDAK dicomot: harga login-walled, dashboard kompetitor di balik auth, atau data pribadi. Itu bukan "scraper feature", itu akses ilegal.' }), out]);
    function labeled(l, el) { return n.h('div', null, [n.h('label.fl', { text: l }), el]); }
  }

  /* ================= 5. regex extractor ================= */
  function extractTab() {
    const src = n.h('textarea.inp', { rows: 8, value: '<a href="/blog/a">A</a>\nprice: 1.250.000\nemail: budi@mail.co.id, sari@mail.co.id\nSKU-9931 SKU-1122\n2026-09-02' });
    const presets = [
      ['email', '[\\w.+-]+@[\\w-]+\\.[\\w.]{2,}', 'gi'],
      ['url', 'https?://[^\\s"\'<>]+', 'gi'],
      ['angka rp', '(?:Rp|IDR)?\\s?[\\d.]{4,}', 'gi'],
      ['href atribut', 'href="([^"]+)"', 'g'],
      ['sku', '\\bSKU-\\d{4}\\b', 'g'],
      ['tanggal iso', '\\d{4}-\\d{2}-\\d{2}', 'g'],
      ['tag html', '<([a-z0-9]+)[^>]*>', 'gi']
    ];
    const pat = n.h('input.inp', { value: presets[0][1] });
    const fl = n.h('input.inp', { value: 'gi', style: { maxWidth: '90px' } });
    const out = n.h('div.col');
    const go = () => {
      try {
        const r = n.tools.regexTest(pat.value, fl.value.replace(/[^gimsuy]/g, ''), src.value);
        const vals = r.hits.map(x => x.groups?.length ? x.groups[0] : x.match);
        const uniq = [...new Set(vals)];
        out.innerHTML = '';
        const list = n.h('div.col', { style: { gap: '2px', maxHeight: '300px', overflow: 'auto' } });
        uniq.forEach(v => list.appendChild(n.h('div.item', null, [
          n.h('span.nm.mono.tiny', { text: String(v).slice(0, 120) }),
          n.h('span.d', { text: vals.filter(z => z === v).length + '×' })
        ])));
        out.append(
          n.h('div.row.spread', null, [
            n.h('b.small', { text: r.count + ' match · ' + uniq.length + ' unik' }),
            n.h('div.row', null, [
              n.h('button.btn.sm', { text: '⤓ csv', onclick: () => n.ui.download(new Blob([uniq.join('\n')], { type: 'text/csv' }), 'extract.csv') }),
              n.h('button.btn.sm', { text: '⤓ json', onclick: () => n.ui.download(new Blob([JSON.stringify(r.hits, null, 2)], { type: 'application/json' }), 'extract.json') })
            ])
          ]),
          list
        );
        n.store.log('extract', pat.value.slice(0, 40));
      } catch (e) { out.innerHTML = ''; out.appendChild(n.h('p.bad.small', { text: e.message })); }
    };
    return n.h('div.col', null, [
      n.h('div.row', { style: { gap: '6px' } }, presets.map(([t, p, f]) => n.h('button.chip', { text: t, onclick: () => { pat.value = p; fl.value = f; go(); } }))),
      n.h('div.row', null, n.h('div', { style: { flex: 1 } }, pat), n.h('div', null, fl), n.h('button.btn.sm.pri', { text: '✂️ jalankan', onclick: go })),
      n.h('div', null, n.h('label.fl', { text: 'teks sumber' }), src), out]);
  }

  /* ================= 6. sitemap / RSS ================= */
  function sitemapTab() {
    const u = urlInput('https://example.com');
    const out = n.h('div.col');
    const btn = n.h('button.btn.pri', { text: '🗺 scan' });
    btn.onclick = async () => {
      out.innerHTML = ''; out.appendChild(n.h('div.skel', { style: { height: '120px' } }));
      const base = u.value.trim().replace(/\/$/, '');
      const results = [];
      for (const p of ['/sitemap.xml', '/robots.txt', '/rss.xml', '/feed', '/atom.xml', '/index.xml']) {
        try { const html = await fetchHtml(base + p); results.push({ p, ok: true, html }); } catch (e) { results.push({ p, ok: false, error: e.message }); }
      }
      out.innerHTML = '';
      results.forEach(r => {
        const card = n.h('div.card.col');
        card.appendChild(n.h('div.row.spread', null, [n.h('b.mono.small', { text: base + r.p }), r.ok ? n.h('span.badge.pro', { text: 'ada' }) : n.h('span.badge.free', { text: 'gagal' })]));
        if (r.ok) {
          if (/xml/.test(r.html.slice(0, 200)) || /<urlset|<sitemapindex|<rss|<feed/.test(r.html)) {
            const doc = new DOMParser().parseFromString(r.html, 'application/xml');
            const locs = [...doc.querySelectorAll('loc')].map(x => x.textContent.trim());
            const items = [...doc.querySelectorAll('item,entry')].map(it => ({ title: it.querySelector('title')?.textContent || '', date: (it.querySelector('pubDate,published,updated')?.textContent || '').slice(0, 10), link: it.querySelector('link')?.textContent || it.querySelector('link')?.getAttribute('href') || '' }));
            const list = items.length ? items.slice(0, 40).map(i => n.h('div.item', null, [n.h('span.nm', { text: i.title || i.link }), n.h('span.d', { text: i.date }), n.h('a.tiny.mono', { href: i.link, target: '_blank', text: '↗' })])) : locs.slice(0, 40).map(l => n.h('div.item', null, n.h('a.nm.mono.tiny', { href: l, target: '_blank', text: l })));
            card.append(n.h('p.tiny.dim', { text: (locs.length || items.length) + ' entri' }), n.h('div.list', null, list),
              n.h('button.btn.sm', { text: '⤓ semua url (csv)', onclick: () => n.ui.download(new Blob([(locs.length ? locs : items.map(i => i.link)).join('\n')], { type: 'text/csv' }), 'urls.csv') }));
          } else card.appendChild(n.h('pre.out', { text: r.html.slice(0, 3000) }));
        } else card.appendChild(n.h('p.tiny.bad', { text: r.error }));
        out.appendChild(card);
      });
      n.store.log('sitemap', base);
    };
    return n.h('div.col', null, [n.h('div.row', null, n.h('div', { style: { flex: 1 } }, u), btn),
      n.h('p.tiny.mute', { text: 'Cuma ngecek jalur publik standar (sitemap/robots/feed). Jumlah request sengaja kecil (5) — jangan dipakai buat brute-force path situs orang.' }), out]);
  }
})();
