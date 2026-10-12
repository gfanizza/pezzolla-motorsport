/* Supercar procedurale (generica, non riconducibile a un modello reale): scocca ottenuta per "loft" di sezioni
   (superficie liscia, passaruota scavati), vernice con clearcoat e scaglie, vetri, fanaleria a LED, griglia a nido d'ape,
   diffusore con pinne, scarichi in titanio, cerchi a doppio raggio con dischi e pinze. Le ruote girano, le anteriori sterzano. */
(() => {
  'use strict';
  const PZ = (window.PZ = window.PZ || {});
  const T = PZ.tex;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

  /* ---------- utilità geometriche ---------- */
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = V3(1, 1, 1), _p = V3(0, 0, 0);
  function place(g, x, y, z, rx, ry, rz) {
    _e.set(rx || 0, ry || 0, rz || 0); _q.setFromEuler(_e); _p.set(x, y, z);
    g.applyMatrix4(_m.compose(_p, _q, _s)); return g;
  }
  const box = (w, h, d, x, y, z, rx, ry, rz) => place(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
  function mergeG(list) {
    let np = 0, ni = 0;
    list.forEach(g => { np += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; });
    const pos = new Float32Array(np * 3), nor = new Float32Array(np * 3), uv = new Float32Array(np * 2), idx = new Uint32Array(ni);
    let po = 0, io = 0;
    list.forEach(g => {
      const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
      pos.set(P.array, po * 3); nor.set(N.array, po * 3); if (U) uv.set(U.array, po * 2);
      if (g.index) for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + po;
      else for (let i = 0; i < P.count; i++) idx[io + i] = po + i;
      po += P.count; io += g.index ? g.index.count : P.count;
    });
    const m = new THREE.BufferGeometry();
    m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    m.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); m.setIndex(new THREE.BufferAttribute(idx, 1)); return m;
  }

  /* ---------- sagoma: chiavi (z, mezza larghezza, fondo, spalla, cofano/tetto, cresta parafango) dal muso alla coda ---------- */
  const KF = [
    [2.32, 0.46, 0.11, 0.22, 0.27, 0.0],
    [2.12, 0.76, 0.09, 0.30, 0.42, 0.02],
    [1.82, 0.92, 0.10, 0.40, 0.56, 0.08],
    [1.32, 0.995, 0.12, 0.46, 0.68, 0.12],
    [0.78, 1.01, 0.13, 0.48, 0.72, 0.10],
    [0.22, 1.02, 0.13, 0.50, 0.77, 0.03],
    [-0.42, 1.03, 0.13, 0.52, 0.83, 0.0],
    [-1.00, 1.045, 0.14, 0.55, 0.91, 0.03],
    [-1.46, 1.055, 0.15, 0.57, 0.94, 0.06],
    [-1.96, 1.0, 0.18, 0.56, 0.89, 0.05],
    [-2.32, 0.90, 0.22, 0.54, 0.80, 0.0],
  ];
  const ZN = KF[0][0], ZT = KF[KF.length - 1][0];
  function kf(z) {
    let i = 0; while (i < KF.length - 2 && z < KF[i + 1][0]) i++;
    const a = KF[Math.max(i - 1, 0)], b = KF[i], c = KF[i + 1], d = KF[Math.min(i + 2, KF.length - 1)];
    const t = clamp((b[0] - z) / (b[0] - c[0])), t2 = t * t, t3 = t2 * t, r = [z];
    for (let k = 1; k < 6; k++) r.push(0.5 * (2 * b[k] + (-a[k] + c[k]) * t + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t2 + (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t3));
    return r;
  }
  const WHEELS = [  // asse z, raggio, larghezza gomma, x del centro
    { z: -1.40, R: 0.37, w: 0.335, x: 0.865, rear: true },
    { z: 1.32, R: 0.325, w: 0.27, x: 0.86, rear: false },
  ];
  const GAP = 0.06;
  const archY = (z) => {       // quota del cielo del passaruota alla coordinata z (0 se fuori)
    let y = 0;
    for (const w of WHEELS) { const dz = z - w.z, r = w.R + GAP; if (Math.abs(dz) < r) y = Math.max(y, w.R + Math.sqrt(r * r - dz * dz)); }
    return y;
  };
  const NS = 44, MID = NS / 2;
  function ring(z) {
    const [, W, Yb, Ys0, Yt, cr] = kf(z), yA = archY(z), Yb2 = Math.max(Yb, yA), Ys = Math.max(Ys0, yA + 0.075);
    const q = [[0, Yb], [W * 0.70, Yb2 + 0.004], [W * 0.965, lerp(Yb2, Ys, 0.34)], [W, Ys], [W * 0.975, Ys + (Math.max(Yt, Ys + 0.05) - Ys) * 0.55 + cr * 0.5],
      [W * 0.70, Math.max(Yt, Ys + 0.05) + cr], [0, Math.max(Yt, Ys + 0.05)]];
    const pts = q.map(p => V3(p[0], p[1], 0));
    for (let i = 5; i >= 1; i--) pts.push(V3(-q[i][0], q[i][1], 0));
    const c = new THREE.CatmullRomCurve3(pts, true, 'centripetal'), out = [];
    for (let i = 0; i < NS; i++) { const p = c.getPoint(i / NS); out.push([p.x, p.y]); }
    return out;
  }
  /* quota della superficie superiore (carrozzeria) a (z, |x|) */
  function deckY(z, x) {
    const r = ring(z); x = Math.abs(x);
    for (let k = MID; k > MID - 12; k--) { const a = r[k], b = r[k - 1]; if (b[0] >= x) { const t = (x - a[0]) / ((b[0] - a[0]) || 1e-6); return lerp(a[1], b[1], clamp(t)); } }
    return r[MID - 11][1];
  }
  /* abitacolo: quota del tetto, mezza larghezza di base */
  const ROOF = [[0.66, 0.0], [0.2, 0.98], [-0.1, 1.07], [-0.4, 1.11], [-0.78, 1.06], [-1.02, 0.99], [-1.24, 0.0]];   // [z, quota] (0 = piano del cofano)
  const GZ0 = 0.66, GZ1 = -1.24;
  function roofY(z) {
    let i = 0; while (i < ROOF.length - 2 && z < ROOF[i + 1][0]) i++;
    const a = ROOF[i], b = ROOF[i + 1], t = clamp((a[0] - z) / (a[0] - b[0])), sm = t * t * (3 - 2 * t);
    const base = deckY(z, 0);
    const ya = a[1] || base, yb = b[1] || base;
    return lerp(ya, yb, i === 0 || i === ROOF.length - 2 ? t : sm);
  }
  const gW = (z) => lerp(0.62, 0.84, sstep(GZ1, -0.5, z)) * lerp(1, 0.84, sstep(0.1, GZ0, z));

  function ringGlass(z) {
    const wb = gW(z), wt = wb * 0.58, ry = roofY(z), yb = deckY(z, wb) - 0.1, H = Math.max(0.02, ry - yb);
    const q = [[0, yb], [wb * 0.96, yb], [wb, yb + H * 0.1], [lerp(wb, wt, 0.45), yb + H * 0.42], [wt, yb + H * 0.86], [wt * 0.5, ry - 0.004], [0, ry]];
    const pts = q.map(p => V3(p[0], p[1], 0));
    for (let i = 5; i >= 1; i--) pts.push(V3(-q[i][0], q[i][1], 0));
    const c = new THREE.CatmullRomCurve3(pts, true, 'centripetal'), out = [];
    for (let i = 0; i < NS; i++) { const p = c.getPoint(i / NS); out.push([p.x, p.y]); }
    return out;
  }

  /* loft: stazioni in z crescente, anelli in senso antiorario (visti da +z) → normali verso l'esterno */
  function loft(zs, fn, caps, uvFn) {
    const n = zs.length, pos = new Float32Array(n * NS * 3), uv = new Float32Array(n * NS * 2), idx = [];
    zs.forEach((z, i) => {
      const r = fn(z);
      for (let k = 0; k < NS; k++) {
        const j = i * NS + k; pos.set([r[k][0], r[k][1], z], j * 3);
        uv.set(uvFn ? uvFn(r[k][0], r[k][1], z) : [r[k][0] * 8 + r[k][1] * 3, z * 8 + r[k][1] * 5], j * 2);
        if (i < n - 1) { const a = j, b = i * NS + (k + 1) % NS, c = (i + 1) * NS + k, d = (i + 1) * NS + (k + 1) % NS; idx.push(a, b, c, b, d, c); }
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
    geo.computeVertexNormals();
    if (!caps) return geo;
    const parts = [geo];
    for (const [i, nz] of [[0, -1], [n - 1, 1]]) {         // tappi piatti (muso e coda)
      const r = fn(zs[i]), cx = r.reduce((s, p) => s + p[0], 0) / NS, cy = r.reduce((s, p) => s + p[1], 0) / NS;
      const p = [cx, cy, zs[i]], ix = [], nr = [], u = [0.5, 0.5];
      r.forEach(q => { p.push(q[0], q[1], zs[i]); u.push(q[0] * 8, q[1] * 8); });
      for (let k = 0; k < NS; k++) { const a = 1 + k, b = 1 + (k + 1) % NS; if (nz > 0) ix.push(0, a, b); else ix.push(0, b, a); }
      for (let k = 0; k <= NS; k++) nr.push(0, 0, nz);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nr, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2)); g.setIndex(ix); parts.push(g);
    }
    return parts.length > 1 ? mergeG(parts) : geo;
  }
  /* nastro appoggiato alla superficie (listelli, strisce): punti (x,y,z) → striscia con normale verso l'alto */
  function ribbon(pts, w) {
    const pos = [], idx = [];
    pts.forEach((p, i) => { pos.push(p[0] - w / 2, p[1], p[2], p[0] + w / 2, p[1], p[2]); if (i < pts.length - 1) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2); });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    const nor = new Float32Array(pos.length); for (let i = 1; i < nor.length; i += 3) nor[i] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.length / 3 * 2), 2)); return g;
  }
  const range = (a, b, st) => { const o = []; for (let z = a; z > b - 1e-6; z -= st) o.push(z); return o; };

  /* ---------- gomma, cerchio, disco: costruiti una volta e condivisi ---------- */
  const shared = {};
  function wheelParts(R, w, tag) {
    if (shared[tag]) return shared[tag];
    const Rr = R * 0.69, pts = [];
    const half = [[Rr + 0.006, 0.47], [Rr + 0.035, 0.5], [R - 0.085, 0.515], [R - 0.035, 0.47], [R - 0.008, 0.4]];
    for (const [r, a] of half) pts.push(new THREE.Vector2(r, -a * w));
    for (let i = 0; i <= 12; i++) { const a = -0.34 + 0.68 * i / 12; pts.push(new THREE.Vector2(R - 0.004 * Math.pow(Math.abs(a) / 0.34, 4) , a * w)); }
    for (const [r, a] of half.slice().reverse()) pts.push(new THREE.Vector2(r, a * w));
    const tire = new THREE.LatheGeometry(pts, shared.lo ? 32 : 48); tire.rotateZ(Math.PI / 2);
    // cerchio: labbro esterno/interno, canale, 10 raggi doppi, mozzo
    const parts = [];
    for (const sx of [-1, 1]) parts.push(place(new THREE.TorusGeometry(Rr - 0.006, 0.013, 8, 40), sx * (w / 2 - 0.045), 0, 0, 0, Math.PI / 2, 0));
    const barrel = new THREE.CylinderGeometry(Rr - 0.012, Rr - 0.012, w * 0.78, 40, 1, true); barrel.rotateZ(Math.PI / 2); parts.push(barrel);
    const fx = w / 2 - 0.075, sl = Rr - 0.065;
    for (let k = 0; k < 10; k++) for (const off of [-1, 1]) {
      const ang = k * Math.PI / 5 + off * 0.075, g = new THREE.BoxGeometry(0.04, sl, 0.052);
      g.translate(0, 0.07 + sl / 2, 0); g.rotateY(off * 0.12); g.rotateX(ang); g.translate(fx, 0, 0); parts.push(g);
    }
    const hub = new THREE.CylinderGeometry(0.082, 0.1, 0.07, 24); hub.rotateZ(Math.PI / 2); hub.translate(fx + 0.012, 0, 0); parts.push(hub);
    const disc = new THREE.CylinderGeometry(R * 0.57, R * 0.57, 0.03, 40); disc.rotateZ(Math.PI / 2); disc.translate(w / 2 - 0.155, 0, 0);
    const nut = new THREE.CylinderGeometry(0.036, 0.036, 0.03, 6); nut.rotateZ(Math.PI / 2); nut.translate(fx + 0.052, 0, 0);
    const cal = new THREE.BoxGeometry(0.085, R * 0.5, R * 0.34); cal.translate(w / 2 - 0.155, R * 0.3, 0);
    return (shared[tag] = { tire, rim: mergeG(parts), disc, nut, cal });
  }
  let discTex = null;
  const discMap = () => discTex || (discTex = T.canvas(128, 128, (g, w, h) => {
    g.fillStyle = '#6b6d70'; g.fillRect(0, 0, w, h); g.fillStyle = '#18181a';
    for (let r = 0; r < 3; r++) for (let k = 0; k < 18; k++) { const a = k / 18 * 7 + r * 0.17, rr = 28 + r * 12; g.beginPath(); g.arc(64 + Math.cos(a) * rr, 64 + Math.sin(a) * rr, 2.2, 0, 7); g.fill(); }
  }, { srgb: true }));

  /* ---------- la vettura ---------- */
  PZ.buildCar = (world, o = {}) => {
    const STD = world.STD, glowTex = world.glowTex;
    const paintCol = new THREE.Color(o.paint === undefined ? 0x15161a : o.paint);
    shared.lo = world.mobile;
    if (!shared.tx) {
      const lo = world.mobile;               // su telefono: texture più piccole
      const flake = T.flake(lo ? 128 : 256); flake.repeat.set(3, 3);
      const carbon = T.carbon(lo ? 128 : 256); carbon.map.repeat.set(5, 5); carbon.normalMap.repeat.set(5, 5);
      const hex = T.honeycomb(); hex.repeat.set(5, 2.4);
      shared.tx = { flake, carbon, hex, tread: T.tread(), glass: null };
    }
    const { flake, carbon, hex } = shared.tx;
    const mats = {
      paint: world.patch(new THREE.MeshPhysicalMaterial({ color: paintCol, metalness: o.metal === undefined ? 0.45 : o.metal, roughness: o.rough || 0.26,
        clearcoat: 1, clearcoatRoughness: 0.04, normalMap: flake, normalScale: new THREE.Vector2(0.1, 0.1), envMapIntensity: 1.5 })),
      glass: world.patch(new THREE.MeshPhysicalMaterial({ color: 0x05070a, metalness: 0.2, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.9 })),
      carbon: STD({ color: 0xffffff, map: carbon.map, normalMap: carbon.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.38, metalness: 0.5, envMapIntensity: 1.1 }),
      dark: STD({ color: 0x0a0a0b, roughness: 0.55, metalness: 0.3, envMapIntensity: 0.8 }),
      amber: STD({ color: 0xf5b335, roughness: 0.35, metalness: 0.2, emissive: 0xf5b335, emissiveIntensity: 0.28, envMapIntensity: 1.0 }),
      rubber: STD({ color: 0x0f0f10, roughness: 0.88, normalMap: shared.tx.tread, normalScale: new THREE.Vector2(1.1, 1.1), envMapIntensity: 0.4 }),
      rim: STD({ color: 0x24262a, metalness: 1, roughness: 0.26, envMapIntensity: 1.6 }),
      disc: STD({ color: 0xffffff, map: discMap(), metalness: 0.9, roughness: 0.45, envMapIntensity: 1.0 }),
      cal: world.patch(new THREE.MeshPhysicalMaterial({ color: 0xf5b335, roughness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.2, metalness: 0.1, envMapIntensity: 1 })),
      ti: STD({ color: 0xa9adb3, metalness: 1, roughness: 0.3, envMapIntensity: 1.5, side: THREE.DoubleSide }),
      tipIn: STD({ color: 0x050505, roughness: 0.6, metalness: 0.4, side: THREE.BackSide }),
      led: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.07, 0.03) }),
      hexM: STD({ color: 0xffffff, map: hex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.6 }),
      heat: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 0.35, 0.08) }),
      lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.8, 2.4) }),
      rev: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.06, 0.06, 0.07) }),     // fanali di retromarcia (spenti: lente scura)
    };
    const group = new THREE.Group(), body = new THREE.Group(); group.add(body);
    const add = (geo, mat, parent) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; (parent || body).add(m); return m; };

    /* scocca: passo fitto attorno ai passaruota */
    const zs = []; for (let z = ZT; z <= ZN + 1e-6; z += (archY(z) > 0 || Math.abs(z) > 2.05 ? 0.04 : 0.065)) zs.push(z); zs.push(ZN);
    add(loft(zs, ring, true), mats.paint);

    /* abitacolo (vetro) e tetto verniciato */
    const gz = range(GZ0, GZ1, 0.05).reverse();
    add(loft(gz, ringGlass, false), mats.glass);
    {
      const rz = range(0.34, -0.8, 0.04), pos = [], idx = [];
      rz.forEach((z, i) => {
        const r = ringGlass(z), fx = 0.46 * clamp((z + 0.8) / 0.22) * clamp((0.36 - z) / 0.2);
        const xm = Math.max(...r.map(p => p[0]));
        for (let k = MID - 5; k <= MID + 5; k++) pos.push(r[k][0] * (fx / xm) * 1.0, r[k][1] + 0.004, z);
        if (i < rz.length - 1) for (let k = 0; k < 10; k++) { const a = i * 11 + k, b = a + 1, c = a + 11, d = c + 1; idx.push(a, c, b, b, c, d); }
      });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
      add(g, mats.paint);
    }

    /* strisce ambra: cofano, tetto, cofano motore (come sull'auto del video) */
    {
      for (const sx of [-1, 1]) {
        const xc = sx * 0.085;
        for (const [a, b] of [[2.2, 0.7], [0.25, -0.8], [-1.26, -2.28]]) {
          const pts = range(a, b, 0.04).map(z => [xc, (z < GZ0 && z > GZ1 ? roofY(z) : deckY(z, 0.085)) + 0.0045, z]);
          add(ribbon(pts, 0.03), mats.amber);
        }
      }
    }

    /* cofano motore: dorsale e prese d'aria a feritoie */
    {
      const dark = [], amber = [], sp = [];
      for (let z = -1.34; z > -2.02; z -= 0.095) {
        const y = deckY(z, 0.4), dy = (deckY(z + 0.03, 0.4) - deckY(z - 0.03, 0.4)) / 0.06, rx = -Math.atan(dy);
        for (const sx of [-1, 1]) {
          dark.push(box(0.34, 0.012, 0.05, sx * 0.43, y + 0.004, z, rx, sx * 0.07, 0));
          amber.push(box(0.34, 0.004, 0.006, sx * 0.43, y + 0.011, z + 0.027, rx, sx * 0.07, 0));
        }
      }
      for (const sx of [-1, 1]) sp.push(box(0.035, 0.03, 0.82, sx * 0.17, deckY(-1.75, 0.17) + 0.01, -1.75, -Math.atan((deckY(-1.35, 0.17) - deckY(-2.15, 0.17)) / 0.8), 0, 0));
      add(mergeG(dark), mats.carbon); add(mergeG(amber), mats.amber); add(mergeG(sp), mats.paint);
      // dorsale centrale + alettone a "ducktail"
      add(box(0.06, 0.04, 0.9, 0, deckY(-1.75, 0) + 0.018, -1.75, -Math.atan((deckY(-1.3, 0) - deckY(-2.2, 0)) / 0.9), 0, 0), mats.paint);
      add(box(1.52, 0.022, 0.2, 0, 0.815, -2.2, 0.17, 0, 0), mats.paint);
      add(box(1.52, 0.006, 0.016, 0, 0.806, -2.3, 0.17, 0, 0), mats.amber);
    }

    /* coda: barra LED, nido d'ape con bagliore del vano motore, scarichi, diffusore a pinne */
    const tailGlows = [], revGlows = [];
    {
      const zt = -2.322;
      const leds = [box(1.5, 0.042, 0.03, 0, 0.715, zt - 0.006), box(0.04, 0.2, 0.03, -0.77, 0.62, zt - 0.006, 0, 0, 0.06), box(0.04, 0.2, 0.03, 0.77, 0.62, zt - 0.006, 0, 0, -0.06)];
      add(mergeG(leds), mats.led);
      add(mergeG([box(0.17, 0.05, 0.03, -0.64, 0.335, zt - 0.012), box(0.17, 0.05, 0.03, 0.64, 0.335, zt - 0.012)]), mats.rev);
      for (const sx of [-1, 1]) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(1.8, 1.8, 2.1), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0 }));
        sp.position.set(sx * 0.64, 0.335, zt - 0.16); sp.scale.set(0.6, 0.38, 1); body.add(sp); revGlows.push(sp);
      }
      add(box(1.58, 0.06, 0.02, 0, 0.715, zt), mats.dark); add(box(1.46, 0.025, 0.03, 0, 0.665, zt - 0.003), mats.dark);
      for (const sx of [-1, 1]) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(2.4, 0.2, 0.08), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
        sp.position.set(sx * 0.6, 0.72, zt - 0.14); sp.scale.set(1.2, 0.6, 1); body.add(sp); tailGlows.push(sp);
      }
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.46, 0.34), mats.hexM); panel.position.set(0, 0.45, zt - 0.004); panel.rotation.y = Math.PI; body.add(panel);
      const heat = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.3), mats.heat); heat.position.set(0, 0.45, zt + 0.02); heat.rotation.y = Math.PI; body.add(heat);
      add(box(1.5, 0.05, 0.05, 0, 0.275, zt - 0.01), mats.carbon); add(box(1.5, 0.03, 0.05, 0, 0.64, zt - 0.005), mats.carbon);
      // scarichi in titanio (quattro) con interno scuro
      const tips = [];
      for (const x of [-0.39, -0.17, 0.17, 0.39]) {
        const t = new THREE.CylinderGeometry(0.072, 0.066, 0.16, 20, 1, true); t.rotateX(Math.PI / 2); place(t, x, 0.44, zt - 0.075);
        tips.push(t);
        const ti = new THREE.CylinderGeometry(0.06, 0.06, 0.16, 16, 1, true); ti.rotateX(Math.PI / 2); add(place(ti, x, 0.44, zt - 0.075), mats.tipIn);
        const ring2 = new THREE.TorusGeometry(0.069, 0.007, 6, 20); add(place(ring2, x, 0.44, zt - 0.155), mats.ti);
      }
      add(mergeG(tips), mats.ti);
      // diffusore: pannello inclinato con pinne, corto e basso
      const dfs = [box(1.46, 0.016, 0.2, 0, 0.19, zt - 0.08, 0.38, 0, 0)];
      for (let i = -3; i <= 3; i++) dfs.push(box(0.02, 0.075, 0.2, i * 0.2, 0.16, zt - 0.08, 0.38, 0, 0));
      add(mergeG(dfs), mats.carbon);
      for (const sx of [-1, 1]) add(box(0.02, 0.13, 0.2, sx * 0.76, 0.17, zt - 0.08), mats.carbon);
    }

    /* specchietti, prese d'aria laterali, fari, splitter */
    {
      for (const sx of [-1, 1]) {
        const mz = 0.52, my = deckY(mz, 0.8) + 0.05, mx = gW(mz) + 0.1;
        add(box(0.26, 0.11, 0.2, sx * mx, my, mz - 0.02, 0, sx * 0.25, 0), mats.paint);
        add(box(0.1, 0.03, 0.045, sx * (mx - 0.14), my - 0.08, mz, 0, 0, sx * -0.4), mats.dark);
        const slats = [];
        for (let i = 0; i < 6; i++) slats.push(box(0.012, 0.16, 0.026, sx * 1.045, 0.4, -0.78 - i * 0.07, 0, 0, 0));
        add(box(0.01, 0.2, 0.52, sx * 1.04, 0.4, -0.95), mats.dark); add(mergeG(slats), mats.carbon);
        add(box(0.02, 0.012, 0.9, sx * 0.97, 0.205, -0.1), mats.amber);                                  // filetto laterale
        add(box(0.34, 0.016, 0.03, sx * 0.55, 0.43, 2.07, 0, sx * -0.2, 0), mats.lamp);                  // luci diurne
      }
      add(box(1.72, 0.03, 0.34, 0, 0.1, 2.2), mats.carbon);
      // porte: tagli
      for (const sx of [-1, 1]) add(box(0.006, 0.31, 0.012, sx * 1.025, 0.62, -0.72), mats.dark);
    }

    /* ruote */
    const wheels = [];
    for (const wd of WHEELS) for (const sx of [-1, 1]) {
      const P = wheelParts(wd.R, wd.w, wd.rear ? 'r' : 'f');
      const g = new THREE.Group(), hub = new THREE.Group(), spin = new THREE.Group();
      g.position.set(sx * wd.x, wd.R, wd.z); g.add(hub); hub.add(spin);
      if (sx < 0) spin.scale.x = -1;                                   // specchio: la faccia del cerchio guarda sempre fuori
      add(P.tire, mats.rubber, spin); add(P.rim, mats.rim, spin); add(P.disc, mats.disc, spin); add(P.nut, mats.amber, spin);
      const cal = add(P.cal, mats.cal, hub); cal.rotation.x = wd.rear ? 0.5 : -0.5;
      body.add(g); wheels.push({ g, hub, spin, R: wd.R, front: !wd.rear, sx });
      // cielo e parete interna del passaruota in nero: niente vernice dentro il vano
      const r = wd.R + GAP - 0.012;
      const liner = new THREE.CylinderGeometry(r, r, 0.4, 28, 1, true, -0.02, Math.PI + 0.04); liner.rotateZ(Math.PI / 2);
      const lm = new THREE.Mesh(liner, new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.9, side: THREE.DoubleSide }));
      lm.position.set(sx * (wd.x - 0.05), wd.R, wd.z); body.add(lm);
      const wall = new THREE.Mesh(new THREE.CircleGeometry(r, 28, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0x060606, roughness: 0.9, side: THREE.DoubleSide }));
      wall.rotation.y = Math.PI / 2; wall.position.set(sx * (wd.x - wd.w / 2 - 0.045), wd.R, wd.z); body.add(wall);
    }

    /* ombra di contatto morbida (la mappa d'ombra non arriva al millimetro) */
    {
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 5.9), new THREE.MeshBasicMaterial({
        map: T.canvas(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 6, 32, 32, 32); r.addColorStop(0, 'rgba(0,0,0,.9)'); r.addColorStop(0.55, 'rgba(0,0,0,.5)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }),
        transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }));
      sh.rotation.x = -Math.PI / 2; sh.position.set(0, 0.02, 0); sh.renderOrder = 4; group.add(sh);
    }

    /* luci locali + fiamme dallo scarico */
    let tailLight = null, revLight = null;
    if (o.lights !== false) {        // le auto ferme non proiettano luce: meno luci = shader più leggeri
      tailLight = new THREE.PointLight(0xff3a22, 1.2, 9); tailLight.position.set(0, 0.5, -3.2); group.add(tailLight);
      revLight = new THREE.PointLight(0xe6eeff, 0, 11); revLight.position.set(0, 0.45, -3.6); group.add(revLight);
    }
    const flames = [];
    for (const x of [-0.39, -0.17, 0.17, 0.39]) {
      const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(3.2, 1.2, 0.3), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0 }));
      f.position.set(x, 0.44, -2.5); f.scale.set(0.3, 0.3, 1); body.add(f); flames.push(f);
    }
    group.scale.setScalar(o.scale || 1.8);

    const tailDim = new THREE.Color(1.5, 0.07, 0.03), tailBright = new THREE.Color(3.0, 0.16, 0.06), tmpC = new THREE.Color();
    const revOff = new THREE.Color(0.06, 0.06, 0.07), revOn = new THREE.Color(3.6, 3.6, 4.0);
    let flameT = 0, spinA = 0, rvT = 0;
    return {
      group, body, wheels, mats,
      pop() { flameT = 0.1 + Math.random() * 0.08; },
      /* s: { dist (m percorsi nel frame, negativo in retromarcia), steer (rad), brake 0..1, thr 0..1, reverse, roll, pitch, dt } */
      update(s) {
        spinA += (s.dist || 0) / (wheels[0].R * (o.scale || 1.8));
        for (const w of wheels) {
          w.spin.rotation.x = spinA;
          if (w.front) w.hub.rotation.y = (s.steer || 0) * 0.6;
        }
        body.rotation.x = (s.pitch || 0); body.rotation.z = (s.roll || 0);
        const bl = 0.3 + 0.7 * (s.brake || 0);
        rvT += ((s.reverse ? 1 : 0) - rvT) * (1 - Math.exp(-(s.dt || 0.016) * 16));
        mats.led.color.copy(tailDim).lerp(tailBright, bl).multiplyScalar(1 - 0.35 * rvT);          // in retromarcia il rosso si attenua…
        mats.rev.color.copy(revOff).lerp(revOn, rvT);                                              // …e si accendono i fanali bianchi
        revGlows.forEach(g => { g.material.opacity = 0.8 * rvT; g.scale.set(0.6 + 0.25 * rvT, 0.38 + 0.15 * rvT, 1); });
        if (revLight) revLight.intensity = 1.5 * rvT;
        tailGlows.forEach(g => { g.material.opacity = 0.3 + 0.7 * bl; g.scale.set(1.0 + 1.2 * (s.brake || 0), 0.5 + 0.5 * (s.brake || 0), 1); });
        if (tailLight) tailLight.intensity = (0.7 + 2.4 * (s.brake || 0)) * (1 - 0.4 * rvT);
        mats.heat.color.setRGB(0.9 + 1.2 * (s.thr || 0), 0.22 + 0.4 * (s.thr || 0), 0.05);
        if (flameT > 0) { flameT -= s.dt || 0.016; const a = clamp(flameT / 0.1); flames.forEach((f, i) => { f.material.opacity = a * (i % 2 ? 0.6 : 1); f.scale.set(0.3 + 0.7 * (1 - a), 0.3 + 0.7 * (1 - a), 1); f.position.z = -2.5 - 0.35 * (1 - a); }); }
        else flames.forEach(f => { f.material.opacity = 0; });
      },
    };
  };
})();
