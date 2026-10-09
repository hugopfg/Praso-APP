"""
Gera a base do protótipo: estabelecimentos + estado do funil simulado.

Duas fontes de estabelecimentos:
  --fonte ficticia  (padrão) nomes e coordenadas inventados dentro de Sobral-CE.
  --fonte osm       estabelecimentos reais de Sobral via OpenStreetMap (Overpass API, grátis, sem chave).

O funil (status, compras, visitas, sinais do app) é SEMPRE simulado — não temos dados da Praso.
Datas são gravadas como "dias atrás" para o protótipo sempre parecer atual.

Uso:
  python scripts/gerar_dados.py                                   # base fictícia (Sobral)
  python scripts/gerar_dados.py --fonte osm --cidade Recife --territorio boa-viagem
  python scripts/gerar_dados.py --fonte osm --cidade Recife --bbox "-8.07,-34.92,-8.03,-34.87" --limite 80
"""
import argparse
import json
import random
from pathlib import Path

SAIDA = Path(__file__).resolve().parent.parent / "src" / "data" / "estabelecimentos.json"
CENTRO_SOBRAL = (-3.6880, -40.3497)

# Territórios prontos (sul, oeste, norte, leste). Aproximados: confira no mapa e ajuste.
TERRITORIOS = {
    "boa-viagem": (-8.140, -34.915, -8.095, -34.885),
    "centro-recife": (-8.075, -34.895, -8.050, -34.870),
    "casa-forte-espinheiro": (-8.045, -34.925, -8.025, -34.895),
}

TIPOS = ["Padaria", "Lanchonete", "Restaurante", "Pizzaria", "Hamburgueria", "Bar", "Cafeteria"]
BAIRROS = ["Centro", "Derby", "Junco", "Dom Expedito", "Campo dos Velhos", "Sumaré",
           "Alto da Brasília", "Pedrinhas", "Expectativa", "Padre Palhano", "Cohab II", "Terrenos Novos"]

# Janela padrão de quem decide.
# Validado em 2 de 2 entrevistas: negócios com estrutura administrativa atendem "antes do almoço";
# à tarde fazem faturamento, notas, boletos e rotas.
JANELA_VALIDADA = "9h–11h30"
# Para MEI ainda é hipótese por tipo de negócio (nenhum pequeno negócio entrevistado).
JANELAS = {
    "Padaria": "14h–16h", "Lanchonete": "9h–11h", "Restaurante": "15h–17h",
    "Pizzaria": "14h–17h", "Hamburgueria": "14h–17h", "Bar": "15h–17h", "Cafeteria": "10h–11h30",
}
COMPRA_HOJE = ["Representante no WhatsApp", "Atacarejo (vai buscar)", "Distribuidor local",
               "Mercadinho do bairro", "Mistura de atacarejo e representante"]
OBJECOES = ["prazo", "troca", "preco", "fornecedor", "app", "tempo"]
DECISORES = ["Dono", "Dona", "Sócio", "Gerente", "Coordenador de compras"]
NOMES = ["Sabor", "Pão Quente", "Cantinho", "Point", "Estação", "Recanto", "Brasa", "Trigo",
         "Do Zé", "Da Neide", "Sertão", "Aroeira", "Carnaúba", "Serra da Meruoca", "Acaraú",
         "Boa Vista", "Bom Gosto", "Dona Fátima", "Nordestino", "Arco", "Prime", "Família"]
PRIMEIROS = ["Francisco", "Antônia", "José", "Maria", "Raimundo", "Fátima", "Cícero", "Luzia",
             "Edson", "Socorro", "Marcos", "Jaqueline", "Paulo", "Neide", "Wellington", "Cláudia"]


def nome_ficticio(tipo, rng):
    return f"{tipo} {rng.choice(NOMES)}"


def coletar_osm(cidade, bbox=None):
    """Busca restaurantes/bares/cafés/lanchonetes/padarias reais no OpenStreetMap.
    Com bbox (sul, oeste, norte, leste) busca só dentro do território."""
    import urllib.parse
    import urllib.request

    if bbox:
        filtro, cabeca = "({},{},{},{})".format(*bbox), ""
    else:
        filtro = "(area.a)"
        cabeca = f'area["name"="{cidade}"]["boundary"="administrative"]["admin_level"="8"]->.a;'
    consulta = f"""
    [out:json][timeout:90];
    {cabeca}
    (
      nwr["amenity"~"^(restaurant|fast_food|cafe|bar|pub)$"]{filtro};
      nwr["shop"~"^(bakery|pastry)$"]{filtro};
    );
    out center tags;
    """
    dados = urllib.parse.urlencode({"data": consulta}).encode()
    req = urllib.request.Request("https://overpass-api.de/api/interpreter", data=dados,
                                 headers={"User-Agent": "praso-campo-prototipo"})
    with urllib.request.urlopen(req, timeout=90) as r:
        elementos = json.load(r)["elements"]

    mapa_tipo = {"restaurant": "Restaurante", "fast_food": "Lanchonete", "cafe": "Cafeteria",
                 "bar": "Bar", "pub": "Bar"}
    saida = []
    for e in elementos:
        tags = e.get("tags", {})
        nome = tags.get("name")
        if not nome:
            continue
        lat = e.get("lat") or e.get("center", {}).get("lat")
        lng = e.get("lon") or e.get("center", {}).get("lon")
        if lat is None:
            continue
        if tags.get("shop") in ("bakery", "pastry"):
            tipo = "Padaria"
        elif "pizza" in tags.get("cuisine", ""):
            tipo = "Pizzaria"
        elif "burger" in tags.get("cuisine", ""):
            tipo = "Hamburgueria"
        else:
            tipo = mapa_tipo.get(tags.get("amenity"), "Restaurante")
        saida.append({"nome": nome, "tipo": tipo, "lat": lat, "lng": lng,
                      "bairro": tags.get("addr:suburb") or tags.get("addr:neighbourhood") or "—",
                      "endereco": " ".join(filter(None, [tags.get("addr:street"), tags.get("addr:housenumber")])) or "Endereço não informado no OSM",
                      "fonte": "OpenStreetMap"})
    return saida


def gerar_ficticios(n, rng):
    saida, usados = [], set()
    for _ in range(n):
        tipo = rng.choice(TIPOS)
        nome = nome_ficticio(tipo, rng)
        while nome in usados:
            nome = nome_ficticio(tipo, rng)
        usados.add(nome)
        saida.append({
            "nome": nome,
            "tipo": tipo,
            "lat": round(CENTRO_SOBRAL[0] + rng.uniform(-0.022, 0.022), 6),
            "lng": round(CENTRO_SOBRAL[1] + rng.uniform(-0.022, 0.022), 6),
            "bairro": rng.choice(BAIRROS),
            "endereco": f"Rua {rng.choice(['Cel. Joaquim Ribeiro', 'Oriano Mendes', 'Dr. Guarany', 'Monsenhor Aloísio Pinto', 'Padre Fialho', 'Viriato de Medeiros'])}, {rng.randint(10, 1900)}",
            "fonte": "Fictício",
        })
    return saida


def simular_funil(est, i, rng):
    """Atribui etapa do funil, porte, histórico e sinais do app (tudo simulado)."""
    porte = rng.choices(["MEI", "ME", "Alto potencial"], weights=[45, 40, 15])[0]
    pontos = {"MEI": 0.5, "ME": 1, "Alto potencial": 3}[porte]
    etapa = rng.choices(["lead", "oportunidade", "churn", "ativacao"], weights=[45, 15, 10, 30])[0]

    reg = {
        "id": f"e{i:03d}",
        **est,
        "porte": porte,
        "pontos": pontos,
        "etapa": etapa,
        "janelaDono": JANELA_VALIDADA if porte != "MEI" else JANELAS[est["tipo"]],
        "janelaFonte": "entrevistas" if porte != "MEI" else "hipotese",
        # Em estabelecimento real não inventamos nome de pessoa: só o papel, a confirmar na visita.
        "decisor": (f"{rng.choice(DECISORES)} (a confirmar)" if est.get("fonte") == "OpenStreetMap"
                    else f"{rng.choice(PRIMEIROS)} ({rng.choice(DECISORES).lower()})"),
        "compraHoje": rng.choice(COMPRA_HOJE),
        "visitas": [],
        "sinais": [],
    }

    if etapa == "lead":
        if rng.random() < 0.35:
            reg["visitas"].append({"diasAtras": rng.randint(3, 20), "resultado": "dono_ausente"})
        if rng.random() < 0.25:
            reg["visitas"].append({"diasAtras": rng.randint(5, 30), "resultado": "objecao",
                                   "objecao": rng.choice(OBJECOES)})
    elif etapa == "oportunidade":
        reg["cadastroDiasAtras"] = rng.randint(5, 60)
        if rng.random() < 0.5:
            reg["sinais"].append({"tipo": "carrinho", "diasAtras": rng.randint(0, 3),
                                  "texto": "Montou carrinho no app e não finalizou"})
        if rng.random() < 0.4:
            reg["sinais"].append({"tipo": "acesso", "diasAtras": rng.randint(0, 5),
                                  "texto": "Abriu o app nos últimos dias"})
    elif etapa == "churn":
        reg["ultimaCompraDiasAtras"] = rng.randint(121, 240)
        reg["comprasTotal"] = rng.randint(2, 15)
    else:  # ativacao: entre cadastro e 3ª compra autônoma
        compras = rng.choices([0, 1, 2], weights=[30, 40, 30])[0]
        # quanto mais compras, mais antigo tende a ser o cadastro
        cad = {0: rng.randint(1, 12), 1: rng.randint(5, 32), 2: rng.randint(12, 43)}[compras]
        reg["cadastroDiasAtras"] = cad
        reg["compras"] = sorted([rng.randint(0, cad) for _ in range(compras)], reverse=True)
        reg["cicloCompraDias"] = rng.choice([7, 7, 14, 30])  # semanal p/ itens de giro, quinzenal/mensal p/ mercearia
        if compras >= 1:
            # Pós-venda da 1ª entrega: confirmado ou ainda não conferido pelo vendedor
            reg["entregaConfirmada"] = compras >= 2 or rng.random() < 0.4
        if rng.random() < 0.4:
            reg["sinais"].append({"tipo": "acesso", "diasAtras": rng.randint(0, 4),
                                  "texto": "Abriu o app e buscou produtos"})
    return reg


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--fonte", choices=["ficticia", "osm"], default="ficticia")
    p.add_argument("--cidade", default="Sobral")
    p.add_argument("--n", type=int, default=60, help="quantidade (base fictícia)")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--territorio", choices=sorted(TERRITORIOS), help="recorte pronto (Recife)")
    p.add_argument("--bbox", help='recorte manual "sul,oeste,norte,leste"')
    p.add_argument("--limite", type=int, default=80, help="máximo de estabelecimentos (OSM)")
    a = p.parse_args()

    rng = random.Random(a.seed)
    if a.fonte == "osm":
        bbox = TERRITORIOS.get(a.territorio) if a.territorio else (
            tuple(float(x) for x in a.bbox.split(",")) if a.bbox else None)
        base = coletar_osm(a.cidade, bbox)
        print(f"{len(base)} estabelecimentos com nome encontrados no OSM")
        if len(base) > a.limite:
            base = rng.sample(base, a.limite)
        rotulo = (a.territorio or a.cidade).replace("-", " ").title()
        for e in base:
            if e["bairro"] == "—":
                e["bairro"] = rotulo
    else:
        base = gerar_ficticios(a.n, rng)
    registros = [simular_funil(e, i, rng) for i, e in enumerate(base, start=1)]

    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    SAIDA.write_text(json.dumps({"vendedor": "Hugo", "cidade": a.cidade, "fonte": a.fonte,
                                 "territorio": a.territorio or a.bbox,
                                 "estabelecimentos": registros}, ensure_ascii=False, indent=1),
                     encoding="utf-8")
    contagem = {}
    for r in registros:
        contagem[r["etapa"]] = contagem.get(r["etapa"], 0) + 1
    print(f"{len(registros)} estabelecimentos gravados em {SAIDA}")
    print("por etapa:", contagem)


if __name__ == "__main__":
    main()
