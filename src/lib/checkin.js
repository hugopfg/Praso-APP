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

function comCompraHoje(e) {
  const compras = [0, ...(e.compras || [])];
  const etapa = compras.length >= 3 ? 'recorrente' : 'ativacao';
  return {
    ...e,
    etapa,
    compras,
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
    if (r.janela) dev.linhas.push('O horário do dono fica salvo para qualquer vendedor que passar por lá.');
    return { novo, dev };
  }

  // Falou com o decisor: registra o papel de quem decide (nem sempre é o dono)
  if (r.papel) novo.decisorConfirmado = r.papel;
  visita.resultado = r.resultado === 'nao' ? 'objecao' : r.resultado;
  if (r.objecao) visita.objecao = r.objecao;

  switch (r.resultado) {
    case 'cadastro_pedido':
    case 'pedido':
    case 'pedido_ajuda': {
      novo = { ...comCompraHoje(novo), voltaEmDias: undefined };
      const n = novo.compras.length;
      if (novo.etapa === 'recorrente') {
        dev.titulo = 'Cliente chegou à 3ª compra';
        dev.linhas.push('Atenção: a 3ª compra conta para recorrência quando é feita pelo próprio cliente no app.');
        dev.pontos = `Vale ${String(e.pontos).replace('.', ',')} pt quando confirmada como autônoma`;
      } else {
        const prazo = PRAZO_RECORRENCIA - novo.cadastroDiasAtras;
        dev.titulo = `${ETAPAS.ativacao}: ${n} de 3 compras`;
        dev.linhas.push(`Prazo para a 3ª compra autônoma: ${prazo} dias.`);
        if (n === 1)
          dev.linhas.push('Depois da entrega, confira com ele se chegou tudo completo. Nas entrevistas, é o que mais pesa para o cliente voltar a comprar.');
        dev.linhas.push(`Lembrete de reposição programado para daqui a ${novo.cicloCompraDias - 1} dias, pelo WhatsApp.`);
        dev.pontos = `Vale ${String(e.pontos).replace('.', ',')} pt quando virar recorrente`;
      }
      return { novo, dev };
    }
    case 'cadastro': {
      novo = { ...novo, etapa: 'ativacao', compras: [], cadastroDiasAtras: 0, cicloCompraDias: 7, voltaEmDias: 2 };
      dev.titulo = 'Cadastro feito';
      dev.linhas.push(`Retorno agendado para ${diaSemana(2)}, ${novo.janelaDono}, para fazer o 1º pedido junto.`);
      dev.linhas.push('Quem cadastra e não compra na primeira semana costuma esfriar. Hipótese a validar com os dados da Praso.');
      dev.pontos = `Vale ${String(e.pontos).replace('.', ',')} pt quando virar recorrente`;
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
