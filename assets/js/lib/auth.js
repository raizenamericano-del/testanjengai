/* NEURAL AI STUDIO — auth (CLIENT-SIDE DEMO ONLY).
   This is a simulation of the real flow so the UI/quotas/admin panel can be built and tested
   today. It is NOT secure: never trust a browser check for anything real.
   Real stack = NextAuth.js (Google/GitHub) + Prisma User table + server-side quota middleware.
   Demo accounts are NOT hardcoded here anymore — they come from NAS.CFG.DEMO_USERS, which
   is folded from window.NAS_SECRETS (secrets.local.js, git-ignored). No seed file → no demo
   login, and the first signup becomes admin. Delete the seed before this touches the net. */
(function (n) {
  const enc = new TextEncoder();

  async function sha256(s) {
    const b = await crypto.subtle.digest('SHA-256', enc.encode(s));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  n.sha256 = sha256;

  const SALT = 'nas::demo::v1::';           // real impl: per-user bcrypt/argon2id server side
  const hash = (pw) => sha256(SALT + pw + SALT);

  /* Demo accounts are NOT in this repo. Put them in secrets.local.js (git-ignored):
       window.NAS_SECRETS = { DEMO_USERS: [{ email, pw, name, role, tier }, …] }
     init() seeds them into localStorage on first run. Empty list → signup-only mode,
     and the first account that signs up becomes admin (see signup). */
  const SEED = () => (n.CFG.DEMO_USERS || []);

  const b62 = (len) => {
    const A = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
    const r = crypto.getRandomValues(new Uint8Array(len));
    return [...r].map(x => A[x % A.length]).join('');
  };

  n.auth = {
    hash,
    list: () => n.store.users.all(),
    me: () => { const s = n.store.session.get(); return s ? n.store.users.get(s.id) || null : null; },
    async init() {
      if (!n.store.users.all().length) {
        for (const u of SEED()) {
          n.store.users.put({
            id: n.uid('usr'), email: u.email, name: u.name, role: u.role, tier: u.tier,
            pwHash: await hash(u.pw), createdAt: Date.now(), lastLogin: null, apiKeys: [], banned: false
          });
        }
      }
      /* seed is idempotent: only runs when the local user table is still empty */
      return n.store.users.all();
    },
    async login(email, pw) {
      email = String(email || '').trim().toLowerCase();
      const users = await n.auth.init();
      const u = users.find(x => x.email === email);
      if (!u) { const e = new Error('Akun ' + email + ' tidak ada di device ini.'); e.code = 'nouser'; throw e; }
      if (u.banned) { const e = new Error('Akun diblokir. Hubungi admin.'); e.code = 'banned'; throw e; }
      if (u.pwHash !== await hash(pw)) { const e = new Error('Password salah.'); e.code = 'badpw'; throw e; }
      n.store.users.put({ ...u, lastLogin: Date.now() });
      n.store.session.set({ id: u.id });
      n.store.log('auth.login', 'login ' + email);
      n.ui.quotaPill();
      return n.store.users.get(u.id);
    },
    async signup({ email, pw, name, tier }) {
      email = String(email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s.]+\.[a-z]{2,}$/i.test(email)) { const e = new Error('Email tidak valid.'); e.code = 'email'; throw e; }
      if (String(pw).length < 8) { const e = new Error('Password minimal 8 karakter.'); e.code = 'weak'; throw e; }
      const users = await n.auth.init();
      if (users.some(u => u.email === email)) { const e = new Error('Email sudah dipakai.'); e.code = 'exists'; throw e; }
      const u = n.store.users.put({
        id: n.uid('usr'), email, name: name || email.split('@')[0],
        role: users.length ? 'user' : (SEED().length ? 'user' : 'admin'),   // no demo seed → first signup owns the box
        tier: tier || 'free', pwHash: await hash(pw), createdAt: Date.now(), lastLogin: Date.now(), apiKeys: [], banned: false
      });
      n.store.session.set({ id: u.id });
      n.store.log('auth.signup', 'register ' + email + ' (' + u.tier + ')');
      n.ui.quotaPill();
      return u;
    },
    logout() { n.store.session.set(null); location.href = 'index.html'; },
    isAdmin() { const m = n.auth.me(); return !!m && m.role === 'admin'; },
    tier() { const m = n.auth.me(); return m ? m.tier : 'free'; },
    quota() {
      const lim = n.CFG.QUOTA[n.auth.tier()] ?? 100;
      const u = n.store.usage();
      return { used: u.n, limit: lim, left: lim === Infinity ? Infinity : Math.max(0, lim - u.n), tier: n.auth.tier() };
    },
    setTier(tier) { const m = n.auth.me(); if (!m) return; n.store.users.put({ ...m, tier }); n.ui.quotaPill(); },

    /* ---- API keys: stored as sha256 hash, plaintext shown once ---- */
    async createKey(label, rate) {
      const m = n.auth.me(); if (!m) throw new Error('Login dulu.');
      const key = 'nas_live_' + b62(28);
      const row = { id: n.uid('key'), key, keyHash: await hash(key), label: label || 'default', rate: rate || 100, createdAt: Date.now(), lastUsed: null, calls: 0, revoked: false, owner: m.email };
      n.store.keys.put(row);
      n.store.users.put({ ...m, apiKeys: [...(m.apiKeys || []), row.id] });
      n.store.log('apikey.create', row.label);
      return row;
    },
    revealKeys() { return n.store.keys.all().map(k => ({ ...k, key: k.key.slice(0, 12) + '•'.repeat(12) })); },
    revokeKey(id) { const k = n.store.keys.get(id); if (k) n.store.keys.put({ ...k, revoked: true }); },
    async validateKey(key) {
      const h = await hash(String(key || '').trim());
      const k = n.store.keys.all().find(x => x.keyHash === h && !x.revoked);
      if (!k) return { ok: false, error: 'invalid_key' };
      n.store.keys.put({ ...k, lastUsed: Date.now(), calls: k.calls + 1 });
      return { ok: true, key: k };
    }
  };

  /* server-shaped helper: X-API-Key auth for /api routes */
  n.auth.apiFetch = async function (path, opts) {
    const key = n.$('#apiKeyInput') && n.$('#apiKeyInput').value.trim();
    if (key) {
      const v = await n.auth.validateKey(key);
      if (!v.ok) { const e = new Error('API key ditolak (revoked / tidak dikenal).'); e.code = 'key'; throw e; }
    }
    return fetch(path, opts);
  };
})(window.NAS);
