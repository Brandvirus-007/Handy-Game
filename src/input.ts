export interface InputHandlers {
  drag(dx: number, dy: number): void;
  /** Absolute finger position (CSS px) on touch-down and while dragging. */
  point(x: number, y: number): void;
  pulse(): void;
  pause(): void;
  gesture(): void;
}

/**
 * Pointer + keyboard input. Reports both finger deltas (trackpad mode) and absolute positions
 * (direct mode, spark above the finger); the app decides which one steers.
 * Double-tap or a second finger triggers the pulse.
 */
export class Input {
  enabled = false;
  private primary: number | null = null;
  private lastX = 0;
  private lastY = 0;
  private downTime = 0;
  private moved = 0;
  private lastTapUp = 0;
  private lastTapX = 0;
  private lastTapY = 0;
  private keys = new Set<string>();

  constructor(
    private target: HTMLElement,
    private h: InputHandlers,
  ) {
    target.addEventListener('pointerdown', this.onDown, { passive: false });
    target.addEventListener('pointermove', this.onMove, { passive: false });
    target.addEventListener('pointerup', this.onUp);
    target.addEventListener('pointercancel', this.onUp);
    target.addEventListener('lostpointercapture', this.onUp);
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.primary = null;
    });
    // Any first interaction anywhere unlocks audio.
    const unlock = () => this.h.gesture();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
  }

  private onDown = (e: PointerEvent): void => {
    e.preventDefault();
    if (!this.enabled) return;
    const now = performance.now();
    if (this.primary !== null && e.pointerId !== this.primary) {
      // Second finger while steering → pulse.
      this.h.pulse();
      return;
    }
    if (now - this.lastTapUp < 300 && Math.hypot(e.clientX - this.lastTapX, e.clientY - this.lastTapY) < 48) {
      this.h.pulse();
      this.lastTapUp = 0;
    }
    this.primary = e.pointerId;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.downTime = now;
    this.moved = 0;
    this.h.point(e.clientX, e.clientY);
    try {
      this.target.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  private onMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.primary) return;
    e.preventDefault();
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.moved += Math.abs(dx) + Math.abs(dy);
    if (this.enabled) {
      this.h.drag(dx, dy);
      this.h.point(e.clientX, e.clientY);
    }
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.primary) return;
    this.primary = null;
    const now = performance.now();
    if (now - this.downTime < 230 && this.moved < 16) {
      this.lastTapUp = now;
      this.lastTapX = e.clientX;
      this.lastTapY = e.clientY;
    } else {
      this.lastTapUp = 0;
    }
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
    this.keys.add(e.code);
    if (!e.repeat && (e.code === 'Space' || e.code === 'Enter') && this.enabled) {
      e.preventDefault();
      this.h.pulse();
    }
    if (!e.repeat && (e.code === 'Escape' || e.code === 'KeyP')) this.h.pause();
  };

  keyboard(): { x: number; y: number } {
    const k = this.keys;
    const x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const y = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
    return { x, y };
  }

  reset(): void {
    this.primary = null;
    this.lastTapUp = 0;
  }
}
