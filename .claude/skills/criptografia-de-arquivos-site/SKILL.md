---
name: criptografia-de-arquivos-site
description: >-
  Blinda/criptografa os arquivos de código de um site ou projeto para dificultar
  cópia e leitura — deixa HTML, CSS e JS ilegíveis no F12 (código-fonte vira um
  blob criptografado AES-256-GCM que só monta em runtime; JS ofuscado, CSS sem
  comentários/estrutura) e ofusca arquivos .py (bytecode marshal+zlib+base64).
  Aplica também bloqueios anti-devtools, bloqueio de botão direito/seleção/atalhos
  e marca d'água. USE SEMPRE que o usuário estiver FINALIZANDO um projeto e pedir
  para "criptografar", "proteger", "blindar", "ofuscar", "esconder o código",
  "impedir cópia", "deixar ilegível no F12", "proteger antes de mandar pro
  cliente", ou algo equivalente — mesmo que ele não diga a palavra "skill" e mesmo
  que não cite os tipos de arquivo (index, html, css, js, py). Serve para
  entregar uma versão do site/projeto que não possa ser copiada facilmente.
---

# Criptografia de Arquivos do Site

Gera uma versão **protegida** de um site ou projeto para que o código não possa ser
lido ou copiado facilmente — nem por "Exibir código-fonte", nem por "Salvar página",
nem folheando o F12. O objetivo é **deterrência forte contra cópia casual** (o
cenário clássico de "mandei pro cliente e ele deu meu código pra outro refazer
igual"), preservando o site funcionando 100%.

## Passo 0 — SEMPRE pergunte antes de aplicar (obrigatório)

Esta skill mexe em algo que o usuário vai **entregar**, então nunca rode direto.
Antes de qualquer ação, use `AskUserQuestion` para confirmar:

1. **Aplicar a criptografia completa dos arquivos referentes agora?** (sim / não)
2. Quais arquivos/pasta: a página de entrada web (padrão `index.html`) e/ou arquivos `.py`.
3. Marca d'água: genérica, com texto específico, ou nenhuma.

Só prossiga depois que o usuário confirmar. Se ele disser não, pare.

## Passo 1 — Seja honesto sobre o limite real (diga isto ao usuário)

Nenhuma técnica de navegador é 100% à prova de cópia — **é impossível**, porque o
navegador precisa receber o conteúdo decifrado para exibi-lo, e a chave viaja junto.
Especificamente, a aba **Elements/Computed do F12 sempre mostra o DOM e os valores
de estilo aplicados** (cores, tamanhos, posições) de qualquer site do mundo; dá para
tirar comentários e embaralhar nomes, não para esconder os valores de quem insiste.
O mesmo vale para print: não dá para bloquear captura do sistema — por isso a marca
d'água, que **carimba** o print em vez de impedi-lo. Diga isso em uma ou duas frases
para o usuário não prometer "impossível de copiar" ao cliente. Depois, aplique — a
proteção resolve muito bem a cópia fácil, que é o problema real.

## Passo 2 — Aplicar a blindagem

Os scripts ficam em `scripts/` (ao lado deste arquivo). Rode-os a partir da **raiz do
projeto do usuário**. Na primeira execução o script web instala sozinho suas
dependências (`javascript-obfuscator`, `clean-css`).

### Arquivos web (HTML + CSS + JS + assets)

```bash
node <skill>/scripts/proteger-web.mjs [entrada.html] [--out entrega-protegida] [--marca "texto"] [--sem-marca] [--sem-bloqueio]
```

- Padrão de entrada: `index.html` no diretório atual. Rode uma vez por página HTML
  se o site tiver várias.
- O que faz: embute todos os assets locais como `data:` URI (imagens, fontes,
  vídeos), minifica o CSS (sem comentários/estrutura), ofusca o JS (`script.js` e
  blocos inline viram código embaralhado), junta tudo, **criptografa com AES-256-GCM
  + máscara XOR**, e entrega um único HTML que só remonta a página em runtime via um
  carregador ofuscado, com bloqueios anti-devtools e marca d'água.
- Saída: `entrega-protegida/<nome>.html`. O código-fonte original **não é alterado**.
- Requer contexto seguro: a página protegida usa `crypto.subtle`, então funciona por
  **link https** (ou `localhost`). Oriente o usuário a hospedar e enviar o link, não
  a mandar o arquivo para abrir por `file://`.

### Arquivos Python (.py)

```bash
python3 <skill>/scripts/proteger-py.py arquivo.py [outro.py ...] [--out codigo-protegido] [--inplace]
```

- Compila o `.py` para bytecode e serializa (marshal + zlib + base64): o arquivo
  continua rodando, mas o texto do código-fonte some.
- Saída: `codigo-protegido/<nome>.py` (ou `--inplace` para sobrescrever, com backup
  `.py.bak`). O protegido exige a **mesma versão** do Python usada na geração.

## Passo 3 — Validar e entregar

- Confirme visualmente que a página protegida renderiza. Se houver browser disponível
  (ex.: Playwright), sirva o arquivo por http local (contexto seguro) e verifique que
  a página monta e que o código-fonte não contém frases legíveis do conteúdo.
- Diga ao usuário exatamente o que foi gerado e onde, e reforce o ponto do link https.

## Notas

- Não é necessário commitar `entrega-protegida/` nem `codigo-protegido/` — são
  artefatos de entrega, regeráveis a qualquer momento rodando os scripts de novo
  (cada execução usa chaves de criptografia novas).
- Para reduzir o tamanho do HTML protegido, o usuário pode remover fallbacks de
  imagem muito pesados (ex.: PNGs gigantes que só existem como fallback de WebP)
  antes de rodar.
