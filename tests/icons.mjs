import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const svg = readFileSync('../icon.svg', 'utf8');
const b = await chromium.launch();
for (const s of [192, 512]) {
  const p = await b.newPage({ viewport: { width: s, height: s } });
  await p.setContent(`<body style="margin:0">${svg.replace('<svg ', `<svg width="${s}" height="${s}" `)}</body>`);
  await p.screenshot({ path: `../icon-${s}.png` });
}
await b.close();
