/* NEURAL AI STUDIO — image generation + client-side editing pipeline.
   gen(): Gemini image models (verified reachable; entitlement/quota dependent).
   NVIDIA FLUX is kept behind the proxy because integrate.api.nvidia.com sends no CORS and the
   key currently has no image entitlement — see README.
   edit(): real canvas algorithms, no server round-trip. */
(function (n) {
  const C = () => n.CFG;
  const STYLE_PROMPTS = {
    'Default': '', 'Realistic': 'photorealistic, 85mm lens, natural skin texture, soft daylight',
    'Anime': 'anime key art, clean lineart, cel shading, studio-quality',
    'Cyberpunk': 'cyberpunk night city, neon rim light, rain reflections, volumetric haze',
    'Painting': 'oil painting, impasto brush strokes, canvas texture',
    '3D Render': 'octane 3d render, subsurface scattering, studio hdri, clay-like materials',
    'Pixel Art': '16-bit pixel art, limited palette, dithering',
    'Isometric': 'isometric diorama, tilt-shift, pastel palette, soft shadows',
    'Ink': 'japanese ink wash, sumi-e, high contrast negative space'
  };
  n.img = { STYLE_PROMPTS };

  /* ---------------- generation ---------------- */
  n.img.generate = async function ({ prompt, negative, style, aspect, model, reference }) {
    n.store.bumpUsage('image');
    const full = [prompt, style && STYLE_PROMPTS[style], negative ? ('avoid: ' + negative) : '',
      aspect ? ('composition in a ' + aspect + ' frame') : ''].filter(Boolean).join('. ');
    const m = model || n.store.settings.get().imageModel;
    const parts = [{ text: full }];
    if (reference) parts.push({ inline_data: { mime_type: reference.type || 'image/png', data: reference.b64 } });
    const url = C().PROVIDERS.gemini.base + '/models/' + m + ':generateContent';
    let r;
    try {
      r = await fetch(url, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': C().KEYS.gemini },
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } })
      });
    } catch (e) { throw Object.assign(new Error('Gagal menghubungi provider gambar.'), { cause: e }); }
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      const msg = j?.error?.message || ('HTTP ' + r.status);
      const err = new Error(msg);
      err.status = r.status;
      err.hint = r.status === 429
        ? 'Kuota gratis ' + m + ' habis / rate-limited. Coba model image lain di panel kanan, atau jalankan proxy + NVIDIA FLUX.'
        : 'Model ' + m + ' tidak bisa diakses key ini. Cek README → "image providers".';
      throw err;
    }
    const j = await r.json();
    const op = (j.candidates?.[0]?.content?.parts || []);
    const img = op.find(p => p.inlineData || p.inline_data);
    const note = op.filter(p => p.text).map(p => p.text).join(' ').trim();
    if (!img) throw Object.assign(new Error('Provider tidak mengembalikan gambar.' + (note ? ' Catatan: ' + note.slice(0, 200) : '') + ' (finishReason=' + (j.candidates?.[0]?.finishReason || '?') + ')'), { status: 502 });
    const d = img.inlineData || img.inline_data;
    return { dataUrl: 'data:' + (d.mimeType || d.mime_type) + ';base64,' + d.data, model: m, prompt: full, note };
  };

  /* batch with concurrency guard (free tiers die at 4+ parallel requests) */
  n.img.batch = async function (opts, count, onEach) {
    const items = [];
    for (let i = 0; i < count; i++) {
      const one = await n.img.generate({ ...opts, prompt: count > 1 ? opts.prompt + ' (variation ' + (i + 1) + ')' : opts.prompt });
      items.push(one); onEach && onEach(one, i, count);
    }
    return items;
  };

  /* ---------------- canvas helpers ---------------- */
  n.img.load = (src) => new Promise((res, rej) => {
    const im = new Image();
    if (!src.startsWith('data:')) im.crossOrigin = 'anonymous';
    im.onload = () => res(im); im.onerror = () => rej(new Error('Gagal memuat gambar (mungkin di-block CORS host asal).'));
    im.src = src;
  });
  n.img.canvasOf = (w, h) => { const c = n.h('canvas'); c.width = Math.round(w); c.height = Math.round(h); return c; };
  n.img.ctx = (c) => c.getContext('2d', { willReadFrequently: true });
  n.img.dataUrl = async (canvas, type = 'image/png', q) => type === 'image/png' ? canvas.toDataURL() : canvas.toDataURL(type, q ?? .92);

  n.img.paint = function (host, src) {
    host.innerHTML = '';
    return n.img.load(src).then(im => {
      const scale = Math.min(1, 1024 / Math.max(im.width, im.height));
      const c = n.img.canvasOf(im.width * scale, im.height * scale);
      n.img.ctx(c).drawImage(im, 0, 0, c.width, c.height);
      c.classList.add('cv');
      host.appendChild(c);
      return c;
    });
  };

  /* ---------------- operations (real algorithms) ---------------- */
  const op = n.img.op = {
    upscale(canvas, factor = 2, sharpen = .35) {
      const s = canvas.width * factor, t = canvas.height * factor;
      const a = n.img.canvasOf(s, t), ac = n.img.ctx(a);
      ac.imageSmoothingEnabled = true; ac.imageSmoothingQuality = 'high';
      ac.drawImage(canvas, 0, 0, s, t);
      if (sharpen > 0) {
        const d = ac.getImageData(0, 0, s, t), o = new Uint8ClampedArray(d.data);
        const w = s, k = [0, -sharpen, 0, -sharpen, 1 + 4 * sharpen, -sharpen, 0, -sharpen, 0];
        for (let y = 1; y < t - 1; y++) for (let x = 1; x < w - 1; x++) {
          for (let c = 0; c < 3; c++) {
            let acc = 0;
            for (let i = 0; i < 9; i++) acc += o[((y + Math.floor(i / 3) - 1) * w + (x + i % 3 - 1)) * 4 + c] * k[i];
            d.data[(y * w + x) * 4 + c] = acc;
          }
        }
        ac.putImageData(d, 0, 0);
      }
      return a;
    },
    /* luminance/contrast/curves-ish "enhancer": auto levels + saturation + unsharp */
    enhance(canvas, { levels = .6, sat = 1.12, warm = 0, clarity = .4 } = {}) {
      const c = n.img.canvasOf(canvas.width, canvas.height), x = n.img.ctx(c);
      x.drawImage(canvas, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height), a = d.data;
      let min = 255, max = 0, hist = new Uint32Array(256);
      for (let i = 0; i < a.length; i += 4) { const l = (a[i] * .299 + a[i + 1] * .587 + a[i + 2] * .114) | 0; hist[l]++; }
      const total = a.length / 4, cut = total * (1 - levels) / 2;
      let lo = 0, hi = 255, acc = 0;
      for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= cut) { lo = i; break; } }
      acc = 0; for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= cut) { hi = i; break; } }
      hi = Math.max(hi, lo + 1);
      const g = 255 / (hi - lo);
      for (let i = 0; i < a.length; i += 4) {
        let r = (a[i] - lo) * g, gg = (a[i + 1] - lo) * g, b = (a[i + 2] - lo) * g;
        const l = r * .299 + gg * .587 + b * .114;
        r = l + (r - l) * sat + warm * 10; gg = l + (gg - l) * sat; b = l + (b - l) * sat - warm * 10;
        a[i] = Math.max(0, Math.min(255, r)); a[i + 1] = Math.max(0, Math.min(255, gg)); a[i + 2] = Math.max(0, Math.min(255, b));
      }
      x.putImageData(d, 0, 0);
      if (clarity > 0) {
        const src = x.getImageData(0, 0, c.width, c.height);
        const blur = n.img.canvasOf(c.width, c.height); n.img.ctx(blur).filter = 'blur(' + (1 + clarity * 2).toFixed(1) + 'px)';
        n.img.ctx(blur).drawImage(c, 0, 0);
        x.globalCompositeOperation = 'difference'; x.drawImage(blur, 0, 0);
        x.globalCompositeOperation = 'overlay'; x.globalAlpha = clarity; x.drawImage(blur, 0, 0);
        x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
        void src;
      }
      return c;
    },
    /* black & white → colour: per-region tint from a 5×5 palette the model/user picks.
       Honest label: heuristic chroma map, not a trained DeOldify. */
    colorize(canvas, strength = .45, tint = { r: 1.06, g: 1.0, b: .93 }) {
      const c = n.img.canvasOf(canvas.width, canvas.height), x = n.img.ctx(c);
      x.drawImage(canvas, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height), a = d.data;
      const w = c.width, bs = 8, bw = Math.ceil(w / bs), bh = Math.ceil(c.height / bs);
      const band = new Float32Array(bw * bh);
      for (let y = 0; y < c.height; y += bs) for (let xx = 0; xx < w; xx += bs) {
        let sum = 0, cnt = 0;
        for (let j = y; j < Math.min(y + bs, c.height); j += 2) for (let i = xx; i < Math.min(xx + bs, w); i += 2) { sum += a[(j * w + i) * 4]; cnt++; }
        band[(y / bs) * bw + (xx / bs)] = cnt ? sum / cnt : 128;
      }
      const sky = (() => { let s = 0, k = 0; for (let i = 0; i < bw * 2; i++) { s += band[i]; k++; } return k ? s / k : 128; })();
      const warm = (sky > 150) ? 1 : .4;
      for (let i = 0; i < a.length; i += 4) {
        const l = a[i] * .299 + a[i + 1] * .587 + a[i + 2] * .114;
        const px = (i / 4) % w, py = Math.floor((i / 4) / w);
        const b = band[Math.min(bh - 1, (py / bs) | 0) * bw + Math.min(bw - 1, (px / bs) | 0)] || 128;
        const grassish = b > 60 && b < 170 && py / c.height > .45 ? 1 : 0;
        let r = l * tint.r, g = l * tint.g, bl = l * tint.b;
        r += (l - b) * .3 + 18 * warm * (l / 255); g += grassish * 12 * (l / 255); bl += (b < 90 ? 6 : 14) * (1 - l / 255) * .5;
        a[i] = l + (r - l) * strength; a[i + 1] = l + (g - l) * strength; a[i + 2] = l + (bl - l) * strength;
      }
      x.putImageData(d, 0, 0);
      return c;
    },
    /* background removal: flood fill from the borders in Lab-ish distance (works on plain/studio bg) */
    removeBg(canvas, tol = 42, feather = 1.4) {
      const c = n.img.canvasOf(canvas.width, canvas.height), x = n.img.ctx(c);
      x.drawImage(canvas, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height), a = d.data, w = c.width, hh = c.height;
      const seen = new Uint8Array(w * hh);
      /* sample the 4 edge strips for a background colour estimate */
      let br = 0, bg2 = 0, bb = 0, bn = 0;
      const sample = (i) => { br += a[i]; bg2 += a[i + 1]; bb += a[i + 2]; bn++; };
      for (let i = 0; i < w; i++) { sample(i * 4); sample(((hh - 1) * w + i) * 4); }
      for (let i = 0; i < hh; i++) { sample((i * w) * 4); sample((i * w + w - 1) * 4); }
      br /= bn; bg2 /= bn; bb /= bn;
      const q = [[0, 0], [w - 1, 0], [0, hh - 1], [w - 1, hh - 1]];
      const stack = [];
      for (let y = 0; y < hh; y++) for (let xx = 0; xx < w; xx++) {
        if (y !== 0 && y !== hh - 1 && xx !== 0 && xx !== w - 1) continue;
        stack.push(y * w + xx);
      }
      void q;
      const near = (i) => {
        const dr = a[i * 4] - br, dg = a[i * 4 + 1] - bg2, db = a[i * 4 + 2] - bb;
        return Math.sqrt(dr * dr * .9 + dg * dg * 1.1 + db * db * .8) < tol * 2.2;
      };
      while (stack.length) {
        const p = stack.pop();
        if (seen[p]) continue; seen[p] = 1;
        if (!near(p)) continue;
        a[p * 4 + 3] = 0;
        const px = p % w, py = (p / w) | 0;
        if (px > 0) stack.push(p - 1); if (px < w - 1) stack.push(p + 1);
        if (py > 0) stack.push(p - w); if (py < hh - 1) stack.push(p + w);
      }
      /* soft halo: darken alpha next to kept pixels */
      if (feather > 0) {
        const keep = new Uint8Array(w * hh);
        for (let i = 0; i < w * hh; i++) keep[i] = a[i * 4 + 3] > 10 ? 1 : 0;
        for (let y = 1; y < hh - 1; y++) for (let xx = 1; xx < w - 1; xx++) {
          const p = y * w + xx; if (keep[p]) continue;
          const edge = keep[p - 1] + keep[p + 1] + keep[p - w] + keep[p + w];
          if (edge) { a[p * 4 + 3] = Math.min(a[p * 4 + 3] + edge * 28 * feather, 255 * feather * .5); }
        }
      }
      /* autocrop */
      let x0 = w, y0 = hh, x1 = 0, y1 = 0;
      for (let y = 0; y < hh; y++) for (let xx = 0; xx < w; xx++) if (a[(y * w + xx) * 4 + 3] > 24) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 > x0 && y1 > y0) {
        const c2 = n.img.canvasOf(x1 - x0 + 1, y1 - y0 + 1);
        n.img.ctx(c2).drawImage(c, x0, y0, c2.width, c2.height, 0, 0, c2.width, c2.height);
        return c2;
      }
      return c;
    },
    /* style transfer: posterise + palette quantise + edge sketch blend */
    stylize(canvas, kind = 'ghibli', strength = .75) {
      const preset = {
        ghibli: { q: 12, sat: 1.25, blur: .6, tint: [232, 245, 214], edge: .25 },
        comic: { q: 5, sat: 1.5, blur: 0, tint: [255, 250, 235], edge: .85 },
        oil: { q: 22, sat: 1.15, blur: 1.8, tint: [250, 232, 200], edge: .1 },
        blueprint: { q: 9, sat: .2, blur: 0, tint: [40, 90, 190], edge: .9 },
        duotone: { q: 16, sat: .05, blur: 0, tint: [30, 20, 60], edge: .2 },
        pixel: { q: 10, sat: 1.3, blur: 0, tint: [255, 255, 255], edge: .1, px: Math.max(2, Math.round(canvas.width / 160)) }
      }[kind] || { q: 12, sat: 1.2, blur: .8, tint: [255, 255, 255], edge: .3 };
      const c = n.img.canvasOf(canvas.width, canvas.height), x = n.img.ctx(c);
      x.drawImage(canvas, 0, 0);
      if (preset.px) {
        const s = Math.max(1, Math.floor(canvas.width / preset.px));
        const small = n.img.canvasOf(s, Math.max(1, Math.floor(canvas.height / preset.px)));
        n.img.ctx(small).drawImage(c, 0, 0, s, small.height);
        x.imageSmoothingEnabled = false; x.clearRect(0, 0, c.width, c.height);
        x.drawImage(small, 0, 0, c.width, c.height);
      }
      const d = x.getImageData(0, 0, c.width, c.height), a = d.data;
      for (let i = 0; i < a.length; i += 4) {
        let r = a[i], g = a[i + 1], b = a[i + 2];
        const l = r * .299 + g * .587 + b * .114;
        r = l + (r - l) * preset.sat; g = l + (g - l) * preset.sat; b = l + (b - l) * preset.sat;
        const step = 255 / preset.q;
        r = Math.round(r / step) * step; g = Math.round(g / step) * step; b = Math.round(b / step) * step;
        a[i] = r * (1 - strength) + (r * preset.tint[0] / 255) * strength;
        a[i + 1] = g * (1 - strength) + (g * preset.tint[1] / 255) * strength;
        a[i + 2] = b * (1 - strength) + (b * preset.tint[2] / 255) * strength;
      }
      x.putImageData(d, 0, 0);
      if (preset.edge > .15) {
        const e = n.img.canvasOf(c.width, c.height), ex = n.img.ctx(e);
        ex.filter = 'grayscale(1) invert(1)'; ex.drawImage(c, 0, 0);
        const ed = ex.getImageData(0, 0, e.width, e.height), ea = ed.data;
        const bd = n.img.ctx(c).getImageData(0, 0, c.width, c.height).data;
        for (let i = 0; i < ea.length; i += 4) {
          const px = (i / 4) % c.width, py = ((i / 4) / c.width) | 0;
          const idx = (y, xx) => ((y * c.width + xx) * 4);
          const gx = Math.abs(bd[idx(py, Math.min(c.width - 1, px + 1))] - bd[idx(py, Math.max(0, px - 1))]);
          const gy = Math.abs(bd[idx(Math.min(c.height - 1, py + 1), px)] - bd[idx(Math.max(0, py - 1), px)]);
          const m = Math.min(255, (gx + gy) * 1.6);
          ea[i] = 255 - m; ea[i + 1] = 255 - m; ea[i + 2] = 255 - m;
        }
        ex.putImageData(ed, 0, 0);
        x.globalCompositeOperation = 'multiply'; x.globalAlpha = preset.edge; x.drawImage(e, 0, 0);
        x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
      }
      return c;
    },
    /* object removal: lasso (soft brush) → median-fill from surrounding ring */
    inpaint(canvas, mask, radius = 26) {
      const c = n.img.canvasOf(canvas.width, canvas.height), x = n.img.ctx(c);
      x.drawImage(canvas, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height), a = d.data;
      const m = n.img.ctx(mask).getImageData(0, 0, c.width, c.height).data;
      const w = c.width, hh = c.height;
      const at = (i, j) => ((Math.max(0, Math.min(hh - 1, i)) * w) + Math.max(0, Math.min(w - 1, j)));
      for (let y = 0; y < hh; y++) for (let xx = 0; xx < w; xx++) {
        const p = y * w + xx;
        if (m[p * 4 + 3] < 60) continue;
        const r = Math.round(radius * (0.6 + Math.random() * .3));
        const s = [0, 0, 0], c2 = 0;
        for (let ang = 0; ang < 12; ang++) {
          const ux = Math.round(xx + Math.cos(ang) * r), uy = Math.round(y + Math.sin(ang) * r);
          const q = at(uy, ux);
          if (m[q * 4 + 3] > 60) continue;
          s[0] += a[q * 4]; s[1] += a[q * 4 + 1]; s[2] += a[q * 4 + 2]; c2++;
        }
        if (!c2) continue;
        a[p * 4] = s[0] / c2; a[p * 4 + 1] = s[1] / c2; a[p * 4 + 2] = s[2] / c2; a[p * 4 + 3] = 255;
      }
      x.putImageData(d, 0, 0);
      const bl = n.img.canvasOf(c.width, c.height); n.img.ctx(bl).filter = 'blur(3px)'; n.img.ctx(bl).drawImage(c, 0, 0);
      x.save(); x.beginPath();
      const mm = m;
      for (let y = 0; y < hh; y += 2) for (let xx = 0; xx < w; xx += 2) if (mm[(y * w + xx) * 4 + 3] > 60) x.rect(xx, y, 2, 2);
      x.clip(); x.drawImage(bl, 0, 0); x.restore();
      return c;
    },
    /* outpaint: extend the frame, fill with mirrored + blurred content, AI can refine after */
    extend(canvas, dirs = { l: .25, r: .25, t: .15, b: .15 }) {
      const w = canvas.width, hh = canvas.height;
      const L = Math.round(w * (dirs.l || 0)), R = Math.round(w * (dirs.r || 0)), T = Math.round(hh * (dirs.t || 0)), B = Math.round(hh * (dirs.b || 0));
      const c = n.img.canvasOf(w + L + R, hh + T + B), x = n.img.ctx(c);
      x.drawImage(canvas, L, T);
      const g = n.img.canvasOf(c.width, c.height), gx = n.img.ctx(g);
      gx.filter = 'blur(22px) saturate(.8)'; gx.drawImage(canvas, L, T);
      x.globalCompositeOperation = 'destination-over'; x.drawImage(g, 0, 0); x.globalCompositeOperation = 'source-over';
      /* mirrored edges feel less like a blur than a flat fill */
      const mir = (sx, sy, sw, sh, dx, dy, dw, dh, flipX, flipY) => {
        x.save(); x.translate(dx + dw / 2, dy + dh / 2); x.scale(flipX ? -1 : 1, flipY ? -1 : 1);
        x.globalAlpha = .85; x.drawImage(canvas, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh); x.restore();
      };
      if (L) mir(0, 0, Math.min(60, w), hh, L - Math.min(60, w), T, Math.min(60, w), hh, true, false);
      if (R) mir(w - Math.min(60, w), 0, Math.min(60, w), hh, L + w, T, Math.min(60, w), hh, true, false);
      if (T) mir(0, 0, w, Math.min(60, hh), L, T - Math.min(60, hh), w, Math.min(60, hh), false, true);
      if (B) mir(0, hh - Math.min(60, hh), w, Math.min(60, hh), L, T + hh, w, Math.min(60, hh), false, true);
      x.filter = 'blur(1px)'; x.drawImage(c, 0, 0); x.filter = 'none';
      return c;
    },
    /* face swap (lab version): align by drag/scale, feather, colour-match to target luminance */
    blend(base, overlay, t = { x: .5, y: .45, s: .35, rot: 0, feather: .18 }) {
      const c = n.img.canvasOf(base.width, base.height), x = n.img.ctx(c);
      x.drawImage(base, 0, 0);
      const size = Math.max(24, Math.min(c.width, c.height) * t.s * 2);
      const oc = n.img.canvasOf(size, size), ox = n.img.ctx(oc);
      ox.save();
      ox.beginPath(); ox.ellipse(size / 2, size / 2, size / 2, size / 2 * 1.28, 0, 0, 7); ox.clip();
      const r = base.width ? (() => { const im = x.getImageData(0, 0, 1, 1); return im; })() : null; void r;
      ox.drawImage(overlay, 0, 0, size, size);
      /* colour transfer: match mean/std of L channel inside the ellipse */
      try {
        const src = ox.getImageData(0, 0, size, size);
        const dstA = x.getImageData(Math.max(0, c.width * t.x - size / 2), Math.max(0, c.height * t.y - size / 2), size, size);
        const st = (d) => { let m = 0, s2 = 0, k = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 40) continue; const l = .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2]; m += l; s2 += l * l; k++; } m /= k || 1; return { m, s: Math.sqrt(Math.max(1, s2 / (k || 1) - m * m)) }; };
        const A = st(src.data), B = st(dstA.data), ratio = B.s / (A.s || 1);
        for (let i = 0; i < src.data.length; i += 4) {
          if (src.data[i + 3] < 1) continue;
          src.data[i] = (src.data[i] - A.m) * ratio + B.m;
          src.data[i + 1] = (src.data[i + 1] - A.m) * ratio + B.m;
          src.data[i + 2] = (src.data[i + 2] - A.m) * ratio + B.m;
        }
        ox.putImageData(src, 0, 0);
      } catch (e) { }
      ox.restore();
      const fc = n.img.canvasOf(size, size);
      const fx = n.img.ctx(fc); fx.filter = 'blur(' + Math.max(2, size * t.feather * .5) + 'px)';
      fx.beginPath(); fx.ellipse(size / 2, size / 2, size / 2 * .92, size / 2 * 1.2, 0, 0, 7); fx.fillStyle = '#fff'; fx.fill();
      ox.globalCompositeOperation = 'destination-in'; ox.drawImage(fc, 0, 0); ox.globalCompositeOperation = 'source-over';
      x.save(); x.translate(c.width * t.x, c.height * t.y); x.rotate(t.rot); x.globalAlpha = 1;
      x.drawImage(oc, -size / 2, -size / 2); x.restore();
      return c;
    }
  };

  /* ---------------- export ---------------- */
  n.img.export = async function (canvas, format, name) {
    const type = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[format] || 'image/png';
    const url = await n.img.dataUrl(canvas, type, .93);
    n.ui.download(url, (name || 'neural-ai') + '.' + (format === 'jpg' ? 'jpg' : format));
    return url;
  };
  n.img.icoBlob = async function (canvas, sizes = [16, 32, 48]) {
    sizes = [...new Set(sizes.map(x => Math.min(256, Math.max(1, x))))];   // ICO only encodes up to 256 (0 = 256)
    /* ICO container: 6-byte header + 16-byte ICONDIRENTRY per image, then per image a
       BITMAPINFOHEADER (biHeight = 2*size for XOR+AND mask), 32bpp BGRA rows bottom-up,
       then a zeroed AND mask padded to 32-bit rows. This is what Chrome/FF/Edge accept —
       a bare DIB without the BITMAPINFOHEADER renders as a broken icon. */
    const imgs = [];
    for (const sz of sizes) {
      const s = Math.max(1, Math.min(256, sz));
      const c = n.img.canvasOf(s, s); const x = n.img.ctx(c); x.imageSmoothingQuality = 'high';
      x.drawImage(canvas, 0, 0, s, s);
      const d = x.getImageData(0, 0, s, s).data;
      const maskRow = Math.ceil(s / 32) * 4, mask = s * maskRow;
      const body = new Uint8Array(40 + s * s * 4 + mask);
      const dv = new DataView(body.buffer);
      dv.setUint32(0, 40, true);
      dv.setInt32(4, s, true); dv.setInt32(8, s * 2, true);
      dv.setUint16(12, 1, true); dv.setUint16(14, 32, true);
      dv.setUint32(20, s * s * 4 + mask, true);
      for (let y = 0; y < s; y++) for (let x2 = 0; x2 < s; x2++) {
        const i = (y * s + x2) * 4, o = 40 + ((s - 1 - y) * s + x2) * 4;
        body[o] = d[i + 2]; body[o + 1] = d[i + 1]; body[o + 2] = d[i]; body[o + 3] = d[i + 3];
      }
      imgs.push({ size: s, bytes: body });
    }
    let total = 6 + imgs.length * 16; imgs.forEach(i => total += i.bytes.length);
    const out = new Uint8Array(total); const dv = new DataView(out.buffer);
    dv.setUint16(2, 1, true); dv.setUint16(4, imgs.length, true);
    let p = 6 + imgs.length * 16;
    imgs.forEach((im, i) => {
      const o = 6 + i * 16, w = im.size === 256 ? 0 : im.size;
      dv.setUint8(o, w); dv.setUint8(o + 1, w);
      dv.setUint32(o + 8, im.bytes.length, true); dv.setUint32(o + 12, p, true);
      out.set(im.bytes, p); p += im.bytes.length;
    });
    return new Blob([out], { type: 'image/x-icon' });
  };
  n.img.ico = async function (canvas, name, sizes) {
    n.ui.download(await n.img.icoBlob(canvas, sizes), (name || 'favicon') + '.ico');
  };

  /* ---------------- zip writer (stored) for gallery export ---------------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  n.zip = function (entries) {
    /* entries: [{name, data:Uint8Array}] — stored (method 0) so it works with no deps.
       Offsets below are the PKZIP spec, written from a table because an earlier version of this
       function put crc/csize/usize 2 bytes late in the central directory: python `zipfile`
       rejected the archive and this app's own unzip() returned garbage. */
    const enc = new TextEncoder(); const parts = []; const central = [];
    const d = new Date();
    const dos = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const tot = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() / 2 | 0);
    const LOC_F = [[0, 'u32', 0x04034b50], [4, 'u16', 20], [6, 'u16', 0], [8, 'u16', 0], [10, 'u16', tot], [12, 'u16', dos],
      [14, 'u32', 'crc'], [18, 'u32', 'csize'], [22, 'u32', 'usize'], [26, 'u16', 'nlen'], [28, 'u16', 0]];
    const CEN_F = [[0, 'u32', 0x02014b50], [4, 'u16', 20], [6, 'u16', 20], [8, 'u16', 0], [10, 'u16', 0], [12, 'u16', tot], [14, 'u16', dos],
      [16, 'u32', 'crc'], [20, 'u32', 'csize'], [24, 'u32', 'usize'], [28, 'u16', 'nlen'], [30, 'u16', 0], [32, 'u16', 0],
      [34, 'u16', 0], [36, 'u16', 0], [38, 'u32', 0], [42, 'u32', 'offset']];
    const put = (dv, f, v) => f.forEach(([o, k, name]) => dv[k === 'u32' ? 'setUint32' : 'setUint16'](o, typeof name === 'number' ? name : v[name], true));
    let off = 0;
    for (const e of entries) {
      const nb = enc.encode(e.name), data = e.data, c = crc32(data);
      const v = { crc: c, csize: data.length, usize: data.length, nlen: nb.length, offset: off };
      const lh = new Uint8Array(30 + nb.length); put(new DataView(lh.buffer), LOC_F, v); lh.set(nb, 30);
      parts.push(lh, data);
      const ch = new Uint8Array(46 + nb.length); put(new DataView(ch.buffer), CEN_F, v); ch.set(nb, 46);
      central.push(ch);
      off += lh.length + data.length;
    }
    const cdSize = central.reduce((a, b) => a + b.length, 0);
    const eocd = new Uint8Array(22); const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(4, 0, true); ev.setUint16(6, 0, true);
    ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
    ev.setUint32(12, cdSize, true); ev.setUint32(16, off, true); ev.setUint16(20, 0, true);
    return new Blob([...parts, ...central, eocd], { type: 'application/zip' });
  };
  n.zipFile = async (name, data) => ({ name, data: await n.buf8(data instanceof Blob ? data : new Blob([data])) });
})(window.NAS);
