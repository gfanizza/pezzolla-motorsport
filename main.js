/* Pezzolla Motorsport — viaggio 3D guidato dallo scroll.
   Scena procedurale (three r128 globale). Progresso 0–1:
   partenza 0–A · corsia (Club | Racing) A–B · arrivo B–1 */
(() => {
  'use strict';

  const A = 0.28, B = 0.80;          // confini dei tratti
  const FORK_P = 0.34;               // dove si atterra dopo la scelta
  const ACCENT = 0xf5b335;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = Math.min(innerWidth, innerHeight) < 700;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  /* ---------- stato ---------- */
  let branch = 'club';
  let pt = 0;      // progresso target (scroll)
  let ps = 0;      // progresso smussato
  let lane = 0;    // 0 club · 1 racing (animato)
  let heroW = 1;
  let wantSound = false;

  /* ---------- UI ---------- */
  const hero = $('#hero'), video = $('#heroVideo'), ph = $('#heroPh'), soundBtn = $('#soundBtn');
  const bar = $('#bar'), panels = $$('.panel'), laneBtns = $$('[data-lane]');
  const engBtn = $('#engineBtn'), Engine = window.EngineAudio;

  function scrollMax() { return document.documentElement.scrollHeight - innerHeight; }
  function readScroll() { pt = clamp(scrollY / Math.max(1, scrollMax())); }
  function goTo(p) { scrollTo({ top: p * scrollMax(), behavior: reduce ? 'auto' : 'smooth' }); }
  function setBranch(b, jump) {
    branch = b;
    laneBtns.forEach(el => el.classList.toggle('active', el.dataset.lane === b));
    if (jump && pt < A + 0.03) goTo(FORK_P);
  }

  laneBtns.forEach(el => el.addEventListener('click', () => setBranch(el.dataset.lane, true)));
  $$('[data-pick]').forEach(el => el.addEventListener('click', () => setBranch(el.dataset.pick, true)));
  $$('[data-goto]').forEach(el => el.addEventListener('click', e => { e.preventDefault(); goTo(+el.dataset.goto); }));
  addEventListener('scroll', readScroll, { passive: true });

  /* video hero: se il file manca, segnaposto */
  video.addEventListener('loadeddata', () => { ph.classList.remove('on'); soundBtn.disabled = false; });
  video.addEventListener('error', () => { ph.classList.add('on'); soundBtn.disabled = true; });
  video.src = 'assets/video/pezzolla-motorsport.mp4';
  video.play().catch(() => {});
  soundBtn.addEventListener('click', () => {
    wantSound = !wantSound;
    video.muted = !wantSound;
    soundBtn.textContent = wantSound ? 'Disattiva audio' : 'Attiva audio';
    if (video.paused) video.play().catch(() => {});
  });

  /* suono motore: parte al primo gesto dell'utente (regola dei browser), poi on/off dal pulsante */
  let engineUserOff = false;
  function paintEngineBtn() {
    if (!engBtn) return;
    const on = Engine && Engine.on;
    engBtn.classList.toggle('on', !!on);
    engBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    engBtn.querySelector('b').textContent = on ? 'Motore on' : 'Motore off';
  }
  if (!Engine || !Engine.supported) { if (engBtn) engBtn.hidden = true; }
  else {
    engBtn.addEventListener('click', () => { engineUserOff = Engine.on; Engine.setOn(!Engine.on); paintEngineBtn(); });
    const first = (e) => {
      if (e.target && e.target.closest && e.target.closest('#engineBtn')) return;   // il pulsante gestisce da sé
      removeEventListener('pointerdown', first); removeEventListener('keydown', first);
      if (!engineUserOff && !Engine.on) { Engine.setOn(true); paintEngineBtn(); }
    };
    addEventListener('pointerdown', first); addEventListener('keydown', first);
    paintEngineBtn();
  }

  /* modulo (nessun invio: da collegare) */
  const form = $('#contactForm'), msg = $('#formMsg');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const d = new FormData(form);
    const ok = String(d.get('nome')).trim() && /\S+@\S+\.\S+/.test(String(d.get('email')));
    msg.textContent = ok ? 'Grazie. Il tuo referente ti ricontatterà a breve.' : 'Inserisci nome ed email valida.';
  });

  function updateUI(p) {
    bar.style.width = (p * 100).toFixed(2) + '%';
    heroW = clamp(1 - p / 0.04);
    hero.style.opacity = heroW;
    hero.style.visibility = heroW > 0.01 ? 'visible' : 'hidden';
    hero.style.transform = `scale(${1 + (1 - heroW) * 0.12})`;
    if (heroW < 0.3) { if (!video.paused) video.pause(); }
    else if (video.paused && video.readyState > 2) video.play().catch(() => {});

    for (const el of panels) {
      const a = +el.dataset.in, b = +el.dataset.out, br = el.dataset.branch;
      let w = 0;
      if (!br || br === branch) {
        const f = 0.012;
        w = clamp((p - a) / f) * clamp((b - p) / f);
      }
      const t = clamp((p - a) / (b - a));
      el.style.opacity = w.toFixed(3);
      el.style.visibility = w > 0.01 ? 'visible' : 'hidden';
      el.style.transform = `translate3d(0,${((0.5 - t) * 56).toFixed(1)}px,0) scale(${(0.97 + 0.06 * t).toFixed(3)})`;
      el.firstElementChild.style.pointerEvents = w > 0.6 ? 'auto' : 'none';
    }
  }

  /* ---------- 3D ---------- */
  const canvas = $('#gl');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
  } catch (err) { renderer = null; }

  if (!renderer) {
    document.body.classList.add('nogl');
    panels.forEach(el => { el.style.opacity = 1; });
    return;
  }

  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight, false);

  const BG = 0x0f0f0e;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, 70, 560);
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.3, 2600);

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const UP = V(0, 1, 0);
  const rnd = (a, b) => a + Math.random() * (b - a);

  /* tracciato: partenza comune, due corsie, arrivo comune */
  const S = new THREE.CatmullRomCurve3([V(0, 0, 0), V(0, 0, -70), V(6, 0, -140), V(0, 0, -210), V(0, 0, -260)]);
  const C = new THREE.CatmullRomCurve3([
    V(0, 0, -260), V(-14, 0, -320), V(-48, 0, -400), V(-60, 0, -500), V(-30, 0, -600),
    V(-44, 0, -700), V(-14, 0, -800), V(0, 0, -900)]);
  const R = new THREE.CatmullRomCurve3([
    V(0, 0, -260), V(14, 0, -320), V(48, 0, -380), V(40, 0, -470), V(72, 0, -570),
    V(40, 0, -670), V(52, 0, -790), V(0, 0, -900)]);
  const E = new THREE.CatmullRomCurve3([V(0, 0, -900), V(0, 0, -960), V(0, 0, -1040)]);

  /* posizione e tangente lungo il percorso per il ramo corrente (p oltre 1 estrapola) */
  function pathPoint(p, outPos, outTan) {
    let c, u;
    if (p < A) { c = S; u = p / A; }
    else if (p < B) { c = branch === 'racing' ? R : C; u = (p - A) / (B - A); }
    else { c = E; u = (p - B) / (1 - B); }
    const uc = clamp(u);
    c.getPointAt(uc, outPos);
    c.getTangentAt(uc, outTan);
    if (u > 1) outPos.addScaledVector(outTan, (u - 1) * c.getLength());
    return outPos;
  }

  /* texture di servizio */
  function canvasTex(w, h, draw, repeat) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv);
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
    return t;
  }
  const glowTex = canvasTex(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  });

  /* ===== cielo al tramonto, sole basso, colline, stelle ===== */
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 24, 16), new THREE.MeshBasicMaterial({
    map: canvasTex(4, 256, (g) => {
      const gr = g.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, '#07070a'); gr.addColorStop(0.3, '#120f10'); gr.addColorStop(0.44, '#3a2112');
      gr.addColorStop(0.485, '#a85f1f'); gr.addColorStop(0.5, '#e29a3a'); gr.addColorStop(0.52, '#7a4518');
      gr.addColorStop(0.58, '#16110d'); gr.addColorStop(1, '#0f0f0e');
      g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    }), side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -2; scene.add(sky);

  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb25a, blending: THREE.AdditiveBlending,
    transparent: true, depthWrite: false, fog: false, opacity: 0.95 }));
  sun.scale.set(900, 900, 1); sun.renderOrder = -1; scene.add(sun);

  {
    const n = mobile ? 250 : 600, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2, ph2 = rnd(0.18, 1.35);      // emisfero alto
      pos.set([900 * Math.cos(ph2) * Math.sin(th), 900 * Math.sin(ph2), 900 * Math.cos(ph2) * Math.cos(th)], i * 3);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false,
      transparent: true, opacity: 0.55, fog: false, depthWrite: false }));
    stars.name = 'stars'; scene.add(stars);
  }

  {  // anello di colline in controluce
    const N = 110, pos = [], idx = [], R0 = 1000, cz = -560;
    for (let i = 0; i <= N; i++) {
      const a = i / N * Math.PI * 2;
      const h = Math.max(10, 24 + 26 * (0.5 + 0.5 * Math.sin(a * 5 + 1.3)) + 14 * Math.sin(a * 13) + 8 * Math.sin(a * 31 + 2));
      const x = R0 * Math.sin(a), z = cz + R0 * Math.cos(a);
      pos.push(x, -8, z, x, h, z);
      if (i < N) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
    scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x090908, fog: false, side: THREE.DoubleSide })));
  }

  /* terreno */
  {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(3400, 3400), new THREE.MeshBasicMaterial({ color: 0x12140f }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.16, -560); scene.add(ground);
  }

  /* ===== geometrie lungo le curve ===== */
  function frameAt(curve, u) {
    u = clamp(u);
    const p = curve.getPointAt(u), t = curve.getTangentAt(u);
    let sx = -t.z, sz = t.x; const l = Math.hypot(sx, sz) || 1; sx /= l; sz /= l;
    return { p, t, sx, sz };
  }
  /* nastro con UV (v = metri/tile) */
  function strip(curve, n, offset, width, y, mat, tile) {
    const pos = new Float32Array((n + 1) * 6), uv = new Float32Array((n + 1) * 4), idx = [];
    const L = curve.getLength();
    for (let i = 0; i <= n; i++) {
      const f = frameAt(curve, i / n), cx = f.p.x + f.sx * offset, cz = f.p.z + f.sz * offset;
      pos.set([cx - f.sx * width / 2, y, cz - f.sz * width / 2, cx + f.sx * width / 2, y, cz + f.sz * width / 2], i * 6);
      const v = (i / n) * L / (tile || 8);
      uv.set([0, v, 1, v], i * 4);
      if (i < n) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const m = new THREE.Mesh(geo, mat); scene.add(m); return m;
  }
  /* muretto verticale (guardrail) */
  function wall(curve, n, offset, y0, y1, mat, u0, u1) {
    const pos = new Float32Array((n + 1) * 6), idx = [];
    for (let i = 0; i <= n; i++) {
      const f = frameAt(curve, u0 + (u1 - u0) * i / n), cx = f.p.x + f.sx * offset, cz = f.p.z + f.sz * offset;
      pos.set([cx, y0, cz, cx, y1, cz], i * 6);
      if (i < n) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx);
    scene.add(new THREE.Mesh(geo, mat));
  }

  const dummy = new THREE.Object3D();
  function samples(curve, step, offset, out, u0 = 0, u1 = 1) {
    const n = Math.max(2, Math.floor(curve.getLength() * (u1 - u0) / step));
    for (let i = 0; i < n; i++) {
      const f = frameAt(curve, u0 + (u1 - u0) * (i + 0.5) / n);
      out.push({ p: V(f.p.x + f.sx * offset, 0, f.p.z + f.sz * offset), t: f.t.clone(), s: V(f.sx, 0, f.sz), sg: Math.sign(offset), i });
    }
  }
  function instanced(geo, mat, list, y, colorFn) {
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((o, k) => {
      dummy.position.set(o.p.x, y, o.p.z);
      dummy.lookAt(o.p.x + o.t.x, y, o.p.z + o.t.z);
      dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      m.setMatrixAt(k, dummy.matrix);
      if (colorFn) m.setColorAt(k, colorFn(o, k));
    });
    m.instanceMatrix.needsUpdate = true; scene.add(m); return m;
  }

  /* materiali pista */
  const asphaltTex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#2a2a28'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { const v = 30 + Math.random() * 34 | 0; g.fillStyle = `rgb(${v},${v},${v - 1})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2); }
  }, true);
  const asphalt = new THREE.MeshBasicMaterial({ map: asphaltTex, side: THREE.DoubleSide });
  const verge = new THREE.MeshBasicMaterial({ color: 0x1a2117, side: THREE.DoubleSide });
  const railMat = new THREE.MeshBasicMaterial({ color: 0x80848a, side: THREE.DoubleSide });
  const railPostMat = new THREE.MeshBasicMaterial({ color: 0x2c2e30 });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
  const poleMat = new THREE.MeshBasicMaterial({ color: 0x2f302f });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe3b0 });
  const tireDark = new THREE.MeshBasicMaterial({ color: 0x141414 });
  const tireWhite = new THREE.MeshBasicMaterial({ color: 0xd8d6cf });
  const white = new THREE.Color(0xffffff), warm = new THREE.Color(ACCENT);
  const W = 16;
  const laneMats = { C: [], R: [] };
  const lampGlow = [];              // posizioni dei lampioni → un solo Points con alone
  const allPts = [];                // campioni di tutti i tracciati (per tenere gli alberi lontani)

  function outerSign(curve, u) {    // lato esterno della curva (±1) o 0 se rettilineo
    const t0 = curve.getTangentAt(clamp(u - 0.025)), t1 = curve.getTangentAt(clamp(u + 0.025));
    const cy = t0.z * t1.x - t0.x * t1.z;               // >0 curva a sinistra
    return Math.abs(cy) < 0.04 ? 0 : (cy > 0 ? 1 : -1);
  }

  function buildTrack(curve, key, railFrom) {
    const len = curve.getLength(), n = Math.max(40, Math.floor(len / 3));
    strip(curve, n, -(W / 2 + 9.5), 19, -0.03, verge);
    strip(curve, n, (W / 2 + 9.5), 19, -0.03, verge);
    strip(curve, n, 0, W, 0, asphalt, 8);
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide });
    strip(curve, n, -(W / 2 - 0.35), 0.35, 0.02, edgeMat);
    strip(curve, n, (W / 2 - 0.35), 0.35, 0.02, edgeMat);
    if (key) laneMats[key].push(edgeMat);

    const dashes = []; samples(curve, 9, 0, dashes);
    instanced(new THREE.BoxGeometry(0.3, 0.03, 3.4), dashMat, dashes, 0.03);

    /* lampioni con braccio e alone */
    const poles = []; samples(curve, 42, W / 2 + 8, poles); samples(curve, 42, -(W / 2 + 8), poles);
    instanced(new THREE.CylinderGeometry(0.12, 0.15, 8, 6), poleMat, poles, 4);
    const arms = poles.map(o => ({ p: o.p.clone().addScaledVector(o.s, -o.sg * 0.9), t: o.s.clone() }));
    instanced(new THREE.BoxGeometry(0.1, 0.1, 1.9), poleMat, arms, 8.05);
    const heads = poles.map(o => ({ p: o.p.clone().addScaledVector(o.s, -o.sg * 1.8), t: o.t.clone() }));
    instanced(new THREE.BoxGeometry(0.7, 0.12, 1.2), lampMat, heads, 8);
    heads.forEach(h => lampGlow.push(h.p.x, 7.7, h.p.z));

    /* guardrail */
    const u0 = railFrom || 0, rn = Math.max(30, Math.floor(len * (1 - u0) / 4));
    wall(curve, rn, W / 2 + 6, 0.35, 0.95, railMat, u0, 1);
    wall(curve, rn, -(W / 2 + 6), 0.35, 0.95, railMat, u0, 1);
    const posts = []; samples(curve, 4, W / 2 + 6, posts, u0); samples(curve, 4, -(W / 2 + 6), posts, u0);
    instanced(new THREE.BoxGeometry(0.1, 0.95, 0.1), railPostMat, posts, 0.47);

    if (key) {
      const curbMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
      const curbs = []; samples(curve, 2.6, W / 2 + 0.8, curbs); samples(curve, 2.6, -(W / 2 + 0.8), curbs);
      instanced(new THREE.BoxGeometry(1.2, 0.1, 2.3), curbMat, curbs, 0.05, (o) => (o.i % 2 ? white : warm));
      laneMats[key].push(curbMat);
    }

    /* muri di gomme all'esterno delle curve */
    const tires = [];
    const tn = Math.floor(len / 3.2);
    for (let i = 0; i < tn; i++) {
      const u = (i + 0.5) / tn, sg = outerSign(curve, u);
      if (!sg || u < (railFrom || 0)) continue;
      const f = frameAt(curve, u);
      tires.push({ p: V(f.p.x + f.sx * sg * (W / 2 + 4.2), 0, f.p.z + f.sz * sg * (W / 2 + 4.2)), t: f.t.clone() });
    }
    if (tires.length) {
      const tg = new THREE.CylinderGeometry(0.52, 0.52, 0.55, 10);
      instanced(tg, tireDark, tires, 0.28); instanced(tg, tireWhite, tires, 0.84);
    }

    for (let i = 0; i < 40; i++) { const f = frameAt(curve, i / 40); allPts.push(f.p.x, f.p.z); }
  }
  buildTrack(S, null, 0); buildTrack(C, 'C', 0.1); buildTrack(R, 'R', 0.1); buildTrack(E, null, 0);

  /* alone dei lampioni */
  scene.add(new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(lampGlow, 3)),
    new THREE.PointsMaterial({ map: glowTex, color: 0xffc46e, size: 14, sizeAttenuation: true, transparent: true,
      opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })));

  /* alberi: coni scuri lontano dalla pista (e dalla corsia opposta) */
  {
    const slots = [];
    [S, C, R, E].forEach(c => {
      const n = Math.floor(c.getLength() / (mobile ? 22 : 11));
      for (let i = 0; i < n; i++) for (const sg of [-1, 1]) {
        const f = frameAt(c, (i + Math.random()) / n), off = W / 2 + rnd(20, 75);
        const x = f.p.x + f.sx * sg * off, z = f.p.z + f.sz * sg * off;
        let ok = true;
        for (let k = 0; k < allPts.length; k += 2) { if (Math.hypot(allPts[k] - x, allPts[k + 1] - z) < W / 2 + 15) { ok = false; break; } }
        if (ok) slots.push([x, z]);
      }
    });
    const geo = new THREE.ConeGeometry(2.6, 12, 6); geo.translate(0, 6, 0);
    const trees = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), slots.length);
    const c1 = new THREE.Color(0x0a110b), c2 = new THREE.Color(0x101a10);
    slots.forEach(([x, z], k) => {
      const s = rnd(0.7, 1.5);
      dummy.position.set(x, 0, z); dummy.rotation.set(0, Math.random() * 3, 0); dummy.scale.set(s, s * rnd(0.9, 1.4), s);
      dummy.updateMatrix(); trees.setMatrixAt(k, dummy.matrix); trees.setColorAt(k, Math.random() < 0.5 ? c1 : c2);
    });
    dummy.rotation.set(0, 0, 0);
    scene.add(trees);
  }

  /* ===== tribuna e hospitality sul rettilineo di partenza ===== */
  {
    const crowd = canvasTex(1024, 128, (g, w, h) => {
      g.fillStyle = '#0c0c0b'; g.fillRect(0, 0, w, h);
      const cols = ['#ffcf8a', '#ffffff', '#e8704a', '#8fb4e8', '#f5b335'];
      for (let i = 0; i < 3200; i++) { g.globalAlpha = rnd(0.35, 0.95); g.fillStyle = cols[i % cols.length]; g.fillRect(Math.random() * w, Math.random() * h, 2.5, 3.5); }
      g.globalAlpha = 1; g.fillStyle = '#0c0c0b';
      for (let y = 22; y < h; y += 24) g.fillRect(0, y, w, 3);
    });
    const stand = new THREE.Group();
    const seats = new THREE.Mesh(new THREE.PlaneGeometry(96, 10), new THREE.MeshBasicMaterial({ map: crowd, side: THREE.DoubleSide }));
    seats.rotation.x = -0.5; stand.add(seats);
    const back = new THREE.Mesh(new THREE.BoxGeometry(96, 11, 1), new THREE.MeshBasicMaterial({ color: 0x0a0a09 }));
    back.position.set(0, 1, -4); back.rotation.x = -0.5; stand.add(back);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(98, 0.5, 9), new THREE.MeshBasicMaterial({ color: 0x1c1c1b }));
    roof.position.set(0, 10.5, -1.5); stand.add(roof);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(94, 0.15, 0.3), new THREE.MeshBasicMaterial({ color: 0xffe3b0 }));
    lamp.position.set(0, 10.2, 2.6); stand.add(lamp);
    stand.rotation.y = -Math.PI / 2; stand.position.set(36, 5.3, -95);
    scene.add(stand);

    const win = canvasTex(1024, 128, (g, w, h) => {
      g.fillStyle = '#0d0d0c'; g.fillRect(0, 0, w, h);
      for (let r = 0; r < 2; r++) for (let i = 0; i < 26; i++) {
        g.fillStyle = Math.random() < 0.88 ? '#ffd28a' : '#3a2f1c';
        g.fillRect(14 + i * 39, 18 + r * 52, 28, 34);
      }
    });
    const bld = new THREE.Mesh(new THREE.BoxGeometry(16, 9, 68), new THREE.MeshBasicMaterial({ color: 0x0f0f0e }));
    bld.position.set(-46, 4.5, -195); scene.add(bld);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(68, 8.5), new THREE.MeshBasicMaterial({ map: win }));
    face.rotation.y = Math.PI / 2; face.position.set(-37.9, 4.4, -195); scene.add(face);
    const sign = canvasTex(1024, 160, (g, w, h) => {
      g.fillStyle = '#0a0a09'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#f5b335'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = '#fff'; g.font = '400 84px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('MOTORSPORT ROOM', w / 2, h / 2 + 4);
    });
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(36, 5.6), new THREE.MeshBasicMaterial({ map: sign }));
    banner.rotation.y = Math.PI / 2; banner.position.set(-37.7, 12.6, -195); scene.add(banner);
    for (const z of [-213, -177]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 0.4), poleMat); post.position.set(-37.7, 10, z); scene.add(post);
    }
  }

  /* portali (partenza, bivio, traguardo) */
  const gantryMat = new THREE.MeshBasicMaterial({ color: 0xdcdcd8 });
  const gantryGlow = new THREE.MeshBasicMaterial({ color: ACCENT });
  function gantry(curve, u) {
    const g = new THREE.Group(), p = curve.getPointAt(u), t = curve.getTangentAt(u);
    const h = 11, w = W + 6;
    for (const sx of [-1, 1]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.7, h, 0.7), gantryMat);
      col.position.set(sx * w / 2, h / 2, 0); g.add(col);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.7, 0.9, 0.9), gantryMat); beam.position.y = h; g.add(beam);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(w - 1, 0.18, 0.2), gantryGlow); glow.position.set(0, h - 0.7, 0.5); g.add(glow);
    g.position.copy(p); g.lookAt(p.x + t.x, p.y, p.z + t.z);
    scene.add(g);
  }
  gantry(S, 0.02); gantry(S, 0.995); gantry(E, 0.35);

  /* linea d'arrivo a scacchi */
  {
    const tex = canvasTex(128, 16, (g) => {
      for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) { g.fillStyle = (x + y) % 2 ? '#fff' : '#111'; g.fillRect(x * 8, y * 8, 8, 8); }
    }); tex.magFilter = THREE.NearestFilter;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(W, 2.4), new THREE.MeshBasicMaterial({ map: tex }));
    const p = E.getPointAt(0.35);
    plane.rotation.x = -Math.PI / 2; plane.position.set(p.x, 0.04, p.z);
    scene.add(plane);
  }

  /* cartelli: 7 tappe sul Club, 4 blocchi sul Racing */
  const boards = { club: [], racing: [] };
  function board(text, curve, u, side, key) {
    const tex = canvasTex(512, 256, (g) => {
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
      const big = text.length <= 2;
      g.font = big ? '400 170px Georgia, serif' : '400 74px Georgia, serif';
      g.fillText(text, 256, big ? 118 : 110);
      if (big) { g.font = '600 26px Helvetica, Arial, sans-serif'; g.fillStyle = '#f5b335'; g.fillText('TAPPA', 256, 218); }
    });
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    const f = frameAt(curve, u), off = side * (W / 2 + 5);
    spr.position.set(f.p.x + f.sx * off, 8, f.p.z + f.sz * off); spr.scale.set(18, 9, 1);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.14, 7, 0.14), gantryGlow);
    pole.position.set(f.p.x + f.sx * off, 3.5, f.p.z + f.sz * off);
    scene.add(spr, pole); boards[key].push(spr, pole);
  }
  for (let i = 0; i < 7; i++) board('0' + (i + 1), C, 0.58 + i * 0.058, i % 2 ? -1 : 1, 'club');
  ['SPORT', 'PARTNER', 'MEDIA', 'ESPERIENZE'].forEach((t, i) => board(t, R, 0.42 + i * 0.17, i % 2 ? 1 : -1, 'racing'));

  /* ===== supercar vista da dietro ===== */
  const car = new THREE.Group();
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff3a22 });
  const tailGlows = [];
  {
    const body = new THREE.MeshStandardMaterial({ color: 0x1b1b1a, roughness: 0.4, metalness: 0.5, flatShading: true });
    const dark = new THREE.MeshStandardMaterial({ color: 0x0b0b0a, roughness: 0.85, metalness: 0.1 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x07090c, roughness: 0.12, metalness: 0.85 });
    const line = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.7 });
    const add = (geo, mat, x, y, z, edges = true) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
      if (edges) m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 28), line));
      car.add(m); return m;
    };
    const box = (w, h, l, x, y, z, mat, edges) => add(new THREE.BoxGeometry(w, h, l), mat || body, x, y, z, edges);
    const slab = (pts, depth, z0, mat) => {            // sagoma vista da dietro (x,y), estrusa in lunghezza
      const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]);
      pts.slice(1).forEach(q => sh.lineTo(q[0], q[1])); sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false }); g.translate(0, 0, z0);
      return add(g, mat || body, 0, 0, 0);
    };
    // scocca posteriore: spalle larghe, fianchi che si stringono sotto
    slab([[-0.9, 0.2], [0.9, 0.2], [1.02, 0.45], [1.02, 0.8], [0.9, 0.9], [0.6, 0.93], [-0.6, 0.93], [-0.9, 0.9], [-1.02, 0.8], [-1.02, 0.45]], 2.8, -2.3);
    // muso più basso
    slab([[-0.88, 0.2], [0.88, 0.2], [1.0, 0.45], [0.98, 0.6], [0.7, 0.66], [-0.7, 0.66], [-0.98, 0.6], [-1.0, 0.45]], 1.8, 0.5);
    // abitacolo stretto
    slab([[-0.6, 0.93], [0.6, 0.93], [0.46, 1.17], [-0.46, 1.17]], 1.9, -0.85, glass);
    // cofano motore che sale verso l'abitacolo, con vetro a nervature
    const ang = -0.16;
    const cover = box(1.12, 0.05, 1.6, 0, 1.03, -1.55); cover.rotation.x = ang;
    const hatch = box(0.82, 0.035, 1.25, 0, 1.065, -1.52, glass); hatch.rotation.x = ang;
    const rib = new THREE.MeshBasicMaterial({ color: ACCENT });
    for (let i = 0; i < 5; i++) { const r = box(0.8, 0.012, 0.03, 0, 1.085 + i * 0.037, -2.05 + i * 0.26, rib, false); r.rotation.x = ang; }
    for (const sx of [-1, 1]) { const st = box(0.03, 0.03, 1.25, sx * 0.41, 1.07, -1.52, body, false); st.rotation.x = ang; }
    // fari posteriori a pod rettangolari + segmenti rossi
    for (const sx of [-1, 1]) {
      box(0.42, 0.15, 0.05, sx * 0.8, 0.77, -2.33, dark);
      for (let i = 0; i < 3; i++) box(0.09, 0.085, 0.055, sx * (0.66 + i * 0.13), 0.77, -2.345, tailMat, false);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff3a22, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
      sp.position.set(sx * 0.8, 0.77, -2.45); sp.scale.set(1.0, 0.6, 1); car.add(sp); tailGlows.push(sp);
      box(0.24, 0.13, 0.18, sx * 1.12, 1.03, 0.45);                     // specchietti
      box(0.04, 0.12, 0.04, sx * 1.0, 0.95, 0.45, dark, false);
      box(0.05, 0.2, 0.8, sx * 1.035, 0.7, -0.75, dark, false);         // prese d'aria laterali
    }
    // pannello a rete (rombi) sotto i fari e lungo il paraurti
    const lattice = canvasTex(256, 32, (g, w, h) => {
      g.fillStyle = '#060606'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(245,179,53,.85)'; g.lineWidth = 1.4;
      for (let x = -h; x < w + h; x += 11) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + h, h); g.moveTo(x + h, 0); g.lineTo(x, h); g.stroke(); }
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.2), new THREE.MeshBasicMaterial({ map: lattice, side: THREE.DoubleSide }));
    mesh.position.set(0, 0.58, -2.315); mesh.rotation.y = Math.PI; car.add(mesh);
    box(1.95, 0.05, 0.07, 0, 0.43, -2.34);                                // labbro paraurti
    box(1.7, 0.03, 0.06, 0, 0.7, -2.32, body);                            // linea di cintura
    // diffusore con pinne, targa, due coppie di scarichi
    slab([[-0.86, 0.1], [0.86, 0.1], [0.74, 0.34], [-0.74, 0.34]], 0.5, -2.52, dark);
    for (const x of [-0.62, -0.33, 0.33, 0.62]) box(0.03, 0.22, 0.45, x, 0.26, -2.28, body, false);
    box(0.42, 0.12, 0.03, 0, 0.27, -2.55, glass);
    const tip = new THREE.CylinderGeometry(0.095, 0.095, 0.3, 14); tip.rotateX(Math.PI / 2);
    for (const x of [-0.78, -0.56, 0.56, 0.78]) { add(tip, dark, x, 0.3, -2.42); box(0.1, 0.1, 0.02, x, 0.3, -2.58, glass, false); }
    // gomme
    const rear = new THREE.CylinderGeometry(0.44, 0.44, 0.55, 18); rear.rotateZ(Math.PI / 2);
    const front = new THREE.CylinderGeometry(0.4, 0.4, 0.5, 18); front.rotateZ(Math.PI / 2);
    for (const sx of [-1, 1]) { add(rear, dark, sx * 1.03, 0.44, -1.5); add(front, dark, sx * 1.0, 0.4, 1.35); }
    // ombra di contatto
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 6.6), new THREE.MeshBasicMaterial({
      map: canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 4, 32, 32, 32); r.addColorStop(0, 'rgba(0,0,0,.85)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }),
      transparent: true, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.set(0, 0.05, -0.2); car.add(sh);
    // luci locali (solo i materiali Standard le usano)
    const tailLight = new THREE.PointLight(0xff3a22, 1.1, 6); tailLight.position.set(0, 0.6, -3.2); car.add(tailLight);
    const rim = new THREE.PointLight(0xffe2b8, 1.5, 24); rim.position.set(0, 5.5, -7); car.add(rim);
    car.userData.tailLight = tailLight;
    car.scale.setScalar(1.8);
  }
  scene.add(car);
  scene.add(new THREE.HemisphereLight(0xffcf9a, 0x0a0a09, 0.5));
  const tailDim = new THREE.Color(0x8a1a10), tailBright = new THREE.Color(0xff4a2e);

  /* ---------- ciclo ---------- */
  const camPos = V(0, 2.6, 6), camLook = V(0, 1.5, -20);
  const pA = V(0, 0, 0), tA = V(0, 0, 0), pB = V(0, 0, 0), tB = V(0, 0, 0), pC = V(0, 0, 0), tC = V(0, 0, 0);
  const tmp = V(0, 0, 0);
  let mx = 0, my = 0, tmx = 0, tmy = 0, roll = 0, fov = 60, last = performance.now();
  let prevPs = 0, spdS = 0, prevSpdS = 0, brakeS = 0;

  if (!reduce) addEventListener('pointermove', e => { tmx = e.clientX / innerWidth * 2 - 1; tmy = e.clientY / innerHeight * 2 - 1; }, { passive: true });
  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    readScroll();
  });

  function frame(now) {
    const dt = Math.max(0.001, Math.min(0.05, (now - last) / 1000)); last = now;
    const k = reduce ? 1 : 1 - Math.exp(-dt * 5);
    const speed = Math.abs(pt - ps);
    ps += (pt - ps) * (reduce ? 1 : 1 - Math.exp(-dt * 4));
    if (Math.abs(pt - ps) < 1e-5) ps = pt;

    /* velocità "di guida" dallo scroll → motore e luci dei freni */
    const raw = clamp(Math.abs(ps - prevPs) / dt / 0.12); prevPs = ps;
    spdS += (raw - spdS) * (1 - Math.exp(-dt * (raw > spdS ? 4 : 2.2)));
    const accel = (spdS - prevSpdS) / dt; prevSpdS = spdS;
    brakeS += (clamp(-accel * 1.2) - brakeS) * (1 - Math.exp(-dt * 10));
    if (Engine) Engine.update(dt, { spd: spdS, accel, brake: brakeS, hero: heroW });

    lane += ((branch === 'racing' ? 1 : 0) - lane) * k;
    boards.club.forEach(o => { o.visible = lane < 0.5; });
    boards.racing.forEach(o => { o.visible = lane >= 0.5; });
    for (const m of laneMats.C) m.opacity = 1 - 0.78 * lane;
    for (const m of laneMats.R) m.opacity = 0.22 + 0.78 * lane;

    /* camera */
    pathPoint(ps, pA, tA);
    pathPoint(Math.min(ps + 0.035, 1.06), pB, tB);
    camPos.lerp(tmp.copy(pA).addScaledVector(UP, 2.7), k);
    camLook.lerp(tmp.copy(pB).addScaledVector(UP, 1.2), k);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    mx += (tmx - mx) * 0.05; my += (tmy - my) * 0.05;
    camera.rotateY(-mx * 0.05); camera.rotateX(-my * 0.025);
    const bank = clamp((tA.z * tB.x - tA.x * tB.z) * 0.7, -0.14, 0.14);
    roll += (bank - roll) * 0.05; camera.rotateZ(reduce ? 0 : roll);
    const fovT = reduce ? 60 : 60 + Math.min(speed * 700, 16);
    fov += (fovT - fov) * 0.08;
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }

    /* vettura davanti alla camera */
    const lead = 13 * (ps < A ? A / 260 : ps < B ? (B - A) / 700 : (1 - B) / 140);   // ~13 m davanti alla camera
    pathPoint(Math.min(ps + lead, 1.12), pC, tC);
    car.position.set(pC.x, 0, pC.z);
    car.lookAt(pC.x + tC.x, 0, pC.z + tC.z);
    const bl = 0.35 + 0.65 * brakeS;                         // fanali accesi + frenata
    tailMat.color.copy(tailDim).lerp(tailBright, bl);
    tailGlows.forEach(s => { s.material.opacity = 0.35 + 0.65 * bl; s.scale.set(0.8 + 1.0 * brakeS, 0.5 + 0.5 * brakeS, 1); });
    car.userData.tailLight.intensity = 0.6 + 1.6 * brakeS;

    sky.position.copy(camera.position);
    sun.position.set(camera.position.x, camera.position.y + 90, camera.position.z - 1700);
    scene.getObjectByName('stars').position.copy(camera.position);
    updateUI(ps);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  readScroll(); ps = pt; prevPs = ps;
  requestAnimationFrame(frame);
})();
