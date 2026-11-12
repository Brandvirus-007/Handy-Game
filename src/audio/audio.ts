import { Music } from './music';

/** A minor pentatonic over several octaves – every SFX melody stays in key with the music. */
const PENTA = [0, 3, 5, 7, 10];
export const midiToFreq = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
export const pentaNote = (base: number, step: number): number => {
  const oct = Math.floor(step / PENTA.length);
  return base + oct * 12 + PENTA[((step % PENTA.length) + PENTA.length) % PENTA.length];
};

type Throttle = Record<string, number>;

/**
 * Procedural audio engine: every sound is synthesised at runtime with the Web Audio API.
 * Created lazily on the first user gesture (required by iOS/Chrome autoplay rules).
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private musicFilter!: BiquadFilterNode;
  private reverbSend!: GainNode;
  private noise!: AudioBuffer;
  music: Music | null = null;
  private last: Throttle = {};
  private pickupStep = 0;
  private pickupTime = 0;
  private musicVol = 0.6;
  private sfxVol = 0.85;
  private hidden = false;

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  unlock(): void {
    try {
      if (!this.ctx) this.init();
      if (this.ctx && this.ctx.state === 'suspended' && !this.hidden) void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  private init(): void {
    const Ctor: typeof AudioContext | undefined =
      globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor({ latencyHint: 'interactive' });
    this.ctx = ctx;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    comp.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxVol;
    this.sfxBus.connect(this.master);

    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 18000;
    this.musicFilter.Q.value = 0.7;
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicVol * 0.55;
    this.musicBus.connect(this.musicFilter);
    this.musicFilter.connect(this.master);

    // Generated impulse response → lush, spacey reverb without any asset files.
    const reverb = ctx.createConvolver();
    reverb.buffer = makeImpulse(ctx, 2.4, 2.6);
    const reverbOut = ctx.createGain();
    reverbOut.gain.value = 0.55;
    reverb.connect(reverbOut);
    reverbOut.connect(this.master);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 1;
    this.reverbSend.connect(reverb);

    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.music = new Music(ctx, this.musicBus, this.reverbSend, this.noise);
    this.music.start();

    // iOS: play a silent buffer inside the gesture to fully unlock output.
    const silent = ctx.createBufferSource();
    silent.buffer = ctx.createBuffer(1, 1, 22050);
    silent.connect(ctx.destination);
    silent.start(0);
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVol = music;
    this.sfxVol = sfx;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(music * 0.55, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(sfx, t, 0.05);
  }

  /** Muffles the music (pause / upgrade screens). */
  duck(on: boolean): void {
    if (!this.ctx) return;
    this.musicFilter.frequency.setTargetAtTime(on ? 650 : 18000, this.ctx.currentTime, 0.25);
  }

  setIntensity(level: number): void {
    this.music?.setIntensity(level);
  }

  setVisible(visible: boolean): void {
    this.hidden = !visible;
    if (!this.ctx) return;
    try {
      if (visible) void this.ctx.resume();
      else void this.ctx.suspend();
    } catch {
      /* ignore */
    }
  }

  private gate(name: string, minGap: number): boolean {
    if (!this.ctx || this.ctx.state !== 'running') return false;
    const now = this.ctx.currentTime;
    if (now - (this.last[name] ?? -1) < minGap) return false;
    this.last[name] = now;
    return true;
  }

  // ───────────────────────── Synth primitives ─────────────────────────

  private tone(
    freq: number,
    dur: number,
    opts: { type?: OscillatorType; vol?: number; attack?: number; glide?: number; when?: number; detune?: number; reverb?: number; bus?: AudioNode } = {},
  ): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t0 = ctx.currentTime + (opts.when ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.glide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.glide), t0 + dur);
    if (opts.detune) osc.detune.value = opts.detune;
    const vol = opts.vol ?? 0.3;
    const atk = opts.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(opts.bus ?? this.sfxBus);
    if (opts.reverb) {
      const s = ctx.createGain();
      s.gain.value = opts.reverb;
      g.connect(s);
      s.connect(this.reverbSend);
    }
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noiseHit(
    dur: number,
    opts: { vol?: number; type?: BiquadFilterType; freq?: number; freqEnd?: number; q?: number; when?: number; reverb?: number } = {},
  ): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t0 = ctx.currentTime + (opts.when ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(opts.freq ?? 1200, t0);
    if (opts.freqEnd) f.frequency.exponentialRampToValueAtTime(opts.freqEnd, t0 + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(opts.vol ?? 0.3, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxBus);
    if (opts.reverb) {
      const s = ctx.createGain();
      s.gain.value = opts.reverb;
      g.connect(s);
      s.connect(this.reverbSend);
    }
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.05);
  }

  // ───────────────────────── Game sounds ─────────────────────────

  loop(kills: number, combo: number, echo: boolean): void {
    if (!this.gate('loop', 0.04)) return;
    const base = 57 + Math.min(10, combo) * 2; // rises with the combo
    const notes = kills > 0 ? [0, 2, 4, 5] : [0, 2];
    notes.forEach((step, i) => {
      const f = midiToFreq(pentaNote(base, step + (echo ? 5 : 0)));
      this.tone(f, 0.35, { type: 'triangle', vol: kills > 0 ? 0.16 : 0.07, when: i * 0.035, reverb: 0.5 });
      this.tone(f * 2, 0.25, { type: 'sine', vol: kills > 0 ? 0.06 : 0.025, when: i * 0.035, reverb: 0.4 });
    });
    if (kills > 0) {
      this.tone(110, 0.3, { type: 'sine', vol: 0.25 + Math.min(0.15, kills * 0.03), glide: 45 });
      this.noiseHit(0.35, { type: 'highpass', freq: 5000, freqEnd: 9000, vol: 0.05 + kills * 0.01, reverb: 0.4 });
    }
  }

  kill(big: boolean): void {
    if (!this.gate('kill', 0.03)) return;
    this.noiseHit(big ? 0.3 : 0.16, { type: 'bandpass', freq: big ? 900 : 1600, freqEnd: 300, q: 1.2, vol: big ? 0.35 : 0.22 });
    this.tone(big ? 260 : 420 + Math.random() * 120, big ? 0.3 : 0.14, { type: 'square', vol: 0.06, glide: 60 });
  }

  enemyHit(): void {
    if (!this.gate('ehit', 0.05)) return;
    this.tone(680, 0.08, { type: 'square', vol: 0.06, glide: 300 });
    this.noiseHit(0.08, { type: 'highpass', freq: 3000, vol: 0.12 });
  }

  playerHit(): void {
    if (!this.gate('phit', 0.1)) return;
    this.tone(160, 0.45, { type: 'sawtooth', vol: 0.18, glide: 40 });
    this.tone(80, 0.5, { type: 'sine', vol: 0.4, glide: 30 });
    this.noiseHit(0.4, { type: 'lowpass', freq: 2000, freqEnd: 200, vol: 0.4 });
  }

  shieldBreak(): void {
    if (!this.gate('shield', 0.1)) return;
    for (let i = 0; i < 4; i++) this.tone(midiToFreq(pentaNote(81, 4 - i)), 0.2, { type: 'triangle', vol: 0.1, when: i * 0.03, reverb: 0.5 });
    this.noiseHit(0.25, { type: 'highpass', freq: 4000, vol: 0.15 });
  }

  shieldUp(): void {
    if (!this.gate('shieldup', 0.2)) return;
    for (let i = 0; i < 3; i++) this.tone(midiToFreq(pentaNote(76, i * 2)), 0.25, { type: 'sine', vol: 0.06, when: i * 0.05, reverb: 0.6 });
  }

  /** A loop bounced off a warden's shield. */
  blocked(): void {
    if (!this.gate('blocked', 0.08)) return;
    this.tone(220, 0.12, { type: 'square', vol: 0.06, glide: 160 });
    this.noiseHit(0.08, { type: 'bandpass', freq: 900, q: 3, vol: 0.1 });
  }

  /** Blinker teleport shimmer. */
  blink(): void {
    if (!this.gate('blink', 0.1)) return;
    this.tone(midiToFreq(88), 0.18, { type: 'sine', vol: 0.05, glide: midiToFreq(76), reverb: 0.5 });
  }

  /** Bomber fuse hiss. */
  fuse(): void {
    if (!this.gate('fuse', 0.1)) return;
    this.noiseHit(0.7, { type: 'highpass', freq: 3000, freqEnd: 7000, vol: 0.07 });
    this.tone(440, 0.7, { type: 'square', vol: 0.025, glide: 880 });
  }

  pickup(kind: 'shard' | 'bigshard' | 'heart'): void {
    if (!this.gate('pickup', 0.028)) return;
    const now = this.ctx!.currentTime;
    if (now - this.pickupTime > 0.5) this.pickupStep = 0;
    this.pickupTime = now;
    const step = Math.min(14, this.pickupStep++);
    const f = midiToFreq(pentaNote(kind === 'bigshard' ? 76 : 81, step));
    this.tone(f, 0.12, { type: 'sine', vol: kind === 'bigshard' ? 0.12 : 0.07, reverb: 0.25 });
  }

  heal(): void {
    if (!this.gate('heal', 0.2)) return;
    [0, 2, 4, 7].forEach((s, i) => this.tone(midiToFreq(pentaNote(69, s)), 0.4, { type: 'triangle', vol: 0.1, when: i * 0.07, reverb: 0.6 }));
  }

  pulse(): void {
    if (!this.gate('pulse', 0.1)) return;
    this.tone(220, 0.7, { type: 'sine', vol: 0.45, glide: 40 });
    this.tone(440, 0.4, { type: 'sawtooth', vol: 0.06, glide: 1760 });
    this.noiseHit(0.6, { type: 'bandpass', freq: 300, freqEnd: 6000, q: 0.8, vol: 0.35, reverb: 0.6 });
  }

  pulseReady(): void {
    if (!this.gate('pready', 0.5)) return;
    this.tone(midiToFreq(81), 0.25, { type: 'sine', vol: 0.08, reverb: 0.6 });
    this.tone(midiToFreq(88), 0.35, { type: 'sine', vol: 0.08, when: 0.08, reverb: 0.6 });
  }

  cut(): void {
    if (!this.gate('cut', 0.12)) return;
    this.noiseHit(0.18, { type: 'highpass', freq: 2500, freqEnd: 8000, vol: 0.18 });
    this.tone(900, 0.12, { type: 'sawtooth', vol: 0.05, glide: 200 });
  }

  spawnWarn(boss: boolean): void {
    if (!this.gate('warn', 0.15)) return;
    if (boss) {
      this.tone(55, 1.4, { type: 'sawtooth', vol: 0.18, attack: 0.3, glide: 41 });
      this.tone(82.4, 1.4, { type: 'sawtooth', vol: 0.12, attack: 0.3, detune: 12 });
    } else {
      this.tone(midiToFreq(64), 0.18, { type: 'sine', vol: 0.035, attack: 0.05, glide: midiToFreq(69) });
    }
  }

  shoot(): void {
    if (!this.gate('shoot', 0.08)) return;
    this.tone(520, 0.18, { type: 'square', vol: 0.05, glide: 180 });
  }

  explosion(big: boolean): void {
    if (!this.gate('boom', 0.04)) return;
    this.noiseHit(big ? 0.4 : 0.15, { type: 'lowpass', freq: big ? 1800 : 3000, freqEnd: 120, vol: big ? 0.3 : 0.1 });
  }

  chain(): void {
    if (!this.gate('chain', 0.04)) return;
    this.noiseHit(0.12, { type: 'bandpass', freq: 4000, q: 4, vol: 0.12 });
    this.tone(1200 + Math.random() * 600, 0.08, { type: 'square', vol: 0.03, glide: 2400 });
  }

  waveStart(boss: boolean): void {
    if (!this.gate('wave', 0.3)) return;
    const base = boss ? 45 : 57;
    [0, 3, 7].forEach((s, i) => this.tone(midiToFreq(base + s), 0.8, { type: 'triangle', vol: 0.09, when: i * 0.09, attack: 0.02, reverb: 0.7 }));
  }

  waveClear(flawless: boolean): void {
    if (!this.gate('clear', 0.3)) return;
    const seq = flawless ? [0, 2, 4, 5, 7, 9] : [0, 2, 4, 7];
    seq.forEach((s, i) => this.tone(midiToFreq(pentaNote(69, s)), 0.5, { type: 'triangle', vol: 0.11, when: i * 0.07, reverb: 0.7 }));
  }

  bossRoar(): void {
    if (!this.gate('roar', 0.5)) return;
    this.tone(70, 1.2, { type: 'sawtooth', vol: 0.22, glide: 35, attack: 0.05 });
    this.tone(105, 1.1, { type: 'sawtooth', vol: 0.12, glide: 52, detune: -20 });
    this.noiseHit(1.2, { type: 'lowpass', freq: 600, freqEnd: 90, vol: 0.4, reverb: 0.5 });
  }

  bossDeath(): void {
    if (!this.gate('bdeath', 0.5)) return;
    this.noiseHit(1.6, { type: 'lowpass', freq: 3000, freqEnd: 60, vol: 0.55, reverb: 0.8 });
    this.tone(90, 1.5, { type: 'sine', vol: 0.5, glide: 25 });
    [0, 2, 4, 5, 7, 9, 10].forEach((s, i) =>
      this.tone(midiToFreq(pentaNote(69, s)), 0.6, { type: 'triangle', vol: 0.1, when: 0.4 + i * 0.08, reverb: 0.8 }),
    );
  }

  gameOver(): void {
    [7, 5, 4, 2, 0].forEach((s, i) => this.tone(midiToFreq(pentaNote(57, s)), 0.7, { type: 'triangle', vol: 0.12, when: i * 0.14, reverb: 0.8 }));
    this.tone(55, 2, { type: 'sine', vol: 0.3, attack: 0.1 });
  }

  revive(): void {
    [0, 4, 7, 12].forEach((s, i) => this.tone(midiToFreq(57 + s), 0.9, { type: 'triangle', vol: 0.12, when: i * 0.06, reverb: 0.8 }));
  }

  achievement(): void {
    if (!this.gate('ach', 0.3)) return;
    [0, 4, 7, 11, 14].forEach((s, i) => this.tone(midiToFreq(69 + s), 0.5, { type: 'sine', vol: 0.08, when: i * 0.06, reverb: 0.8 }));
  }

  uiClick(): void {
    if (!this.gate('ui', 0.03)) return;
    this.tone(midiToFreq(81), 0.06, { type: 'sine', vol: 0.07 });
  }

  uiSelect(): void {
    if (!this.gate('uis', 0.05)) return;
    this.tone(midiToFreq(76), 0.12, { type: 'triangle', vol: 0.1, reverb: 0.4 });
    this.tone(midiToFreq(83), 0.18, { type: 'triangle', vol: 0.1, when: 0.05, reverb: 0.4 });
  }

  uiBack(): void {
    if (!this.gate('uib', 0.05)) return;
    this.tone(midiToFreq(76), 0.1, { type: 'triangle', vol: 0.07, glide: midiToFreq(69) });
  }

  purchase(): void {
    [0, 2, 4, 7, 9].forEach((s, i) => this.tone(midiToFreq(pentaNote(72, s)), 0.3, { type: 'triangle', vol: 0.09, when: i * 0.045, reverb: 0.5 }));
  }

  denied(): void {
    this.tone(180, 0.15, { type: 'square', vol: 0.06 });
    this.tone(150, 0.2, { type: 'square', vol: 0.06, when: 0.1 });
  }
}

function makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}
