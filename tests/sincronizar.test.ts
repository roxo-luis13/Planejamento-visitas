import { describe, expect, it } from 'vitest';
import { diferencas, mesclarCliente, mesclarPacotes, mesmoConteudo, type Pacote } from '../src/lib/sincronizar';
import type { Cliente } from '../src/types';

const cli = (o: Partial<Cliente>): Cliente => ({
  codigo: 'A', uf: 'SP', meso: '', micro: '', cidade: 'TAUBATE', bairro: 'CENTRO', cep: '', razao: '', fantasia: 'Loja', grupo: '', rede: '',
  marcas: [], freqMedia: null, freqAtual: null, fin: { vencidos: null, protestados: null, inadimplencia: null },
  ativo: 1, importadoEm: '', endereco: null, local: null, geoStatus: 'pendente', avisoCep: null, notas: '', _emPlanilha: 1, _emUsuario: 1, ...o
});
const pacote = (o: Partial<Pacote>): Pacote => ({ app: 'planejamento-visitas', versao: 2, em: '', clientes: [], rotas: [], historico: [], config: [], ...o });

describe('sincronização', () => {
  it('cliente: junta planilha nova de um aparelho com localização confirmada no outro', () => {
    const iphone = cli({ notas: 'falar com Ana', local: { lat: 1, lng: 2, precisao: 'confirmado', fonte: 'GPS', atualizadoEm: '' }, _emUsuario: 50 });
    const ipad = cli({ freqMedia: 3, fantasia: 'Loja Nova', _emPlanilha: 60 });
    const r = mesclarCliente(iphone, ipad);
    expect(r.fantasia).toBe('Loja Nova');
    expect(r.freqMedia).toBe(3);
    expect(r.notas).toBe('falar com Ana');
    expect(r.local?.precisao).toBe('confirmado');
    expect(mesclarCliente(ipad, iphone)).toEqual(r); // a ordem não importa
  });

  it('rotas e visitas: vence a alteração mais recente; registros só de um lado são mantidos', () => {
    const a = pacote({
      rotas: [{ data: '2026-11-02', paradas: [], partida: null, retornar: true, otimizadaEm: null, _em: 10 }],
      historico: [{ id: 'A|2026-11-01', codigo: 'A', data: '2026-11-01', resultado: 'pedido', nota: 'x', em: '', _em: 5 }]
    });
    const b = pacote({
      rotas: [{ data: '2026-11-02', paradas: [{ codigo: 'A', resultado: null, nota: '', checkinEm: null }], partida: null, retornar: true, otimizadaEm: null, _em: 20 },
        { data: '2026-11-03', paradas: [], partida: null, retornar: false, otimizadaEm: null, _em: 1 }],
      historico: [{ id: 'A|2026-11-01', codigo: 'A', data: '2026-11-01', resultado: 'pedido', nota: 'x', em: '', removido: true, _em: 9 }]
    });
    const r = mesclarPacotes(a, b);
    expect(r.rotas).toHaveLength(2);
    expect(r.rotas.find((x) => x.data === '2026-11-02')!.paradas).toHaveLength(1);
    expect(r.historico[0].removido).toBe(true);
  });

  it('diferenças e conteúdo igual (ignora ordem e data do pacote)', () => {
    const x = cli({}), y = cli({ codigo: 'B' });
    expect(diferencas([x, y], [x, { ...y, notas: 'n' }], (c) => c.codigo).map((c) => c.codigo)).toEqual(['B']);
    expect(mesmoConteudo(pacote({ clientes: [x, y], em: '1' }), pacote({ clientes: [y, x], em: '2' }))).toBe(true);
    expect(mesmoConteudo(null, pacote({}))).toBe(false);
  });
});
