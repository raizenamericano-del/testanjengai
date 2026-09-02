/* NEURAL AI STUDIO — runtime config.
   ⚠️  File ini SENGAJA kosong. Apa pun yang ada di file publik bisa dibaca lewat
   view-source, jadi key & password akun masuk lewat window.NAS_SECRETS (secrets.local.js,
   git-ignored) atau override di localStorage, dan produksi idealnya lewat server proxy
   (set BASE='/api'). Lihat README ▸ Secrets. */
window.NAS = window.NAS || {};

NAS.CFG = {
  APP: 'NEURAL AI STUDIO',
  VERSION: '1.0.0-sable',
  BUILD: '2026.09.02',

  /* when present, all provider calls are routed through this proxy instead of the browser */
  BASE: '',                      // e.g. '/api'  (server/api/chat proxy — recommended)

  /* NO KEYS IN THIS FILE. GitHub's push protection blocks repos that carry them, and rightly so.
     Provide keys in one of three ways (first match wins):
       1. secrets.local.js  → window.NAS_SECRETS = { groq:'gsk_…', gemini:'…' }   (git-ignored)
       2. localStorage      → Settings ▸ keys di account.html (per-device, tidak ke-sync)
       3. server env         → NAS.CFG.BASE = '/api' + server/dev-proxy.mjs (paling bener)
     .env.example nunjukin format-nya. */
  KEYS: {},
  /* demo accounts are seeded from secrets.local.js too, so no password sits in the repo */
  DEMO_USERS: [],

  /* verified against the live APIs on 2026-09-02 — see README "what actually works" */
  PROVIDERS: {
    groq: {
      name: 'Groq', base: 'https://api.groq.com/openai/v1', kind: 'openai',
      chat: [
        { id: 'openai/gpt-oss-120b',  label: 'GPT-OSS 120B', note: 'flagship, reasoning' },
        { id: 'openai/gpt-oss-20b',   label: 'GPT-OSS 20B',  note: 'fast' },
        { id: 'qwen/qwen3.6-27b',     label: 'Qwen3.6 27B',  note: 'steerable reasoning' },
        { id: 'groq/compound',        label: 'Groq Compound', note: 'agent tool-use' }
      ],
      stt: ['whisper-large-v3-turbo', 'whisper-large-v3'],
      tts: ['canopylabs/orpheus-v1-english', 'canopylabs/orpheus-arabic-saudi']
    },
    gemini: {
      name: 'Google Gemini', base: 'https://generativelanguage.googleapis.com/v1beta', kind: 'google',
      chat: [
        { id: 'gemini-2.5-flash',     label: 'Gemini 2.5 Flash',     note: 'vision in' },
        { id: 'gemini-2.5-pro',       label: 'Gemini 2.5 Pro',       note: '1M ctx' }
      ],
      image: ['gemini-2.5-flash-image', 'gemini-3.1-flash-image', 'gemini-3-pro-image']
    },
    nvidia: {
      name: 'NVIDIA NIM', base: 'https://integrate.api.nvidia.com/v1', kind: 'openai',
      chat: [], image: [],
      note: 'Checked 2026-09-02: NIM /v1/models lists 82 text models but every chat route returns '
          + 'HTTP 410 "reached its end of life on 2026-08-26", and /v1/images/generations is 404 '
          + '(no FLUX/SD entitlement on this key). Wired but kept disabled by default.'
    }
  },

  DEFAULT_CHAT: 'openai/gpt-oss-20b',
  DEFAULT_IMAGE: 'gemini-2.5-flash-image',

  QUOTA: { free: 100, pro: 10000, enterprise: Infinity },
  TIERS: {
    free:       { name: 'Free',       price: 0,  blurb: 'Cocok buat nyobain.', perks: ['100 request / hari','Chat + semua utility tools','Watermark di export'] },
    pro:        { name: 'Pro',        price: 19, blurb: 'Buat kreator & dev harian.', perks: ['10.000 request / hari','Batch generate + HD upscale','API key sendiri','Tanpa watermark'] },
    enterprise: { name: 'Enterprise', price: 99, blurb: 'Tim & produksi.', perks: ['Unlimited request','SSO + audit log','SLA + dedicated worker','Self-host / on-prem'] }
  }
};

/* read-only view of the keys (masked) — never print raw keys in the UI */
/* fold whatever secrets.local.js injected into the config (it loads BEFORE this file) */
(function (sec) {
  if (!sec) return;
  if (Array.isArray(sec.DEMO_USERS)) NAS.CFG.DEMO_USERS = sec.DEMO_USERS;
  for (const k of ['groq', 'groq2', 'gemini', 'nvidia']) if (sec[k]) NAS.CFG.KEYS[k] = sec[k];
  if (sec.BASE) NAS.CFG.BASE = sec.BASE;
})(window.NAS_SECRETS);

/* ---- key resolution: injected global → localStorage override → config → proxy ----
   (localStorage is unavailable on file:// and in sandboxes → fall back to the store's
   memory persistence, so the Settings panel never silently loses what you typed.) */
const MEM = {};
const hasLS = (() => { try { return !!window.localStorage; } catch (e) { return false; } })();
const lsGet = () => {
  try { return hasLS ? JSON.parse(window.localStorage.getItem('nas1:keyoverrides') || '{}') : (window.NAS?.store?.settings?.get?.().keyOverrides || MEM || {}); }
  catch (e) { return MEM || {}; }
};
const lsSet = (o) => {
  MEM.obj = o;
  try { if (hasLS) window.localStorage.setItem('nas1:keyoverrides', JSON.stringify(o)); } catch (e) { }
  try { if (window.NAS?.store?.settings) window.NAS.store.settings.set({ keyOverrides: o }); } catch (e) { }
};
NAS.keyFor = function (p) {
  if (NAS.CFG.BASE) return '';                       // proxy mode: the server holds the keys
  const ov = lsGet();
  return ov[p] || (window.NAS_SECRETS || {})[p] || NAS.CFG.KEYS[p] || '';
};
NAS.setKey = function (p, v) {
  const ov = Object.assign({}, lsGet());
  if (v) ov[p] = v; else delete ov[p];
  lsSet(ov); NAS.CFG.KEYS[p] = v || '';
  return !!v;
};
NAS.clearKeys = () => { lsSet({}); Object.keys(NAS.CFG.KEYS).forEach(k => NAS.CFG.KEYS[k] = ''); };
NAS.keyInfo = function () {
  const src = (k) => { const o = lsGet(); if (o[k]) return hasLS ? 'localStorage' : 'memory'; if ((window.NAS_SECRETS || {})[k]) return 'secrets.local.js'; return null; };
  const out = {};
  for (const k of ['groq', 'groq2', 'gemini', 'nvidia']) {
    const v = NAS.keyFor(k);
    out[k] = v ? { set: true, masked: v.slice(0, 5) + '…' + v.slice(-3), len: v.length, from: src(k) || (NAS.CFG.BASE ? 'server env' : 'config') } : { set: false };
  }
  return out;
};
NAS.hasKey = (p) => !!(NAS.keyFor(p) || (NAS.CFG.BASE && NAS.CFG.BASE.length));
