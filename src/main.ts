import '@fontsource-variable/outfit';
import './ui/styles.css';
import { App } from './app';
import { isNative } from './platform';

function registerServiceWorker(): void {
  // The Android app ships its files locally – a service worker would only get in the way of updates.
  if (__SINGLE_FILE__ || import.meta.env.DEV || isNative()) return;
  try {
    if (!('serviceWorker' in navigator)) return;
    const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!secure) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => undefined);
    });
  } catch {
    /* sandboxed contexts may forbid service workers */
  }
}

function start(): void {
  const canvas = document.getElementById('game') as HTMLCanvasElement | null;
  if (!canvas) return;
  const app = new App(canvas);
  // Wait for the display font so canvas texts render with it from the first frame.
  const fonts = document.fonts?.load ? Promise.race([document.fonts.load('700 16px "Outfit Variable"'), new Promise((r) => setTimeout(r, 800))]) : Promise.resolve();
  fonts.catch(() => undefined).finally(() => {
    void app.boot();
    document.body.classList.add('ready');
    if (import.meta.env.DEV) (window as unknown as { app: App }).app = app;
  });
}

registerServiceWorker();
start();
