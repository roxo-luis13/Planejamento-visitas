import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { intervalo, linhasRelatorio, resumoVisita } from '../src/lib/relatorio';
import { lerValor } from '../src/components/RegistroVisita';
import { db, obterRota } from '../src/db';
import { alternarNaRota, registrarVisita } from '../src/lib/acoes';
import type { Cliente, Visita } from '../src/types';

const cli = (codigo: string): Cliente => ({
  codigo, uf: 'SP', meso: '', micro: 'SAO JOSE DOS CAMPOS', cidade: 'TAUBATE', bairro: 'CENTRO', cep: '', razao: 'Razão', fantasia: 'Loja ' + codigo,
  grupo: 'G1', rede: '', marcas: [], freqMedia: null, freqAtual: null, fin: { vencidos: null, protestados: null, inadimplencia: null },
  ativo: 1, importadoEm: '', endereco: null, local: null, geoStatus: 'pendente', avisoCep: null, notas: ''
});

describe('relatório de visitas', () => {
  const v: Visita = {
    id: 'A|2026-11-02', codigo: 'A', data: '2026-11-02', resultado: 'pedido', nota: 'pediu catálogo', em: '',
    chegadaEm: '2026-11-02T13:00:00.000Z', saidaEm: '2026-11-02T13:40:00.000Z',
    contato: 'Ana', assuntos: ['colecao', 'vitrine'], pedido: { pecas: { MORMAII: 30, COLCCI: 12 }, valor: 4590.5, numero: 'P-123' }, retorno: '2026-12-02'
  };
  it('uma linha por visita, com uma coluna por informação', () => {
    const [l] = linhasRelatorio([v, { ...v, id: 'x', removido: true }], new Map([['A', cli('A')]]));
    expect(l).toMatchObject({
      'Data': '02/11/2026', 'Dia da semana': 'segunda', 'Duração (min)': 40, 'Nome fantasia': 'Loja A', 'Cidade': 'Taubate',
      'Resultado': 'Pedido feito', 'Com quem falou': 'Ana', 'Assuntos': 'Coleção nova, Vitrine / exposição',
      'Peças Mormaii': 30, 'Peças Colcci': 12, 'Peças Youy': '', 'Total de peças': 42, 'Valor (R$)': 4590.5, 'Nº do pedido': 'P-123',
      'Retorno combinado': '02/12/2026', 'Observação': 'pediu catálogo'
    });
    expect(linhasRelatorio([v, { ...v, id: 'x', removido: true }], new Map())).toHaveLength(1);
  });
  it('resumo curto e motivo', () => {
    expect(resumoVisita(v).replace(/\s/g, ' ')).toBe('42 pç · R$ 4.590,50 · retorno 02/12');
    expect(resumoVisita({ ...v, pedido: null, retorno: null, resultado: 'sem_pedido', motivo: 'estoque_alto' })).toBe('Estoque alto');
  });
  it('períodos', () => {
    expect(intervalo('este_mes', '2026-11-15')).toEqual(['2026-11-01', '2026-11-15']);
    expect(intervalo('mes_passado', '2026-01-10')).toEqual(['2025-12-01', '2025-12-31']);
    expect(intervalo('ultimos_30', '2026-11-30')).toEqual(['2026-11-01', '2026-11-30']);
  });
  it('lê valores em reais', () => {
    expect(lerValor('1.234,56')).toBe(1234.56);
    expect(lerValor('R$ 99,9')).toBe(99.9);
    expect(lerValor('250')).toBe(250);
    expect(lerValor('')).toBeNull();
  });
});

describe('registrar visita', () => {
  beforeEach(async () => {
    await Promise.all([db.clientes.clear(), db.rotas.clear(), db.historico.clear(), db.config.clear()]);
    await db.clientes.put(cli('A'));
  });
  it('sem nada preenchido grava "visita registrada"; retorno vai para a rota do dia combinado; desfazer marca removido', async () => {
    await alternarNaRota('2030-01-02', 'A');
    await registrarVisita('2030-01-02', 'A', { resultado: 'visitado', nota: '' });
    let h = await db.historico.get('A|2030-01-02');
    expect(h?.resultado).toBe('visitado');
    expect((await obterRota('2030-01-02')).paradas[0].resultado).toBe('visitado');

    await registrarVisita('2030-01-02', 'A', { resultado: 'reagendado', nota: 'voltar', retorno: '2030-01-09', lancarRetornoNaRota: true });
    const outra = await obterRota('2030-01-09');
    expect(outra.paradas.map((p) => p.codigo)).toEqual(['A']);
    expect(outra.paradas[0].nota).toContain('Reagendado em 02/01/2030');

    await registrarVisita('2030-01-02', 'A', null);
    h = await db.historico.get('A|2030-01-02');
    expect(h?.removido).toBe(true);
    expect((await obterRota('2030-01-02')).paradas[0].resultado).toBeNull();
  });
  it('visita fora da rota (pela ficha do cliente) entra na rota do dia já registrada', async () => {
    await registrarVisita('2030-02-01', 'A', { resultado: 'sem_pedido', motivo: 'preco', nota: '' });
    const r = await obterRota('2030-02-01');
    expect(r.paradas).toHaveLength(1);
    expect(r.paradas[0].resultado).toBe('sem_pedido');
  });
});
