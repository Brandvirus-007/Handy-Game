import { TAU, clamp, easeOutBack, lerp } from '../core/math';
import { BIOMES, COLORS, ENEMIES, TWIN_COLORS, WARDEN_AURA } from '../game/config';
import { BLINK_WARN, DART_AIM, GHOST_FADE, SPITTER_CHARGE } from '../game/enemies';
import { HYDRA_TELEGRAPH, MAW_TELEGRAPH, VORTEX_PULL_RANGE, WEAVER_AIM, eyeRays, twinBeam } from '../game/bosses';
import type { World } from '../game/world';
import type { TrailDef } from '../game/trails';
import type { Enemy } from '../game/types';
import { Background } from './background';
import { Fx } from './fx';
import { drawGlow, drawShade, makeCanvas } from './sprites';
import { hsl, lighten, rgba } from './color';

export interface ArenaRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FrameParams {
  world: World | null;
  fx: Fx;
  time: number;
  color: string;
  trailColor: string;
  /** Spark look: plain colours, rainbow (Prism), solar corona or aurora ribbons. */
  look: 'plain' | 'rainbow' | 'solar' | 'aurora';
  /** Cosmetic trail design (overrides the trail colours, not the spark itself). */
  trail?: TrailDef;
  /** 0..1 darkening overlay (menus, upgrade screen). */
  dim: number;
  /** Tutorial target circle. */
  hint?: { x: number; y: number; r: number } | null;
  /** Menu demo: no arena frame, gentler presentation. */
  ambient?: boolean;
}

const BODY = '#0b0716';

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  dpr = 1;
  cssW = 1;
  cssH = 1;
  scale = 1;
  ox = 0;
  oy = 0;
  worldW = 420;
  worldH = 760;
  private bg = new Background();
  private biome = 0;
  /**
   * True while the WebGL filter draws the region background: the 2D frame then stays transparent
   * behind the arena and skips its own nebula and floor dots.
   */
  gpuBackground = false;

  get biomeIndex(): number {
    return this.biome;
  }

  setBiome(index: number): void {
    this.biome = index;
    this.bg.setBiome(index);
  }
  private grid: HTMLCanvasElement | null = null;
  private vignette: HTMLCanvasElement | null = null;

  constructor(readonly canvas: HTMLCanvasElement) {
    // Transparent canvas: with the WebGL filter on, the background shows through from below.
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.cssW = Math.max(1, cssW);
    this.cssH = Math.max(1, cssH);
    this.dpr = dpr;
    this.canvas.width = Math.round(this.cssW * dpr);
    this.canvas.height = Math.round(this.cssH * dpr);
    this.bg.resize(this.cssW, this.cssH);
    this.buildVignette();
    this.buildGrid();
  }

  /** Fits the world into the given CSS rect (centred, uniform scale). */
  layout(worldW: number, worldH: number, rect: ArenaRect): void {
    this.worldW = worldW;
    this.worldH = worldH;
    this.scale = Math.min(rect.w / worldW, rect.h / worldH);
    this.ox = rect.x + (rect.w - worldW * this.scale) / 2;
    this.oy = rect.y + (rect.h - worldH * this.scale) / 2;
    this.buildGrid();
  }

  private buildVignette(): void {
    const w = Math.max(2, Math.round(this.cssW / 2));
    const h = Math.max(2, Math.round(this.cssH / 2));
    const c = makeCanvas(w, h);
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    this.vignette = c;
  }

  private buildGrid(): void {
    const s = this.scale * this.dpr;
    const w = Math.max(2, Math.ceil(this.worldW * s));
    const h = Math.max(2, Math.ceil(this.worldH * s));
    const c = makeCanvas(w, h);
    const g = c.getContext('2d')!;
    g.scale(s, s);
    const step = 28;
    g.fillStyle = 'rgba(150,140,255,0.10)';
    for (let y = step / 2; y < this.worldH; y += step) {
      for (let x = step / 2; x < this.worldW; x += step) {
        g.beginPath();
        g.arc(x, y, 0.9, 0, TAU);
        g.fill();
      }
    }
    this.grid = c;
  }

  frame(p: FrameParams): void {
    const { ctx, dpr } = this;
    const { world, fx, time } = p;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (this.gpuBackground) {
      ctx.clearRect(0, 0, this.cssW, this.cssH);
    } else {
      ctx.fillStyle = COLORS.bg0;
      ctx.fillRect(0, 0, this.cssW, this.cssH);
      const ppx = world ? (world.px / world.w) * 2 - 1 : 0;
      const ppy = world ? (world.py / world.h) * 2 - 1 : 0;
      this.bg.draw(ctx, time, ppx, ppy, world ? 1 : 0.6);
    }

    const sh = fx.shakeOffset();
    const s = this.scale;
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (this.ox + sh.x), dpr * (this.oy + sh.y));

    if (world) {
      if (!p.ambient) this.drawArena(time, world);
      this.drawFrost(world);
      this.drawHazards(world, time);
      this.drawMarkers(world, time);
      this.drawTelegraphs(world, time);
      this.drawPickups(world, time);
      if (p.hint) this.drawHint(p.hint, time);
      fx.drawUnder(ctx);
      this.drawTrail(world, p);
      this.drawEnemies(world, time);
      this.drawProjectiles(world);
      this.drawPlayer(world, p);
      fx.draw(ctx);
      fx.drawTexts(ctx);
    } else {
      // Menu: ambient particles live in screen-space-like world units.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fx.draw(ctx);
    }

    // ── Screen-space overlays ──
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    if (this.vignette) {
      ctx.globalAlpha = 1;
      ctx.drawImage(this.vignette, 0, 0, this.cssW, this.cssH);
    }
    if (world) {
      const low = world.alive && world.hearts === 1 && !world.opts.tutorial && world.stats.maxHearts > 1;
      const danger = Math.max(fx.damagePulse * 0.55, low ? 0.16 + 0.1 * Math.sin(time * 4) : 0);
      if (danger > 0.01) this.redVignette(danger);
    }
    if (fx.screenFlash > 0.01) {
      ctx.globalAlpha = fx.screenFlash * 0.5;
      ctx.fillStyle = fx.screenFlashColor;
      ctx.fillRect(0, 0, this.cssW, this.cssH);
    }
    if (p.dim > 0.01) {
      ctx.globalAlpha = p.dim;
      ctx.fillStyle = '#05040c';
      ctx.fillRect(0, 0, this.cssW, this.cssH);
    }
    ctx.globalAlpha = 1;
  }

  private redVignette(a: number): void {
    const { ctx } = this;
    const g = ctx.createRadialGradient(this.cssW / 2, this.cssH / 2, Math.min(this.cssW, this.cssH) * 0.35, this.cssW / 2, this.cssH / 2, Math.max(this.cssW, this.cssH) * 0.7);
    g.addColorStop(0, 'rgba(255,40,80,0)');
    g.addColorStop(1, `rgba(255,40,80,${clamp(a, 0, 1)})`);
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.cssW, this.cssH);
  }

  // ───────────────────────── Arena ─────────────────────────

  private drawArena(time: number, w: World): void {
    const { ctx } = this;
    if (this.grid && !this.gpuBackground) {
      ctx.globalAlpha = 1;
      ctx.drawImage(this.grid, 0, 0, this.worldW, this.worldH);
    }
    const pulse = 0.5 + 0.5 * Math.sin(time * 1.3);
    const boss = w.plan?.boss && w.phase === 'active';
    const edge = boss ? '#ff4d6d' : BIOMES[this.biome]?.edge ?? '#7d6bff';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(edge, 0.07 + 0.04 * pulse);
    ctx.lineWidth = 8;
    roundRect(ctx, 0, 0, this.worldW, this.worldH, 14);
    ctx.stroke();
    ctx.strokeStyle = rgba(edge, 0.35);
    ctx.lineWidth = 1.2;
    roundRect(ctx, 0.5, 0.5, this.worldW - 1, this.worldH - 1, 14);
    ctx.stroke();
    // Bright corner accents.
    ctx.strokeStyle = rgba('#ffffff', 0.35);
    ctx.lineWidth = 2;
    const c = 22;
    const W = this.worldW;
    const H = this.worldH;
    ctx.beginPath();
    ctx.moveTo(0, c);
    ctx.lineTo(0, 0);
    ctx.lineTo(c, 0);
    ctx.moveTo(W - c, 0);
    ctx.lineTo(W, 0);
    ctx.lineTo(W, c);
    ctx.moveTo(W, H - c);
    ctx.lineTo(W, H);
    ctx.lineTo(W - c, H);
    ctx.moveTo(c, H);
    ctx.lineTo(0, H);
    ctx.lineTo(0, H - c);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawFrost(w: World): void {
    if (!w.frost.length) return;
    const { ctx } = this;
    for (const f of w.frost) {
      const k = clamp(f.life / f.maxLife, 0, 1);
      ctx.beginPath();
      ctx.moveTo(f.poly[0].x, f.poly[0].y);
      for (let i = 1; i < f.poly.length; i++) ctx.lineTo(f.poly[i].x, f.poly[i].y);
      ctx.closePath();
      ctx.globalAlpha = 1;
      ctx.fillStyle = rgba(COLORS.frost, 0.1 * Math.min(1, k * 3));
      ctx.fill();
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = rgba(COLORS.frost, 0.45 * Math.min(1, k * 3));
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  private drawHazards(w: World, time: number): void {
    const { ctx } = this;
    ctx.lineCap = 'round';
    for (const th of w.threads) {
      if (th.warn > 0) {
        ctx.setLineDash([3, 7]);
        ctx.globalAlpha = 0.5 + 0.3 * Math.sin(time * 30);
        ctx.strokeStyle = COLORS.threadWarn;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(th.ax, th.ay);
        ctx.lineTo(th.bx, th.by);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        const k = clamp(th.life / th.maxLife, 0, 1);
        const a = Math.min(1, k * 3);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.25 * a;
        ctx.strokeStyle = '#c77dff';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(th.ax, th.ay);
        ctx.lineTo(th.bx, th.by);
        ctx.stroke();
        ctx.globalAlpha = 0.9 * a;
        ctx.strokeStyle = '#efd6ff';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    // Warden auras.
    for (const e of w.enemies) {
      if (e.type !== 'warden' || e.dead) continue;
      const k = Math.min(1, e.t / 0.6);
      ctx.globalAlpha = 0.07 * k;
      ctx.fillStyle = '#cfd8ff';
      ctx.beginPath();
      ctx.arc(e.x, e.y, WARDEN_AURA, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.35 * k;
      ctx.strokeStyle = '#cfd8ff';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([2, 6]);
      ctx.lineDashOffset = -time * 12;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }
    // Bomb warnings.
    for (const b of w.bombs) {
      const p = 1 - b.t / b.total;
      ctx.globalAlpha = 0.15 + 0.35 * p + 0.2 * Math.sin(time * 40);
      ctx.fillStyle = 'rgba(255,106,26,0.18)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#ff6a1a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * p, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.stroke();
    }
    // Eye: telegraph rays while resting, deadly rays while firing.
    for (const ray of eyeRays(w, false)) {
      ctx.globalAlpha = 0.18 + 0.12 * Math.sin(time * 10);
      ctx.strokeStyle = '#ffcf3d';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([6, 10]);
      ctx.beginPath();
      ctx.moveTo(ray.ax, ray.ay);
      ctx.lineTo(ray.bx, ray.by);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const ray of eyeRays(w, true)) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = '#ffcf3d';
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(ray.ax, ray.ay);
      ctx.lineTo(ray.bx, ray.by);
      ctx.stroke();
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = '#fff6d6';
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }

    const beam = twinBeam(w);
    if (beam) {
      ctx.globalCompositeOperation = 'lighter';
      const grad = ctx.createLinearGradient(beam.ax, beam.ay, beam.bx, beam.by);
      grad.addColorStop(0, TWIN_COLORS[0]);
      grad.addColorStop(1, TWIN_COLORS[1]);
      // Crackling beam: a few jittered strands.
      for (let k = 0; k < 3; k++) {
        ctx.globalAlpha = k === 0 ? 0.25 : 0.7;
        ctx.strokeStyle = grad;
        ctx.lineWidth = k === 0 ? 9 : 1.4;
        ctx.beginPath();
        ctx.moveTo(beam.ax, beam.ay);
        const n = 8;
        const dx = beam.bx - beam.ax;
        const dy = beam.by - beam.ay;
        const l = Math.hypot(dx, dy) || 1;
        for (let i = 1; i < n; i++) {
          const j = k === 0 ? 0 : Math.sin(time * 40 + i * 2.1 + k * 3) * 4;
          ctx.lineTo(beam.ax + (dx * i) / n + (-dy / l) * j, beam.ay + (dy * i) / n + (dx / l) * j);
        }
        ctx.lineTo(beam.bx, beam.by);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }

  private drawMarkers(w: World, time: number): void {
    const { ctx } = this;
    for (const m of w.markers) {
      const p = 1 - m.t / m.total;
      const boss = m.flock === -1;
      const color = m.type === 'twin' ? TWIN_COLORS[0] : ENEMIES[m.type].color;
      const r = boss ? lerp(90, 30, p) : lerp(26, ENEMIES[m.type].r, p);
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, color, m.x, m.y, r * 1.4, 0.15 + 0.35 * p);
      ctx.globalAlpha = 0.35 + 0.6 * p;
      ctx.strokeStyle = color;
      ctx.lineWidth = boss ? 3 : 1.6;
      ctx.setLineDash(boss ? [10, 8] : [4, 4]);
      ctx.lineDashOffset = -time * 30;
      ctx.beginPath();
      ctx.arc(m.x, m.y, r, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
      // Inward ticks.
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + time * 2;
        ctx.moveTo(m.x + Math.cos(a) * (r + 5), m.y + Math.sin(a) * (r + 5));
        ctx.lineTo(m.x + Math.cos(a) * (r + 11), m.y + Math.sin(a) * (r + 11));
      }
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }

  private drawTelegraphs(w: World, time: number): void {
    const { ctx } = this;
    for (const e of w.enemies) {
      if (e.dead) continue;
      if (e.type === 'dart' && e.state === 1) {
        const p = 1 - e.timer / DART_AIM;
        ctx.globalAlpha = 0.25 + 0.6 * p;
        ctx.strokeStyle = COLORS.danger;
        ctx.lineWidth = 1 + 2 * p;
        ctx.setLineDash([6, 6]);
        ctx.lineDashOffset = -time * 60;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x + e.ax * 300, e.y + e.ay * 300);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (e.type === 'weaver' && e.state === 1) {
        const p = 1 - e.timer / WEAVER_AIM;
        ctx.globalAlpha = 0.3 + 0.6 * p;
        ctx.strokeStyle = '#c77dff';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 7]);
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.ax, e.ay);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(e.ax, e.ay, lerp(30, e.r, p), 0, TAU);
        ctx.stroke();
      } else if (e.type === 'blinker' && e.state === 1) {
        const p = 1 - e.timer / BLINK_WARN;
        ctx.globalAlpha = 0.3 + 0.6 * p;
        ctx.strokeStyle = ENEMIES.blinker.color;
        ctx.lineWidth = 1.6;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.arc(e.bx, e.by, lerp(26, e.r, p), 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (e.type === 'hydra' && e.state === 1) {
        const p = 1 - e.timer / HYDRA_TELEGRAPH;
        const a = Math.atan2(w.py - e.y, w.px - e.x);
        ctx.globalAlpha = 0.2 + 0.5 * p;
        ctx.strokeStyle = COLORS.danger;
        ctx.lineWidth = 1.5;
        for (let i = -2; i <= 2; i++) {
          const aa = a + i * 0.24;
          ctx.beginPath();
          ctx.moveTo(e.x + Math.cos(aa) * e.r, e.y + Math.sin(aa) * e.r);
          ctx.lineTo(e.x + Math.cos(aa) * (e.r + 60 * p + 10), e.y + Math.sin(aa) * (e.r + 60 * p + 10));
          ctx.stroke();
        }
      } else if (e.type === 'maw' && (e.state === 1 || e.state === 2)) {
        const p = e.state === 1 ? 1 - e.timer / MAW_TELEGRAPH : 1;
        ctx.globalAlpha = 0.3 + 0.6 * p;
        ctx.strokeStyle = COLORS.danger;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 6 + 30 * (1 - p), 0, TAU);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawPickups(w: World, time: number): void {
    const { ctx } = this;
    ctx.globalCompositeOperation = 'lighter';
    for (const p of w.pickups) {
      if (p.life < 3 && Math.sin(p.life * 22) < 0) continue;
      const big = p.kind === 'bigshard';
      const color = p.kind === 'heart' ? COLORS.heart : COLORS.shard;
      drawGlow(ctx, color, p.x, p.y, p.kind === 'heart' ? 18 : big ? 16 : 9, 0.7);
    }
    // Magnetised shards leave a short golden streak.
    ctx.strokeStyle = COLORS.shard;
    ctx.lineCap = 'round';
    for (const p of w.pickups) {
      if (!p.magnet || p.kind === 'heart') continue;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = p.kind === 'bigshard' ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.045, p.y - p.vy * 0.045);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    for (const p of w.pickups) {
      if (p.life < 3 && Math.sin(p.life * 22) < 0) continue;
      if (p.kind === 'heart') {
        const s = 5.5 + Math.sin(time * 6) * 0.6;
        ctx.fillStyle = COLORS.heart;
        heartPath(ctx, p.x, p.y, s);
        ctx.fill();
        continue;
      }
      const s = p.kind === 'bigshard' ? 5.2 : 3;
      const a = time * 3 + p.x * 0.1;
      ctx.fillStyle = p.kind === 'bigshard' ? '#fff1c4' : COLORS.shard;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const ang = a + (i * TAU) / 4;
        const rr = i % 2 ? s * 0.6 : s;
        ctx.lineTo(p.x + Math.cos(ang) * rr, p.y + Math.sin(ang) * rr);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawHint(h: { x: number; y: number; r: number }, time: number): void {
    const { ctx } = this;
    ctx.globalAlpha = 0.45 + 0.35 * Math.sin(time * 4);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 9]);
    ctx.lineDashOffset = -time * 40;
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.r, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    // Arrow head travelling along the circle shows the drawing direction.
    const a = time * 2.2;
    const ax = h.x + Math.cos(a) * h.r;
    const ay = h.y + Math.sin(a) * h.r;
    const tx = -Math.sin(a);
    const ty = Math.cos(a);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(ax + tx * 9, ay + ty * 9);
    ctx.lineTo(ax - tx * 5 + Math.cos(a) * 6, ay - ty * 5 + Math.sin(a) * 6);
    ctx.lineTo(ax - tx * 5 - Math.cos(a) * 6, ay - ty * 5 - Math.sin(a) * 6);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ───────────────────────── Trail & player ─────────────────────────

  private drawTrail(w: World, p: FrameParams): void {
    const pts = w.trail.points;
    if (pts.length < 2) return;
    const { ctx } = this;
    const n = pts.length;
    const life = w.trail.life;
    const ember = w.stats.ember > 0;
    const design = p.trail && p.trail.id !== 'default' ? p.trail : null;
    const glowColor = design?.glow ?? (ember && w.opts.character !== 'ember' ? '#ff6a2a' : p.trailColor);
    const coreColor = design?.core ?? p.color;
    // A chosen design decides the colours; otherwise the spark's own look does.
    const look = design ? (design.style === 'rainbow' ? 'rainbow' : 'plain') : p.look;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'lighter';
    const CH = 6;
    for (let pass = 0; pass < 2; pass++) {
      for (let s = 0; s < n - 1; s += CH) {
        const e = Math.min(n - 1, s + CH);
        const age = (w.time - pts[s].t) / life;
        const fade = clamp(1 - age, 0, 1);
        const pos = e / (n - 1);
        const a = fade * (0.2 + 0.8 * pos);
        if (a <= 0.01) continue;
        ctx.beginPath();
        ctx.moveTo(pts[s].x, pts[s].y);
        for (let k = s + 1; k <= e; k++) ctx.lineTo(pts[k].x, pts[k].y);
        if (e === n - 1) ctx.lineTo(w.px, w.py);
        const hue =
          look === 'rainbow'
            ? (p.time * 120 + s * 6) % 360
            : look === 'aurora'
              ? 150 + 125 * (0.5 + 0.5 * Math.sin(p.time * 1.6 - s * 0.045))
              : 0;
        const tinted = look === 'rainbow' || look === 'aurora';
        const segGlow = design?.style === 'alternate' && design.alt && Math.floor(s / 18) % 2 ? design.alt : glowColor;
        const flicker = design?.style === 'flicker' ? 0.75 + 0.25 * Math.sin(p.time * 22 + s * 0.7) : 1;
        if (pass === 0) {
          ctx.globalAlpha = 1;
          ctx.lineWidth = (ember ? 12 : look === 'aurora' ? 13 : 9) * (0.45 + 0.55 * pos);
          ctx.strokeStyle = tinted
            ? hsl(hue, 100, 60, a * (look === 'aurora' ? 0.36 : 0.3))
            : rgba(segGlow, a * (ember || design ? 0.42 : 0.32) * flicker);
        } else {
          ctx.globalAlpha = 1;
          ctx.lineWidth = 2.6 * (0.35 + 0.65 * pos);
          ctx.strokeStyle = tinted ? hsl(hue, 100, 82, a) : rgba(coreColor, a);
        }
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  private drawPlayer(w: World, p: FrameParams): void {
    if (!w.alive) return;
    const { ctx } = this;
    const { px, py } = w;
    const blink = w.invuln > 0 && Math.sin(p.time * 32) < 0;
    const auroraHue = 150 + 125 * (0.5 + 0.5 * Math.sin(p.time * 1.6));
    const color = p.look === 'rainbow' ? hsl(p.time * 120, 100, 75) : p.look === 'aurora' ? hsl(auroraHue, 100, 80) : p.color;
    const glowColor = p.look === 'rainbow' ? '#c38bff' : p.look === 'aurora' ? hsl(auroraHue, 100, 62) : p.color;
    ctx.globalCompositeOperation = 'lighter';
    const ready = w.pulseReady;
    if (p.look === 'solar') this.drawCorona(px, py, p.time, blink);
    if (p.look === 'aurora') {
      // Slow counter-rotating veils.
      for (let i = 0; i < 2; i++) {
        const a = p.time * (i ? -0.9 : 0.7) + i * 2;
        drawGlow(ctx, hsl(auroraHue + (i ? 60 : -40), 100, 60), px + Math.cos(a) * 9, py + Math.sin(a) * 9, 30, blink ? 0.2 : 0.45);
      }
    }
    drawGlow(ctx, glowColor, px, py, 34 + (ready ? 6 * Math.sin(p.time * 8) : 0), blink ? 0.35 : 0.9);
    drawGlow(ctx, '#ffffff', px, py, 11, blink ? 0.4 : 1, true);
    // Three tiny motes orbiting the spark.
    for (let i = 0; i < 3; i++) {
      const a = p.time * 3.2 + (i * TAU) / 3;
      const rr = 11 + Math.sin(p.time * 5 + i) * 2;
      drawGlow(ctx, glowColor, px + Math.cos(a) * rr, py + Math.sin(a) * rr * 0.8, 3.2, blink ? 0.3 : 0.85, true);
    }
    // Light satellites (upgrade) – real hitboxes, so they get a clear core and a faint orbit line.
    const sats = w.orbiterPositions();
    if (sats.length > 0) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = glowColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.arc(px, py, w.stats.orbitRadius, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'lighter';
      for (const o of sats) {
        drawGlow(ctx, w.stats.galaxy ? '#ffd6ff' : glowColor, o.x, o.y, 19, 0.9);
        drawGlow(ctx, '#ffffff', o.x, o.y, 7, 1, true);
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    ctx.globalAlpha = blink ? 0.45 : 1;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(px, py, 4.6, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(px, py, 7.5, 0, TAU);
    ctx.stroke();

    // Pulse charge arc.
    if (!w.stats.noPulse) {
      const r = 13;
      ctx.lineCap = 'round';
      if (ready) {
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(p.time * 8);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, TAU);
        ctx.stroke();
      } else if (w.pulseCharge > 0.01) {
        ctx.globalAlpha = 0.25;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, py, r, -Math.PI / 2, -Math.PI / 2 + TAU * w.pulseCharge);
        ctx.stroke();
      }
    }

    if (w.shieldUp) {
      ctx.globalAlpha = 0.55 + 0.15 * Math.sin(p.time * 3);
      ctx.strokeStyle = COLORS.shield;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, 17, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = COLORS.shield;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Sonnenkern: slowly turning corona rays. */
  private drawCorona(px: number, py: number, time: number, blink: boolean): void {
    const { ctx } = this;
    const n = 10;
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const a = time * 0.6 + (i * TAU) / n;
      const len = 15 + 5 * Math.sin(time * 4 + i * 1.7);
      ctx.globalAlpha = blink ? 0.2 : 0.55;
      ctx.strokeStyle = i % 2 ? '#ffb347' : '#fff1a8';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(px + Math.cos(a) * 10, py + Math.sin(a) * 10);
      ctx.lineTo(px + Math.cos(a) * (10 + len), py + Math.sin(a) * (10 + len));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    drawGlow(ctx, '#ff8a2a', px, py, 46, blink ? 0.2 : 0.45);
  }

  private drawProjectiles(w: World): void {
    const { ctx } = this;
    ctx.globalCompositeOperation = 'lighter';
    for (const p of w.projectiles) drawGlow(ctx, COLORS.projectile, p.x, p.y, p.r * 3.2, 0.85);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffe3ea';
    for (const p of w.projectiles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 0.55, 0, TAU);
      ctx.fill();
    }
  }

  // ───────────────────────── Enemies ─────────────────────────

  private drawEnemies(w: World, time: number): void {
    const { ctx } = this;
    // Shadows swallow light: a dark, smoky halo with wisps drifting off behind them.
    ctx.globalCompositeOperation = 'source-over';
    for (const e of w.enemies) {
      const spawn = Math.min(1, e.t / 0.3);
      const seen = e.type === 'ghost' ? (e.state === 0 ? 1 : 0.25) : 1;
      const k = spawn * seen;
      drawShade(ctx, e.x, e.y, e.r * (e.boss ? 1.7 : 2.3), (e.boss ? 0.7 : 0.8) * k);
      if (e.r < 5) continue;
      const sp = Math.hypot(e.vx, e.vy);
      const dx = sp > 4 ? -e.vx / sp : 0;
      const dy = sp > 4 ? -e.vy / sp : -1;
      for (let i = 0; i < 3; i++) {
        const ph = (time * 0.6 + i / 3 + e.seed * 0.137) % 1;
        const dist = e.r * (0.5 + 1.7 * ph);
        const wob = Math.sin(time * 2.6 + i * 2.1 + e.seed) * e.r * 0.4 * ph;
        drawShade(ctx, e.x + dx * dist - dy * wob, e.y + dy * dist + dx * wob, e.r * (1.05 - 0.55 * ph), 0.5 * (1 - ph) * k);
      }
    }
    // A thin rim of colour keeps the kinds apart.
    ctx.globalCompositeOperation = 'lighter';
    for (const e of w.enemies) {
      const color = enemyColor(e);
      const spawn = Math.min(1, e.t / 0.3);
      const charge = e.type === 'spitter' && e.state === 1 ? 1 - e.timer / SPITTER_CHARGE : 0;
      drawGlow(ctx, color, e.x, e.y, e.r * (e.boss ? 2.2 : 2.0) * (1 + charge * 0.6), (0.26 + charge * 0.45) * spawn);
      if (e.elite) drawGlow(ctx, COLORS.shard, e.x, e.y, e.r * 3.0, 0.25 * spawn);
    }
    ctx.globalCompositeOperation = 'source-over';

    for (const e of w.enemies) {
      const spawn = easeOutBack(Math.min(1, e.t / 0.3));
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.scale(spawn, spawn);
      this.drawEnemyShape(e, w, time);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  private drawEnemyShape(e: Enemy, w: World, time: number): void {
    const { ctx } = this;
    const color = enemyColor(e);
    const r = e.r;
    const look = Math.atan2(w.py - e.y, w.px - e.x);
    const fill = e.hitFlash > 0 ? lighten(BODY, e.hitFlash * 0.9) : BODY;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.fillStyle = fill;

    switch (e.type) {
      case 'mote': {
        // Flapping wings behind the body.
        const flap = Math.abs(Math.sin(e.t * 11 + e.seed));
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = rgba(color, 0.55);
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(side * r * 0.9, -r * 0.1, r * 0.75, r * (0.25 + 0.4 * flap), side * 0.5, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = fill;
        ctx.beginPath();
        for (let i = 0; i <= 14; i++) {
          const a = (i / 14) * TAU;
          const rr = r * (1 + 0.08 * Math.sin(a * 3 + e.t * 4));
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        eyes(ctx, look, r * 0.42, r * 0.28, r * 0.12);
        break;
      }
      case 'mini':
      case 'gnat': {
        const a = Math.atan2(e.vy, e.vx);
        ctx.rotate(a);
        ctx.beginPath();
        if (e.type === 'gnat') {
          ctx.moveTo(r * 1.5, 0);
          ctx.lineTo(0, r * 0.8);
          ctx.lineTo(-r, 0);
          ctx.lineTo(0, -r * 0.8);
        } else {
          ctx.arc(0, 0, r, 0, TAU);
        }
        ctx.closePath();
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(r * 0.35, 0, Math.max(1, r * 0.22), 0, TAU);
        ctx.fill();
        break;
      }
      case 'dart': {
        const a = e.state === 1 || e.state === 2 ? Math.atan2(e.ay, e.ax) : Math.atan2(e.vy, e.vx) || look;
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(r * 1.5, 0);
        ctx.lineTo(-r, r * 0.95);
        ctx.lineTo(-r * 0.45, 0);
        ctx.lineTo(-r, -r * 0.95);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = e.state === 1 ? '#ffffff' : color;
        ctx.beginPath();
        ctx.arc(r * 0.35, 0, r * 0.22, 0, TAU);
        ctx.fill();
        break;
      }
      case 'cutter': {
        const spin = e.stun > 0 ? e.t * 2 : e.t * 9;
        ctx.save();
        ctx.rotate(spin);
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * TAU;
          ctx.lineTo(Math.cos(a) * r * 1.35, Math.sin(a) * r * 1.35);
          ctx.lineTo(Math.cos(a + 0.55) * r * 0.45, Math.sin(a + 0.55) * r * 0.45);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = BODY;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.45, 0, TAU);
        ctx.fill();
        eyes(ctx, look, r * 0.2, r * 0.15, r * 0.08);
        if (e.stun > 0) dizzy(ctx, r, time, color);
        break;
      }
      case 'splitter': {
        ctx.save();
        ctx.rotate(e.t * 0.8);
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * TAU;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42, r * 0.62, 0, TAU);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
        ctx.fillStyle = BODY;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.5, 0, TAU);
        ctx.fill();
        eyes(ctx, look, r * 0.25, r * 0.17, r * 0.08);
        break;
      }
      case 'brute': {
        ctx.save();
        ctx.rotate(e.t * 0.3);
        hexPath(ctx, r);
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.lineWidth = 1.5;
        hexPath(ctx, r * 0.62);
        ctx.stroke();
        // Cracks appear as the armour takes damage.
        if (e.hp < e.maxHp) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.4;
          ctx.globalAlpha = 0.85;
          ctx.beginPath();
          ctx.moveTo(-r * 0.7, -r * 0.2);
          ctx.lineTo(-r * 0.2, 0);
          ctx.lineTo(-r * 0.35, r * 0.45);
          ctx.moveTo(r * 0.5, -r * 0.6);
          ctx.lineTo(r * 0.15, -r * 0.15);
          ctx.lineTo(r * 0.6, r * 0.2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        ctx.restore();
        eyes(ctx, look, r * 0.3, r * 0.2, r * 0.09);
        break;
      }
      case 'spitter': {
        const a = e.state === 1 ? Math.atan2(e.ay, e.ax) : look;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.save();
        ctx.rotate(a);
        ctx.fillStyle = color;
        ctx.fillRect(r * 0.55, -r * 0.3, r * 0.75, r * 0.6);
        ctx.restore();
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.6, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
        eyes(ctx, look, r * 0.25, r * 0.2, r * 0.1, true);
        break;
      }
      case 'maw': {
        const enraged = e.phase > 0;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.stroke();
        // Rotating ring of teeth.
        ctx.save();
        ctx.rotate(e.angle);
        ctx.fillStyle = color;
        const teeth = 14;
        ctx.beginPath();
        for (let i = 0; i < teeth; i++) {
          const a0 = (i / teeth) * TAU;
          const a1 = ((i + 0.5) / teeth) * TAU;
          const a2 = ((i + 1) / teeth) * TAU;
          ctx.moveTo(Math.cos(a0) * r * 0.9, Math.sin(a0) * r * 0.9);
          ctx.lineTo(Math.cos(a1) * r * 0.55, Math.sin(a1) * r * 0.55);
          ctx.lineTo(Math.cos(a2) * r * 0.9, Math.sin(a2) * r * 0.9);
        }
        ctx.fill();
        ctx.restore();
        const core = 0.5 + 0.5 * Math.sin(time * (enraged ? 9 : 5));
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, color, 0, 0, r * 0.6, 0.6 + 0.4 * core, true);
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'weaver': {
        // Eight animated legs.
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU + Math.sin(e.t * 6 + i) * 0.15;
          const knee = r * 1.55;
          const foot = r * 2.2 + Math.sin(e.t * 8 + i * 1.7) * 4;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7);
          ctx.quadraticCurveTo(Math.cos(a + 0.25) * knee, Math.sin(a + 0.25) * knee, Math.cos(a) * foot, Math.sin(a) * foot);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.stroke();
        // Many small eyes.
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 6; i++) {
          const a = look - 0.7 + (i % 3) * 0.7;
          const rr = i < 3 ? r * 0.45 : r * 0.7;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, i < 3 ? 2.4 : 1.6, 0, TAU);
          ctx.fill();
        }
        break;
      }
      case 'twin': {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.7, e.t, e.t + Math.PI * 1.4);
        ctx.stroke();
        ctx.globalAlpha = 1;
        // One large eye.
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.42, r * 0.3, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = BODY;
        ctx.beginPath();
        ctx.arc(Math.cos(look) * r * 0.16, Math.sin(look) * r * 0.1, r * 0.16, 0, TAU);
        ctx.fill();
        if (e.stun > 0) dizzy(ctx, r, time, color);
        break;
      }
      case 'warden': {
        // Shield-bearer: a rounded diamond with an inner ring.
        ctx.save();
        ctx.rotate(Math.sin(e.t) * 0.3);
        ctx.beginPath();
        ctx.moveTo(0, -r * 1.25);
        ctx.quadraticCurveTo(r * 1.1, -r * 0.2, 0, r * 1.25);
        ctx.quadraticCurveTo(-r * 1.1, -r * 0.2, 0, -r * 1.25);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.55, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
        eyes(ctx, look, r * 0.22, r * 0.17, r * 0.08);
        break;
      }
      case 'blinker': {
        const fade = e.state === 1 ? 0.35 + 0.65 * (e.timer / BLINK_WARN) : e.state === 2 ? 0.6 : 1;
        ctx.globalAlpha = fade;
        ctx.save();
        ctx.rotate(e.t * 3);
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU;
          const rr = i % 2 ? r * 0.55 : r * 1.2;
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(Math.cos(look) * r * 0.2, Math.sin(look) * r * 0.2, r * 0.22, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }
      case 'bouncer': {
        // Speed streaks behind the ball show where it is heading.
        const back = e.angle + Math.PI;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 2;
        for (let i = -1; i <= 1; i++) {
          const a = back + i * 0.35;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r * 1.1, Math.sin(a) * r * 1.1);
          ctx.lineTo(Math.cos(a) * r * (2 - Math.abs(i) * 0.4), Math.sin(a) * r * (2 - Math.abs(i) * 0.4));
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.55, 0, TAU);
        ctx.globalAlpha = 0.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
        eyes(ctx, e.angle, r * 0.28, r * 0.17, r * 0.08, true);
        break;
      }
      case 'ghost': {
        // Fades out and in; while invisible only a faint outline is left.
        const fade =
          e.state === 0 ? 1 : e.state === 1 ? 0.15 + 0.85 * (e.timer / GHOST_FADE) : e.state === 2 ? 0.15 : 0.15 + 0.85 * (1 - e.timer / GHOST_FADE);
        ctx.globalAlpha = fade;
        ctx.beginPath();
        ctx.arc(0, -r * 0.15, r, Math.PI, 0);
        const waves = 4;
        for (let i = 0; i <= waves * 2; i++) {
          const x = r - (i / (waves * 2)) * r * 2;
          const y = r * 0.85 + (i % 2 ? -r * 0.22 : 0) + Math.sin(e.t * 6 + i) * r * 0.06;
          ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        eyes(ctx, look, r * 0.3, r * 0.18, r * 0.08);
        ctx.globalAlpha = 1;
        break;
      }
      case 'vortex': {
        const arms = e.phase > 0 ? 3 : 2;
        // Faint ring: how far the pull reaches.
        ctx.globalAlpha = 0.07;
        ctx.setLineDash([6, 10]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, VORTEX_PULL_RANGE, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        // Swirling arms around a dark core.
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 3;
        for (let k = 0; k < arms; k++) {
          ctx.beginPath();
          for (let i = 0; i <= 24; i++) {
            const tt = i / 24;
            const a = e.angle + (k * TAU) / arms + tt * 2.4;
            const rr = r * (0.35 + tt * 1.05);
            ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.6, 0, TAU);
        ctx.fill();
        ctx.stroke();
        eyes(ctx, look, r * 0.24, r * 0.15, r * 0.07, true);
        break;
      }
      case 'bomber': {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.fill();
        ctx.stroke();
        // Fuse with a flickering spark.
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(r * 0.5, -r * 0.8);
        ctx.quadraticCurveTo(r * 0.9, -r * 1.4, r * 0.4, -r * 1.6);
        ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, '#ffd166', r * 0.4, -r * 1.6, 6 + 3 * Math.sin(time * 30), 0.9, true);
        ctx.globalCompositeOperation = 'source-over';
        eyes(ctx, look, r * 0.3, r * 0.2, r * 0.09, true);
        break;
      }
      case 'hydra':
      case 'head': {
        const head = e.type === 'head';
        // Scaled serpent body: overlapping circles with a crest.
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.lineWidth = 1.2;
        ctx.globalAlpha = 0.6;
        for (let i = 0; i < (head ? 3 : 5); i++) {
          const a = (i / (head ? 3 : 5)) * TAU + e.t * 0.6;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.28, 0, TAU);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // Crest spikes.
        ctx.fillStyle = color;
        for (let i = 0; i < (head ? 3 : 5); i++) {
          const a = look + Math.PI + (i - (head ? 1 : 2)) * 0.35;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a - 0.12) * r, Math.sin(a - 0.12) * r);
          ctx.lineTo(Math.cos(a) * r * 1.45, Math.sin(a) * r * 1.45);
          ctx.lineTo(Math.cos(a + 0.12) * r, Math.sin(a + 0.12) * r);
          ctx.fill();
        }
        eyes(ctx, look, r * 0.32, r * 0.18, r * 0.08, true);
        break;
      }
      case 'eye': {
        const firing = e.state === 1;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.stroke();
        // Lids.
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.78, r * (firing ? 0.5 : 0.18 + 0.1 * Math.sin(time * 2)), e.angle, 0, TAU);
        ctx.fill();
        // Iris follows the beam direction.
        const ia = e.angle;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(Math.cos(ia) * r * 0.32, Math.sin(ia) * r * 0.32, r * (firing ? 0.3 : 0.16), 0, TAU);
        ctx.fill();
        ctx.fillStyle = BODY;
        ctx.beginPath();
        ctx.arc(Math.cos(ia) * r * 0.36, Math.sin(ia) * r * 0.36, r * (firing ? 0.13 : 0.08), 0, TAU);
        ctx.fill();
        break;
      }
    }

    if (e.elite) {
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = COLORS.shard;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, r + 5, e.t * 2, e.t * 2 + TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    if (e.shielded && e.type !== 'ghost') {
      ctx.globalAlpha = 0.5 + 0.2 * Math.sin(time * 6 + e.seed);
      ctx.strokeStyle = '#cfd8ff';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, r + 6, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = '#cfd8ff';
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (e.slow < 1) {
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = COLORS.frost;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, r + 3, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (e.emberAcc > 0) {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, '#ff6a2a', 0, 0, r * 1.6, Math.min(0.8, e.emberAcc * 1.5));
      ctx.globalCompositeOperation = 'source-over';
    }
  }
}

function enemyColor(e: Enemy): string {
  if (e.type === 'twin') return TWIN_COLORS[e.seed ? 1 : 0];
  return ENEMIES[e.type].color;
}

function eyes(ctx: CanvasRenderingContext2D, look: number, spacing: number, size: number, pupil: number, angry = false): void {
  const px = Math.cos(look);
  const py = Math.sin(look);
  const nx = -py;
  const ny = px;
  for (const side of [-1, 1]) {
    const ex = nx * spacing * side * 0.9 + px * size * 0.6;
    const ey = ny * spacing * side * 0.9 + py * size * 0.6;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex, ey, size, 0, TAU);
    ctx.fill();
    ctx.fillStyle = BODY;
    ctx.beginPath();
    ctx.arc(ex + px * pupil, ey + py * pupil, Math.max(0.8, pupil * 1.3), 0, TAU);
    ctx.fill();
    if (angry) {
      ctx.strokeStyle = BODY;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ex - nx * size * side - px * size, ey - ny * size * side - py * size);
      ctx.lineTo(ex + nx * size * side - px * size * 0.4, ey + ny * size * side - py * size * 0.4);
      ctx.stroke();
    }
  }
}

function dizzy(ctx: CanvasRenderingContext2D, r: number, time: number, color: string): void {
  ctx.fillStyle = color;
  for (let i = 0; i < 3; i++) {
    const a = time * 5 + (i * TAU) / 3;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * (r + 6), Math.sin(a) * (r + 6) * 0.5 - r * 0.6, 1.6, 0, TAU);
    ctx.fill();
  }
}

function hexPath(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
}

export function heartPath(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s * 0.7, y - s * 1.3, x, y - s * 0.45);
  ctx.bezierCurveTo(x + s * 0.7, y - s * 1.3, x + s * 1.6, y - s * 0.2, x, y + s * 0.9);
  ctx.closePath();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
