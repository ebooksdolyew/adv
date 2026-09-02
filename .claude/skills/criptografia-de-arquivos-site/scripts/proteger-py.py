#!/usr/bin/env python3
# ==========================================================================
# proteger-py.py — Ofusca arquivos .py deixando o código-fonte ilegível
# --------------------------------------------------------------------------
# Compila o código para bytecode, serializa (marshal), comprime (zlib) e
# codifica em base64. O arquivo resultante ainda EXECUTA normalmente, mas o
# texto original do código não aparece mais — some de qualquer editor ou do
# "abrir arquivo". É a "criptografia básica mas eficiente" pedida para .py.
#
# Uso:
#   python3 proteger-py.py arquivo.py [outro.py ...] [--out DIR] [--inplace]
#
# Opções:
#   --out <dir>   pasta de saída (padrão: codigo-protegido)
#   --inplace     sobrescreve o original (cria backup .py.bak antes)
#
# Observação honesta: bytecode pode ser revertido por quem tem muito
# conhecimento e ferramentas. Isto barra a leitura/cópia casual, não é
# segredo militar — como todo ofuscador de Python.
# ==========================================================================

import sys, os, zlib, marshal, base64, argparse

def ofuscar(origem: str) -> str:
    with open(origem, "r", encoding="utf-8") as f:
        codigo = f.read()
    # valida e compila (levanta SyntaxError se o .py estiver quebrado)
    objeto = compile(codigo, os.path.basename(origem), "exec")
    dados = base64.b64encode(zlib.compress(marshal.dumps(objeto), 9))
    v = sys.version_info
    # o marshal é específico da versão do Python -> guarda de versão amigável
    return (
        "# -*- coding: utf-8 -*-\n"
        "# Arquivo protegido. Nao edite: o codigo-fonte foi ofuscado.\n"
        "import sys, zlib, marshal, base64\n"
        f"if sys.version_info[:2] != ({v.major}, {v.minor}):\n"
        f"    raise RuntimeError('Este arquivo protegido requer Python {v.major}.{v.minor}.')\n"
        f"exec(marshal.loads(zlib.decompress(base64.b64decode({dados!r}))))\n"
    )

def main():
    p = argparse.ArgumentParser(description="Ofusca arquivos .py")
    p.add_argument("arquivos", nargs="+")
    p.add_argument("--out", default="codigo-protegido")
    p.add_argument("--inplace", action="store_true")
    args = p.parse_args()

    if not args.inplace:
        os.makedirs(args.out, exist_ok=True)

    for origem in args.arquivos:
        if not origem.endswith(".py"):
            print(f"  (ignorado, não é .py) {origem}"); continue
        if not os.path.isfile(origem):
            print(f"  (não encontrado) {origem}"); continue
        try:
            protegido = ofuscar(origem)
        except SyntaxError as e:
            print(f"  (erro de sintaxe, ignorado) {origem}: {e}"); continue

        if args.inplace:
            os.replace(origem, origem + ".bak")
            destino = origem
        else:
            destino = os.path.join(args.out, os.path.basename(origem))
        with open(destino, "w", encoding="utf-8") as f:
            f.write(protegido)
        print(f"  protegido: {origem} -> {destino}")

    print("\n  Concluído.")

if __name__ == "__main__":
    main()
