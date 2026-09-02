#!/usr/bin/env node
/* ============================================================================
   NEURAL AI STUDIO — dev proxy / API gateway (Node 20+, zero dependencies)
   ----------------------------------------------------------------------------
   Why this file exists:
     1. Keys never live in the browser bundle (read from process.env).
     2. Some providers send no CORS headers (NVIDIA NIM, Tavily, most scraped HTML)
        → they can only be reached server-side.
     3. Quota + rate limit + activity log have to be enforced on the server,
        otherwise "100 request/day" is a polite suggestion.

   This is deliberately dependency-free so `node server/dev-proxy.mjs` works on a
   fresh clone. For production, copy each route into app/api/[name]/route.ts (see
   nextjs-map.md) — the request/response shapes here are already the ones the
   frontend expects.

   env:
     PORT=8787
     GROQ_API_KEY=...            (required for /api/chat, /api/asr, /api/tts)
     GROQ_API_KEY_2=...          (optional; used when primary hits 429)
     GEMINI_API_KEY=...          (image + gemini chat)
     NVIDIA_API_KEY=...          (NIM — currently EOL for chat on our key, kept wired)
     TAVILY_API_KEY=...          (/api/search)
     ADMIN_TOKEN=...             (/api/admin/* + x-admin-token header)
     NAS_STATIC=..               (dir to serve; default = repo root)
   ============================================================================ */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* tiny .env loader — no dependency, and no secret ever lands in git:
   .env.local / .env are git-ignored, DEV_TOKEN fallback lives in ../secrets.local.js */
function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    const p = join(ROOT, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]{3,})\s*=\s*(.*)$/i);
      if (!m || line.trim().startsWith('#')) continue;
      const v = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
      if (v && !process.env[m[1]]) process.env[m[1]] = v;
    }
    return f;
  }
  return null;
}
const ENVC = await loadEnv();
const STATIC = resolve(process.env.NAS_STATIC || ROOT);
const PORT = +(process.env.PORT || 8787);
const ENV = process.env;

const PROVIDERS = {
  groq: { base: 'https://api.groq.com/openai/v1', key: () => ENV.GROQ_API_KEY, key2: () => ENV.GROQ_API_KEY_2 },
  nvidia: { base: 'https://integrate.api.nvidia.com/v1', key: () => ENV.NVIDIA_API_KEY },
  gemini: { base: 'https://generativelanguage.googleapis.com/v1beta', key: () => ENV.GEMINI_API_KEY }
};
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.map': 'application/json',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8'
};

/* ---------- tiny in-memory stores (swap for Redis/Prisma in prod) ---------- */
const day = () => new Date().toISOString().slice(0, 10);
const usage = new Map();        // email -> { day, n }
const rate = new Map();         // bucket -> [timestamps]
const cache = new Map();        // url -> { t, body }
const CACHE_TTL = 5 * 60_000;
const events = [];              // ring buffer, last 5000
const log = (kind, who, detail) => { events.push({ id: randomUUID(), at: Date.now(), kind, who, detail }); if (events.length > 5000) events.shift(); };

const QUOTA = { free: 100, pro: 10_000, enterprise: Infinity };
function takeQuota(who = 'anon', tier = 'free') {
  if (tier === 'enterprise') return { used: 0, limit: Infinity };
  const cur = usage.get(who);
  const rec = !cur || cur.day !== day() ? { day: day(), n: 0 } : cur;
  rec.n += 1; usage.set(who, rec);
  if (rec.n > (QUOTA[tier] ?? QUOTA.free)) { const e = new Error(`quota exceeded: ${QUOTA[tier] ?? 100} request/day`); e.status = 429; throw e; }
  return { used: rec.n, limit: QUOTA[tier] ?? QUOTA.free };
}
function rateLimit(bucket, max = 30, per = 60_000) {
  const now = Date.now();
  const list = (rate.get(bucket) || []).filter(t => now - t < per);
  list.push(now); rate.set(bucket, list);
  return list.length <= max;
}

/* ---------- helpers ---------- */
const json = (res, code, obj, headers = {}) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS, ...headers });
  res.end(body);
};
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type,authorization,x-admin-token,x-api-key',
  'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'permissions-policy': 'geolocation=(), camera=(), microphone=()'
};
async function body(req) {
  const chunks = []; for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks);
  if (!raw.length) return { raw: Buffer.alloc(0), json: null };
  const type = req.headers['content-type'] || '';
  if (type.startsWith('application/json')) { try { return { raw, json: JSON.parse(raw.toString('utf8')) }; } catch { throw Object.assign(new Error('body bukan JSON valid'), { status: 400 }); } }
  return { raw, json: null, text: raw.toString('utf8') };
}
async function upstream(url, { headers = {}, method = 'POST', body: b } = {}) {
  const r = await fetch(url, { method, headers, body: b });
  const ct = r.headers.get('content-type') || '';
  const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, ct, buf, headers: Object.fromEntries(r.headers) };
}
async function keyFallback(provider, path, init) {
  const p = PROVIDERS[provider];
  const keys = [p.key && p.key(), p.key2 && p.key2()].filter(Boolean);
  if (!keys.length) { const e = new Error(`${provider} key not configured on server (set ${provider === 'groq' ? 'GROQ_API_KEY' : provider.toUpperCase() + '_API_KEY'})`); e.status = 501; throw e; }
  let last;
  for (const k of keys) {
    const res = await upstream(p.base + path, { ...init, headers: { ...(init.headers || {}), authorization: 'Bearer ' + k } });
    if (res.status === 429) { last = res; continue; }
    return res;
  }
  return last;
}

/* ---------- routes ---------- */
const routes = {
  'GET /api/health': async (req, res) => {
    const checks = {};
    for (const [name, p] of Object.entries(PROVIDERS)) {
      const has = p.key && p.key();
      try {
        const r = await fetch(p.base + (name === 'gemini' ? '/models?pageSize=1' : '/models'), { headers: has ? (name === 'gemini' ? { 'x-goog-api-key': has } : { authorization: 'Bearer ' + has }) : {} });
        checks[name] = { configured: !!has, status: r.status, ok: r.ok };
      } catch (e) { checks[name] = { configured: !!has, error: e.message }; }
    }
    json(res, 200, { ok: true, app: 'neural-ai-studio', version: '1.0.0', day: day(), events: events.length, providers: checks });
  },

  /* OpenAI-compatible passthrough with quota + key rotation. Frontend can just set BASE=/api */
  'POST /api/chat': async (req, res) => {
    const { json: j } = await body(req);
    if (!j?.messages?.length) return json(res, 400, { error: 'messages required' });
    const who = req.headers['x-user'] || 'anon';
    try { takeQuota(who, req.headers['x-tier'] || 'free'); } catch (e) { return json(res, 429, { error: e.message }); }
    const provider = j.provider || 'groq';
    const model = j.model || (provider === 'gemini' ? 'gemini-2.5-flash' : 'openai/gpt-oss-20b');
    if (provider === 'gemini') {
      const path = `/models/${model}:generateContent`;
      const r = await keyFallback('gemini', path, { body: JSON.stringify({ contents: j.messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content) }] })), ...(j.system ? { systemInstruction: { parts: [{ text: j.system }] } } : {}), generationConfig: { temperature: j.temperature ?? .7, maxOutputTokens: j.maxTokens ?? 2048 } }), headers: { 'content-type': 'application/json' } });
      res.writeHead(r.status, { 'content-type': 'application/json', ...CORS });
      return res.end(r.buf);
    }
    const path = '/chat/completions';
    const r = await keyFallback(provider, path, { body: JSON.stringify({ model, messages: j.messages, stream: false, temperature: j.temperature ?? .7, max_completion_tokens: j.maxTokens ?? 2048 }), headers: { 'content-type': 'application/json' } });
    log('chat', who, model + ' ' + JSON.stringify(j.messages.at(-1)?.content || '').slice(0, 120));
    res.writeHead(r.status, { 'content-type': r.ct || 'application/json', ...CORS });
    res.end(r.buf);
  },

  /* speech to text (multipart passthrough → Groq Whisper) */
  'POST /api/asr': async (req, res) => {
    const { raw } = await body(req);
    const ct = req.headers['content-type'] || '';
    if (!ct.includes('multipart/form-data')) return json(res, 400, { error: 'multipart/form-data expected (file + model)' });
    try { takeQuota(req.headers['x-user'] || 'anon', req.headers['x-tier'] || 'free'); } catch (e) { return json(res, 429, { error: e.message }); }
    const r = await keyFallback('groq', '/audio/transcriptions', { body: raw, headers: { 'content-type': ct } });
    res.writeHead(r.status, { 'content-type': r.ct, ...CORS }); res.end(r.buf);
  },
  'POST /api/tts': async (req, res) => {
    const { raw } = await body(req);
    const ct = req.headers['content-type'] || '';
    const r = await keyFallback('groq', '/audio/speech', { body: raw, headers: { 'content-type': ct } });
    res.writeHead(r.status, { 'content-type': r.ct.includes('json') ? 'application/json' : 'audio/wav', ...CORS }); res.end(r.buf);
  },

  /* generic passthrough the client already knows how to call */
  'GET /api/proxy': async (req, res, ctx) => {
    const url = ctx.url.searchParams.get('url');
    if (!url) return json(res, 400, { error: 'url param required' });
    let target; try { target = new URL(url); } catch { return json(res, 400, { error: 'bad url' }); }
    if (!/^https:$/.test(target.protocol)) return json(res, 400, { error: 'only https' });
    if (!rateLimit('proxy:' + (req.socket.remoteAddress || '?'), 90, 60_000)) return json(res, 429, { error: 'too many proxy calls, slow down' });
    const hit = cache.get(target.href);
    if (hit && Date.now() - hit.t < CACHE_TTL) { res.writeHead(200, { 'content-type': 'application/json', 'x-cache': 'HIT', ...CORS }); return res.end(hit.body); }
    const r = await fetch(target.href, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (compatible; NEURAL-AI-STUDIO/1.0)' } });
    const buf = await r.text();
    cache.set(target.href, { t: Date.now(), body: buf });
    log('proxy', req.socket.remoteAddress, target.hostname + ' ' + r.status);
    res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'text/plain; charset=utf-8', 'x-cache': 'MISS', ...CORS });
    res.end(buf);
  },

  /* raw HTML for the scrape tools */
  'GET /api/fetch': async (req, res, ctx) => {
    const url = ctx.url.searchParams.get('url'); if (!url) return json(res, 400, { error: 'url required' });
    const t = ctx.url.searchParams.get('ttl');
    if (t) { const c = cache.get(url); if (c && Date.now() - c.t < +t * 1000) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'x-cache': 'HIT', ...CORS }); return res.end(c.body); } }
    const robots = await safeText(url.replace(/\/$/, '') + '/robots.txt');
    if (/^\s*User-agent: \*[\s\S]*?Disallow:\s*\/\s*$/im.test(robots || '')) return json(res, 403, { error: 'robots.txt melarang akses ke / untuk semua bot', robots: String(robots).slice(0, 500) });
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; NEURAL-AI-STUDIO/1.0)', 'accept-language': 'id,en;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
    const html = await r.text();
    cache.set(url, { t: Date.now(), body: html });
    res.writeHead(r.status, { 'content-type': 'text/html; charset=utf-8', 'x-robots': robots ? 'seen' : 'none', ...CORS });
    res.end(html);
  },

  /* open graph / twitter card extraction without cheerio */
  'GET /api/meta': async (req, res, ctx) => {
    const url = ctx.url.searchParams.get('url'); if (!url) return json(res, 400, { error: 'url required' });
    let html;
    try { html = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; NEURAL-AI-STUDIO/1.0)' }, signal: AbortSignal.timeout(15000) }).then(r => r.text()); }
    catch (e) { return json(res, 502, { error: 'upstream: ' + e.message }); }
    const pick = (re) => [...html.matchAll(re)].map(m => ({ k: m[1], v: decode(m[2]) }));
    const meta = [...pick(/<meta[^>]+(?:property|name)\s*=\s*["']([^"']+)["'][^>]+content\s*=\s*["']([^"']*)["']/gi), ...pick(/<meta[^>]+content\s*=\s*["']([^"']*)["'][^>]+(?:property|name)\s*=\s*["']([^"']+)["']/gi)]
      .reduce((a, { k, v }) => (a[k] ?? v ? (a[k] = a[k] || v) : 0, a), {});
    const out = {
      url, ok: true, status: 200,
      title: decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || ''),
      description: meta['description'] || meta['og:description'] || '',
      image: meta['og:image'] || meta['twitter:image'] || '',
      site: meta['og:site_name'] || new URL(url).hostname,
      locale: meta['og:locale'] || '', published: meta['article:published_time'] || '',
      wordCount: (html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ').match(/\S+/g) || []).length,
      canonical: (html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i) || [])[1] || '',
      feeds: [...html.matchAll(/<link[^>]+rel=["']alternate["'][^>]*>/gi)].filter(m => /rss|atom|xml/.test(m[0])).map(m => (m[0].match(/href=["']([^"']+)/) || [])[1]).filter(Boolean),
      meta
    };
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300', ...CORS });
    res.end(JSON.stringify(out));
  },

  /* follow short links (vt.tiktok.com, pin.it, …) server-side */
  'GET /api/resolve': async (req, res, ctx) => {
    const url = ctx.url.searchParams.get('url'); if (!url) return json(res, 400, { error: 'url required' });
    try {
      const r = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' }, signal: AbortSignal.timeout(15000) });
      json(res, 200, { ok: true, url: r.url, status: r.status, type: r.headers.get('content-type'), hops: r.url === url ? 0 : 1 });
    } catch (e) { json(res, 502, { ok: false, error: e.message }); }
  },

  'GET /api/oembed': async (req, res, ctx) => {
    const url = ctx.url.searchParams.get('url'); if (!url) return json(res, 400, { error: 'url required' });
    const u = new URL(url), h = u.hostname.replace(/^www\./, '');
    let ep;
    if (/tiktok\.com$/.test(h)) ep = 'https://www.tiktok.com/oembed?url=' + encodeURIComponent(url);
    else if (/youtube\.com$|youtu\.be$/.test(h)) ep = 'https://www.youtube.com/oembed?url=' + encodeURIComponent(url) + '&format=json';
    else if (/vimeo\.com$/.test(h)) ep = 'https://vimeo.com/api/oembed.json?url=' + encodeURIComponent(url);
    else if (/soundcloud\.com$/.test(h)) ep = 'https://soundcloud.com/oembed?url=' + encodeURIComponent(url) + '&format=json';
    else if (/twitter\.com$|^x\.com$/.test(h)) ep = 'https://publish.twitter.com/oembed?url=' + encodeURIComponent(url) + '&omit_script=1';
    else return json(res, 501, { error: 'no public oEmbed for ' + h });
    const r = await upstream(ep, { method: 'GET' });
    res.writeHead(r.status, { 'content-type': 'application/json', ...CORS }); res.end(r.buf);
  },

  'GET /api/search': async (req, res, ctx) => {
    const q = ctx.url.searchParams.get('q'); if (!q) return json(res, 400, { error: 'q required' });
    if (!ENV.TAVILY_API_KEY) return json(res, 501, { error: 'TAVILY_API_KEY not set — /api/search disabled', fallback: 'model can still answer from its own knowledge' });
    const r = await upstream('https://api.tavily.com/search', { body: JSON.stringify({ api_key: ENV.TAVILY_API_KEY, query: q, max_results: 6, include_answer: true }), headers: { 'content-type': 'application/json' } });
    res.writeHead(r.status, { 'content-type': 'application/json', ...CORS }); res.end(r.buf);
  },

  /* Stripe-free tier switch: replace with a real webhook in prod */
  'POST /api/billing/checkout': async (req, res) => {
    const { json: j } = await body(req);
    if (!j?.tier) return json(res, 400, { error: 'tier required' });
    if (!ENV.STRIPE_SECRET_KEY) return json(res, 200, { stub: true, tier: j.tier, error: undefined, note: 'STRIPE_SECRET_KEY not set → simulated upgrade. Set it to get a real session.url.' });
    const price = { free: 'price_free', pro: process.env.STRIPE_PRICE_PRO, enterprise: process.env.STRIPE_PRICE_ENT }[j.tier];
    const r = await upstream('https://api.stripe.com/v1/checkout/sessions', {
      body: new URLSearchParams({ mode: 'subscription', 'line_items[0][price]': price, 'line_items[0][quantity]': '1', success_url: (j.origin || '') + '/account.html?upgraded=1', cancel_url: (j.origin || '') + '/index.html#pricing', 'client_reference_id': j.email || '', 'metadata[tier]': j.tier }).toString(),
      headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: 'Bearer ' + ENV.STRIPE_SECRET_KEY }
    });
    res.writeHead(r.status, { 'content-type': 'application/json', ...CORS }); res.end(r.buf);
  },

  'GET /api/admin/events': async (req, res, ctx) => {
    if (!adminOk(req)) return json(res, 403, { error: 'x-admin-token required' });
    const limit = +(ctx.url.searchParams.get('limit') || 500);
    const who = ctx.url.searchParams.get('who');
    json(res, 200, { total: events.length, usage: [...usage.entries()], events: events.filter(e => !who || e.who === who).slice(-limit).reverse() });
  },

  'GET /api/qr': async (req, res, ctx) => {
    /* server-side QR render fallback for browsers without a CDN (uses a tiny SVG generator) */
    const data = ctx.url.searchParams.get('data') || '';
    json(res, 501, { error: 'SVG QR not implemented server-side; client uses qrcode-generator from CDN. Wire here if you need it offline (e.g. `qrcode` npm package).' });
  },

  'GET /api/media/trim': async (req, res) => json(res, 501, { error: 'ffmpeg not wired in dev proxy. Copy the documented handler from nextjs-map.md §media into app/api/media/trim/route.ts (fluent-ffmpeg) — it needs a real FS/lambda layer.' })
};
async function safeText(u) { try { const r = await fetch(u, { signal: AbortSignal.timeout(4000) }); return r.ok ? await r.text() : null; } catch { return null; } }
const decode = (s) => String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const adminOk = (req) => ENV.ADMIN_TOKEN ? req.headers['x-admin-token'] === ENV.ADMIN_TOKEN : true;

/* If no env key is set, mirror the browser-side secrets file so `node server/dev-proxy.mjs`
   just works in this sandbox. In production: never ship secrets.local.js — use real env. */
if (!ENV.GROQ_API_KEY || !ENV.GEMINI_API_KEY) {
  const sp = join(ROOT, 'secrets.local.js');
  if (existsSync(sp)) {
    const txt = readFileSync(sp, 'utf8');
    const grab = (k) => (txt.match(new RegExp(k + "\\s*:\\s*'([^']{8,})'")) || [])[1];
    const map = { GROQ_API_KEY: 'groq', GROQ_API_KEY_2: 'groq2', GEMINI_API_KEY: 'gemini', NVIDIA_API_KEY: 'nvidia', ADMIN_TOKEN: 'adminToken' };
    for (const [envName, key] of Object.entries(map)) {
      const v = grab(key === 'adminToken' ? 'ADMIN_TOKEN' : key);
      if (v && !ENV[envName]) process.env[envName] = v;
    }
  }
}

/* ---------- server ---------- */
const server = http.createServer(async (req, res) => {
  const ctx = { url: new URL(req.url, 'http://x') };
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  const id = req.method + ' ' + ctx.url.pathname;
  try {
    if (routes[id]) return await routes[id](req, res, ctx);
    if (ctx.url.pathname.startsWith('/api/')) return json(res, 404, { error: 'unknown route', route: id, known: Object.keys(routes) });
    /* static */
    let p = decodeURIComponent(ctx.url.pathname);
    if (p === '/' || p === '') p = '/index.html';
    const file = join(STATIC, p);
    if (!file.startsWith(STATIC)) { res.writeHead(403); return res.end('forbidden'); }
    let s; try { s = await stat(file); } catch { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('404 not found: ' + p); }
    if (s.isDirectory()) { res.writeHead(301, { location: p + '/' }); return res.end(); }
    const ext = extname(file).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'content-length': s.size,
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
      'x-content-type-options': 'nosniff',
      'cross-origin-opener-policy': 'same-origin-allow-popups'
    });
    res.end(await readFile(file));
  } catch (e) {
    log('error', req.socket.remoteAddress, e.message);
    json(res, e.status || 500, { error: e.message, hint: e.hint });
  }
});
server.listen(PORT, '0.0.0.0', () => {
  const missing = ['GROQ_API_KEY', 'GEMINI_API_KEY'].filter(k => !ENV[k]);
  console.log('\n  NEURAL AI STUDIO · dev proxy');
  console.log('  ─ env      ' + (ENVC ? ENVC + ' ke-load' : 'gak ada .env(.local) — pakai process.env doang · bikin: cp .env.example .env.local'));
  console.log('  ─ static   http://0.0.0.0:' + PORT + '/  (from ' + STATIC + ')');
  console.log('  ─ routes   ' + Object.keys(routes).length + ' endpoint');
  console.log('  ─ quota    free ' + QUOTA.free + '/day · pro ' + QUOTA.pro + '/day · enterprise ∞');
  console.log(missing.length ? '  ⚠ missing env: ' + missing.join(', ') + ' → those routes answer 501' : '  ✓ keys loaded');
  console.log('\n  biar frontend pakai proxy: ubah assets/js/lib/config.js →  BASE: "/api"\n');
});
