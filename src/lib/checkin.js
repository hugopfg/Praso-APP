import { OBJECOES, PRAZO_RECORRENCIA, diaSemana, ETAPAS } from './regras.js';

// Opções da 2ª pergunta mudam conforme a etapa: o vendedor só vê o que faz sentido.
export function resultadosPorEtapa(etapa) {
  if (etapa === 'lead')
    return [
      { id: 'cadastro_pedido', t: 'Cadastrou e fez o 1º pedido' },
      { id: 'cadastro', t: 'Cadastrou, pedido fica para depois' },
      { id: 'nao', t: 'Não cadastrou' },
    ];
  if (etapa === 'ativacao')
    return [
      { id: 'pedido_ajuda', t: 'Fez pedido com a minha ajuda' },
      { id: 'pedido_autonomo', t: 'Comprou sozinho pelo app' },
      { id: 'vai_pedir', t: 'Vai pedir sozinho pelo app' },
      { id: 'nao', t: 'Não quer pedir agora' },
    ];
  return [
    { id: 'pedido', t: 'Fez pedido agora' },
    { id: 'vai_pedir', t: 'Vai pedir pelo app depois' },
    { id: 'nao', t: 'Não quer comprar' },
  ];
}

export const JANELAS_OPCOES = ['7h–9h', '9h–11h30', '14h–16h', '15h–17h', '18h–20h'];

function comCompraHoje(e, autonomo = false) {
  const compras = [0, ...(e.compras || [])];
  const comprasAutonomas = [...(e.comprasAutonomas || [])];
  const diasCadastro = Math.max(0, e.cadastroDiasAtras || 0);
  if (autonomo) comprasAutonomas.push({ ordem: compras.length, diasCadastro });
  const recorrenciaConcluida = Boolean(e.recorrenciaConcluida)
    || (compras.length === 3 && autonomo && diasCadastro <= PRAZO_RECORRENCIA);
  const etapa = e.etapa === 'recorrente' || recorrenciaConcluida ? 'recorrente' : 'ativacao';
  return {
    ...e,
    etapa,
    compras,
    comprasAutonomas,
    recorrenciaConcluida,
    cadastroDiasAtras: e.etapa === 'ativacao' ? e.cadastroDiasAtras : 0,
    cicloCompraDias: e.cicloCompraDias || 7,
    // 1ª compra feita agora: a entrega ainda precisa ser conferida
    entregaConfirmada: compras.length >= 2 ? true : false,
    problemaEntrega: false,
  };
}

// Recebe o estabelecimento e as respostas; devolve o novo estado e o que a plataforma "devolve" ao vendedor.
export function aplicarCheckin(e, r) {
  const visita = { diasAtras: 0, resultado: r.encontro };
  let novo = { ...e, feitoHoje: true, visitas: [visita, ...(e.visitas || [])] };
  const dev = { titulo: '', linhas: [], argumento: null, pontos: null };

  if (r.encontro === 'fechado') {
    novo.voltaEmDias = 1;
    dev.titulo = 'Tentativa registrada';
    dev.linhas.push(`Volta para a sua fila ${diaSemana(1)}, em outro horário.`);
    return { novo, dev };
  }

  if (r.encontro === 'dono_ausente') {
    if (r.janela) { novo.janelaDono = r.janela; novo.janelaFonte = 'aprendida'; }
    novo.voltaEmDias = 1;
    dev.titulo = `Volta agendada para ${diaSemana(1)}, ${novo.janelaDono}`;
    dev.linhas.push('A fila de amanhã já te leva lá no horário em que o dono costuma estar.');
    if (r.janela) dev.linhas.push('O horário do responsável fica salvo neste aparelho para orientar a próxima visita.');
    return { novo, dev };
  }

  // Falou com o decisor: registra o papel de quem decide (nem sempre é o dono)
  if (r.papel) novo.decisorConfirmado = r.papel;
  visita.resultado = r.resultado === 'nao' ? 'objecao' : r.resultado;
  if (r.objecao) visita.objecao = r.objecao;

  switch (r.resultado) {
    case 'cadastro_pedido':
    case 'pedido':
    case 'pedido_ajuda':
    case 'pedido_autonomo': {
      const autonomo = r.resultado === 'pedido_autonomo';
      novo = { ...comCompraHoje(novo, autonomo), voltaEmDias: undefined };
      if (novo.recorrenciaConcluida) {
        dev.titulo = 'Cliente chegou à 3ª compra autônoma';
        dev.linhas.push('Recorrência concluída dentro do prazo de 45 dias do cadastro.');
      } else {
        const prazo = PRAZO_RECORRENCIA - novo.cadastroDiasAtras;
        const n = novo.compras.length;
        dev.titulo = n === 3 && autonomo
          ? '3ª compra autônoma registrada fora do prazo'
          : n >= 3 ? '3ª compra registrada; autonomia não confirmada' : `${ETAPAS.ativacao}: ${n} de 3 compras`;
        if (n === 3 && autonomo) dev.linhas.push('A compra foi autônoma, mas ocorreu após o prazo de 45 dias do cadastro.');
        dev.linhas.push(`Prazo para a 3ª compra autônoma: ${Math.max(0, prazo)} dias.`);
        if (!autonomo) dev.linhas.push('Este pedido foi assistido e não conta como compra autônoma.');
        if (n === 1)
          dev.linhas.push('Depois da entrega, confira com ele se chegou tudo completo. Nas entrevistas, é o que mais pesa para o cliente voltar a comprar.');
        dev.linhas.push(`Lembrete de reposição programado para daqui a ${novo.cicloCompraDias - 1} dias, pelo WhatsApp.`);
      }
      return { novo, dev };
    }
    case 'cadastro': {
      novo = { ...novo, etapa: 'ativacao', compras: [], cadastroDiasAtras: 0, cicloCompraDias: 7, voltaEmDias: 2 };
      dev.titulo = 'Cadastro feito';
      dev.linhas.push(`Retorno agendado para ${diaSemana(2)}, ${novo.janelaDono}, para fazer o 1º pedido junto.`);
      dev.linhas.push('Quem cadastra e não compra na primeira semana costuma esfriar. Hipótese a validar com os dados da Praso.');
      return { novo, dev };
    }
    case 'vai_pedir': {
      novo.voltaEmDias = 2;
      dev.titulo = 'Combinado';
      dev.linhas.push(`Se o pedido não aparecer no app até ${diaSemana(2)}, ele volta para a sua lista de mensagens.`);
      return { novo, dev };
    }
    default: {
      const o = OBJECOES[r.objecao] || OBJECOES.tempo;
      novo.voltaEmDias = o.diasRetorno;
      dev.titulo = o.proximo;
      dev.linhas.push(`Agendado para ${diaSemana(o.diasRetorno)}.`);
      dev.argumento = o.argumento;
      return { novo, dev };
    }
  }
}
