/* Post-produzione: scena in HDR (half float, MSAA) → bloom a piramide → raggi di luce dal sole →
   tone mapping ACES, vignettatura, aberrazione cromatica, sfocatura radiale di velocità, grana.
   three.min.js non include EffectComposer: la pipeline è scritta qui, ~150 righe. */
(() => {
  'use strict';
  const PZ = (window.PZ = window.PZ || {});

  const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const LUMA = 'const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);';

  /* 13 campioni (Jimenez, "Next Generation Post Processing in Call of Duty"). Il primo livello applica
     soglia morbida e media di Karis: i punti molto luminosi non producono scintille. */
  const DOWN = (first) => `
    uniform sampler2D tex; uniform vec2 texel; uniform float uThreshold, uKnee; varying vec2 vUv; ${LUMA}
    vec3 S(float x, float y){ return texture2D(tex, vUv + vec2(x, y) * texel).rgb; }
    float K(vec3 c){ return 1.0 / (1.0 + dot(c, LUMA)); }
    void main(){
      vec3 a = S(-2.,2.), b = S(0.,2.), c = S(2.,2.), d = S(-2.,0.), e = S(0.,0.), f = S(2.,0.), g = S(-2.,-2.), h = S(0.,-2.), i = S(2.,-2.);
      vec3 j = S(-1.,1.), k = S(1.,1.), l = S(-1.,-1.), m = S(1.,-1.);
      vec3 r;
      ${first ? `
      vec3 g0 = (a + b + d + e) * .25, g1 = (b + c + e + f) * .25, g2 = (d + e + g + h) * .25, g3 = (e + f + h + i) * .25, g4 = (j + k + l + m) * .25;
      r = g0 * K(g0) * .125 + g1 * K(g1) * .125 + g2 * K(g2) * .125 + g3 * K(g3) * .125 + g4 * K(g4) * .5;
      r /= (K(g0) * .125 + K(g1) * .125 + K(g2) * .125 + K(g3) * .125 + K(g4) * .5);
      float br = max(r.r, max(r.g, r.b));
      float soft = clamp(br - uThreshold + uKnee, 0., 2. * uKnee); soft = soft * soft / (4. * uKnee + 1e-4);
      r *= max(soft, br - uThreshold) / max(br, 1e-4);` : `
      r = (a + b + d + e) * .03125 + (b + c + e + f) * .03125 + (d + e + g + h) * .03125 + (e + f + h + i) * .03125 + (j + k + l + m) * .125;`}
      gl_FragColor = vec4(r, 1.0);
    }`;
  const UP = `
    uniform sampler2D tex; uniform vec2 texel; uniform float uMix; varying vec2 vUv;
    void main(){
      vec3 s = texture2D(tex, vUv + vec2(-1., 1.) * texel).rgb + texture2D(tex, vUv + vec2(1., 1.) * texel).rgb
             + texture2D(tex, vUv + vec2(-1., -1.) * texel).rgb + texture2D(tex, vUv + vec2(1., -1.) * texel).rgb;
      s += 2. * (texture2D(tex, vUv + vec2(0., 1.) * texel).rgb + texture2D(tex, vUv + vec2(0., -1.) * texel).rgb
               + texture2D(tex, vUv + vec2(-1., 0.) * texel).rgb + texture2D(tex, vUv + vec2(1., 0.) * texel).rgb);
      s += 4. * texture2D(tex, vUv).rgb;
      gl_FragColor = vec4(s / 16. * uMix, 1.0);
    }`;

  const COMPOSITE = (rays) => `
    uniform sampler2D tScene, tBloom, tGlow; uniform vec2 uSun, uRes; uniform float uBloom, uRaysK, uSunVis, uSpeed, uTime, uGrain, uVig, uAb, uExposure, uPulse;
    varying vec2 vUv; ${LUMA}
    float H(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    vec3 aces(vec3 x){ return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }
    void main(){
      vec2 c = vUv - .5; float d2 = dot(c, c);
      /* velocità: sfocatura radiale che cresce verso i bordi (il centro resta nitido) + aberrazione */
      vec3 col;
      if (uSpeed < .01) {                       // da fermi (o con aberrazione spenta) basta un campione: molto più leggero
        vec2 ab = c * (uAb * d2);
        col = uAb < 1e-5 ? texture2D(tScene, vUv).rgb : vec3(texture2D(tScene, vUv + ab).r, texture2D(tScene, vUv).g, texture2D(tScene, vUv - ab).b);
      } else {
        float m = smoothstep(.04, .34, d2) * uSpeed;
        col = vec3(0.);
        for (int i = 0; i < 6; i++) {
          float t = float(i) / 5.;
          vec2 uv = vUv - c * m * .09 * t;
          vec2 ab = c * (uAb * d2) * (1. + t);
          col += vec3(texture2D(tScene, uv + ab).r, texture2D(tScene, uv).g, texture2D(tScene, uv - ab).b);
        }
        col /= 6.;
      }
      col += texture2D(tBloom, vUv).rgb * uBloom;
      ${rays ? `
      /* raggi crepuscolari: sfocatura radiale del bloom verso il sole */
      vec2 dir = (uSun - vUv) / float(${rays}) * .85; vec2 p = vUv; vec3 ray = vec3(0.); float w = 1.;
      for (int i = 0; i < ${rays}; i++) { p += dir; ray += texture2D(tGlow, p).rgb * w; w *= .955; }
      col += ray / float(${rays}) * uRaysK * uSunVis * vec3(1., .72, .42);` : ''}
      col *= uExposure * (1. + uPulse);
      /* viraggio: ombre fredde, luci calde */
      float l = dot(col, LUMA);
      col *= mix(vec3(.90, .96, 1.10), vec3(1.10, 1.0, .88), smoothstep(.0, 1.4, l));
      col = aces(col);
      col = mix(vec3(dot(col, LUMA)), col, 1.1);
      col *= 1. - uVig * smoothstep(.18, .62, d2);
      col = mix(col * 12.92, 1.055 * pow(col, vec3(1. / 2.4)) - .055, step(.0031308, col));
      col += (H(vUv * uRes + uTime) - .5) * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }`;

  PZ.createPost = (renderer, o = {}) => {
    if (!renderer.capabilities.isWebGL2) return null;
    const ex = renderer.extensions;
    const hdr = ex.has('EXT_color_buffer_float') || ex.has('EXT_color_buffer_half_float');
    const type = hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
    const samples = o.samples === undefined ? 4 : o.samples, levels = o.levels || 5, rays = o.rays === undefined ? 24 : o.rays;
    renderer.autoClear = false;                      // ogni passaggio decide se pulire (la risalita del bloom è additiva)
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), geo = new THREE.PlaneGeometry(2, 2);
    const quad = new THREE.Mesh(geo); quad.frustumCulled = false;
    const qs = new THREE.Scene(); qs.add(quad);
    const rtOpt = { type, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false };
    const sm = (frag, uniforms, extra = {}) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false, ...extra });
    const u = (v) => ({ value: v });

    const down0 = sm(DOWN(true), { tex: u(null), texel: u(new THREE.Vector2()), uThreshold: u(o.threshold || 1.0), uKnee: u(0.5) });
    const down = sm(DOWN(false), { tex: u(null), texel: u(new THREE.Vector2()), uThreshold: u(0), uKnee: u(0) });
    const up = sm(UP, { tex: u(null), texel: u(new THREE.Vector2()), uMix: u(1) }, { blending: THREE.AdditiveBlending });
    const comp = sm(COMPOSITE(rays), {
      tScene: u(null), tBloom: u(null), tGlow: u(null), uSun: u(new THREE.Vector2(.5, .5)), uRes: u(new THREE.Vector2(1, 1)),
      uBloom: u(o.bloom || 0.6), uRaysK: u(o.raysK || 0.5), uSunVis: u(0), uSpeed: u(0), uTime: u(0), uGrain: u(o.grain || 0.028), uVig: u(o.vig || 0.5),
      uAb: u(o.ab === undefined ? 0.05 : o.ab), uExposure: u(1), uPulse: u(0) });

    let rtScene = null, mips = [];
    const dispose = () => { if (rtScene) rtScene.dispose(); mips.forEach(r => r.dispose()); mips = []; };
    const post = {
      hdr, samples, width: 1, height: 1, get target() { return rtScene; }, get mips() { return mips; }, comp,
      uniforms: comp.uniforms,
      setSize(w, h) {
        dispose();
        rtScene = samples > 0
          ? new THREE.WebGLMultisampleRenderTarget(w, h, { ...rtOpt, depthBuffer: true })
          : new THREE.WebGLRenderTarget(w, h, { ...rtOpt, depthBuffer: true });
        if (samples > 0) rtScene.samples = samples;
        for (let i = 1; i <= levels; i++) mips.push(new THREE.WebGLRenderTarget(Math.max(2, w >> i), Math.max(2, h >> i), rtOpt));
        comp.uniforms.uRes.value.set(w, h); this.width = w; this.height = h;
      },
      pass(mat, target, src, srcW, srcH, clear) {
        mat.uniforms.tex.value = src; mat.uniforms.texel.value.set(1 / srcW, 1 / srcH);
        quad.material = mat; renderer.setRenderTarget(target); if (clear) renderer.clear(); renderer.render(qs, cam);
      },
      render(scene, camera) {
        const w = rtScene.width, h = rtScene.height;
        renderer.setRenderTarget(rtScene); renderer.clear(); renderer.render(scene, camera);
        // bloom: discesa (con soglia sul primo livello)…
        this.pass(down0, mips[0], rtScene.texture, w, h, false);
        for (let i = 1; i < mips.length; i++) this.pass(down, mips[i], mips[i - 1].texture, mips[i - 1].width, mips[i - 1].height, false);
        // …e risalita additiva (mips[i-1] riceve la somma dei livelli sotto)
        for (let i = mips.length - 1; i > 0; i--) this.pass(up, mips[i - 1], mips[i].texture, mips[i].width, mips[i].height, false);
        // i raggi leggono il bloom a 1/4 di risoluzione: già morbido, basta per una sfocatura radiale
        comp.uniforms.tScene.value = rtScene.texture; comp.uniforms.tBloom.value = mips[0].texture; comp.uniforms.tGlow.value = mips[Math.min(1, mips.length - 1)].texture;
        quad.material = comp; renderer.setRenderTarget(null); renderer.render(qs, cam);
      },
      dispose,
    };
    return post;
  };
})();
