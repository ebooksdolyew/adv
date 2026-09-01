# -*- coding: utf-8 -*-
"""
Monta o demonstrativo autocontido.

Le template.html, converte as capturas do site e as fotos do escritorio em
data URIs e grava Advocacia/demonstrativo.html — um arquivo unico, que abre
sem a pasta assets e sem internet (fora as fontes do Google, que tem fallback).

Uso:  python montar.py
"""
import base64, io, os, sys
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(AQUI)
ASSETS = os.path.join(SITE, "assets")
SAIDA = os.path.join(SITE, "demonstrativo.html")

# as capturas de tela cheia geradas pelo Chrome headless
SHOTS = os.environ.get("SHOTS_DIR") or os.path.join(AQUI, "capturas")


def data_uri(dados, mime):
    return "data:%s;base64,%s" % (mime, base64.b64encode(dados).decode("ascii"))


def jpeg(caminho, largura, qualidade):
    im = Image.open(caminho).convert("RGB")
    if im.width != largura:
        altura = max(1, round(im.height * largura / im.width))
        im = im.resize((largura, altura), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=qualidade, optimize=True, progressive=True)
    return data_uri(buf.getvalue(), "image/jpeg"), im.size, len(buf.getvalue())


def png(caminho, largura):
    im = Image.open(caminho).convert("RGBA")
    if im.width != largura:
        altura = max(1, round(im.height * largura / im.width))
        im = im.resize((largura, altura), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    return data_uri(buf.getvalue(), "image/png"), im.size, len(buf.getvalue())


# ---------------------------------------------------------------- galeria
GALERIA = [
    ("piero-1-hd.webp",                     "Retrato · abertura"),
    ("2024-04-01.webp",                     "Escritório · Aldeota"),
    ("piero-2-hd.webp",                     "Retrato · seção sobre"),
    ("2024-04-01-1.webp",                   "Sala de escuta"),
    ("servicos-labirinto-editorial-v1.webp", "Arte · atuação"),
    ("2024-04-01-2.webp",                   "Recepção"),
    ("sobre-fundo-editorial-v1.webp",       "Fundo · sobre"),
    ("extra1.webp",                         "Ambiente"),
    ("extra2.webp",                         "Detalhe"),
]

total = 0
relatorio = []

def registra(rotulo, tamanho, dims):
    global total
    total += tamanho
    relatorio.append("  %-14s %-14s %7.1f KB" % (rotulo, "%dx%d" % dims, tamanho / 1024))

# ---------------------------------------------------------------- capturas
telas = {}
for chave, arquivo, largura, q in [
    ("TELA_DESKTOP", "desktop.png", 1180, 66),
    ("TELA_TABLET",  "tablet.png",   690, 64),
    ("TELA_MOBILE",  "mobile.png",   390, 68),
]:
    caminho = os.path.join(SHOTS, arquivo)
    if not os.path.exists(caminho):
        sys.exit("Captura ausente: %s" % caminho)
    uri, dims, tam = jpeg(caminho, largura, q)
    telas[chave] = uri
    registra(arquivo, tam, dims)

# ---------------------------------------------------------------- galeria
figuras = []
for arquivo, legenda in GALERIA:
    caminho = os.path.join(ASSETS, arquivo)
    if not os.path.exists(caminho):
        print("  (pulando, nao encontrado) %s" % arquivo)
        continue
    im = Image.open(caminho).convert("RGB")
    # recorte central em 4:3, do jeito que a moldura mostra
    alvo = 4 / 3
    if im.width / im.height > alvo:
        nova = round(im.height * alvo)
        esq = (im.width - nova) // 2
        im = im.crop((esq, 0, esq + nova, im.height))
    else:
        nova = round(im.width / alvo)
        topo = round((im.height - nova) * 0.35)
        im = im.crop((0, topo, im.width, topo + nova))
    im = im.resize((520, 390), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=70, optimize=True, progressive=True)
    registra(arquivo[:14], len(buf.getvalue()), (520, 390))
    figuras.append(
        '<figure><img src="%s" alt="%s"><figcaption>%s</figcaption></figure>'
        % (data_uri(buf.getvalue(), "image/jpeg"), legenda, legenda)
    )

# ---------------------------------------------------------------- marca
capa_uri, dims, tam = jpeg(os.path.join(ASSETS, "hero-fundo.png"), 1000, 62)
registra("hero-fundo", tam, dims)
logo_uri, dims, tam = png(os.path.join(ASSETS, "logo-principal.webp"), 300)
registra("logo", tam, dims)
fav_uri, dims, tam = png(os.path.join(ASSETS, "fav.png"), 64)
registra("favicon", tam, dims)

# ---------------------------------------------------------------- montagem
with open(os.path.join(AQUI, "template.html"), encoding="utf-8") as f:
    html = f.read()

for chave, valor in [
    ("{{TELA_DESKTOP}}", telas["TELA_DESKTOP"]),
    ("{{TELA_TABLET}}",  telas["TELA_TABLET"]),
    ("{{TELA_MOBILE}}",  telas["TELA_MOBILE"]),
    ("{{GALERIA}}",      "\n    ".join(figuras)),
    ("{{CAPA_FUNDO}}",   capa_uri),
    ("{{LOGO}}",         logo_uri),
    ("{{FAVICON}}",      fav_uri),
]:
    if chave not in html:
        sys.exit("Marcador ausente no template: %s" % chave)
    html = html.replace(chave, valor)

with open(SAIDA, "w", encoding="utf-8") as f:
    f.write(html)

print("\n".join(relatorio))
print("-" * 46)
print("  imagens .................. %7.1f KB" % (total / 1024))
print("  demonstrativo.html ....... %7.1f KB" % (os.path.getsize(SAIDA) / 1024))
