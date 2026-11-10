import { chromium } from 'playwright';
const URL = 'https://sergimassabates1.github.io/sige-junta-electoral/';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const r = await p.goto(URL + '#test');
console.log('HTTP', r.status(), await p.title());
await p.waitForLoadState('load'); await p.waitForTimeout(2500);
const sw = await p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!(r && (r.active || r.installing || r.waiting)); });
console.log('service worker registrat:', sw);
await ctx.setOffline(true);
await p.reload(); // recàrrega SENSE xarxa: ha de servir-la la memòria cau
console.log('offline reload ->', await p.locator('#progLbl').innerText());
await p.click('#btnTurn'); await p.waitForSelector('#m1 .msg.err'); await p.click('#btnTurn');
await p.waitForFunction(() => document.getElementById('progLbl').textContent.startsWith('Pas 2'));
console.log('offline interactiu ->', await p.locator('#progLbl').innerText());
await b.close();
