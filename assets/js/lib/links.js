/* NEURAL AI STUDIO — link intelligence layer.
   WHAT THIS IS: platform detection, short-link resolution, official oEmbed lookups, and
   open-metadata previews. All of that is public, documented, and ToS-clean.
   WHAT THIS IS NOT: a media ripper. Pulling the video file out of TikTok/IG/YT bypasses those
   platforms' terms, needs an unofficial endpoint that breaks weekly, and is exactly why the bot
   in ourin-md is full of hardcoded third-party mirrors (tikwm.com, savett.cc, izuka-api.xyz).
   Those mirrors are the actual liability: they re-host content, and any of them can be reading
   your users' target URLs. So this module identifies + previews + hands off, and the *file*
   step lives behind one clearly-marked server adapter you fill in yourself. */
(function (n) {
  const HOST = {
    tiktok: /(?:^|\.)(?:[a-z]{2}\.)?tiktok\.com$/i,
    tiktokHost: /tiktok\.com$/i,
    instagram: /instagram\.com$|^ig\.me$/i,
    youtube: /(?:^|\.)(?:youtube\.com|youtu\.be|youtube-nocookie\.com|m\.youtube\.com)$/i,
    twitter: /(?:^|\.)(?:twitter\.com|x\.com|fxtwitter\.com|vxtwitter\.com|fixupx\.com)$/i,
    facebook: /(?:^|\.)(?:facebook\.com|fb\.watch|m\.facebook\.com)$/i,
    pinterest: /(?:^|\.)(?:pinterest\.[a-z.]+|pin\.it)$/i,
    reddit: /(?:^|\.)(?:reddit\.com|redd\.it|v\.redd\.it)$/i,
    spotify: /(?:^|\.)spotify\.com$/i,
    soundcloud: /(?:^|\.)soundcloud\.com$/i,
    capcut: /(?:^|\.)capcut\.com$/i,
threads: /(?:^|\.)threads\.(?:net|com)$/i,
    youtubeShort: /^youtu\.be$/i,
    twitch: /(?:^|\.)twitch\.tv$/i,
    vimeo: /(?:^|\.)vimeo\.com$/i
  };

  const LABEL = {
    tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube', twitter: 'X / Twitter',
    facebook: 'Facebook', pinterest: 'Pinterest', reddit: 'Reddit', spotify: 'Spotify',
    soundcloud: 'SoundCloud', capcut: 'CapCut', threads: 'Threads', twitch: 'Twitch', vimeo: 'Vimeo'
  };

  n.links = {};

  n.links.parse = function (input) {
    const raw = String(input || '').trim();
    let u;
    try { u = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw); }
    catch (e) { return { ok: false, error: 'Bukan URL yang valid.', raw }; }
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname)) return { ok: false, error: 'Host "' + u.hostname + '" bukan domain (titik + TTD required).', raw };
    const host = u.hostname.replace(/^www\./i, '');
    const platform = Object.keys(HOST).find(k => k !== 'tiktokHost' && k !== 'youtubeShort' && HOST[k].test(host)) || 'web';
    const out = { ok: true, url: u.href, protocol: u.protocol, host, platform, label: LABEL[platform] || host, path: u.pathname, query: Object.fromEntries(u.searchParams), id: null, kind: null, user: null, extra: {} };

    const p = u.pathname.replace(/\/+$/, '');
    if (platform === 'tiktok') {
      const vid = p.match(/^\/@([^/]+)\/video\/(\d+)/i);
      const short = p.match(/^\/(?:(vm|t)\/)?([A-Za-z0-9_]{6,})\/?$/i);
      const prof = p.match(/^\/@([^/]+)(?:\/(.*))?$/i);
      if (vid) { out.user = vid[1]; out.id = vid[2]; out.kind = 'video'; }
      else if (prof) { out.user = prof[1]; out.kind = 'profile'; if (prof[2]) out.extra.tail = prof[2]; }
      else if (short) { out.kind = 'shortlink'; out.id = short[2]; out.extra.shortKind = short[1] || (out.host.startsWith('vt.') || out.host.startsWith('vm.') ? 'vt' : 'unknown'); }
    } else if (platform === 'instagram') {
      const m = p.match(/^\/(p|reel|reels|tv|stories)\/([^/]+)(?:\/([^/]+))?/i);
      if (m) { out.kind = m[1].toLowerCase() === 'stories' ? 'story' : m[1].toLowerCase(); out.id = m[2]; out.user = decodeURIComponent(m[3] || ''); }
      else { const m2 = p.match(/^\/([^/]+)\/?$/i); if (m2 && !['accounts', 'explore', 'direct'].includes(m2[1])) { out.kind = 'profile'; out.user = m2[1]; } }
    } else if (platform === 'youtube') {
      if (host === 'youtu.be') { out.kind = 'video'; out.id = p.slice(1).split('/')[0]; }
      else {
        const v = u.searchParams.get('v');
        const m = p.match(/^\/(?:shorts|embed|live|v)\/([\w-]+)/);
        const pl = p.match(/^\/playlist$/);
        if (v) { out.kind = 'video'; out.id = v; }
        else if (m) { out.kind = m[0].includes('shorts') ? 'short' : m[0].includes('live') ? 'live' : 'embed'; out.id = m[1]; }
        else if (pl) { out.kind = 'playlist'; out.id = u.searchParams.get('list'); }
        else { const c = p.match(/^\/@([^/]+)/); if (c) { out.kind = 'channel'; out.user = c[1]; } }
      }
      out.extra.t = u.searchParams.get('t') || u.searchParams.get('start');
    } else if (platform === 'twitter') {
      const m = p.match(/^\/([A-Za-z0-9_]+)\/status(?:es)?\/(\d+)/i);
      if (m) { out.user = m[1]; out.id = m[2]; out.kind = 'status'; }
      else { const m2 = p.match(/^\/([A-Za-z0-9_]+)$/i); if (m2) { out.user = m2[1]; out.kind = 'profile'; } }
      if (/fxtwitter|vxtwitter|fixupx/.test(host)) out.kind = 'embed-friendly';
    } else if (platform === 'facebook') {
      const m = p.match(/\/(?:reel|videos?)\/(\d+)/i) || p.match(/^\/watch\/?\?v=(\d+)/i) || u.searchParams.get('v') && [0, u.searchParams.get('v')];
      if (m) { out.id = String(m[1]); out.kind = /reel/i.test(p) ? 'reel' : 'video'; }
      else { const pr = p.match(/^\/([^/?]+)$/); if (pr) { out.user = pr[1]; out.kind = 'profile'; } }
    } else if (platform === 'pinterest') {
      const m = p.match(/\/pin[s]?\/(\d+)/i); if (m) { out.id = m[1]; out.kind = 'pin'; }
      else { const b = p.match(/^\/pin\/([A-Za-z0-9_-]+)/); if (b) { out.id = b[1]; out.kind = 'pin'; } }
    } else if (platform === 'reddit') {
      const m = p.match(/^\/r\/([^/]+)\/comments\/([a-z0-9]+)/i);
      if (m) { out.extra.subreddit = m[1]; out.id = m[2]; out.kind = 'post'; }
      else { const u2 = p.match(/^\/u(?:ser)?\/([^/]+)/i); if (u2) { out.user = u2[1]; out.kind = 'profile'; } }
    } else if (platform === 'spotify') {
      const m = p.match(/^\/(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]+)/i);
      if (m) { out.kind = m[1]; out.id = m[2]; }
    } else if (platform === 'soundcloud') {
      const m = p.match(/^\/([^/]+)\/([^/]+)$/i);
      if (m) { out.user = m[1]; out.extra.slug = m[2]; out.kind = m[1] === 'places' ? 'page' : 'track'; }
    } else if (platform === 'capcut') {
      const m = p.match(/(?:template|link)\/([A-Za-z0-9_-]+)/i) || /template_id=(\d+)/.exec(u.search);
      if (m) { out.id = m[1]; out.kind = 'template'; }
    } else if (platform === 'vimeo') { const m = p.match(/\/(\d+)/); if (m) { out.id = m[1]; out.kind = 'video'; } }
    else if (platform === 'twitch') { const m = p.match(/^\/([A-Za-z0-9_]+)/); if (m) { out.user = m[1]; out.kind = 'channel'; } }
    else if (platform === 'threads') { const m = p.match(/\/post\/([A-Za-z0-9]+)/i); if (m) { out.id = m[1]; out.kind = 'post'; } }

    out.canonical = canonical(out);
    return out;
  };

  function canonical(i) {
    if (i.platform === 'youtube' && i.id && (i.kind === 'video' || i.kind === 'short' || i.kind === 'embed' || i.kind === 'live'))
      return 'https://www.youtube.com/watch?v=' + i.id;
    if (i.platform === 'youtube' && i.kind === 'playlist') return 'https://www.youtube.com/playlist?list=' + i.id;
    if (i.platform === 'tiktok' && i.user && i.id && i.kind === 'video') return 'https://www.tiktok.com/@' + i.user + '/video/' + i.id;
    if (i.platform === 'instagram' && i.id && i.kind !== 'profile') return 'https://www.instagram.com/' + (i.kind === 'reel' || i.kind === 'reels' || i.kind === 'tv' ? 'reel' : 'p') + '/' + i.id + '/';
    if (i.platform === 'twitter' && i.id) return 'https://x.com/' + (i.user || 'i') + '/status/' + i.id;
    if (i.platform === 'reddit' && i.id) return 'https://www.reddit.com/r/' + (i.extra.subreddit || 'all') + '/comments/' + i.id + '/';
    return i.url;
  }

  /* ---------- official oEmbed (documented public endpoints) ---------- */
  n.links.oembed = async function (info) {
    const ep = (() => {
      if (info.platform === 'tiktok') return 'https://www.tiktok.com/oembed?url=' + encodeURIComponent(info.canonical);
      if (info.platform === 'youtube') return 'https://www.youtube.com/oembed?url=' + encodeURIComponent(info.canonical) + '&format=json';
      if (info.platform === 'vimeo') return 'https://vimeo.com/api/oembed.json?url=' + encodeURIComponent(info.canonical);
      if (info.platform === 'soundcloud') return 'https://soundcloud.com/oembed?url=' + encodeURIComponent(info.canonical) + '&format=json';
      if (info.platform === 'twitter') return 'https://publish.twitter.com/oembed?url=' + encodeURIComponent(info.canonical) + '&omit_script=1&hide_thread=1';
      if (info.platform === 'instagram') return null;   // IG oEmbed needs an app token → server side
      return null;
    })();
    if (!ep) return { ok: false, why: info.platform === 'instagram'
      ? 'Instagram mematikan oEmbed publik tanpa token — perlu Graph API + app credential di server (/api/oembed?platform=instagram).'
      : 'Platform ' + info.label + ' tidak punya endpoint oEmbed publik. Preview memakai meta tag saja.' };
    try {
      const r = await fetch(ep);
      if (!r.ok) return { ok: false, why: 'oEmbed HTTP ' + r.status };
      const j = await r.json();
      return { ok: true, title: j.title, author: j.author_name, thumbnail: j.thumbnail_url, html: j.html, provider: j.provider_name, duration: j.duration, width: j.width, height: j.height, raw: j };
    } catch (e) {
      /* CORS on some origins → try the proxy if configured */
      if (n.CFG.BASE) {
        try { const r2 = await fetch(n.CFG.BASE + '/api/oembed?url=' + encodeURIComponent(info.canonical)); if (r2.ok) return { ok: true, ...(await r2.json()) }; } catch (e2) { }
      }
      return { ok: false, why: 'Browser tidak boleh membaca respons oEmbed ini (CORS). Jalankan server/dev-proxy.mjs untuk fetch sisi-server.' };
    }
  };

  /* ---------- generic open-graph metadata (needs server fetch: no CORS on the web) ---------- */
  n.links.meta = async function (url) {
    if (!n.CFG.BASE) return { ok: false, why: 'Meta scraping HTML butuh fetch sisi-server (mayoritas situs tidak mengirim CORS header). Aktifkan NAS.CFG.BASE → /api/meta?url=…' };
    const r = await fetch(n.CFG.BASE + '/api/meta?url=' + encodeURIComponent(url));
    if (!r.ok) return { ok: false, why: 'HTTP ' + r.status };
    return { ok: true, ...(await r.json()) };
  };

  /* ---------- embed HTML: official players, nothing scraped ---------- */
  n.links.embed = function (info, oembed) {
    if (oembed?.html) return { kind: 'oembed', html: oembed.html, label: 'Embed resmi ' + (oembed.provider || info.label) };
    if (info.platform === 'youtube' && info.id && info.kind !== 'playlist')
      return { kind: 'iframe', html: '<iframe loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(info.id) + (info.extra.t ? '?start=' + encodeURIComponent(String(info.extra.t).replace(/[^0-9]/g, '')) : '') + '"></iframe>', label: 'YouTube nocookie player' };
    if (info.platform === 'spotify' && info.id)
      return { kind: 'iframe', html: '<iframe loading="lazy" style="width:100%;max-width:560px;height:' + (info.kind === 'track' ? 80 : 352) + 'px;border:0;border-radius:12px" src="https://open.spotify.com/embed/' + info.kind + '/' + encodeURIComponent(info.id) + '"></iframe>', label: 'Spotify embed player' };
    if (info.platform === 'soundcloud' && info.url)
      return { kind: 'iframe', html: '<iframe loading="lazy" height="166" style="width:100%;border:0" src="https://w.soundcloud.com/player/?url=' + encodeURIComponent(info.url) + '&visual=false"></iframe>', label: 'SoundCloud widget' };
    if (info.platform === 'vimeo' && info.id)
      return { kind: 'iframe', html: '<iframe loading="lazy" src="https://player.vimeo.com/video/' + encodeURIComponent(info.id) + '"></iframe>', label: 'Vimeo player' };
    if (info.platform === 'reddit' && info.id)
      return { kind: 'iframe', html: '<blockquote class="reddit-embed"><a href="' + n.esc(info.canonical) + '">Lihat postingan Reddit ini</a></blockquote>', label: 'Reddit quote embed (perlukan script resmil di halaman publik)', needsScript: 'https://embed.reddit.com' };
    if (info.platform === 'twitter' && info.id)
      return { kind: 'iframe', html: '<blockquote class="twitter-tweet"><a href="' + n.esc(info.canonical) + '">Tweet oleh @' + n.esc(info.user || '') + '</a></blockquote>', label: 'X embed (pakai publish.twitter.com/oembed)', needsScript: 'https://platform.twitter.com/widgets.js' };
    if (info.platform === 'tiktok')
      return { kind: 'iframe', html: '<blockquote class="tiktok-embed"><a href="' + n.esc(info.canonical) + '">Video TikTok</a></blockquote>', label: 'TikTok embed (resmi, butuh widgets.js di halaman publik)', needsScript: 'https://embed.tiktok.com/post/embed.js' };
    if (info.platform === 'instagram' && info.id)
      return { kind: 'iframe', html: '<blockquote class="instagram-media"><a href="' + n.esc(info.canonical) + '">Postingan Instagram</a></blockquote>', label: 'Instagram embed (resmi, via widgets.js)', needsScript: 'https://www.instagram.com/embed.js' };
    return { kind: 'none', html: '', label: 'Tidak ada format embed resmi untuk sumber ini.' };
  };

  /* ---------- what the "download" step would need, honestly ---------- */
  n.links.downloadAdvice = function (info) {
    const A = {
      tiktok: { file: 'butuh server worker (mis. yt-dlp) + consent flow; hindari mirror anonim seperti tikwm/savett', legal: 'unduh hanya konten milik sendiri atau berlisensi' },
      instagram: { file: 'GraphQL/private endpoint yang dipakai scraper publik sudah banyak diblokir & berisiko banned IP', legal: 'Gunakan IG "Download your information" untuk arsip milik sendiri' },
      youtube: { file: 'yt-dlp di worker (bukan browser). Audio-only legal untuk konten sendiri/CC', legal: 'YouTube ToS melarang unduhan tanpa tombol resmi — fitur ini harus di belakang izin pemilik kanal' },
      spotify: { file: 'DRM (Widevine) — tidak bisa dan tidak boleh di-bypass di app ini', legal: 'gunakan Spotify Premium offline atau API preview 30 detik' },
      soundcloud: { file: 'Client-ID API resmi menyediakan /tracks/{id}/download bila uploader mengizinkan', legal: 'hanya track berlisensi "downloadable"' },
      facebook: { file: 'Graph API oEmbed hanya memberi preview; file butuh token halaman milik sendiri', legal: 'unduh via menu "Download your information"' },
      pinterest: { file: 'image URL langsung bisa diambil dari oEmbed thumbnail (aman, bukan video rip)', legal: 'hormati hak cipta pemilik pin' }
    };
    return A[info.platform] || { file: 'tidak ada jalur unduhan resmi — tampilkan preview + tombol "buka di platform"', legal: 'n/a' };
  };

  /* ---------- short-link resolve (via proxy only) ---------- */
  n.links.resolve = async function (url) {
    if (!n.CFG.BASE) return { ok: false, why: 'Mengikuti redirect vt.tiktok.com / pin.it / fxtwitter perlu fetch sisi-server. Aktifkan proxy.' };
    try { const r = await fetch(n.CFG.BASE + '/api/resolve?url=' + encodeURIComponent(url)); return r.ok ? await r.json() : { ok: false, why: 'HTTP ' + r.status }; }
    catch (e) { return { ok: false, why: String(e.message || e) }; }
  };
})(window.NAS);
