# NEURAL AI STUDIO → Next.js 14 (App Router) port map

Setiap halaman statis di repo ini sudah 1 file = 1 route. Yang berubah cuma **di mana kode jalan**,
bukan logikanya — modul di `assets/js/lib/*` memang ditulis tanpa dependensi build.

```
app/
├─ layout.tsx                  ← nav + theme + PWA + Socket.io provider (dari index.html <head>)
├─ page.tsx                    ← landing (particles = assets/js/ui.js n.ui.particles → 'use client')
├─ (studio)/
│   ├─ chat/page.tsx
│   ├─ image/page.tsx
│   ├─ media/page.tsx
│   ├─ tools/page.tsx
│   └─ scrape/page.tsx
├─ account/page.tsx            ← auth, api keys, billing, history, settings
├─ admin/page.tsx              ← RBAC guard di layout segment
├─ s/[code]/route.ts           ← redirect short link (ganti r.html)
└─ api/
    ├─ auth/[...nextauth]/route.ts
    ├─ chat/route.ts           ← streaming SSE (di bawah)
    ├─ image/route.ts          ← Gemini image / NVIDIA FLUX
    ├─ asr/route.ts            ← multipart → Groq Whisper
    ├─ tts/route.ts
    ├─ search/route.ts         ← Tavily
    ├─ fetch/route.ts          ← HTML scrape + robots guard
    ├─ meta/route.ts · resolve/route.ts · oembed/route.ts
    ├─ media/trim/route.ts     ← fluent-ffmpeg
    ├─ pdf/compress/route.ts   ← qpdf/gs
    ├─ billing/checkout/route.ts · stripe/webhook/route.ts
    └─ admin/events/route.ts
lib/
├─ ai.ts        ← copy dari assets/js/lib/ai.js (buang window/globalThis, export function)
├─ img.ts       ← copy dari assets/js/lib/img.js (canvas ops tetap client-only)
├─ tools.ts     ← copy dari assets/js/lib/tools.js (QR/MD5/WAV/units = pure, bisa di server juga)
├─ links.ts     ← copy dari assets/js/lib/links.js
├─ db.ts        ← PrismaClient singleton
├─ quota.ts     ← Redis INCR + tier lookup
└─ redis.ts
```

## Aturan main
| file sekarang | pindah ke | catatan |
|---|---|---|
| `assets/js/lib/config.js` | `env` (`.env.local`) | **hapus key dari repo.** `NAS.CFG.BASE` jadi `''` karena sudah same-origin |
| `assets/js/lib/store.js` | `lib/db.ts` + Prisma | `coll('threads')` → `prisma.thread.findMany({ where:{userId} })` |
| `assets/js/lib/auth.js` | NextAuth + `middleware.ts` | password check & role **tidak boleh** di client |
| `assets/js/lib/ui.js` | tetap client (`'use client'`) | particles/cursor/markdown = DOM, jangan dipindah ke server |
| `assets/js/lib/img.js` | split: generation → `app/api/image`, ops → client | canvas/Flood fill cuma ada di browser |
| `server/dev-proxy.mjs` | jadi `app/api/*` | tiap `routes['POST /api/chat']` = satu `route.ts` |

## 1. Auth (NextAuth + API key middleware)

```ts
// lib/auth.ts
export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  adapter: PrismaAdapter(prisma),
  providers: [Google({ clientId: process.env.GOOGLE_ID!, clientSecret: process.env.GOOGLE_SECRET! }),
              GitHub({ clientId: process.env.GITHUB_ID!, clientSecret: process.env.GITHUB_SECRET! })],
  callbacks: {
    async jwt({ token, user }) { if (user) { token.uid = user.id; } 
      if (token.uid) { const u = await prisma.user.findUnique({ where:{ id: token.uid as string }, select:{ role:true, tier:true } }); token.role = u?.role; token.tier = u?.tier; }
      return token; },
    async session({ session, token }) { (session.user as any).role = token.role; (session.user as any).tier = token.tier; return session; }
  }
};

// middleware.ts — jalur guard yang benar (bukan cek di browser)
export const config = { matcher: ['/admin/:path*', '/api/chat', '/api/image', '/api/admin/:path*'] };
export default middleware(async (req) => {
  const next = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const adminHeader = req.headers.get('x-admin-token');
  if (req.nextUrl.pathname.startsWith('/admin') && next?.role !== 'ADMIN') return NextResponse.rewrite(new URL('/404', req.url));
  const apiKey = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!next && !apiKey) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.next({ request: { headers: new Headers({ ...Object.fromEntries(req.headers), 'x-user-id': next?.uid ?? '' }) } });
});
```

Kuota + log (jangan percaya hitungan client):

```ts
// lib/quota.ts
export async function takeQuota(userId: string, tier: Tier, kind: string) {
  if (tier === 'ENTERPRISE') return { used: 0, limit: Infinity };
  const key = `nas:quota:${userId}:${new Date().toISOString().slice(0,10)}`;
  const used = await redis.incr(key);
  if (used === 1) await redis.expireat(key, endOfDayUtc());
  const limit = QUOTA[tier] ?? 100;
  await prisma.generation.create({ data: { userId, kind, prompt: '', status: 'ok' } });   // or: create first, patch after
  if (used > limit) throw new ApiError(429, `quota ${limit}/day habis — reset ${hoursLeft()} jam lagi`);
  return { used, limit };
}
```

## 2. Chat streaming route

```ts
// app/api/chat/route.ts
export const runtime = 'nodejs';       // WebStream + abort + redis
export const maxDuration = 60;

export async function POST(req: Request) {
  const j = await req.json() as { model: string; messages: Msg[]; system?: string; provider?: 'groq'|'gemini'|'nvidia' };
  const uid = req.headers.get('x-user-id')!;
  const { tier } = await prisma.user.findUniqueOrThrow({ where: { id: uid }, select: { tier: true } });
  await takeQuota(uid, tier, 'chat');

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(c) {
      try {
        const body = await routeToProvider(j);                    // sama seperti lib/ai.js
        for await (const delta of sseToChunks(body, j.provider)) c.enqueue(enc.encode(`data: ${JSON.stringify({ t: delta })}\n\n`));
        c.enqueue(enc.encode('data: [DONE]\n\n'));
      } catch (e: any) { c.enqueue(enc.encode(`data: ${JSON.stringify({ error: e.message, hint: e.hint })}\n\n`)); }
      finally { c.close(); prisma.event.create({ data:{ userId: uid, kind:'chat', detail: j.messages.at(-1)?.content.slice(0,200) } }); }
    },
    cancel() { /* provider fetch di-abort lewat AbortController di routeToProvider */ }
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' } });
}
```

Ganti client `n.ai.chat` jadi: `fetch('/api/chat', {method:'POST', body: JSON.stringify(...)})` — bentuk SSE-nya sudah sama, parser di `ai.js` tinggal dipakai ulang.

## 3. Image (Gemini + NVIDIA FLUX)

```ts
// app/api/image/route.ts
const GEMINI_IMAGE = process.env.GEMINI_IMAGE_MODEL ?? 'gemini-2.5-flash-image';
export async function POST(req: Request) {
  const { prompt, negative, style, aspect, reference, engine = 'gemini' } = await req.json();
  if (engine === 'flux') {
    const r = await fetch('https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell', {
      method: 'POST', headers: { authorization: `Bearer ${process.env.NVIDIA_API_KEY}`, accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: build(prompt, { negative, style, aspect }), height: H[aspect], width: W[aspect], steps: 4, cfg_scale: 3.5 })
    });
    if (!r.ok) throw api(502, `NIM ${r.status}: ${(await r.text()).slice(0,200)} — cek entitlement key di build.nvidia.com`);
  }
  const g = await callGeminiImage(GEMINI_IMAGE, prompt, reference);   // server-side = no CORS, no key leak
  const png = Buffer.from(g.inlineData.data, 'base64');
  const key = `images/${new Date().toISOString().slice(0,7)}/${ulid()}.png`;
  await storage.put(key, png, { contentType: 'image/png' });           // S3/R2/Cloudinary
  const url = storage.publicUrl(key);
  await prisma.image.create({ data: { userId: uid, prompt, model: engine, url, key, bytes: png.length } });
  return Response.json({ url, key, prompt });
}
```

> Status key NVIDIA hari ini (dicek 2026-09-02): `integrate.api.nvidia.com/v1/models` → 200, **82 model**
> tapi `/v1/chat/completions` → **410 Gone** (`meta/llama-3.1-8b-instruct` "end of life 2026-08-26"),
> dan `/v1/images/generations` → 404 (key belum punya entitlement FLUX/SD). Jadi jangan klaim
> "NVIDIA SDXL ready" di marketing sebelum entitlement-nya aktif.

## 4. Real-time stats (Socket.io)

```ts
// instrument.ts + server.js — Next.js butuh custom server untuk socket
const io = new Server(httpServer, { cors: { origin: process.env.APP_URL } });
const room = (ns = 'global') => io.to('stats:' + ns);
export function emitStats() {
  return Promise.all([prisma.generation.count(), prisma.image.count(), prisma.user.count({ where:{ lastLoginAt:{ gt: new Date(Date.now()-5*60000) } } })])
    .then(([chats, images, users]) => room().emit('stats', { chats, images, users, at: Date.now() }));
}
// app/lib/live-stats.tsx
const { data } = useSocketIO('stats:' + ns, { fallback: await getStatsServerSide() });   // SSR + hydrate
```
Hook `n.ui.liveStats(el, seed)` di repo ini sudah menerima objek `{chats,images,users}` — tinggal disuplai event.

## 5. Media & downloader (jalur yang benar)

```ts
// app/api/media/fetch/route.ts   — HANYA untuk aset yang memang boleh diambil
import { spawn } from 'node:child_process';
export async function POST(req: Request) {
  const { url, purpose } = await req.json();
  const owner = await assertOwnershipOrLicense(url, purpose, uid);   // ← gerbang utama
  if (!owner.ok) return Response.json({ error: owner.reason, docs: '/legal/notice' }, { status: 403 });
  const p = spawn('yt-dlp', ['--dump-json', '--no-warnings', url], { env: process.env });
  const info = await readJson(p.stdout);
  const fmt = purpose === 'audio' ? 'bestaudio' : 'b*v[ext=mp4][height<=1080]';
  const out = `/tmp/${ulid()}.mp4`;
  await run('yt-dlp', ['-f', fmt, '-o', out, '--no-playlist', url]);
  await storage.put(`media/${ulid()}.mp4`, fs.createReadStream(out));
  await prisma.download.create({ data: { userId: uid, platform: info.extractor, url, canonical: info.webpage_url, mediaKind: purpose, status: 'user-owned' } });
  return Response.json({ url: storage.publicUrl(out), title: info.title, duration: info.duration });
}
```
Trim / convert / mux (ffmpeg), upscale (Real-ESRGAN), background removal (RMBG-2.0 / rembg),
DeOldify colorize, InsightFace swap → pola route-nya sama: **queue → worker → storage → row di DB**.
Contoh worker dengan BullMQ:

```ts
// workers/media.ts
const q = new Queue('media', { connection: redis });
await q.add('upscale', { url, factor: 2 }, { attempts: 2, removeOnComplete: 3600 });
new Worker('media', async (job) => {
  const src = await downloadToTmp(job.data.url);
  await run('realesrgan-ncnn-vulkan', ['-i', src, '-o', out, '-s', String(job.data.factor), '-n', 'realesrgan-x4plus']);
  const key = await storage.putStream(...);
  await prisma.generation.update({ where:{ id: job.data.gid }, data:{ status:'ok', costUsd: await cost(job) } });
  return { url: storage.publicUrl(key) };
}, { concurrency: 2 });
```

## 6. Stripe

```ts
// app/api/billing/checkout/route.ts
const s = await stripe.checkout.sessions.create({
  mode: 'subscription', customer: user.stripeId ?? undefined,
  line_items: [{ price: PRICES[tier], quantity: 1 }],
  success_url: `${origin}/account.html?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${origin}/index.html#pricing`, client_reference_id: user.id, allow_promotion_codes: true
});
// app/api/stripe/webhook/route.ts — raw body + signature, BUKAN req.json()
const sig = req.headers.get('stripe-signature')!;
const event = stripe.webhooks.constructEvent(await req.text(), sig, process.env.STRIPE_WEBHOOK_SECRET!);
switch (event.type) {
  case 'checkout.session.completed': await prisma.user.update({ where:{ id: event.data.object.client_reference_id }, data:{ tier: Tier.PRO, stripeId: String(event.data.object.customer), currentPeriodEnd: new Date(event.data.object.subscription * 1000) } }); break;
  case 'customer.subscription.deleted': await downgrade(event); break;
  case 'invoice.payment_failed': await flagRisk(event); break;
}
```

## 7. PWA di Next.js

```
npx @ducanh2912/next-pwa → next.config.js: pwa({ disable: dev, swSrc: './public/sw.js' })
public/manifest.webmanifest ← copy dari repo ini (tambah icon PNG 192/512)
```
`sw.js` di repo ini (network-first HTML + cache-first CDN + **never cache `/api/`**) sudah langsung bisa dipakai sebagai `swSrc`.

## 8. Yang harus dibenerin sebelum public

1. **Rotasi semua key** yang sudah dikirim di prompt/chat (Groq ×2, NVIDIA, Gemini) — sudah terekspos publik.
2. Hapus `config.js:KEYS` dari repo, pindah `.env.local` + Secret Manager.
3. Admin panel: hapus seed demo (`auth.js:SEED`), role cuma dari DB + NextAuth.
4. Tambah rate limit per-IP di edge (`@upstash/ratelimit`) + captcha di endpoint generation.
5. Tambah halaman legal/abuse + DMCA, moderasi prompt (Llama Guard / prompt-guard), audit log admin.
6. CSP header: provider + CDN doang; `object-src 'none'`; `frame-ancestors 'self'`.
7. `Image` dataURL di localStorage → wajib pindah object storage (base64 galeri = cepat penuh, 5 MB limit).
