/* NEURAL AI STUDIO — UI kit: DOM builder, markdown, toasts, modal, cursor trail,
   particle network, stat simulation (WebSocket-shaped so a real Socket.io drop-in is ~20 lines). */
(function (n) {
  /* ---------------- tiny DOM ---------------- */
  n.h = function (tag, attrs, kids) {
    /* CSS-ish shorthand: 'div.card.tool#id' → tag/classes/id. Split on the *delimiters* so
       'div#tools' (no dot) still yields an id — an earlier regex split lost it and every
       '#id' selector in the app silently matched nothing. */
    const spec = String(tag);
    const tm = spec.match(/^[a-zA-Z][\w-]*/);
    const e = document.createElement(tm ? tm[0] : 'div');
    const cls = [];
    for (const m of spec.matchAll(/([.#])([\w-]+)/g)) { if (m[1] === '#') e.id = m[2]; else cls.push(m[2]); }
    if (cls.length) e.className = cls.join(' ');
    for (const k in (attrs || {})) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className += ' ' + v;
      else if (k === 'id') e.id = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'value') e.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected') e[k] = !!v;
      else e.setAttribute(k, v);
    }
    n.append(e, kids);
    return e;
  };
  n.append = function (e, kids) {
    if (kids == null) return e;
    (Array.isArray(kids) ? kids : [kids]).forEach(k => {
      if (k == null || k === false) return;
      if (Array.isArray(k)) return n.append(e, k);     // IIFE / map() may return an array of kids
      if (typeof k === 'object') return e.appendChild(k);
      e.appendChild(document.createTextNode(String(k)));
    });
    return e;
  };
  n.$ = (s, r) => (r || document).querySelector(s);
  n.$$ = (s, r) => [...(r || document).querySelectorAll(s)];
  n.esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------------- markdown (no CDN, XSS-safe: escaped before any HTML is built) ---------------- */
  n.md = function (src) {
    const E = n.esc;
    const lines = String(src).replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let i = 0, para = [], list = null, quote = [];
    const flushPara = () => { if (para.length) { out.push('<p>' + para.map(inline).join('<br>') + '</p>'); para = []; } };
    const flushList = () => { if (list) { out.push('<' + list.tag + '>' + list.items.map(x => '<li>' + inline(x) + '</li>').join('') + '</' + list.tag + '>'); list = null; } };
    const flushQuote = () => { if (quote.length) { out.push('<blockquote>' + quote.map(inline).join('<br>') + '</blockquote>'); quote = []; } };
    function inline(s) {
      s = E(s);
      s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
      s = s.replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, '<img alt="$1" src="$2" loading="lazy">');
      s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
      s = s.replace(/(^|[\s(])((?:https?:\/\/)[^\s<)"']+)/g, (_, p, u) => p + '<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + u + '</a>');
      s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/(^|[\s(*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
      s = s.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
      return s;
    }
    while (i < lines.length) {
      const L = lines[i];
      /* fenced code */
      const f = L.match(/^\s*```(\S*)\s*$/);
      if (f) {
        flushPara(); flushList(); flushQuote();
        const buf = []; i++;
        while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++;
        out.push('<pre><button class="btn sm gho copyc" data-copy>Copy</button><code data-lang="' + E(f[1]) + '">' + E(buf.join('\n')) + '</code></pre>');
        continue;
      }
      /* table */
      if (/\|/.test(L) && i + 1 < lines.length && /^\s*\|?[\s:|-]{3,}\|[\s:|-]*$/.test(lines[i + 1])) {
        flushPara(); flushList(); flushQuote();
        const cells = (r) => r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
        const head = cells(L); i += 2;
        const rows = [];
        while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim()) { rows.push(cells(lines[i])); i++; }
        out.push('<table><thead><tr>' + head.map(h => '<th>' + inline(h) + '</th>').join('') + '</tr></thead><tbody>'
          + rows.map(r => '<tr>' + r.map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table>');
        continue;
      }
      const hd = L.match(/^(#{1,6})\s+(.*)$/);
      if (hd) { flushPara(); flushList(); flushQuote(); out.push('<h' + Math.min(3, hd[1].length) + '>' + inline(hd[2]) + '</h' + Math.min(3, hd[1].length) + '>'); i++; continue; }
      if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(L)) { flushPara(); flushList(); flushQuote(); out.push('<hr>'); i++; continue; }
      const bq = L.match(/^\s*>\s?(.*)$/);
      if (bq) { flushPara(); flushList(); quote.push(bq[1]); i++; continue; }
      const ul = L.match(/^\s*[-*•+]\s+(.*)$/);
      const ol = L.match(/^\s*(\d+)[.)]\s+(.*)$/);
      if (ul || ol) {
        flushPara(); flushQuote();
        const tag = ul ? 'ul' : 'ol';
        if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
        list.items.push(ul ? ul[1] : ol[2]); i++; continue;
      }
      if (!L.trim()) { flushPara(); flushList(); flushQuote(); i++; continue; }
      flushList(); flushQuote(); para.push(L.replace(/^\s+/, '')); i++;
    }
    flushPara(); flushList(); flushQuote();
    return out.join('\n');
  };


  /* ---------------- feedback ---------------- */
  n.ui = {};
  n.ui.toast = function (msg, kind, ms) {
    const host = document.getElementById('toasts') || document.body.appendChild(n.h('div', { id: 'toasts' }));
    const t = n.h('div.toast' + (kind ? '.' + kind : ''), { text: msg });
    host.appendChild(t);
    setTimeout(() => { t.style.transition = '.3s'; t.style.opacity = '0'; t.style.transform = 'translateX(20px)'; setTimeout(() => t.remove(), 320); }, ms || 3800);
    return t;
  };
  n.ui.copy = async function (txt, label) {
    try { await navigator.clipboard.writeText(txt); n.ui.toast((label || 'Disalin') + ' ✓', 'ok', 1600); }
    catch (e) {
      const ta = n.h('textarea', { value: txt, style: { position: 'fixed', opacity: '0' } });
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      n.ui.toast((label || 'Disalin') + ' ✓', 'ok', 1600);
    }
  };
  n.ui.download = function (blobOrUrl, name) {
    const a = n.h('a', { href: typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl), download: name });
    if (typeof blobOrUrl !== 'string') a.target = '_blank';
    document.body.appendChild(a); a.click(); a.remove();
    if (typeof blobOrUrl !== 'string') setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  n.ui.modal = function (opts) {
    const box = n.h('div.box', null, [
      n.h('div.mh', null, [n.h('h3', { text: opts.title || '' }), n.h('button.btn.sm.gho', { text: '✕', onclick: close })]),
      typeof opts.body === 'function' ? opts.body(close) : opts.body,
      opts.footer && n.h('div.row.mt', { style: { justifyContent: 'flex-end' } }, opts.footer)
    ]);
    const bg = n.h('div.modal', { onclick: (e) => { if (e.target === bg) close(); } }, box);
    function close() { bg.remove(); opts.onClose && opts.onClose(); }
    document.body.appendChild(bg);
    return { el: bg, close, box };
  };
  n.ui.confirm = (msg, onYes, danger) => n.ui.modal({
    title: 'Konfirmasi',
    body: n.h('p.dim', { text: msg }),
    footer: [n.h('button.btn.gho', { text: 'Batal', onclick: () => { document.querySelector('.modal').remove(); } }),
             n.h('button.btn' + (danger ? '.dgr' : '.pri'), { text: 'Lanjut', onclick: () => { document.querySelector('.modal').remove(); onYes(); } })]
  });

  /* ---------------- status pill: are the provider keys reachable? ---------------- */
  n.ui.health = async function (el) {
    const probe = async () => {
      const out = {};
      await Promise.all(['groq', 'gemini', 'nvidia'].map(async (p) => {
        try {
          const base = n.CFG.PROVIDERS[p].base;
          const url = p === 'gemini' ? base + '/models?pageSize=1' : base + '/models';
          const r = await fetch(url, { headers: { Authorization: 'Bearer ' + n.CFG.KEYS[p === 'gemini' ? 'gemini' : p] } });
          out[p] = r.ok ? { ok: true, code: r.status } : { ok: false, code: r.status };
        } catch (e) { out[p] = { ok: false, code: e.name }; }
      }));
      return out;
    };
    const render = (h) => {
      el.innerHTML = '';
      el.appendChild(n.h('span.tiny.dim', { text: 'Provider status (live ping):' }));
      for (const p in h) el.appendChild(n.h('span.chip', null, [
        n.h('i.live', { style: { background: h[p].ok ? 'var(--lm)' : 'var(--rd)', boxShadow: '0 0 8px currentColor' } }),
        n.CFG.PROVIDERS[p].name, n.h('b.mono.tiny.dim', { text: h[p].ok ? '200' : String(h[p].code) })
      ]));
    };
    render({ groq: { ok: null, code: '…' }, gemini: { ok: null, code: '…' }, nvidia: { ok: null, code: '…' } });
    probe().then(render);
    el.onclick = () => probe().then(render);
    el.style.cursor = 'pointer';
  };

  /* ---------------- shared nav ---------------- */
  const NAV = [
    ['index.html', 'Home', '⌂'], ['chat.html', 'AI Chat', '◈'], ['image.html', 'Image Lab', '❖'],
    ['photo.html', 'Photo Studio', '❡'], ['media.html', 'Media', '⇩'], ['convert.html', 'Convert', '⇋'],
    ['tools.html', 'Tools', '⚙'],
    ['scrape.html', 'Data & Scrape', '◱'], ['account.html', 'Account', '◐'], ['admin.html', 'Admin', '⛨']
  ];
  n.ui.nav = function (active) {
    const s = n.store.settings.get();
    const me = n.auth.me();
    const links = NAV.map(([href, label]) => n.h('a' + (href === active ? '.on' : ''), { href, text: label }));
    const burger = n.h('button.burger', { text: '≡' });
    const list = n.h('nav.nlinks', null, links);
    burger.onclick = () => list.classList.toggle('open');
    const userBtn = me
      ? n.h('button.btn.sm.gho', { title: n.esc(me.email), html: '<span class="mono tiny">' + n.esc(me.email.split('@')[0]) + '</span><span class="badge ' + (me.role === 'admin' ? 'adm' : me.tier) + '">' + (me.role === 'admin' ? 'admin' : me.tier) + '</span>' })
      : n.h('a.btn.sm', { href: 'account.html', text: 'Login' });
    userBtn.onclick = () => { if (me) { n.auth.logout(); location.href = 'index.html'; } };
    const theme = n.h('button.btn.sm.gho', { text: s.theme === 'dark' ? '☾' : '☀', title: 'Toggle theme' });
    theme.onclick = () => { n.ui.theme(s.theme === 'dark' ? 'light' : 'dark'); location.reload(); };
    return n.h('div', null, [
      n.h('header.nav', null, n.h('div.wrap', null, [
        n.h('a.brand', { href: 'index.html' }, [n.h('span.mark'), n.h('span', { html: 'NEURAL<b class="grad-txt">AI</b>' })]),
        burger, list,
        n.h('div.navright', null, [
          n.h('span.pill.hide-mobile', { id: 'quotaPill' }), theme, userBtn
        ])
      ]))
    ]);
  };
  n.ui.quotaPill = function () {
    const el = n.$('#quotaPill'); if (!el) return;
    const u = n.store.usage(); const me = n.auth.me();
    const lim = me ? (n.CFG.QUOTA[me.tier] ?? 100) : 100;
    const pct = lim === Infinity ? 0 : Math.min(100, Math.round(u.n / lim * 100));
    el.innerHTML = '';
    el.appendChild(n.h('span', { html: '<b>' + u.n + '</b> / ' + (lim === Infinity ? '∞' : lim) + ' req' }));
    if (lim !== Infinity) el.appendChild(n.h('i', { style: { width: '34px', height: '3px', borderRadius: '9px', background: 'var(--line)', position: 'relative', display: 'inline-block' } , title: pct + '%' }));
    if (lim !== Infinity) el.lastChild.appendChild(n.h('i', { style: { position: 'absolute', inset: '0 auto 0 0', width: pct + '%', background: pct > 85 ? 'var(--rd)' : 'var(--lm)', borderRadius: '9px' } }));
  };
  n.ui.theme = (t) => { n.store.settings.set({ theme: t }); document.documentElement.dataset.theme = t; };
  n.ui.foot = function () {
    return n.h('footer.foot', null, n.h('div.wrap.col', { style: { gap: '6px' } }, [
      n.h('div.row.spread', null, [
        n.h('div.row', null, NAV.slice(0, 8).map(([h, l]) => n.h('a.small.dim', { href: h, text: l }))),
        n.h('div.row', null, [n.h('span.badge.pro', { text: 'demo build' })])
      ]),
      n.h('p.tiny', { text: 'NEURAL AI STUDIO v' + n.CFG.VERSION + ' · build ' + n.CFG.BUILD + ' · frontend-only demo + Next.js migration scaffold. Bukan produk jadi — lihat README untuk status tiap fitur.' })
    ]));
  };

  /* ---------------- page mount ---------------- */
  n.ui.mount = function (opts) {
    const b = document.body;
    b.dataset.page = opts.page;
    b.prepend(n.ui.nav(opts.page + '.html'));
    if (opts.footer) b.appendChild(n.ui.foot());
    const s = n.store.settings.get();
    document.documentElement.dataset.theme = s.theme;
    n.ui.quotaPill();
    if (s.cursor && matchMedia('(pointer:fine)').matches) n.ui.cursorTrail();
    if (opts.motion !== false) b.classList.add('fade');
    if (!n.store.persisted) n.ui.toast('localStorage diblokir — data tidak tersimpan antar reload.', 'warn', 5200);
    document.addEventListener('click', e => {
      const b = e.target.closest('[data-copy]'); if (!b) return;
      const pre = b.closest('pre'); const code = pre && pre.querySelector('code');
      if (code) n.ui.copy(code.textContent, 'Code');
    });
    return b;
  };

  /* ---------------- neon cursor trail ---------------- */
  n.ui.cursorTrail = function () {
    const layer = document.createElement('div');
    Object.assign(layer.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '9998' });
    document.body.appendChild(layer);
    const N = 9, dots = [];
    for (let i = 0; i < N; i++) {
      const d = n.h('div.cursor-dot');
      d.style.opacity = String(1 - i / N); d.style.transform = 'scale(' + (1 - i / (N * 1.4)) + ')';
      if (i % 3 === 1) d.style.background = 'var(--vi)'; if (i % 3 === 2) d.style.background = 'var(--mg)';
      layer.appendChild(d); dots.push(d);
    }
    let mx = -100, my = -100, px = mx, py = my, raf = 0;
    addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; if (!raf) loop(); }, { passive: true });
    addEventListener('pointerdown', () => dots.forEach(d => d.style.boxShadow = '0 0 22px currentColor'), { passive: true });
    addEventListener('pointerup', () => dots.forEach(d => d.style.boxShadow = '0 0 12px currentColor'), { passive: true });
    function loop() {
      px += (mx - px) * .35; py += (my - py) * .35;
      dots[0].style.left = px + 'px'; dots[0].style.top = py + 'px';
      for (let i = 1; i < N; i++) {
        const a = dots[i - 1], b = dots[i];
        const x = parseFloat(a.style.left) || 0, y = parseFloat(a.style.top) || 0;
        const cx = parseFloat(b.style.left) || 0, cy = parseFloat(b.style.top) || 0;
        b.style.left = (cx + (x - cx) * .4) + 'px'; b.style.top = (cy + (y - cy) * .4) + 'px';
      }
      raf = (Math.abs(mx - px) > .4 || Math.abs(my - py) > .4) ? requestAnimationFrame(loop) : 0;
    }
  };

  /* ---------------- particle network hero ---------------- */
  n.ui.particles = function (canvas, opts) {
    opts = opts || {};
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, pts = [], raf = 0, mouse = { x: -9e9, y: -9e9 }, dead = false;
    const DPR = Math.min(2, devicePixelRatio || 1);
    function size() {
      const r = canvas.getBoundingClientRect();
      W = canvas.width = Math.max(320, r.width) * DPR; H = canvas.height = Math.max(240, r.height) * DPR;
      const target = opts.density ? opts.density : Math.round((r.width * r.height) / 12000);
      pts = Array.from({ length: Math.max(28, Math.min(150, target)) }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - .5) * .22 * DPR, vy: (Math.random() - .5) * .22 * DPR,
        r: (Math.random() * 1.6 + .5) * DPR, hue: Math.random() < .5 ? 188 : Math.random() < .7 ? 276 : 330
      }));
    }
    const DIST = 118 * DPR;
    function frame() {
      if (dead) return;
      ctx.clearRect(0, 0, W, H);
      for (const p of pts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1; if (p.y < 0 || p.y > H) p.vy *= -1;
        const dx = p.x - mouse.x, dy = p.y - mouse.y, dm = Math.hypot(dx, dy);
        if (dm < 150 * DPR) { p.x += dx / dm * .6; p.y += dy / dm * .6; }
      }
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i], b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < DIST) {
            ctx.strokeStyle = 'hsla(' + ((a.hue + b.hue) / 2) + ',90%,65%,' + (.34 * (1 - d / DIST)) + ')';
            ctx.lineWidth = DPR * .7; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }
      for (const p of pts) {
        ctx.fillStyle = 'hsla(' + p.hue + ',95%,70%,.9)';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    }
    size(); frame();
    addEventListener('resize', size, { passive: true });
    canvas.parentElement.addEventListener('pointermove', e => {
      const r = canvas.getBoundingClientRect(); mouse.x = (e.clientX - r.left) * DPR; mouse.y = (e.clientY - r.top) * DPR;
    }, { passive: true });
    canvas.parentElement.addEventListener('pointerleave', () => { mouse.x = mouse.y = -9e9; });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else if (!raf && !dead) frame();
    });
    return { stop() { dead = true; cancelAnimationFrame(raf); }, size };
  };

  /* ---------------- "live stats": same shape as Socket.io ---------------- */
  /* Swap for: const io = require('socket.io-client'); socket.on('stats', render)  — the
     contract is a single {chats,images,users} payload pushed on every DB insert. */
  n.ui.liveStats = function (el, seed) {
    let v = Object.assign({ chats: 12480, images: 6712, users: 341, uptime: 99.98 }, seed);
    const cells = {};
    el.innerHTML = '';
    [['chats', 'Chat diproses'], ['images', 'Image generated'], ['users', 'User aktif sekarang'], ['uptime', 'Uptime %']].forEach(([k, label], i) => {
      const b = n.h('b', { text: '0' });
      cells[k] = b;
      el.appendChild(n.h('div.stat', null, [n.h('i'), n.h('span', { text: label }), b]));
      let from = 0; const to = v[k]; const t0 = performance.now();
      (function tick() {
        const p = Math.min(1, (performance.now() - t0) / (900 + i * 180));
        const ease = 1 - Math.pow(1 - p, 3);
        b.textContent = k === 'uptime' ? (from + (to - from) * ease).toFixed(2) : Math.round(from + (to - from) * ease).toLocaleString('id-ID');
        if (p < 1) requestAnimationFrame(tick);
      })();
    });
    const local = { chats: n.store.threads.all().reduce((a, t) => a + (t.messages || []).length, 0), images: n.store.images.all().length };
    v.chats += local.chats; v.images += local.images;
    cells.chats.textContent = v.chats.toLocaleString('id-ID'); cells.images.textContent = v.images.toLocaleString('id-ID');
    const timer = setInterval(() => {
      v.chats += Math.random() < .55 ? 1 : 0; v.images += Math.random() < .28 ? 1 : 0;
      v.users += Math.random() < .5 ? 1 : -1; v.users = Math.max(180, v.users);
      cells.chats.textContent = v.chats.toLocaleString('id-ID');
      cells.images.textContent = v.images.toLocaleString('id-ID');
      cells.users.textContent = v.users.toLocaleString('id-ID');
    }, 2600);
    return { stop: () => clearInterval(timer) };
  };

  /* ---------------- misc ---------------- */
  n.ui.tabbed = function (host, tabs, onChange) {
    const bar = n.h('div.tabs'), panes = {};
    tabs.forEach((t, i) => {
      const btn = n.h('button' + (i === 0 ? '.on' : ''), { text: t.label, onclick: () => go(t.id) });
      bar.appendChild(btn);
      panes[t.id] = n.h('div.toolpane.hide');
      host.appendChild(panes[t.id]);
      btn.dataset.id = t.id;
    });
    host.prepend(bar);
    function go(id) {
      [...bar.children].forEach(b => b.classList.toggle('on', b.dataset.id === id));
      tabs.forEach(t => panes[t.id].classList.toggle('hide', t.id !== id));
      if (!panes[id].dataset.built) { panes[id].appendChild(tabs.find(t => t.id === id).render(panes[id])); panes[id].dataset.built = '1'; }
      onChange && onChange(id);
    }
    go(tabs[0].id);
    return { go, panes };
  };
  n.ui.tilt3d = function (el) {
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      el.style.transform = 'perspective(900px) rotateY(' + (x * 9) + 'deg) rotateX(' + (-y * 9) + 'deg) translateY(-4px)';
      el.style.transition = 'transform .06s';
    });
    el.addEventListener('pointerleave', () => { el.style.transition = '.5s cubic-bezier(.2,.8,.2,1)'; el.style.transform = ''; });
  };
  n.ui.typing = function (el, lines, speed) {
    let li = 0, ci = 0, del = false;
    const cur = n.h('span.cursor-blink', { html: '&nbsp;' });
    el.innerHTML = ''; const span = n.h('span', { text: '' }); el.append(span, cur);
    (function step() {
      const full = lines[li % lines.length];
      span.textContent = full.slice(0, ci);
      if (!del && ci < full.length) { ci++; setTimeout(step, speed || 48); }
      else if (!del) { del = true; setTimeout(step, 1500); }
      else if (ci > 0) { ci -= 2; setTimeout(step, 22); }
      else { del = false; li++; setTimeout(step, 220); }
    })();
  };
  n.ui.progress = function (el, p, label) {
    el.innerHTML = '';
    el.appendChild(n.h('div', { style: { height: '6px', borderRadius: '99px', background: 'var(--line)', overflow: 'hidden' } },
      n.h('i', { style: { display: 'block', height: '100%', width: Math.round(Math.max(0, Math.min(1, p)) * 100) + '%', background: 'var(--grad)', transition: '.25s' } })));
    if (label) el.appendChild(n.h('div.tiny.dim', { text: label }));
  };
  window.NAS = n;
})(window.NAS);
