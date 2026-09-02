# ADMIN.md — credential, rotasi, dan yang harus lu ganti sebelum deploy

## 1. Login admin (build demo ini)

Dua akun di-seed dari `secrets.local.js` ▸ `DEMO_USERS`. Yang perlu lu tau soal bentuknya:

| role | email | password | tier | quota |
|---|---|---|---|---|
| **admin** | `admin@neuralstudio.dev` | *(nilai ada di `secrets.local.js`, sengaja nggak ditulis di sini)* | `enterprise` | unlimited (`QUOTA.enterprise = ∞`) + role admin bypass |
| user demo | `demo@neuralstudio.dev` | *(sama)* | `free` | 100 request/hari |

Kenapa password-nya nggak gue taro di file ini: `test/secret-scan.mjs` nge-gate **semua** file
yang bakal ke-commit, dan dia punya pattern "credential literal" (`pw/pass/key/token + quoted
value`). ADMIN.md yang isinya password = persis yang bikin GitHub nolak push. Jadi aturannya
tegas: **credential cuma ada di `secrets.local.js`**, dan cara paling gampang masuk adalah
`admin.html` ▸ tombol **"isi otomatis"** yang narik akun `role:'admin'` langsung dari
`NAS.CFG.DEMO_USERS`. Login juga jalan di `account.html` buat akun biasa.

Kalau lu butuh nilai password-nya (mis. buat orang lain dicobain), liat aja:

```bash
node -e "const s=require('fs').readFileSync('secrets.local.js','utf8'); console.log(s.match(/DEMO_USERS:[\\s\\S]*\\]/)[0])"
# atau buka file-nya langsung di editor
```

> ⚠️ **Rotate 4 API key sebelum kemana-mana.** Key Groq ×2, Gemini, dan NVIDIA pernah di-paste
> mentah-mentah ke chat publik. Itu persis yang bikin GitHub nolak push lu
> (`[GAGAL] Repository rule violations found — Secret detected in content`), dan itu juga yang
> bikin key-nya sekarang harus gue anggap bocor. Repo yang bersih bukan = key yang aman.
>
> - Groq → https://console.groq.com/keys → delete both, create new
> - Gemini → https://aistudio.google.com/apikey → revoke + regenerate
> - NVIDIA → https://build.nvidia.com/api-keys → revoke (nggak urgent juga nggak apa-apa:
>   chat endpoint NIM balikin `410 reached its end of life on 2026-08-26`, jadi provider ini
>   default-nya OFF dan nggak gue market-in)
>
> Habis rotate: taro nilai baru di `secrets.local.js` doang. Nggak ada file lain yang perlu
> disentuh — `assets/js/lib/config.js` nge-fold `window.NAS_SECRETS` ke `CFG.KEYS` +
> `CFG.DEMO_USERS` pas boot, sebelum `auth.js` sempat seed.

## 2. Credential ini hidup di mana

Cuma di **`secrets.local.js`** (git-ignored, nggak ikut ke ZIP, nggak ikut ke commit):

```js
window.NAS_SECRETS = {
  groq: 'gsk_…', groq2: 'gsk_…', gemini: '…', nvidia: 'nvapi-…',
  DEMO_USERS: [
    { email: '…@neuralstudio.dev', pw: '…', name: 'Root Admin', role: 'admin', tier: 'enterprise' },
    { email: '…@neuralstudio.dev',  pw: '…', name: 'Demo User',  role: 'user',  tier: 'free' }
  ]   // ← shape-nya gini; nilainya cuma ada di file lu sendiri
};
```

`secrets.example.js` = template kosong (`admin@example.local` / `ganti-saya-123`).
Gate mekaniknya: `npm run test:secrets` → `test/secret-scan.mjs`, 12 pola (key prefix,
`password=`, `pw:"…"`, `.pem`, private-key header, dsb), sadar `.gitignore`, exit 1 kalau
nemu. Jangan pernah `git add -f secrets.local.js`.

## 3. Cara auth-nya kerja (dan kenapa ini bukan keamanan)

`assets/js/lib/auth.js`:

- password di-hash `SHA-256(salt + pw)` pake `crypto.subtle`, disimpen di `localStorage['nas1:users']`; salt per-user acak
- `login()` ngecek hash, nge-refresh `lastLogin`, nolak user `banned`
- **idempotent seeding**: seed cuma jalan kalau tabel user lokal masih **kosong**
- nggak ada `DEMO_USERS` sama sekali → mode signup-only, dan **akun pertama yang daftar jadi admin** (`role:'admin'`)
- `isAdmin()` → `role === 'admin'`; `quota()` balikin `∞` buat admin, jadi gate quota nggak pernah ngeblok panel
- semua panel admin (banned, tier override, broadcast, log) = **mutasi localStorage device itu**

Karena itu semua keputusan role ada di browser, ini **demo UI**, bukan kontrol akses. Deploy
beneran = NextAuth + kolom `Role` di Postgres + middleware di `app/api/*`
(peta-nya di `server/nextjs-map.md`, schema-nya di `server/schema.prisma`).

## 4. Kalau login demo "tidak ketemu"

Penyebab paling sering: lu udah pernah signup **sebelum** `secrets.local.js` dibikin, jadi
tabel user lokal udah nggak kosong dan seed-nya dilewatin.

```js
// console di halaman manapun
localStorage.removeItem('nas1:users'); localStorage.removeItem('nas1:session'); location.reload()
```

Cek lain: file beneran ada di root repo & nama file-nya persis `secrets.local.js`;
`<script src="secrets.local.js">` ada **sebelum** `config.js` (udah kepasang di 11 halaman);
`await NAS.ready` → `NAS.CFG.DEMO_USERS.length` harus 2. 404 di console = path-nya salah,
bukan bug app.

## 5. Panel admin: isi & yang perlu lu know

`admin.html` — link **Admin** selalu muncul di nav (10 link), isinya digate form login
role-admin. 6 tab, semua datanya live dari `localStorage['nas1:*']` — nggak ada endpoint
palsu:

- **Overview** — sparkline aktivitas/hari (21 hari), pemakaian per fitur, user teraktif, health provider
- **Users** (`cari email/nama…`) — tabel `user · role · tier · quota hari ini · keys · terakhir · aksi`;
  ban/unban, dropdown ganti tier (`free/pro/enterprise`, langsung ngubah limit), tambah user manual, ⤓ csv
- **Threads & images** — moderasi thread user (buka / ⤓ json / hapus) + galeri hasil generate
  (hapus per item, ↻ reload)
- **Event log** — `waktu · user · kind · detail`, 600 baris terakhir, ⤓ ndjson / clear. Yang di-log:
  `page`, `chat.*`, `photo.*`, `convert.*`, `auth.*`, `quota.block`
- **Keys** — semua API key milik semua user dalam satu view; cuma prefix yang ke-render, dan revoke di sini
- **System** — dump `konfigurasi runtime` (persist mode, bytes `nas1:*`, `quotaPolicy` = `n.CFG.QUOTA`),
  `provider health` per endpoint, dan `operasi berbahaya`: ⤓ snapshot DB lengkap / reset data user / factory reset (termasuk akun)

Health check-nya betulan manggil provider (`/api/health` + `/api/proxy`), jadi status `410`
yang muncul berarti model-nya emang EOL di sisi provider — bukan UI yang bohong.
Gate-nya nolak render panel kalau `role !== 'admin'`, tapi di build statis ini "nolak" artinya
cuma di UI — makanya ada warning merah di bawah form, jangan dihapus. Broadcast ke semua user
via Socket.io **belum** ada panelnya (SW cuma nanganin pesan `skip` buat update); itu sengaja
gue taro di roadmap Next.js — `server/nextjs-map.md`.


- **Dev proxy routes** — 14 route: `GET /api/health`, `POST /api/chat`, `POST /api/asr`, `POST /api/tts`, `GET /api/proxy`, `GET /api/fetch`, `GET /api/meta`, `GET /api/resolve`, `GET /api/oembed`, `GET /api/search`, `POST /api/billing/checkout` (stub — sengaja nggak pura-pura sukses), `GET /api/admin/events`, `GET /api/qr`, `GET /api/media/trim` (`501` sampe ffmpeg dipasang). Rate limit in-memory 90 req/menit/IP buat `/api/proxy`; rotasi `groq`→`groq2` pas kena `429`.

## 6. Checklist sebelum go-live

- [ ] 4 key di-rotate, nilai lama dihapus dari riwayat mana pun
- [ ] `secrets.local.js` di-*replace* isi DEMO_USERS-nya (atau hapus total → first-signup-admin)
- [ ] `npm run test:all` → `35/35`, `0 temuan`, `81/81`
- [ ] `NAS.CFG.BASE = '/api'` biar key nggak pernah nyasar ke browser
- [ ] NextAuth + Prisma (`server/schema.prisma`) + Redis buat rate limit
- [ ] `.env` production: `GROQ_API_KEY`, `GROQ_API_KEY_2`, `GEMINI_API_KEY`, `NVIDIA_API_KEY`
      (format di `.env.example`; jangan pernah masukin ke file client)
- [ ] Kalau lu mau downloader sosmed aktif: implement route-nya sendiri, jangan mirror
      tikwm/savett/izuka — ToS-nya mereka dan host-nya anonim
- [ ] Yang tetap nggak boleh diaktifin: voice clone, generator screenshot palsu
      (bank/DANA/GoPay/OVO/story) dari zip WA-bot, `nsfw`, `asupan/*`
