/** Vibration feedback. The sink is the platform (Capacitor Haptics on Android, Vibration API in browsers). */
export class Haptics {
  enabled = true;
  sink: (pattern: number | number[]) => void = (p) => {
    try {
      navigator.vibrate?.(p);
    } catch {
      /* unsupported */
    }
  };
  private last = 0;

  buzz(pattern: number | number[], minGapMs = 40): void {
    if (!this.enabled) return;
    const now = performance.now();
    if (now - this.last < minGapMs) return;
    this.last = now;
    this.sink(pattern);
  }
}
