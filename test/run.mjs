import fs from 'fs'; import path from 'path'; import vm from 'node:vm'; import zlib from 'node:zlib';
const files = ['assets/js/lib/config.js','assets/js/lib/ui.js','assets/js/lib/store.js','assets/js/lib/links.js','assets/js/lib/tools.js','assets/js/lib/auth.js','assets/js/lib/img.js','assets/js/lib/ai.js'];
const G = {}; for (const k of ['TextEncoder','TextDecoder','URL','URLSearchParams','crypto','Blob','File','Response','Request','FormData','fetch','atob','btoa','performance','FormData','ReadableStream','queueMicrotask','setTimeout','clearTimeout','Buffer','zlib','node:zlib','DecompressionStream','CompressionStream','Blob','File']) if (k in globalThis) G[k] = globalThis[k];
const sandbox = Object.assign({}, globalThis, G, { console }); sandbox.zlib = zlib; sandbox.Buffer = globalThis.Buffer;   // node builtins reachable without dynamic import inside vm
sandbox.window = sandbox; sandbox.globalThis = sandbox;
const ctx = vm.createContext(sandbox);
for (const t of fs.readdirSync('test').filter(f => /^\d\d-/.test(f) && f.endsWith('.js')).sort()) vm.runInContext(fs.readFileSync('test/' + t, 'utf8'), ctx, { filename: t });
for (const f of files) { try { vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f }); } catch (e) { console.error('LOAD FAIL', f, e.message); process.exit(1); } }
await (async () => { for (const [name, fn] of sandbox.__tests__) await sandbox.__run__(name, fn); })();
const fmt = (pass, fail, skip) => (fail ? '\nFAIL: ' + fail + ' gagal, ' + pass + ' lolos, ' + skip + ' skip' : '\nPASS: ' + pass + ' test lolos (' + skip + ' skip)');
console.log(fmt(sandbox.__pass__, sandbox.__fail__, sandbox.__skip__));
process.exit(sandbox.__fail__ ? 1 : 0);
