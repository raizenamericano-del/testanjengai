globalThis.__tests__ = [];
globalThis.__pass__ = 0; globalThis.__fail__ = 0; globalThis.__skip__ = 0;
globalThis.t = (name, fn) => globalThis.__tests__.push([name, fn]);
globalThis.__run__ = async (name, fn) => {
  try {
    const r = await fn();
    if (r === 'skip') { globalThis.__skip__++; console.log('  -  ' + name); return; }
    globalThis.__pass__++; console.log('PASS  ' + name);
  } catch (e) {
    globalThis.__fail__++;
    console.log('FAIL  ' + name + '\n      ' + ((e && e.message) || e) + '\n      ' + String((e && e.stack) || '').split('\n')[1]);
  }
};
globalThis.eq = (a, b, m) => { const j = (x) => typeof x === 'object' ? JSON.stringify(x) : String(x); if (j(a) !== j(b)) throw new Error((m || '') + ' dapat: ' + j(a) + ' | harus: ' + j(b)); };
globalThis.ok = (x, m) => { if (!x) throw new Error(m || 'harus truthy'); };
