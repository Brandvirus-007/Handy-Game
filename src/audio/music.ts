/**
 * Generative, tempo-locked music in A minor. A lookahead scheduler (setInterval + precise
 * AudioContext timestamps) places notes ahead of time so timing never drifts.
 *
 * Intensity: 0 = menu (pad + sparse arp), 1 = play (+ bass, full arp),
 * 2 = late waves (+ kick & hats), 3 = boss (darker progression, + snare, 16th hats).
 */
const BPM = 96;
const STEP = 60 / BPM / 4; // 16th note
const LOOKAHEAD = 0.14;

// Chords as MIDI note numbers (root position voicings around octave 3–4).
const CALM = [
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [48, 52, 55], // C
  [55, 59, 62], // G
];
const DARK = [
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [50, 53, 57], // Dm
  [52, 56, 59], // E
];

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class Music {
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextTime = 0;
  private step = 0;
  private bar = 0;
  private intensity = 0;
  private pending = 0;
  private delay: DelayNode;
  private delayIn: GainNode;

  constructor(
    private ctx: AudioContext,
    private out: AudioNode,
    private reverb: AudioNode,
    private noise: AudioBuffer,
  ) {
    // Dotted-eighth feedback delay for the arpeggio.
    this.delayIn = ctx.createGain();
    this.delayIn.gain.value = 0.32;
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = STEP * 3;
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

  private schedule(): void {
    if (this.ctx.state !== 'running') {
      this.nextTime = this.ctx.currentTime + 0.05;
      return;
    }
    // After a long suspension, jump ahead instead of flooding notes.
    if (this.nextTime < this.ctx.currentTime - 0.2) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += STEP;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) {
        this.bar++;
        this.intensity = this.pending;
      }
    }
  }

  private playStep(step: number, t: number): void {
    const prog = this.intensity >= 3 ? DARK : CALM;
    const chord = prog[this.bar % prog.length];
    const lvl = this.intensity;

    if (step === 0) this.pad(chord, t, STEP * 16 + 0.4);

    // Arpeggio: up/down pattern through two octaves.
    const arpEvery = lvl === 0 ? 4 : 2;
    if (step % arpEvery === 0) {
      const pattern = [0, 1, 2, 3, 4, 3, 2, 1];
      const idx = pattern[(step / arpEvery + this.bar * 2) % pattern.length];
      const note = chord[idx % 3] + 12 * (1 + Math.floor(idx / 3));
      const accent = step % 8 === 0;
      this.pluck(mtof(note), t, accent ? 0.075 : 0.05);
    }

    if (lvl >= 1 && (step === 0 || step === 6 || step === 8 || step === 14)) {
      this.bass(mtof(chord[0] - 24), t, step === 0 ? 0.32 : 0.22);
    }
    if (lvl >= 2) {
      if (step % 8 === 0 || (lvl >= 3 && step % 4 === 0)) this.kick(t);
      if (step % 4 === 2 || (lvl >= 3 && step % 2 === 1)) this.hat(t, step % 4 === 2 ? 0.05 : 0.025);
    }
    if (lvl >= 3 && (step === 4 || step === 12)) this.snare(t);
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
    g.connect(this.out);
    const send = ctx.createGain();
    send.gain.value = 0.6;
    g.connect(send);
    send.connect(this.reverb);
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
    g.connect(this.out);
    g.connect(this.delayIn);
    const send = ctx.createGain();
    send.gain.value = 0.35;
    g.connect(send);
    send.connect(this.reverb);
    o.start(t);
    o.stop(t + 0.42);
  }

  private bass(freq: number, t: number, vol: number): void {
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
    g.gain.exponentialRampToValueAtTime(0.0001, t + STEP * 3.5);
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    o.connect(g);
    o2.connect(g2);
    g2.connect(g);
    g.connect(this.out);
    o.start(t);
    o2.start(t);
    o.stop(t + STEP * 4);
    o2.stop(t + STEP * 4);
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
    const send = ctx.createGain();
    send.gain.value = 0.4;
    g.connect(send);
    send.connect(this.reverb);
    s.start(t, Math.random() * 0.5);
    s.stop(t + 0.2);
  }
}
