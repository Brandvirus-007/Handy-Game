import { hexToRgb } from './color';

/**
 * Pre-rendered radial glow sprites, drawn with additive blending. Far cheaper than
 * `shadowBlur` on mobile GPUs and gives a soft, consistent bloom look.
 */
const cache = new Map<string, HTMLCanvasElement>();
const SIZE = 64;

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function glowSprite(color: string, hot = false): HTMLCanvasElement {
  const key = color + (hot ? '#hot' : '');
  let c = cache.get(key);
  if (c) return c;
  c = makeCanvas(SIZE, SIZE);
  const g = c.getContext('2d')!;
  const [r, gg, b] = hexToRgb(color);
  const grad = g.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, SIZE / 2);
  if (hot) {
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.12, `rgba(${r},${gg},${b},0.95)`);
  } else {
    grad.addColorStop(0, `rgba(${r},${gg},${b},0.9)`);
  }
  grad.addColorStop(0.35, `rgba(${r},${gg},${b},0.32)`);
  grad.addColorStop(0.7, `rgba(${r},${gg},${b},0.08)`);
  grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, SIZE, SIZE);
  cache.set(key, c);
  return c;
}

let shade: HTMLCanvasElement | null = null;

/** Soft dark smoke: drawn normally (not additive) it swallows the light behind it. */
export function drawShade(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, alpha: number): void {
  if (alpha <= 0.003 || radius <= 0) return;
  if (!shade) {
    shade = makeCanvas(SIZE, SIZE);
    const g = shade.getContext('2d')!;
    const grad = g.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, SIZE / 2);
    grad.addColorStop(0, 'rgba(3,1,9,0.92)');
    grad.addColorStop(0.45, 'rgba(3,1,9,0.6)');
    grad.addColorStop(0.75, 'rgba(3,1,9,0.18)');
    grad.addColorStop(1, 'rgba(3,1,9,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, SIZE, SIZE);
  }
  ctx.globalAlpha = alpha > 1 ? 1 : alpha;
  ctx.drawImage(shade, x - radius, y - radius, radius * 2, radius * 2);
}

/** Draws a glow sprite centred at (x, y) with the given radius (current transform units). */
export function drawGlow(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, radius: number, alpha = 1, hot = false): void {
  if (alpha <= 0.003 || radius <= 0) return;
  const s = glowSprite(color, hot);
  ctx.globalAlpha = alpha > 1 ? 1 : alpha;
  ctx.drawImage(s, x - radius, y - radius, radius * 2, radius * 2);
}

export { makeCanvas };
