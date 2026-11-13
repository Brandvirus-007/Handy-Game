/**
 * Generative, tempo-locked music. Every region has its own theme (key, scale, chords, tempo and a short
 * melody that comes back with small variations), plus a menu theme and a boss progression. A lookahead
 * scheduler places notes ahead of time so timing never drifts; theme and intensity change on bar lines.
 *
 * Intensity: 0 = menu (pad + sparse arp), 1 = play (+ bass, melody), 2 = late waves (+ drums, bells),
 * 3 = boss (boss chords, driving bass, snare, 16th hats).
 */

const LOOKAHEAD = 0.14;

interface Theme {
  /** MIDI note of the scale's first degree. */
  root: number;
  /** Semitone steps of the scale (7 notes). */
  scale: number[];
  /** Chord progression as scale degrees (0-based). */
  prog: number[];
  /** Boss progression (scale degrees). */
  boss: number[];
  bpm: number;
  lead: OscillatorType;
  /** Seed of the melody. */
  seed: number;
}

const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const HARMONIC = [0, 2, 3, 5, 7, 8, 11];

/** Index = region (biome); MENU is used outside of runs. */
const THEMES: Theme[] = [
  { root: 57, scale: MINOR, prog: [0, 5, 2, 6], boss: [0, 5, 3, 4], bpm: 96, lead: 'triangle', seed: 11 }, // Nebelmeer – A minor
  { root: 50, scale: PHRYGIAN, prog: [0, 1, 0, 6], boss: [0, 1, 5, 4], bpm: 104, lead: 'square', seed: 23 }, // Glutwüste – D phrygian
  { root: 54, scale: MINOR, prog: [0, 3, 5, 4], boss: [0, 5, 3, 4], bpm: 88, lead: 'sine', seed: 37 }, // Tiefsee – F# minor
  { root: 60, scale: LYDIAN, prog: [0, 1, 4, 5], boss: [5, 1, 0, 4], bpm: 100, lead: 'triangle', seed: 41 }, // Aurora – C lydian
  { root: 59, scale: HARMONIC, prog: [0, 5, 0, 4], boss: [0, 1, 5, 4], bpm: 84, lead: 'sine', seed: 53 }, // Die Leere – B harmonic minor
  { root: 52, scale: DORIAN, prog: [0, 3, 6, 4], boss: [0, 5, 3, 4], bpm: 108, lead: 'square', seed: 67 }, // Kristallgrotte – E dorian
];
const MENU: Theme = { root: 57, scale: MINOR, prog: [0, 5, 2, 6], boss: [0, 5, 3, 4], bpm: 84, lead: 'sine', seed: 5 };

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** Note of a scale degree (any integer; wraps into higher/lower octaves). */
const degree = (th: Theme, d: number): number => {
  const oct = Math.floor(d / 7);
  return th.root + 12 * oct + th.scale[((d % 7) + 7) % 7];
};

/** A two-bar melody (16 eighth notes, -1 = rest) built from a seed – the theme's recognisable hook. */
function makeMotif(seed: number): number[] {
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const out: number[] = [];
  let d = 4 + Math.floor(rnd() * 3);
  for (let i = 0; i < 16; i++) {
    if (i % 4 === 3 && rnd() < 0.45) {
      out.push(-1);
      continue;
    }
    const step = rnd() < 0.6 ? (rnd() < 0.5 ? 1 : -1) : rnd() < 0.5 ? 2 : -2;
    d = Math.max(2, Math.min(9, d + step));
    out.push(d);
  }
  out[15] = -1;
  return out;
}

export class Music {
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextTime = 0;
  private step = 0;
  private bar = 0;
  private intensity = 0;
  private pending = 0;
  private theme: Theme = MENU;
  private pendingTheme: Theme = MENU;
  private motif = makeMotif(MENU.seed);
  private delay: DelayNode;
  private delayIn: GainNode;
  /** Pad and arp run through here so the kick can push them down a little (groove). */
  private pump: GainNode;
  /** Set when a recorded track plays instead – the generator then stays silent. */
  muted = false;

  constructor(
    private ctx: AudioContext,
    private out: AudioNode,
    private reverb: AudioNode,
    private noise: AudioBuffer,
  ) {
    this.pump = ctx.createGain();
    this.pump.connect(out);
    // Dotted-eighth feedback delay for arp and melody.
    this.delayIn = ctx.createGain();
    this.delayIn.gain.value = 0.32;
    this.delay = ctx.createDelay(1.5);
    this.delay.delayTime.value = this.stepLen() * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2600;
    this.delayIn.connect(this.delay);
    this.delay.connect(tone);
    tone.connect(fb);
    fb.connect(this.delay);
    tone.connect(out);
  }

  private stepLen(): number {
    return 60 / this.theme.bpm / 4;
  }

  start(): void {
    if (this.timer) return;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Takes effect at the next bar so transitions stay musical. */
  setIntensity(level: number): void {
    this.pending = Math.max(0, Math.min(3, level));
  }

  /** Region theme (0–5) or the menu theme (-1). Switches on the next bar. */
  setTheme(region: number): void {
    this.pendingTheme = region < 0 ? MENU : THEMES[region % THEMES.length];
  }

  private schedule(): void {
    if (this.ctx.state !== 'running') {
      this.nextTime = this.ctx.currentTime + 0.05;
      return;
    }
    // After a long suspension, jump ahead instead of flooding notes.
    if (this.nextTime < this.ctx.currentTime - 0.2) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      if (!this.muted) this.playStep(this.step, this.nextTime);
      this.nextTime += this.stepLen();
      this.step = (this.step + 1) % 16;
      if (this.step === 0) {
        this.bar++;
        this.intensity = this.pending;
        if (this.pendingTheme !== this.theme) {
          this.theme = this.pendingTheme;
          this.motif = makeMotif(this.theme.seed);
          this.delay.delayTime.setTargetAtTime(this.stepLen() * 3, this.nextTime, 0.05);
        }
      }
    }
  }

  private chord(): number[] {
    const th = this.theme;
    const prog = this.intensity >= 3 ? th.boss : th.prog;
    const d = prog[this.bar % prog.length];
    return [degree(th, d), degree(th, d + 2), degree(th, d + 4)];
  }

  private playStep(step: number, t: number): void {
    const chord = this.chord();
    const lvl = this.intensity;
    const st = this.stepLen();

    if (step === 0) this.pad(chord, t, st * 16 + 0.4);

    // Arpeggio: up/down through two octaves.
    const arpEvery = lvl === 0 ? 4 : 2;
    if (step % arpEvery === 0) {
      const pattern = [0, 1, 2, 3, 4, 3, 2, 1];
      const idx = pattern[(step / arpEvery + this.bar * 2) % pattern.length];
      const note = chord[idx % 3] + 12 * (1 + Math.floor(idx / 3));
      this.pluck(mtof(note), t, step % 8 === 0 ? 0.06 : 0.04);
    }

    // Melody: the theme's motif on eighth notes; every fourth bar pair it answers an octave lower.
    if (lvl >= 1 && step % 2 === 0) {
      const i = (this.bar % 2) * 8 + step / 2;
      const d = this.motif[i];
      if (d >= 0) {
        const answer = Math.floor(this.bar / 2) % 4 === 3;
        this.lead(mtof(degree(this.theme, d) + 12 - (answer ? 12 : 0)), t, st * 1.8, lvl >= 3 ? 0.05 : 0.04);
      }
    }

    if (lvl >= 1 && (step === 0 || step === 6 || step === 8 || step === 14 || (lvl >= 3 && step % 2 === 0))) {
      this.bass(mtof(chord[0] - 24), t, step === 0 ? 0.32 : lvl >= 3 ? 0.16 : 0.22, st);
    }
    if (lvl >= 2) {
      if (step % 8 === 0 || (lvl >= 3 && step % 4 === 0)) this.kick(t);
      if (step % 4 === 2 || (lvl >= 3 && step % 2 === 1)) this.hat(t, step % 4 === 2 ? 0.05 : 0.025);
      // Bells: a high chord tone every half bar.
      if (step === 0 || step === 8) this.bell(mtof(chord[(this.bar + step / 8) % 3] + 24), t);
    }
    if (lvl >= 3 && (step === 4 || step === 12)) this.snare(t);
  }

  private send(node: AudioNode, amount: number): void {
    const g = this.ctx.createGain();
    g.gain.value = amount;
    node.connect(g);
    g.connect(this.reverb);
  }

  private pad(chord: number[], t: number, dur: number): void {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(500 + this.intensity * 260, t);
    f.frequency.linearRampToValueAtTime(900 + this.intensity * 300, t + dur * 0.5);
    f.frequency.linearRampToValueAtTime(500 + this.intensity * 260, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.9);
    g.gain.setValueAtTime(0.07, t + dur - 0.8);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    f.connect(g);
    g.connect(this.pump);
    this.send(g, 0.6);
    for (const n of chord) {
      for (const det of [-8, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(n);
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        o.stop(t + dur + 0.1);
      }
    }
  }

  private pluck(freq: number, t: number, vol: number): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    o.connect(g);
    g.connect(this.pump);
    g.connect(this.delayIn);
    this.send(g, 0.35);
    o.start(t);
    o.stop(t + 0.42);
  }

  /** Melody voice with a soft attack and a little vibrato. */
  private lead(freq: number, t: number, dur: number, vol: number): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = this.theme.lead;
    o.frequency.value = freq;
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.5;
    const vibAmt = ctx.createGain();
    vibAmt.gain.value = freq * 0.006;
    vib.connect(vibAmt);
    vibAmt.connect(o.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = this.theme.lead === 'square' ? 1800 : 3200;
    const g = ctx.createGain();
    const v = this.theme.lead === 'square' ? vol * 0.55 : vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.03);
    g.gain.setValueAtTime(v, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.15);
    o.connect(f);
    f.connect(g);
    g.connect(this.out);
    g.connect(this.delayIn);
    this.send(g, 0.45);
    o.start(t);
    vib.start(t);
    o.stop(t + dur + 0.2);
    vib.stop(t + dur + 0.2);
  }

  /** Glassy bell: two sine partials with a long tail. */
  private bell(freq: number, t: number): void {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.03, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    g.connect(this.out);
    this.send(g, 0.7);
    for (const [mul, amp] of [
      [1, 1],
      [2.76, 0.35],
    ]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * mul;
      const a = ctx.createGain();
      a.gain.value = amp;
      o.connect(a);
      a.connect(g);
      o.start(t);
      o.stop(t + 1.7);
    }
  }

  private bass(freq: number, t: number, vol: number, st: number): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = freq * 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + st * 3.5);
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    o.connect(g);
    o2.connect(g2);
    g2.connect(g);
    g.connect(this.out);
    o.start(t);
    o2.start(t);
    o.stop(t + st * 4);
    o2.stop(t + st * 4);
  }

  private kick(t: number): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.42, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g);
    g.connect(this.out);
    o.start(t);
    o.stop(t + 0.3);
    // Pump: pad and arp dip with every kick and swell back.
    this.pump.gain.cancelScheduledValues(t);
    this.pump.gain.setValueAtTime(0.55, t);
    this.pump.gain.linearRampToValueAtTime(1, t + 0.22);
  }

  private hat(t: number, vol: number): void {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(f);
    f.connect(g);
    g.connect(this.out);
    s.start(t, Math.random() * 0.5);
    s.stop(t + 0.06);
  }

  private snare(t: number): void {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    f.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    s.connect(f);
    f.connect(g);
    g.connect(this.out);
    this.send(g, 0.4);
    s.start(t, Math.random() * 0.5);
    s.stop(t + 0.2);
  }
}
