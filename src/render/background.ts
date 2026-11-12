import { makeCanvas } from './sprites';
import { noise1 } from '../core/math';

interface Star {
  x: number;
  y: number;
  size: number;
  layer: number;
  phase: number;
  speed: number;
}

/** Nebula + parallax star dust, rendered in screen space behind the arena. */
export class Background {
  private nebula: HTMLCanvasElement | null = null;
  private stars: Star[] = [];
  private w = 0;
  private h = 0;

  constructor() {
    for (let i = 0; i < 150; i++) {
      const layer = i < 80 ? 0 : i < 125 ? 1 : 2;
      this.stars.push({
        x: Math.random(),
        y: Math.random(),
        size: layer === 0 ? 0.8 : layer === 1 ? 1.3 : 2,
        layer,
        phase: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 1.6,
      });
    }
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    // Low-res nebula, upscaled with smoothing – soft and cheap.
    const nw = 160;
    const nh = Math.max(1, Math.round((160 * h) / Math.max(1, w)));
    const c = makeCanvas(nw, nh);
    const g = c.getContext('2d')!;
    const base = g.createLinearGradient(0, 0, 0, nh);
    base.addColorStop(0, '#0b0820');
    base.addColorStop(0.55, '#070614');
    base.addColorStop(1, '#04030b');
    g.fillStyle = base;
    g.fillRect(0, 0, nw, nh);
    const blobs: [number, number, number, string][] = [
      [0.2, 0.18, 0.75, 'rgba(92,52,190,0.28)'],
      [0.85, 0.35, 0.6, 'rgba(30,110,170,0.20)'],
      [0.35, 0.8, 0.8, 'rgba(150,40,140,0.18)'],
      [0.75, 0.9, 0.55, 'rgba(40,60,160,0.22)'],
      [0.55, 0.5, 0.45, 'rgba(70,40,150,0.12)'],
    ];
    for (const [bx, by, br, col] of blobs) {
      const r = br * Math.max(nw, nh);
      const grad = g.createRadialGradient(bx * nw, by * nh, 0, bx * nw, by * nh, r);
      grad.addColorStop(0, col);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, nw, nh);
    }
    this.nebula = c;
  }

  /** `px, py` in [-1, 1] – player offset from the arena centre, drives parallax. */
  draw(ctx: CanvasRenderingContext2D, time: number, px: number, py: number, intensity: number): void {
    const { w, h } = this;
    if (this.nebula) {
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = true;
      // Slow breathing drift of the nebula.
      const dx = noise1(time * 0.05, 1) * 14 - px * 10;
      const dy = noise1(time * 0.05, 2) * 14 - py * 10;
      ctx.drawImage(this.nebula, dx - 20, dy - 20, w + 40, h + 40);
    }
    ctx.globalCompositeOperation = 'lighter';
    const par = [6, 16, 34];
    for (const s of this.stars) {
      const drift = time * 4 * (s.layer + 1);
      let x = s.x * w - px * par[s.layer];
      let y = ((s.y * h + drift) % (h + 10)) - py * par[s.layer];
      x = ((x % w) + w) % w;
      y = ((y % h) + h) % h;
      const tw = 0.45 + 0.55 * Math.sin(time * s.speed + s.phase);
      const a = (s.layer === 2 ? 0.75 : s.layer === 1 ? 0.5 : 0.32) * tw * (0.7 + 0.3 * intensity);
      ctx.fillStyle = s.layer === 2 ? `rgba(190,210,255,${a})` : `rgba(160,150,255,${a})`;
      ctx.fillRect(x, y, s.size, s.size);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}
