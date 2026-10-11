/* Motore V10 sintetizzato con Web Audio (nessun file audio).
   Non è un banco di oscillatori: ogni scoppio è un impulso con le risonanze dello scarico,
   nell'ordine di accensione di un V10 a 90° (intervalli 90°/54°, scoppio irregolare).
   Due cicli registrati in un buffer e letti in loop a velocità proporzionale ai giri.
   Il regime segue la velocità di scroll: accelerazione → cambiate, rilascio → scoppiettii,
   frenata brusca → stridio. Silenzioso durante l'hero (c'è l'audio del video). */
(() => {
  'use strict';
  const AC = window.AudioContext || window.webkitAudioContext;
  const IDLE = 900, REDLINE = 8400, GEARS = 6, REF_RPM = 3000;
  const E = { on: false, ctx: null, vol: 0.1, supported: !!AC, rpm: IDLE, gear: 0 };
  let g = null, noiseBuf = null, thr = 0.1, shiftT = 0, lastBrake = 0, prevThr = 0, an = null, anBuf = null;
  const rnd = (a, b) => a + Math.random() * (b - a);

  function makeNoise(ctx) {
    const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  /* 4 cicli (8 giri) a REF_RPM: 10 scoppi per ciclo, ordine V10 a 90°, ogni scoppio con
     ampiezza e tempo leggermente diversi (il "rotolare" del motore). */
  function makeCycles(ctx) {
    const sr = ctx.sampleRate, cyc = 2 * 60 / REF_RPM, cycles = 4;
    const n = Math.floor(sr * cyc * cycles), buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
    const ang = [0, 90, 144, 234, 288, 378, 432, 522, 576, 666];       // gradi su 720
    for (let c = 0; c < cycles; c++) for (let k = 0; k < 10; k++) {
      const t0 = ((c * 720 + ang[k] + rnd(-5, 5)) / 720) * cyc;
      const amp = rnd(0.75, 1.2) * (k % 2 ? 0.92 : 1);
      const f1 = rnd(150, 185), f2 = f1 * 2.05, f3 = f1 * 3.6;          // risonanze del collettore
      const len = Math.floor(sr * 0.016);
      for (let i = 0; i < len; i++) {
        const x = i / sr;
        const env = Math.exp(-x / 0.0036) * (1 - Math.exp(-x / 0.0004));
        const s = env * (Math.sin(6.2832 * f1 * x) + 0.6 * Math.sin(6.2832 * f2 * x + 0.8) + 0.3 * Math.sin(6.2832 * f3 * x + 1.7))
                + (Math.random() * 2 - 1) * Math.exp(-x / 0.0012) * 0.45;
        d[(Math.floor(t0 * sr) + i) % n] += s * amp;
      }
    }
    let mean = 0, peak = 0;
    for (let i = 0; i < n; i++) mean += d[i]; mean /= n;
    for (let i = 0; i < n; i++) { d[i] -= mean; peak = Math.max(peak, Math.abs(d[i])); }
    for (let i = 0; i < n; i++) d[i] /= peak * 1.1;
    return buf;
  }

  function softClip(k) {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
    return c;
  }

  function build() {
    const ctx = E.ctx = new AC();
    noiseBuf = makeNoise(ctx);
    const master = ctx.createGain(); master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -24; comp.ratio.value = 4; comp.attack.value = 0.01; comp.release.value = 0.2;
    an = ctx.createAnalyser(); an.fftSize = 1024; anBuf = new Float32Array(an.fftSize);
    master.connect(comp); comp.connect(an); an.connect(ctx.destination);

    /* due letture dello stesso motore, leggermente sfasate di velocità → battimenti naturali */
    const eng = ctx.createGain(); eng.gain.value = 0.5;
    const srcs = [makeCycles(ctx), makeCycles(ctx)].map((b, i) => {
      const s = ctx.createBufferSource(); s.buffer = b; s.loop = true;
      const gn = ctx.createGain(); gn.gain.value = 0.55;
      s.connect(gn); gn.connect(eng); s.start(0, rnd(0, 0.1));
      return { s, skew: i ? 1.004 : 1 };
    });

    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 38;
    const sat = ctx.createWaveShaper(); sat.curve = softClip(1.6);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7;
    /* risonanze fisse del sistema di scarico/abitacolo: danno "corpo" a ogni regime */
    const f1 = ctx.createBiquadFilter(); f1.type = 'peaking'; f1.frequency.value = 230; f1.gain.value = 5; f1.Q.value = 1.1;
    const f2 = ctx.createBiquadFilter(); f2.type = 'peaking'; f2.frequency.value = 760; f2.gain.value = 4; f2.Q.value = 1.4;
    const f3 = ctx.createBiquadFilter(); f3.type = 'peaking'; f3.frequency.value = 1900; f3.gain.value = 3; f3.Q.value = 1.6;
    eng.connect(hp); hp.connect(sat); sat.connect(lp); lp.connect(f1); f1.connect(f2); f2.connect(f3); f3.connect(master);

    /* eco del tubo di scarico (pettine corto) */
    const dl = ctx.createDelay(0.02); dl.delayTime.value = 0.0029;
    const fb = ctx.createGain(); fb.gain.value = 0.28;
    const wet = ctx.createGain(); wet.gain.value = 0.35;
    lp.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(f1);

    /* rombo di fondo (basamento) e soffio di aspirazione */
    const nz = ctx.createBufferSource(); nz.buffer = noiseBuf; nz.loop = true;
    const lowBp = ctx.createBiquadFilter(); lowBp.type = 'bandpass'; lowBp.frequency.value = 95; lowBp.Q.value = 0.9;
    const lowG = ctx.createGain(); lowG.gain.value = 0.2;
    nz.connect(lowBp); lowBp.connect(lowG); lowG.connect(master);
    const nz2 = ctx.createBufferSource(); nz2.buffer = noiseBuf; nz2.loop = true;
    const airBp = ctx.createBiquadFilter(); airBp.type = 'bandpass'; airBp.Q.value = 0.7;
    const airG = ctx.createGain(); airG.gain.value = 0;
    nz2.connect(airBp); airBp.connect(airG); airG.connect(master);
    nz.start(); nz2.start();

    g = { master, eng, lp, srcs, airBp, airG, lowG };
  }

  /* scoppio allo scarico */
  function pop(strength) {
    if (!E.ctx || !E.on) return;
    const ctx = E.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 450 + Math.random() * 700;
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(strength * 0.5, t + 0.005);
    gn.gain.exponentialRampToValueAtTime(0.001, t + 0.07 + Math.random() * 0.07);
    s.connect(f); f.connect(gn); gn.connect(g.master); s.start(t, Math.random() * 1.5, 0.25);
    const th = ctx.createOscillator(); th.type = 'sine';
    th.frequency.setValueAtTime(120, t); th.frequency.exponentialRampToValueAtTime(48, t + 0.1);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(strength * 0.35, t); tg.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    th.connect(tg); tg.connect(g.master); th.start(t); th.stop(t + 0.14);
  }

  /* stridio di gomme/freni */
  function squeal(level) {
    if (!E.ctx || !E.on) return;
    const ctx = E.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(1500 + Math.random() * 500, t);
    o.frequency.linearRampToValueAtTime(1000, t + 0.55);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 7;
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(0.05 * level, t + 0.06);
    gn.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.connect(bp); bp.connect(gn); gn.connect(g.master); o.start(t); o.stop(t + 0.65);
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(0.03 * level, t + 0.05);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    s.connect(hp); hp.connect(ng); ng.connect(g.master); s.start(t, 0.3, 0.6);
  }

  E.setOn = function (v) {
    if (!E.supported) return false;
    if (v) {
      if (!E.ctx) build();
      E.ctx.resume();
      E.on = true;
    } else {
      E.on = false;
      if (g) g.master.gain.setTargetAtTime(0, E.ctx.currentTime, 0.05);
    }
    return E.on;
  };

  /* livello RMS corrente (0..1), per verifiche */
  E.level = function () {
    if (!an) return 0;
    an.getFloatTimeDomainData(anBuf);
    let s = 0; for (let i = 0; i < anBuf.length; i++) s += anBuf[i] * anBuf[i];
    return Math.sqrt(s / anBuf.length);
  };

  /* s: { spd 0..1, accel (1/s), brake 0..1, hero 0..1 } */
  E.update = function (dt, s) {
    if (!E.on || !E.ctx) return;
    const t = E.ctx.currentTime, spd = s.spd, accel = s.accel;

    const x = Math.min(0.999, spd) * GEARS;
    let gr = Math.floor(x); const fr = x - gr;
    if (spd < 0.02) gr = 0;
    if (gr !== E.gear) {
      if (gr > E.gear) { shiftT = 0.16; E.rpm = Math.max(IDLE, E.rpm * 0.62); pop(0.45 * Math.max(thr, 0.3)); }
      else { E.rpm = Math.min(REDLINE, E.rpm * 1.25); pop(0.3); }       // scalata con doppietta
      E.gear = gr;
    }
    shiftT = Math.max(0, shiftT - dt);

    const target = spd < 0.02 ? IDLE
      : gr === 0 ? IDLE + (7600 - IDLE) * Math.pow(fr, 0.8)
      : 4300 + (REDLINE - 4300) * fr;
    E.rpm += (target - E.rpm) * (1 - Math.exp(-dt * (target > E.rpm ? 10 : 5)));

    const tt = shiftT > 0 ? 0.05 : accel > 0.15 ? 1 : spd > 0.04 ? 0.35 : 0.12;
    if (prevThr > 0.7 && tt < 0.4 && E.rpm > 3500) {            // rilascio: scoppiettii
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) setTimeout(() => pop(0.25 + Math.random() * 0.2), 40 + Math.random() * 320);
    }
    prevThr = thr;
    thr += (tt - thr) * (1 - Math.exp(-dt * 12));

    if (s.brake > 0.35 && spd > 0.2 && t - lastBrake > 0.7) { squeal(s.brake); pop(0.35); lastBrake = t; }

    const rate = E.rpm / REF_RPM;
    g.srcs.forEach(({ s: src, skew }) => src.playbackRate.setTargetAtTime(rate * skew, t, 0.03));
    g.lp.frequency.setTargetAtTime(500 + E.rpm * 0.28 + thr * 2200, t, 0.05);   // più aperto sotto gas
    g.eng.gain.setTargetAtTime(0.3 + thr * 0.55, t, 0.05);
    g.lowG.gain.setTargetAtTime(0.1 + thr * 0.2, t, 0.06);
    g.airBp.frequency.setTargetAtTime(800 + E.rpm * 0.3, t, 0.05);
    g.airG.gain.setTargetAtTime(0.01 + thr * 0.06 * (E.rpm / REDLINE), t, 0.05);
    const vol = (1 - s.hero) * E.vol * (0.55 + 0.45 * Math.min(1, E.rpm / 6000));
    g.master.gain.setTargetAtTime(vol, t, 0.08);
  };

  document.addEventListener('visibilitychange', () => {
    if (!E.ctx) return;
    if (document.hidden) E.ctx.suspend(); else if (E.on) E.ctx.resume();
  });

  window.EngineAudio = E;
})();
