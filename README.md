# Praso Campo: protótipo da plataforma do vendedor de campo

Protótipo funcional, feito para celular, da plataforma de campo da Praso.
Cobre a parte que mais mexe na conversão: **o dia do vendedor organizado em torno da recorrência**
e um **registro de visita em até 3 toques que devolve o próximo passo**.

## O que tem no protótipo

**Meu dia**
- Rota com as 10 visitas de maior valor esperado, ordenadas pelo horário em que o dono costuma estar
  e, dentro da mesma janela, pelo vizinho mais próximo.
- Cada visita mostra por que está na fila (prazo da 3ª compra, carrinho aberto no app, alto potencial, dono ausente antes).
- Lista "Resolver pelo WhatsApp": lembretes de recompra e carrinhos abertos, com mensagem pronta em um toque.
- Retornos já agendados pelos registros anteriores.

**Registrar visita (check-in)**
1. Conseguiu falar com quem decide? (sim / não estava / fechado)
2. Se não estava: quando ele costuma estar? (o horário fica salvo para a equipe)
3. Se falou: como terminou? (opções mudam conforme a etapa do funil)
4. Se não fechou: o que mais pesou? (preço, entrega, fornecedor, desconfiança do app, tempo, prazo de pagamento)

Ao final, a plataforma devolve o próximo passo já agendado, o argumento para a objeção e o tempo gasto no registro.

**Carteira de ativação**
- Todos os clientes entre o cadastro e a 3ª compra autônoma, com progresso (cadastro, 1ª, 2ª, 3ª) e prazo de 45 dias.
- Detecta quando o ciclo natural de compra do cliente passa do prazo e sugere antecipar a compra.

## Decisões de produto e trade-offs

| Decisão | Por quê | Trade-off |
|---|---|---|
| A fila mistura aquisição e ativação | A meta do vendedor é a 3ª compra autônoma, não o cadastro | Menos leads novos visitados por dia |
| Visita onde presença converte, WhatsApp no resto | Lead, 1º pedido e cliente que esfriou pedem presença; lembrete de recompra não | Depende de o cliente responder no WhatsApp |
| Escolher por valor, ordenar por horário | Chegar quando o dono está aumenta a "visita efetiva" e o "tomador de decisão presente" | A rota pode cruzar a cidade entre janelas |
| Registro em até 3 toques, sempre com retorno | A principal queixa é que registrar não devolve nada | Menos detalhe por visita (sem texto livre) |
| Prioridade explicada em cada item | Vendedor confia no que entende e pode discordar | Pesos simples, não um modelo estatístico |
| Mapa esquemático + navegação no Google Maps | Mostra a ordem da rota e carrega rápido no 4G | Não substitui um mapa completo |
| Sem login nem servidor | Validar o fluxo com vendedores antes de integrar | Dados ficam só no aparelho |

## Dados

Os dados são **simulados**: estabelecimentos fictícios em Sobral (CE) e todo o estado do funil
(etapa, compras, visitas, sinais do app). Não há dado da Praso aqui.

O script `scripts/gerar_dados.py` gera a base. Com `--fonte osm` ele troca os estabelecimentos fictícios
por estabelecimentos reais do OpenStreetMap (Overpass API, gratuita e sem chave). O funil continua simulado.

```bash
python scripts/gerar_dados.py                 # base fictícia
python scripts/gerar_dados.py --fonte osm     # estabelecimentos reais de Sobral
python scripts/gerar_dados.py --fonte osm --cidade "Fortaleza"
```

Datas são gravadas como "dias atrás", então o protótipo sempre parece atual.

## Google Maps

A chave é carregada localmente pelo Vite a partir de `.env.local`. Configure `VITE_GOOGLE_KEY` (ou `VITE_GOOGLE_MAPS_API_KEY`) com uma chave do Google Maps JavaScript API. O arquivo `.env.local` não é versionado. Como a chave é usada no navegador, restrinja-a no Google Cloud por HTTP referrer e limite as APIs habilitadas.
## Como rodar

```bash
npm install
npm run dev        # desenvolvimento
npm run build      # gera dist/ para publicar (Vercel, Netlify, GitHub Pages)
SINGLE=1 npx vite build --outDir dist-single   # um único index.html autossuficiente
```

Publicação na Vercel: importar o repositório, framework "Vite", sem configuração extra.

Antes de publicar, configure `VITE_GOOGLE_KEY` nas variáveis de ambiente do projeto da Vercel para os ambientes Production e Preview. A chave é incluída no JavaScript do navegador; no Google Cloud, permita a Maps JavaScript API e restrinja os referenciadores HTTP ao domínio de produção e, se usar previews, aos domínios de preview da Vercel. Não envie `.env.local` ao GitHub.

## Estrutura

```
src/
  App.jsx            telas: Meu dia, check-in, carteira de ativação, detalhe, sobre
  lib/regras.js      priorização, ação sugerida (visita x WhatsApp), objeções, risco de prazo
  lib/checkin.js     transforma o registro em próximo passo
  data/estabelecimentos.json
  estilo.css         mobile-first, alto contraste para uso no sol, tema claro e escuro
scripts/gerar_dados.py
```

## Próximos passos (fora do protótipo)

- Integrar com a base real de estabelecimentos e com eventos do app (carrinho, acesso, pedidos).
- Calibrar os pesos de priorização com dados históricos por etapa do funil.
- Visão do gestor: conversão por etapa e por vendedor, para entender o que os melhores fazem diferente.
- Enriquecimento de leads com dados públicos de CNPJ (CNAE, porte, data de abertura) e Google Places.
