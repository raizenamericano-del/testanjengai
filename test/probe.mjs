/* quick one-page inspector: node test/probe.mjs tools.html
   prints every console error + whether the page rendered. Handy while fixing pages. */
import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const PORT = 4325, page_ = process.argv[2] || 'index.html';
const srv = spawn('node', ['test/static-server.mjs', String(PORT)], { stdio: ['ignore', 'ignore', 'inherit'] });
await sleep(500);
const b = await puppeteer.launch({ headless: 'shell', args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('console', m => console.log('[' + m.type() + ']', m.text().slice(0, 300)));
p.on('pageerror', e => console.log('[PAGEERROR]', e.message, '\n', String(e.stack).split('\n').slice(1, 4).join('\n')));
p.on('requestfailed', r => console.log('[REQFAIL]', r.url().slice(0, 120), r.failure()?.errorText));
const res = await p.goto(`http://127.0.0.1:${PORT}/${page_}`, { waitUntil: 'load', timeout: 20000 });
await sleep(1200);
console.log('status', res.status(), '·', page_);
console.log(await p.evaluate(() => ({
  rootKids: document.body.children.length,
  html: document.body.innerHTML.slice(0, 260),
  tools: document.querySelectorAll('#tools .tool').length,
  gridInfo: (() => { const g = document.querySelector('div.wrap>div:last-child'); const byId = document.getElementById('tools'); return { lastCls: g && g.className, lastKids: g && g.children.length, byIdKids: byId && byId.children.length, ids: [...document.querySelectorAll('[id]')].map(x => x.tagName + '#' + x.id + '.' + x.className).slice(0, 6) }; })(),
  msgs: document.querySelectorAll('#msgs *').length,
  tabs: document.querySelectorAll('.tabs button').length,
  nas: !!window.NAS
})));
await b.close(); srv.kill();
