# Blindagem da landing page — Piero Barbacovi Advogados

Este diretório gera uma versão **blindada** do site para enviar ao cliente sem
entregar o código de bandeja. O código-fonte original (`/index.html`,
`/style.css`, `/script.js`, `/assets`) **não é alterado** — continua sendo a
fonte da verdade para você editar. A blindagem é sempre **gerada a partir dele**.

## O que é gerado

`entrega-cliente/index.html` — um **único arquivo** autossuficiente (~11 MB) que:

- Embute todas as imagens usadas como `data:` URI (nenhuma pasta `assets/` solta
  para o cliente baixar).
- **Minifica o CSS** (remove todos os comentários e a estrutura legível — os
  rótulos "01. TOKENS", nomes de seções etc.).
- **Ofusca o JS do site** (o `script.js` vira código embaralhado; no F12 →
  _Sources_ não aparece o código original).
- Remove os comentários do HTML (`<!-- HERO -->` etc.) que revelavam o esqueleto.
- Costura CSS e JS num só documento.
- **Criptografa** esse documento com **AES‑256‑GCM** + uma máscara XOR por cima.
- Só remonta a página **em tempo de execução**, dentro do navegador, através de
  um carregador **ofuscado** (com _self‑defending_ e _debug protection_).

## Como (re)gerar

```bash
node protecao/proteger.mjs
```

Rode isso sempre que editar o site original. O arquivo `entrega-cliente/index.html`
é reescrito com chaves de criptografia novas a cada execução.

Para conferir num navegador de verdade (renderiza e valida):

```bash
node protecao/testar.mjs
```

## Como enviar ao cliente

Hospede o `entrega-cliente/index.html` (Vercel, Netlify, seu servidor…) e mande
o **link https**. A criptografia usa a API `crypto.subtle` do navegador, que
exige contexto seguro — ou seja, **https** (ou `localhost`). Não funciona abrindo
o arquivo por `file://` em todos os navegadores; por isso o link hospedado é o
caminho certo.

## Proteções aplicadas

| Camada | O que faz |
|---|---|
| Criptografia AES‑256‑GCM + XOR | "Exibir código-fonte" e "Salvar página" entregam só um blob ilegível. |
| JS ofuscado | O `script.js` do site vira código embaralhado; no F12 → _Sources_ não há código legível. |
| CSS minificado | Sem comentários nem estrutura; no F12 some o "mapa" do CSS. |
| Ofuscação do carregador | Lógica embaralhada, _self‑defending_, _debug protection_, `console` desativado. |
| Bloqueio de atalhos | Botão direito, seleção, arrastar, Ctrl/Cmd + U/S/P/C/A, F12, Ctrl+Shift+I/J/C. |
| Detecção de devtools | Cobre a tela quando o inspetor é aberto (tamanho da janela + armadilha `debugger`). |
| Marca d'água | Faixa diagonal repetida "Documento confidencial — Piero Barbacovi Advogados" + data, carimbada em qualquer print. |
| Embaçamento ao perder foco | Cobre o conteúdo quando a janela sai de foco / na impressão (dificulta captura por 2ª tela). |
| `noindex` / `noimageindex` | Pede para buscadores não indexarem nem arquivarem. |

## O que isto NÃO faz (seja honesto com você mesmo)

Nenhuma técnica que roda no navegador é 100% à prova de cópia — **é impossível**,
porque o navegador precisa receber o conteúdo para exibi‑lo, e a chave de
descriptografia viaja junto. O objetivo real e alcançável aqui é **deterrência**:
parar a cópia casual e fácil (o "outro cara" que só ia dar Ctrl+U, salvar a
página e refazer igual). Um desenvolvedor determinado, com tempo e ferramentas,
ainda consegue reconstruir a página. Da mesma forma, **não existe** como impedir
print pelo sistema operacional ou foto de celular — por isso a marca d'água, que
não impede o print mas o **carimba** e te protege como autoria/prova.

**Sobre o F12 especificamente:** o JS aparece ofuscado e o CSS sem estrutura,
mas a aba **Elements / Computed** do F12 sempre mostra o DOM e os *valores* de
estilo aplicados (cores, tamanhos, posições). Isso **não tem como criptografar**:
o navegador precisa do HTML e do CSS decifrados para desenhar a página, então
no instante em que ela aparece esses valores existem na memória e o inspetor os
lê. Dá para tirar os comentários e embaralhar os nomes (feito), mas não para
esconder os valores de quem insiste no Elements — vale para qualquer site do
mundo. A cortina anti‑devtools atrapalha, porém um técnico decidido contorna.

Resumo: isto eleva muito a barreira e resolve o cenário de "copiaram meu trabalho
fácil", mas não prometa ao cliente "impossível de copiar" — ninguém entrega isso.
