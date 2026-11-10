// Prova extrem a extrem de SIGE v2.3 amb Playwright (mòbil 390×844).
// Ús: node e2e.mjs   (arrenca el seu propi servidor estàtic)
import { chromium } from 'playwright';
import http from 'http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert/strict';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'screens');
mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = join(ROOT, p);
  if (!f.startsWith(ROOT) || !existsSync(f)) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise(r => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}/index.html`;

const browser = await chromium.launch();
const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
let passed = 0;
const ok = (name) => { passed++; console.log('  ✔', name); };

// Imatge de prova gran (800×600) generada amb un canvas
const tmp = dirname(fileURLToPath(import.meta.url));
{
  const p = await browser.newPage();
  const b64 = await p.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 800; c.height = 600;
    const x = c.getContext('2d'); x.fillStyle = '#f2c14e'; x.fillRect(0, 0, 800, 600);
    x.fillStyle = '#b3202a'; x.font = 'bold 200px sans-serif'; x.fillText('MPPU', 100, 350);
    return c.toDataURL('image/png').split(',')[1];
  });
  writeFileSync(join(tmp, 'logo-test.png'), Buffer.from(b64, 'base64'));
  await p.close();
}
const LOGO = join(tmp, 'logo-test.png');

const txt = (page, sel) => page.locator(sel).innerText();
const stepLabel = (page) => page.locator('#progLbl').innerText();
const shot = (page, name) => page.screenshot({ path: join(SHOTS, name + '.png'), fullPage: true });

/* ================= 1. Tràmit complet, sense xarxa ================= */
console.log('1) Tràmit complet (offline, #test)');
{
  const ctx = await browser.newContext(mobile);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(BASE + '#test');
  await page.waitForLoadState('load');
  await page.waitForTimeout(1500); // deixa registrar el service worker
  const reqs = [];
  page.on('request', r => { if (!/^(blob|data):/.test(r.url())) reqs.push(r.url()); });
  await ctx.setOffline(true); // a partir d'ara res no pot sortir a la xarxa
  ok('Pàgina carregada i xarxa tallada');

  // Pas 1
  assert.match(await stepLabel(page), /^Pas 1 de 6 · 3% completat/);
  await shot(page, '01-pas1-inici');
  await page.click('#btnTurn');
  await page.waitForSelector('#turnWait:not([hidden])');
  await shot(page, '01b-pas1-compte-enrere');
  await page.waitForSelector('#m1 .msg.err');
  assert.equal(await txt(page, '#m1 .msg'), "S'ha esgotat el cupo diari de torns. Torni-ho a provar.");
  await shot(page, '01c-pas1-cupo');
  ok('Pas 1: primer intent → cupo esgotat');
  await page.click('#btnTurn');
  await page.waitForFunction(() => document.getElementById('progLbl').textContent.startsWith('Pas 2'));
  ok('Pas 1: segon intent → passa al pas 2');

  // Pas 2
  assert.match(await stepLabel(page), /^Pas 2 de 6 · 14% completat/);
  await page.click('#btnLogin');
  assert.ok(await page.locator('#e_pin').isVisible());
  assert.ok(await page.locator('#e_llista').isVisible());
  await shot(page, '02-pas2-errors');
  await page.fill('#pin', '0000');
  await page.selectOption('#llista', 'Llista B');
  await page.click('#btnLogin');
  await page.waitForFunction(() => document.getElementById('progLbl').textContent.startsWith('Pas 3'));
  ok('Pas 2: PIN 4 xifres + candidatura → pas 3');

  // Pas 3
  await shot(page, '03-pas3-buit');
  await page.click('#btnSubmit');
  assert.ok(await page.locator('#m3 .msg.err').isVisible());
  assert.ok(await page.locator('#e_nom').isVisible());
  await shot(page, '03b-pas3-errors-obligatoris');
  ok('Pas 3: camps obligatoris validats');

  await page.fill('#f_nom', 'Moviment Popular Pro Porró Universal');
  await page.fill('#f_sigles', 'MPPU');
  assert.equal(await txt(page, '#e_sigles'), 'Error 0x00E3: Les sigles superen el màxim permès');
  await page.fill('#f_eslogan', 'Porró per a tothom, cim per a tots');
  await page.fill('#f_objectiu', 'Porró gratuït a tots els cims');
  await page.selectOption('#f_ideologia', 'Porronista');
  await page.fill('#f_afiliats', '14');
  assert.ok(await page.locator('#w_afiliats').isVisible());
  assert.equal(await txt(page, '#w_afiliats'), 'Compte: ha declarat més afiliats que persones a la taula');
  await page.check('#f_decl');
  await page.click('#btnSubmit'); // sigles amb 4 lletres → no ha de passar
  assert.ok(await page.locator('#m3 .msg.err').isVisible());
  assert.match(await stepLabel(page), /^Pas 3/);
  await shot(page, '03c-pas3-sigles-i-afiliats');
  ok('Pas 3: sigles >3 bloquegen i avís d\'afiliats >10 visible');

  await page.fill('#f_sigles', 'MPP');
  await page.click('#btnSubmit');
  await page.waitForSelector('#ov:not([hidden])');
  assert.equal(await txt(page, '#winText'), 'Error 500: el servei no està disponible en aquest horari');
  await shot(page, '03d-pas3-error500');
  await page.click('#winBtns button');
  assert.match(await stepLabel(page), /^Pas 3/);
  ok('Pas 3: primer enviament vàlid → Error 500');
  await page.click('#btnSubmit');
  await page.waitForFunction(() => document.getElementById('progLbl').textContent.startsWith('Pas 4'));
  ok('Pas 3: segon enviament → pas 4');

  // Pas 4
  assert.match(await stepLabel(page), /^Pas 4 de 6 · 8% completat/);
  assert.equal(await page.locator('#logoFile').getAttribute('accept'), 'image/*');
  assert.equal(await page.locator('#logoFile').getAttribute('capture'), 'environment');
  await shot(page, '04-pas4-inici');
  await page.click('#btnLogo'); // sense fitxer: no compta
  assert.ok(await page.locator('#m4 .msg.warn').isVisible());
  await page.setInputFiles('#logoFile', LOGO);
  await page.click('#btnLogo');
  assert.equal(await txt(page, '#m4 .msg'), 'Format no admès. Només .BMP');
  await shot(page, '04b-pas4-intent1');
  await page.click('#btnLogo');
  assert.equal(await txt(page, '#m4 .msg'), 'El fitxer supera els 50 KB');
  await shot(page, '04c-pas4-intent2');
  await page.click('#btnLogo');
  await page.waitForSelector('#logoOk:not([hidden])');
  const logoLen = await page.evaluate(() => document.getElementById('logoPrev').src.length);
  assert.ok(logoLen > 500 && logoLen < 40000, 'logo reduït (' + logoLen + ' caràcters)');
  await shot(page, '04d-pas4-acceptat');
  ok('Pas 4: format → mida → acceptat; logo reduït a ' + Math.round(logoLen / 1024) + ' KB');
  await page.click('#btnLogoNext');

  // Pas 5
  assert.match(await stepLabel(page), /^Pas 5 de 6 · 92% completat/);
  assert.equal(await page.locator('.cell').count(), 9);
  await page.locator('.cell').nth(1).click();
  await page.locator('.cell').nth(5).click();
  await shot(page, '05-pas5-captcha');
  await page.click('#btnCap');
  await page.waitForSelector('#m5 .msg.err');
  assert.equal(await txt(page, '#m5 .msg'), 'Verificació fallida. Sembla que vostè és un robot.');
  await shot(page, '05b-pas5-fallida');
  ok('Pas 5: primera verificació falla');
  await page.locator('.cell').nth(1).click();
  await page.click('#btnCap');
  await page.waitForFunction(() => document.getElementById('progLbl').textContent.startsWith('Pas 6'));
  ok('Pas 5: segona verificació passa');

  // Pas 6
  assert.match(await txt(page, '#receipt h3'), /Justificant d'inscripció al Registre de Partits/i);
  const reg = await txt(page, '#r_reg');
  assert.match(reg, /^RP\/2026\/SS\/\d{6}-[A-Z]\/[a-z]+\/L-\d\/F-\d+$/);
  assert.equal(await txt(page, '#r_nom'), 'Moviment Popular Pro Porró Universal');
  assert.equal(await txt(page, '#r_sigles'), 'MPP');
  assert.equal(await txt(page, '#r_ideologia'), 'Porronista');
  assert.equal(await txt(page, '#r_llista'), 'Llista B');
  assert.equal(await txt(page, '#r_objectiu'), 'Porró gratuït a tots els cims');
  assert.ok(await page.locator('#seal').isVisible());
  assert.ok((await page.locator('#r_logo').getAttribute('src')).startsWith('data:image/jpeg'));
  assert.match(await txt(page, '#readAloud'), /Llegeixi aquest justificant en veu alta davant de la Junta/);
  await shot(page, '06-pas6-justificant');
  ok('Pas 6: justificant amb tots els camps, logo i segell (' + reg + ')');

  await page.click('#btnPrint');
  assert.equal(await txt(page, '#winText'), 'La impressora del registre està fora de servei des del 2009');
  await shot(page, '06b-pas6-impressora');
  await page.click('#winBtns button');

  assert.deepEqual(reqs, [], 'Peticions de xarxa després de la càrrega: ' + reqs.join(', '));
  ok('Cap petició de xarxa després de la càrrega inicial (tràmit sencer fet offline)');

  // Recàrrega: l'estat persisteix (ara sí, amb xarxa; el reload és meu)
  await ctx.setOffline(false);
  await page.reload();
  assert.match(await stepLabel(page), /^Pas 6/);
  assert.equal(await txt(page, '#r_reg'), reg);
  ok('Recàrrega: el justificant i el número de registre persisteixen');

  // Reset amb confirmació dins de la pàgina (No i Sí)
  await page.click('#btnReset');
  await shot(page, '06c-pas6-confirmacio');
  await page.locator('#winBtns button', { hasText: 'No' }).click();
  assert.match(await stepLabel(page), /^Pas 6/);
  await page.click('#btnReset');
  await page.locator('#winBtns button', { hasText: 'Sí' }).click();
  assert.match(await stepLabel(page), /^Pas 1/);
  ok('Nou tràmit: confirmació en pàgina (No cancel·la, Sí esborra)');

  assert.deepEqual(errors, [], errors.join('\n'));
  ok('Cap error de JavaScript ni de consola');
  await ctx.close();
}

/* ================= 2. Persistència al pas 3 ================= */
console.log('2) Persistència del formulari');
{
  const ctx = await browser.newContext(mobile);
  const page = await ctx.newPage();
  await page.goto(BASE + '#test,director');
  assert.ok(await page.locator('#director').isVisible());
  await page.locator('#dirSteps button', { hasText: '3' }).click();
  await page.fill('#f_nom', 'Partit Persistent');
  await page.fill('#f_sigles', 'PP');
  await page.reload();
  assert.match(await stepLabel(page), /^Pas 3/);
  assert.equal(await page.inputValue('#f_nom'), 'Partit Persistent');
  assert.equal(await page.inputValue('#f_sigles'), 'PP');
  ok('Camps del formulari i pas actual sobreviuen a la recàrrega');
  await ctx.close();
}

/* ================= 3. Caducitat per inactivitat ================= */
console.log('3) Sessió caducada per inactivitat');
{
  const ctx = await browser.newContext(mobile);
  const page = await ctx.newPage();
  await page.goto(BASE + '#test,director');
  await page.locator('#dirSteps button', { hasText: '3' }).click();
  await page.fill('#f_nom', 'Partit Dormilega');
  await page.waitForSelector('#ov:not([hidden])', { timeout: 15000 });
  assert.equal(await txt(page, '#winText'), 'Sessió caducada per inactivitat');
  await shot(page, '07-sessio-caducada');
  await page.click('#winBtns button');
  assert.match(await stepLabel(page), /^Pas 2/);
  assert.equal(await page.inputValue('#pin'), '');
  ok('Inactivitat al pas 3 → torna al començament del pas 2');
  await ctx.close();
}

/* ================= 4. Mode director ================= */
console.log('4) Mode director');
{
  const ctx = await browser.newContext(mobile);
  const page = await ctx.newPage();
  await page.goto(BASE + '#test');
  assert.ok(!(await page.locator('#director').isVisible()));
  for (let i = 0; i < 4; i++) await page.click('#crest');
  assert.ok(!(await page.locator('#director').isVisible()), '4 tocs no l\'obren');
  await page.click('#crest');
  assert.ok(await page.locator('#director').isVisible());
  await shot(page, '08-director');
  ok('5 tocs a l\'escut obren el panell (4 no)');
  await page.check('#dirNoObs');
  await page.locator('#dirSteps button', { hasText: '1' }).click();
  await page.click('#btnTurn');
  await page.waitForFunction(() => document.getElementById('progLbl').textContent.startsWith('Pas 2'));
  ok('Sense obstacles: el torn passa al primer intent');
  await page.locator('#dirSteps button', { hasText: '5' }).click();
  await page.click('#btnCap');
  await page.waitForFunction(() => document.getElementById('progLbl').textContent.startsWith('Pas 6'));
  ok('Sense obstacles: la verificació passa al primer intent; salt a qualsevol pas');
  await ctx.close();
}

/* ================= 5. Sense localStorage ================= */
console.log('5) localStorage bloquejat');
{
  const ctx = await browser.newContext(mobile);
  await ctx.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('bloquejat'); } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '#test');
  await page.click('#btnTurn');
  await page.waitForSelector('#m1 .msg.err');
  await page.click('#btnTurn');
  await page.waitForFunction(() => document.getElementById('progLbl').textContent.startsWith('Pas 2'));
  assert.deepEqual(errors, []);
  ok('Funciona igualment si localStorage llança excepcions');
  await ctx.close();
}

/* ================= 6. Desbordament horitzontal a 360 px ================= */
console.log('6) Mòbil de 360 px: sense scroll horitzontal');
{
  const ctx = await browser.newContext({ ...mobile, viewport: { width: 360, height: 740 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '#test,director');
  for (let n = 1; n <= 6; n++) {
    await page.locator('#dirSteps button', { hasText: String(n) }).click();
    if (n === 6) { await page.evaluate(() => { document.getElementById('r_reg').textContent = 'RP/2026/SS/000047-B/quinquies/L-9/F-999'; }); }
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(w <= 360, `pas ${n}: scrollWidth ${w} > 360`);
    await shot(page, `360-pas${n}`);
  }
  ok('Cap pas desborda els 360 px d\'ample');
  await ctx.close();
}

await browser.close();
server.close();
console.log(`\nTOTES LES PROVES OK (${passed} comprovacions)`);
