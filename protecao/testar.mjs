import { chromium } from 'playwright-core';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const arquivo = join(RAIZ, 'entrega-cliente', 'index.html');
const html = readFileSync(arquivo);

// Servidor local = contexto seguro (equivale a https para o SubtleCrypto)
const srv = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}).listen(0);
const porta = srv.address().port;

const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const navegador = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const pg = await navegador.newPage({ viewport: { width: 1440, height: 900 } });
const erros = [];
pg.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
pg.on('pageerror', e => erros.push('pageerror: ' + e.message));

await pg.goto(`http://localhost:${porta}/`, { waitUntil: 'load' });
await pg.waitForTimeout(1500);

const r = await pg.evaluate(() => ({
  temHero: !!document.querySelector('.hero'),
  temNav: !!document.querySelector('header nav'),
  temFrase: document.body.innerText.includes('Plantão criminal 24 horas'),
  temMarca: !!document.getElementById('__wm'),
  temCover: !!document.getElementById('__cover'),
  qtdSecoes: document.querySelectorAll('section').length,
  qtdImgs: [...document.images].filter(i => i.currentSrc && i.currentSrc.startsWith('data:')).length,
  titulo: document.title,
}));

await pg.screenshot({ path: join(RAIZ, 'protecao', 'preview.png'), fullPage: false });
await navegador.close();
srv.close();

console.log('  Render:', JSON.stringify(r, null, 2));
console.log('  Erros de console/página:', erros.length ? erros : 'nenhum');
console.log(r.temHero && r.temFrase && r.qtdSecoes >= 8 ? '\n  ✅ PASSOU: página descriptografou e montou.' : '\n  ❌ FALHOU: algo não montou.');
