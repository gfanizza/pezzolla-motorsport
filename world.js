/* Il circuito: luci, cielo, terreno, asfalto, barriere, alberi, tribuna, box, portali.
   Tutto procedurale; nessun asset esterno. Materiali PBR con ombre del sole basso e nebbia
   che si accende verso il sole (stesso colore dell'orizzonte del cielo). */
(() => {
  'use strict';
  const PZ = (window.PZ = window.PZ || {});
  const T = PZ.tex;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const ACCENT = 0xf5b335;
  const mulberry = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

  PZ.buildWorld = (scene, renderer, o = {}) => {
    const mobile = !!o.mobile, shadows = !!o.shadows, W = 16;
    const R01 = mulberry(20271011), rnd = (a, b) => a + R01() * (b - a);

    /* ===== tracciato: partenza comune, due corsie, arrivo comune (invariato: è la mappa dello scroll) ===== */
    const S = new THREE.CatmullRomCurve3([V(0, 0, 0), V(0, 0, -70), V(6, 0, -140), V(0, 0, -210), V(0, 0, -260)]);
    const C = new THREE.CatmullRomCurve3([
      V(0, 0, -260), V(-14, 0, -320), V(-48, 0, -400), V(-60, 0, -500), V(-30, 0, -600),
      V(-44, 0, -700), V(-14, 0, -800), V(0, 0, -900)]);
    const R = new THREE.CatmullRomCurve3([
      V(0, 0, -260), V(14, 0, -320), V(48, 0, -380), V(40, 0, -470), V(72, 0, -570),
      V(40, 0, -670), V(52, 0, -790), V(0, 0, -900)]);
    const E = new THREE.CatmullRomCurve3([V(0, 0, -900), V(0, 0, -960), V(0, 0, -1040)]);
    const X = new THREE.CatmullRomCurve3([V(0, 0, -1040), V(0, 0, -1130), V(0, 0, -1260)]);     // prolungamento oltre il traguardo (solo scenografia)
    [S, C, R, E, X].forEach(c => { c.arcLengthDivisions = 800; });

    /* ===== nebbia con colore dipendente dalla posizione dello schermo rispetto al sole ===== */
    const fogCol = new THREE.Color(0.055, 0.026, 0.02);
    const fogU = {
      uSunScr: { value: new THREE.Vector2(0.5, 0.55) }, uRes: { value: new THREE.Vector2(1, 1) },
      uSunFog: { value: new THREE.Color(0.34, 0.115, 0.025) }, uSunScrVis: { value: 1 },
    };
    scene.fog = new THREE.FogExp2(fogCol, o.fogDensity || 0.0034);
    const FOG_FRAG = `
      #ifdef USE_FOG
        float fogF = 1.0 - exp(-fogDensity * fogDensity * fogDepth * fogDepth);
        vec2 sc = gl_FragCoord.xy / uRes;
        float sgl = pow(clamp(1. - length((sc - uSunScr) * vec2(uRes.x / uRes.y, 1.)) * 2.3, 0., 1.), 2.6) * uSunScrVis;
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor + uSunFog * sgl, fogF);
      #endif`;
    const patch = (m) => {
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, fogU);
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\nuniform vec2 uSunScr, uRes; uniform vec3 uSunFog; uniform float uSunScrVis;')
          .replace('#include <fog_fragment>', FOG_FRAG);
      };
      m.customProgramCacheKey = () => 'pzfog';
      return m;
    };
    const STD = (p) => patch(new THREE.MeshStandardMaterial(p));                 // PBR completo: asfalto, guardrail, vettura
    /* materiale "secondario": PBR su desktop; su telefono Lambert (shader molto più leggero da compilare ed eseguire) */
    const LAMBERT = ['color', 'map', 'emissive', 'emissiveMap', 'vertexColors', 'alphaTest', 'side', 'transparent', 'opacity', 'depthWrite', 'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits'];
    const LIT = (p) => {
      if (!o.lambert) return STD(p);
      const q = {}; for (const k of LAMBERT) if (p[k] !== undefined) q[k] = p[k];
      return patch(new THREE.MeshLambertMaterial(q));
    };
    const BAS = (p) => patch(new THREE.MeshBasicMaterial(p));

    /* ===== luci: sole basso di fronte (controluce), riempimento freddo alle spalle, cielo ===== */
    const sunSky = V(0.08, 0.075, -1).normalize();            // dove sta il disco nel cielo
    const sunDir = V(0.2, 0.165, -1).normalize();             // direzione della luce: un po' più alta, per ombre lunghe ma leggibili
    const sun = new THREE.DirectionalLight(0xff9a45, o.hdr ? 2.4 : 2.2);
    sun.castShadow = shadows;
    const SH = 62;
    Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH * 0.7, bottom: -SH * 0.7, near: 1, far: 420 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05; sun.shadow.radius = 2.5;
    scene.add(sun, sun.target);
    const fill = new THREE.DirectionalLight(0x8a94d0, 0.55); scene.add(fill, fill.target);
    const hemi = new THREE.HemisphereLight(0x8a5a72, 0x120c08, 0.22); scene.add(hemi);

    /* ===== cielo: gradiente al crepuscolo, sole HDR, nuvole frattali (shader) ===== */
    const skyU = {
      ...fogU, uSun: { value: sunSky }, uTime: { value: 0 }, uFogCol: { value: fogCol }, uSunI: { value: 20 },
    };
    const skyMat = new THREE.ShaderMaterial({
      uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform vec3 uSun, uFogCol, uSunFog; uniform vec2 uSunScr, uRes; uniform float uTime, uSunScrVis, uSunI; varying vec3 vDir;
        float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
          return mix(mix(h21(i), h21(i + vec2(1., 0.)), f.x), mix(h21(i + vec2(0., 1.)), h21(i + vec2(1., 1.)), f.x), f.y); }
        float fbm(vec2 p, int n){ float a = .5, s = 0.; for (int i = 0; i < 6; i++) { if (i >= n) break; s += a * vn(p); p = p * 2.03 + vec2(17.1, 9.2); a *= .5; } return s; }
        void main(){
          vec3 d = normalize(vDir); float e = d.y, sd = max(dot(d, uSun), 0.);
          vec2 sc = gl_FragCoord.xy / uRes;
          float sgl = pow(clamp(1. - length((sc - uSunScr) * vec2(uRes.x / uRes.y, 1.)) * 2.3, 0., 1.), 2.6) * uSunScrVis;
          vec3 hz = uFogCol + uSunFog * sgl;                                   // l'orizzonte ha il colore della nebbia
          vec3 sky = mix(hz, vec3(.05, .024, .042), smoothstep(0., .2, e));
          sky = mix(sky, vec3(.013, .014, .034), smoothstep(.14, .5, e));
          sky = mix(sky, vec3(.004, .006, .017), smoothstep(.42, 1., e));
          sky += vec3(1., .46, .13) * (pow(sd, 5.) * .15 + pow(sd, 18.) * .4 + pow(sd, 90.) * 1.6) * smoothstep(-.04, .08, e);
          sky += vec3(1., .86, .6) * smoothstep(.99968, .99992, sd) * uSunI;         // disco solare (HDR → bloom)
          float ce = max(e, 0.);
          vec2 cp = d.xz / (ce + .1) * vec2(.9, 1.8) + vec2(uTime * .005, 0.) + vec2(4.1, 2.3);
          float dn = fbm(cp, ${mobile ? 3 : 6});
          float cover = smoothstep(.5, .74, dn) * smoothstep(.012, .08, e) * (1. - .5 * smoothstep(.55, .95, e));
          if (cover > .002) {
            float dn2 = fbm(cp + normalize(uSun.xz + 1e-4) * vec2(.9, 1.8) * .1, ${mobile ? 2 : 4});
            float rim = clamp((dn - dn2) * 5. + .35, 0., 1.), low = exp(-ce * 5.);
            vec3 lit = vec3(1.15, .44, .11) * (.1 + 1.6 * pow(sd, 1.5)) * (.2 + .8 * low);
            vec3 cloud = mix(vec3(.04, .026, .05) + lit * .25, lit, rim * (.3 + .7 * low));
            sky = mix(sky, cloud, cover * .93);
          }
          sky = mix(sky, hz, 1. - smoothstep(-.05, .0, e));       // (smoothstep con bordi invertiti non è definito in GLSL)
          gl_FragColor = vec4(sky, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 28), skyMat);
    sky.renderOrder = -2; sky.frustumCulled = false; scene.add(sky);

    {  // stelle: poche, solo in alto
      const n = mobile ? 220 : 520, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const th = rnd(0, Math.PI * 2), el = Math.asin(rnd(0.22, 1)), b = Math.pow(R01(), 3) * 1.8 + 0.4;
        pos.set([900 * Math.cos(el) * Math.sin(th), 900 * Math.sin(el), 900 * Math.cos(el) * Math.cos(th)], i * 3);
        col.set([b, b * 0.96, b * 0.9], i * 3);
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const stars = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.7, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.6, fog: false, depthWrite: false }));
      stars.name = 'stars'; stars.frustumCulled = false; scene.add(stars);
    }

    /* ===== ambiente per i riflessi (PMREM): cielo + pannelli luminosi sopra la vettura ===== */
    let envTex = null;
    if (renderer.capabilities.isWebGL2) {
      const envScene = new THREE.Scene();
      const envSky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 20), skyMat.clone());
      envSky.material.uniforms = { ...skyU, uSunScrVis: { value: 0 }, uSunI: { value: 3.5 } };
      envScene.add(envSky);
      const box = new THREE.MeshBasicMaterial({ color: new THREE.Color(5.5, 4.4, 3.4), side: THREE.DoubleSide });
      const warm = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 1.7, 0.7), side: THREE.DoubleSide });
      for (const [x, y, z, w, h, rx, ry, m] of [
        [0, 18, -4, 14, 3, Math.PI / 2, 0, box], [-14, 12, 6, 3, 14, 0, Math.PI / 2 - 0.5, box], [15, 10, 8, 2, 12, 0, -Math.PI / 2 + 0.6, warm],
        [0, 6, 30, 22, 3, 0, Math.PI, warm]]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.position.set(x, y, z); p.rotation.set(rx, ry, 0); envScene.add(p);
      }
      const gnd = new THREE.Mesh(new THREE.CircleGeometry(60, 24), new THREE.MeshBasicMaterial({ color: 0x0b0806 }));
      gnd.rotation.x = -Math.PI / 2; gnd.position.y = -1.2; envScene.add(gnd);
      // cubemap HDR → PMREM (PMREMGenerator.fromScene con ShaderMaterial produce NaN su alcuni driver software)
      const cubeRT = new THREE.WebGLCubeRenderTarget(mobile ? 128 : 256, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, generateMipmaps: false, minFilter: THREE.LinearFilter });
      const cc = new THREE.CubeCamera(0.1, 100, cubeRT), ac = renderer.autoClear;
      renderer.autoClear = true; cc.update(renderer, envScene); renderer.autoClear = ac;
      const pm = new THREE.PMREMGenerator(renderer);
      envTex = pm.fromCubemap(cubeRT.texture).texture; pm.dispose(); cubeRT.dispose();
      scene.environment = envTex;
    }

    /* ===== texture condivise ===== */
    const glowTex = T.glow();
    const lo = mobile;                      // su telefono: texture più piccole, meno istanze, meno segmenti
    const asph = T.asphalt(lo ? 256 : 512), grass = T.grass(lo ? 256 : 512), gravel = T.gravel(lo ? 128 : 256);
    const rubberTex = T.rubber(lo ? 0.5 : 1);

    /* ===== geometrie lungo le curve ===== */
    function frameAt(curve, u) {
      u = clamp(u);
      const p = curve.getPointAt(u), t = curve.getTangentAt(u);
      let sx = -t.z, sz = t.x; const l = Math.hypot(sx, sz) || 1; sx /= l; sz /= l;
      return { p, t, sx, sz };
    }
    /* nastro orizzontale: v = metri / tile, u = metri trasversali / uTile (o 0..1 se uTile = 0) */
    function strip(curve, n, offset, width, y, mat, tile, uTile) {
      const pos = new Float32Array((n + 1) * 6), uv = new Float32Array((n + 1) * 4), nor = new Float32Array((n + 1) * 6), idx = [];
      const L = curve.getLength(), uu = uTile ? width / uTile : 1;
      for (let i = 0; i <= n; i++) {
        const f = frameAt(curve, i / n), cx = f.p.x + f.sx * offset, cz = f.p.z + f.sz * offset;
        pos.set([cx - f.sx * width / 2, y, cz - f.sz * width / 2, cx + f.sx * width / 2, y, cz + f.sz * width / 2], i * 6);
        nor.set([0, 1, 0, 0, 1, 0], i * 6);
        const v = (i / n) * L / (tile || 8);
        uv.set([0, v, uu, v], i * 4);
        if (i < n) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
      const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; scene.add(m); return m;
    }
    /* profilo (distanza dal centro verso la strada, quota) trascinato lungo la curva */
    function sweep(curve, n, side, off, profile, mat, u0, u1, tile, flipU) {
      const pr = profile.length, pos = new Float32Array((n + 1) * pr * 3), uv = new Float32Array((n + 1) * pr * 2), idx = [];
      const L = curve.getLength();
      for (let i = 0; i <= n; i++) {
        const f = frameAt(curve, u0 + (u1 - u0) * i / n);
        for (let k = 0; k < pr; k++) {
          const lat = side * (off - profile[k][0]), j = (i * pr + k);
          pos.set([f.p.x + f.sx * lat, profile[k][1], f.p.z + f.sz * lat], j * 3);
          uv.set([(flipU ? -1 : 1) * (i / n) * L * (u1 - u0) / (tile || 4), profile[k][2] === undefined ? k / (pr - 1) : profile[k][2]], j * 2);
          if (i < n && k < pr - 1) { const a = j, b = j + 1, c = j + pr, d = j + pr + 1; idx.push(a, c, b, b, c, d); }
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; scene.add(m); return m;
    }

    /* ===== istanze raggruppate in celle: culling per distanza e ombre solo vicino alla camera ===== */
    const chunks = [], dummy = new THREE.Object3D(), CELL = 110;
    function instanced(geo, mat, items, o2 = {}) {
      const cells = new Map();
      for (const it of items) {
        const key = Math.floor(it.x / CELL) + ',' + Math.floor(it.z / CELL);
        if (!cells.has(key)) cells.set(key, []); cells.get(key).push(it);
      }
      for (const list of cells.values()) {
        const m = new THREE.InstancedMesh(geo, mat, list.length);
        let cx = 0, cz = 0; list.forEach(it => { cx += it.x; cz += it.z; }); cx /= list.length; cz /= list.length;
        let r = 0;
        list.forEach((it, k) => {
          dummy.position.set(it.x, it.y || 0, it.z);
          if (it.t) dummy.lookAt(it.x + it.t.x, it.y || 0, it.z + it.t.z); else dummy.rotation.set(0, it.ry || 0, 0);
          dummy.scale.set(it.sx || 1, it.sy || it.sx || 1, it.sz || it.sx || 1); dummy.updateMatrix();
          m.setMatrixAt(k, dummy.matrix);
          if (it.c) m.setColorAt(k, it.c);
          r = Math.max(r, Math.hypot(it.x - cx, it.z - cz));
        });
        dummy.rotation.set(0, 0, 0);
        m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
        m.frustumCulled = false; m.receiveShadow = !!o2.receive; m.castShadow = !!o2.cast;
        scene.add(m);
        chunks.push({ m, cx, cz, r, far: o2.far || 420, shadowR: o2.cast ? (o2.shadowR || 150) : 0, cast: !!o2.cast });
      }
    }
    /* campioni lungo una curva: posizione laterale `offset`, tangente, normale, indice */
    function samples(curve, step, offset, out, u0 = 0, u1 = 1, y = 0) {
      const n = Math.max(2, Math.floor(curve.getLength() * (u1 - u0) / step));
      for (let i = 0; i < n; i++) {
        const f = frameAt(curve, u0 + (u1 - u0) * (i + 0.5) / n);
        out.push({ x: f.p.x + f.sx * offset, y, z: f.p.z + f.sz * offset, t: f.t.clone(), s: V(f.sx, 0, f.sz), sg: Math.sign(offset), i });
      }
    }
    function outerSign(curve, u) {       // lato esterno della curva (±1) o 0 se rettilineo
      const t0 = curve.getTangentAt(clamp(u - 0.025)), t1 = curve.getTangentAt(clamp(u + 0.025));
      const cy = t0.z * t1.x - t0.x * t1.z;
      return Math.abs(cy) < 0.04 ? 0 : (cy > 0 ? 1 : -1);
    }

    /* ===== materiali pista ===== */
    const asphalt = STD({ map: asph.map, normalMap: asph.normalMap, roughnessMap: asph.roughnessMap, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(0.8, 0.8), envMapIntensity: 0.2 });
    const rubber = STD({ map: rubberTex, transparent: true, depthWrite: false, roughness: 0.42, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, envMapIntensity: 0.8 });
    const vergeMat = LIT({ map: grass.map, normalMap: grass.normalMap, roughness: 1, color: 0xb8b090, envMapIntensity: 0.25 });
    const railMat = STD({ color: 0x9a9fa6, metalness: 0.85, roughness: 0.38, side: THREE.DoubleSide, envMapIntensity: 1.1 });
    const postMat = LIT({ color: 0x3a3c3e, metalness: 0.5, roughness: 0.6 });
    const poleMat = LIT({ color: 0x34363a, metalness: 0.6, roughness: 0.5, envMapIntensity: 0.8 });
    const lampMat = BAS({ color: new THREE.Color(3.2, 2.3, 1.4) });
    const dashMat = LIT({ color: 0xe9e6dd, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const tireDark = LIT({ color: 0x131313, roughness: 0.92, normalMap: T.tread(), normalScale: new THREE.Vector2(1, 1) });
    const tireWhite = LIT({ color: 0xcfcdc6, roughness: 0.8 });
    const gravelMat = LIT({ map: gravel.map, normalMap: gravel.normalMap, roughness: 1, normalScale: new THREE.Vector2(1.6, 1.6) });
    const adTex = T.canvas(1024, 128, (g, w, h) => {
      g.fillStyle = '#0b0a09'; g.fillRect(0, 0, w, h); g.fillStyle = '#f5b335'; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6);
      g.textBaseline = 'middle'; g.textAlign = 'left';
      let x = 28;
      for (const [t, c, f] of [['MOTORSPORT ROOM', '#f6f2ea', '400 54px Georgia, serif'], ['◆', '#f5b335', '400 34px Georgia, serif'], ['PEZZOLLA', '#f6f2ea', '700 44px Helvetica, Arial, sans-serif'], ['◆', '#f5b335', '400 34px Georgia, serif']]) {
        g.font = f; g.fillStyle = c; if ('letterSpacing' in g) g.letterSpacing = t === '◆' ? '0px' : '4px';
        g.fillText(t, x, h / 2 + 3); x += g.measureText(t).width + 34;
      }
    }, { srgb: true, repeat: true });
    adTex.repeat.set(1, 1);
    const adMat = patch(new THREE.MeshBasicMaterial({ map: adTex, color: new THREE.Color(1.35, 1.3, 1.25), side: THREE.DoubleSide }));
    const white = new THREE.Color(0xf1efe8), warm = new THREE.Color(ACCENT);
    const laneMats = { C: [], R: [] }, lampGlow = [], lampPool = [], allPts = [];

    /* profilo W-beam: (distanza verso la strada, quota) */
    const WBEAM = [[0.0, 0.32], [-0.045, 0.35], [-0.045, 0.43], [0.0, 0.47], [0.0, 0.55], [-0.045, 0.59], [-0.045, 0.67], [0.0, 0.71]];
    const lampGeo = new THREE.CylinderGeometry(0.1, 0.17, 8.4, 8); lampGeo.translate(0, 4.2, 0);
    const armGeo = new THREE.BoxGeometry(0.12, 0.12, 2.2); armGeo.translate(0, 8.35, 1.0);
    const headGeo = new THREE.BoxGeometry(0.75, 0.14, 1.3); headGeo.translate(0, 8.25, 2.0);
    const postGeo = new THREE.BoxGeometry(0.1, 0.95, 0.12); postGeo.translate(0, 0.47, 0);
    const curbGeo = new THREE.BoxGeometry(1.25, 0.09, 2.3); curbGeo.translate(0, 0.045, 0);
    const dashGeo = new THREE.BoxGeometry(0.3, 0.02, 3.4); dashGeo.translate(0, 0.01, 0);
    const poolGeo = new THREE.PlaneGeometry(1, 1); poolGeo.rotateX(-Math.PI / 2);
    const tireGeo = new THREE.CylinderGeometry(0.52, 0.52, 0.55, 14);
    const gravelGeo = new THREE.BoxGeometry(3.4, 0.05, 3.4); gravelGeo.translate(0, 0.025, 0);
    const poolMat = new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(1.5, 0.82, 0.38), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });

    /* dove finisce il lato interno di una corsia: oltre quel punto le due corsie sono troppo vicine (guardrail, pali e cordoli
       del lato rivolto verso l'altra attraverserebbero la sua carreggiata, e l'auto "passerebbe" attraverso il guardrail) */
    function innerCut(curve, other) {
      const pts = []; for (let i = 0; i <= 160; i++) { const q = other.getPointAt(i / 160); pts.push(q.x, q.z); }
      const dist = (p) => { let m = 1e9; for (let i = 0; i < pts.length; i += 2) { const d = Math.hypot(p.x - pts[i], p.z - pts[i + 1]); if (d < m) m = d; } return m; };
      const f = frameAt(curve, 0.5), q = other.getPointAt(0.5);
      const sg = ((q.x - f.p.x) * f.sx + (q.z - f.p.z) * f.sz) > 0 ? 1 : -1;           // lato verso l'altra corsia
      let u = 1; for (let i = 30; i <= 200; i++) { if (dist(curve.getPointAt(i / 200)) < 34) { u = (i - 3) / 200; break; } }   // 34 m = guardrail (14) + carreggiata opposta (8) + margine
      return { sg, u };
    }

    function buildTrack(curve, key, railFrom, yOff, cut) {
      const len = curve.getLength(), n = Math.max(40, Math.floor(len / (lo ? 4 : 2.5))), y0 = yOff || 0;
      const uTo = (sg) => (cut && sg === cut.sg) ? cut.u : 1;                          // fine del lato (interno: si ferma prima)
      const vm = strip(curve, n, -(W / 2 + 9.5), 19, -0.03 + y0, vergeMat, 10, 10);
      strip(curve, n, (W / 2 + 9.5), 19, -0.03 + y0, vergeMat, 10, 10);
      const road = strip(curve, n, 0, W, y0, asphalt, 6, 6); road.renderOrder = 0;
      const rub = strip(curve, n, 0, W, 0.012 + y0, rubber, 26, 0); rub.renderOrder = 1; rub.receiveShadow = true;
      const edgeMat = LIT({ color: 0xf2f0ea, roughness: 0.62, transparent: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
      strip(curve, n, -(W / 2 - 0.4), 0.3, 0.018 + y0, edgeMat);
      strip(curve, n, (W / 2 - 0.4), 0.3, 0.018 + y0, edgeMat);
      if (key) laneMats[key].push(edgeMat);

      const dashes = []; samples(curve, 9, 0, dashes, 0, 1, y0); instanced(dashGeo, dashMat, dashes, { receive: true, far: 300 });

      /* lampioni: palo, braccio, testa luminosa, alone e macchia di luce a terra */
      const poles = [], ps2 = lo ? 66 : 44; for (const sg of [-1, 1]) samples(curve, ps2, sg * (W / 2 + 8), poles, (cut && sg === cut.sg) ? Math.max(0.14, railFrom || 0) : 0, uTo(sg));   // lato interno: parte dopo il bivio, come i guardrail
      const lamps = [];
      poles.forEach(p => {
        // il braccio guarda la strada: orientamento lungo la normale verso il centro
        const face = p.sg > 0 ? V(-p.s.x, 0, -p.s.z) : V(p.s.x, 0, p.s.z);
        lamps.push({ x: p.x, y: 0, z: p.z, t: face });
        const hx = p.x + face.x * 2.0, hz = p.z + face.z * 2.0;
        lampGlow.push(hx, 8.1, hz);
        lampPool.push({ x: hx, y: 0.04, z: hz, sx: 16, sz: 16, ry: 0 });
      });
      instanced(lampGeo, poleMat, lamps, { cast: true, receive: false, far: 520, shadowR: 140 });
      instanced(armGeo, poleMat, lamps, { cast: true, far: 520, shadowR: 140 });
      instanced(headGeo, lampMat, lamps, { far: 520 });

      /* guardrail a W con paletti */
      const u0 = railFrom || 0, rn = Math.max(30, Math.floor(len * (1 - u0) / (lo ? 4 : 2)));
      for (const sg of [-1, 1]) { const u1 = uTo(sg); sweep(curve, Math.max(12, Math.floor(rn * (u1 - u0) / (1 - u0))), sg, W / 2 + 6, WBEAM, railMat, u0, u1, 6); }
      for (const sg of [-1, 1]) { const u1 = uTo(sg); const ad = sweep(curve, Math.max(12, Math.floor(len * (u1 - u0) / (lo ? 6 : 3))), sg, W / 2 + 6.45, [[0, 0.9, 0], [0, 1.7, 1]], adMat, u0, u1, 11, sg > 0); ad.castShadow = false; }   // pannelli pubblicitari dietro i guardrail (testo leggibile da chi guida: u invertito a destra)
      const posts = [], pst = lo ? 6 : 4; for (const sg of [-1, 1]) samples(curve, pst, sg * (W / 2 + 6), posts, u0, uTo(sg));
      instanced(postGeo, postMat, posts.map(p => ({ ...p, t: p.s })), { cast: true, far: 380, shadowR: 110 });

      {   // cordoli
        const cm = LIT({ color: 0xffffff, roughness: 0.55, transparent: !!key, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        const cb = [], cst = lo ? 3.4 : 2.4; for (const sg of [-1, 1]) samples(curve, cst, sg * (W / 2 + 0.75), cb, 0, uTo(sg), y0);
        cb.forEach(o2 => { o2.c = o2.i % 2 ? white : warm; });
        instanced(curbGeo, cm, cb, { receive: true, far: 380 });
        if (key) laneMats[key].push(cm);
      }

      /* muri di gomme + ghiaia all'esterno delle curve */
      const tires = [], gr = [], tn = Math.floor(len / (lo ? 5 : 3.4));
      for (let i = 0; i < tn; i++) {
        const u = (i + 0.5) / tn, sg = outerSign(curve, u);
        if (!sg || u < (railFrom || 0) || u > uTo(sg)) continue;
        const f = frameAt(curve, u);
        const tx = f.p.x + f.sx * sg * (W / 2 + 4.6), tz = f.p.z + f.sz * sg * (W / 2 + 4.6);
        tires.push({ x: tx, y: 0.28, z: tz, ry: R01() * 6 }, { x: tx, y: 0.84, z: tz, ry: R01() * 6 }, { x: tx, y: 1.4, z: tz, ry: R01() * 6 });
        gr.push({ x: f.p.x + f.sx * sg * (W / 2 + 2.6), y: 0, z: f.p.z + f.sz * sg * (W / 2 + 2.6), t: f.t.clone() });
      }
      if (tires.length) {
        instanced(tireGeo, tireDark, tires.filter((_, i) => i % 3 !== 2), { cast: true, receive: true, far: 360, shadowR: 110 });
        instanced(tireGeo, tireWhite, tires.filter((_, i) => i % 3 === 2), { cast: true, receive: true, far: 360, shadowR: 110 });
        instanced(gravelGeo, gravelMat, gr, { receive: true, far: 320 });
      }
      for (let i = 0; i < 48; i++) { const f = frameAt(curve, i / 47); allPts.push(f.p.x, f.p.z); }
    }
    const cutC = innerCut(C, R), cutR = innerCut(R, C);
    const cuts = { C: cutC, R: cutR };
    buildTrack(S, null, 0, 0); buildTrack(C, 'C', 0.1, 0, cutC); buildTrack(R, 'R', 0.1, 0.004, cutR); buildTrack(E, null, 0, 0); buildTrack(X, null, 0, 0);

    /* alone dei lampioni (un solo Points) e macchie di luce sull'asfalto */
    scene.add(new THREE.Points(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(lampGlow, 3)),
      new THREE.PointsMaterial({ map: glowTex, color: new THREE.Color(2.4, 1.5, 0.75), size: 15, sizeAttenuation: true, transparent: true,
        opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })));
    {
      const pm = poolMat, items = lampPool;
      const cells = new Map();
      items.forEach(it => { const k = Math.floor(it.x / CELL) + ',' + Math.floor(it.z / CELL); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(it); });
      for (const list of cells.values()) {
        const m = new THREE.InstancedMesh(poolGeo, pm, list.length); let cx = 0, cz = 0;
        list.forEach((it, k) => { dummy.position.set(it.x, 0.045, it.z); dummy.scale.set(it.sx, 1, it.sz); dummy.updateMatrix(); m.setMatrixAt(k, dummy.matrix); cx += it.x; cz += it.z; });
        m.frustumCulled = false; m.renderOrder = 2; scene.add(m);
        chunks.push({ m, cx: cx / list.length, cz: cz / list.length, r: 60, far: 380, shadowR: 0, cast: false });
      }
    }

    /* ===== terreno: pianeggiante vicino alla pista, colline lontane ===== */
    {
      const N = lo ? 100 : 220, SZ = 3600, TILE = 14;
      const g = new THREE.PlaneGeometry(SZ, SZ, N, N); g.rotateX(-Math.PI / 2); g.translate(0, 0, -560);
      const tp = [];
      [S, C, R, E, X].forEach(c => { const n = Math.ceil(c.getLength() / 10); for (let i = 0; i <= n; i++) { const p = c.getPointAt(i / n); tp.push(p.x, p.z); } });
      const pos = g.attributes.position, uv = new Float32Array(pos.count * 2), col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        let d2 = 1e12; for (let k = 0; k < tp.length; k += 2) { const dx = tp[k] - x, dz = tp[k + 1] - z, dd = dx * dx + dz * dz; if (dd < d2) d2 = dd; }
        const d = Math.sqrt(d2);
        const near = sstep(28, 95, d), mid = sstep(90, 280, d), far = sstep(420, 1250, d);
        const y = -0.16 + near * (T.fbm(x / 55, z / 55, 5, 3) - 0.5) * 7 + mid * (T.fbm(x / 240, z / 240, 7, 4) - 0.42) * 74 + far * (T.fbm(x / 800, z / 800, 9, 3) - 0.3) * 230;
        pos.setY(i, y);
        uv[i * 2] = x / TILE; uv[i * 2 + 1] = z / TILE;
        const m = T.fbm(x / 110, z / 110, 13, 3), k2 = 0.62 + m * 0.7;
        col[i * 3] = k2 * (0.74 + 0.2 * m); col[i * 3 + 1] = k2 * 0.92; col[i * 3 + 2] = k2 * 0.5;
      }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
      const ter = new THREE.Mesh(g, LIT({ map: grass.map, normalMap: grass.normalMap, vertexColors: true, roughness: 1, normalScale: new THREE.Vector2(1.3, 1.3), envMapIntensity: 0.1 }));
      ter.receiveShadow = true; scene.add(ter);
    }

    /* ===== vegetazione: cipressi, pini marittimi e macchia, a gruppi; viale di cipressi sul rettilineo ===== */
    const leafCol = (a, b) => new THREE.Color().setRGB(a, b, a * 0.35);
    function blob(rx, ry, rz, detail, y, seed, colFn, rough) {        // ellissoide con rumore sui vertici
      const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, c = new Float32Array(p.count * 3), nr = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), yy = p.getY(i), z = p.getZ(i), nz = 1 + (T.vnoise(x * 2.1 + seed, yy * 2.1 + z * 1.7, seed, 0) - 0.5) * (rough || 0.5);
        p.setXYZ(i, x * rx * nz, yy * ry * nz + y, z * rz * nz);
        const k = clamp((yy + 1) / 2), cc = colFn(k, nz); c[i * 3] = cc[0]; c[i * 3 + 1] = cc[1]; c[i * 3 + 2] = cc[2];
        const nl = Math.hypot(x / rx, yy / ry, z / rz) || 1; nr.set([x / rx / nl, yy / ry / nl, z / rz / nl], i * 3);   // normali lisce dell'ellissoide
      }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nr, 3)); return g;
    }
    const merge = (geos) => {
      let np = 0, ni = 0; geos.forEach(g => { np += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; });
      const pos = new Float32Array(np * 3), nor = new Float32Array(np * 3), col = new Float32Array(np * 3), idx = new Uint32Array(ni); let po = 0, io = 0;
      geos.forEach(g => {
        const p = g.attributes.position, n = g.attributes.normal, c = g.attributes.color;
        for (let i = 0; i < p.count; i++) { pos.set([p.getX(i), p.getY(i), p.getZ(i)], (po + i) * 3); nor.set([n.getX(i), n.getY(i), n.getZ(i)], (po + i) * 3); col.set(c ? [c.getX(i), c.getY(i), c.getZ(i)] : [1, 1, 1], (po + i) * 3); }
        if (g.index) for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + po; else for (let i = 0; i < p.count; i++) idx[io + i] = po + i;
        po += p.count; io += g.index ? g.index.count : p.count;
      });
      const m = new THREE.BufferGeometry();
      m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); m.setAttribute('color', new THREE.BufferAttribute(col, 3)); m.setIndex(new THREE.BufferAttribute(idx, 1)); return m;
    };
    const trunk = (h, r, y) => { const g = new THREE.CylinderGeometry(r * 0.7, r, h, 6); g.translate(0, y + h / 2, 0); const c = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < c.length; i += 3) { c[i] = 0.16; c[i + 1] = 0.1; c[i + 2] = 0.06; } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; };
    const cypress = merge([blob(0.9, 5.4, 0.9, 2, 5.4, 3, (k, nz) => [0.03 + 0.05 * k * nz, 0.07 + 0.09 * k * nz, 0.03 + 0.03 * k], 0.55), trunk(0.8, 0.12, 0)]);
    const pine = merge([blob(5.2, 1.7, 5.2, 2, 11.4, 5, (k, nz) => [0.05 + 0.06 * k * nz, 0.09 + 0.1 * k * nz, 0.04 + 0.03 * k], 0.7), trunk(10.5, 0.34, 0), blob(3.2, 1.2, 3.2, 1, 12.6, 9, (k, nz) => [0.07 + 0.05 * k, 0.11 + 0.09 * k, 0.04], 0.6)]);
    const bush = merge([blob(2.4, 1.7, 2.4, 2, 1.5, 7, (k, nz) => [0.07 + 0.08 * k * nz, 0.1 + 0.1 * k * nz, 0.04 + 0.03 * k], 0.8)]);
    const treeMat = LIT({ vertexColors: true, roughness: 0.95, metalness: 0, envMapIntensity: 0.5 });
    {
      const buckets = { cy: [], pi: [], bu: [] }, tooClose = (x, z, r) => { for (let k = 0; k < allPts.length; k += 2) { const dx = allPts[k] - x, dz = allPts[k + 1] - z; if (dx * dx + dz * dz < r * r) return true; } return false; };
      [S, C, R, E, X].forEach(c => {
        const n = Math.floor(c.getLength() / (mobile ? 9 : 4.5));
        for (let i = 0; i < n; i++) for (const sg of [-1, 1]) {
          const f = frameAt(c, (i + R01()) / n), off = W / 2 + rnd(24, 150);
          const x = f.p.x + f.sx * sg * off, z = f.p.z + f.sz * sg * off;
          const grove = T.fbm(x / 70, z / 70, 17, 3);
          if (grove < 0.46 + (off - 24) / 500 || tooClose(x, z, W / 2 + 22)) continue;
          const r = R01(), s = rnd(0.75, 1.35);
          if (r < 0.34) buckets.cy.push({ x, z, ry: R01() * 6, sx: s * 0.9, sy: s * rnd(0.9, 1.5) });
          else if (r < 0.7) buckets.pi.push({ x, z, ry: R01() * 6, sx: s, sy: s * rnd(0.85, 1.2) });
          else buckets.bu.push({ x, z, ry: R01() * 6, sx: s, sy: s * rnd(0.7, 1.2) });
        }
      });
      for (const sg of [-1, 1]) {      // viale di cipressi lungo il rettilineo (a debita distanza, fuori dalla tribuna)
        const n = 20;
        for (let i = 0; i < n; i++) {
          const f = frameAt(S, 0.06 + 0.9 * i / n), x = f.p.x + f.sx * sg * 70, z = f.p.z + f.sz * sg * 70;
          if (sg > 0 && z < -40 && z > -150) continue;             // dietro la tribuna
          buckets.cy.push({ x, z, ry: R01() * 6, sx: 1.15, sy: rnd(1.5, 1.8) });
        }
      }
      const opt = { cast: true, receive: true, far: mobile ? 420 : 640, shadowR: 140 };
      instanced(cypress, treeMat, buckets.cy, opt); instanced(pine, treeMat, buckets.pi, opt); instanced(bush, treeMat, buckets.bu, { ...opt, far: 360 });
      /* uliveti: file regolari di ulivi (grigio-verdi, bassi) a macchie, come nelle campagne pugliesi */
      const olive = merge([blob(2.1, 1.35, 2.1, 1, 1.6, 11, (k, nz) => [0.09 + 0.07 * k * nz, 0.115 + 0.09 * k * nz, 0.07 + 0.04 * k], 0.75), trunk(1.2, 0.2, 0)]);
      const ol = [], clear = (x, z) => x > -62 && x < 70 && z < -20 && z > -250;      // tribuna, box e auto ferme
      const gst = lo ? 15 : 9;
      for (let gx = -340; gx <= 340; gx += gst) for (let gz = 50; gz >= -1300; gz -= gst) {
        const x = gx + rnd(-1.4, 1.4), z = gz + rnd(-1.4, 1.4);
        if (T.fbm(x / 170 + 3, z / 170 + 7, 29, 3) < 0.57 || clear(x, z) || tooClose(x, z, W / 2 + 30)) continue;
        ol.push({ x, z, ry: R01() * 6, sx: rnd(0.85, 1.25), sy: rnd(0.85, 1.2) });
      }
      instanced(olive, treeMat, ol, { cast: true, receive: true, far: mobile ? 220 : 330, shadowR: 90 });
    }

    /* ciuffi d'erba lungo i bordi (croci di piani con alpha test) */
    if (!mobile) {
      const tex = T.canvas(128, 128, (g, w, h) => {
        for (let i = 0; i < 40; i++) {
          const x = rnd(8, w - 8), hh = rnd(h * 0.45, h * 0.98), lean = rnd(-18, 18), lum = rnd(0.55, 1.0);
          g.strokeStyle = `rgb(${(120 * lum) | 0},${(130 * lum) | 0},${(60 * lum) | 0})`; g.lineWidth = rnd(1.4, 2.8); g.lineCap = 'round';
          g.beginPath(); g.moveTo(x, h); g.quadraticCurveTo(x + lean * 0.3, h - hh * 0.55, x + lean, h - hh); g.stroke();
        }
      }, { srgb: true });
      const g1 = new THREE.PlaneGeometry(1.1, 0.8); g1.translate(0, 0.4, 0);
      const g2 = g1.clone(); g2.rotateY(Math.PI / 2);
      const upN = (g) => { const n = new Float32Array(g.attributes.position.count * 3); for (let i = 1; i < n.length; i += 3) n[i] = 1; g.setAttribute('normal', new THREE.BufferAttribute(n, 3)); return g; };
      const tuftGeo = merge([upN(g1), upN(g2)]);
      const uvs = new Float32Array(tuftGeo.attributes.position.count * 2);
      for (let q = 0; q < 2; q++) for (let k = 0; k < 4; k++) uvs.set([k % 2, k < 2 ? 1 : 0], (q * 4 + k) * 2);
      tuftGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      const tuftMat = LIT({ map: tex, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 1, vertexColors: true, envMapIntensity: 0.6, emissive: 0x2a2410, emissiveMap: tex });
      const items = [];
      const roadPts = []; [S, C, R, E, X].forEach(c => { const n = Math.ceil(c.getLength() / 4); for (let i = 0; i <= n; i++) { const q = c.getPointAt(i / n); roadPts.push(q.x, q.z); } });
      const onRoad = (x, z) => { for (let k = 0; k < roadPts.length; k += 2) { const dx = roadPts[k] - x, dz = roadPts[k + 1] - z; if (dx * dx + dz * dz < 110) return true; } return false; };   // < 10,5 m da un asse: dentro (o sul bordo di) una carreggiata
      [S, C, R, E, X].forEach(c => {
        const n = Math.floor(c.getLength() * 0.4);
        for (let i = 0; i < n; i++) for (const sg of [-1, 1]) {
          const f = frameAt(c, (i + R01()) / n), off = W / 2 + rnd(2.6, 14);
          if (off < W / 2 + 6.4 && off > W / 2 + 5.4) continue;      // lascia libero il filo dei guardrail
          const tx = f.p.x + f.sx * sg * off, tz = f.p.z + f.sz * sg * off;
          if (onRoad(tx, tz)) continue;
          items.push({ x: tx, z: tz, ry: R01() * 3, sx: rnd(0.8, 1.6), sy: rnd(0.7, 1.4) });
        }
      });
      instanced(tuftGeo, tuftMat, items, { receive: true, far: 150 });
    }

    /* ===== luci di scena: torri faro con aloni ===== */
    const towers = [[26, -70], [-30, -150], [30, -235], [-34, -262], [34, -262], [-70, -420], [-52, -640], [90, -480], [82, -690], [-30, -930], [30, -930]];
    {
      const mastGeo = new THREE.CylinderGeometry(0.28, 0.55, 24, 8); mastGeo.translate(0, 12, 0);
      const panelGeo = new THREE.BoxGeometry(7, 3, 0.5); panelGeo.translate(0, 25.2, 0);
      const lampsTex = T.canvas(256, 96, (g, w, h) => { g.fillStyle = '#10100f'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) { g.beginPath(); g.arc(18 + c * 31, 18 + r * 30, 11, 0, 7); g.fill(); } }, { srgb: true });
      const panelMat = patch(new THREE.MeshBasicMaterial({ map: lampsTex, color: new THREE.Color(3, 2.5, 1.9) }));
      const mastMat = LIT({ color: 0x3b3d40, metalness: 0.7, roughness: 0.5 });
      const mastItems = towers.map(([x, z]) => ({ x, z }));
      instanced(mastGeo, mastMat, mastItems, { cast: true, far: 900, shadowR: 160 });
      towers.forEach(([x, z]) => {
        const p = new THREE.Mesh(panelGeo, panelMat); p.position.set(x, 0, z); p.rotation.y = Math.atan2(-x, 200 + 0); scene.add(p);
        const gs = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(1.8, 1.2, 0.7), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0.7 }));
        gs.position.set(x, 25.2, z + 0.5); gs.scale.set(30, 30, 1); scene.add(gs);
      });
    }

    /* ===== rettilineo di partenza: tribuna con pubblico, box con vetture ferme, scritta sull'asfalto ===== */
    const painted = {};
    {   // scritta "MOTORSPORT ROOM" a terra, consumata dalle gomme
      const tex = T.canvas(2048, 400, (g, w, h) => {
        g.fillStyle = '#fff'; g.font = '400 220px Georgia, "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        if ('letterSpacing' in g) g.letterSpacing = '14px';
        g.fillText('MOTORSPORT ROOM', w / 2, h / 2 + 8);
        // consumo della vernice: maschera di rumore a 1/8 della risoluzione, scalata sopra la scritta (molto più leggero di un ciclo per pixel)
        const mw = w >> 3, mh = h >> 3, mk = document.createElement('canvas'); mk.width = mw; mk.height = mh;
        const mg = mk.getContext('2d'), mi = mg.createImageData(mw, mh);
        for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) { const i = (y * mw + x) * 4; mi.data[i] = mi.data[i + 1] = mi.data[i + 2] = 255; mi.data[i + 3] = (0.5 + 0.5 * T.fbm(x / 3.5, y / 3.5, 3, 3)) * 255; }
        mg.putImageData(mi, 0, 0);
        g.globalCompositeOperation = 'destination-in'; g.imageSmoothingEnabled = true; g.drawImage(mk, 0, 0, w, h); g.globalCompositeOperation = 'source-over';
      }, { srgb: true });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(15.5, 3.0), LIT({ map: tex, transparent: true, depthWrite: false, roughness: 0.6, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
      const f = frameAt(S, 0.205);
      m.rotation.x = -Math.PI / 2; m.position.set(f.p.x, 0.03, f.p.z); m.renderOrder = 3; m.receiveShadow = true;
      m.rotateOnWorldAxis(V(0, 1, 0), -Math.atan2(f.t.x, -f.t.z));
      scene.add(m);
    }
    {   // tribuna
      const stand = new THREE.Group(), L = 96, rows = 14, step = 0.46, depth = 0.95;
      const conc = LIT({ color: 0x4a4944, roughness: 0.92, envMapIntensity: 0.4 });
      for (let r = 0; r < rows; r++) {
        const h = (r + 1) * step, b = new THREE.Mesh(new THREE.BoxGeometry(L, h, depth), conc);
        b.position.set(0, h / 2, -r * depth); b.castShadow = true; b.receiveShadow = true; stand.add(b);
      }
      const roofMat = LIT({ color: 0x1d1d1c, metalness: 0.6, roughness: 0.55 });
      const roof = new THREE.Mesh(new THREE.BoxGeometry(L + 3, 0.35, rows * depth + 3), roofMat);
      roof.position.set(0, 9.2, -(rows - 1) * depth / 2 + 0.6); roof.rotation.x = 0.05; roof.castShadow = true; stand.add(roof);
      for (let i = 0; i <= 8; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, 9, 0.3), roofMat); p.position.set(-L / 2 + i * L / 8, 4.5, -rows * depth + 0.2); p.castShadow = true; stand.add(p); }
      const strip2 = new THREE.Mesh(new THREE.BoxGeometry(L - 2, 0.12, 0.25), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 2.6, 1.7) }));
      strip2.position.set(0, 8.9, -3); stand.add(strip2);
      // pubblico
      const bodyGeo = new THREE.BoxGeometry(0.42, 0.55, 0.3), headGeo2 = new THREE.IcosahedronGeometry(0.15, 0);
      const people = [], palette = [0xe8704a, 0xf5b335, 0xf2f1ee, 0x2b3a55, 0x9a2a22, 0x1a1a1a, 0x7aa0d8, 0xcfa070].map(c => new THREE.Color(c));
      for (let r = 0; r < rows; r++) for (let x = -L / 2 + 0.6; x < L / 2 - 0.4; x += 0.62) if (R01() < (lo ? 0.4 : 0.72)) people.push({ x: x + rnd(-0.08, 0.08), y: (r + 1) * step + 0.28, z: -r * depth + 0.05, c: palette[(R01() * palette.length) | 0], h: r });
      const pm = LIT({ roughness: 0.85, envMapIntensity: 0.3 }), hm = LIT({ color: 0xc89c80, roughness: 0.8, envMapIntensity: 0.3 });
      const pb = new THREE.InstancedMesh(bodyGeo, pm, people.length), ph = new THREE.InstancedMesh(headGeo2, hm, people.length);
      people.forEach((q, k) => {
        dummy.position.set(q.x, q.y, q.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); pb.setMatrixAt(k, dummy.matrix); pb.setColorAt(k, q.c);
        dummy.position.set(q.x, q.y + 0.43, q.z); dummy.updateMatrix(); ph.setMatrixAt(k, dummy.matrix);
      });
      pb.frustumCulled = ph.frustumCulled = false; pb.castShadow = true; stand.add(pb, ph);
      stand.rotation.y = -Math.PI / 2; stand.position.set(33, 0, -95);
      stand.traverse(m => { if (m.isMesh) m.receiveShadow = true; });
      scene.add(stand);
    }
    {   // edificio dei box: facciata con portoni illuminati, finestre, fascia ambra, striscione
      const bay = (i) => 40 + i * 184;
      const alb = T.canvas(2048, 256, (g, w, h) => {
        g.fillStyle = '#19181a'; g.fillRect(0, 0, w, h);
        for (let y = 0; y < h; y += 3) { g.fillStyle = `rgba(255,255,255,${0.012 + 0.02 * T.hash(0, y, 3)})`; g.fillRect(0, y, w, 1); }
        g.fillStyle = '#0c0c0d'; for (let i = 0; i < 11; i++) g.fillRect(bay(i), 118, 150, 126);
        g.fillStyle = '#2a2a2b'; for (let i = 0; i < 11; i++) g.fillRect(bay(i) - 4, 106, 158, 12);
        g.fillStyle = '#f5b335'; g.fillRect(0, 92, w, 6);
      }, { srgb: true });
      const emi = T.canvas(2048, 256, (g, w, h) => {
        g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 11; i++) {
          const gr = g.createLinearGradient(0, 118, 0, 244); gr.addColorStop(0, '#ffc47a'); gr.addColorStop(0.55, '#c8782a'); gr.addColorStop(1, '#4a2a10');
          g.fillStyle = gr; g.fillRect(bay(i) + 6, 124, 138, 114);
          g.fillStyle = '#fff3d6'; g.fillRect(bay(i) + 6, 124, 138, 4);
        }
        for (let i = 0; i < 22; i++) { g.fillStyle = R01() < 0.82 ? '#ffd9a0' : '#4a3a24'; g.fillRect(34 + i * 92, 26, 54, 44); }
        g.fillStyle = '#f5b335'; g.fillRect(0, 92, w, 6);
      }, { srgb: true });
      const fac = new THREE.Mesh(new THREE.PlaneGeometry(68, 8.5), LIT({ map: alb, emissiveMap: emi, emissive: new THREE.Color(2.2, 2.1, 2), roughness: 0.8, envMapIntensity: 0.4 }));
      fac.rotation.y = Math.PI / 2; fac.position.set(-37.9, 4.4, -195); scene.add(fac);
      const bld = new THREE.Mesh(new THREE.BoxGeometry(16, 9, 68), LIT({ color: 0x131314, roughness: 0.9 }));
      bld.position.set(-46, 4.5, -195); bld.castShadow = true; bld.receiveShadow = true; scene.add(bld);
      const sign = T.canvas(1024, 160, (g, w, h) => {
        g.fillStyle = '#0a0a09'; g.fillRect(0, 0, w, h); g.strokeStyle = '#f5b335'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
        g.fillStyle = '#fff'; g.font = '400 84px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('MOTORSPORT ROOM', w / 2, h / 2 + 4);
      }, { srgb: true });
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(36, 5.6), patch(new THREE.MeshBasicMaterial({ map: sign, color: new THREE.Color(1.6, 1.6, 1.6) })));
      banner.rotation.y = Math.PI / 2; banner.position.set(-37.7, 12.6, -195); scene.add(banner);
      for (const z of [-213, -177]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 0.4), poleMat); post.position.set(-37.7, 10, z); post.castShadow = true; scene.add(post); }
    }

    /* ===== portali (partenza, bivio con indicazioni, traguardo) ===== */
    const gantryMat = LIT({ color: 0xd9d8d2, metalness: 0.7, roughness: 0.4 });
    const ledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.5, 0.8) });
    function signTex(text, sub, arrow) {
      return T.canvas(1024, 256, (g, w, h) => {
        g.fillStyle = '#08080a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#f5b335'; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
        g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = '400 118px Georgia, serif'; g.fillText(text, w / 2, sub ? h * 0.42 : h / 2);
        if (sub) { g.font = '600 36px Helvetica, Arial, sans-serif'; g.fillStyle = '#f5b335'; g.fillText(sub, w / 2, h * 0.8); }
      }, { srgb: true });
    }
    function gantry(curve, u, signs, startLights) {
      const g = new THREE.Group(), p = curve.getPointAt(u), t = curve.getTangentAt(u), h = 11.5, w = W + 8;
      for (const sx of [-1, 1]) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.9, h, 0.9), gantryMat); col.position.set(sx * w / 2, h / 2, 0); col.castShadow = true; g.add(col);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 1.8), gantryMat); foot.position.set(sx * w / 2, 0.2, 0); g.add(foot);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.9, 1.3, 1.2), gantryMat); beam.position.y = h; beam.castShadow = true; g.add(beam);
      const led = new THREE.Mesh(new THREE.BoxGeometry(w - 1, 0.16, 0.12), ledMat); led.position.set(0, h - 0.74, -0.6); g.add(led);
      (signs || []).forEach(([x, wd, text, sub]) => {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(wd, wd / 4), patch(new THREE.MeshBasicMaterial({ map: signTex(text, sub), color: new THREE.Color(1.9, 1.9, 1.9) })));
        s.position.set(-x, h + 0.9 + wd / 8, -0.62); s.rotation.y = Math.PI; g.add(s);   // asse x locale = -x mondo (lookAt)
      });
      if (startLights) for (let i = 0; i < 5; i++) { const l = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.25, 0.1) })); l.position.set(-3 + i * 1.5, h - 2.2, -0.65); l.rotation.y = Math.PI; g.add(l); }
      g.position.copy(p); g.lookAt(p.x + t.x, p.y, p.z + t.z); scene.add(g);
    }
    gantry(S, 0.02, [[0, 20, 'MOTORSPORT ROOM', 'PEZZOLLA · CLUB 2027']], true);
    gantry(S, 0.995, [[-8, 14, '← MR CLUB', 'EXPERIENCE · ACADEMY'], [8, 14, 'MR RACING →', 'COMPETERE']]);
    gantry(E, 0.35, [[0, 18, 'TRAGUARDO', 'THE CLUB PROMISE']]);

    /* linea d'arrivo a scacchi */
    {
      const tex = T.canvas(256, 32, (g) => { for (let x = 0; x < 32; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? '#f4f2ec' : '#0b0b0b'; g.fillRect(x * 8, y * 8, 8, 8); } }, { srgb: true });
      tex.magFilter = THREE.NearestFilter; tex.anisotropy = 8;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(W, 2.4), LIT({ map: tex, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
      const p = E.getPointAt(0.35); plane.rotation.x = -Math.PI / 2; plane.position.set(p.x, 0.035, p.z); plane.receiveShadow = true; scene.add(plane);
    }

    /* ===== cartelli: 7 tappe sul Club, 4 blocchi sul Racing ===== */
    const boards = { club: [], racing: [] };
    function board(text, curve, u, side, key) {
      const big = text.length <= 2;
      const tex = T.canvas(1024, 512, (g, w, h) => {
        g.fillStyle = '#0a0a0b'; g.fillRect(0, 0, w, h); g.strokeStyle = '#f5b335'; g.lineWidth = 10; g.strokeRect(14, 14, w - 28, h - 28);
        g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = big ? '400 330px Georgia, serif' : '400 150px Georgia, serif'; g.fillText(text, w / 2, big ? h * 0.46 : h / 2);
        if (big) { g.font = '700 54px Helvetica, Arial, sans-serif'; g.fillStyle = '#f5b335'; if ('letterSpacing' in g) g.letterSpacing = '10px'; g.fillText('TAPPA', w / 2, h * 0.86); }
      }, { srgb: true });
      const grp = new THREE.Group(), f = frameAt(curve, u), off = side * (W / 2 + 7);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(11, 5.5), patch(new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.8, 1.8, 1.8) })));
      face.position.set(0, 8, 0);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(11.5, 6, 0.4), poleMat); frame.position.set(0, 8, -0.25); frame.castShadow = true;
      grp.add(frame, face);
      for (const sx of [-4.2, 4.2]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 6, 0.3), poleMat); leg.position.set(sx, 3, -0.3); leg.castShadow = true; grp.add(leg); }
      grp.position.set(f.p.x + f.sx * off, 0, f.p.z + f.sz * off);
      grp.lookAt(grp.position.x - f.t.x - f.sx * side * 0.35, 0, grp.position.z - f.t.z - f.sz * side * 0.35);
      scene.add(grp); boards[key].push(grp);
    }
    for (let i = 0; i < 7; i++) board('0' + (i + 1), C, 0.58 + i * 0.058, i % 2 ? -1 : 1, 'club');
    ['SPORT', 'PARTNER', 'MEDIA', 'ESPERIENZE'].forEach((t, i) => board(t, R, 0.42 + i * 0.17, i % 2 ? 1 : -1, 'racing'));

    /* ===== pulviscolo dorato in controluce ===== */
    const N = mobile ? 160 : 420, dustPos = new Float32Array(N * 3), dust = [];
    for (let i = 0; i < N; i++) dust.push({ x: rnd(-30, 30), y: rnd(0.3, 12), z: rnd(-70, 6), vx: rnd(-0.15, 0.15), vy: rnd(-0.03, 0.12), vz: rnd(-0.1, 0.1) });
    const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dustPts = new THREE.Points(dustGeo, new THREE.PointsMaterial({ map: glowTex, color: new THREE.Color(2.2, 1.35, 0.7), size: 0.26, sizeAttenuation: true, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    dustPts.frustumCulled = false; scene.add(dustPts);

    /* ===== aggiornamento per fotogramma ===== */
    const starsObj = scene.getObjectByName('stars');
    const fwd = V(0, 0, -1), snapP = V(0, 0, 0), right = V(0, 0, 0), upL = V(0, 0, 0), tmp = V(0, 0, 0), up = V(0, 1, 0);
    const world = {
      S, C, R, E, W, cuts, boards, laneMats, envTex, mobile, sunSky, sunDir, sun, fogU, skyU, scene, patch, STD, BAS, glowTex, T, merge, frameAt, instanced,
      /* camera: ricollocare cielo, luci con ombra agganciata alla griglia, nuvole, pulviscolo e visibilità dei gruppi */
      update(dt, camera, time, targetPos, reduce) {
        sky.position.copy(camera.position); skyU.uTime.value = time;
        if (starsObj) starsObj.position.copy(camera.position);
        // sole: bersaglio davanti alla camera, griglia di snap in spazio-luce (niente sfarfallio)
        camera.getWorldDirection(fwd);
        snapP.copy(camera.position).addScaledVector(fwd, 22); snapP.y = 0;
        if (targetPos) snapP.lerp(targetPos, 0.5);
        right.crossVectors(up, sunDir).normalize(); upL.crossVectors(sunDir, right).normalize();
        const texel = (SH * 2) / sun.shadow.mapSize.x;
        const a = Math.round(snapP.dot(right) / texel) * texel, b = Math.round(snapP.dot(upL) / texel) * texel, c = snapP.dot(sunDir);
        sun.target.position.copy(right).multiplyScalar(a).addScaledVector(upL, b).addScaledVector(sunDir, c);
        sun.position.copy(sun.target.position).addScaledVector(sunDir, 230);
        fill.position.copy(camera.position).addScaledVector(fwd, -30).add(tmp.set(-10, 30, 0)); fill.target.position.copy(camera.position).addScaledVector(fwd, 12);
        // posizione del sole sullo schermo (per nebbia e raggi)
        tmp.copy(camera.position).addScaledVector(sunSky, 1000).project(camera);
        const inFront = fwd.dot(sunSky);
        fogU.uSunScr.value.set(tmp.x * 0.5 + 0.5, tmp.y * 0.5 + 0.5);
        fogU.uSunScrVis.value = sstep(0.05, 0.5, inFront) * (tmp.z < 1 ? 1 : 0);
        // gruppi istanziati: per distanza
        for (const k of chunks) {
          const d = Math.hypot(k.cx - camera.position.x, k.cz - camera.position.z) - k.r;
          k.m.visible = d < k.far;
          if (k.cast) k.m.castShadow = shadows && d < k.shadowR;
        }
        // pulviscolo: scorre e resta attorno alla camera
        if (!reduce) {
          const cp = camera.position;
          for (let i = 0; i < N; i++) {
            const d = dust[i]; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
            const rx = ((d.x - cp.x + 30) % 60 + 60) % 60 - 30, rz = ((d.z - cp.z + 40) % 80 + 80) % 80 - 40;
            d.x = cp.x + rx; d.z = cp.z + rz; if (d.y > 12) d.y = 0.3;
            dustPos[i * 3] = d.x; dustPos[i * 3 + 1] = d.y; dustPos[i * 3 + 2] = d.z;
          }
          dustGeo.attributes.position.needsUpdate = true;
        }
      },
    };
    return world;
  };
})();
