/* ==========================================================================
   proteger.mjs — Blindagem da landing page (Piero Barbacovi Advogados)
   --------------------------------------------------------------------------
   O que faz, em ordem:
     1. Lê o site real (index.html + style.css + script.js).
     2. Embute TODAS as imagens usadas como data: URI (nada de pasta solta).
     3. Costura CSS e JS para dentro de um único documento HTML.
     4. Criptografa esse documento com AES-256-GCM + máscara XOR.
     5. Gera um carregador que descriptografa e monta a página em runtime,
        instala os bloqueios (botão direito, atalhos, devtools), a marca
        d'água e o embaçamento ao perder o foco.
     6. Ofusca o carregador (self-defending + debug protection).
     7. Grava entrega-cliente/index.html — o arquivo blindado.

   O código-fonte original em / NÃO é alterado. Para regerar:  node protecao/proteger.mjs
   ========================================================================== */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomBytes, createCipheriv, webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import JsObfuscator from 'javascript-obfuscator';
import CleanCSS from 'clean-css';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(__dirname, '..');
const SAIDA = join(RAIZ, 'entrega-cliente', 'index.html');

/* Marca d'água (genérica, conforme escolhido). */
const MARCA = 'Documento confidencial — Piero Barbacovi Advogados';
const DATA_MARCA = new Date().toLocaleDateString('pt-BR');

/* --------------------------------------------------------------------------
   1 + 2. Ler os fontes e embutir as imagens como data: URI.
   -------------------------------------------------------------------------- */
const MIME = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', gif: 'image/gif' };

function dataUriDe(caminhoRelativo) {
  const abs = join(RAIZ, caminhoRelativo);
  const ext = caminhoRelativo.split('.').pop().toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  const b64 = readFileSync(abs).toString('base64');
  return `data:${mime};base64,${b64}`;
}

let html = readFileSync(join(RAIZ, 'index.html'), 'utf8');
let css = readFileSync(join(RAIZ, 'style.css'), 'utf8');
let js = readFileSync(join(RAIZ, 'script.js'), 'utf8');

/* Descobre todo caminho assets/... citado no HTML e no CSS. */
const refs = new Set();
for (const txt of [html, css]) {
  for (const m of txt.matchAll(/assets\/[A-Za-z0-9._-]+/g)) refs.add(m[0]);
}
/* Substitui os mais longos primeiro para evitar colisão de substring. */
const ordenados = [...refs].sort((a, b) => b.length - a.length);
let bytesAssets = 0;
for (const rel of ordenados) {
  let uri;
  try { uri = dataUriDe(rel); } catch { console.warn('  (aviso) asset ausente, ignorado:', rel); continue; }
  bytesAssets += uri.length;
  const escapado = rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  html = html.replace(new RegExp(escapado, 'g'), uri);
  css = css.replace(new RegExp(escapado, 'g'), uri);
}

/* --------------------------------------------------------------------------
   3. Ofuscar/minificar o próprio conteúdo antes de costurar.
   Assim, mesmo depois que a página é decifrada e montada, o que aparece no
   F12 (Sources / Elements) é código embaralhado e CSS sem estrutura legível.
   -------------------------------------------------------------------------- */

/* CSS: remove comentários (base64 nunca contém '*', então o regex é seguro)
   e compacta espaços com level 0 — que NÃO descarta nem mescla regras, para
   preservar fallbacks intencionais (ex.: background png + webp). */
css = css.replace(/\/\*[\s\S]*?\*\//g, '');
const cssMin = new CleanCSS({ level: 0 }).minify(css);
if (cssMin.errors && cssMin.errors.length) { console.warn('  (aviso) CSS:', cssMin.errors); }
css = cssMin.styles || css;

/* JS do site: ofuscado (no F12 vira código ilegível, não o original). */
js = JsObfuscator.obfuscate(js, {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.3,
  identifierNamesGenerator: 'hexadecimal',
  numbersToExpressions: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 10,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 1,
  transformObjectKeys: true,
  unicodeEscapeSequence: false,
}).getObfuscatedCode();

/* HTML: remove os comentários que revelam a estrutura das seções. */
html = html.replace(/<!--[\s\S]*?-->/g, '');

/* Evita que qualquer "</script" dentro do código quebre a tag inline. */
const jsSeguro = js.replace(/<\/script/gi, '<\\/script');

/* --------------------------------------------------------------------------
   4. Costurar CSS e JS para dentro do HTML (documento autossuficiente).
   -------------------------------------------------------------------------- */
html = html.replace(/<link[^>]+href=["']style\.css["'][^>]*>/i, `<style>${css}</style>`);
html = html.replace(/<script[^>]+src=["']script\.js["'][^>]*><\/script>/i, `<script>${jsSeguro}</script>`);
/* O favicon já virou data: URI no passo anterior. */

const documentoReal = html; // este é o site inteiro, em um único string

/* --------------------------------------------------------------------------
   4. Criptografar: AES-256-GCM, depois máscara XOR, depois base64.
   Layout dos bytes antes da máscara:  [iv(12)] [ciphertext...] [tag(16)]
   -------------------------------------------------------------------------- */
const chaveAes = randomBytes(32);   // chave AES-256
const iv = randomBytes(12);         // nonce GCM
const chaveXor = randomBytes(32);   // segunda camada (máscara)

const cipher = createCipheriv('aes-256-gcm', chaveAes, iv);
const ct = Buffer.concat([cipher.update(Buffer.from(documentoReal, 'utf8')), cipher.final()]);
const tag = cipher.getAuthTag();

const bruto = Buffer.concat([iv, ct, tag]);
const mascarado = Buffer.alloc(bruto.length);
for (let i = 0; i < bruto.length; i++) mascarado[i] = bruto[i] ^ chaveXor[i % chaveXor.length];
const cargaB64 = mascarado.toString('base64');

const aB = (buf) => '[' + [...buf].join(',') + ']'; // bytes -> literal JS

/* --------------------------------------------------------------------------
   5. Carregador em runtime (roda no navegador do cliente).
   Descriptografa via Web Crypto (SubtleCrypto), monta a página e instala
   os bloqueios + marca d'água + embaçamento.
   -------------------------------------------------------------------------- */
const carregador = `
(function () {
  "use strict";
  var CARGA = window.__P; try { delete window.__P; } catch (e) { window.__P = void 0; }
  var KX = new Uint8Array(${aB(chaveXor)});
  var KA = new Uint8Array(${aB(chaveAes)});
  var IVLEN = 12, TAGLEN = 16;
  var MARCA = ${JSON.stringify(MARCA)};
  var DATA = ${JSON.stringify(DATA_MARCA)};

  function b64ToBytes(b64) {
    var bin = atob(b64), n = bin.length, out = new Uint8Array(n);
    for (var i = 0; i < n; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function abrir() {
    try {
      var mascarado = b64ToBytes(CARGA);
      var bruto = new Uint8Array(mascarado.length);
      for (var i = 0; i < mascarado.length; i++) bruto[i] = mascarado[i] ^ KX[i % KX.length];
      var iv = bruto.slice(0, IVLEN);
      var ctTag = bruto.slice(IVLEN); // ciphertext + tag (formato que o SubtleCrypto espera)
      var chave = await crypto.subtle.importKey("raw", KA, { name: "AES-GCM" }, false, ["decrypt"]);
      var claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, chave, ctTag);
      var htmlTxt = new TextDecoder("utf-8").decode(claro);
      montar(htmlTxt);
    } catch (e) {
      document.documentElement.innerHTML =
        '<body style="font-family:sans-serif;background:#1a201b;color:#c9b292;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:24px">' +
        '<div><h1 style="font-weight:600">Conte\\u00fado protegido</h1>' +
        '<p>N\\u00e3o foi poss\\u00edvel exibir esta p\\u00e1gina neste navegador. Use um navegador atualizado (Chrome, Edge ou Firefox).</p></div></body>';
    }
  }

  function montar(htmlTxt) {
    document.open();
    document.write(htmlTxt);
    document.close();
    // aguarda o novo documento se estabilizar e instala as proteções
    setTimeout(blindar, 60);
  }

  function blindar() {
    var doc = document, body = doc.body || doc.documentElement;

    // --- CSS de proteção (seleção, arraste, impressão, marca d'água) ---
    var st = doc.createElement("style");
    st.textContent =
      "*{-webkit-user-select:none!important;-moz-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important}" +
      "img{-webkit-user-drag:none;user-drag:none;pointer-events:none}" +
      "a img{pointer-events:none}" +
      "@media print{html,body{display:none!important}}" +
      "#__wm{position:fixed;inset:0;z-index:2147483000;pointer-events:none;opacity:.28;" +
        "background-repeat:repeat;transform:rotate(-30deg) scale(1.35);transform-origin:center}" +
      "#__cover{position:fixed;inset:0;z-index:2147483600;background:#1a201b;color:#c9b292;" +
        "display:none;align-items:center;justify-content:center;text-align:center;font-family:sans-serif;font-size:20px}";
    (doc.head || doc.documentElement).appendChild(st);

    // --- Marca d'água diagonal repetida (SVG em data URI) ---
    var etiqueta = MARCA + "  \\u2022  " + DATA;
    var enc = encodeURIComponent(etiqueta).replace(/'/g, "%27");
    // dois textos (claro atrás, escuro na frente) -> legível em fundo claro e escuro
    var svg =
      "<svg xmlns='http://www.w3.org/2000/svg' width='430' height='190'>" +
      "<text x='2' y='96' fill='%23ffffff' font-family='sans-serif' font-weight='700' font-size='26'>" + enc + "</text>" +
      "<text x='0' y='94' fill='%23111111' font-family='sans-serif' font-weight='700' font-size='26'>" + enc + "</text>" +
      "</svg>";
    var wm = doc.createElement("div");
    wm.id = "__wm";
    wm.style.backgroundImage = "url(\\"data:image/svg+xml;utf8," + svg + "\\")";
    body.appendChild(wm);

    // --- Cortina para embaçar ao perder o foco / imprimir ---
    var cover = doc.createElement("div");
    cover.id = "__cover";
    cover.textContent = "Conte\\u00fado protegido \\u2014 " + MARCA;
    body.appendChild(cover);
    function mostrarCortina(on) { cover.style.display = on ? "flex" : "none"; }

    // --- Bloqueio de atalhos e menu de contexto ---
    function bloqueia(e) { e.preventDefault(); e.stopPropagation(); return false; }
    ["contextmenu", "copy", "cut", "selectstart", "dragstart"].forEach(function (ev) {
      doc.addEventListener(ev, bloqueia, { capture: true });
    });
    doc.addEventListener("keydown", function (e) {
      var k = (e.key || "").toLowerCase();
      var combo =
        e.key === "F12" ||
        (e.ctrlKey && e.shiftKey && (k === "i" || k === "j" || k === "c")) ||
        (e.ctrlKey && (k === "u" || k === "s" || k === "p" || k === "c" || k === "a")) ||
        (e.metaKey && (k === "s" || k === "p" || k === "c" || k === "a" || k === "u"));
      if (combo) { bloqueia(e); }
    }, { capture: true });

    // --- Embaçar quando a janela perde o foco (dificulta captura por 2ª tela) ---
    window.addEventListener("blur", function () { mostrarCortina(true); });
    window.addEventListener("focus", function () { mostrarCortina(false); });
    doc.addEventListener("visibilitychange", function () { mostrarCortina(doc.hidden); });
    window.addEventListener("beforeprint", function () { mostrarCortina(true); });
    window.addEventListener("afterprint", function () { mostrarCortina(false); });

    // --- Detecção de devtools ---
    // (a) diferença de tamanho da viewport (F12 acoplado)
    // (b) armadilha de tempo com "debugger" (F12 aberto pausa e estoura o tempo)
    function devtoolsAberto() {
      var porTamanho =
        (window.outerWidth - window.innerWidth > 140) ||
        (window.outerHeight - window.innerHeight > 140);
      var t0 = performance.now();
      // eslint-disable-next-line no-debugger
      (function () { debugger; })();
      var porTempo = (performance.now() - t0) > 120;
      return porTamanho || porTempo;
    }
    function checar() { mostrarCortina(devtoolsAberto()); }
    checar();
    setInterval(checar, 500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", abrir);
  } else { abrir(); }
})();
`;

/* --------------------------------------------------------------------------
   6. Ofuscar o carregador.
   -------------------------------------------------------------------------- */
const ofuscado = JsObfuscator.obfuscate(carregador, {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  debugProtection: true,
  debugProtectionInterval: 2000,
  disableConsoleOutput: true,
  identifierNamesGenerator: 'hexadecimal',
  numbersToExpressions: true,
  selfDefending: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 8,
  stringArray: true,
  stringArrayEncoding: ['rc4'],
  stringArrayThreshold: 0.9,
  transformObjectKeys: true,
  unicodeEscapeSequence: false,
}).getObfuscatedCode();

/* --------------------------------------------------------------------------
   7. Casca HTML final entregue ao cliente.
   -------------------------------------------------------------------------- */
const faviconUri = (() => { try { return dataUriDe('assets/fav.png'); } catch { return ''; } })();
const cascaFinal = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex">
<title>Advogado Criminalista em Fortaleza | Piero Barbacovi Advogados | Atendimento 24h</title>
<meta name="description" content="Prisão em flagrante, audiência de custódia, habeas corpus e execução penal. Defesa criminal sigilosa e estratégica com o Dr. Piero Barbacovi, OAB/CE 41.226. Atendimento 24h em Fortaleza e em todo o Brasil.">
${faviconUri ? `<link rel="icon" href="${faviconUri}">` : ''}
<style>html,body{margin:0;background:#c9b292;min-height:100vh}</style>
</head>
<body>
<noscript>Este conteúdo requer JavaScript ativado.</noscript>
<script>window.__P=${JSON.stringify(cargaB64)};</script>
<script>${ofuscado}</script>
</body>
</html>
`;

mkdirSync(join(RAIZ, 'entrega-cliente'), { recursive: true });
writeFileSync(SAIDA, cascaFinal, 'utf8');

const kb = (n) => (n / 1024).toFixed(0) + ' KB';
console.log('\n  Blindagem concluída.');
console.log('  Assets embutidos : ' + ordenados.length + ' (' + kb(bytesAssets) + ' em data URI)');
console.log('  Documento real   : ' + kb(Buffer.byteLength(documentoReal, 'utf8')));
console.log('  Carregador ofusc.: ' + kb(Buffer.byteLength(ofuscado)));
console.log('  Arquivo final    : ' + kb(Buffer.byteLength(cascaFinal)) + '  ->  ' + SAIDA + '\n');
