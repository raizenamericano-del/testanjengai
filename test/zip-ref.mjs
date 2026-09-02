/* Cross-check the browser zip writer against a reference implementation.
   node test/zip-ref.mjs && python3 -c "import zipfile;z=zipfile.ZipFile('/tmp/nas-ref.zip');print(z.testzip(),z.namelist());print(z.read('a/b.txt').decode())"
   If python prints None + the right names, real unzip tools (and MS Office) accept our archives. */
import fs from 'node:fs'; import vm from 'node:vm'; import zlib from 'node:zlib';
const files = ['assets/js/lib/config.js', 'assets/js/lib/ui.js', 'assets/js/lib/store.js', 'assets/js/lib/img.js'];
const G = {}; for (const k of ['TextEncoder', 'TextDecoder', 'URL', 'Blob', 'File', 'Response', 'crypto', 'atob', 'btoa', 'performance']) if (k in globalThis) G[k] = globalThis[k];
const sandbox = Object.assign({}, globalThis, G, { console, zlib }); sandbox.window = sandbox; sandbox.globalThis = sandbox;
const ctx = vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('test/00-stubs.js', 'utf8'), ctx, { filename: '00-stubs.js' });
for (const f of files) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
const N = sandbox.NAS, enc = new TextEncoder();
const payloads = { 'a/b.txt': 'isi y', 'big.png': 'x'.repeat(5000), 'prompts.json': JSON.stringify([{ p: 'hello', n: 1 }]) };
const entries = Object.entries(payloads).map(([name, s]) => ({ name, data: enc.encode(s) }));
const blob = N.zip(entries);
fs.writeFileSync('/tmp/nas-ref.zip', Buffer.from(await blob.arrayBuffer()));
for (const e of entries) {                            // self-check before asking python
  const dv = new DataView(e.data.buffer, e.data.byteOffset, e.data.byteLength);
  if (e.data.length > 8) { const crc = zlib.crc32(Buffer.from(e.data)) >>> 0; console.log(e.name, 'crc', crc.toString(16)); }
}
console.log('wrote /tmp/nas-ref.zip (' + blob.size + ' bytes) · names:', Object.keys(payloads).join(', '));
