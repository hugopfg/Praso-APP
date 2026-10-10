import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import base from './data/estabelecimentos.json';
import {
  ETAPAS, OBJECOES, PRAZO_RECORRENCIA, montarDia, acaoSugerida, nivelRisco, diasRestantes,
  comprasFeitas, linkWhatsApp, linkRota, diaSemana, janelaAgora,
} from './lib/regras.js';
import { aplicarCheckin, resultadosPorEtapa, JANELAS_OPCOES } from './lib/checkin.js';
import Mapa from './Mapa.jsx';

const CHAVE = 'praso-campo-v1';
const PONTOS_MES_BASE = 18.5;
const META_MES = 30;

function carregar() {
  try {
    const s = localStorage.getItem(CHAVE);
    if (s) return JSON.parse(s);
  } catch { /* armazenamento indisponível: segue com a base */ }
  return { estabelecimentos: base.estabelecimentos, pontosGanhos: 0, registros: [] };
}

const capitalizar = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const COR_ETAPA = { lead: '#8299bb', oportunidade: '#b89972', churn: '#b89972', ativacao: '#83a392', recorrente: '#83a392' };
const corDe = (e) => (e.etapa === 'ativacao' && nivelRisco(e) === 'alto' ? '#c28f89' : COR_ETAPA[e.etapa] || '#89978e');
const nomeDecisor = (e) => (/a confirmar/.test(e.decisor || '') ? 'quem decide' : (e.decisor || '').split(' ')[0]);
const FONTE_JANELA = {
  entrevistas: 'padrão validado em entrevistas',
  hipotese: 'hipótese pelo tipo de negócio',
  aprendida: 'informado na visita',
};
const quemDecide = (e) => (e.decisorConfirmado ? `${e.decisorConfirmado} (confirmado na visita)` : e.decisor);

const rotuloTerritorio = () => {
  const t = base.territorio && !String(base.territorio).includes(',')
    ? String(base.territorio).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : '';
  return t ? `${t}, ${base.cidade}` : base.cidade;
};

const territorio = () => {
  const t = base.territorio ? String(base.territorio).replace(/-/g, ' ') : '';
  return base.fonte === 'osm'
    ? `Estabelecimentos reais${t && !t.includes(',') ? ` de ${t.replace(/\b\w/g, (c) => c.toUpperCase())},` : ''} ${base.cidade}, via OpenStreetMap. Etapas do funil, compras e histórico são simulados.`
    : `Estabelecimentos e funil simulados para ${base.cidade}.`;
};

const fmtPts = (n) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

export default function App() {
  const [estado, setEstado] = useState(carregar);
  const [aba, setAba] = useState('dia');
  const [aberto, setAberto] = useState(null);
  const [checkin, setCheckin] = useState(null);

  useEffect(() => {
    try { localStorage.setItem(CHAVE, JSON.stringify(estado)); } catch { /* ignora */ }
  }, [estado]);

  const porId = useMemo(
    () => Object.fromEntries(estado.estabelecimentos.map((e) => [e.id, e])),
    [estado.estabelecimentos]
  );

  function atualizar(novo, extra = {}) {
    setEstado((s) => ({
      ...s,
      ...(typeof extra === 'function' ? extra(s) : extra),
      estabelecimentos: s.estabelecimentos.map((e) => (e.id === novo.id ? novo : e)),
    }));
  }

  function marcarMensagem(e) {
    atualizar({ ...e, feitoHoje: true, voltaEmDias: 2 }, (s) => ({
      registros: [...s.registros, { id: e.id, tipo: 'mensagem', seg: 2 }],
    }));
  }

  function marcarEntrega(e, situacao) {
    const novo = situacao === 'problema'
      ? { ...e, problemaEntrega: true, entregaConfirmada: false }
      : { ...e, problemaEntrega: false, entregaConfirmada: true };
    atualizar(novo, (s) => ({ registros: [...s.registros, { id: e.id, tipo: 'entrega', seg: 2 }] }));
  }

  function resetar() {
    try { localStorage.removeItem(CHAVE); } catch { /* ignora */ }
    setEstado({ estabelecimentos: base.estabelecimentos, pontosGanhos: 0, registros: [] });
    setAba('dia');
    window.scrollTo(0, 0);
  }

  function trocarAba(id) {
    setAba(id);
    window.scrollTo(0, 0);
  }

  const emDetalhe = aberto && porId[aberto];
  const emCheckin = checkin && porId[checkin];

  return (
    <div className="app-raiz">
      <header className="marca">
        <div className="marca-faixa">Seu território: <strong>{rotuloTerritorio()}</strong></div>
        <div className="marca-barra">
          <span className="marca-nome">
            <img className="marca-logo" src="/praso-logo.svg" alt="" />
            <span className="marca-titulo">praso<span>campo</span></span>
          </span>
          <span className="avatar" aria-label={`Vendedor: ${base.vendedor}`}>{base.vendedor.charAt(0)}</span>
        </div>
      </header>
    <div className="app">
      <main className="conteudo" aria-hidden={Boolean(emDetalhe || emCheckin)}>
        {aba === 'dia' && (
          <MeuDia estado={estado} abrir={setAberto} iniciar={setCheckin} mensagem={marcarMensagem} />
        )}
        {aba === 'ativacao' && (
          <Ativacao estabelecimentos={estado.estabelecimentos} abrir={setAberto} mensagem={marcarMensagem} entrega={marcarEntrega} />
        )}
        {aba === 'mapa' && <MapaCompleto estabelecimentos={estado.estabelecimentos} abrir={setAberto} />}
        {aba === 'sobre' && <Sobre resetar={resetar} registros={estado.registros} />}
      </main>

      <nav className="abas" aria-label="Seções">
        {[
          ['dia', 'Meu dia', <><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V21h13V9.5M9 21v-7h6v7"/></>],
          ['mapa', 'Mapa', <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/></>],
          ['ativacao', 'Ativação', <><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M19 8v6M22 11h-6"/></>],
          ['sobre', 'Sobre', <><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></>],
        ].map(([id, t, icon]) => (
          <button key={id} className={aba === id ? 'ativa' : ''} aria-current={aba === id} onClick={() => trocarAba(id)}>
            <svg className="aba-icone" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
            <span>{t}</span>
          </button>
        ))}
      </nav>

      {emDetalhe && !emCheckin && (
        <Detalhe e={emDetalhe} fechar={() => setAberto(null)} iniciar={() => setCheckin(emDetalhe.id)} entrega={marcarEntrega} />
      )}
      {emCheckin && (
        <CheckIn
          e={emCheckin}
          fechar={() => { setCheckin(null); setAberto(null); }}
          salvar={(novo, seg, pts) =>
            atualizar(novo, (s) => ({
              pontosGanhos: s.pontosGanhos + pts,
              registros: [...s.registros, { id: novo.id, tipo: 'checkin', seg }],
            }))
          }
        />
      )}
    </div>
    </div>
  );
}

/* ---------- Meu dia ---------- */

function MeuDia({ estado, abrir, iniciar, mensagem }) {
  const agora = new Date();
  const { visitas, mensagens } = useMemo(() => montarDia(estado.estabelecimentos), [estado.estabelecimentos]);
  const feitos = estado.estabelecimentos.filter((e) => e.feitoHoje).length;
  const agendados = estado.estabelecimentos
    .filter((e) => e.voltaEmDias > 0)
    .sort((a, b) => a.voltaEmDias - b.voltaEmDias);
  const pontosMes = PONTOS_MES_BASE + estado.pontosGanhos;
  const [foco, setFoco] = useState(null);
  const pinos = useMemo(
    () => visitas.map(({ e }, i) => ({ id: e.id, lat: e.lat, lng: e.lng, nome: e.nome, cor: corDe(e), rotulo: i + 1 })),
    [visitas]
  );
  const focar = useCallback((id) => {
    setFoco(id);
    document.getElementById(`visita-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => setFoco((f) => (f === id ? null : f)), 1800);
  }, []);
  const h = agora.getHours();
  const saud = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';

  return (
    <>
      <header className="topo">
        <p className="data">{capitalizar(agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }))}</p>
        <h1>{saud}, {base.vendedor}</h1>
        <div className="meta">
          <p className="meta-num"><strong>{fmtPts(pontosMes)}</strong> de {META_MES} pontos no mês</p>
          <div className="barra"><span style={{ width: `${Math.min(100, (pontosMes / META_MES) * 100)}%` }} /></div>
          <p className="meta-legenda">
            {visitas.length} visitas e {mensagens.length} mensagens na fila.{feitos > 0 && ` ${feitos} já registradas hoje.`}
          </p>
        </div>
      </header>

      <section>
        <h2>Rota de hoje</h2>
        <p className="ajuda">Escolhidas pelo valor, ordenadas pelo horário em que o dono costuma estar.</p>
        <ol className="linha-do-dia">
          {visitas.map(({ e, motivos, acao }, i) => (
            <li key={e.id} id={`visita-${e.id}`} className={`${janelaAgora(e.janelaDono) ? 'agora' : ''} ${foco === e.id ? 'foco' : ''}`}>
              <div className="hora" aria-hidden="true">
                <span className="hora-n">{e.janelaDono.split('–')[0]}</span>
                <span className="ordem">{i + 1}</span>
              </div>
              <article className="cartao">
                <button className="cartao-corpo" onClick={() => abrir(e.id)}>
                  <span className="cartao-cab">
                    <span className="nome">{e.nome}</span>
                    <span className={`etapa etapa-${e.etapa}`}>{ETAPAS[e.etapa]}</span>
                  </span>
                  <span className="sub">{e.tipo} no bairro {e.bairro}, {e.porte} ({fmtPts(e.pontos)} pt)</span>
                  <span className="acao">{acao.texto}</span>
                  <span className="motivos">
                    {motivos.slice(0, 3).map((m) => <span key={m.t} className={`m-${m.tom}`}>{m.t}</span>)}
                  </span>
                </button>
                <div className="botoes">
                  <a className="btn sec" href={linkRota(e)} target="_blank" rel="noreferrer">Rota</a>
                  <button className="btn destaque-amarelo" onClick={() => iniciar(e.id)}>Registrar visita</button>
                </div>
              </article>
            </li>
          ))}
          {visitas.length === 0 && <li className="vazio">Rota concluída. Veja as mensagens abaixo ou a carteira de ativação.</li>}
        </ol>
        {visitas.length > 0 && (
          <div className="mapa-detalhe-rota">
            <div className="mapa-titulo">
              <h3>Veja a rota no mapa</h3>
              <p className="ajuda">Toque em um ponto para localizar a visita na lista.</p>
            </div>
            <Mapa itens={pinos} rota aoTocar={focar} classe="mapa-rota" />
          </div>
        )}
      </section>

      <section>
        <h2>Resolver pelo WhatsApp</h2>
        <p className="ajuda">Lembrete de recompra e carrinho aberto não precisam de visita.</p>
        <ul className="lista-msg">
          {mensagens.map(({ e, acao, motivos }) => (
            <li key={e.id}>
              <button className="msg-info" onClick={() => abrir(e.id)}>
                <strong>{e.nome}</strong>
                <span>{acao.texto}</span>
                {motivos[0] && <span className={`m-${motivos[0].tom} mini`}>{motivos[0].t}</span>}
              </button>
              <a className="btn wa" href={linkWhatsApp(e)} target="_blank" rel="noreferrer" onClick={() => mensagem(e)}>
                Enviar
              </a>
            </li>
          ))}
          {mensagens.length === 0 && <li className="vazio">Nenhuma mensagem pendente.</li>}
        </ul>
      </section>

      {agendados.length > 0 && (
        <section>
          <h2>Já agendados</h2>
          <ul className="lista-agenda">
            {agendados.map((e) => (
              <li key={e.id}>
                <button onClick={() => abrir(e.id)}>
                  <span className="dia">{diaSemana(e.voltaEmDias)}</span>
                  <span className="nome">{e.nome}</span>
                  <span className="janela">{e.janelaDono}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/* ---------- Mapa do território ---------- */

const FILTROS_MAPA = [
  { id: 'lead', t: 'Leads', cor: '#8299bb', ok: (e) => e.etapa === 'lead' },
  { id: 'oport', t: 'Sem compra ou parados', cor: '#b89972', ok: (e) => e.etapa === 'oportunidade' || e.etapa === 'churn' },
  { id: 'ativ', t: 'Em ativação', cor: '#83a392', ok: (e) => e.etapa === 'ativacao' && nivelRisco(e) !== 'alto' },
  { id: 'risco', t: 'Risco de prazo', cor: '#c28f89', ok: (e) => e.etapa === 'ativacao' && nivelRisco(e) === 'alto' },
];

function MapaCompleto({ estabelecimentos, abrir }) {
  const [ativos, setAtivos] = useState(() => new Set(FILTROS_MAPA.map((f) => f.id)));
  const [sel, setSel] = useState(null);
  const visiveis = useMemo(
    () => estabelecimentos.filter((e) => FILTROS_MAPA.some((f) => ativos.has(f.id) && f.ok(e))),
    [estabelecimentos, ativos]
  );
  const pinos = useMemo(
    () => visiveis.map((e) => ({ id: e.id, lat: e.lat, lng: e.lng, nome: e.nome, cor: corDe(e) })),
    [visiveis]
  );
  const aoTocar = useCallback((id) => setSel(id), []);
  const e = sel && estabelecimentos.find((x) => x.id === sel);

  function alternar(id) {
    setAtivos((a) => {
      const n = new Set(a);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  return (
    <div className="tela-mapa">
      <div className="filtros filtros-mapa" role="group" aria-label="Etapas no mapa">
        {FILTROS_MAPA.map((f) => {
          const n = estabelecimentos.filter(f.ok).length;
          return (
            <button key={f.id} className={ativos.has(f.id) ? 'on' : ''} aria-pressed={ativos.has(f.id)} onClick={() => alternar(f.id)}>
              <span className="ponto" style={{ background: f.cor }} />{f.t} ({n})
            </button>
          );
        })}
      </div>
      <Mapa itens={pinos} aoTocar={aoTocar} classe="mapa-cheio" localizar />
      {e && (
        <div className="selecionado">
          <div className="cartao-cab">
            <span className="nome">{e.nome}</span>
            <span className={`etapa etapa-${e.etapa}`}>{ETAPAS[e.etapa]}</span>
          </div>
          <span className="sub">{e.tipo} no bairro {e.bairro}, dono costuma estar {e.janelaDono}</span>
          <span className="acao">{acaoSugerida(e).texto}</span>
          <div className="botoes-sel">
            <button className="btn sec" onClick={() => abrir(e.id)}>Ver cliente</button>
            <a className="btn" href={linkRota(e)} target="_blank" rel="noreferrer">Ir até lá</a>
          </div>
          <button className="fechar-selecionado" onClick={() => setSel(null)} aria-label="Fechar cartão do cliente">×</button>
        </div>
      )}
    </div>
  );
}

/* ---------- Ativação ---------- */

const ordemEntrega = (x) => (x.e.problemaEntrega ? 0 : x.acao.posEntrega ? 1 : 2);

function Ativacao({ estabelecimentos, abrir, mensagem, entrega }) {
  const [soRisco, setSoRisco] = useState(false);
  const todos = estabelecimentos.filter((e) => e.etapa === 'ativacao');
  const lista = todos
    .map((e) => ({ e, nivel: nivelRisco(e), acao: acaoSugerida(e) }))
    .filter((x) => !soRisco || x.nivel === 'alto')
    // Pós-venda primeiro (problema, depois entrega a conferir), depois o prazo mais curto
    .sort((a, b) =>
      ordemEntrega(a) - ordemEntrega(b) ||
      diasRestantes(a.e) - diasRestantes(b.e) ||
      comprasFeitas(a.e) - comprasFeitas(b.e));
  const emRisco = todos.filter((e) => nivelRisco(e) === 'alto').length;
  const recorrentes = estabelecimentos.filter((e) => e.etapa === 'recorrente').length;

  return (
    <>
      <header className="topo">
        <h1>Carteira de ativação</h1>
        <p className="ajuda">
          Clientes entre o cadastro e a 3ª compra autônoma, em até {PRAZO_RECORRENCIA} dias. A meta é a recorrência, não o cadastro.
          Conferir a 1ª entrega vem primeiro: é o que faz o cliente voltar.
          {recorrentes > 0 && ` ${recorrentes} chegaram à 3ª compra nesta sessão.`}
        </p>
        <div className="filtros" role="group" aria-label="Filtro">
          <button className={!soRisco ? 'on' : ''} onClick={() => setSoRisco(false)}>Todos ({todos.length})</button>
          <button className={soRisco ? 'on' : ''} onClick={() => setSoRisco(true)}>Risco de perder o prazo ({emRisco})</button>
        </div>
      </header>
      <ul className="lista-ativ">
        {lista.map(({ e, nivel, acao }) => {
          const dr = diasRestantes(e);
          return (
            <li key={e.id} className={`risco-${e.problemaEntrega ? 'alto' : nivel}`}>
              <button className="ativ-info" onClick={() => abrir(e.id)}>
                <span className="cartao-cab">
                  <span className="nome">{e.nome}</span>
                  <span className="prazo">{dr > 0 ? `faltam ${dr} dias` : 'prazo vencido'}</span>
                </span>
                <Progresso n={comprasFeitas(e)} />
                <span className="tempo" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, (e.cadastroDiasAtras / PRAZO_RECORRENCIA) * 100)}%` }} />
                </span>
                <span className={`acao ${acao.canal}`}>{acao.texto}</span>
              </button>
              {acao.canal === 'whatsapp' && (
                <a className="btn" href={linkWhatsApp(e)} target="_blank" rel="noreferrer" onClick={() => !acao.posEntrega && mensagem(e)}>
                  {e.problemaEntrega ? 'Falar com o cliente no WhatsApp' : acao.posEntrega ? 'Perguntar no WhatsApp' : 'Enviar mensagem no WhatsApp'}
                </a>
              )}
              {acao.posEntrega && <BotoesEntrega e={e} entrega={entrega} />}
            </li>
          );
        })}
        {lista.length === 0 && <li className="vazio">Nenhum cliente nesse filtro.</li>}
      </ul>
    </>
  );
}

function BotoesEntrega({ e, entrega }) {
  if (e.problemaEntrega)
    return (
      <div className="botoes-entrega">
        <button className="btn sec" onClick={() => entrega(e, 'ok')}>Problema resolvido</button>
      </div>
    );
  return (
    <div className="botoes-entrega">
      <button className="btn sec" onClick={() => entrega(e, 'ok')}>Chegou certo</button>
      <button className="btn sec alerta" onClick={() => entrega(e, 'problema')}>Teve problema</button>
    </div>
  );
}

function Progresso({ n }) {
  return (
    <span className="progresso" aria-label={`${n} de 3 compras`}>
      {['Cadastro', '1ª', '2ª', '3ª'].map((t, i) => (
        <span key={t} className={i <= n ? 'ok' : ''}>{t}</span>
      ))}
    </span>
  );
}

/* ---------- Detalhe ---------- */

const ROTULO_VISITA = {
  dono_ausente: 'Dono não estava', fechado: 'Estava fechado', objecao: 'Falou com o dono, não fechou',
  cadastro_pedido: 'Cadastrou e comprou', cadastro: 'Cadastrou', pedido: 'Fez pedido',
  pedido_ajuda: 'Pedido com ajuda', vai_pedir: 'Ficou de pedir pelo app',
};

function Detalhe({ e, fechar, iniciar, entrega }) {
  const acao = acaoSugerida(e);
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <div className="painel" role="dialog" aria-modal="true" aria-label={e.nome}>
      <div className="painel-topo">
        <button className="voltar" onClick={fechar}>Voltar</button>
      </div>
      <h1>{e.nome}</h1>
      <p className="sub">{e.tipo} no bairro {e.bairro}. {e.endereco}</p>
      <span className={`etapa etapa-${e.etapa}`}>{ETAPAS[e.etapa]}</span>

      <dl className="ficha">
        <div><dt>Quem decide</dt><dd>{quemDecide(e)}</dd></div>
        <div>
          <dt>Quando encontrar</dt>
          <dd>{e.janelaDono}{e.janelaFonte && <span className="fonte">{FONTE_JANELA[e.janelaFonte]}</span>}</dd>
        </div>
        <div><dt>Porte e pontos</dt><dd>{e.porte}, {fmtPts(e.pontos)} pt</dd></div>
        <div><dt>Como compra hoje</dt><dd>{e.compraHoje}</dd></div>
        {e.etapa === 'ativacao' && (
          <div><dt>Compras</dt><dd>{comprasFeitas(e)} de 3, faltam {diasRestantes(e)} dias</dd></div>
        )}
        {e.etapa === 'churn' && <div><dt>Última compra</dt><dd>há {e.ultimaCompraDiasAtras} dias</dd></div>}
      </dl>

      <div className="destaque">
        <p className="rot">Próximo passo sugerido</p>
        <p>{acao.texto}</p>
        {acao.posEntrega && <BotoesEntrega e={e} entrega={entrega} />}
      </div>

      {e.sinais?.length > 0 && (
        <>
          <h2>Sinais do app</h2>
          <ul className="hist">
            {e.sinais.map((s, i) => <li key={i}>{s.texto} <span>{s.diasAtras === 0 ? 'hoje' : `há ${s.diasAtras} d`}</span></li>)}
          </ul>
        </>
      )}

      <h2>Histórico de visitas</h2>
      <ul className="hist">
        {(e.visitas || []).map((v, i) => (
          <li key={i}>
            {ROTULO_VISITA[v.resultado] || v.resultado}
            {v.objecao && `: ${OBJECOES[v.objecao]?.rotulo.toLowerCase()}`}
            <span>{v.diasAtras === 0 ? 'hoje' : `há ${v.diasAtras} d`}</span>
          </li>
        ))}
        {!(e.visitas || []).length && <li className="vazio">Nenhuma visita ainda. Vá na janela do dono.</li>}
      </ul>

      <div className="botoes fixos">
        <a className="btn sec" href={linkRota(e)} target="_blank" rel="noreferrer">Rota</a>
        {acao.canal === 'whatsapp' && (
          <a className="btn sec" href={linkWhatsApp(e)} target="_blank" rel="noreferrer">WhatsApp</a>
        )}
        <button className="btn destaque-amarelo" onClick={iniciar}>Registrar visita</button>
      </div>
    </div>
  );
}

/* ---------- Check-in: até 3 toques, sempre devolve o próximo passo ---------- */

function CheckIn({ e, fechar, salvar }) {
  const inicio = useRef(Date.now());
  const [r, setR] = useState({});
  const [fim, setFim] = useState(null);
  useEffect(() => { window.scrollTo(0, 0); }, []);

  function concluir(resp) {
    const { novo, dev } = aplicarCheckin(e, resp);
    const seg = Math.max(1, Math.round((Date.now() - inicio.current) / 1000));
    const pts = novo.etapa === 'recorrente' && e.etapa !== 'recorrente' ? e.pontos : 0;
    salvar(novo, seg, pts);
    setFim({ dev, seg, toques: resp.toques });
  }

  const passo = fim ? 'fim'
    : !r.encontro ? 'encontro'
    : r.encontro === 'dono_ausente' ? 'janela'
    : !r.resultado ? 'resultado'
    : 'objecao';

  return (
    <div className="painel checkin" role="dialog" aria-modal="true" aria-label={`Registrar visita em ${e.nome}`}>
      <div className="painel-topo">
        <button className="voltar" onClick={fechar}>{fim ? 'Fechar' : 'Cancelar'}</button>
        <span className="quem">{e.nome}</span>
      </div>

      {passo === 'encontro' && (
        <Pergunta titulo="Conseguiu falar com quem decide a compra?">
          <Opcao onClick={() => setR({ encontro: 'decisor' })}>Sim, falei com {nomeDecisor(e)}</Opcao>
          <Opcao onClick={() => setR({ encontro: 'decisor', papel: 'Responsável pelas compras (gerente ou coordenador)' })}>
            Sim, com outra pessoa que cuida das compras
          </Opcao>
          <Opcao onClick={() => setR({ encontro: 'dono_ausente' })}>Não, ele não estava</Opcao>
          <Opcao onClick={() => concluir({ encontro: 'fechado', toques: 1 })}>Estava fechado</Opcao>
        </Pergunta>
      )}

      {passo === 'janela' && (
        <Pergunta titulo="Quando ele costuma estar?" dica="Pergunte a quem atendeu. O horário fica salvo para a equipe.">
          {JANELAS_OPCOES.map((j) => (
            <Opcao key={j} onClick={() => concluir({ encontro: 'dono_ausente', janela: j, toques: 2 })}>{j}</Opcao>
          ))}
          <Opcao sec onClick={() => concluir({ encontro: 'dono_ausente', toques: 2 })}>Ninguém soube dizer</Opcao>
        </Pergunta>
      )}

      {passo === 'resultado' && (
        <Pergunta titulo="Como terminou?">
          {resultadosPorEtapa(e.etapa).map((o) =>
            o.id === 'nao'
              ? <Opcao key={o.id} onClick={() => setR({ ...r, resultado: 'nao' })}>{o.t}</Opcao>
              : <Opcao key={o.id} onClick={() => concluir({ ...r, resultado: o.id, toques: 2 })}>{o.t}</Opcao>
          )}
        </Pergunta>
      )}

      {passo === 'objecao' && (
        <Pergunta titulo="O que mais pesou?" dica="Escolha a principal. Você recebe o argumento e o retorno já agendado.">
          {Object.entries(OBJECOES).map(([id, o]) => (
            <Opcao key={id} onClick={() => concluir({ ...r, objecao: id, toques: 3 })}>{o.rotulo}</Opcao>
          ))}
        </Pergunta>
      )}

      {passo === 'fim' && (
        <div className="devolucao">
          <p className="registrado">Registrado em {fim.toques} {fim.toques === 1 ? 'toque' : 'toques'}, {fim.seg} s</p>
          <h1>{fim.dev.titulo}</h1>
          {fim.dev.linhas.map((l) => <p key={l}>{l}</p>)}
          {fim.dev.argumento && (
            <div className="destaque">
              <p className="rot">Na próxima conversa</p>
              <p>{fim.dev.argumento}</p>
            </div>
          )}
          {fim.dev.pontos && <p className="pontos">{fim.dev.pontos}</p>}
          <button className="btn grande" onClick={fechar}>Voltar para a rota</button>
        </div>
      )}
    </div>
  );
}

function Pergunta({ titulo, dica, children }) {
  return (
    <div className="pergunta">
      <h1>{titulo}</h1>
      {dica && <p className="ajuda">{dica}</p>}
      <div className="opcoes">{children}</div>
    </div>
  );
}

function Opcao({ children, onClick, sec }) {
  return <button className={`opcao${sec ? ' sec' : ''}`} onClick={onClick}>{children}</button>;
}

/* ---------- Sobre ---------- */

function Sobre({ resetar, registros }) {
  const checkins = registros.filter((r) => r.tipo === 'checkin');
  const media = checkins.length ? Math.round(checkins.reduce((s, r) => s + r.seg, 0) / checkins.length) : null;
  return (
    <article className="sobre">
      <h1>Sobre este protótipo</h1>
      <p>
        Plataforma de campo para o vendedor da Praso. O protótipo cobre a parte que mais mexe na conversão:
        o dia organizado em torno da recorrência e um registro de visita que devolve o próximo passo.
      </p>
      <h2>Decisões principais</h2>
      <ul>
        <li><strong>A fila mistura aquisição e ativação.</strong> A meta é a 3ª compra autônoma, então clientes perto de perder os 45 dias disputam espaço com leads novos.</li>
        <li><strong>Visita onde presença converte, WhatsApp no resto.</strong> Lead, 1º pedido e cliente que esfriou pedem visita. Lembrete de recompra e carrinho aberto vão por mensagem e liberam agenda.</li>
        <li><strong>Escolher por valor, ordenar por horário.</strong> As 10 visitas são as de maior valor esperado, mas a ordem segue a janela em que o dono costuma estar.</li>
        <li><strong>Registro em até 3 toques, sempre com retorno.</strong> Cada registro agenda o próximo passo, devolve um argumento para a objeção e alimenta a janela do dono para a equipe.</li>
        <li><strong>Prioridade explicada.</strong> Cada item mostra por que está na fila. Vendedor confia no que entende.</li>
      </ul>
      <h2>O que as entrevistas mudaram</h2>
      <ul>
        <li><strong>Janela antes do almoço (2 de 2).</strong> À tarde o comprador faz notas, boletos e rotas. A janela padrão mudou, e a informada na visita passa a valer.</li>
        <li><strong>Conferir a 1ª entrega (2 de 2).</strong> O cliente fica com quem entrega completo e resolve trocas. A ativação agora começa pelo pós-venda.</li>
        <li><strong>Quem decide nem sempre é o dono.</strong> O registro aceita o responsável pelas compras.</li>
        <li><strong>Objeções revisadas.</strong> Entraram prazo de pagamento acima de 21 dias e medo de ruptura ou de não conseguir trocar.</li>
      </ul>
      <p className="ajuda">Limite: os dois entrevistados são compradores de médio porte. A visão do MEI ainda é hipótese.</p>
      <h2>Trade-offs</h2>
      <ul>
        <li>O mapa mostra a ordem da rota, mas a navegação curva a curva fica com o Google Maps, que o vendedor já usa.</li>
        <li>Pesos da priorização são hipóteses. Com dados reais, viram um modelo calibrado por etapa.</li>
        <li>Sem login e sem servidor: os dados ficam neste aparelho. Suficiente para testar o fluxo com vendedores.</li>
      </ul>
      <h2>Dados</h2>
      <p>{territorio()}</p>
      {media !== null && <p className="ajuda">Nesta sessão: {checkins.length} visitas registradas, média de {media} s por registro.</p>}
      <button className="btn sec" onClick={resetar}>Recomeçar a demonstração</button>
    </article>
  );
}

