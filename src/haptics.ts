/** Thin wrapper over the Vibration API (Android browsers; silently ignored elsewhere). */
export class Haptics {
  enabled = true;
  private last = 0;

  buzz(pattern: number | number[], minGapMs = 40): void {
    if (!this.enabled) return;
    const now = performance.now();
    if (now - this.last < minGapMs) return;
    this.last = now;
    try {
      navigator.vibrate?.(pattern);
    } catch {
      /* unsupported */
    }
  }
}
