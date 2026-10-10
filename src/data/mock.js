// @ts-check
import source from './estabelecimentos.json';

const month = new Date().toISOString().slice(0, 7);
const segmentOf = (type = '') => {
  if (/padaria|panific/i.test(type)) return 'padaria';
  if (/pizz/i.test(type)) return 'pizzaria';
  if (/lanch|hamburg|sandu/i.test(type)) return 'lanchonete';
  return 'restaurante';
};

/** @type {import('./model.js').Client[]} */
const clients = source.estabelecimentos.map((record) => ({
  id: record.id,
  name: record.nome,
  segment: segmentOf(record.tipo),
  lat: record.lat,
  lng: record.lng,
  daysSinceLastOrder: Number.isFinite(record.ultimaCompraDiasAtras)
    ? record.ultimaCompraDiasAtras
    : record.compras?.length ? Math.min(...record.compras) : null,
  osmType: record.osmElemento,
  osmId: record.osmId,
}));

/** @type {import('./model.js').PrasoFieldMock} */
const mock = {
  seller: { id: 'seller-demo', name: source.vendedor, territory: source.cidade, supervisorPhone: '' },
  monthlyGoal: { month, points: 18.5, target: 30, expectedToday: 10, businessDaysLeft: 14 },
  clients,
  visits: [],
  activations: source.estabelecimentos
    .filter((record) => record.etapa === 'ativacao')
    .map((record) => ({
      clientId: record.id,
      points: record.pontos,
      deadline: new Date(Date.now() + Math.max(0, 45 - (record.cadastroDiasAtras || 0)) * 86400000).toISOString(),
      steps: [
        { key: 'cadastro', label: 'Cadastro aprovado', doneAt: null },
        { key: 'app', label: 'App instalado pelo dono', doneAt: null },
        { key: 'primeiro_pedido', label: 'Primeiro pedido', doneAt: null },
        { key: 'segundo_pedido', label: 'Segundo pedido', doneAt: null },
      ],
      suggestedBasket: [],
    })),
};

export default { ...mock, legacy: source };
