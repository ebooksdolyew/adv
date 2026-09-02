#!/usr/bin/env node
/* ==========================================================================
   proteger-web.mjs — Blindagem de sites estáticos (HTML/CSS/JS)
   --------------------------------------------------------------------------
   Gera uma versão protegida de uma página: embute os assets como data: URI,
   minifica o CSS, ofusca o JS, junta tudo num só documento, criptografa com
   AES-256-GCM + máscara XOR e monta a página só em runtime, através de um
   carregador ofuscado com bloqueios anti-devtools e marca d'água.

   Uso:
     node proteger-web.mjs [entrada.html] [opções]

   Opções:
     --out <dir>      pasta de saída (padrão: entrega-protegida)
     --marca "texto"  texto da marca d'água (padrão: "Documento confidencial")
     --sem-marca      não aplica marca d'água
     --sem-bloqueio   não aplica bloqueios de atalho/devtools (só criptografa)

   O código-fonte original NÃO é alterado; a saída é sempre um arquivo novo.
   Dependências (instaladas automaticamente na 1ª execução): javascript-obfuscator, clean-css
   ========================================================================== */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { randomBytes, createCipheriv } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, basename, extname } from 'node:path';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

/* --- carrega dependências, instalando-as na 1ª vez se faltarem --- */
async function dep(nome) {
  try { return await import(nome); }
  catch {
    console.log(`  Instalando dependências (só na primeira vez)...`);
    execSync('npm install --no-audit --no-fund', { cwd: __dirname, stdio: 'inherit' });
    return await import(nome);
  }
}
const JsObfuscator = (await dep('javascript-obfuscator')).default;
const CleanCSS = (await dep('clean-css')).default;

/* --------------------------------- args --------------------------------- */
const argv = process.argv.slice(2);
let entrada = 'index.html';
let outDir = 'entrega-protegida';
let marca = 'Documento confidencial';
let comMarca = true, comBloqueio = true;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--out') outDir = argv[++i];
  else if (a === '--marca') marca = argv[++i];
  else if (a === '--sem-marca') comMarca = false;
  else if (a === '--sem-bloqueio') comBloqueio = false;
  else if (!a.startsWith('--')) entrada = a;
}

const entradaAbs = resolve(process.cwd(), entrada);
if (!existsSync(entradaAbs)) { console.error(`  Arquivo não encontrado: ${entrada}`); process.exit(1); }
const baseDir = dirname(entradaAbs);

/* ------------------------- inline de assets ----------------------------- */
const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  gif: 'image/gif', svg: 'image/svg+xml', avif: 'image/avif', ico: 'image/x-icon',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
  mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', ogg: 'audio/ogg', m4a: 'audio/mp4',
};
const EXTS = Object.keys(MIME).join('|');
const ASSET_RE = new RegExp(`([^\\s"'()]+?\\.(?:${EXTS}))(\\?[^\\s"'()]*)?`, 'gi');

function dataUri(fileAbs) {
  const ext = extname(fileAbs).slice(1).toLowerCase();
  return `data:${MIME[ext] || 'application/octet-stream'};base64,${readFileSync(fileAbs).toString('base64')}`;
}
let nAssets = 0;
function inlineAssets(texto, dir) {
  return texto.replace(ASSET_RE, (m, p1) => {
    let rel = p1;
    try { rel = decodeURI(p1); } catch {}
    if (/^(https?:)?\/\//i.test(rel) || rel.startsWith('data:')) return m; // externo / já data URI
    const abs = resolve(dir, rel);
    if (!existsSync(abs)) return m;
    nAssets++;
    return dataUri(abs);
  });
}

/* ------------------------- minificar / ofuscar -------------------------- */
function minCss(css, dir) {
  css = inlineAssets(css, dir);
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');          // base64 nunca contém '*': seguro
  const out = new CleanCSS({ level: 0 }).minify(css);   // level 0: não descarta/mescla regras
  return out.styles || css;
}
function ofuscarJs(js) {
  try {
    return JsObfuscator.obfuscate(js, {
      compact: true, controlFlowFlattening: true, controlFlowFlatteningThreshold: 0.5,
      deadCodeInjection: true, deadCodeInjectionThreshold: 0.3,
      identifierNamesGenerator: 'hexadecimal', numbersToExpressions: true, simplify: true,
      splitStrings: true, splitStringsChunkLength: 10, stringArray: true,
      stringArrayEncoding: ['base64'], stringArrayThreshold: 1, transformObjectKeys: true,
      unicodeEscapeSequence: false,
    }).getObfuscatedCode();
  } catch (e) {
    console.warn('  (aviso) não foi possível ofuscar um bloco JS (mantido minificado):', e.message);
    return js;
  }
}
const escaparScript = (js) => js.replace(/<\/script/gi, '<\\/script');

/* ---------------------------- montar o documento ------------------------ */
let html = readFileSync(entradaAbs, 'utf8');

// 1) <link rel=stylesheet href=local.css>  -> <style> minificado (assets relativos ao css)
html = html.replace(/<link\b[^>]*?href=["']([^"']+\.css)["'][^>]*>/gi, (m, href) => {
  if (/^(https?:)?\/\//i.test(href)) return m;
  const cssAbs = resolve(baseDir, href);
  if (!existsSync(cssAbs)) return m;
  return `<style>${minCss(readFileSync(cssAbs, 'utf8'), dirname(cssAbs))}</style>`;
});

// 2) <script src=local.js> -> <script> ofuscado
html = html.replace(/<script\b[^>]*?\bsrc=["']([^"']+\.js)["'][^>]*><\/script>/gi, (m, src) => {
  if (/^(https?:)?\/\//i.test(src)) return m;
  const jsAbs = resolve(baseDir, src);
  if (!existsSync(jsAbs)) return m;
  return `<script>${escaparScript(ofuscarJs(readFileSync(jsAbs, 'utf8')))}</script>`;
});

// 3) blocos <style> inline -> minificados
html = html.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (m, attrs, css) =>
  `<style${attrs}>${minCss(css, baseDir)}</style>`);

// 4) blocos <script> inline (js clássico, sem src, sem type=module) -> ofuscados
html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (m, attrs, js) => {
  if (/\bsrc=/i.test(attrs)) return m;
  if (/type=["'](?!text\/javascript|application\/javascript)[^"']+["']/i.test(attrs)) return m; // json/module: não mexe
  if (!js.trim()) return m;
  return `<script${attrs}>${escaparScript(ofuscarJs(js))}</script>`;
});

// 5) assets restantes em atributos (img src, srcset, favicon, poster, etc.)
html = inlineAssets(html, baseDir);

// 6) remove comentários HTML (não revelam mais a estrutura das seções)
html = html.replace(/<!--[\s\S]*?-->/g, '');

const documentoReal = html;

/* ------------------------------ criptografia ---------------------------- */
const chaveAes = randomBytes(32), iv = randomBytes(12), chaveXor = randomBytes(32);
const cipher = createCipheriv('aes-256-gcm', chaveAes, iv);
const ct = Buffer.concat([cipher.update(Buffer.from(documentoReal, 'utf8')), cipher.final()]);
const tag = cipher.getAuthTag();
const bruto = Buffer.concat([iv, ct, tag]);
const mascarado = Buffer.alloc(bruto.length);
for (let i = 0; i < bruto.length; i++) mascarado[i] = bruto[i] ^ chaveXor[i % chaveXor.length];
const cargaB64 = mascarado.toString('base64');
const aB = (buf) => '[' + [...buf].join(',') + ']';

/* ------------------------------ carregador ------------------------------ */
const carregador = `
(function () {
  "use strict";
  var CARGA = window.__P; try { delete window.__P; } catch (e) { window.__P = void 0; }
  var KX = new Uint8Array(${aB(chaveXor)});
  var KA = new Uint8Array(${aB(chaveAes)});
  var IVLEN = 12;
  var MARCA = ${JSON.stringify(marca)};
  var DATA = ${JSON.stringify(new Date().toLocaleDateString('pt-BR'))};
  var COM_MARCA = ${comMarca ? 'true' : 'false'};
  var COM_BLOQUEIO = ${comBloqueio ? 'true' : 'false'};

  function b64ToBytes(b64){ var bin=atob(b64),n=bin.length,o=new Uint8Array(n); for(var i=0;i<n;i++)o[i]=bin.charCodeAt(i); return o; }

  async function abrir(){
    try{
      var m=b64ToBytes(CARGA), b=new Uint8Array(m.length);
      for(var i=0;i<m.length;i++) b[i]=m[i]^KX[i%KX.length];
      var iv=b.slice(0,IVLEN), ctTag=b.slice(IVLEN);
      var k=await crypto.subtle.importKey("raw",KA,{name:"AES-GCM"},false,["decrypt"]);
      var claro=await crypto.subtle.decrypt({name:"AES-GCM",iv:iv},k,ctTag);
      montar(new TextDecoder("utf-8").decode(claro));
    }catch(e){
      document.documentElement.innerHTML='<body style="font-family:sans-serif;background:#111;color:#ddd;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:24px"><div><h1>Conte\\u00fado protegido</h1><p>Use um navegador atualizado (Chrome, Edge ou Firefox) e acesse por um link https.</p></div></body>';
    }
  }
  function montar(t){ document.open(); document.write(t); document.close(); setTimeout(blindar,60); }

  function blindar(){
    var doc=document, body=doc.body||doc.documentElement;
    var st=doc.createElement("style");
    st.textContent="*{-webkit-user-select:none!important;-moz-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important}"+
      "img{-webkit-user-drag:none;user-drag:none}a img{pointer-events:none}"+
      "@media print{html,body{display:none!important}}"+
      "#__wm{position:fixed;inset:0;z-index:2147483000;pointer-events:none;opacity:.28;background-repeat:repeat;transform:rotate(-30deg) scale(1.35);transform-origin:center}"+
      "#__cover{position:fixed;inset:0;z-index:2147483600;background:#111;color:#c9b292;display:none;align-items:center;justify-content:center;text-align:center;font-family:sans-serif;font-size:20px}";
    (doc.head||doc.documentElement).appendChild(st);

    var cover=doc.createElement("div"); cover.id="__cover"; cover.textContent="Conte\\u00fado protegido \\u2014 "+MARCA; body.appendChild(cover);
    function mostrar(on){ cover.style.display=on?"flex":"none"; }

    if(COM_MARCA){
      var etq=MARCA+"  \\u2022  "+DATA, enc=encodeURIComponent(etq).replace(/'/g,"%27");
      var svg="<svg xmlns='http://www.w3.org/2000/svg' width='430' height='190'>"+
        "<text x='2' y='96' fill='%23ffffff' font-family='sans-serif' font-weight='700' font-size='26'>"+enc+"</text>"+
        "<text x='0' y='94' fill='%23111111' font-family='sans-serif' font-weight='700' font-size='26'>"+enc+"</text></svg>";
      var wm=doc.createElement("div"); wm.id="__wm"; wm.style.backgroundImage="url(\\""+"data:image/svg+xml;utf8,"+svg+"\\")"; body.appendChild(wm);
    }

    if(COM_BLOQUEIO){
      function bloq(e){ e.preventDefault(); e.stopPropagation(); return false; }
      ["contextmenu","copy","cut","selectstart","dragstart"].forEach(function(ev){ doc.addEventListener(ev,bloq,{capture:true}); });
      doc.addEventListener("keydown",function(e){
        var k=(e.key||"").toLowerCase();
        if(e.key==="F12"||(e.ctrlKey&&e.shiftKey&&(k==="i"||k==="j"||k==="c"))||
           (e.ctrlKey&&(k==="u"||k==="s"||k==="p"||k==="c"||k==="a"))||
           (e.metaKey&&(k==="s"||k==="p"||k==="c"||k==="a"||k==="u"))) bloq(e);
      },{capture:true});
      window.addEventListener("blur",function(){mostrar(true);});
      window.addEventListener("focus",function(){mostrar(false);});
      doc.addEventListener("visibilitychange",function(){mostrar(doc.hidden);});
      window.addEventListener("beforeprint",function(){mostrar(true);});
      window.addEventListener("afterprint",function(){mostrar(false);});
      function devtools(){
        var porTam=(window.outerWidth-window.innerWidth>140)||(window.outerHeight-window.innerHeight>140);
        var t0=performance.now(); (function(){debugger;})(); var porTempo=(performance.now()-t0)>120;
        return porTam||porTempo;
      }
      function checar(){ mostrar(devtools()); }
      checar(); setInterval(checar,500);
    }
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",abrir); else abrir();
})();
`;

const ofuscado = JsObfuscator.obfuscate(carregador, {
  compact: true, controlFlowFlattening: true, controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true, deadCodeInjectionThreshold: 0.4, debugProtection: true,
  debugProtectionInterval: 2000, disableConsoleOutput: true,
  identifierNamesGenerator: 'hexadecimal', numbersToExpressions: true, selfDefending: true,
  simplify: true, splitStrings: true, splitStringsChunkLength: 8, stringArray: true,
  stringArrayEncoding: ['rc4'], stringArrayThreshold: 0.9, transformObjectKeys: true,
  unicodeEscapeSequence: false,
}).getObfuscatedCode();

/* ------------------------------ casca final ----------------------------- */
const tituloM = documentoReal.match(/<title>([\s\S]*?)<\/title>/i);
const descM = documentoReal.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i);
const langM = documentoReal.match(/<html[^>]+lang=["']([^"']+)["']/i);
const iconM = documentoReal.match(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["'](data:[^"']+)["']/i);

const casca = `<!DOCTYPE html>
<html lang="${langM ? langM[1] : 'pt-BR'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex">
${tituloM ? `<title>${tituloM[1]}</title>` : ''}
${descM ? `<meta name="description" content="${descM[1]}">` : ''}
${iconM ? `<link rel="icon" href="${iconM[1]}">` : ''}
<style>html,body{margin:0;background:#f2f2f2;min-height:100vh}</style>
</head>
<body>
<noscript>Este conteúdo requer JavaScript ativado.</noscript>
<script>window.__P=${JSON.stringify(cargaB64)};</script>
<script>${ofuscado}</script>
</body>
</html>
`;

const outAbs = resolve(process.cwd(), outDir);
mkdirSync(outAbs, { recursive: true });
const saida = join(outAbs, basename(entradaAbs));
writeFileSync(saida, casca, 'utf8');

const kb = (n) => (n / 1024).toFixed(0) + ' KB';
console.log(`\n  Blindagem concluída.`);
console.log(`  Assets embutidos : ${nAssets}`);
console.log(`  Documento real   : ${kb(Buffer.byteLength(documentoReal, 'utf8'))}`);
console.log(`  Arquivo final    : ${kb(Buffer.byteLength(casca))}`);
console.log(`  Saída            : ${saida}\n`);
