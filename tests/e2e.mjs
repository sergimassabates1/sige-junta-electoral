// Prova extrem a extrem de SIGE (edició "perfil de personatge") amb Playwright, mòbil 390×844.
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
  if (!f.startsWith(ROOT) || !existsSync(f) || !extname(f)) { res.writeHead(404); return res.end('no'); }
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
const isPhotoErr = (t) => /personatges\/|Failed to load resource/.test(t);
const CHARS = JSON.parse(readFileSync(join(ROOT, 'index.html'), 'utf8').match(/var CHARS = (\[[\s\S]*?\]);\n/)[1]);

/* ---------- ajudes ---------- */
async function passQueue(page) {
  await page.click('#btnTurn');
  await page.waitForSelector('#turnWait:not([hidden])');
  await Promise.race([page.waitForSelector('#m1 .msg.err'), waitStep(page, 2)]);
  if (await page.locator('#m1 .msg.err').count()) { await page.click('#btnTurn'); }
  await waitStep(page, 2);
}
async function setPw(page, digits = '1711') {
  for (let i = 0; i < 4; i++) await page.locator('.pinrow input').nth(i).fill(digits[i]);
}
async function login(page, user, pw = '1711') {
  await page.fill('#f_user', user); await setPw(page, pw); await page.click('#btnLogin');
}
const capIs = (page, n) => page.waitForFunction((n) => document.getElementById('capHead').textContent === 'Verificació ' + n + ' de 7', n, { timeout: 20000 });
const fugClick = async (page) => { for (let k = 0; k < 14; k++) { await page.locator('.fug').click(); if (await page.locator('.fug.on').count()) return; } throw new Error('la casella no s\'ha deixat marcar'); };
async function holdPour(page, ms) {
  await page.locator('#pourBtn').scrollIntoViewIfNeeded();
  const b = await page.locator('#pourBtn').boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down(); await page.waitForTimeout(ms); await page.mouse.up();
}
const pourMs = async (page, delta = 0) => {
  const p = page.locator('.pour'); const t = +(await p.getAttribute('data-target')), r = +(await p.getAttribute('data-rate'));
  return t / r * 1000 + delta;
};
async function drawPorro(page) {
  await page.locator('.dcan').scrollIntoViewIfNeeded();
  const b = await page.locator('.dcan').boundingBox();
  const pts = [[.35, .9], [.25, .55], [.38, .3], [.4, .1], [.55, .1], [.57, .3], [.7, .55], [.62, .9], [.35, .9]];
  await page.mouse.move(b.x + b.width * pts[0][0], b.y + b.height * pts[0][1]); await page.mouse.down();
  for (const [x, y] of pts.slice(1)) await page.mouse.move(b.x + b.width * x, b.y + b.height * y, { steps: 4 });
  await page.mouse.up();
}
// arrossega el porró: a la boca (hit=true) o un tros a prop d'on era (hit=false)
async function dragPorro(page, hit) {
  await page.locator('.dragA').scrollIntoViewIfNeeded();
  const A = await page.locator('.dragA').boundingBox();
  const P = await page.locator('.dporro').boundingBox();
  const sx = P.x + P.width / 2, sy = P.y + P.height / 2;
  let tx, ty;
  if (hit) { tx = A.x + +(await page.locator('.dragA').getAttribute('data-mx')); ty = A.y + +(await page.locator('.dragA').getAttribute('data-my')); }
  else { tx = sx + 20; ty = sy - 10; }
  await page.mouse.move(sx, sy); await page.mouse.down();
  await page.mouse.move((sx + tx) / 2, (sy + ty) / 2, { steps: 5 });
  await page.mouse.move(tx, ty, { steps: 5 });
  await page.mouse.up();
}
// aixeca el porró per sobre de la boca (el broc, inclinat, queda damunt la boca) sense deixar-lo anar
async function aimPorro(page) {
  await page.locator('.dragA').scrollIntoViewIfNeeded();
  const A = await page.locator('.dragA').boundingBox();
  const P = await page.locator('.dporro').boundingBox();
  const sx = P.x + P.width / 2, sy = P.y + P.height / 2;
  const mcx = A.x + +(await page.locator('.dragA').getAttribute('data-mx')), mcy = A.y + +(await page.locator('.dragA').getAttribute('data-my'));
  const tx = mcx - 46, ty = mcy - 90;
  await page.mouse.move(sx, sy); await page.mouse.down();
  await page.mouse.move((sx + tx) / 2, (sy + ty) / 2, { steps: 5 });
  await page.mouse.move(tx, ty, { steps: 5 });
}
// Passa la verificació i (0-6) correctament. (0 i 6 són la casella fugitiva.)
async function passCap(page, i) {
  if (i === 0 || i === 6) await fugClick(page);
  if (i === 1) await dragPorro(page, true);
  if (i === 2) await holdPour(page, await pourMs(page));
  if (i === 3) { for (let k = 0; k < 5; k++) await page.locator(`.ob[data-i="${k}"]`).click(); await page.click('#btnCap'); }
  if (i === 4) { await page.waitForSelector('.lamp.g.on'); await page.click('#goBtn'); }
  if (i === 5) { await drawPorro(page); await page.click('#btnCap'); await page.waitForSelector('#btnCap:has-text("Continuar")'); await page.click('#btnCap'); }
}
// Amb "Sense obstacles": passa qualsevol prova amb el gest mínim
async function passCapFree(page, i) {
  if (i === 0 || i === 6) await page.locator('.fug').click();
  if (i === 1) await dragPorro(page, false);
  if (i === 2) await holdPour(page, 300);
  if (i === 4) await page.click('#goBtn');
  if (i === 3 || i === 5) await page.click('#btnCap');
}

/* ================= 1. Recorregut complet, offline, amb una verificació fallida ================= */
console.log('1) Recorregut complet (offline, #test)');
{
  const ctx = await browser.newContext(mobile);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !isPhotoErr(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(BASE + '#test');
  await page.waitForLoadState('load');
  await page.waitForTimeout(1500);
  const reqs = [];
  page.on('request', r => { if (!/^(blob|data):/.test(r.url()) && !/personatges\//.test(r.url())) reqs.push(r.url()); });
  await ctx.setOffline(true);
  ok('Pàgina carregada i xarxa tallada');

  // Pas 1: la cua
  assert.match(await stepLabel(page), /^Pas 1 de 4 · 3% completat/);
  await shot(page, '01-pas1-inici');
  await page.click('#btnTurn');
  await page.waitForSelector('#turnWait:not([hidden])');
  assert.match(await txt(page, '#turnAhead'), /^Persones davant seu: \d{2}\.\d{3}$/);
  assert.match(await txt(page, '#turnTime'), /^Espera estimada: 00:03$/);
  await page.waitForFunction(() => /colat .*\+2 s/.test(document.getElementById('turnNote').textContent));
  await shot(page, '01c-pas1-colats');
  await page.waitForSelector('#m1 .msg.err');
  assert.equal(await txt(page, '#m1 .msg'), "S'ha esgotat el cupo diari de torns. Torni-ho a provar.");
  await page.click('#btnTurn');
  await waitStep(page, 2);
  ok('Pas 1: cua de 5 s amb xifres grans, colada (+2 s) i primer intent → cupo esgotat');

  // Pas 2: identificació = nom llatí + 1711
  assert.match(await stepLabel(page), /^Pas 2 de 4 · 24% completat/);
  assert.equal(await page.locator('#arena, #f_nom, #f_ideologia, #paint').count(), 0, 'ja no hi ha candidatura, formulari ni logo');
  await shot(page, '02-pas2-login');
  await page.click('#btnLogin');
  assert.match(await txt(page, '#e_user'), /Usuari desconegut/);
  assert.match(await txt(page, '#e_pin'), /Contrasenya incorrecta/);
  await page.fill('#f_user', 'Fatxus tradicionalis'); await page.click('#btnLogin');
  assert.match(await txt(page, '#e_user'), /Usuari desconegut/, 'un personatge que ja no hi és no entra');
  await page.fill('#f_user', 'Tung Tung Sahur'); await setPw(page, '3141'); await page.click('#btnLogin');
  assert.equal(await page.locator('#e_user').isVisible(), false);
  assert.match(await txt(page, '#e_pin'), /Contrasenya incorrecta/);
  assert.match(await stepLabel(page), /^Pas 2/);
  ok('Pas 2: usuari desconegut i contrasenya errònia (3141) no deixen passar');
  assert.ok(await page.locator('#pinTip').isHidden() && await page.locator('#userTip').isHidden());
  await page.click('#pinInfo'); await page.click('#userInfo');
  assert.match(await txt(page, '#pinTip'), /1711/);
  assert.match(await txt(page, '#userTip'), /nom de l'espècie en llatí/);
  await shot(page, '02a-pas2-tooltips');
  await setPw(page, '1711');
  assert.equal(await page.locator('.pinrow .dg').allInnerTexts().then(a => a.join('')), '1711');
  await page.fill('#f_user', 'tung tung sahur '); // majúscules/espais no importen
  await page.click('#btnLogin');
  await waitStep(page, 3);
  ok('Pas 2: els tooltips «i» mostren l\'ajuda (1711); l\'usuari és el nom llatí i entra');

  // Pas 3: set verificacions
  assert.match(await stepLabel(page), /^Pas 3 de 4 · 88% completat/);
  assert.equal(await txt(page, '#capHead'), 'Verificació 1 de 7');
  await shot(page, '03a-captcha1-casella-fugitiva');
  await page.locator('.fug').click();
  assert.equal(await page.locator('.fug.on').count(), 0, 'la casella fuig');
  assert.match(await txt(page, '#m5 .msg'), /S'ha mogut.*\(1\)/);
  await page.locator('.fug').click();
  assert.match(await txt(page, '#m5 .msg'), /\(2\)/);
  await fugClick(page);
  await page.waitForSelector('#m5 .msg.err');
  assert.equal(await txt(page, '#m5 .msg'), 'Verificació fallida. Sembla que vostè és un robot.');
  ok('Captcha 1: la casella fuig vàries vegades; el primer cop, encara que la marqui bé → «robot»');
  await fugClick(page);
  await capIs(page, 2);

  await shot(page, '03b-captcha2-porro-boca');
  await dragPorro(page, false);
  await page.waitForSelector('.strm path');           // el raig surt del broc
  await page.waitForTimeout(180);
  await shot(page, '03b2-porro-vessa');
  assert.ok(await page.locator('.dporro.anim').count(), 'el porró s\'inclina');
  await page.waitForFunction(() => /Ha vessat el porró! \(Intent 1\/3\)/.test(document.querySelector('#m5 .msg')?.textContent || ''));
  await page.waitForFunction(() => !document.querySelector('.dporro.anim'));  // torna a lloc
  await aimPorro(page);
  await page.waitForSelector('.strm path.pv');          // en apuntar: s'inclina i es veu on caurà el raig
  assert.equal(await txt(page, '.mouth'), '😮');
  await shot(page, '03b3-porro-apunta');
  await page.mouse.up();
  await page.waitForSelector('.strm path:not(.pv)');
  await page.waitForTimeout(180);
  await shot(page, '03b4-porro-encert');
  await capIs(page, 3);
  ok('Captcha 2: porró inclinat amb raig; fallar = vessa al terra; aixecar-lo per sobre de la boca = hi cau');

  await shot(page, '03c-captcha3-abocar');
  await holdPour(page, Math.max(200, await pourMs(page, -900)));
  assert.match(await txt(page, '#m5 .msg'), /Intent 1\/3/);
  await page.waitForTimeout(1200);
  await passCap(page, 2); await capIs(page, 4);
  ok('Captcha 3: abocar el porró fins a la ratlla');

  await shot(page, '03d-captcha4-promesa');
  for (const k of [1, 0, 2, 3, 4]) await page.locator(`.ob[data-i="${k}"]`).click(); // ordre equivocat
  await page.click('#btnCap');
  await page.waitForSelector('#ov:not([hidden])');
  assert.match(await txt(page, '#winText'), /Haurà de tornar a començar la verificació/);
  await accept(page);
  assert.equal(await txt(page, '#capHead'), 'Verificació 1 de 7');
  ok('Un error de verificació reinicia les proves (tornem a la 1)');
  await passCap(page, 0); await capIs(page, 2);
  await passCap(page, 1); await capIs(page, 3);
  await passCap(page, 2); await capIs(page, 4);
  await page.locator('.ob[data-i="0"]').click(); await page.locator('.ob[data-i="1"]').click();
  await page.click('#btnCap');
  await page.waitForSelector('#m5 .msg.warn');
  assert.match(await txt(page, '#m5 .msg'), /Falten fets per ordenar \(2\/5\)/);
  await page.locator('.ob[data-i="1"]').click();
  assert.equal((await txt(page, '.ob[data-i="0"] .n')).trim(), '1');
  await page.locator('.ob[data-i="1"]').click();
  for (const k of [2, 3, 4]) await page.locator(`.ob[data-i="${k}"]`).click();
  await page.click('#btnCap');
  await capIs(page, 5);
  ok('Captcha 4: ordenar el cicle de vida d\'una promesa electoral');

  await shot(page, '03e-captcha5-semafor');
  await page.click('#goBtn');
  assert.match(await txt(page, '#m5 .msg'), /Massa aviat.*Intent 1\/3/);
  await page.waitForTimeout(1100);
  await page.waitForSelector('.lamp.g.on');
  await page.click('#goBtn');
  assert.match(await txt(page, '#m5 .msg'), /^Temps de reacció: \d+ ms\./);
  await capIs(page, 6);
  ok('Captcha 5: semàfor');

  await page.click('#btnCap');
  await page.waitForSelector('#m5 .msg.warn');
  assert.match(await txt(page, '#m5 .msg'), /La IA no veu res/);
  await drawPorro(page);
  await page.click('#btnCap');
  await page.waitForSelector('#m5 .msg.ok');
  assert.match(await txt(page, '#m5 .msg'), /^Resultat de la IA: .*porró \d+%/);
  assert.equal(await txt(page, '#btnCap'), 'Continuar »');
  await shot(page, '03f-captcha6-veredicte');
  await page.waitForTimeout(900);
  assert.equal(await txt(page, '#capHead'), 'Verificació 6 de 7', 'no avança sol');
  await page.click('#btnCap');
  await capIs(page, 7);
  ok('Captcha 6: dibuixar un porró; veredicte i botó «Continuar»');

  await shot(page, '03g-captcha7-robot-final');
  await fugClick(page);
  await waitStep(page, 4);
  ok('Captcha 7: tornar a demostrar que no és un robot');

  // Pas 4: perfil
  const me = CHARS.find(c => c.especie === 'Tung Tung Sahur');
  assert.match(await stepLabel(page), /^Pas 4 de 4 · 100% completat/);
  assert.equal(await txt(page, '#p_user'), 'Tung Tung Sahur');
  assert.equal(await txt(page, '#p_tipus'), me.tipus);
  assert.equal(await txt(page, '#p_edat'), me.edat + ' anys');
  assert.equal(await txt(page, '#p_vestit'), me.vestit);
  assert.equal(await txt(page, '#p_salut'), me.salut);
  assert.ok(await page.locator('#p_bromaBox').isVisible() && /six seven/i.test(await txt(page, '#p_broma')));
  assert.equal((await txt(page, '#p_photo')).trim(), me.ic, 'sense foto, es veu l\'emoji del personatge');
  await shot(page, '04-pas4-perfil');
  ok('Pas 4: perfil del personatge amb les seves dades i la broma reservada');

  assert.deepEqual(reqs, [], 'Peticions de xarxa: ' + reqs.join(', '));
  ok('Cap petició de xarxa després de la càrrega (tot fet offline)');
  await page.reload();
  assert.match(await stepLabel(page), /^Pas 4/);
  assert.equal(await txt(page, '#p_user'), 'Tung Tung Sahur');
  ok('Recàrrega: el perfil persisteix');
  await page.click('#btnReset');
  await page.waitForSelector('#ov:not([hidden])');
  await page.locator('#winBtns button', { hasText: 'Sí' }).click();
  assert.match(await stepLabel(page), /^Pas 1/);
  ok('Tancar la sessió (confirmació dins la pàgina) torna al principi');
  assert.deepEqual(errors, [], 'Errors de JS/consola: ' + errors.join(' | '));
  ok('Cap error de JavaScript ni de consola');
  await ctx.close();
}

/* ================= 2. Foto del perfil ================= */
console.log('2) Foto del perfil');
{
  const ctx = await browser.newContext({ ...mobile, serviceWorkers: 'block' }); // el SW atendria la imatge abans de page.route
  const page = await ctx.newPage();
  // una foto d'exemple per al personatge "Dora Emus": un PNG d'1 píxel
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  await page.route('**/personatges/dora-emus.jpg', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await page.goto(BASE + '#test,director');
  await page.locator('#dirSteps button', { hasText: '2' }).click();
  await login(page, 'Dora Emus');
  await waitStep(page, 3);
  await page.locator('#dirSteps button', { hasText: '4' }).click();
  await page.waitForSelector('#p_photo img');
  assert.equal(await txt(page, '#p_tipus'), 'Gat còsmic');
  ok('Si hi ha foto a personatges/<especie>.jpg, es mostra; si no, l\'emoji');
  await ctx.close();
}

/* ================= 3. Els 14 personatges entren amb el seu nom llatí ================= */
console.log('3) Tots els personatges');
{
  const ctx = await browser.newContext(mobile);
  const page = await ctx.newPage();
  await page.goto(BASE + '#test,director');
  for (const c of CHARS) {
    await page.locator('#dirSteps button', { hasText: '2' }).click();
    await login(page, c.especie.toUpperCase());
    await waitStep(page, 3);
    await page.locator('#dirSteps button', { hasText: '4' }).click();
    assert.equal(await txt(page, '#p_user'), c.especie);
    assert.equal(await txt(page, '#p_tipus'), c.tipus);
    assert.equal(await page.locator('#p_bromaBox').isVisible(), !!c.broma);
  }
  assert.equal(CHARS.length, 14);
  ok('Els 14 personatges entren amb el seu nom en llatí i veuen el seu perfil');
  await page.locator('#dirSteps button', { hasText: '2' }).click();
  await login(page, 'Dora Emu'); // una errada d'un caràcter: s'accepta
  await waitStep(page, 3);
  ok('Una errada d\'un caràcter en el nom d\'usuari s\'accepta');
  await ctx.close();
}

/* ================= 4. Botó parany ================= */
console.log('4) Botons parany petits');
{
  const ctx = await browser.newContext(mobile);
  const page = await ctx.newPage();
  await page.goto(BASE + '#test');
  await passQueue(page);
  await page.locator('#s2 .dec').click();
  await page.waitForSelector('#ov:not([hidden])');
  assert.match(await txt(page, '#winText'), /Tràmit cancel·lat per l'usuari/);
  await accept(page);
  assert.match(await stepLabel(page), /^Pas 1/);
  ok('Tocar el «Cancel·lar» diminut anul·la tot el tràmit');
  await ctx.close();
}

/* ================= 5. Caducitat per inactivitat (pas 2) ================= */
console.log('5) Sessió caducada per inactivitat');
{
  const ctx = await browser.newContext(mobile);
  const page = await ctx.newPage();
  await page.goto(BASE + '#test');
  await passQueue(page);
  await page.fill('#f_user', 'dora emus'); await setPw(page, '1711');
  await page.waitForSelector('#ov:not([hidden])', { timeout: 15000 });
  assert.equal(await txt(page, '#winText'), 'Sessió caducada per inactivitat');
  await accept(page);
  assert.match(await stepLabel(page), /^Pas 2/);
  assert.equal(await page.locator('#f_user').inputValue(), '');
  assert.equal(await page.locator('.pinrow .dg').allInnerTexts().then(a => a.join('')), '0000');
  ok('Inactivitat al pas 2 → s\'esborren usuari i contrasenya');
  await ctx.close();
}

/* ================= 6. Mode director i «Sense obstacles» ================= */
console.log('6) Mode director');
{
  const ctx = await browser.newContext(mobile);
  const page = await ctx.newPage();
  await page.goto(BASE + '#test');
  for (let i = 0; i < 4; i++) await page.click('#crest');
  assert.ok(!(await page.locator('#director').isVisible()));
  await page.click('#crest');
  assert.ok(await page.locator('#director').isVisible());
  assert.equal(await page.locator('#dirSteps button').count(), 4);
  await shot(page, '08-director');
  ok('5 tocs a l\'escut obren el panell (4 no); 4 botons de pas');
  await page.check('#dirNoObs');
  await page.locator('#dirSteps button', { hasText: '1' }).click();
  await page.click('#btnTurn');
  await waitStep(page, 2);
  ok('Sense obstacles: el torn passa al primer intent');
  await page.locator('#s2 .dec').click();
  assert.match(await stepLabel(page), /^Pas 2/);
  await page.click('#btnLogin'); // ni usuari ni contrasenya: entra igualment
  await waitStep(page, 3);
  ok('Sense obstacles: el botó parany no fa res i el login deixa entrar');
  for (let i = 0; i < 6; i++) { await passCapFree(page, i); await capIs(page, i + 2); }
  await passCapFree(page, 6);
  await waitStep(page, 4);
  assert.equal(await txt(page, '#p_user'), CHARS[0].especie);
  ok('Sense obstacles: les 7 verificacions passen i surt el perfil del primer personatge');
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
  await login(page, 'Dora Emus');
  await waitStep(page, 3);
  assert.deepEqual(errors, []);
  ok('Funciona igualment si localStorage llança excepcions');
  await ctx.close();
}

/* ================= 8. Persistència ================= */
console.log('8) Persistència');
{
  const ctx = await browser.newContext(mobile);
  const page = await ctx.newPage();
  await page.goto(BASE + '#test');
  await passQueue(page);
  await login(page, 'Titanus mandibulus');
  await waitStep(page, 3);
  await passCap(page, 0); await page.waitForSelector('#m5 .msg.err'); // el parany del robot, el primer cop
  await passCap(page, 0); await capIs(page, 2);
  await page.reload();
  assert.match(await stepLabel(page), /^Pas 3/);
  assert.equal(await txt(page, '#capHead'), 'Verificació 2 de 7');
  ok('Pas i verificació en curs sobreviuen a la recàrrega');
  await ctx.close();
}

/* ================= 8b. Enquesta: «Potser més tard» torna als 5 s ================= */
console.log('8b) Enquesta de satisfacció');
{
  const ctx = await browser.newContext(mobile);
  const page = await ctx.newPage();
  await page.goto(BASE + '#test,survey,director');
  await page.locator('#dirSteps button', { hasText: '3' }).click();
  await page.waitForSelector('#ov:not([hidden])', { timeout: 4000 });
  assert.match(await txt(page, '#winText'), /enquesta de satisfacció[\s\S]*veritat o fals/);
  await page.locator('#winBtns button', { hasText: 'Potser més tard' }).click();
  const t0 = Date.now();
  assert.ok(await page.locator('#ov').isHidden());
  await page.waitForSelector('#ov:not([hidden])', { timeout: 8000 });
  const dt = Date.now() - t0;
  assert.ok(dt >= 4500 && dt <= 6500, 'reapareix als ~5 s (' + dt + ' ms)');
  const ans = async () => await page.locator('#winText').getAttribute('data-ans');
  let a = await ans(), wrongSeen = false;
  if (a !== 'any') {
    await page.locator('#winBtns button', { hasText: a === 'veritat' ? 'Fals' : 'Veritat' }).click();
    await page.waitForSelector('#ov:not([hidden])');
    assert.match(await txt(page, '#winText'), /Torni-ho a provar/);
    wrongSeen = true; a = await ans();
  }
  ok('Enquesta: captcha de veritat/fals; «Potser més tard» torna als 5 s (' + dt + ' ms)' + (wrongSeen ? '; una resposta errònia en demana una altra' : ''));
  await page.locator('#winBtns button', { hasText: a === 'fals' ? 'Fals' : 'Veritat' }).click();
  await page.waitForTimeout(6500);
  assert.ok(await page.locator('#ov').isHidden(), 'després de contestar bé no torna');
  ok('Enquesta: contestar-la bé la fa desaparèixer');
  await ctx.close();
}

/* ================= 9. 360 px sense desbordament ================= */
console.log('9) Mòbil de 360 px: sense scroll horitzontal');
{
  const ctx = await browser.newContext({ ...mobile, viewport: { width: 360, height: 740 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '#test,director');
  for (let n = 1; n <= 4; n++) {
    await page.locator('#dirSteps button', { hasText: String(n) }).click();
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(w <= 360, `pas ${n}: scrollWidth ${w} > 360`);
    await shot(page, `360-pas${n}`);
  }
  await page.locator('#dirSteps button', { hasText: '3' }).click();
  await page.check('#dirNoObs');
  await page.click('#dirClose'); // el panell tapa els botons del final de la pantalla
  for (let i = 0; i < 7; i++) {
    await page.waitForTimeout(i === 5 ? 300 : 100);
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(w <= 360, `captcha ${i + 1}: scrollWidth ${w}`);
    await shot(page, `360-captcha${i + 1}`);
    if (i < 6) { await passCapFree(page, i); await capIs(page, i + 2); }
  }
  ok('Cap pas ni captcha desborda els 360 px');
  await ctx.close();
}

await browser.close();
server.close();
console.log(`\nTOTES LES PROVES OK (${passed} comprovacions)`);
