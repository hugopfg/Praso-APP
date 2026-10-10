import { useCallback, useEffect, useMemo, useState } from 'react';
import mock from './data/mock.js';
import {
  ETAPAS, OBJECOES, PRAZO_RECORRENCIA, acaoSugerida,
} from './lib/regras.js';
import { aplicarCheckin, resultadosPorEtapa, JANELAS_OPCOES } from './lib/checkin.js';
import Mapa from './Mapa.jsx';

const STORAGE_KEY = 'praso-campo-v4';
const base = mock.legacy;
const MONTHLY_GOAL = { points: 18.5, target: 30, expectedToday: 10, businessDaysLeft: 14 };
const ROUTES = { '/': 'dia', '/mapa': 'mapa', '/ativacao': 'ativacao', '/sobre': 'sobre' };
const PATHS = { dia: '/', mapa: '/mapa', ativacao: '/ativacao', sobre: '/sobre' };
const COLORS = { lead: '#2053CE', oportunidade: '#8A5A00', churn: '#B42318', ativacao: '#0B7348', recorrente: '#56627F' };
const FOOD_SEGMENT = (type = '') => /padaria|panific/i.test(type) ? 'Padaria' : /pizz/i.test(type) ? 'Pizzaria' : /lanch|hamburg|sandu/i.test(type) ? 'Lanchonete' : /restaur|comida|cozinha/i.test(type) ? 'Restaurante' : type;
const points = (value) => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const cap = (value = '') => value.charAt(0).toUpperCase() + value.slice(1);

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved?.estabelecimentos?.length) return saved;
  } catch { /* armazenamento local indisponível */ }
  return { estabelecimentos: base.estabelecimentos, pontosGanhos: 0, registros: [], filaSincronizacao: [] };
}

function usePath() {
  const [path, setPath] = useState(() => ROUTES[window.location.pathname] || 'dia');
  useEffect(() => {
    const onPop = () => setPath(ROUTES[window.location.pathname] || 'dia');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = useCallback((tab) => {
    const url = PATHS[tab] || '/';
    if (window.location.pathname !== url) window.history.pushState({}, '', url);
    setPath(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);
  return [path, go];
}

function Icon({ name, size = 22, className = '' }) {
  const shared = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, className };
  const paths = {
    pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 10h18c0-2-3-3-3-10"/><path d="M10 21h4"/></>,
    day: <><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4m8-4v4M3 10h18m-12 5 2 2 4-4"/></>,
    map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15m6-12v15"/></>,
    user: <><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0m5-13v6m-3-3h6"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/></>,
    plus: <path d="M12 5v14m-7-7h14"/>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    locate: <><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></>,
    navigate: <path d="m3 11 18-8-8 18-2-8-8-2Z"/>,
    phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/>,
    help: <><circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 1c0 2-3 3-3 4m0 3h.01"/></>,
    check: <><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    close: <path d="m18 6-12 12M6 6l12 12"/>,
  };
  return <svg {...shared}>{paths[name] || null}</svg>;
}

export default function App() {
  const [state, setState] = useState(loadState);
  const [tab, go] = usePath();
  const [selected, setSelected] = useState(null);
  const [checkinId, setCheckinId] = useState(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [notice, setNotice] = useState('');
  const [sellerPosition, setSellerPosition] = useState(null);
  const clients = state.estabelecimentos;
  const byId = useMemo(() => Object.fromEntries(clients.map((x) => [x.id, x])), [clients]);

  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { console.warn('Não foi possível salvar as alterações neste aparelho.'); } }, [state]);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 3200);
    return () => clearTimeout(timer);
  }, [notice]);

  const day = useMemo(() => montarDia(clients), [clients]);
  const nextVisit = day.visitas[0]?.e || clients.find((x) => x.etapa === 'lead') || clients[0];
  const activationList = clients.filter((x) => x.etapa === 'ativacao');
  const activationClient = activationList[0];
  const visitCount = clients.filter((x) => x.feitoHoje).length;
  const riskCount = clients.filter((x) => x.etapa === 'churn' || (x.etapa === 'ativacao' && (x.cadastroDiasAtras || 0) > PRAZO_RECORRENCIA - 5)).length;
  const totalPoints = MONTHLY_GOAL.points + state.pontosGanhos;
  const completedActivations = clients.filter((x) => x.etapa === 'recorrente').length;

  function saveCheckin(client, response, note, photo) {
    const { novo, dev } = aplicarCheckin(client, response);
    const visit = { id: crypto.randomUUID?.() || `${Date.now()}-${client.id}`, clientId: client.id, createdAt: new Date().toISOString(), outcome: response.resultado || response.encontro, note, photo, syncStatus: navigator.onLine ? 'pending' : 'offline' };
    novo.visitas = [{ ...(novo.visitas?.[0] || {}), observacao: note, foto: photo || undefined, registroId: visit.id }, ...(novo.visitas || []).slice(1)];
    const gained = novo.etapa === 'recorrente' && client.etapa !== 'recorrente' ? client.pontos : 0;
    setState((old) => ({
      ...old, pontosGanhos: old.pontosGanhos + gained, registros: [...old.registros, { id: client.id, tipo: 'checkin', seg: 0, visitaId: visit.id }],
      filaSincronizacao: [...(old.filaSincronizacao || []), visit], estabelecimentos: old.estabelecimentos.map((x) => x.id === client.id ? novo : x),
    }));
    setCheckinId(null); setSelected(null); setNotice(navigator.onLine ? `${dev.titulo}. Visita salva neste aparelho.` : 'Visita salva offline. Será enviada quando a conexão voltar.');
  }

  function resetDemo() {
    if (!window.confirm('Limpar os registros desta demonstração neste aparelho?')) return;
    localStorage.removeItem(STORAGE_KEY);
    setState({ estabelecimentos: base.estabelecimentos, pontosGanhos: 0, registros: [], filaSincronizacao: [] });
    go('dia');
  }

  const overlayClient = checkinId ? byId[checkinId] : selected ? byId[selected] : null;
  const modalOpen = Boolean(checkinId || overlayClient);

  return (
    <div className="app-shell">
      <header className="global-header" aria-hidden={modalOpen} inert={modalOpen}>
        <div className="territory-bar"><span><Icon name="pin" size={14}/>Seu território: <strong>{base.territorio ? `${base.territorio}, ` : ''}{base.cidade}, CE</strong></span><span className="route-status"><i/>Em rota</span></div>
        <div className="top-bar">
          <div className="wordmark" aria-label="praso campo"><strong>praso</strong><span> campo</span></div>
          <div className="top-actions">
            <button className="icon-button notification-button" aria-label={`Notificações${riskCount ? `, ${riskCount} clientes em risco` : ''}`} onClick={() => go('dia')}><Icon name="bell"/><i/></button>
            <button className="avatar avatar-small" aria-label={`Perfil de ${base.vendedor}`} onClick={() => go('sobre')}>{base.vendedor.charAt(0)}</button>
          </div>
        </div>
      </header>

      <main className={`page page-${tab}`} key={tab} aria-hidden={modalOpen} inert={modalOpen}>
        {tab === 'dia' && <MeuDia day={day} totalPoints={totalPoints} done={visitCount} risks={riskCount} onSelect={setSelected} onOpenMap={() => go('mapa')} />}
        {tab === 'mapa' && <MapaScreen clients={clients} day={day} onLocation={setSellerPosition} sellerPosition={sellerPosition} onDetails={setSelected} />}
        {tab === 'ativacao' && <Ativacao clients={activationList} selected={activationClient} done={completedActivations} onSelect={setSelected} />}
        {tab === 'sobre' && <Sobre records={state.registros} queued={state.filaSincronizacao?.length || 0} online={online} reset={resetDemo} />}
      </main>

      {(tab === 'dia' || tab === 'ativacao') && <PrimaryAction onClick={() => setCheckinId((tab === 'ativacao' ? activationClient : nextVisit)?.id)} disabled={tab === 'ativacao' && !activationClient} inert={modalOpen} aria-hidden={modalOpen} />}
      <nav className="tab-bar" aria-label="Navegação principal" aria-hidden={modalOpen} inert={modalOpen}>
        {[
          ['dia', 'Meu dia', 'day'], ['mapa', 'Mapa', 'map'], ['ativacao', 'Ativação', 'user'], ['sobre', 'Sobre', 'info'],
        ].map(([id, label, icon]) => <button key={id} className={`tab-item ${tab === id ? 'active' : ''}`} onClick={() => go(id)} aria-current={tab === id ? 'page' : undefined}><span className="tab-icon"><Icon name={icon}/></span><span>{label}</span></button>)}
      </nav>

      {overlayClient && !checkinId && <ClientDetails client={overlayClient} onClose={() => setSelected(null)} onCheckin={() => setCheckinId(overlayClient.id)} />}
      {checkinId && byId[checkinId] && <Checkin client={byId[checkinId]} onClose={() => setCheckinId(null)} onSave={saveCheckin} />}
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  );
}

function PrimaryAction({ onClick, disabled, inert, 'aria-hidden': ariaHidden }) { return <div className="primary-action" aria-hidden={ariaHidden} inert={inert}><button className="primary-button" onClick={onClick} disabled={disabled}><Icon name="plus"/>Registrar visita</button></div>; }

function MeuDia({ day, totalPoints, done, risks, onSelect, onOpenMap }) {
  const [now] = useState(() => new Date());
  const greeting = now.getHours() < 12 ? 'Bom dia' : now.getHours() < 18 ? 'Boa tarde' : 'Boa noite';
  const scheduled = day.visitas.map(({ e, acao }) => ({ e, acao }));
  const next = scheduled[0];
  const date = cap(now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }));
  const left = Math.max(0, MONTHLY_GOAL.target - totalPoints);
  return <div className="scroll-content">
    <div className="page-heading"><p className="muted date-label">{date}</p><h1>{greeting}, {base.vendedor}</h1></div>
    <section className="card goal-card" aria-label="Meta do mês">
      <div className="goal-head"><span>Meta de {cap(now.toLocaleDateString('pt-BR', { month: 'long' }))}</span><strong className={totalPoints >= MONTHLY_GOAL.expectedToday ? 'text-green' : 'text-amber'}>{totalPoints >= MONTHLY_GOAL.expectedToday ? 'Acima do ritmo' : 'Abaixo do ritmo'}</strong></div>
      <div className="goal-value"><strong>{points(totalPoints)}</strong><span>/ {MONTHLY_GOAL.target} pontos</span></div>
      <div className="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax={MONTHLY_GOAL.target} aria-valuenow={Math.min(totalPoints, MONTHLY_GOAL.target)} aria-label={`${points(totalPoints)} de ${MONTHLY_GOAL.target} pontos`}><span style={{ width: `${Math.min(100, totalPoints / MONTHLY_GOAL.target * 100)}%` }}/></div>
      <p className="goal-foot">Faltam <strong>{points(left)} pontos</strong> em {MONTHLY_GOAL.businessDaysLeft} dias úteis</p>
    </section>

    <section className="day-section">
      <div className="section-title-row"><h2 className="section-label">Próxima visita</h2><span className="muted small-text">{done} de {scheduled.length + done} feitas</span></div>
      {next ? <button className="focus-card visit-focus" onClick={onOpenMap}>
        <span className="focus-content"><span className="eyebrow blue-text">Próxima visita · {next.e.janelaDono?.split('–')[0] || 'A combinar'}</span><strong className="focus-name">{next.e.nome}</strong><span className="visit-meta"><span className="text-amber">{stageGoal(next.e)}</span> · {next.e.bairro || base.cidade}</span><span className="focus-objective">{next.acao.texto}</span></span><Icon name="chevron"/>
      </button> : <Empty text="Nenhuma visita agendada hoje. Veja a carteira para escolher o próximo cliente."/>}
    </section>

    <section className="day-section">
      <div className="section-title-row"><h2 className="section-label">Depois</h2><span className="muted small-text">{scheduled.length} visitas na rota</span></div>
      <div className="list-card">{scheduled.slice(1, 3).map(({ e, acao }) => <button className="list-row" key={e.id} onClick={() => onSelect(e.id)}><span className="time-label">{e.janelaDono?.split('–')[0] || '—'}</span><span className="row-copy"><strong>{e.nome}</strong><small>{stageGoal(e)} · {e.bairro || base.cidade}</small><small>{acao.texto}</small></span><Icon name="chevron" size={18}/></button>)}{scheduled.length <= 1 && <p className="empty-row">Mais visitas aparecem conforme a carteira é priorizada.</p>}</div>
    </section>

    <button className="row-link" onClick={onOpenMap}><i className="status-dot danger-dot"/><strong>{risks} clientes em risco</strong><span>Ver no mapa</span><Icon name="chevron" size={18}/></button>
    <section className="day-section"><div className="section-title-row"><h2 className="section-label">Resolver pelo WhatsApp</h2><span className="muted small-text">{day.mensagens.length} mensagens</span></div>
      <div className="list-card">{day.mensagens.slice(0, 2).map(({ e, acao }) => <div className="list-row" key={e.id}><button className="row-copy text-button" onClick={() => onSelect(e.id)}><strong>{e.nome}</strong><small>{acao.texto}</small></button><a className="outline-button compact-button" href={`https://wa.me/?text=${encodeURIComponent(`Olá! Aqui é ${base.vendedor}, da Praso. Posso ajudar com os insumos do seu estabelecimento?`)}`} target="_blank" rel="noreferrer">Enviar</a></div>)}{!day.mensagens.length && <p className="empty-row">Nenhuma mensagem pendente hoje.</p>}</div>
    </section>
    <p className="data-note">Estabelecimentos nomeados do OpenStreetMap. Informações de etapa, agenda e histórico são demonstração.</p>
  </div>;
}

function stageGoal(client) {
  if (client.etapa === 'lead') return 'Ativação';
  if (client.etapa === 'churn') return 'Recuperação';
  if (client.etapa === 'oportunidade') return 'Primeiro pedido';
  if (client.etapa === 'ativacao') return 'Recompra';
  return 'Relacionamento';
}

function MapaScreen({ clients, day, onLocation, sellerPosition, onDetails }) {
  const [filter, setFilter] = useState('Todos');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(day.visitas[0]?.e.id || clients[0]?.id);
  const filtered = clients.filter((client) => {
    const matchesQuery = client.nome.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'));
    const matchesFilter = filter === 'Todos' || (filter === 'Leads' && client.etapa === 'lead') || (filter === 'Em ativação' && client.etapa === 'ativacao') || (filter === 'Em risco' && (client.etapa === 'churn' || client.problemaEntrega));
    return matchesQuery && matchesFilter;
  });
  const markers = filtered.map((client, index) => ({ id: client.id, lat: client.lat, lng: client.lng, nome: client.nome, tipo: client.tipo, cor: COLORS[client.etapa] || COLORS.lead, rotulo: index + 1 }));
  const selected = filtered.find((x) => x.id === selectedId) || filtered[0];
  const routePath = sellerPosition && selected ? [sellerPosition, { lat: selected.lat, lng: selected.lng }] : [];
  const startNavigation = (client) => { if (!client) return; window.open(`https://www.google.com/maps/dir/?api=1&destination=${client.lat},${client.lng}`, '_blank', 'noopener,noreferrer'); };
  return <div className="map-page">
    <Mapa itens={markers} routePath={routePath} aoTocar={setSelectedId} classe="map-full" localizar onLocation={onLocation} />
    <div className="map-search-wrap"><label className="map-search"><Icon name="search"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente" aria-label="Buscar cliente no mapa"/><span>{filtered.length}</span></label>
      <div className="map-filters" role="group" aria-label="Filtrar estabelecimentos">{['Todos', 'Leads', 'Em ativação', 'Em risco'].map((name) => <button key={name} className={filter === name ? 'selected-filter' : ''} aria-pressed={filter === name} onClick={() => setFilter(name)}>{name}</button>)}</div>
    </div>
    {selected && <section className="bottom-sheet" aria-label="Próxima parada"><div className="sheet-grabber"/><div className="sheet-heading"><div><span className="eyebrow blue-text">Próxima parada · {selected.janelaDono?.split('–')[0] || 'A combinar'}</span><h1>{selected.nome}</h1><p className="muted">{stageGoal(selected)} · {ETAPAS[selected.etapa] || selected.tipo}</p></div><div className="sheet-distance">{sellerPosition ? <><strong>{distanceLabel(sellerPosition, selected)}</strong><small>{walkingTimeLabel(sellerPosition, selected)} a pé · aprox.</small></> : <><strong>—</strong><small>distância</small></>}</div></div><div className="sheet-actions"><button className="outline-button" onClick={() => onDetails(selected.id)}>Detalhes</button><button className="primary-button" onClick={() => startNavigation(selected)}><Icon name="navigate"/>Iniciar rota</button></div></section>}
  </div>;
}

function distanceLabel(position, client) {
  const rad = (n) => n * Math.PI / 180;
  const a = Math.sin(rad(client.lat - position.lat) / 2) ** 2 + Math.cos(rad(position.lat)) * Math.cos(rad(client.lat)) * Math.sin(rad(client.lng - position.lng) / 2) ** 2;
  const km = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1).replace('.', ',')} km`;
}

function walkingTimeLabel(position, client) {
  const rad = (n) => n * Math.PI / 180;
  const a = Math.sin(rad(client.lat - position.lat) / 2) ** 2 + Math.cos(rad(position.lat)) * Math.cos(rad(client.lat)) * Math.sin(rad(client.lng - position.lng) / 2) ** 2;
  const km = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return `${Math.max(1, Math.round(km / 4 * 60))} min`;
}

function Ativacao({ clients, selected, done, onSelect }) {
  const [activeClientId, setActiveClientId] = useState(selected?.id);
  const [showAll, setShowAll] = useState(false);
  const client = clients.find((candidate) => candidate.id === activeClientId) || selected;
  if (!client) return <div className="scroll-content"><PageTitle title="Ativação" subtitle="Clientes que precisam de acompanhamento até a recorrência."/><Empty text="Nenhum estabelecimento nesta etapa agora."/></div>;
  const purchases = client.compras?.length || 0;
  const stepLabels = ['Cadastro aprovado', 'App instalado pelo dono', 'Primeiro pedido', 'Cliente recorrente'];
  const activeIndex = Math.min(purchases + 2, 3);
  const completedSteps = Math.min(purchases + 2, 4);
  const initials = client.nome.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
  const due = Math.max(0, PRAZO_RECORRENCIA - (client.cadastroDiasAtras || 0));
  return <div className="scroll-content activation-content">
    <PageTitle title="Ativação" subtitle={`${done} etapa${done === 1 ? '' : 's'} concluída${done === 1 ? '' : 's'} no mês`} action={`Ver todas (${clients.length})`} onAction={() => setShowAll((value) => !value)} />
    {showAll && <div className="list-card activation-picker">{clients.map((candidate) => <button className={`list-row ${candidate.id === client.id ? 'picker-active' : ''}`} key={candidate.id} onClick={() => { setActiveClientId(candidate.id); setShowAll(false); }}><span className="row-copy"><strong>{candidate.nome}</strong><small>{FOOD_SEGMENT(candidate.tipo)} · {candidate.bairro || base.cidade}</small></span><Icon name="chevron" size={18}/></button>)}</div>}
    <section className="card activation-card">
      <button className="activation-client" onClick={() => onSelect(client.id)}><span className="client-monogram">{initials}</span><span className="client-main"><strong>{client.nome}</strong><small>{FOOD_SEGMENT(client.tipo)} · {client.bairro || base.cidade}</small></span><span className="client-points"><strong>+{points(client.pontos)}</strong><small>pontos</small></span></button>
      <div className="stage-summary"><strong>Etapa {Math.min(activeIndex + 1, 4)} de 4</strong><span className="muted">Prazo {due ? `em ${due} dias` : 'encerrado'}</span></div>
      <div className="steps-track" role="progressbar" aria-valuemin="0" aria-valuemax="4" aria-valuenow={completedSteps} aria-label={`${completedSteps} de 4 etapas`}>
        {stepLabels.map((_, index) => <span key={index} className={index < completedSteps ? 'step-done' : index === completedSteps && completedSteps < 4 ? 'step-current' : ''}/>)}</div>
    </section>
    <section className="focus-card activation-focus" aria-current="step"><div className="focus-body"><span className="eyebrow blue-text">Próximo passo</span><h2>{client.problemaEntrega ? 'Resolver a primeira entrega' : purchases === 0 ? 'Fazer o primeiro pedido' : 'Acompanhar a próxima compra'}</h2><p>{acaoSugerida(client).texto}</p></div><button className="focus-link" onClick={() => onSelect(client.id)}>Ver detalhes do estabelecimento<Icon name="chevron" size={18}/></button></section>
    <section className="day-section"><h2 className="section-label">Etapas</h2><div className="list-card step-list">{stepLabels.map((label, index) => { const complete = index < completedSteps; const current = index === completedSteps && completedSteps < 4; return <div className="list-row step-row" key={label} aria-current={current ? 'step' : undefined}><Icon name={complete ? 'check' : 'info'} className={complete ? 'text-green' : current ? 'blue-text' : 'muted'}/><strong>{label}</strong><small className={current ? 'blue-text step-now' : 'muted'}>{complete ? 'Concluída' : current ? 'Agora' : 'Pendente'}</small></div>; })}</div></section>
    <section className="card basket-card"><span className="eyebrow blue-text">Cesta sugerida</span><h2>Itens para a próxima conversa</h2><p>Use o histórico de compras real do estabelecimento quando a integração estiver disponível.</p></section>
    <p className="data-note">O estágio e o histórico de compras exibidos são dados de demonstração, ainda não integrados ao sistema de vendas.</p>
  </div>;
}

function PageTitle({ title, subtitle, action, onAction }) { return <div className="page-title-row"><div><h1>{title}</h1><p className="muted">{subtitle}</p></div>{action && (onAction ? <button className="text-link text-link-button" onClick={onAction}>{action}</button> : <span className="text-link">{action}</span>)}</div>; }

function Sobre({ records, queued, online, reset }) {
  const count = records.filter((record) => record.tipo === 'checkin').length;
  return <div className="scroll-content about-content">
    <section className="profile-card"><span className="avatar avatar-large">{base.vendedor.charAt(0)}</span><span><h1>{base.vendedor === 'Hugo' ? 'Hugo Parente' : base.vendedor}</h1><p className="muted">Vendedor de campo · {base.cidade}</p></span></section>
    <section className="about-section"><h2 className="section-label">Pontuação</h2><div className="list-card"><div className="list-row"><span>Cliente ativado</span><strong>+1,5</strong></div><div className="list-row"><span>Cliente em risco recuperado</span><strong>+1</strong></div><div className="list-row"><span>Visita registrada</span><strong>+0,5</strong></div></div><p className="footnote">Valores ilustrativos. A regra oficial de pontos ainda precisa ser conectada.</p></section>
    <section className="about-section"><h2 className="section-label">Suporte</h2><div className="list-card"><div className="list-row support-row"><Icon name="phone"/><strong>Falar com o supervisor</strong><span className="muted support-placeholder">Contato a configurar</span></div><div className="list-row support-row"><Icon name="help"/><strong>Central de ajuda</strong><span className="muted support-placeholder">Em breve</span></div></div><p className="footnote">Adicione o telefone do supervisor e o endereço oficial da central de ajuda.</p></section>
    <section className="about-section"><h2 className="section-label">Dados e conexão</h2><div className="list-card status-list"><div className="list-row"><span>Conexão</span><strong className={online ? 'text-green' : 'text-amber'}>{online ? 'Online' : 'Offline'}</strong></div><div className="list-row"><span>Visitas salvas neste aparelho</span><strong>{count}</strong></div><div className="list-row"><span>Na fila local</span><strong>{queued}</strong></div></div><p className="footnote">Os registros permanecem neste dispositivo. O envio automático depende de uma API de sincronização que ainda não está configurada.</p></section>
    <div className="signout"><button onClick={reset}>Limpar dados desta demonstração</button><span>praso campo · versão 2.0</span></div>
  </div>;
}

function ClientDetails({ client, onClose, onCheckin }) {
  useDialogFocus();
  return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="full-modal" role="dialog" aria-modal="true" aria-label={client.nome} onKeyDown={(event) => event.key === 'Escape' && onClose()}><div className="modal-top"><button className="icon-button" aria-label="Fechar detalhes" onClick={onClose}><Icon name="close"/></button><span>Detalhes do cliente</span></div><h1>{client.nome}</h1><p className="muted">{FOOD_SEGMENT(client.tipo)} · {client.endereco || client.bairro || base.cidade}</p><a className="source-link" href={`https://www.openstreetmap.org/${client.osmElemento}/${client.osmId}`} target="_blank" rel="noreferrer">Conferir registro no OpenStreetMap</a><div className="list-card detail-list"><div className="list-row"><span>Etapa</span><strong>{ETAPAS[client.etapa]}</strong></div><div className="list-row"><span>Objetivo sugerido</span><strong>{stageGoal(client)}</strong></div><div className="list-row"><span>Contato</span><strong>{client.decisor || 'A confirmar na visita'}</strong></div><div className="list-row"><span>Janela informada</span><strong>{client.janelaDono || 'A confirmar'}</strong></div></div><button className="primary-button modal-cta" onClick={onCheckin}><Icon name="plus"/>Registrar visita</button></section></div>;
}

function Checkin({ client, onClose, onSave }) {
  useDialogFocus();
  const [response, setResponse] = useState({});
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState('');
  const [saving, setSaving] = useState(false);
  const step = !response.encontro ? 'encontro' : response.encontro === 'dono_ausente' ? 'janela' : !response.resultado && response.encontro !== 'fechado' ? 'resultado' : !response.objecao && response.resultado === 'nao' ? 'objecao' : 'review';
  const choose = (next) => setResponse((value) => ({ ...value, ...next }));
  const onPhoto = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const image = await createImageBitmap(file);
      const scale = Math.min(1, 1200 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      image.close();
      setPhoto(canvas.toDataURL('image/jpeg', .72));
    } catch { setPhoto(''); }
  };
  return <div className="modal-backdrop"><section className="full-modal checkin-modal" role="dialog" aria-modal="true" aria-label={`Registrar visita em ${client.nome}`} onKeyDown={(event) => event.key === 'Escape' && onClose()}><div className="modal-top"><button className="text-back" onClick={onClose}>Cancelar</button><strong>{client.nome}</strong></div>
    {step === 'encontro' && <><PageTitle title="Conseguiu falar com quem decide?" subtitle="Escolha uma opção para registrar a visita."/><div className="choice-list"><Choice onClick={() => choose({ encontro: 'decisor' })}>Sim, falei com quem decide</Choice><Choice onClick={() => choose({ encontro: 'dono_ausente' })}>Não estava</Choice><Choice onClick={() => choose({ encontro: 'fechado' })}>Estava fechado</Choice></div></>}
    {step === 'janela' && <><PageTitle title="Quando ele costuma estar?" subtitle="Esse horário ajuda a equipe na próxima visita."/><div className="choice-list">{JANELAS_OPCOES.map((value) => <Choice key={value} onClick={() => choose({ janela: value, resultado: 'nao', objecao: 'tempo' })}>{value}</Choice>)}<Choice onClick={() => choose({ resultado: 'nao', objecao: 'tempo' })}>Não souberam informar</Choice></div></>}
    {step === 'resultado' && <><PageTitle title="Como terminou a conversa?" subtitle="Selecione o resultado que melhor representa a visita."/><div className="choice-list">{resultadosPorEtapa(client.etapa).map((option) => <Choice key={option.id} onClick={() => choose({ resultado: option.id })}>{option.t}</Choice>)}</div></>}
    {step === 'objecao' && <><PageTitle title="O que mais pesou?" subtitle="A objeção principal orienta o próximo passo."/><div className="choice-list">{Object.entries(OBJECOES).map(([key, objection]) => <Choice key={key} onClick={() => choose({ objecao: key })}>{objection.rotulo}</Choice>)}</div></>}
    {step === 'review' && <><PageTitle title="Resumo da visita" subtitle="Adicione um comentário ou uma foto se for útil."/><div className="card result-card"><span className="text-green">✓ Resultado selecionado</span><strong>{response.resultado || response.encontro}</strong></div><label className="field-label">Observação <span className="muted">(opcional)</span><textarea value={note} onChange={(event) => setNote(event.target.value)} rows="4" maxLength="500" placeholder="Anote o combinado ou o próximo passo"/></label><label className="upload-button">{photo ? 'Foto anexada ✓' : 'Adicionar foto (opcional)'}<input type="file" accept="image/*" capture="environment" onChange={onPhoto}/></label>{photo && <img className="photo-preview" src={photo} alt="Prévia da foto anexada"/>}<button className="primary-button save-visit" disabled={saving} onClick={() => { setSaving(true); onSave(client, response, note, photo); }}>{saving ? 'Salvando…' : 'Salvar visita'}</button></>}
  </section></div>;
}

function Choice({ children, onClick }) { return <button className="choice-button" onClick={onClick}>{children}<Icon name="chevron"/></button>; }
function Empty({ text }) { return <div className="empty-state">{text}</div>; }

function useDialogFocus() {
  useEffect(() => {
    const previous = document.activeElement;
    const target = document.querySelector('.full-modal button, .full-modal a, .full-modal textarea, .full-modal input');
    target?.focus();
    return () => { if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
}
