// Regras de negócio do protótipo. Tudo aqui é transparente de propósito:
// o vendedor vê POR QUE algo está no topo da fila.

export const PRAZO_RECORRENCIA = 45; // 3ª compra autônoma em até 45 dias
export const VISITAS_POR_DIA = 10;

export const ETAPAS = {
  lead: 'Lead',
  oportunidade: 'Cadastrado sem compra',
  churn: 'Parou de comprar',
  ativacao: 'Em ativação',
  recorrente: 'Recorrente',
};

// Playbook de objeções: o que o vendedor diz e o que a plataforma agenda.
export const OBJECOES = {
  prazo: {
    rotulo: 'Precisa de prazo para pagar',
    argumento:
      'Um comprador entrevistado informou que precisa negociar prazo superior a 21 dias. Confira as condições comerciais disponíveis para este cliente antes de prometer qualquer prazo.',
    proximo: 'Retornar com as condições de pagamento',
    diasRetorno: 2,
  },
  troca: {
    rotulo: 'Medo de ruptura ou de não conseguir trocar',
    argumento:
      'O comprador valoriza receber exatamente o que pediu e ter suporte se houver falta, extravio ou validade curta. Explique o processo de pós-venda e confirme a política de troca antes de garantir uma solução.',
    proximo: 'Acompanhar a 1ª entrega',
    diasRetorno: 3,
  },
  preco: {
    rotulo: 'Acha caro',
    argumento:
      'Abra o app na frente dele e compare 3 itens de giro que ele compra toda semana (leite, ovos, queijo). Preço comparado vence preço falado.',
    proximo: 'Mandar comparativo no WhatsApp',
    diasRetorno: 2,
  },
  fornecedor: {
    rotulo: 'Já tem fornecedor de confiança',
    argumento:
      'Confiabilidade, pedido completo e pós-venda pesam na escolha. Entenda o que o fornecedor atual resolve bem e apresente como a Praso trata falhas e reposições, sem prometer o que não foi confirmado.',
    proximo: 'Apresentar diferenciais de entrega e pós-venda',
    diasRetorno: 7,
  },
  app: {
    rotulo: 'Não confia em comprar por app',
    argumento:
      'Ofereça ajuda no cadastro e no primeiro pedido. Mostre como pedir suporte se houver divergência, extravio ou validade curta; explique as condições reais de pós-venda e troca.',
    proximo: 'Visita para fazer o 1º pedido junto',
    diasRetorno: 2,
  },
  tempo: {
    rotulo: 'Sem tempo agora',
    argumento: 'Combine uma nova conversa pela manhã. Os compradores ouvidos relataram que a tarde costuma ficar ocupada com tarefas administrativas.',
    proximo: 'Voltar pela manhã, no horário combinado',
    diasRetorno: 1,
  },
};

export function horaInicioJanela(janela) {
  const m = /^(\d{1,2})h/.exec(janela || '');
  return m ? Number(m[1]) : 12;
}

export function janelaAgora(janela, hora = new Date().getHours()) {
  const m = /^(\d{1,2})h(?:\d{2})?–(\d{1,2})h/.exec(janela || '');
  if (!m) return false;
  return hora >= Number(m[1]) && hora < Number(m[2]);
}

export function diasRestantes(e) {
  return PRAZO_RECORRENCIA - (e.cadastroDiasAtras ?? 0);
}

export function comprasFeitas(e) {
  return (e.compras || []).length;
}

// A 3ª compra precisa ser autônoma e acontecer até 45 dias após o cadastro.
export function terceiraCompraAutonoma(e) {
  return Boolean(e.recorrenciaConcluida) || (e.comprasAutonomas || []).some(
    (compra) => compra.ordem === 3 && compra.diasCadastro <= PRAZO_RECORRENCIA,
  );
}

export function diasDesdeUltimaCompra(e) {
  const c = e.compras || [];
  return c.length ? Math.min(...c) : null;
}

// Risco de não chegar à 3ª compra no prazo: compras que faltam por dia restante.
export function riscoAtivacao(e) {
  const faltam = terceiraCompraAutonoma(e) ? 0 : Math.max(1, 3 - comprasFeitas(e));
  const dias = Math.max(diasRestantes(e), 1);
  return faltam / dias;
}

export function nivelRisco(e) {
  const r = riscoAtivacao(e);
  if (r >= 0.25 || diasRestantes(e) <= 5) return 'alto';
  if (r >= 0.1) return 'medio';
  return 'baixo';
}

// Decide se o próximo passo pede presença física ou cabe numa mensagem.
// Decisão de produto: visita vai para onde presença converte (lead, 1º pedido, quem esfriou);
// lembrete de recompra vai para o WhatsApp e libera agenda.
export function acaoSugerida(e) {
  if (e.etapa === 'lead') return { canal: 'visita', texto: 'Cadastrar e fazer o 1º pedido junto' };
  if (e.etapa === 'churn') return { canal: 'visita', texto: 'Entender por que parou e reativar' };
  if (e.etapa === 'oportunidade') {
    if (e.sinais?.some((s) => s.tipo === 'carrinho'))
      return { canal: 'whatsapp', texto: 'Ajudar a finalizar o carrinho aberto' };
    return { canal: 'visita', texto: 'Fazer o 1º pedido junto' };
  }
  if (e.etapa === 'ativacao') {
    const totalPedidos = comprasFeitas(e);
    if (terceiraCompraAutonoma(e)) return { canal: 'aguardar', texto: 'Recorrência concluída' };
    if (totalPedidos === 0) return { canal: 'visita', texto: 'Fazer o 1º pedido junto' };
    // Achado das entrevistas (2 de 2): o cliente fica com quem entrega certo e resolve problemas.
    if (e.problemaEntrega) return { canal: 'whatsapp', texto: 'Resolver o problema da 1ª entrega', posEntrega: true };
    if (totalPedidos === 1 && !e.entregaConfirmada) return { canal: 'whatsapp', texto: 'Conferir a 1ª entrega: chegou tudo certo?', posEntrega: true };
    if (totalPedidos === 1) return { canal: 'visita', texto: 'Acompanhar a 2ª compra' };
    if (totalPedidos === 2) return { canal: 'visita', texto: 'Preparar a 3ª compra autônoma no app' };
    return { canal: 'visita', texto: 'Recuperar a autonomia de compra no app' };
  }
  return { canal: 'aguardar', texto: 'Cliente recorrente' };
}

const PROB_ETAPA = { lead: 0.25, churn: 0.3, oportunidade: 0.45, ativacao: 0.6 };

// Pontuação de prioridade + motivos legíveis.
export function priorizar(e, hora) {
  const motivos = [];
  let score = e.pontos * (PROB_ETAPA[e.etapa] ?? 0.2) * 10;

  if (e.porte === 'Alto potencial') motivos.push({ t: 'Alto potencial, 3 pts', tom: 'forte' });

  if (e.problemaEntrega) {
    score *= 4;
    motivos.push({ t: 'Problema na 1ª entrega', tom: 'alerta' });
  } else if (e.etapa === 'ativacao' && comprasFeitas(e) === 1 && !e.entregaConfirmada) {
    score *= 2.5;
    motivos.push({ t: '1ª entrega ainda não conferida', tom: 'forte' });
  }
  if (e.etapa === 'ativacao') {
    const nivel = nivelRisco(e);
    const dr = diasRestantes(e);
    score *= nivel === 'alto' ? 3 : nivel === 'medio' ? 1.8 : 1;
    motivos.push({
      t: `${dr} dias para a 3ª compra autônoma, ${comprasFeitas(e)} de 3 compras`,
      tom: nivel === 'alto' ? 'alerta' : 'neutro',
    });
  }
  if (e.sinais?.some((s) => s.tipo === 'carrinho' && s.diasAtras <= 2)) {
    score *= 2.5;
    motivos.push({ t: 'Carrinho aberto no app', tom: 'forte' });
  } else if (e.sinais?.some((s) => s.tipo === 'acesso' && s.diasAtras <= 3)) {
    score *= 1.5;
    motivos.push({ t: 'Abriu o app há poucos dias', tom: 'neutro' });
  }
  if (e.etapa === 'churn') motivos.push({ t: `Sem comprar há ${e.ultimaCompraDiasAtras} dias`, tom: 'neutro' });

  const ausencias = (e.visitas || []).filter((v) => v.resultado === 'dono_ausente').length;
  if (ausencias) motivos.push({ t: `Dono ausente ${ausencias}x, ir na janela`, tom: 'neutro' });
  if (janelaAgora(e.janelaDono, hora)) {
    score *= 1.3;
    motivos.push({ t: `Dono costuma estar agora (${e.janelaDono})`, tom: 'forte' });
  }
  if (e.voltaEmDias === 0) {
    score *= 2;
    motivos.push({ t: 'Retorno combinado para hoje', tom: 'forte' });
  }
  const peso = { alerta: 0, forte: 1, neutro: 2 };
  motivos.sort((a, b) => peso[a.tom] - peso[b.tom]);
  return { score, motivos };
}

export function montarDia(estabelecimentos, hora = new Date().getHours()) {
  const ativos = estabelecimentos.filter(
    (e) => e.etapa !== 'recorrente' && !e.feitoHoje && !(e.voltaEmDias > 0)
  );
  const comPrioridade = ativos.map((e) => ({ e, acao: acaoSugerida(e), ...priorizar(e, hora) }));

  const visitas = comPrioridade
    .filter((x) => x.acao.canal === 'visita')
    .sort((a, b) => b.score - a.score)
    .slice(0, VISITAS_POR_DIA);
  // Escolhe POR VALOR, ordena POR HORÁRIO (chegar quando o dono está) e,
  // dentro da mesma janela, pelo vizinho mais próximo para não cruzar a cidade.
  const rota = ordenarRota(visitas);

  const mensagens = comPrioridade
    .filter((x) => x.acao.canal === 'whatsapp')
    .sort((a, b) => b.score - a.score);

  return { visitas: rota, mensagens };
}

function dist(a, b) {
  return Math.hypot(a.e.lat - b.e.lat, a.e.lng - b.e.lng);
}

function ordenarRota(itens) {
  const grupos = {};
  for (const x of itens) (grupos[horaInicioJanela(x.e.janelaDono)] ||= []).push(x);
  const rota = [];
  for (const h of Object.keys(grupos).map(Number).sort((a, b) => a - b)) {
    const resto = [...grupos[h]].sort((a, b) => b.score - a.score);
    let atual = rota.length ? rota[rota.length - 1] : null;
    while (resto.length) {
      let i = 0;
      if (atual) {
        let melhor = Infinity;
        resto.forEach((x, j) => { const d = dist(atual, x); if (d < melhor) { melhor = d; i = j; } });
      }
      atual = resto.splice(i, 1)[0];
      rota.push(atual);
    }
  }
  return rota;
}

export function mensagemWhatsApp(e) {
  const primeiro = (e.decisor || '').split(' ')[0];
  const acao = acaoSugerida(e);
  if (e.problemaEntrega)
    return `Oi, ${primeiro}! Aqui é o Hugo, da Praso. Já estou vendo o problema do seu primeiro pedido e te dou retorno hoje. Pode me mandar foto do que veio errado?`;
  if (acao.posEntrega)
    return `Oi, ${primeiro}! Aqui é o Hugo, da Praso. Seu pedido chegou completo e com boa validade? Se houve alguma divergência, me conte para eu verificar o suporte e as opções de solução disponíveis.`;
  if (acao.texto.startsWith('Ajudar a finalizar'))
    return `Oi, ${primeiro}! Aqui é o Hugo, da Praso. Vi que ficou um pedido montado no app. Quer que eu te ajude a finalizar? Se tiver dúvida de preço ou entrega, me chama aqui.`;
  if (e.etapa === 'ativacao')
    return `Oi, ${primeiro}! Aqui é o Hugo, da Praso. Já está chegando a hora de repor os insumos da ${e.tipo.toLowerCase()}. Pelo app você pede em 2 minutos e recebe aí. Quer que eu te mande os itens do último pedido?`;
  return `Oi, ${primeiro}! Aqui é o Hugo, da Praso. Vi que você costuma fazer os pedidos por WhatsApp. Posso te ajudar por aqui e, se fizer sentido, mostrar como funciona o app e o suporte para pedidos?`;
}

export function linkWhatsApp(e) {
  return `https://wa.me/?text=${encodeURIComponent(mensagemWhatsApp(e))}`;
}

export function linkRota(e) {
  return `https://www.google.com/maps/dir/?api=1&destination=${e.lat},${e.lng}`;
}

export function diaSemana(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  if (offset === 0) return 'hoje';
  if (offset === 1) return 'amanhã';
  return d.toLocaleDateString('pt-BR', { weekday: 'long' });
}
