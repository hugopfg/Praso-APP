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

**Navegação mobile**
- Quatro rotas diretas: `/`, `/mapa`, `/ativacao` e `/sobre`, com fallback configurado para a SPA na Vercel.
- Layout otimizado para uso com uma mão, largura de até 430px, área segura do iPhone e botões de toque grandes.
- Manifesto e service worker para instalar o app e reabrir a interface já carregada sem conexão.
- Contratos JSDoc em `src/data/model.js` e mock adaptador em `src/data/mock.js`, prontos para a futura integração com API.

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
| Mapa real + navegação do celular | Usa locais cadastrados no OpenStreetMap e abre a rota no app de mapas | Distância e tempo estimados em linha reta; o app de mapas calcula as ruas |
| Sem login nem servidor | Validar o fluxo com vendedores antes de integrar | Dados ficam só no aparelho |

## Aprendizados de campo compartilhados

Dois relatos indicam preferência por conversas pela manhã e compras frequentes por WhatsApp ou sistema de distribuidor. A tarde pode ficar ocupada com rotinas administrativas. O calendário de reposição varia por operação e por giro: semanal para itens recorrentes e produção, quinzenal/mensal para itens de menor giro. Compradores também destacaram pedido completo, confiabilidade e pós-venda; um deles relatou negociar prazo acima de 21 dias.

Esses achados são uma amostra pequena, não regras universais. A faixa 9h–11h30 é usada apenas como sugestão inicial e precisa ser confirmada por lead. O fluxo recomenda confirmar condições de troca e prazo antes de apresentar qualquer promessa. Consulte `docs/playbook-campo.md` e `docs/diario-de-campo.md`.

## Dados

Os nomes e as coordenadas da base atual vêm dos estabelecimentos com nome cadastrados no OpenStreetMap para Sobral (CE). A cobertura do mapa colaborativo pode estar incompleta, e cada registro inclui o link ao objeto de origem para conferência. O estado do funil (etapa, compras, visitas, sinais do app) continua simulado; não há dado da Praso aqui. Distância e tempo a pé são estimativas em linha reta calculadas a partir da localização do aparelho, não uma rota viária.

As visitas, observações e fotos são guardadas no armazenamento local do aparelho. A interface mantém uma fila local; a sincronização automática só poderá ser ligada depois que existir uma API de visitas. O protótipo ainda não tem servidor.

O script `scripts/gerar_dados.py` gera a base. Com `--fonte osm` ele troca os estabelecimentos fictícios
por estabelecimentos reais do OpenStreetMap (Overpass API, gratuita e sem chave). O funil continua simulado.

```bash
python scripts/gerar_dados.py                 # estabelecimentos do OpenStreetMap em Sobral
python scripts/gerar_dados.py --fonte ficticia # base fictícia para testes
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
