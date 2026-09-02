/* NEURAL AI STUDIO — copy to `secrets.local.js` (git-ignored) dan isi. File ini TIDAK pernah di-commit,
   makanya repo bisa lolos GitHub push protection.
   Cara cepat:  cp secrets.example.js secrets.local.js && $EDITOR secrets.local.js
   Semua halaman sudah menyematkan <script src="secrets.local.js"></script> sebelum config.js. */
window.NAS_SECRETS = {
  /* ---- provider keys (opsional: kosong = pakai localStorage/proxy) ---- */
  groq:   '',            // Groq console → API Keys (mulai "gsk_")
  groq2:  '',            // cadangan kalau primary kena 429
  gemini: '',            // Google AI Studio key
  nvidia: '',            // NVIDIA NIM — chat endpoint sedang EOL, lihat README

  /* ---- akun demo lokal (dipakai panel admin + form login) ----
     Cuma buat demo di device sendiri. Password ini TIDAK mengunci apa pun:
     auth-nya simulasi client-side. Untuk production ganti NextAuth + Prisma. */
  DEMO_USERS: [
    { email: 'admin@example.local', pw: 'ganti-saya-123', name: 'Root Admin', role: 'admin', tier: 'enterprise' },
    { email: 'demo@example.local',  pw: 'ganti-saya-123', name: 'Demo User',  role: 'user',  tier: 'free' }
  ]
};
