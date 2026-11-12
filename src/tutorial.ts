import { t, type I18nKey } from './core/i18n';
import type { World } from './game/world';
import type { GameEvent } from './game/types';
import type { App } from './app';

const STEPS: I18nKey[] = ['tut.move', 'tut.loop', 'tut.catch', 'tut.multi', 'tut.pulse', 'tut.done'];

/**
 * Interactive onboarding inside a real (harmless) world: every step waits for the player
 * to actually perform the action before moving on.
 */
export class Tutorial {
  step = -1;
  private moved = 0;
  private lastX: number;
  private lastY: number;
  private advanceIn = -1;
  private spawned = false;
  private pulsed = false;

  constructor(
    private app: App,
    private w: World,
  ) {
    this.lastX = w.px;
    this.lastY = w.py;
    this.go(0);
  }

  private go(step: number): void {
    this.step = step;
    this.spawned = false;
    this.advanceIn = -1;
    const last = step === STEPS.length - 1;
    const key = step === 0 && this.app.save.data.settings.control === 'relative' ? 'tut.moveRelative' : STEPS[step];
    this.app.ui.tutorial(t(key), step, STEPS.length, last ? () => this.app.finishTutorial() : undefined);
  }

  private complete(): void {
    if (this.advanceIn >= 0) return;
    this.advanceIn = 0.8;
    this.app.audio.uiSelect();
    this.app.haptics.buzz(15);
  }

  onEvent(e: GameEvent): void {
    if (e.type === 'loop' && this.step === 1) this.complete();
    if (e.type === 'pulse' && this.step === 4) this.pulsed = true;
  }

  update(dt: number): void {
    const w = this.w;
    if (this.advanceIn >= 0) {
      this.advanceIn -= dt;
      if (this.advanceIn < 0 && this.step < STEPS.length - 1) this.go(this.step + 1);
      return;
    }
    switch (this.step) {
      case 0:
        this.moved += Math.hypot(w.px - this.lastX, w.py - this.lastY);
        this.lastX = w.px;
        this.lastY = w.py;
        if (this.moved > 420) this.complete();
        break;
      case 2:
        if (!this.spawned) {
          w.spawnDirect('mote', w.w / 2, w.h * 0.3, true);
          this.spawned = true;
        } else if (w.enemies.length === 0) this.complete();
        break;
      case 3:
        if (!this.spawned) {
          const cx = w.w / 2;
          const cy = w.h * 0.32;
          for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
            w.spawnDirect('mote', cx + Math.cos(a) * 26, cy + Math.sin(a) * 26, true);
          }
          this.spawned = true;
        } else if (w.enemies.length === 0) this.complete();
        break;
      case 4:
        if (!this.spawned) {
          w.pulseCharge = 1;
          this.ring(6);
          this.spawned = true;
        } else if (this.pulsed) {
          this.complete();
        } else if (w.enemies.length === 0) {
          // Player looped them all instead – offer another group.
          w.pulseCharge = 1;
          this.ring(5);
        }
        break;
      default:
        break;
    }
  }

  private ring(n: number): void {
    const w = this.w;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = Math.min(w.w - 20, Math.max(20, w.px + Math.cos(a) * 115));
      const y = Math.min(w.h - 20, Math.max(20, w.py + Math.sin(a) * 115));
      w.spawnDirect('mote', x, y);
    }
  }

  /** Dotted target circle drawn around the enemies the player should catch. */
  hint(): { x: number; y: number; r: number } | null {
    if ((this.step !== 2 && this.step !== 3) || this.w.enemies.length === 0) return null;
    let x = 0;
    let y = 0;
    for (const e of this.w.enemies) {
      x += e.x;
      y += e.y;
    }
    x /= this.w.enemies.length;
    y /= this.w.enemies.length;
    let r = 0;
    for (const e of this.w.enemies) r = Math.max(r, Math.hypot(e.x - x, e.y - y) + e.r);
    return { x, y, r: r + 34 };
  }
}
