/* minimal browser stand-ins so the lib files can be evaluated in Node */
globalThis.window = globalThis;
globalThis.NAS = {};
const fakeEl = () => new Proxy({ style: {}, dataset: {}, classList: { add(){},remove(){},toggle(){} }, appendChild(){}, addEventListener(){}, getContext: () => null }, {
  get(t, k) { if (k in t) return t[k]; return typeof k === 'string' && /^(set|get)/.test(k) ? t[k] : undefined; },
  set(t, k, v) { t[k] = v; return true; }
});
globalThis.document = {
  createElement: fakeEl, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  addEventListener(){}, head: fakeEl(), body: fakeEl(), documentElement: fakeEl()
};
globalThis.location = { origin: 'http://x', pathname: '/app/chat.html', href: 'http://x/app/chat.html' };
globalThis.addEventListener = () => {};
globalThis.matchMedia = () => ({ matches: false });
globalThis.devicePixelRatio = 1;
