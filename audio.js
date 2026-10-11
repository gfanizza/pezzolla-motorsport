/* Motore V10 sintetizzato con Web Audio (nessun file audio).
   Il regime segue la velocità di scroll: accelerazione → cambiate, rilascio → scoppiettii,
   frenata brusca → stridio + scoppio. Silenzioso durante l'hero (c'è l'audio del video). */
(() => {
  'use strict';
  const AC = window.AudioContext || window.webkitAudioContext;
  const IDLE = 900, REDLINE = 8400, GEARS = 6;
  const E = { on: false, ctx: null, vol: 0.55, supported: !!AC, rpm: IDLE, gear: 0 };
  let g = null, noiseBuf = null, thr = 0.1, shiftT = 0, lastBrake = 0, prevThr = 0;

  function makeNoise(ctx) {
    const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function driveCurve(k) {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; c[i] = Math.tanh(k * x); }
    return c;
  }

  function build() {
    const ctx = E.ctx = new AC();
    noiseBuf = makeNoise(ctx);
    const master = ctx.createGain(); master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.ratio.value = 6; comp.attack.value = 0.005; comp.release.value = 0.15;
    master.connect(comp); comp.connect(ctx.destination);

    const mix = ctx.createGain(); mix.gain.value = 0.4;
    const shaper = ctx.createWaveShaper(); shaper.curve = driveCurve(5); shaper.oversample = '2x';
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.1;
    const howl = ctx.createBiquadFilter(); howl.type = 'peaking'; howl.gain.value = 9; howl.Q.value = 2.2;
    mix.connect(shaper); shaper.connect(lp); lp.connect(howl); howl.connect(master);

    /* armoniche dell'ordine di scoppio (5 cilindri per giro → rpm/60·5), con leggere
       scordature per l'irregolarità del V10 a 90° */
    const bank = [['sawtooth', 1, 0.5, 0], ['sawtooth', 2, 0.32, 9], ['square', 0.5, 0.55, -6],
                  ['sawtooth', 3, 0.2, -11], ['triangle', 1.5, 0.25, 4]].map(([type, mul, gain, det]) => {
      const o = ctx.createOscillator(); o.type = type; o.detune.value = det;
      const gn = ctx.createGain(); gn.gain.value = gain;
      o.connect(gn); gn.connect(mix); o.start();
      return { o, mul };
    });

    const nz = ctx.createBufferSource(); nz.buffer = noiseBuf; nz.loop = true;
    const nbp = ctx.createBiquadFilter(); nbp.type = 'bandpass'; nbp.Q.value = 0.6;
    const ng = ctx.createGain(); ng.gain.value = 0;
    nz.connect(nbp); nbp.connect(ng); ng.connect(master); nz.start();

    g = { master, mix, lp, howl, bank, nbp, ng };
  }

  /* scoppio allo scarico */
  function pop(strength) {
    if (!E.ctx || !E.on) return;
    const ctx = E.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500 + Math.random() * 900;
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(strength, t + 0.004);
    gn.gain.exponentialRampToValueAtTime(0.001, t + 0.08 + Math.random() * 0.07);
    s.connect(f); f.connect(gn); gn.connect(g.master); s.start(t, Math.random() * 1.5, 0.25);
    const th = ctx.createOscillator(); th.type = 'sine';
    th.frequency.setValueAtTime(140, t); th.frequency.exponentialRampToValueAtTime(45, t + 0.1);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(strength * 0.6, t); tg.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    th.connect(tg); tg.connect(g.master); th.start(t); th.stop(t + 0.15);
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
    gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(0.09 * level, t + 0.06);
    gn.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.connect(bp); bp.connect(gn); gn.connect(g.master); o.start(t); o.stop(t + 0.65);
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(0.05 * level, t + 0.05);
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

    const f1 = E.rpm / 60 * 5;
    g.bank.forEach(({ o, mul }) => o.frequency.setTargetAtTime(f1 * mul, t, 0.03));
    g.lp.frequency.setTargetAtTime(700 + E.rpm * 0.55 + thr * 1800, t, 0.05);
    g.howl.frequency.setTargetAtTime(Math.min(3500, f1 * 3), t, 0.05);
    g.nbp.frequency.setTargetAtTime(900 + E.rpm * 0.25, t, 0.05);
    g.ng.gain.setTargetAtTime(0.04 + thr * 0.22 * (E.rpm / REDLINE), t, 0.05);
    g.mix.gain.setTargetAtTime(0.22 + thr * 0.32, t, 0.05);
    const vol = (1 - s.hero) * E.vol * (0.5 + 0.5 * Math.min(1, E.rpm / 6000));
    g.master.gain.setTargetAtTime(vol, t, 0.08);
  };

  document.addEventListener('visibilitychange', () => {
    if (!E.ctx) return;
    if (document.hidden) E.ctx.suspend(); else if (E.on) E.ctx.resume();
  });

  window.EngineAudio = E;
})();
