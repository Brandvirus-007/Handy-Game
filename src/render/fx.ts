import { TAU, noise1, type Vec } from '../core/math';
import { polygonPerimeter } from '../core/geometry';
import { t } from '../core/i18n';
import { COLORS, ENEMIES, TWIN_COLORS } from '../game/config';
import type { GameEvent } from '../game/types';
import { drawGlow } from './sprites';
import { lighten, rgba } from './color';

const enum Kind {
  Spark,
  Streak,
  Ring,
  /** Rotating triangle fragment – shadows shatter into these. */
  Shard,
}

interface Particle {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  /** Ring: end radius. */
  size2: number;
  drag: number;
  color: string;
  width: number;
  rot: number;
  spin: number;
}

interface FloatText {
  text: string;
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface LoopFlash {
  poly: Vec[];
  life: number;
  maxLife: number;
  color: string;
  strong: boolean;
}

interface Bolt {
  pts: Vec[];
  life: number;
  maxLife: number;
  color: string;
}

const MAX_PARTICLES = 900;

export interface FxSettings {
  shake: boolean;
  reducedMotion: boolean;
  /** 1 = full particle density. */
  density: number;
}

/**
 * Purely visual effects driven by simulation events. Lives in world coordinates;
 * screen shake / flashes are exposed for the renderer and UI.
 */
export class Fx {
  private pool: Particle[] = [];
  private active: Particle[] = [];
  texts: FloatText[] = [];
  flashes: LoopFlash[] = [];
  bolts: Bolt[] = [];

  trauma = 0;
  hitstop = 0;
  /** Full-screen colour flash (rgba string + alpha decay). */
  screenFlash = 0;
  screenFlashColor = '#ffffff';
  /** Menu backdrop: no texts, flashes or white sparks – the UI on top must stay readable. */
  calm = false;
  /** Distortion rings for the WebGL light filter (world coordinates). */
  waves: { x: number; y: number; age: number; life: number; maxR: number; strength: number }[] = [];
  /** Colour split after hits (0..1), read by the light filter. */
  aberration = 0;
  private lastScoreText = -1;
  damagePulse = 0;
  private time = 0;
  /** Beams can cut the trail many times per second – show the label only occasionally. */
  private lastCutText = -1;
  settings: FxSettings = { shake: true, reducedMotion: false, density: 1 };
  playerColor = '#7df9ff';

  private spawn(): Particle | null {
    if (this.active.length >= MAX_PARTICLES) return null;
    const p = this.pool.pop() ?? ({} as Particle);
    this.active.push(p);
    return p;
  }

  private burst(x: number, y: number, color: string, count: number, speed: number, life = 0.6, size = 5, kind: Kind = Kind.Spark): void {
    // Calm mode (menu backdrop): no white sparks, fewer particles.
    if (this.calm && color === '#ffffff') return;
    const n = Math.round(count * this.settings.density * (this.calm ? 0.5 : 1));
    for (let i = 0; i < n; i++) {
      const p = this.spawn();
      if (!p) return;
      const a = Math.random() * TAU;
      const s = speed * (0.35 + Math.random() * 0.75);
      p.kind = kind;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.life = p.maxLife = life * (0.6 + Math.random() * 0.6);
      p.size = size * (0.6 + Math.random() * 0.8);
      p.size2 = 0;
      p.drag = 3.2;
      p.color = color;
      p.width = 1.6;
      p.rot = 0;
      p.spin = 0;
    }
  }

  /** Shadow body breaking apart: spinning triangular fragments. */
  shatter(x: number, y: number, color: string, r: number, count: number): void {
    const n = Math.round(count * this.settings.density);
    for (let i = 0; i < n; i++) {
      const p = this.spawn();
      if (!p) return;
      const a = (i / n) * TAU + Math.random() * 0.6;
      const s = 70 + Math.random() * 130;
      p.kind = Kind.Shard;
      p.x = x + Math.cos(a) * r * 0.4;
      p.y = y + Math.sin(a) * r * 0.4;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.life = p.maxLife = 0.45 + Math.random() * 0.35;
      p.size = r * (0.25 + Math.random() * 0.25);
      p.size2 = 0;
      p.drag = 3;
      p.color = color;
      p.width = 1;
      p.rot = Math.random() * TAU;
      p.spin = (Math.random() - 0.5) * 18;
    }
  }

  /** Tiny embers left behind while the spark moves. */
  trailSpark(x: number, y: number, color: string): void {
    const p = this.spawn();
    if (!p) return;
    const a = Math.random() * TAU;
    p.kind = Kind.Spark;
    p.x = x + Math.cos(a) * 3;
    p.y = y + Math.sin(a) * 3;
    p.vx = Math.cos(a) * 18;
    p.vy = Math.sin(a) * 18;
    p.life = p.maxLife = 0.35 + Math.random() * 0.35;
    p.size = 1.6 + Math.random() * 1.8;
    p.size2 = 0;
    p.drag = 2;
    p.color = color;
    p.width = 1;
    p.rot = 0;
    p.spin = 0;
  }

  ring(x: number, y: number, color: string, r0: number, r1: number, life = 0.45, width = 3): void {
    if (this.calm && color === '#ffffff') return;
    const p = this.spawn();
    if (!p) return;
    p.kind = Kind.Ring;
    p.x = x;
    p.y = y;
    p.vx = p.vy = 0;
    p.life = p.maxLife = life;
    p.size = r0;
    p.size2 = r1;
    p.drag = 0;
    p.color = color;
    p.width = width;
    p.rot = 0;
    p.spin = 0;
  }

  text(text: string, x: number, y: number, color = '#ffffff', size = 14, life = 0.9): void {
    if (this.calm) return;
    if (this.texts.length > 24) this.texts.shift();
    this.texts.push({ text, x, y, vy: -38, life, maxLife: life, size, color });
  }

  shake(amount: number): void {
    if (!this.settings.shake) return;
    const scale = this.settings.reducedMotion ? 0.35 : 1;
    this.trauma = Math.min(1, this.trauma + amount * scale);
  }

  stop(seconds: number): void {
    this.hitstop = Math.max(this.hitstop, seconds);
  }

  flash(color: string, amount: number): void {
    if (this.calm) return;
    const a = this.settings.reducedMotion ? amount * 0.4 : amount;
    if (a > this.screenFlash) {
      this.screenFlash = a;
      this.screenFlashColor = color;
    }
  }

  /** Ambient motes for the menu background. */
  ambient(w: number, h: number): void {
    if (Math.random() > 0.25 * this.settings.density) return;
    const p = this.spawn();
    if (!p) return;
    p.kind = Kind.Spark;
    p.x = Math.random() * w;
    p.y = h + 10;
    p.vx = (Math.random() - 0.5) * 12;
    p.vy = -20 - Math.random() * 30;
    p.life = p.maxLife = 4 + Math.random() * 4;
    p.size = 2 + Math.random() * 5;
    p.size2 = 0;
    p.drag = 0;
    p.color = Math.random() < 0.7 ? this.playerColor : '#a66bff';
    p.width = 1;
    p.rot = 0;
    p.spin = 0;
  }

  handle(e: GameEvent): void {
    switch (e.type) {
      case 'loop': {
        const strong = e.kills > 0;
        const color = e.echo ? '#c38bff' : this.playerColor;
        this.flashes.push({ poly: e.poly, life: 0.6, maxLife: 0.6, color, strong });
        if (strong) {
          // Shockwave rolling outward from the middle of the loop.
          const rad = Math.sqrt(e.area / Math.PI);
          if (e.kills >= 3) this.distort(e.cx, e.cy, 0.45 + 0.05 * Math.min(6, e.kills), 0.45, rad * 1.8);
          this.ring(e.cx, e.cy, lighten(color, 0.5), rad * 0.3, rad * 1.5, 0.5, 2.5);
          this.ring(e.cx, e.cy, color, rad * 0.2, rad * 1.9, 0.7, 2);
        }
        // Sparks along the perimeter, flying outward from the centroid.
        const per = polygonPerimeter(e.poly);
        const n = Math.min(70, Math.round((per / 13) * this.settings.density));
        for (let i = 0; i < n; i++) {
          const q = e.poly[Math.floor((i / n) * e.poly.length)];
          const p = this.spawn();
          if (!p) break;
          const dx = q.x - e.cx;
          const dy = q.y - e.cy;
          const d = Math.hypot(dx, dy) || 1;
          const s = 40 + Math.random() * 90;
          p.kind = Kind.Streak;
          p.x = q.x;
          p.y = q.y;
          p.vx = (dx / d) * s;
          p.vy = (dy / d) * s;
          p.life = p.maxLife = 0.35 + Math.random() * 0.3;
          p.size = 3;
          p.size2 = 0;
          p.drag = 4;
          p.color = color;
          p.width = 1.8;
          p.rot = 0;
          p.spin = 0;
        }
        if (e.kills >= 2) this.text(t('float.multi', { n: e.kills }), e.cx, e.cy - 8, '#ffffff', 14 + Math.min(6, e.kills), 1);
        if (e.echo && e.kills > 0) this.text(t('float.echo'), e.cx, e.cy + 14, '#c38bff', 12);
        if (strong) {
          this.shake(0.12 + 0.05 * Math.min(8, e.kills));
          this.stop(Math.min(0.09, 0.02 + 0.012 * e.kills));
        }
        break;
      }
      case 'kill': {
        const color = e.enemy === 'twin' ? TWIN_COLORS[0] : ENEMIES[e.enemy].color;
        const big = e.r > 14 || e.elite;
        this.burst(e.x, e.y, color, big ? 16 : 8, big ? 220 : 160, 0.6, big ? 7 : 5);
        this.burst(e.x, e.y, '#ffffff', 2, 90, 0.25, 3, Kind.Streak);
        this.shatter(e.x, e.y, color, e.r, big ? 10 : 6);
        this.ring(e.x, e.y, color, e.r * 0.6, e.r * 2.6, 0.4, 2.5);
        // Several kills in the same instant (one loop) show a single score number, not a stack of them.
        if (e.score > 0 && e.source !== 'boss' && this.time - this.lastScoreText > 0.05) {
          this.lastScoreText = this.time;
          this.text(`+${e.score}`, e.x, e.y - e.r - 4, e.elite ? COLORS.shard : '#e9e4ff', e.elite ? 13 : 11, 0.75);
        }
        this.shake(big ? 0.12 : 0.05);
        break;
      }
      case 'enemyHit':
        this.burst(e.x, e.y, '#ffffff', 5, 130, 0.3, 3.5);
        this.ring(e.x, e.y, '#ffffff', 6, 30, 0.28, 1.5);
        this.shake(0.1);
        break;
      case 'playerHit':
        if (!this.calm && !this.settings.reducedMotion) this.aberration = 1;
        this.burst(e.x, e.y, COLORS.danger, 30, 260, 0.7, 6);
        this.ring(e.x, e.y, COLORS.danger, 10, 110, 0.5, 4);
        this.flash(COLORS.danger, 0.32);
        this.damagePulse = 1;
        this.shake(0.65);
        this.stop(0.12);
        break;
      case 'shieldBreak':
        this.burst(e.x, e.y, COLORS.shield, 20, 200, 0.5, 5);
        this.ring(e.x, e.y, COLORS.shield, 14, 90, 0.45, 3);
        this.text(t('float.shield'), e.x, e.y - 24, COLORS.shield, 13);
        this.shake(0.3);
        this.stop(0.06);
        break;
      case 'playerDeath':
        this.burst(e.x, e.y, this.playerColor, 70, 340, 1.4, 8);
        this.burst(e.x, e.y, '#ffffff', 30, 200, 1, 4, Kind.Streak);
        this.ring(e.x, e.y, this.playerColor, 10, 220, 1.1, 5);
        this.flash('#ffffff', 0.32);
        this.shake(1);
        this.stop(0.25);
        break;
      case 'revive':
        this.distort(e.x, e.y, 1.2, 0.8, 320);
        this.ring(e.x, e.y, '#ffffff', 10, 260, 0.9, 6);
        this.burst(e.x, e.y, '#ffffff', 40, 300, 0.9, 6);
        this.flash('#ffffff', 0.28);
        break;
      case 'pickup':
        if (e.kind === 'heart') break;
        this.burst(e.x, e.y, COLORS.shard, e.kind === 'bigshard' ? 8 : 3, 70, 0.3, 3);
        break;
      case 'gravity':
        // Rings collapsing into the loop centre.
        this.ring(e.x, e.y, '#b9a3ff', e.r, 6, 0.45, 2.5);
        this.ring(e.x, e.y, '#ffffff', e.r * 0.7, 4, 0.35, 1.5);
        break;
      case 'orbitHit':
        this.burst(e.x, e.y, '#ffffff', 5, 110, 0.25, 3, Kind.Streak);
        break;
      case 'heal':
        this.text(t('float.heart'), e.x, e.y - 18, COLORS.heart, 13);
        this.burst(e.x, e.y, COLORS.heart, 14, 120, 0.6, 5);
        break;
      case 'pulse':
        this.distort(e.x, e.y, 1, 0.55, e.radius * 1.4);
        this.ring(e.x, e.y, '#ffffff', 8, e.radius, 0.45, 6);
        this.ring(e.x, e.y, this.playerColor, 4, e.radius * 1.12, 0.65, 3);
        this.burst(e.x, e.y, this.playerColor, 46, 420, 0.6, 6, Kind.Streak);
        this.flash(this.playerColor, 0.12);
        this.shake(0.45);
        this.stop(0.05);
        break;
      case 'trailCut':
        this.burst(e.x, e.y, '#ff9a3c', 14, 180, 0.4, 4, Kind.Streak);
        if (this.time - this.lastCutText > 0.4) {
          this.lastCutText = this.time;
          this.text(t('float.cut'), e.x, e.y - 10, '#ffb36b', 11, 0.7);
          this.shake(0.08);
        }
        break;
      case 'spawn': {
        const color = ENEMIES[e.enemy].color;
        this.ring(e.x, e.y, color, 30, 4, 0.35, 2);
        break;
      }
      case 'shoot':
        this.ring(e.x, e.y, COLORS.projectile, 10, 50, 0.3, 2);
        break;
      case 'explosion':
        if (e.r > 20) this.distort(e.x, e.y, 0.4, 0.35, e.r * 2.2);
        this.ring(e.x, e.y, '#ffd0a0', 4, e.r, 0.35, e.r > 20 ? 4 : 2);
        if (e.r > 20) {
          this.burst(e.x, e.y, '#ffb36b', 14, e.r * 4, 0.45, 5);
          this.shake(0.1);
        }
        break;
      case 'chain':
        this.bolts.push({ pts: jagged(e.ax, e.ay, e.bx, e.by), life: 0.28, maxLife: 0.28, color: '#b6e3ff' });
        break;
      case 'waveClear':
        this.flash(this.playerColor, 0.12);
        break;
      case 'bossSpawn':
        this.ring(e.x, e.y, COLORS.danger, 10, 200, 0.9, 5);
        this.shake(0.6);
        break;
      case 'bossPhase':
        this.ring(e.x, e.y, '#ffffff', 20, 160, 0.6, 4);
        this.burst(e.x, e.y, '#ffffff', 26, 260, 0.6, 5);
        this.shake(0.45);
        this.stop(0.08);
        break;
      case 'bossDeath':
        this.distort(e.x, e.y, 1.5, 1.1, 460);
        if (!this.calm && !this.settings.reducedMotion) this.aberration = 0.7;
        for (let i = 0; i < 4; i++) this.ring(e.x, e.y, i % 2 ? '#ffffff' : this.playerColor, 10, 120 + i * 70, 0.7 + i * 0.25, 5);
        this.burst(e.x, e.y, '#ffffff', 60, 420, 1.2, 7);
        this.burst(e.x, e.y, COLORS.shard, 40, 300, 1.4, 6);
        this.flash('#ffffff', 0.38);
        this.shake(1);
        this.stop(0.35);
        break;
      case 'bossAttack':
        this.ring(e.x, e.y, COLORS.danger, 60, 20, 0.5, 2);
        break;
      case 'blocked':
        this.ring(e.x, e.y, '#cfd8ff', 8, 26, 0.35, 2);
        break;
      case 'blink':
        this.ring(e.x, e.y, ENEMIES.blinker.color, 28, 4, 0.35, 2);
        this.burst(e.x, e.y, ENEMIES.blinker.color, 6, 90, 0.35, 3);
        break;
      case 'bombArmed':
        this.ring(e.x, e.y, '#ff6a1a', 6, 30, 0.4, 2);
        break;
      case 'thread': {
        const n = Math.round(10 * this.settings.density);
        for (let i = 0; i < n; i++) {
          const k = Math.random();
          this.burst(e.ax + (e.bx - e.ax) * k, e.ay + (e.by - e.ay) * k, '#c77dff', 1, 60, 0.4, 3);
        }
        break;
      }
      default:
        break;
    }
  }

  /** A ring that bends the picture as it travels outwards (only visible with the light filter). */
  distort(x: number, y: number, strength: number, life: number, maxR: number): void {
    if (this.calm || this.settings.reducedMotion) return;
    if (this.waves.length >= 6) this.waves.shift();
    this.waves.push({ x, y, age: 0, life, maxR, strength });
  }

  update(dt: number): void {
    this.time += dt;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      this.waves[i].age += dt;
      if (this.waves[i].age >= this.waves[i].life) this.waves.splice(i, 1);
    }
    this.aberration = Math.max(0, this.aberration - dt * 2.4);
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.active[i] = this.active[this.active.length - 1];
        this.active.pop();
        this.pool.push(p);
        continue;
      }
      if (p.drag) {
        const d = Math.exp(-p.drag * dt);
        p.vx *= d;
        p.vy *= d;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.spin) p.rot += p.spin * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const tx = this.texts[i];
      tx.life -= dt;
      tx.y += tx.vy * dt;
      tx.vy *= Math.exp(-2.5 * dt);
      if (tx.life <= 0) this.texts.splice(i, 1);
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      this.flashes[i].life -= dt;
      if (this.flashes[i].life <= 0) this.flashes.splice(i, 1);
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      this.bolts[i].life -= dt;
      if (this.bolts[i].life <= 0) this.bolts.splice(i, 1);
    }
    this.trauma = Math.max(0, this.trauma - dt * 1.7);
    this.screenFlash = Math.max(0, this.screenFlash - dt * 2.2);
    this.damagePulse = Math.max(0, this.damagePulse - dt * 1.5);
  }

  /** Screen-space shake offset in CSS pixels. */
  shakeOffset(): Vec {
    const s = this.trauma * this.trauma * 14;
    return { x: noise1(this.time * 28, 3) * s, y: noise1(this.time * 28, 7) * s };
  }

  clear(): void {
    for (const p of this.active) this.pool.push(p);
    this.active.length = 0;
    this.texts.length = 0;
    this.flashes.length = 0;
    this.bolts.length = 0;
    this.trauma = 0;
    this.hitstop = 0;
    this.screenFlash = 0;
    this.damagePulse = 0;
    this.waves.length = 0;
    this.aberration = 0;
  }

  /** Loop fill flashes – drawn below enemies so the caught shadows stay readable. */
  drawUnder(ctx: CanvasRenderingContext2D): void {
    ctx.globalCompositeOperation = 'lighter';
    for (const f of this.flashes) {
      const k = f.life / f.maxLife;
      ctx.beginPath();
      ctx.moveTo(f.poly[0].x, f.poly[0].y);
      for (let i = 1; i < f.poly.length; i++) ctx.lineTo(f.poly[i].x, f.poly[i].y);
      ctx.closePath();
      ctx.globalAlpha = 1;
      const calm = this.calm ? 0.35 : 1;
      ctx.fillStyle = rgba(f.color, (f.strong ? 0.3 : 0.12) * k * k * calm);
      ctx.fill();
      ctx.lineWidth = 1 + 3 * k;
      ctx.strokeStyle = rgba(lighten(f.color, 0.6), 0.65 * k * calm);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Particles and lightning bolts – in world coordinates. */
  draw(ctx: CanvasRenderingContext2D): void {
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.active) {
      const k = p.life / p.maxLife;
      if (p.kind === Kind.Spark) {
        drawGlow(ctx, p.color, p.x, p.y, p.size * (0.4 + 0.6 * k) * 2, k);
      } else if (p.kind === Kind.Shard) {
        // Dark fragment with a glowing edge, like the shadow bodies themselves.
        const s = p.size;
        ctx.globalAlpha = Math.min(1, k * 1.6);
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(p.rot) * s, p.y + Math.sin(p.rot) * s);
        ctx.lineTo(p.x + Math.cos(p.rot + 2.3) * s * 0.7, p.y + Math.sin(p.rot + 2.3) * s * 0.7);
        ctx.lineTo(p.x + Math.cos(p.rot + 4.1) * s * 0.8, p.y + Math.sin(p.rot + 4.1) * s * 0.8);
        ctx.closePath();
        ctx.fillStyle = 'rgba(30,18,50,0.9)';
        ctx.globalCompositeOperation = 'source-over';
        ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      } else if (p.kind === Kind.Streak) {
        ctx.globalAlpha = k;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.width;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05);
        ctx.stroke();
      } else {
        const r = p.size + (p.size2 - p.size) * (1 - k * k);
        ctx.globalAlpha = k;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.width * k + 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.1, r), 0, TAU);
        ctx.stroke();
      }
    }

    for (const b of this.bolts) {
      const k = b.life / b.maxLife;
      ctx.globalAlpha = k;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(b.pts[0].x, b.pts[0].y);
      for (let i = 1; i < b.pts.length; i++) ctx.lineTo(b.pts[i].x, b.pts[i].y);
      ctx.stroke();
      ctx.lineWidth = 7;
      ctx.globalAlpha = k * 0.25;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  drawTexts(ctx: CanvasRenderingContext2D): void {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const tx of this.texts) {
      const k = tx.life / tx.maxLife;
      const pop = k > 0.85 ? 1 + (k - 0.85) * 2.5 : 1;
      ctx.globalAlpha = Math.min(1, k * 2.2);
      ctx.font = `700 ${Math.round(tx.size * pop)}px "Outfit Variable", system-ui, sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(5,4,12,0.85)';
      ctx.strokeText(tx.text, tx.x, tx.y);
      ctx.fillStyle = tx.color;
      ctx.fillText(tx.text, tx.x, tx.y);
    }
    ctx.globalAlpha = 1;
  }
}

function jagged(ax: number, ay: number, bx: number, by: number): Vec[] {
  const pts: Vec[] = [{ x: ax, y: ay }];
  const n = 6;
  const dx = bx - ax;
  const dy = by - ay;
  const l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l;
  const ny = dx / l;
  for (let i = 1; i < n; i++) {
    const k = i / n;
    const off = (Math.random() - 0.5) * 18;
    pts.push({ x: ax + dx * k + nx * off, y: ay + dy * k + ny * off });
  }
  pts.push({ x: bx, y: by });
  return pts;
}
