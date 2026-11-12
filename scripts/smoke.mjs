// Browser smoke test on an emulated phone (Pixel 7, German locale): loads the production
// build, runs the tutorial, plays with pointer input, pauses, and fails on any console error.
// Screenshots are written to $SMOKE_OUT (default ./smoke-output).
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const OUT = process.env.SMOKE_OUT || 'smoke-output';
const PORT = 4199;
mkdirSync(OUT, { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', detached: true });
const stopServer = () => {
  try {
    process.kill(-server.pid);
  } catch {
    /* already gone */
  }
};
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('preview server did not start')), 20000);
  server.stdout.on('data', (d) => {
    if (String(d).includes(String(PORT))) {
      clearTimeout(timer);
      resolve();
    }
  });
});

const errors = [];
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'de-DE' });
  const page = await context.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
  const sleep = (ms) => page.waitForTimeout(ms);
  const vp = page.viewportSize();

  async function circles(cx, cy, r, turns, msPerTurn = 700) {
    const steps = 36;
    await page.mouse.move(cx + r, cy);
    await page.mouse.down();
    for (let i = 0; i <= steps * turns; i++) {
      const a = (i / steps) * Math.PI * 2;
      await page.mouse.move(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      await sleep(msPerTurn / steps);
    }
    await page.mouse.up();
  }

  await page.goto(`http://localhost:${PORT}/`);
  await page.getByRole('button', { name: 'Spielen' }).waitFor();
  await sleep(800);
  await shot('01-menu');

  // First start → interactive tutorial; drawing a circle must complete the first steps.
  await page.getByRole('button', { name: 'Spielen' }).click();
  await sleep(600);
  await circles(vp.width / 2, vp.height / 2, 70, 2.2);
  await sleep(1200);
  await shot('02-tutorial');
  await page.getByRole('button', { name: 'Überspringen' }).click();
  await sleep(2000);

  for (let k = 0; k < 2; k++) await circles(vp.width / 2 + (k % 2 ? 50 : -50), vp.height * 0.5, 80, 2);
  await shot('03-gameplay');

  // Pause – blind circles may already have cost all hearts, so accept the game-over screen too.
  await page.locator('.hud-pause').dispatchEvent('pointerdown');
  const resume = page.getByRole('button', { name: 'Weiter' });
  const again = page.getByRole('button', { name: 'Nochmal' });
  await resume.or(again).first().waitFor({ timeout: 8000 });
  await shot('04-pause-or-over');
  if (await resume.isVisible()) {
    await resume.click();
    console.log('Paused and resumed.');
  } else {
    console.log('Run ended before pausing (game-over screen shown).');
  }
} finally {
  await browser.close();
  stopServer();
}

if (errors.length) {
  console.error('Console errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('Smoke test passed – screenshots in', OUT);
