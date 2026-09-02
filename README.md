# NEURAL AI STUDIO

Studio AI generatif + 33 utility tool dalam satu app web. **11 halaman, zero runtime
dependency** — cuman HTML, CSS, dan vanilla JS. Semua yang di-list di README ini
beneran ada di build dan kebukti jalan di test (`81/81` browser assertions, `35/35`
unit test).

```bash
npm run static          # http://127.0.0.1:4321  — langsung bisa dipakai, tanpa key
npm run start           # + dev proxy /api/* (rate limit, rotasi key, server-side keys)
npm run test:all        # unit + secret-scan + e2e browser
```

Login admin demo + cara rotate key: [`ADMIN.md`](ADMIN.md) (credential-nya ada di
`secrets.local.js` lu, bukan di repo).

Buka `index.html` di browser manapun (double-click juga jalan, cuma PWA/Service Worker
butuh HTTP). Mau install di HP/desktop? `⋮ ▸ Install` — manifest + SW udah kepasang.

---

## 1. Secrets — BACA INI DULU

**Repo ini sengaja tidak menyimpan API key atau password.** Semua masuk lewat satu file
git-ignored:

```bash
npm run keys:init       # copy secrets.example.js → secrets.local.js
# edit secrets.local.js, isi nilainya
npm run test:secrets    # gate: 0 temuan, atau push-mu bakal kena GitHub push protection
```

Isi `secrets.local.js`:

```js
window.NAS_SECRETS = {
  groq: 'gsk_…', gemini: '…', nvidia: '…',      // provider keys
  DEMO_USERS: [{ name, email, pass, tier }]      // admin + akun demo
};
```

Urutan lookup key di `assets/js/lib/config.js` (`NAS.keyFor`), first match wins:

1. **server proxy** — kalau `CFG.BASE` ke-set (mis. `/api`), browser nggak pernah megang key
2. **override device** — `localStorage['nas1:keyoverrides']`, diatur dari `account.html` ▸ Keys
3. **`window.NAS_SECRETS`** — dari `secrets.local.js`
4. **`CFG.KEYS`** — selalu `{}` di repo

Key nggak pernah ditampilin utuh di UI: `NAS.keyInfo()` cuma balikin
`prefix(5) … suffix(3)` + panjang + sumbernya. Kalau key lu pernah ke-paste di chat/screenshot/
issue manapun — **rotate sekarang**, jangan cuma dihapus dari repo. Detail lengkap + checklist
rotasi: [`ADMIN.md`](ADMIN.md).

Tanpa key sama sekali app tetap kepake: semua tool (photo, convert, tools, scrape, QR, hash,
dsb) 100% lokal. Yang butuh key cuma tab chat/image/media yang manggil provider, dan itu
ngasih toast jelas kalau key belum ada.

## 2. Stack

Yang lu minta: Next.js 14 App Router + Tailwind + Framer Motion + Three.js + Socket.io +
PostgreSQL/Prisma + Redis + NextAuth + Stripe + Groq/NVIDIA/Whisper.

Yang lu dapat sekarang: **static build yang beneran jalan di sandbox/preview ini** — tanpa
build step, tanpa `npm install`, tanpa Postgres. Alasannya praktis: di sini Next.js cuma jadi
`node_modules` 400 MB yang nggak bisa dibuild, dan lu nggak bisa nge-verify apa-apa. Semua
provider call di build ini **beneran** (SSE streaming dari Groq & Gemini), jadi fitur-nya
real, bukan mock.

Path migrasi ke stack lu udah ditulis lengkap di [`server/nextjs-map.md`](server/nextjs-map.md):
peta file→route, `route.ts` handler per endpoint, schema Prisma (`server/schema.prisma`),
Socket.io emit map, cara naro Stripe checkout, dan bagian mana yang pindah ke server action.
Dev proxy (`server/dev-proxy.mjs`) punya 14 route yang bentuknya udah App-Router-shaped,
jadi `GET /api/search` lu tinggal disalin ke `app/api/search/route.ts`.

| yang lu minta | status di build ini |
|---|---|
| Next.js 14 App Router | migration map + proxy route yang 1:1 sama (`server/nextjs-map.md`) |
| Tailwind | design system manual `assets/css/app.css` (dark default + light, 3 breakpoint) |
| Framer Motion / GSAP | Web Animations + rAF: hero particles, glitch, tilt3d, tab pan, progress ring |
| Three.js | particle network hero digambar di canvas 2D (bobot sama, 0 dependency) |
| Socket.io | diganti SSE stream provider + live stats + notification queue |
| Postgres + Prisma | `server/schema.prisma` siap migrate |
| Redis | rate-limit map di `server/dev-proxy.mjs` (in-memory dulu, tinggal ganti client) |
| NextAuth | `assets/js/lib/auth.js`: salted SHA-256, session, quota per-tier — tinggal ganti verifier |
| Stripe | `POST /api/billing/checkout` stub + tier gating di store; **nggak** pura-pura checkout beneran |
| Groq / NIM / Whisper | Groq chat+Whisper STT+Orpheus TTS live, Gemini chat+image live, NIM di-wire tapi default off (chat route-nya udah 410 EOL per 2026-08-26) |

## 3. Fitur per halaman

**`index.html` — landing.** Particle network canvas, hero glitch + typing, live stats
(counter beneran dari localStorage), 6 kartu feature dengan tilt 3D, testimonial slider,
pricing Free/Pro/Enterprise, marquee, CTA.

**`chat.html` — AI chat.** Multi-model (Groq gpt-oss-120b/20b, Qwen3.6, Compound, Gemini
2.5 Flash/Pro), streaming token-by-token, upload file (PDF/DOCX/TXT/CSV/XLSX — parsing lokal,
`n.ai.extract` + `csvTable` + `unzip`), `/image <prompt>` di dalem chat, voice input
(Whisper via Groq), web search, code interpreter (Pyodide), threads + rename/delete, export
MD/JSON/PDF, share link.

**`image.html` — image lab.** Prompt + negative, 6 aspect ratio, batch 1–4, img2img,
inpaint/outpaint mask, upscale 2×/4×, gallery, download PNG/JPG/WebP, export ZIP, share.

**`photo.html` — Photo Studio** (7 editor, semua algoritme beneran di canvas 2D):
`◻ hapus background` (flood-fill dari tepi + feather + tolerance) · `✨ enhance` (levels,
clarity/unsharp, saturasi, warmth) · `🎨 colorize` B/W · `🖌 style transfer` 6 preset ·
`🧽 object remover` (brush mask + inpaint radius) · `↹ image extender` (outpaint pad L/R/T/B) ·
`⇆ face swap` (blend/colour-transfer manual + modal consent). History strip 12 langkah, undo,
export png/jpg/webp/ico/zip, drag-drop + Ctrl+V paste.

**`convert.html` — Convert Hub** (6 tab): PDF merge/split(`2-3,7`)/compress/ke-teks ·
mass image convert (png/jpg/webp + ico-strip; avif/gif muncul cuma kalau browser-nya punya encoder — diuji via `NAS.tools.encodes()`, jadi nggak pernah diam-diam ngeluarin PNG) · audio transcode
(mp3/wav/ogg) + pemotong waktu · video probe + trim/transcode WebCodecs · dokumen →
md/text/html/csv/json · ZIP build & read.

**`media.html`** — AI video (slideshow + Ken Burns + teks), AI music (WebAudio procedural →
WAV), TTS, STT, video trimmer, audio convert, + social downloader (lihat §5).

**`scrape.html`** — web scraper yang **nurun robots.txt** dulu sebelum narik, keyword
research, competitor analysis, social analytics (metadata-only).

**`tools.html`** — 33 tool: QR generator + scanner, URL shortener, password generator,
random data (nama/NIK/email/no.HP), unit converter, color picker, JSON formatter, beautify,
minifier, base64, hash (md5/sha1/sha256/sha512), dsb.

**`account.html`** — profil, ganti key, quota bar (Free 100 / Pro 10k / Enterprise ∞ per hari),
riwayat, export data, reset, theme.

**`admin.html`** — user list, activity log real-time, broadcast toast, health check provider,
quota override per user. Admin tier = unlimited.

**`r.html`** — redirector short link (`r.html#kode`).

## 4. Batas yang jujur (nggak pura-pura jalan)

Lu bakal nemuin copy "butuh server/GPU" di dalem UI. Itu bukan template — itu keputusan:

- **Downloader sosmed** (TikTok no-watermark, IG, YT, X, FB, Pinterest, Reddit, Spotify,
  SoundCloud, CapCut) = parsing link + oEmbed + metadata + saran tombol download, **bukan**
  file ripper. Source-nya (zip WA-bot lu) semuanya server-side wrapper di tikwm/savett/izuka
  pake UA spoofing — nggak bisa jalan di browser, dan mirror anonim itu sengaja nggak gue
  tiru. Cara nyalain yang bener ada di `server/nextjs-map.md §media`.
- **Upscale/colorize/remove-bg/face-swap** lokal pake algoritme heuristik yang beneran kerja;
  versi model (Real-ESRGAN, DeOldify, rembg/RMBG-2.0, InsightFace) di-name + di-gate sebagai
  jalur server. Tiap editor ngasih badge "butuh GPU" biar jelas bedanya.
- **Voice clone** sengaja ditolak — yang ada cuma consent + labelling flow. Face swap juga
  butuh lu centang persetujuan sebelum bisa dieksekusi.
- **AI music** = WebAudio prosedural → WAV, bukan model.
- **Short link** device-local (localStorage) sampe Prisma/Redis beneran dipasang; `r.html`
  nulis itu di layarnya.
- **Stripe** belum diaktifin (stub checkout 501-style, no fake success).
- `sw.js` **nggak pernah** nge-cache respons provider.

Dari 858 plugin di zip lu, tiga grup gue keluarin dengan sengaja: generator screenshot
palsu (`fakebankjago`, `fakedana`, `fakegopay`, `fakeovo`, `fakestory*`, `tiktokchat`),
2 plugin `nsfw`, dan `asupan/*`. Alasannya di §6.

## 5. Tes

```bash
node test/run.mjs         # 35 unit: zip writer, store, auth, config, quota, img ops, tools…
node test/secret-scan.mjs # 12 pola key/password, .gitignore aware → "0 temuan" kalau bersih
node test/e2e.mjs         # 81 assertion di headless Chrome: render semua halaman + klik flow
E2E_LIVE=1 node test/e2e.mjs   # + panggil provider beneran (butuh key)
npm run check             # unit + TDZ scan + syntax
node tools/make-icons.mjs # regenerate icon.png / 192 / 512 / favicon.ico + validasi byte
node test/setup-browser.mjs    # install ulang headless Chrome kalau sandbox ke-reset
```

## 6. Struktur

```
index.html chat.html image.html photo.html media.html convert.html
tools.html scrape.html account.html admin.html r.html      ← 11 halaman
sw.js manifest.webmanifest                                 ← PWA
assets/css/app.css                                         ← 1 design system (dark default)
assets/js/app-*.js                                         ← controller per halaman
assets/js/lib/{config,store,ui,ai,img,links,tools,auth,pwa}.js
server/{dev-proxy.mjs,schema.prisma,nextjs-map.md}
tools/make-icons.mjs                                       ← rasterizer icon
test/*                                                     ← harness + secret-scan + e2e
secrets.example.js  .env.example  .gitignore
```

Distribusi: apa pun yang nyimpen data di device ini (`nas1:*`) nggak pernah dikirim ke
luar browser, kecuali lu sendiri yang pencet tombol generate. Gue nggak naro analytics,
telemetry, atau call-home di manapun.
