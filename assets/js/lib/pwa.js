/* NEURAL AI STUDIO — PWA registration + install prompt + offline toast. Safe to include on every page. */
(function () {
  if (!('serviceWorker' in navigator)) return;
  const isLocal = location.protocol === 'file:';
  if (isLocal) return;                     // SW needs a secure origin; file:// has none
  addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw && nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller && window.NAS) window.NAS.ui.toast('Update siap — reload buat muat versi baru.', 'ok', 8000);
        });
      });
    } catch (e) { /* preview iframe often blocks SW: fine */ }
  });
  let deferred = null;
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferred = e;
    if (!window.NAS) return;
    window.NAS.canInstall = () => { if (!deferred) return Promise.resolve(false); deferred.prompt(); return deferred.userChoice.then(c => { deferred = null; return c.outcome === 'accepted'; }); };
    const bar = window.NAS.h('div.card', { style: { position: 'fixed', left: '12px', right: '12px', bottom: '12px', zIndex: '120', display: 'flex', gap: '10px', alignItems: 'center', maxWidth: '520px', margin: '0 auto' } }, [
      window.NAS.h('span.small', { style: { flex: 1 }, text: 'Pasang sebagai aplikasi? Jalan offline buat UI + tool.' }),
      window.NAS.h('button.btn.sm.pri', { text: 'Install', onclick: async () => { const ok = await window.NAS.canInstall(); window.NAS.ui.toast(ok ? 'Terpasang ✓' : 'Ditolak — masih bisa diakses dari browser.', ok ? 'ok' : 'warn'); bar.remove(); } }),
      window.NAS.h('button.btn.sm.gho', { text: 'Nanti', onclick: () => bar.remove() })
    ]);
    setTimeout(() => document.body.appendChild(bar), 1800);
  });
  addEventListener('offline', () => window.NAS && window.NAS.ui.toast('Offline — provider AI & fetch tidak bisa dipakai, tapi 28 tool lokal tetap jalan.', 'warn', 6000));
  addEventListener('online', () => window.NAS && window.NAS.ui.toast('Online lagi ✓', 'ok', 2500));
})();
