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
  let wantSound = false;

  /* ---------- UI ---------- */
  const hero = $('#hero'), video = $('#heroVideo'), ph = $('#heroPh'), soundBtn = $('#soundBtn');
  const bar = $('#bar'), panels = $$('.panel'), laneBtns = $$('[data-lane]');

  function scrollMax() { return document.documentElement.scrollHeight - innerHeight; }
  function readScroll() { pt = clamp(scrollY / Math.max(1, scrollMax())); }
  function goTo(p) {
    scrollTo({ top: p * scrollMax(), behavior: reduce ? 'auto' : 'smooth' });
  }
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

  /* modulo (nessun invio: da collegare) */
  const form = $('#contactForm'), msg = $('#formMsg');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const d = new FormData(form);
    const ok = String(d.get('nome')).trim() && /\S+@\S+\.\S+/.test(String(d.get('email')));
    msg.textContent = ok ? 'Grazie. Ti ricontatteremo a breve.' : 'Inserisci nome ed email valida.';
  });

  function updateUI(p) {
    bar.style.width = (p * 100).toFixed(2) + '%';
    const hw = clamp(1 - p / 0.04);
    hero.style.opacity = hw;
    hero.style.visibility = hw > 0.01 ? 'visible' : 'hidden';
    hero.style.transform = `scale(${1 + (1 - hw) * 0.12})`;
    if (hw < 0.3) { if (!video.paused) video.pause(); }
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
  scene.fog = new THREE.Fog(BG, 30, 300);
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1400);

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const UP = V(0, 1, 0);

  /* tracciato: partenza comune, due corsie, arrivo comune */
  const S = new THREE.CatmullRomCurve3([V(0, 0, 0), V(0, 0, -70), V(6, 0, -140), V(0, 0, -210), V(0, 0, -260)]);
  const C = new THREE.CatmullRomCurve3([
    V(0, 0, -260), V(-14, 0, -320), V(-48, 0, -400), V(-60, 0, -500), V(-30, 0, -600),
    V(-44, 0, -700), V(-14, 0, -800), V(0, 0, -900)]);
  const R = new THREE.CatmullRomCurve3([
    V(0, 0, -260), V(14, 0, -320), V(48, 0, -380), V(40, 0, -470), V(72, 0, -570),
    V(40, 0, -670), V(52, 0, -790), V(0, 0, -900)]);
  const E = new THREE.CatmullRomCurve3([V(0, 0, -900), V(0, 0, -960), V(0, 0, -1040)]);
  [S, C, R, E].forEach(c => { c.curveType = 'catmullrom'; c.tension = 0.5; });

  const _p = V(0, 0, 0), _t = V(0, 0, 0);
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

  /* cielo: gradiente con alone caldo all'orizzonte, segue la camera */
  {
    const cv = document.createElement('canvas'); cv.width = 4; cv.height = 256;
    const g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#0b0b0a'); gr.addColorStop(0.42, '#13100d'); gr.addColorStop(0.5, '#3b2412');
    gr.addColorStop(0.58, '#13100d'); gr.addColorStop(1, '#0f0f0e');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 24, 16),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -1; sky.name = 'sky'; scene.add(sky);
  }

  /* terreno scuro: sfuma nella nebbia, l'alone caldo resta sopra l'orizzonte */
  {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(3200, 3200), new THREE.MeshBasicMaterial({ color: BG }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.16, -560);
    scene.add(ground);
  }

  /* pavimento a griglia */
  const grid = new THREE.GridHelper(2400, 240, 0x2c2c2a, 0x1a1a19);
  grid.position.set(0, -0.12, -560);
  grid.material.transparent = true; grid.material.opacity = 0.7;
  scene.add(grid);

  /* nastro generico lungo una curva */
  function strip(curve, n, offset, width, y, mat) {
    const pos = new Float32Array((n + 1) * 6), idx = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, p = curve.getPointAt(u), t = curve.getTangentAt(u);
      let sx = -t.z, sz = t.x; const l = Math.hypot(sx, sz) || 1; sx /= l; sz /= l;
      const cx = p.x + sx * offset, cz = p.z + sz * offset;
      pos.set([cx - sx * width / 2, y, cz - sz * width / 2, cx + sx * width / 2, y, cz + sz * width / 2], i * 6);
      if (i < n) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const m = new THREE.Mesh(geo, mat);
    scene.add(m);
    return m;
  }

  /* istanze lungo una curva */
  const dummy = new THREE.Object3D();
  function samples(curve, step, offset, outList) {
    const n = Math.max(2, Math.floor(curve.getLength() / step));
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n, p = curve.getPointAt(u), t = curve.getTangentAt(u);
      const s = V(-t.z, 0, t.x).normalize();
      outList.push({ p: p.clone().addScaledVector(s, offset), t: t.clone(), i });
    }
  }
  function instanced(geo, mat, list, y, colorFn) {
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((o, k) => {
      dummy.position.set(o.p.x, y, o.p.z);
      dummy.lookAt(o.p.x + o.t.x, y, o.p.z + o.t.z);
      dummy.updateMatrix();
      m.setMatrixAt(k, dummy.matrix);
      if (colorFn) m.setColorAt(k, colorFn(o, k));
    });
    m.instanceMatrix.needsUpdate = true;
    scene.add(m);
    return m;
  }

  const asphalt = new THREE.MeshBasicMaterial({ color: 0x1e1e1c, side: THREE.DoubleSide });
  const W = 16;
  const laneMats = { C: [], R: [] };
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
  const poleMat = new THREE.MeshBasicMaterial({ color: 0x3a3a37 });
  const tipMat = new THREE.MeshBasicMaterial({ color: ACCENT });
  const white = new THREE.Color(0xffffff), warm = new THREE.Color(ACCENT);

  function buildTrack(curve, key) {
    const len = curve.getLength(), n = Math.max(40, Math.floor(len / 3));
    strip(curve, n, 0, W, 0, asphalt);
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide });
    strip(curve, n, -(W / 2 - 0.35), 0.35, 0.02, edgeMat);
    strip(curve, n, (W / 2 - 0.35), 0.35, 0.02, edgeMat);
    if (key) laneMats[key].push(edgeMat);

    const dashes = []; samples(curve, 9, 0, dashes);
    instanced(new THREE.BoxGeometry(0.3, 0.03, 3.4), dashMat, dashes, 0.03);

    const poles = []; samples(curve, 34, W / 2 + 4, poles); samples(curve, 34, -(W / 2 + 4), poles);
    instanced(new THREE.CylinderGeometry(0.11, 0.11, 7, 6), poleMat, poles, 3.5);
    instanced(new THREE.SphereGeometry(0.34, 8, 6), tipMat, poles, 7.2);

    if (key) { // cordoli solo sulle corsie
      const curbMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
      const curbs = []; samples(curve, 2.6, W / 2 + 0.8, curbs); samples(curve, 2.6, -(W / 2 + 0.8), curbs);
      instanced(new THREE.BoxGeometry(1.2, 0.1, 2.3), curbMat, curbs, 0.05, (o, k) => (o.i % 2 ? white : warm));
      laneMats[key].push(curbMat);
    }
  }
  buildTrack(S, null); buildTrack(C, 'C'); buildTrack(R, 'R'); buildTrack(E, null);

  /* portali (partenza, bivio, traguardo) */
  const gantryMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
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
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 16;
    const g = cv.getContext('2d');
    for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) { g.fillStyle = (x + y) % 2 ? '#fff' : '#111'; g.fillRect(x * 8, y * 8, 8, 8); }
    const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(W, 2.4), new THREE.MeshBasicMaterial({ map: tex }));
    const p = E.getPointAt(0.35);
    plane.rotation.x = -Math.PI / 2; plane.position.set(p.x, 0.04, p.z);
    scene.add(plane);
  }

  /* cartelli: 7 tappe sul Club, 4 blocchi sul Racing */
  const boards = { club: [], racing: [] };
  function board(text, curve, u, side, color, key) {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
    const g = cv.getContext('2d');
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = color || '#fff';
    const big = text.length <= 2;
    g.font = big ? '400 170px Georgia, serif' : '400 74px Georgia, serif';
    g.fillText(text, 256, big ? 118 : 110);
    if (big) { g.font = '600 26px Helvetica, Arial, sans-serif'; g.fillStyle = '#ffa45c'; g.fillText('TAPPA', 256, 218); }
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
    const p = curve.getPointAt(u), t = curve.getTangentAt(u), s = V(-t.z, 0, t.x).normalize();
    spr.position.copy(p).addScaledVector(s, side * (W / 2 + 5)); spr.position.y = 8;
    spr.scale.set(18, 9, 1);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.14, 7, 0.14), tipMat);
    pole.position.copy(p).addScaledVector(s, side * (W / 2 + 5)); pole.position.y = 3.5;
    scene.add(spr, pole); boards[key].push(spr, pole);
  }
  for (let i = 0; i < 7; i++) board('0' + (i + 1), C, 0.58 + i * 0.058, i % 2 ? -1 : 1, '#fff', 'club');
  ['SPORT', 'PARTNER', 'MEDIA', 'ESPERIENZE'].forEach((t, i) => board(t, R, 0.42 + i * 0.17, i % 2 ? 1 : -1, '#fff', 'racing'));

  /* polvere/particelle */
  {
    const n = mobile ? 700 : 2200, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 320 + (Math.random() < 0.5 ? 0 : (Math.random() - 0.5) * 120);
      pos[i * 3 + 1] = Math.random() * 40 + 0.4;
      pos[i * 3 + 2] = 40 - Math.random() * 1200;
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dot = document.createElement('canvas'); dot.width = dot.height = 32;
    const dg = dot.getContext('2d'), rg = dg.createRadialGradient(16, 16, 0, 16, 16, 16);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    dg.fillStyle = rg; dg.fillRect(0, 0, 32, 32);
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(dot), color: 0xffffff, size: 0.6, transparent: true, opacity: 0.6, depthWrite: false, sizeAttenuation: true })));
  }

  /* supercar a cuneo vista da dietro (sagoma generica, nessun marchio) */
  const car = new THREE.Group();
  {
    const fill = new THREE.MeshBasicMaterial({ color: 0x0a0a09 });
    const edge = new THREE.LineBasicMaterial({ color: ACCENT });
    const lamp = new THREE.MeshBasicMaterial({ color: 0xff4a2e });
    const addMesh = (geo, x, y, z, mat, edges, rx, rz) => {
      const m = new THREE.Mesh(geo, mat || fill); m.position.set(x, y, z);
      if (rx) m.rotation.x = rx; if (rz) m.rotation.z = rz;
      if (edges !== false) m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), edge));
      car.add(m); return m;
    };
    const box = (w, h, l, x, y, z, mat, edges) => addMesh(new THREE.BoxGeometry(w, h, l), x, y, z, mat, edges);

    // profilo laterale a cuneo (z avanti, y alto), estruso in larghezza
    const prof = new THREE.Shape();
    const pts = [[2.4, 0.3], [2.35, 0.5], [1.0, 0.72], [0.35, 1.06], [-0.35, 1.08], [-1.5, 0.86], [-2.3, 0.82], [-2.38, 0.3]];
    prof.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach(q => prof.lineTo(q[0], q[1])); prof.closePath();
    const body = new THREE.ExtrudeGeometry(prof, { depth: 1.9, bevelEnabled: false });
    body.translate(0, 0, -0.95); body.rotateY(-Math.PI / 2);
    addMesh(body, 0, 0, 0);

    // fari posteriori a Y: barra + traversa discendente verso l'esterno
    for (const sx of [-1, 1]) {
      box(0.78, 0.07, 0.05, sx * 0.62, 0.8, -2.4, lamp, false);
      const prong = box(0.06, 0.34, 0.05, sx * 0.98, 0.66, -2.4, lamp, false);
      prong.rotation.z = sx * 0.45;
      box(0.2, 0.06, 0.2, sx * 1.12, 1.02, 0.55);   // specchietti
    }
    // diffusore con pinne
    box(1.5, 0.12, 0.5, 0, 0.26, -2.25);
    for (const x of [-0.5, -0.17, 0.17, 0.5]) box(0.04, 0.2, 0.5, x, 0.32, -2.3);
    // scarico unico esagonale
    addMesh(new THREE.CylinderGeometry(0.26, 0.26, 0.3, 6), 0, 0.48, -2.4, fill, true, Math.PI / 2);
    // alettone su due piloni
    box(1.9, 0.05, 0.55, 0, 1.12, -2.1);
    box(0.06, 0.28, 0.3, 0.55, 0.98, -2.05); box(0.06, 0.28, 0.3, -0.55, 0.98, -2.05);
    // ruote (posteriori più larghe)
    const rear = new THREE.CylinderGeometry(0.44, 0.44, 0.5, 16), front = new THREE.CylinderGeometry(0.4, 0.4, 0.55, 16);
    for (const sx of [-1, 1]) {
      addMesh(rear, sx * 1.05, 0.44, -1.5, fill, true, 0, Math.PI / 2);
      addMesh(front, sx * 1.06, 0.4, 1.5, fill, true, 0, Math.PI / 2);
    }
    // bagliore dei fari
    const gc = document.createElement('canvas'); gc.width = gc.height = 64;
    const gg = gc.getContext('2d'), gr = gg.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,90,50,1)'); gr.addColorStop(1, 'rgba(255,90,50,0)');
    gg.fillStyle = gr; gg.fillRect(0, 0, 64, 64);
    const gm = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gc), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    for (const x of [-0.75, 0.75]) { const sp = new THREE.Sprite(gm); sp.position.set(x, 0.74, -2.5); sp.scale.set(1.0, 0.5, 1); car.add(sp); }
    car.scale.setScalar(1.8);
  }
  scene.add(car);

  /* scia luminosa dietro la vettura */
  const TRAIL_N = 44;
  const trailGeo = new THREE.BufferGeometry();
  const trailPos = new Float32Array(TRAIL_N * 6), trailCol = new Float32Array(TRAIL_N * 6), trailIdx = [];
  for (let i = 0; i < TRAIL_N - 1; i++) trailIdx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 3));
  trailGeo.setIndex(trailIdx);
  const trail = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  trail.frustumCulled = false;
  scene.add(trail);
  const accentC = new THREE.Color(ACCENT);

  /* ---------- ciclo ---------- */
  const camPos = V(0, 2.6, 6), camLook = V(0, 1.5, -20);
  const pA = V(0, 0, 0), tA = V(0, 0, 0), pB = V(0, 0, 0), tB = V(0, 0, 0), pC = V(0, 0, 0), tC = V(0, 0, 0);
  const sideV = V(0, 0, 0), tmp = V(0, 0, 0);
  let mx = 0, my = 0, tmx = 0, tmy = 0, roll = 0, fov = 60, last = performance.now();

  if (!reduce) addEventListener('pointermove', e => { tmx = e.clientX / innerWidth * 2 - 1; tmy = e.clientY / innerHeight * 2 - 1; }, { passive: true });
  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    readScroll();
  });

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const k = reduce ? 1 : 1 - Math.exp(-dt * 5);
    const speed = Math.abs(pt - ps);
    ps += (pt - ps) * (reduce ? 1 : 1 - Math.exp(-dt * 4));
    if (Math.abs(pt - ps) < 1e-5) ps = pt;

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

    /* vettura davanti alla camera + scia */
    const pcar = Math.min(ps + 0.011, 1.04);
    pathPoint(pcar, pC, tC);
    car.position.set(pC.x, 0, pC.z);
    car.lookAt(pC.x + tC.x, 0, pC.z + tC.z);
    for (let i = 0; i < TRAIL_N; i++) {
      pathPoint(pcar - 0.0016 - i * 0.0030, pA, tA);   // pA/tA riusati: la camera è già posizionata
      sideV.set(-tA.z, 0, tA.x).normalize();
      const w = 0.2 * (1 - i / TRAIL_N * 0.7), f = 0.55 * Math.pow(1 - i / (TRAIL_N - 1), 2.6);
      const o = i * 6;
      trailPos[o] = pA.x - sideV.x * w; trailPos[o + 1] = 0.5; trailPos[o + 2] = pA.z - sideV.z * w;
      trailPos[o + 3] = pA.x + sideV.x * w; trailPos[o + 4] = 0.5; trailPos[o + 5] = pA.z + sideV.z * w;
      for (let j = 0; j < 2; j++) {
        trailCol[o + j * 3] = accentC.r * f; trailCol[o + j * 3 + 1] = accentC.g * f; trailCol[o + j * 3 + 2] = accentC.b * f;
      }
    }
    trailGeo.attributes.position.needsUpdate = true;
    trailGeo.attributes.color.needsUpdate = true;

    scene.getObjectByName('sky').position.copy(camera.position);
    updateUI(ps);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  readScroll(); ps = pt;
  requestAnimationFrame(frame);
})();
