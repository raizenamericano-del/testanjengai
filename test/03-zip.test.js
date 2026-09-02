/* ZIP writer/reader byte-layout tests (run: node test/run.mjs).
   Two real bugs these catch:
     1. unzip() scanned for EOCD magic 0x06054b4f ('PK\x05O') instead of 0x06054b50 → every docx/xlsx
        extraction and the unzip tool threw "Bukan arsip ZIP".
     2. entries were built from `new Uint8Array(await blob.arrayBuffer())`; a Blob's buffer can be a
        view into a larger pool, so payloads shifted → truncated/garbled files inside the archive. */

const LOC = 0x04034b50, CEN = 0x02014b50, EOCD = 0x06054b50;

function zipParse(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) if (dv.getUint32(i, true) === EOCD) { eocd = i; break; }
  if (eocd < 0) throw new Error('no EOCD — central-dir locator magic harus 0x' + EOCD.toString(16));
  const count = dv.getUint16(eocd + 10, true);
  const cdSize = dv.getUint32(eocd + 12, true);
  const cdOff = dv.getUint32(eocd + 16, true);
  if (cdOff + cdSize !== eocd) throw new Error('central dir offsets bohong: ' + cdOff + '+' + cdSize + ' != ' + eocd);
  const out = [];
  let p = cdOff;
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== CEN) throw new Error('bad central header at ' + p);
    /* PKZIP central directory: method@10 crc@16 csize@20 usize@24 nlen@28 elen@30 clen@32 lho@42 name@46 */
    const method = dv.getUint16(p + 10, true);
    const crc = dv.getUint32(p + 16, true);
    const csize = dv.getUint32(p + 20, true);
    const usize = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const lh = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nlen));
    if (dv.getUint32(lh, true) !== LOC) throw new Error('local header untuk ' + name + ' hilang (0x' + (dv.getUint32(lh, true) >>> 0).toString(16) + ')');
    const lnl = dv.getUint16(lh + 26, true), lel = dv.getUint16(lh + 28, true);
    out.push({ name, method, crc, csize, usize, start: lh + 30 + lnl + lel });
    p += 46 + nlen + elen + clen;
  }
  return out;
}

t('zip: writer menghasilkan arsip yang bisa di-parse, payload utuh', async () => {
  const NAS = globalThis.NAS, enc = new TextEncoder();
  const a = enc.encode('hello zip, this payload must survive round-trip intact');
  const b = enc.encode('x'.repeat(1000));
  const buf = await NAS.buf8(NAS.zip([{ name: 'a.txt', data: a }, { name: 'nested/dir/b.txt', data: b }]));
  ok(buf.length > 22, 'archive terlalu kecil');
  const ents = zipParse(buf);
  eq(ents.length, 2, 'jumlah entry');
  eq(ents[0].name, 'a.txt'); eq(ents[1].name, 'nested/dir/b.txt');
  const expect = { 'a.txt': a, 'nested/dir/b.txt': b };
  for (const e of ents) {
    const raw = buf.subarray(e.start, e.start + e.csize);
    eq(e.csize, expect[e.name].length, e.name + ' csize (bug lama: kepotong sepanjang nama file)');
    eq(e.usize, expect[e.name].length, e.name + ' usize');
    eq(Buffer.compare(Buffer.from(raw), Buffer.from(expect[e.name])), 0, e.name + ' bytes');
    eq(e.method, 0, 'stored');
  }
});

t('zip: crc32 tiap entry cocok dengan zlib.crc32', async () => {
  const zlib = globalThis.zlib;
  const NAS = globalThis.NAS, enc = new TextEncoder();
  const parts = ['alpha', 'bravo charlie', 'delta'.repeat(50)].map(s => enc.encode(s));
  const buf = await NAS.buf8(NAS.zip(parts.map((d, i) => ({ name: 'f' + i, data: d }))));
  zipParse(buf).forEach((e, i) => eq(e.crc >>> 0, zlib.crc32(Buffer.from(parts[i])) >>> 0, 'crc f' + i));
});

t('zip: arsip deflate manual ke-parse lewat magic yang sama (jalur docx/xlsx)', async () => {
  const zlib = globalThis.zlib;
  const NAS = globalThis.NAS, enc = new TextEncoder();
  const raw = enc.encode('neon '.repeat(400));
  const deflated = new Uint8Array(zlib.deflateRawSync(Buffer.from(raw)));
  const crc = zlib.crc32(Buffer.from(raw)) >>> 0;
  const name = enc.encode('d.txt');
  const lh = new Uint8Array(30 + name.length); const ldv = new DataView(lh.buffer);
  ldv.setUint32(0, LOC, true); ldv.setUint16(4, 20, true); ldv.setUint16(10, 8, true);
  ldv.setUint32(14, crc, true); ldv.setUint32(18, deflated.length, true); ldv.setUint32(22, raw.length, true); ldv.setUint16(26, name.length, true);
  lh.set(name, 30);
  const ch = new Uint8Array(46 + name.length); const cdv = new DataView(ch.buffer);
  cdv.setUint32(0, CEN, true); cdv.setUint16(4, 20, true); cdv.setUint16(6, 20, true); cdv.setUint16(10, 8, true);
  cdv.setUint32(16, crc, true); cdv.setUint32(20, deflated.length, true); cdv.setUint32(24, raw.length, true);
  cdv.setUint16(28, name.length, true); cdv.setUint32(42, 0, true); ch.set(name, 46);
  const eo = new Uint8Array(22); const edv = new DataView(eo.buffer);
  edv.setUint32(0, EOCD, true); edv.setUint16(8, 1, true); edv.setUint16(10, 1, true);
  edv.setUint32(12, ch.length, true); edv.setUint32(16, lh.length + deflated.length, true);
  const buf = new Uint8Array(lh.length + deflated.length + ch.length + eo.length);
  let p = 0; for (const part of [lh, deflated, ch, eo]) { buf.set(part, p); p += part.length; }
  const [e] = zipParse(buf);
  eq(e.method, 8, 'flag method ke-baca');
  const back = new Uint8Array(zlib.inflateRawSync(Buffer.from(buf.subarray(e.start, e.start + e.csize))));
  eq(Buffer.compare(Buffer.from(back), Buffer.from(raw)), 0, 'hasil inflate = payload asli');
  /* and the browser reader agrees with this parser (same offsets, same magic) */
  if (typeof NAS.ai?.unzip === 'function') {
    const files = await NAS.ai.unzip(new File([buf], 'x.zip', { type: 'application/zip' }));
    eq(Object.keys(files).join(','), 'd.txt', 'ai.unzip() nemuin entry-nya');
    eq(new TextDecoder().decode(files['d.txt']), new TextDecoder().decode(raw), 'ai.unzip() inflate bener');
  }
});

t('zip: writer ↔ ai.unzip round-trip (dua arah, multi entry)', async () => {
  const NAS = globalThis.NAS;
  if (typeof NAS.ai?.unzip !== 'function') return 'skip';
  const enc = new TextEncoder();
  const files = { 'x/y.txt': 'isi y', 'z.bin': String.fromCharCode(...Array.from({ length: 200 }, (_, i) => i % 256)) };
  const blob = NAS.zip(Object.entries(files).map(([name, s]) => ({ name, data: enc.encode(s) })));
  const got = await NAS.ai.unzip(new File([blob], 'rt.zip', { type: 'application/zip' }));
  for (const [k, v] of Object.entries(files)) eq(new TextDecoder().decode(got[k]), v, k + ' round-trip');
});

t('buf8: motong persis seukuran Blob walau buffer-nya gede', async () => {
  const NAS = globalThis.NAS;
  const pool = new ArrayBuffer(64);
  const view = new Uint8Array(pool, 16, 8);
  for (let i = 0; i < 8; i++) view[i] = 65 + i;
  const got = await NAS.buf8(new Blob([view]));
  eq(got.length, 8, 'panjang (new Uint8Array(ab) doang → ' + pool.byteLength + ')');
  eq(String.fromCharCode(...got), 'ABCDEFGH', 'isi');
});
