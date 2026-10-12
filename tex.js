/* Texture procedurali (nessuna immagine esterna) e rumore deterministico.
   Tutto ciò che è "materiale" nasce qui: asfalto con normal/roughness, erba, carbonio, ecc. */
(() => {
  'use strict';
  const PZ = (window.PZ = window.PZ || {});
  const T = (PZ.tex = {});
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  /* ---------- rumore ---------- */
  const hash = (x, y, s) => {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  function vnoise(x, y, s, per) {            // per > 0 → periodico (texture ripetibili)
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    let x0 = xi, x1 = xi + 1, y0 = yi, y1 = yi + 1;
    if (per) { x0 = ((x0 % per) + per) % per; x1 = ((x1 % per) + per) % per; y0 = ((y0 % per) + per) % per; y1 = ((y1 % per) + per) % per; }
    return lerp(lerp(hash(x0, y0, s), hash(x1, y0, s), u), lerp(hash(x0, y1, s), hash(x1, y1, s), u), v);
  }
  function fbm(x, y, s = 1, oct = 5, per = 0) {
    let a = 0.5, f = 1, sum = 0, n = 0;
    for (let o = 0; o < oct; o++) { sum += a * vnoise(x * f, y * f, s + o * 31, per ? per * f : 0); n += a; a *= 0.5; f *= 2; }
    return sum / n;
  }
  T.hash = hash; T.vnoise = vnoise; T.fbm = fbm;

  /* ---------- canvas → texture ---------- */
  T.canvas = (w, h, draw, o = {}) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h, cv);
    const t = new THREE.CanvasTexture(cv);
    if (o.srgb) t.encoding = THREE.sRGBEncoding;
    if (o.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (o.repeatX) t.wrapS = THREE.RepeatWrapping;
    t.anisotropy = o.aniso || 8;
    return t;
  };
  /* da una funzione per-pixel (x,y,out) che scrive out[0..3] in 0..255 */
  T.pixels = (w, h, fn, o = {}) => T.canvas(w, h, (g) => {
    const img = g.createImageData(w, h), d = img.data, out = [0, 0, 0, 255];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      out[3] = 255; fn(x, y, out);
      const i = (y * w + x) * 4; d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2]; d[i + 3] = out[3];
    }
    g.putImageData(img, 0, 0);
  }, o);
  /* campo d'altezza (Float32, periodico) → normal map */
  T.normalFromHeight = (H, w, h, strength, o = {}) => T.canvas(w, h, (g) => {
    const img = g.createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const xm = (x - 1 + w) % w, xp = (x + 1) % w, ym = (y - 1 + h) % h, yp = (y + 1) % h;
      const dx = (H[y * w + xp] - H[y * w + xm]) * strength, dy = (H[yp * w + x] - H[ym * w + x]) * strength;
      const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
      d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { repeat: true, ...o });

  /* ---------- asfalto: colore, normal, roughness (tileable) ---------- */
  T.asphalt = (size = 512) => {
    const H = new Float32Array(size * size), col = new Uint8ClampedArray(size * size * 4), rg = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size, k = y * size + x;
      const big = fbm(u * 4, v * 4, 3, 4, 4), mid = fbm(u * 16, v * 16, 9, 3, 16);
      const f1 = hash(x, y, 5), f2 = hash(x >> 1, y >> 1, 11);
      H[k] = f1 * 0.45 + f2 * 0.35 + mid * 0.2;
      const soft = size <= 256 ? 0.45 : 1;          // texture piccola (telefono): meno contrasto sul granulo, altrimenti si vedono i pixel
      let c = 58 + (mid - 0.5) * 34 + (big - 0.5) * 22 + (f1 - 0.5) * 22 * soft;
      if (f1 > 0.95) c += 34 * (f2 + 0.3) * soft;         // inerti chiari
      else if (f1 < 0.06) c -= 22;                         // bitume scoperto
      const warm = (big - 0.5) * 6;                        // sbiadimento caldo/freddo a chiazze
      const i = k * 4;
      col[i] = c + warm; col[i + 1] = c + warm * 0.3; col[i + 2] = c - warm * 0.8; col[i + 3] = 255;
      const r = clamp(0.86 - Math.max(0, big - 0.55) * 1.3 + (f1 - 0.5) * 0.18 + (mid - 0.5) * 0.1, 0.45, 1);
      rg[i] = rg[i + 1] = rg[i + 2] = r * 255; rg[i + 3] = 255;
    }
    const mk = (data, o) => T.canvas(size, size, (g) => g.putImageData(new ImageData(data, size, size), 0, 0), o);
    return { map: mk(col, { srgb: true, repeat: true }), roughnessMap: mk(rg, { repeat: true }), normalMap: T.normalFromHeight(H, size, size, size <= 256 ? 0.8 : 1.5) };
  };

  /* gomma depositata sulla traiettoria + macchie d'olio: decalcomania a tutta carreggiata (u = larghezza) */
  T.rubber = (k = 1) => T.pixels(256 * k, 1024 * k, (x, y, o) => {
    const u = x / (256 * k), v = y / (1024 * k);
    const streak = fbm(u * 14, v * 3, 21, 3, 0) * 0.5 + hash(x, y >> 2, 7) * 0.5;
    let a = 0;
    for (const c of [0.3, 0.7]) { const d = Math.abs(u - c); a += Math.exp(-(d * d) / 0.0035) * 0.30; }     // traiettoria larga
    for (const c of [0.27, 0.33, 0.67, 0.73]) { const d = Math.abs(u - c); a += Math.exp(-(d * d) / 0.00016) * 0.28; }   // tracce delle ruote
    a *= 0.55 + streak * 0.9;
    const oil = Math.max(0, fbm(u * 5, v * 24, 31, 3, 0) - 0.62) * 2.2;
    o[0] = o[1] = o[2] = 8; o[3] = clamp(a + oil * 0.35, 0, 0.62) * 255;
  }, { repeat: true });

  /* erba mediterranea secca: colore + normal */
  T.grass = (size = 512) => {
    const H = new Float32Array(size * size), col = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size, k = y * size + x;
      const m = fbm(u * 6, v * 6, 41, 4, 6), m2 = fbm(u * 28, v * 28, 43, 3, 28), blade = hash(x, y >> 2, 3);
      H[k] = blade * 0.5 + m2 * 0.5;
      const dry = clamp((m - 0.42) * 2.2, 0, 1);            // chiazze di paglia
      const g = 0.5 + m2 * 0.7 + (blade - 0.5) * 0.5, i = k * 4;
      col[i] = lerp(52, 118, dry) * g; col[i + 1] = lerp(66, 98, dry) * g; col[i + 2] = lerp(28, 52, dry) * g; col[i + 3] = 255;
    }
    return { map: T.canvas(size, size, (g) => g.putImageData(new ImageData(col, size, size), 0, 0), { srgb: true, repeat: true }),
             normalMap: T.normalFromHeight(H, size, size, 1.6) };
  };

  /* ghiaietto delle vie di fuga */
  T.gravel = (size = 256) => {
    const H = new Float32Array(size * size), col = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const k = y * size + x, a = hash(x >> 1, y >> 1, 61), b = hash(x, y, 62), i = k * 4;
      H[k] = a * 0.7 + b * 0.3;
      const c = 92 + a * 80 + b * 26;
      col[i] = c * 1.06; col[i + 1] = c * 0.97; col[i + 2] = c * 0.82; col[i + 3] = 255;
    }
    return { map: T.canvas(size, size, (g) => g.putImageData(new ImageData(col, size, size), 0, 0), { srgb: true, repeat: true }),
             normalMap: T.normalFromHeight(H, size, size, 3.2) };
  };

  /* trama del carbonio (saia 2×2): normal + colore */
  T.carbon = (size = 256) => {
    const H = new Float32Array(size * size), col = new Uint8ClampedArray(size * size * 4), cell = 16, half = cell / 2;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const cx = Math.floor(x / half), cy = Math.floor(y / half), tx = x % half, ty = y % half;
      const along = (cx + cy) % 2 === 0 ? tx : ty;                // fibre orizzontali / verticali alternate
      const h = Math.sin((along + 0.5) / half * Math.PI), k = y * size + x, i = k * 4;
      H[k] = h;
      const c = 10 + h * 22 + ((cx + cy) % 2 ? 4 : 0);
      col[i] = col[i + 1] = c; col[i + 2] = c + 1; col[i + 3] = 255;
    }
    return { map: T.canvas(size, size, (g) => g.putImageData(new ImageData(col, size, size), 0, 0), { srgb: true, repeat: true }),
             normalMap: T.normalFromHeight(H, size, size, 2.2) };
  };

  /* scaglie metallizzate della vernice: normal ad alta frequenza */
  T.flake = (size = 256) => {
    const H = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) H[y * size + x] = hash(x, y, 71) * 0.7 + hash(x >> 1, y >> 1, 72) * 0.3;
    return T.normalFromHeight(H, size, size, 0.9);
  };

  /* battistrada: 3 scanalature circonferenziali (asse v della lathe) e tasselli lungo la circonferenza (u) */
  T.tread = () => {
    const w = 64, h = 256, H = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = y / h, inTread = v > 0.2 && v < 0.8;
      const groove = [0.35, 0.5, 0.65].some(c => Math.abs(v - c) < 0.017) ? 0 : 1;
      const lug = Math.sin(x / w * Math.PI * 2 * 12) > 0.15 ? 1 : 0.6;
      H[y * w + x] = (inTread ? groove * lug * 0.8 : 0.45) + hash(x, y, 81) * 0.12;
    }
    return T.normalFromHeight(H, w, h, 1.6);
  };

  /* nido d'ape: nervature opache, celle trasparenti (alpha test) */
  T.honeycomb = () => T.canvas(256, 128, (g, w, h) => {
    g.fillStyle = '#0a0a0a'; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-out';
    const r = 7, dx = r * 1.732, dy = r * 1.5;
    for (let row = -1; row < h / dy + 1; row++) for (let c = -1; c < w / dx + 1; c++) {
      const x = c * dx + (row % 2 ? dx / 2 : 0), y = row * dy;
      g.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; g.lineTo(x + Math.cos(a) * (r - 1.5), y + Math.sin(a) * (r - 1.5)); }
      g.closePath(); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  }, { srgb: true, repeat: true });

  /* chiazza luminosa tonda (aloni, ombre morbide) */
  T.glow = () => T.canvas(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.4)'); r.addColorStop(0.6, 'rgba(255,255,255,.08)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  });
})();
