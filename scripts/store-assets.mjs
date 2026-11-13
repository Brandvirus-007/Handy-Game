// Generates Google Play store graphics: feature graphic (1024×500) and phone screenshots
// (1080×1920, 9:16) in German and English. Uses the dev server so the game can be steered.
//   node scripts/store-assets.mjs
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const OUT = 'docs/store';
const APP_VERSION = JSON.parse(readFileSync('package.json', 'utf8')).version;
const PORT = 5233;
const font = readFileSync('node_modules/@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2').toString('base64');
const emblem = readFileSync('public/icons/icon.svg', 'utf8').replace(/<rect[^>]*\/>/, '');

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', detached: true });
await new Promise((r) => server.stdout.on('data', (d) => String(d).includes(String(PORT)) && r()));
const browser = await chromium.launch();

try {
  // ── Feature graphic ──
  for (const lang of ['de', 'en']) {
    const page = await browser.newPage({ viewport: { width: 1024, height: 500 } });
    const tagline = lang === 'de' ? 'Zieh Kreise aus Licht. Fang die Schatten.' : 'Draw circles of light. Catch the shadows.';
    await page.setContent(`<html><head><style>
      @font-face { font-family: Outfit; src: url(data:font/woff2;base64,${font}) format('woff2'); font-weight: 100 900; }
      body { margin: 0; width: 1024px; height: 500px; overflow: hidden; font-family: Outfit, sans-serif;
        background: radial-gradient(ellipse at 30% 40%, #2a1f6e 0%, #0d0a26 55%, #05040c 100%); color: #fff; }
      .stars { position: absolute; inset: 0; background-image: radial-gradient(1px 1px at 20% 30%, #fff8, transparent),
        radial-gradient(1px 1px at 70% 20%, #fff6, transparent), radial-gradient(1.5px 1.5px at 85% 70%, #fff9, transparent),
        radial-gradient(1px 1px at 40% 80%, #fff5, transparent), radial-gradient(1px 1px at 60% 55%, #fff7, transparent); }
      .emblem { position: absolute; left: 70px; top: 50px; width: 400px; height: 400px; filter: drop-shadow(0 0 40px rgba(125,249,255,.35)); }
      .txt { position: absolute; left: 500px; top: 140px; }
      h1 { margin: 0; font-size: 104px; line-height: .9; font-weight: 800; letter-spacing: .06em;
        background: linear-gradient(120deg, #fff 10%, #a8fbff 45%, #c9a2ff 85%); -webkit-background-clip: text; color: transparent;
        filter: drop-shadow(0 0 22px rgba(125,249,255,.5)); }
      p { margin: 22px 0 0; font-size: 28px; color: #c9c3f0; font-weight: 500; }
    </style></head><body><div class="stars"></div><div class="emblem">${emblem}</div>
      <div class="txt"><h1>LUMEN<br>LOOP</h1><p>${tagline}</p></div></body></html>`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/feature-graphic-${lang}.jpg`, type: 'jpeg', quality: 95 });
    await page.close();
  }

  // ── Phone screenshots ──
  for (const lang of ['de', 'en']) {
    const dir = `${OUT}/screenshots/${lang}`;
    mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({
      viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: lang === 'de' ? 'de-DE' : 'en-US',
    });
    const page = await ctx.newPage();
    const shot = async (name) => {
      // Store shots show the app as players see it: no transient toasts, no browser-demo notice.
      await page.evaluate(() => document.querySelectorAll('.toast, .demo-note').forEach((t) => t.remove()));
      await page.screenshot({ path: `${dir}/${name}.jpg`, type: 'jpeg', quality: 88 });
    };
    const sleep = (ms) => page.waitForTimeout(ms);
    await page.addInitScript((version) => {
      const today = new Date();
      const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      localStorage.setItem('lumen-loop/save', JSON.stringify({
        v: 2, tutorialDone: true, bank: 2450, diamonds: 135, level: 7, xp: 420, chars: ['spark', 'comet', 'ember'], selected: 'spark',
        meta: { trail: 3, heart: 1, shards: 2 }, best: 48210, bestWave: 17, login: { last: key, day: 3 },
        stats: { bestWave: 17, runs: 23, kills: 2210, loops: 1630, bossKills: 4, playTime: 9800, shardsTotal: 5100, bestLoop: 9, bestCombo: 11 },
        // Notes for this version count as seen – no "What's new" dialog over the screenshots.
        seenVersion: version,
      }));
    }, APP_VERSION);
    await page.goto(`http://localhost:${PORT}/`);
    await sleep(1600);
    await shot('1-menu');

    // In-page bot (god mode) so gameplay shots show real loops around real enemies.
    await page.evaluate(() => {
      let ang = 0;
      const tick = () => {
        const app = window.app;
        const w = app?.world;
        if (w && app.state === 'playing') {
          w.invuln = 0.5;
          let cx = w.w / 2, cy = w.h / 2;
          if (w.enemies.length) {
            let b = w.enemies[0], bd = 1e9;
            for (const e of w.enemies) { const d = (e.x - w.px) ** 2 + (e.y - w.py) ** 2 - (e.boss ? 4e4 : 0); if (d < bd) { bd = d; b = e; } }
            cx = b.x; cy = b.y;
          }
          ang += 0.07;
          const k = app.renderer.scale / app.save.data.settings.sensitivity;
          app.pendingDx += (cx + Math.cos(ang) * 78 - w.px) * 0.3 * k;
          app.pendingDy += (cy + Math.sin(ang) * 78 - w.py) * 0.3 * k;
        }
        requestAnimationFrame(tick);
      };
      tick();
    });
    await page.evaluate(() => window.app.launchRun(false, []));
    // A run that starts at wave 13 shows a score that fits it, as if the first 12 waves were played.
    await page.evaluate(() => { const w = window.app.world; w.beginWave(13); w.run.score = 18640; w.run.shards = 214; });
    await sleep(3200);
    // Staged scene: a mixed group of shadows in the middle that the spark is circling.
    await page.evaluate(() => {
      const w = window.app.world;
      for (const e of w.enemies) e.dead = true;
      w.markers.length = 0;
      w.plan.groups.length = 0;
      w.px = w.tx = w.w / 2 + 80;
      w.py = w.ty = w.h * 0.45;
      w.trail.reset(w.px, w.py, w.time);
      const cx = w.w / 2;
      const cy = w.h * 0.45;
      const types = ['mote', 'mote', 'mote', 'dart', 'warden', 'bomber', 'mote', 'splitter', 'blinker'];
      types.forEach((t, i) => {
        const a = (i / types.length) * Math.PI * 2;
        const r = i % 2 ? 34 : 52;
        const e = w.spawnDirect(t, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        e.speed *= 0.25;
        e.t = 1;
      });
    });
    for (let i = 0; i < 60; i++) {
      const ready = await page.evaluate(() => window.app.world.trail.points.length > 55 && window.app.fx.flashes.length === 0);
      if (ready) break;
      await sleep(80);
    }
    await shot('2-gameplay');

    await page.evaluate(() => { const w = window.app.world; for (const e of w.enemies) e.dead = true; w.markers.length = 0; w.beginWave(25); w.run.score = Math.max(w.run.score, 41250); });
    for (let i = 0; i < 40; i++) {
      const firing = await page.evaluate(() =>
        window.app.world.enemies.some((e) => e.type === 'eye' && e.state === 1 && e.t > 4 && e.timer < 3.2 && e.timer > 1.2) && window.app.fx.flashes.length === 0);
      if (firing) break;
      await sleep(120);
    }
    await shot('3-boss');

    await page.evaluate(() => { const w = window.app.world; for (const e of w.enemies) e.dead = true; w.markers.length = 0; w.plan.groups.length = 0; w.plan.boss = null; });
    for (let i = 0; i < 40 && !(await page.evaluate(() => window.app.state === 'upgrade')); i++) await sleep(250);
    await sleep(900);
    await shot('4-upgrades');

    await page.evaluate(() => { window.app.toMenuState(); window.app.ui.showShop(); });
    await sleep(700);
    await shot('5-shop');

    await page.evaluate(() => { window.app.toMenuState(); window.app.ui.showPrerun(false); });
    await page.locator('[data-act=toggle][data-id=shield]').click();
    await page.locator('[data-act=toggle][data-id=lucky]').click();
    await sleep(400);
    await shot('6-boosters');
    await ctx.close();
  }
  console.log('Store assets written to', OUT);
} finally {
  await browser.close();
  process.kill(-server.pid);
}
