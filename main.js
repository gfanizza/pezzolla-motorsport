/* Pezzolla Motorsport — viaggio 3D guidato dallo scroll.
   Scena procedurale (three r128 globale; moduli: tex.js, post.js, world.js, car.js).
   Progresso 0–1: partenza 0–A · corsia (Club | Racing) A–B · arrivo B–1 */
(() => {
  'use strict';
  const PZ = window.PZ;
  const A = 0.28, B = 0.80;          // confini dei tratti
  const FORK_P = 0.34;               // dove si atterra dopo la scelta
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = Math.min(innerWidth, innerHeight) < 700 || /Android|iPhone|iPad/i.test(navigator.userAgent);
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
  const hint = $('#hintTxt'), tel = $('#tel');

  function scrollMax() { return document.documentElement.scrollHeight - innerHeight; }
  function readScroll() { pt = clamp(scrollY / Math.max(1, scrollMax())); }
  function goTo(p) { scrollTo({ top: p * scrollMax(), behavior: reduce ? 'auto' : 'smooth' }); }
  function setBranch(b, jump) {
    branch = b;
    laneBtns.forEach(el => el.classList.toggle('active', el.dataset.lane === b));
    if (tel) tel.dataset.lane = b;
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
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  } catch (err) { renderer = null; }

  if (!renderer || !PZ || !PZ.buildWorld) {
    document.body.classList.add('nogl');
    panels.forEach(el => { el.style.opacity = 1; });
    return;
  }

  /* qualità: la risoluzione interna si adatta al tempo di calcolo, poi le ombre */
  const MAXPX = mobile ? 1.15e6 : 2.7e6;
  const Q = { scale: 1, shadows: !mobile && !/noshadow/.test(location.search), lastAdj: 0, slow: 0, fast: 0 };
  renderer.setClearColor(0x0a0605);
  renderer.shadowMap.enabled = Q.shadows; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const flags = location.search;          // ?nopost / ?noshadow: per verificare i percorsi di ripiego
  const post = /nopost/.test(flags) ? null : PZ.createPost(renderer, { samples: /nomsaa/.test(flags) ? 0 : mobile ? 2 : 4, levels: mobile ? 4 : 5, rays: mobile ? 12 : 24, threshold: 1.4, bloom: mobile ? 0.13 : 0.2, raysK: mobile ? 0.04 : 0.08, grain: reduce ? 0.01 : 0.026, vig: 0.5, ab: 0.004 });
  if (!post) { renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1; }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.3, 2600);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const UP = V(0, 1, 0);
  let world = null, car = null, parked = [];

  function applySize() {
    const dpr = Math.min(devicePixelRatio || 1, mobile ? 1.5 : 2);
    const k = Math.min(1, Math.sqrt(MAXPX / (innerWidth * innerHeight * dpr * dpr)));      // limite sull'area totale
    const out = post ? Math.max(k, 0.7) : k * Q.scale;                                      // buffer del canvas (uscita)
    renderer.setPixelRatio(dpr * out); renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    const w = canvas.width, h = canvas.height;
    if (post) { const rs = (k < 0.7 ? k / 0.7 : 1) * Q.scale; post.setSize(Math.max(64, Math.round(w * rs)), Math.max(64, Math.round(h * rs))); }
    if (world) world.fogU.uRes.value.set(post ? post.width : w, post ? post.height : h);
  }

  /* tracciato e mappa */
  let S, C, R, E;
  const pA = V(0, 0, 0), tA = V(0, 0, 0), pB = V(0, 0, 0), tB = V(0, 0, 0), pC = V(0, 0, 0), tC = V(0, 0, 0), tC2 = V(0, 0, 0), pD = V(0, 0, 0);
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

  /* HUD: mappa schematica del circuito (asse X dilatato) + telemetria */
  const SVGNS = 'http://www.w3.org/2000/svg';
  const hudEl = { dot: null, spd: $('#tSpd'), gear: $('#tGear'), sec: $('#tSec'), secName: $('#tSecName'), rev: $('#tRev') };
  const mapPt = (p) => [6 - p.z * 0.0975, 24 + p.x * 0.3];      // avanza verso destra; lo scarto laterale è dilatato
  function buildMap() {
    const svg = $('#map'); if (!svg) return;
    const mk = (c, cls) => {
      const n = 90, d = [];
      for (let i = 0; i <= n; i++) { const q = c.getPointAt(i / n), m = mapPt(q); d.push((i ? 'L' : 'M') + m[0].toFixed(1) + ' ' + m[1].toFixed(1)); }
      const el = document.createElementNS(SVGNS, 'path'); el.setAttribute('d', d.join('')); el.setAttribute('class', cls); svg.appendChild(el); return el;
    };
    mk(S, 'm-road'); mk(E, 'm-road'); mk(C, 'm-road m-club'); mk(R, 'm-road m-racing');
    const f = document.createElementNS(SVGNS, 'path'); f.setAttribute('d', 'M107 15v18'); f.setAttribute('class', 'm-fin'); svg.appendChild(f);
    const dot = document.createElementNS(SVGNS, 'circle'); dot.setAttribute('r', '3.2'); dot.setAttribute('class', 'm-dot'); svg.appendChild(dot); hudEl.dot = dot;
    const rev = hudEl.rev;
    if (rev) for (let i = 0; i < 24; i++) { const s = document.createElement('i'); if (i >= 19) s.className = 'red'; rev.appendChild(s); }
  }
  const SEG = [['S1', 'Rettilineo'], ['S2', ''], ['S3', 'Traguardo']];
  let lastSec = -1, lastLaneTxt = '';
  let rpmM = 900;
  function paintHud(spd, dt, carPos) {
    if (!hudEl.dot) return;
    const m = mapPt(carPos); hudEl.dot.setAttribute('cx', m[0].toFixed(1)); hudEl.dot.setAttribute('cy', m[1].toFixed(1));
    tel.style.opacity = (1 - heroW).toFixed(2);
    hudEl.spd.textContent = String(Math.round(spd * 318)).padStart(3, '0');
    let gear, rpm;
    if (Engine && Engine.on) { gear = Engine.gear; rpm = Engine.rpm; }
    else {
      const x = Math.min(0.999, spd) * 6; gear = spd < 0.02 ? 0 : Math.floor(x); const fr = x - Math.floor(x);
      const target = spd < 0.02 ? 900 : gear === 0 ? 900 + 6700 * Math.pow(fr, 0.8) : 4300 + 4100 * fr;
      rpmM += (target - rpmM) * (1 - Math.exp(-dt * 8)); rpm = rpmM;
    }
    hudEl.gear.textContent = spd < 0.02 ? 'N' : String(gear + 1);
    const lit = Math.round(clamp((rpm - 900) / (8400 - 900)) * 24);
    const kids = hudEl.rev.children; for (let i = 0; i < kids.length; i++) kids[i].classList.toggle('on', i < lit);
    const sec = ps < A ? 0 : ps < B ? 1 : 2, txt = sec === 1 ? (branch === 'racing' ? 'MR Racing' : 'MR Club') : SEG[sec][1];
    if (sec !== lastSec || txt !== lastLaneTxt) { lastSec = sec; lastLaneTxt = txt; hudEl.sec.textContent = SEG[sec][0]; hudEl.secName.textContent = txt; }
  }

  /* ---------- costruzione (dopo il primo paint, così il video parte subito) ---------- */
  let ready = false;
  const camPos = V(0, 2.6, 6), camLook = V(0, 1.5, -20);
  const tmp = V(0, 0, 0);
  let mx = 0, my = 0, tmx = 0, tmy = 0, roll = 0, fov = 60, last = performance.now();
  let prevPs = 0, spdS = 0, prevSpdS = 0, brakeS = 0, steerS = 0, accelS = 0;

  function build() {
    const t0 = performance.now();
    world = PZ.buildWorld(scene, renderer, { mobile, shadows: Q.shadows, hdr: !!(post && post.hdr) });
    ({ S, C, R, E } = world);
    car = PZ.buildCar(world, { paint: 0x1b1c1f });
    scene.add(car.group);
    // vetture ferme davanti ai box
    const paints = [[0xe9e6df, 0.35, 0.28], [0x8c5a1f, 0.6, 0.3], [0x16181c, 0.5, 0.3]];
    parked = paints.map(([c, m, r], i) => {
      const k = PZ.buildCar(world, { paint: c, metal: m, rough: r });
      k.group.position.set(-27.5 + (i % 2) * 1.2, 0, -168 - i * 15);
      k.group.rotation.y = Math.PI + (i - 1) * 0.04;      // il muso verso -z, come la direzione di marcia
      scene.add(k.group); return k;
    });
    buildMap();
    applySize();
    readScroll(); ps = pt; prevPs = ps;
    window.__buildMs = Math.round(performance.now() - t0);
    PZ.dbg = { scene, camera, renderer, world, car, post, Q };      // maniglie per le verifiche visive
    ready = true; document.body.classList.remove('booting'); document.body.classList.add('ready');
    if (hint) hint.textContent = 'Scorri';
    requestAnimationFrame(frame);
  }

  addEventListener('resize', () => { if (ready) { applySize(); readScroll(); } });
  if (!reduce) addEventListener('pointermove', e => { tmx = e.clientX / innerWidth * 2 - 1; tmy = e.clientY / innerHeight * 2 - 1; }, { passive: true });

  /* qualità adattiva: ogni ~2,5 s guarda il tempo medio di fotogramma */
  let accT = 0, accN = 0;
  function adapt(dt, now) {
    accT += dt; accN++;
    if (now - Q.lastAdj < 2500 || accN < 45) return;
    const avg = accT / accN * 1000; accT = 0; accN = 0;
    if (avg > 26) { Q.slow++; Q.fast = 0; } else if (avg < 15) { Q.fast++; Q.slow = 0; } else { Q.slow = Q.fast = 0; }
    if (Q.slow >= 2) {
      Q.slow = 0; Q.lastAdj = now;
      if (Q.scale > 0.62) { Q.scale = Math.max(0.6, Q.scale * 0.85); applySize(); }
      else if (Q.shadows) { Q.shadows = false; renderer.shadowMap.enabled = false; world.sun.castShadow = false; scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); }
    } else if (Q.fast >= 6 && Q.scale < 1) { Q.fast = 0; Q.lastAdj = now; Q.scale = Math.min(1, Q.scale * 1.08); applySize(); }
  }

  function frame(now) {
    window.__frames = (window.__frames | 0) + 1;
    if (window.__still) { ps = pt; prevPs = ps; spdS = 0; prevSpdS = 0; brakeS = 0; accelS = 0; roll = 0; }   // hook per le verifiche visive (software GL è lento)
    const dt = Math.max(0.001, Math.min(0.05, (now - last) / 1000)); last = now;
    const k = reduce || window.__still ? 1 : 1 - Math.exp(-dt * 5);
    const speed = Math.abs(pt - ps);
    ps += (pt - ps) * (reduce ? 1 : 1 - Math.exp(-dt * 4));
    if (Math.abs(pt - ps) < 1e-5) ps = pt;

    /* velocità "di guida" dallo scroll → motore e luci dei freni */
    const dps = ps - prevPs;
    const raw = clamp(Math.abs(dps) / dt / 0.12); prevPs = ps;
    spdS += (raw - spdS) * (1 - Math.exp(-dt * (raw > spdS ? 4 : 2.2)));
    const accel = (spdS - prevSpdS) / dt; prevSpdS = spdS;
    brakeS += (clamp(-accel * 1.2) - brakeS) * (1 - Math.exp(-dt * 10));
    accelS += (clamp(accel * 0.8, -1, 1) - accelS) * (1 - Math.exp(-dt * 6));
    if (Engine) Engine.update(dt, { spd: spdS, accel, brake: brakeS, hero: heroW });

    lane += ((branch === 'racing' ? 1 : 0) - lane) * k;
    world.boards.club.forEach(o => { o.visible = lane < 0.5; });
    world.boards.racing.forEach(o => { o.visible = lane >= 0.5; });
    for (const m of world.laneMats.C) m.opacity = 1 - 0.78 * lane;
    for (const m of world.laneMats.R) m.opacity = 0.22 + 0.78 * lane;

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
    if (window.__cam) { camera.position.fromArray(window.__cam.p); camera.lookAt(V().fromArray(window.__cam.l)); }   // hook per le verifiche visive

    /* vettura davanti alla camera */
    const mpu = ps < A ? S.getLength() / A : ps < B ? C.getLength() / (B - A) : E.getLength() / (1 - B);   // metri per unità di progresso
    const lead = 11.5 / mpu;
    pathPoint(Math.min(ps + lead, 1.12), pC, tC);
    pathPoint(Math.min(ps + lead + 0.012, 1.14), pD, tC2);
    car.group.position.set(pC.x, 0, pC.z);
    car.group.lookAt(pC.x + tC.x, 0, pC.z + tC.z);
    const cy = tC.z * tC2.x - tC.x * tC2.z;                      // >0 curva a sinistra
    steerS += (clamp(cy * 70, -1, 1) - steerS) * (1 - Math.exp(-dt * 5));
    car.update({ dist: dps * mpu, steer: reduce ? 0 : steerS, brake: brakeS, thr: clamp(spdS * 1.4), roll: reduce ? 0 : steerS * 0.02, pitch: reduce ? 0 : brakeS * 0.012 - accelS * 0.006, dt });
    if (!reduce && accel < -0.8 && spdS > 0.25 && Math.random() < dt * 5) car.pop();
    for (const p of parked) p.update({ dist: 0, brake: 0, thr: 0, dt });

    world.update(dt, camera, now / 1000 * (reduce ? 0 : 1), car.group.position, reduce);
    updateUI(ps);
    paintHud(spdS, dt, pC);

    if (post) {
      const u = post.uniforms;
      u.uSun.value.copy(world.fogU.uSunScr.value); u.uSunVis.value = world.fogU.uSunScrVis.value;
      u.uSpeed.value = reduce ? 0 : Math.min(1, spdS * 1.15);
      u.uTime.value = reduce ? 0 : (now % 1000) / 1000;
      u.uExposure.value = 0.92;
      post.render(scene, camera);
    } else renderer.render(scene, camera);
    adapt(dt, now);
    requestAnimationFrame(frame);
  }

  document.body.classList.add('booting'); if (hint) hint.textContent = 'Preparo il circuito';
  requestAnimationFrame(() => setTimeout(build, 40));
})();
