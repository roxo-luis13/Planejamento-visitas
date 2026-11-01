import { describe, expect, it } from 'vitest';
import { FILTROS_VAZIOS, marcasDoCliente, passaFiltros, podarLugar, filtrosAtivos } from '../src/lib/filtros';
import { calcularPrioridade } from '../src/lib/prioridade';
import type { Cliente } from '../src/types';

const cli = (codigo: string, micro: string, cidade: string, bairro: string, extra: Partial<Cliente> = {}): Cliente => ({
  codigo, uf: 'SP', meso: '', micro, cidade, bairro, cep: '', razao: '', fantasia: codigo, grupo: '', rede: '',
  marcas: [{ nome: 'M', ultFat: '2026-10-01', pecas: [] }], freqMedia: 2, freqAtual: null,
  fin: { vencidos: null, protestados: null, inadimplencia: null },
  ativo: 1, importadoEm: '', endereco: null, local: null, geoStatus: 'pendente', avisoCep: null, notas: '', ...extra
});

const base = [
  cli('A', 'SJC', 'TAUBATE', 'CENTRO'),
  cli('B', 'SJC', 'TAUBATE', 'VILA SAO GERALDO'),
  cli('C', 'SJC', 'SAO JOSE DOS CAMPOS', 'CENTRO', { fin: { vencidos: 'Há 3 dias', protestados: null, inadimplencia: null } }),
  cli('D', 'ITANHAEM', 'PERUIBE', 'CENTRO', { fin: { vencidos: 'Grupo Econômico com Títulos Vencidos há 1 dias', protestados: null, inadimplencia: null } }),
  cli('E', 'ITANHAEM', 'PERUIBE', 'CENTRO', { marcas: [{ nome: 'M', ultFat: '2026-01-01', pecas: [] }], freqMedia: 4 })
];
const filtrar = (f: Partial<typeof FILTROS_VAZIOS>) =>
  base.filter((c) => passaFiltros(c, { ...FILTROS_VAZIOS, ...f }, calcularPrioridade(c, '2026-11-01'))).map((c) => c.codigo);

describe('filtros com várias opções', () => {
  it('sem filtros mostra todos', () => expect(filtrar({})).toEqual(['A', 'B', 'C', 'D', 'E']));
  it('várias cidades = qualquer uma delas', () => expect(filtrar({ cidades: ['TAUBATE', 'PERUIBE'] })).toEqual(['A', 'B', 'D', 'E']));
  it('bairro é por cidade: Centro de Taubaté não traz Centro de Peruíbe', () => {
    expect(filtrar({ bairros: ['TAUBATE|CENTRO', 'SAO JOSE DOS CAMPOS|CENTRO'] })).toEqual(['A', 'C']);
  });
  it('combina filtros diferentes (cidades E financeiro)', () => {
    expect(filtrar({ cidades: ['SAO JOSE DOS CAMPOS', 'PERUIBE'], fin: ['cliente', 'grupo'] })).toEqual(['C', 'D']);
    expect(filtrar({ fin: ['ok'] })).toEqual(['A', 'B', 'E']);
  });
  it('vários níveis de prioridade', () => {
    expect(filtrar({ niveis: ['atrasado'] })).toEqual(['E']);
    expect(filtrar({ niveis: ['atrasado', 'em_dia'] })).toEqual(['A', 'B', 'C', 'D', 'E']);
  });
  it('tirar uma microrregião remove as cidades e bairros dela da seleção', () => {
    const f = { ...FILTROS_VAZIOS, micros: ['ITANHAEM'], cidades: ['TAUBATE', 'PERUIBE'], bairros: ['TAUBATE|CENTRO', 'PERUIBE|CENTRO'] };
    const p = podarLugar(base, f);
    expect(p.cidades).toEqual(['PERUIBE']);
    expect(p.bairros).toEqual(['PERUIBE|CENTRO']);
    expect(filtrosAtivos(p)).toBe(3);
  });
});

describe('filtro por marca', () => {
  const comMarcas = [
    cli('A', 'SJC', 'TAUBATE', 'CENTRO', { marcas: [{ nome: 'MORMAII', ultFat: '2026-01-01', pecas: [] }, { nome: 'COLCCI', ultFat: null, pecas: [{ ano: 2025, qtd: 0 }] }] }),
    cli('B', 'SJC', 'TAUBATE', 'CENTRO', { marcas: [{ nome: 'COLCCI', ultFat: null, pecas: [{ ano: 2025, qtd: 12 }] }] }),
    cli('C', 'SJC', 'TAUBATE', 'CENTRO', { marcas: [{ nome: 'NOVA', ultFat: '2026-02-01', pecas: [] }] })
  ];
  const f = (marcas: string[], busca = '') => comMarcas.filter((c) => passaFiltros(c, { ...FILTROS_VAZIOS, marcas, busca }, calcularPrioridade(c, '2026-11-01'))).map((c) => c.codigo);
  it('só conta marca com faturamento (peças 0 não conta)', () => {
    expect(marcasDoCliente(comMarcas[0])).toEqual(['MORMAII']);
    expect(f(['COLCCI'])).toEqual(['B']);
  });
  it('várias marcas = qualquer uma; marca nova da planilha funciona igual', () => {
    expect(f(['MORMAII', 'NOVA'])).toEqual(['A', 'C']);
    expect(filtrosAtivos({ ...FILTROS_VAZIOS, marcas: ['NOVA'] })).toBe(1);
  });
  it('a busca também acha pela marca', () => expect(f([], 'colcci')).toEqual(['B']));
});
