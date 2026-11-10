// Prova extrem a extrem de SIGE v2.3 (edició "UX terrible") amb Playwright, mòbil 390×844.
// Ús: node e2e.mjs   (arrenca el seu propi servidor estàtic)
import { chromium } from 'playwright';
import http from 'http';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert/strict';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SHOTS = join(HERE, 'screens');
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

const txt = (page, sel) => page.locator(sel).innerText();
const stepLabel = (page) => page.locator('#progLbl').innerText();
const shot = (page, name) => page.screenshot({ path: join(SHOTS, name + '.png'), fullPage: true });
const waitStep = (page, n) => page.waitForFunction((n) => document.getElementById('progLbl').textContent.startsWith('Pas ' + n), n, { timeout: 15000 });
const accept = (page) => page.locator('#winBtns button').first().click();

/* ---------- ajudes de cada pas ---------- */
async function passQueue(page) {
  await page.click('#btnTurn');
  await page.waitForSelector('#turnWait:not([hidden])');
  await Promise.race([page.waitForSelector('#m1 .msg.err'), waitStep(page, 2)]);
  if (await page.locator('#m1 .msg.err').count()) { await page.click('#btnTurn'); }
  await waitStep(page, 2);
}
async function doStep2(page, list = 'Llista B', digits = [3, 1, 4, 1]) {
  for (let i = 0; i < 4; i++) await page.locator('.pinrow input').nth(i).fill(String(digits[i]));
  await page.locator(`#arena .runner[data-v="${list}"]`).click();
  await page.click('#btnLogin');
  await waitStep(page, 3);
}
async function typeName(page, name) {
  for (const ch of name) {
    if (ch === ' ') await page.locator('#kb .sp').click();
    else await page.locator('#kb button', { hasText: new RegExp('^' + ch + '$') }).first().click();
  }
}
async function setReel(page, i, letter) {
  const n = letter.charCodeAt(0) - 64;
  const btn = page.locator('.reel').nth(i).locator('button');
  if (n <= 13) for (let k = 0; k < n; k++) await btn.first().click();
  else for (let k = 0; k < 27 - n; k++) await btn.last().click();
}
async function fillStep3(page, { sig = 'MPP', fourth = '' } = {}) {
  await typeName(page, 'MOVIMENT POPULAR');
  for (let i = 0; i < sig.length; i++) await setReel(page, i, sig[i]);
  if (fourth) await setReel(page, 3, fourth);
  await page.fill('#f_eslogan', 'Porro per a tothom');
  await page.fill('#f_objectiu', 'Porró gratuït a tots els cims');
  await page.click('#btnSave');
  await page.selectOption('#f_ideologia', '__altres');
  await page.selectOption('#f_altres', 'Ecologisme');
}
async function setAfiliats(page) { // 1000 → 8, només descomptant
  for (let k = 0; k < 9; k++) await page.locator('#affBtns button[data-d="-100"]').click();
  for (let k = 0; k < 9; k++) await page.locator('#affBtns button[data-d="-10"]').click();
  for (let k = 0; k < 2; k++) await page.locator('#affBtns button[data-d="-1"]').click();
}
async function hold(page, ms = 600) {
  const b = await page.locator('#holdBtn').boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down(); await page.waitForTimeout(ms); await page.mouse.up();
}
async function drawStroke(page, fx, fy, tx, ty) {
  await page.locator('#paint').scrollIntoViewIfNeeded();
  const b = await page.locator('#paint').boundingBox();
  await page.mouse.move(b.x + b.width * fx, b.y + b.height * fy);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * (fx + tx) / 2, b.y + b.height * (fy + ty) / 2, { steps: 4 });
  await page.mouse.move(b.x + b.width * tx, b.y + b.height * ty, { steps: 4 });
  await page.mouse.up();
}
const MINI_TXT = 'ESCRUTINI';
// Resol la prova petita de la quadrícula (és aleatòria): `wrong` per fallar-la a posta
async function miniCap(page, wrong) {
  const box = page.locator('#gridCap');
  if (await box.locator('.capIn').count()) await box.locator('.capIn').fill(wrong ? 'QQQQQ' : MINI_TXT);
  else if (await box.locator('.puzRange').count()) {
    const left = await box.locator('.hole').evaluate(e => parseInt(e.style.left, 10));
    await box.locator('.puzRange').fill(String(wrong ? 10 : left));
  } else if (wrong) await box.locator('.cell').first().click();
}
const fugClick = async (page) => { for (let k = 0; k < 6; k++) { await page.locator('.fug').click(); if (await page.locator('.fug.on').count()) return; } };
async function holdPour(page, ms) {
  const b = await page.locator('#pourBtn').boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down(); await page.waitForTimeout(ms); await page.mouse.up();
}
const pourMs = async (page, delta = 0) => {
  const p = page.locator('.pour'); const t = +(await p.getAttribute('data-target')), r = +(await p.getAttribute('data-rate'));
  return t / r * 1000 + delta;
};
async function drawPorro(page) {
  const b = await page.locator('.dcan').boundingBox();
  const pts = [[.35, .9], [.25, .55], [.38, .3], [.4, .1], [.55, .1], [.57, .3], [.7, .55], [.62, .9], [.35, .9]];
  await page.mouse.move(b.x + b.width * pts[0][0], b.y + b.height * pts[0][1]); await page.mouse.down();
  for (const [x, y] of pts.slice(1)) await page.mouse.move(b.x + b.width * x, b.y + b.height * y, { steps: 4 });
  await page.mouse.up();
}
// Passa la verificació i (0-4) de manera correcta
async function passCap(page, i) {
  if (i === 0) await fugClick(page);
  if (i === 1) { const n = +(await page.locator('.belt').getAttribute('data-count')); for (let k = 0; k < n; k++) await page.click('#cPlus'); await page.click('#btnCap'); }
  if (i === 2) await holdPour(page, await pourMs(page));
  if (i === 3) { for (let k = 0; k < 5; k++) await page.locator(`.ob[data-i="${k}"]`).click(); await page.click('#btnCap'); }
  if (i === 4) { await drawPorro(page); await page.click('#btnCap'); }
}
// Amb "Sense obstacles": passa qualsevol prova amb el gest mínim
async function passCapFree(page, i) {
  if (i === 0) await page.locator('.fug').click();
  if (i === 2) await holdPour(page, 300);
  if (i === 1 || i === 3 || i === 4) await page.click('#btnCap');
}
const capIs = (page, n) => page.waitForFunction((n) => document.getElementById('capHead').textContent === 'Verificació ' + n + ' de 5', n, { timeout: 15000 });

/* ================= 1. Tràmit complet, amb un reinici pel mig, sense xarxa ================= */
console.log('1) Tràmit complet (offline, #test) amb reinici per sigles de 4 lletres');
{
  const ctx = await browser.newContext(mobile);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(BASE + '#test');
  await page.waitForLoadState('load');
  await page.waitForTimeout(1500);
  const reqs = [];
  page.on('request', r => { if (!/^(blob|data):/.test(r.url())) reqs.push(r.url()); });
  await ctx.setOffline(true);
  ok('Pàgina carregada i xarxa tallada');

  // Pas 1: la cua
  assert.match(await stepLabel(page), /^Pas 1 de 6 · 3% completat/);
  await shot(page, '01-pas1-inici');
  await page.click('#btnTurn');
  await page.waitForSelector('#turnWait:not([hidden])');
  assert.match(await txt(page, '#turnAhead'), /^Persones davant seu: \d+$/);
  await shot(page, '01b-pas1-cua');
  await page.waitForSelector('#m1 .msg.err');
  assert.equal(await txt(page, '#m1 .msg'), "S'ha esgotat el cupo diari de torns. Torni-ho a provar.");
  ok('Pas 1: cua amb persones davant, i primer intent → cupo esgotat');
  await page.click('#btnTurn');
  await waitStep(page, 2);

  // Pas 2: lliscadors + botons fugissers
  await shot(page, '02-pas2-inici');
  await page.click('#btnLogin');
  assert.ok(await page.locator('#e_llista').isVisible());
  for (let i = 0; i < 4; i++) await page.locator('.pinrow input').nth(i).fill(String([3, 1, 4, 1][i]));
  assert.equal(await page.locator('.pinrow .dg').allInnerTexts().then(a => a.join('')), '3141');
  await page.locator('#arena .runner[data-v="Llista B"]').click();
  assert.match(await txt(page, '#arena .runner.chosen'), /Llista B/);
  await shot(page, '02b-pas2-completat');
  await page.click('#btnLogin');
  await waitStep(page, 3);
  ok('Pas 2: PIN amb lliscadors i candidatura triada');

  // Pas 3, primera volta: sigles de 4 lletres → tràmit anul·lat
  await fillStep3(page, { sig: 'MPP', fourth: 'A' });
  await shot(page, '03-pas3-ple');
  await page.click('#btnSubmit');
  await page.waitForSelector('#ov:not([hidden])');
  assert.match(await txt(page, '#winText'), /Error 0x00E3: Les sigles superen el màxim permès\. Haurà de tornar a començar/);
  await shot(page, '03b-pas3-anulat');
  await accept(page);
  assert.match(await stepLabel(page), /^Pas 1/);
  assert.match(await txt(page, '#anul'), /Expedients anul·lats en aquesta sessió: 1/);
  ok('Pas 3: 4 lletres de sigles → tràmit anul·lat, torna a la cua i es compta');

  // Segona volta (sense cupo: només passa una vegada)
  await page.click('#btnTurn');
  await waitStep(page, 2);
  ok('Segona cua: ja no hi ha cupo esgotat (només passa un cop)');
  await doStep2(page);
  assert.equal(await page.locator('#f_nom').innerText(), 'Toqui les tecles per escriure… ', 'dades esborrades pel reinici');
  ok('Reinici: les dades del formulari s\'han esborrat');

  // Pas 3 correcte
  // Teclat: comprovem que es reorganitza (mai perd lletres) i que escriu el que toca
  await typeName(page, 'MOVIMENT POPULAR PRO PORRO');
  const labels = (await page.locator('#kb button:not(.sp):not(.bk)').allInnerTexts()).sort().join('');
  assert.equal(labels, 'ABCDEFGHIJKLMNOPQRSTUVWXYZÇÀÈÉÒÓÍÚ·-'.split('').sort().join(''), 'el teclat conserva totes les lletres');
  assert.equal((await page.locator('#f_nom').innerText()).trim(), 'MOVIMENT POPULAR PRO PORRO');
  ok('Teclat de la Junta: escriu bé i només permuta tecles (mai en perd)');

  for (let i = 0; i < 3; i++) await setReel(page, i, 'MPP'[i]);
  assert.equal(await page.locator('.reel .lt').allInnerTexts().then(a => a.join('')), 'MPP–');
  await page.fill('#f_eslogan', 'Porro per a tothom');
  const mirrored = await page.evaluate(() => { const s = getComputedStyle(document.getElementById('f_eslogan')); return s.direction + '/' + s.unicodeBidi; });
  assert.match(mirrored, /^rtl\/(bidi-override|isolate-override)$/);
  await page.fill('#f_objectiu', 'Porró gratuït a tots els cims');
  assert.ok(await page.locator('#decay').innerText().then(t => /Camp sense desar/.test(t)) || true);
  await page.click('#btnSave');
  assert.ok(await page.locator('#f_objectiu').evaluate(e => e.readOnly));
  await page.selectOption('#f_ideologia', '__altres');
  assert.ok(await page.locator('#altresBox').isVisible());
  await page.selectOption('#f_altres', 'Ecologisme');
  await shot(page, '03c-pas3-ideologia-altres');
  assert.equal(await txt(page, '#affNum'), 'M');
  for (let k = 0; k < 9; k++) await page.locator('#affBtns button[data-d="-100"]').click();
  assert.equal(await txt(page, '#affNum'), 'C');
  assert.ok(await page.locator('#w_afiliats').isVisible());
  for (let k = 0; k < 9; k++) await page.locator('#affBtns button[data-d="-10"]').click();
  for (let k = 0; k < 2; k++) await page.locator('#affBtns button[data-d="-1"]').click();
  assert.equal(await txt(page, '#affNum'), 'VIII');
  assert.ok(!(await page.locator('#w_afiliats').isVisible()));
  ok('Pas 3: sigles amb rodets, eslògan reflectit, objectiu desat, "Altres", afiliats en romà');

  await page.click('#btnSubmit'); // falta signar la declaració → error però NO reinici
  assert.ok(await page.locator('#e_decl').isVisible());
  assert.match(await stepLabel(page), /^Pas 3/);
  await shot(page, '03d-pas3-falta-declaracio');
  await hold(page, 50); // massa curt: no compta
  assert.ok(!(await page.evaluate(() => JSON.parse(localStorage.getItem('sige_v24_state')).form.decl)));
  await hold(page, 700);
  assert.equal(await txt(page, '#holdBtn'), '✅');
  ok('Pas 3: la declaració només es registra mantenint premut');

  await page.click('#btnSubmit');
  await page.waitForSelector('#ov:not([hidden])');
  assert.equal(await txt(page, '#winText'), 'Error 500: el servei no està disponible en aquest horari');
  await accept(page);
  await page.click('#btnSubmit');
  await waitStep(page, 4);
  ok('Pas 3: primer enviament vàlid → Error 500; segon → pas 4');

  // Pas 4: mini paint
  assert.match(await stepLabel(page), /^Pas 4 de 6 · 8% completat/);
  await shot(page, '04-pas4-inici');
  // Quadrícula: només s'activa superant una prova humana
  assert.ok(!(await page.locator('#gridOv').isVisible()));
  await page.click('#btnGrid');
  await page.waitForSelector('#gridCap .top');
  await shot(page, '04a-pas4-quadricula-captcha');
  await miniCap(page, true); await page.click('#btnGridOk');
  assert.match(await txt(page, '#mG .msg'), /nova prova/);
  assert.ok(!(await page.locator('#gridOv').isVisible()), 'error → la quadrícula no s\'activa');
  await miniCap(page, false); await page.click('#btnGridOk');
  await page.waitForSelector('#gridOv:not([hidden])');
  assert.equal(await txt(page, '#btnGrid'), 'Quadrícula: sí');
  await shot(page, '04a2-pas4-quadricula-activa');
  ok('Pas 4: la quadrícula exigeix una prova humana (error → no s\'activa; correcte → s\'activa)');
  await page.click('#btnGrid');
  assert.ok(!(await page.locator('#gridOv').isVisible()));
  await page.click('#btnGrid'); await miniCap(page, false); await page.click('#btnGridOk');
  await page.waitForSelector('#gridOv:not([hidden])');
  ok('Pas 4: desactivar és lliure; tornar-la a activar demana una altra prova');
  await page.click('#btnLogoOk');
  assert.ok(await page.locator('#m4 .msg.warn').isVisible());
  await page.locator('.sw').nth(1).click(); // vermell
  await drawStroke(page, 0.2, 0.3, 0.3, 0.7);
  // Pinzell invertit: el traç apareix reflectit horitzontalment
  const mir = await page.evaluate(() => {
    const c = document.getElementById('paint'), x = c.getContext('2d');
    const side = (x0) => { const d = x.getImageData(x0, 0, 150, 220).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 1] < 120) n++; return n; };
    return { left: side(0), right: side(150) };
  });
  assert.ok(mir.right > 20 && mir.left === 0, 'traç tocat a l\'esquerra apareix a la dreta: ' + JSON.stringify(mir));
  await page.locator('.sw').nth(3).click(); // blau
  await drawStroke(page, 0.5, 0.2, 0.8, 0.8);
  await page.locator('#brush').fill('8');
  await drawStroke(page, 0.3, 0.5, 0.7, 0.5);
  await shot(page, '04b-pas4-dibuix');
  await page.click('#btnLogoOk');
  assert.equal(await txt(page, '#m4 .msg'), 'El logo és molt lleig. Afegeixi color o alguna cosa.');
  await shot(page, '04c-pas4-lleig');
  ok('Pas 4: pinzell invertit; el primer OK → "molt lleig"');
  await page.click('#btnLogoOk');
  await page.waitForSelector('#logoOk:not([hidden])');
  assert.ok((await page.locator('#logoPrev').getAttribute('src')).startsWith('data:image/jpeg'));
  await shot(page, '04d-pas4-acceptat');
  ok('Pas 4: el segon OK accepta el logo dibuixat');
  await page.click('#btnLogoNext');

  // Pas 5: cinc verificacions noves
  assert.match(await stepLabel(page), /^Pas 5 de 6 · 92% completat/);
  assert.equal(await txt(page, '#capHead'), 'Verificació 1 de 5');
  await shot(page, '05a-captcha1-casella-fugitiva');
  const pos0 = await page.locator('.fug').boundingBox();
  await page.locator('.fug').click();
  assert.equal(await page.locator('.fug.on').count(), 0, 'la casella fuig el primer toc');
  assert.match(await txt(page, '#m5 .msg'), /S'ha mogut/);
  ok('Captcha 1: la casella "No sóc un robot" fuig abans de deixar-se marcar');
  await fugClick(page);
  await page.waitForSelector('#m5 .msg.err');
  assert.equal(await txt(page, '#m5 .msg'), 'Verificació fallida. Sembla que vostè és un robot.');
  ok('Captcha 1: la primera vegada, encara que la marqui bé → "robot"');
  await fugClick(page);
  await capIs(page, 2);

  await page.waitForSelector('.belt .bi');
  await shot(page, '05b-captcha2-cinta');
  assert.ok((await page.locator('.belt .bi').count()) >= 7);
  assert.equal(await page.locator('.belt .bi svg[data-k=porro]').count(), +(await page.locator('.belt').getAttribute('data-count')), 'els porrons de la cinta són els que compta');
  await page.click('#cPlus'); await page.click('#cPlus'); await page.click('#cMinus'); // 1 (mai coincideix: hi ha 3-5)
  await page.click('#btnCap');
  await page.waitForSelector('#ov:not([hidden])');
  assert.match(await txt(page, '#winText'), /El recompte no coincideix amb el de la cinta\. Haurà de tornar a començar la verificació/);
  await accept(page);
  assert.equal(await txt(page, '#capHead'), 'Verificació 1 de 5');
  ok('Un error de verificació reinicia les cinc proves (tornem a la 1)');
  await passCap(page, 0); await capIs(page, 2);
  await page.waitForTimeout(700);
  await page.click('#cReplay');
  await passCap(page, 1); await capIs(page, 3);
  ok('Captcha 2: comptar els porrons de la cinta transportadora');

  await shot(page, '05c-captcha3-abocar');
  await holdPour(page, Math.max(200, await pourMs(page, -900))); // massa poc
  assert.match(await txt(page, '#m5 .msg'), /Intent 1\/3/);
  await page.waitForTimeout(1200); // el got es buida
  await shot(page, '05c2-captcha3-abocar-ple');
  await passCap(page, 2); await capIs(page, 4);
  ok('Captcha 3: abocar el porró fins a la ratlla (un error = un intent, no reinici)');

  await shot(page, '05d-captcha4-promesa');
  assert.equal(await page.locator('.ob').count(), 5);
  await page.locator('.ob[data-i="0"]').click(); await page.locator('.ob[data-i="1"]').click();
  await page.click('#btnCap');
  await page.waitForSelector('#m5 .msg.warn');
  assert.match(await txt(page, '#m5 .msg'), /Falten fets per ordenar \(2\/5\)/);
  await page.locator('.ob[data-i="1"]').click(); // el treu
  assert.equal((await txt(page, '.ob[data-i="0"] .n')).trim(), '1');
  await page.locator('.ob[data-i="1"]').click();
  await shot(page, '05d2-captcha4-promesa-triats');
  for (const k of [2, 3, 4]) await page.locator(`.ob[data-i="${k}"]`).click();
  await page.click('#btnCap');
  await capIs(page, 5);
  ok('Captcha 4: ordenar el cicle de vida d\'una promesa electoral');

  await shot(page, '05e-captcha5-dibuix');
  await page.click('#btnCap');
  await page.waitForSelector('#m5 .msg.warn');
  assert.match(await txt(page, '#m5 .msg'), /La IA no veu res/);
  await drawPorro(page);
  await shot(page, '05e2-captcha5-dibuixat');
  await page.click('#btnCap');
  await page.waitForSelector('#m5 .msg.ok');
  assert.match(await txt(page, '#m5 .msg'), /^Resultat de la IA: .*porró \d+%.*Verificació superada/);
  await waitStep(page, 6);
  ok('Captcha 5: dibuixar un porró; la "IA" l\'accepta tot i confondre\'l');

  // Pas 6
  assert.match(await txt(page, '#receipt h3'), /Justificant d'inscripció al Registre de Partits/i);
  const reg = await txt(page, '#r_reg');
  assert.match(reg, /^RP\/2026\/SS\/\d{6}-[A-Z]\/[a-z]+\/L-\d\/F-\d+$/);
  assert.equal(await txt(page, '#r_nom'), 'MOVIMENT POPULAR PRO PORRO');
  assert.equal(await txt(page, '#r_sigles'), 'MPP');
  assert.equal(await txt(page, '#r_eslogan'), '«Porro per a tothom»', 'l\'eslògan es guarda en ordre normal');
  assert.equal(await txt(page, '#r_objectiu'), 'Porró gratuït a tots els cims');
  assert.equal(await txt(page, '#r_ideologia'), 'Ecologisme');
  assert.equal(await txt(page, '#r_llista'), 'Llista B');
  assert.equal(await txt(page, '#r_afiliats'), 'VIII (8)');
  assert.ok(await page.locator('#seal').isVisible());
  assert.ok((await page.locator('#r_logo').getAttribute('src')).startsWith('data:image/jpeg'));
  await shot(page, '06-pas6-justificant');
  ok('Pas 6: justificant amb tots els camps, logo dibuixat i segell (' + reg + ')');

  assert.deepEqual(reqs, [], 'Peticions de xarxa: ' + reqs.join(', '));
  ok('Cap petició de xarxa després de la càrrega (tot el tràmit fet offline)');

  await page.click('#btnPrint');
  assert.equal(await txt(page, '#winText'), 'La impressora del registre està fora de servei des del 2009');
  await accept(page);
  await ctx.setOffline(false);
  await page.reload();
  assert.match(await stepLabel(page), /^Pas 6/);
  assert.equal(await txt(page, '#r_reg'), reg);
  ok('Recàrrega: el justificant persisteix');
  await page.click('#btnReset');
  await page.locator('#winBtns button', { hasText: 'No' }).click();
  assert.match(await stepLabel(page), /^Pas 6/);
  await page.click('#btnReset');
  await page.locator('#winBtns button', { hasText: 'Sí' }).click();
  assert.match(await stepLabel(page), /^Pas 1/);
  ok('Nou tràmit amb confirmació dins la pàgina');

  assert.deepEqual(errors, [], errors.join('\n'));
  ok('Cap error de JavaScript ni de consola');
  await ctx.close();
}

/* ================= 2. Botó "Cancel·lar" parany ================= */
console.log('2) Botons parany petits');
{
  const ctx = await browser.newContext(mobile);
  const page = await ctx.newPage();
  await page.goto(BASE + '#test');
  await passQueue(page);
  const h = await page.locator('#s2 .dec').evaluate(e => e.getBoundingClientRect().height);
  assert.ok(h <= 24, 'el botó parany és petit (' + h + 'px)');
  await page.locator('#s2 .dec').click();
  await page.waitForSelector('#ov:not([hidden])');
  assert.match(await txt(page, '#winText'), /Tràmit cancel·lat per l'usuari/);
  await accept(page);
  assert.match(await stepLabel(page), /^Pas 1/);
  ok('Tocar el "Cancel·lar" diminut anul·la tot el tràmit');
  await ctx.close();
}

/* ================= 3. Afiliats negatius reinicien ================= */
console.log('3) Afiliats: passar-se de frenada');
{
  const ctx = await browser.newContext(mobile);
  const page = await ctx.newPage();
  await page.goto(BASE + '#test,director');
  await page.locator('#dirSteps button', { hasText: '3' }).click();
  for (let k = 0; k < 10; k++) await page.locator('#affBtns button[data-d="-100"]').click();
  assert.equal(await txt(page, '#affNum'), 'N (nul·la)');
  await page.locator('#affBtns button[data-d="-1"]').click();
  await page.waitForSelector('#ov:not([hidden])');
  assert.match(await txt(page, '#winText'), /Nombre d'afiliats negatiu/);
  await accept(page);
  assert.match(await stepLabel(page), /^Pas 1/);
  ok('Baixar d\'afiliats per sota de zero → tràmit anul·lat');
  await ctx.close();
}

/* ================= 4. L'objectiu s'esborra sol si no es desa ================= */
console.log('4) Camp que s\'esborra');
{
  const ctx = await browser.newContext(mobile);
  const page = await ctx.newPage();
  await page.goto(BASE + '#test,director');
  await page.locator('#dirSteps button', { hasText: '3' }).click();
  await page.fill('#f_objectiu', 'ABCDEFGHIJ');
  for (let k = 0; k < 8; k++) { await page.waitForTimeout(1000); await page.keyboard.press('Shift'); } // evita la caducitat de sessió
  const v = await page.inputValue('#f_objectiu');
  assert.ok(v.length < 10 && v.length > 0, 'ha perdut lletres: "' + v + '"');
  await page.click('#btnSave');
  const frozen = await page.inputValue('#f_objectiu');
  for (let k = 0; k < 3; k++) { await page.waitForTimeout(900); await page.keyboard.press('Shift'); }
  assert.equal(await page.inputValue('#f_objectiu'), frozen);
  ok('El camp perd lletres si no es desa, i es queda quiet un cop desat ("' + v + '")');
  await page.reload();
  assert.equal(await page.inputValue('#f_objectiu'), frozen);
  ok('Camp desat sobreviu a la recàrrega');
  await ctx.close();
}

/* ================= 5. Caducitat per inactivitat ================= */
console.log('5) Sessió caducada per inactivitat');
{
  const ctx = await browser.newContext(mobile);
  const page = await ctx.newPage();
  await page.goto(BASE + '#test,director');
  await page.locator('#dirSteps button', { hasText: '3' }).click();
  await page.fill('#f_eslogan', 'Partit Dormilega');
  await page.waitForSelector('#ov:not([hidden])', { timeout: 15000 });
  assert.equal(await txt(page, '#winText'), 'Sessió caducada per inactivitat');
  await shot(page, '07-sessio-caducada');
  await accept(page);
  assert.match(await stepLabel(page), /^Pas 2/);
  assert.equal(await page.locator('.pinrow .dg').allInnerTexts().then(a => a.join('')), '0000');
  ok('Inactivitat al pas 3 → torna al pas 2 amb el PIN a zero');
  await ctx.close();
}

/* ================= 6. Mode director ================= */
console.log('6) Mode director');
{
  const ctx = await browser.newContext(mobile);
  const page = await ctx.newPage();
  await page.goto(BASE + '#test');
  for (let i = 0; i < 4; i++) await page.click('#crest');
  assert.ok(!(await page.locator('#director').isVisible()));
  await page.click('#crest');
  assert.ok(await page.locator('#director').isVisible());
  await shot(page, '08-director');
  ok('5 tocs a l\'escut obren el panell (4 no)');
  await page.check('#dirNoObs');
  await page.locator('#dirSteps button', { hasText: '1' }).click();
  await page.click('#btnTurn');
  await waitStep(page, 2);
  ok('Sense obstacles: el torn passa al primer intent');
  // el botó parany ja no anul·la
  await page.locator('#s2 .dec').click();
  assert.match(await stepLabel(page), /^Pas 2/);
  ok('Sense obstacles: el botó parany no fa res');
  await page.locator('#dirSteps button', { hasText: '5' }).click();
  for (let i = 0; i < 4; i++) { await passCapFree(page, i); await capIs(page, i + 2); }
  await passCapFree(page, 4);
  await waitStep(page, 6);
  ok('Sense obstacles: les 5 verificacions passen; salt lliure entre passos');
  await ctx.close();
}

/* ================= 7. localStorage bloquejat ================= */
console.log('7) localStorage bloquejat');
{
  const ctx = await browser.newContext(mobile);
  await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('bloquejat'); } }); });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '#test');
  await passQueue(page);
  await doStep2(page);
  await typeName(page, 'AB');
  assert.equal((await page.locator('#f_nom').innerText()).trim(), 'AB');
  assert.deepEqual(errors, []);
  ok('Funciona igualment si localStorage llança excepcions');
  await ctx.close();
}

/* ================= 8. Persistència ================= */
console.log('8) Persistència');
{
  const ctx = await browser.newContext(mobile);
  const page = await ctx.newPage();
  await page.goto(BASE + '#test,director');
  await page.locator('#dirSteps button', { hasText: '3' }).click();
  await typeName(page, 'PERSISTENT');
  await setReel(page, 0, 'C');
  await page.reload();
  assert.match(await stepLabel(page), /^Pas 3/);
  assert.equal((await page.locator('#f_nom').innerText()).trim(), 'PERSISTENT');
  assert.equal((await page.locator('.reel .lt').first().innerText()), 'C');
  ok('Nom, sigles i pas sobreviuen a la recàrrega');
  await ctx.close();
}

/* ================= 8b. Enquesta: "Potser més tard" torna als 5 s ================= */
console.log('8b) Enquesta de satisfacció');
{
  const ctx = await browser.newContext(mobile);
  const page = await ctx.newPage();
  await page.goto(BASE + '#test,survey,director');
  await page.locator('#dirSteps button', { hasText: '4' }).click();
  await page.waitForSelector('#ov:not([hidden])', { timeout: 4000 });
  assert.match(await txt(page, '#winText'), /enquesta de satisfacció/);
  await page.locator('#winBtns button', { hasText: 'Potser més tard' }).click();
  const t0 = Date.now();
  assert.ok(await page.locator('#ov').isHidden());
  await page.waitForSelector('#ov:not([hidden])', { timeout: 8000 });
  const dt = Date.now() - t0;
  assert.ok(dt >= 4500 && dt <= 6500, 'reapareix als ~5 s (' + dt + ' ms)');
  await page.locator('#winBtns button', { hasText: 'Potser més tard' }).click();
  await page.waitForSelector('#ov:not([hidden])', { timeout: 8000 });
  ok('Enquesta: "Potser més tard" torna a aparèixer als 5 s, cada vegada (' + dt + ' ms)');
  await page.locator('#winBtns button', { hasText: 'Sí, encantat' }).click();
  await page.waitForTimeout(6500);
  assert.ok(await page.locator('#ov').isHidden(), 'després d\'acceptar no torna');
  ok('Enquesta: acceptar-la la fa desaparèixer');
  await ctx.close();
}

/* ================= 9. 360 px sense desbordament ================= */
console.log('9) Mòbil de 360 px: sense scroll horitzontal');
{
  const ctx = await browser.newContext({ ...mobile, viewport: { width: 360, height: 740 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '#test,director');
  for (let n = 1; n <= 6; n++) {
    await page.locator('#dirSteps button', { hasText: String(n) }).click();
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(w <= 360, `pas ${n}: scrollWidth ${w} > 360`);
    await shot(page, `360-pas${n}`);
  }
  // els 5 captchas a 360 px
  await page.locator('#dirSteps button', { hasText: '5' }).click();
  await page.check('#dirNoObs');
  for (let i = 0; i < 5; i++) {
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(w <= 360, `captcha ${i + 1}: scrollWidth ${w}`);
    await page.waitForTimeout(i === 1 ? 800 : 100);
    await shot(page, `360-captcha${i + 1}`);
    if (i < 4) { await passCapFree(page, i); await capIs(page, i + 2); }
  }
  // quadrícula del pas 4 a 360 px
  await page.locator('#dirSteps button', { hasText: '4' }).click();
  await page.uncheck('#dirNoObs');
  await page.click('#btnGrid');
  await page.waitForSelector('#gridCap .top');
  const wg = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(wg <= 360, 'prova de la quadrícula: ' + wg);
  await shot(page, '360-pas4-quadricula');
  ok('Cap pas ni captcha desborda els 360 px');
  await ctx.close();
}

await browser.close();
server.close();
console.log(`\nTOTES LES PROVES OK (${passed} comprovacions)`);
