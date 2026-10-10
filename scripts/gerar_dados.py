"""
Gera a base do protótipo: estabelecimentos + estado do funil simulado.

Duas fontes de estabelecimentos:
  --fonte osm       (padrão) estabelecimentos reais de Sobral via OpenStreetMap (Overpass API, grátis, sem chave).
  --fonte ficticia  nomes e coordenadas inventados, apenas para testes.

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
# Relação OSM da área urbana de Sobral (nome + estado evita confundir com cidades homônimas).
RELACOES_OSM_CIDADE = {"Sobral": 20595424}

# Territórios prontos (sul, oeste, norte, leste). Aproximados: confira no mapa e ajuste.
TERRITORIOS = {
    "boa-viagem": (-8.140, -34.915, -8.095, -34.885),
    "centro-recife": (-8.075, -34.895, -8.050, -34.870),
    "casa-forte-espinheiro": (-8.045, -34.925, -8.025, -34.895),
}

TIPOS = ["Padaria", "Lanchonete", "Restaurante", "Pizzaria", "Hamburgueria", "Bar", "Cafeteria"]
BAIRROS = ["Centro", "Derby", "Junco", "Dom Expedito", "Campo dos Velhos", "Sumaré",
           "Alto da Brasília", "Pedrinhas", "Expectativa", "Padre Palhano", "Cohab II", "Terrenos Novos"]

# Preferência geral observada em duas conversas: manhã / antes do almoço.
# 9h–11h30 é apenas uma janela operacional provisória; confirmar o horário de cada lead.
JANELA_VALIDADA = "9h–11h30"
# O mesmo padrão matinal é usado como sugestão inicial para todos os segmentos;
# não inferimos horários diferentes pelo tipo do estabelecimento.
JANELAS = {tipo: JANELA_VALIDADA for tipo in TIPOS}
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


def coletar_osm(cidade, bbox=None, estado="Ceará"):
    """Busca restaurantes/bares/cafés/lanchonetes/padarias reais no OpenStreetMap.
    Com bbox (sul, oeste, norte, leste) busca só dentro do território."""
    import urllib.parse
    import urllib.request

    if bbox:
        filtro, cabeca = "({},{},{},{})".format(*bbox), ""
    else:
        relacao = RELACOES_OSM_CIDADE.get(cidade)
        if relacao is None:
            # Resolve a cidade junto ao estado no Nominatim e usa sua relação exata;
            # pesquisar só pelo nome pode devolver uma localidade homônima de outro país.
            import urllib.parse
            import urllib.request
            params = urllib.parse.urlencode({"city": cidade, "state": estado, "country": "Brasil",
                                             "format": "jsonv2", "limit": 10})
            req = urllib.request.Request(
                f"https://nominatim.openstreetmap.org/search?{params}",
                headers={"User-Agent": "PrasoCampo/1.0"},
            )
            with urllib.request.urlopen(req, timeout=30) as r:
                resultados = json.load(r)
            candidatos = [x for x in resultados if x.get("osm_type") == "relation"
                          and x.get("category") == "boundary" and x.get("type") == "administrative"]
            if not candidatos:
                raise RuntimeError(f"Não encontrei limite administrativo de {cidade}, {estado}, Brasil no OpenStreetMap.")
            candidato = next((x for x in candidatos if x.get("addresstype") == "city"), candidatos[0])
            relacao = candidato["osm_id"]
        area_id = 3600000000 + int(relacao)
        filtro = "(area.a)"
        cabeca = f"area({area_id})->.a;"
    consulta = f"""
    [out:json][timeout:90];
    {cabeca}
    (
      nwr["amenity"~"^(restaurant|fast_food|cafe|bar|pub|food_court|ice_cream|biergarten|canteen)$"]{filtro};
      nwr["shop"~"^(bakery|pastry|confectionery|ice_cream|deli|butcher|cheese|coffee|dairy|food|greengrocer|supermarket|convenience|seafood|frozen_food|grocery)$"]{filtro};
    );
    out center tags;
    """
    dados = urllib.parse.urlencode({"data": consulta}).encode()
    elementos = None
    erros = []
    # Overpass público pode devolver 504 em horários de pico; tenta espelhos oficiais.
    for endpoint in (
        "https://overpass.private.coffee/api/interpreter",
        "https://overpass-api.de/api/interpreter",
        "https://lz4.overpass-api.de/api/interpreter",
    ):
        req = urllib.request.Request(endpoint, data=dados,
                                     headers={"User-Agent": "praso-campo-prototipo"})
        try:
            with urllib.request.urlopen(req, timeout=100) as r:
                elementos = json.load(r)["elements"]
            break
        except Exception as e:
            erros.append(f"{endpoint}: {e}")
    if elementos is None:
        raise RuntimeError("Não foi possível consultar a base pública do OpenStreetMap: " + " | ".join(erros))

    mapa_tipo = {
        "restaurant": "Restaurante", "fast_food": "Lanchonete", "cafe": "Cafeteria",
        "bar": "Bar", "pub": "Bar", "biergarten": "Bar", "food_court": "Praça de alimentação",
        "ice_cream": "Sorveteria", "canteen": "Refeitório",
    }
    mapa_loja = {
        "bakery": "Padaria", "pastry": "Confeitaria", "confectionery": "Doceria",
        "ice_cream": "Sorveteria", "deli": "Empório", "butcher": "Açougue",
        "cheese": "Laticínios", "coffee": "Café", "dairy": "Laticínios", "food": "Mercearia",
        "greengrocer": "Hortifruti", "supermarket": "Mercado", "convenience": "Mercado",
        "seafood": "Peixaria", "frozen_food": "Congelados", "grocery": "Mercearia",
    }
    saida = []
    for e in elementos:
        tags = e.get("tags", {})
        nome = tags.get("name")
        if not nome:
            continue
        # Alguns dados do OSM têm classificações conflitantes (por exemplo,
        # uma barbearia marcada como bar). Não mostrar locais que não vendem comida.
        if "barbearia" in nome.casefold() or tags.get("shop") in ("barber", "hairdresser"):
            continue
        lat = e.get("lat") or e.get("center", {}).get("lat")
        lng = e.get("lon") or e.get("center", {}).get("lon")
        if lat is None:
            continue
        nome_norm = nome.casefold()
        cuisine = tags.get("cuisine", "").casefold()
        if "sorvet" in nome_norm or "gelato" in nome_norm or "ice_cream" in cuisine:
            tipo = "Sorveteria"
        elif "pizza" in nome_norm or "pizza" in cuisine:
            tipo = "Pizzaria"
        elif "hamburg" in nome_norm or "burger" in nome_norm or "burger" in cuisine:
            tipo = "Hamburgueria"
        elif "lanchonete" in nome_norm or "lanche" in nome_norm or "sanduiche" in nome_norm:
            tipo = "Lanchonete"
        elif tags.get("shop"):
            tipo = mapa_loja.get(tags["shop"], "Mercearia")
        else:
            tipo = mapa_tipo.get(tags.get("amenity"), "Restaurante")
        saida.append({"nome": nome, "tipo": tipo, "lat": lat, "lng": lng,
                      "osmId": e["id"], "osmElemento": e["type"],
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
        "janelaDono": JANELA_VALIDADA if porte != "MEI" else JANELAS.get(est["tipo"], JANELA_VALIDADA),
        "janelaFonte": "referencia geral (2 conversas); confirmar" if porte != "MEI" else "hipotese",
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
    p.add_argument("--fonte", choices=["ficticia", "osm"], default="osm")
    p.add_argument("--cidade", default="Sobral")
    p.add_argument("--estado", default="Ceará", help="estado brasileiro da cidade")
    p.add_argument("--n", type=int, default=60, help="quantidade (base fictícia)")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--territorio", choices=sorted(TERRITORIOS), help="recorte pronto (Recife)")
    p.add_argument("--bbox", help='recorte manual "sul,oeste,norte,leste"')
    p.add_argument("--limite", type=int, default=0, help="máximo opcional de estabelecimentos (OSM); 0 inclui todos")
    a = p.parse_args()

    rng = random.Random(a.seed)
    if a.fonte == "osm":
        bbox = TERRITORIOS.get(a.territorio) if a.territorio else (
            tuple(float(x) for x in a.bbox.split(",")) if a.bbox else None)
        base = coletar_osm(a.cidade, bbox, a.estado)
        print(f"{len(base)} estabelecimentos com nome encontrados no OSM")
        if a.limite > 0 and len(base) > a.limite:
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
