import { describe, expect, it } from 'vitest';
import { alertaFinanceiro, calcularPrioridade } from '../src/lib/prioridade';
import type { DadosPlanilha } from '../src/types';

const c = (ultFat: string | null, freqMedia: number | null, fin: Partial<DadosPlanilha['fin']> = {}): DadosPlanilha => ({
  codigo: 'X', uf: 'SP', meso: '', micro: '', cidade: 'TAUBATE', bairro: 'CENTRO', cep: '12020000', razao: '', fantasia: 'Loja', grupo: '', rede: '',
  marcas: [{ nome: 'MORMAII', ultFat, pecas: [] }], freqMedia, freqAtual: null,
  fin: { vencidos: null, protestados: null, inadimplencia: null, ...fin }
});

describe('prioridade', () => {
  const hoje = '2026-11-01';
  it('atrasado quando passou do ciclo (365/freq)', () => {
    const p = calcularPrioridade(c('2026-06-01', 4), hoje); // ciclo ~91 dias, 153 sem comprar
    expect(p.nivel).toBe('atrasado');
    expect(p.intervaloEsperado).toBe(91);
    expect(p.atraso).toBe(62);
  });
  it('perto do ciclo quando falta pouco', () => {
    expect(calcularPrioridade(c('2026-08-10', 4), hoje).nivel).toBe('proximo'); // 83 dias de 91
  });
  it('em dia', () => {
    expect(calcularPrioridade(c('2026-10-01', 2), hoje).nivel).toBe('em_dia');
  });
  it('reativar depois de 18 meses', () => {
    expect(calcularPrioridade(c('2023-03-29', 1), hoje).nivel).toBe('inativo');
  });
  it('sem histórico', () => {
    expect(calcularPrioridade(c(null, null), hoje).nivel).toBe('sem_historico');
  });
  it('atrasados mais antigos vêm primeiro', () => {
    const a = calcularPrioridade(c('2026-03-01', 4), hoje);
    const b = calcularPrioridade(c('2026-06-01', 4), hoje);
    expect(a.ordem).toBeLessThan(b.ordem);
  });
  it('financeiro distingue cliente de grupo', () => {
    expect(alertaFinanceiro(c(null, null)).nivel).toBe('ok');
    expect(alertaFinanceiro(c(null, null, { vencidos: 'Grupo Econômico com Títulos Vencidos há 16 dias' })).nivel).toBe('grupo');
    const a = alertaFinanceiro(c(null, null, { vencidos: 'Há 16 dias', protestados: 'X' }));
    expect(a.nivel).toBe('cliente');
    expect(a.itens).toEqual(['Títulos vencidos há 16 dias', 'Títulos protestados']);
  });
});
