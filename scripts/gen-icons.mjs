// Generates the app icons (SVG + PNG sizes) using the pre-installed Chromium via Playwright.
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
// Playwright is pre-installed globally in CI/dev containers; resolve it via require (honours NODE_PATH).
const { chromium } = createRequire(import.meta.url)('playwright');

const content = (scale) => `
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <path d="M96 438 C 210 380 386 332 386 214 C 386 118 312 84 256 84 C 182 84 126 136 126 214 C 126 332 302 380 416 438"
      fill="none" stroke="url(#ring)" stroke-width="46" stroke-linecap="round" opacity=".55" filter="url(#glow)"/>
    <path d="M96 438 C 210 380 386 332 386 214 C 386 118 312 84 256 84 C 182 84 126 136 126 214 C 126 332 302 380 416 438"
      fill="none" stroke="url(#ring)" stroke-width="20" stroke-linecap="round"/>
    <path d="M96 438 C 210 380 386 332 386 214 C 386 118 312 84 256 84 C 182 84 126 136 126 214 C 126 332 302 380 416 438"
      fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".85"/>
    <circle cx="256" cy="212" r="58" fill="#a66bff" opacity=".5" filter="url(#glow)"/>
    <circle cx="256" cy="212" r="46" fill="#0b0716" stroke="#a66bff" stroke-width="7"/>
    <circle cx="238" cy="206" r="10" fill="#fff"/><circle cx="274" cy="206" r="10" fill="#fff"/>
    <circle cx="240" cy="210" r="4.5" fill="#0b0716"/><circle cx="276" cy="210" r="4.5" fill="#0b0716"/>
    <circle cx="416" cy="438" r="70" fill="url(#spark)"/>
    <circle cx="416" cy="438" r="17" fill="#fff"/>
  </g>`;

const svg = ({ maskable = false } = {}) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="78%"><stop offset="0" stop-color="#1d1650"/><stop offset=".6" stop-color="#0c0924"/><stop offset="1" stop-color="#05040c"/></radialGradient>
    <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7df9ff"/><stop offset=".55" stop-color="#9fb4ff"/><stop offset="1" stop-color="#c98bff"/></linearGradient>
    <radialGradient id="spark"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#c8fdff" stop-opacity=".9"/><stop offset="1" stop-color="#7df9ff" stop-opacity="0"/></radialGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="16"/></filter>
  </defs>
  <rect width="512" height="512" ${maskable ? '' : 'rx="116"'} fill="url(#bg)"/>
  ${content(maskable ? 0.74 : 0.92)}
</svg>`;

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon.svg', svg());

const browser = await chromium.launch();
const page = await browser.newPage();
async function render(svgText, size, file) {
  const data = 'data:image/svg+xml;base64,' + Buffer.from(svgText).toString('base64');
  const png = await page.evaluate(
    async ({ data, size }) => {
      const img = new Image();
      img.src = data;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = c.height = size;
      c.getContext('2d').drawImage(img, 0, 0, size, size);
      return c.toDataURL('image/png').split(',')[1];
    },
    { data, size },
  );
  writeFileSync(file, Buffer.from(png, 'base64'));
  console.log('wrote', file);
}
await render(svg(), 192, 'public/icons/icon-192.png');
await render(svg(), 512, 'public/icons/icon-512.png');
await render(svg({ maskable: true }), 512, 'public/icons/icon-maskable-512.png');
await render(svg({ maskable: true }), 180, 'public/icons/apple-touch-icon.png');
await browser.close();
