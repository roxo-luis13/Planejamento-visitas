import { describe, expect, it } from 'vitest';
import { mesclar } from '../src/lib/mesclar';
import { lerPlanilha } from '../src/lib/planilha';
import { planilhaExemplo, LINHA_A, LINHA_B } from './planilha.test';
import type { Cliente } from '../src/types';

const base = lerPlanilha(planilhaExemplo([LINHA_A, LINHA_B])).clientes;

function primeiraImportacao(): Cliente[] {
  return mesclar([], base, { arquivo: 'a.xls', dataPlanilha: '2026-10-14' }).clientes;
}

describe('mesclar', () => {
  it('primeira importação cria todos como novos e pendentes de endereço', () => {
    const r = mesclar([], base, { arquivo: 'a.xls', dataPlanilha: null });
    expect(r.resumo).toMatchObject({ total: 2, novos: 2, atualizados: 0 });
    expect(r.clientes.every((c) => c.geoStatus === 'pendente' && c.ativo === 1)).toBe(true);
  });

  it('mantém endereço, localização confirmada e notas ao atualizar dados da planilha', () => {
    const ex = primeiraImportacao();
    ex[0].notas = 'falar com Ribamar';
    ex[0].local = { lat: -24.3, lng: -47, precisao: 'confirmado', fonte: 'GPS', atualizadoEm: 'x' };
    ex[0].endereco = { logradouro: 'Rua A', numero: '10', complemento: '', bairro: 'Centro', cidade: 'Peruibe', uf: 'SP', cep: '11770042' };
    const novo = base.map((c) => ({ ...c }));
    novo[0] = { ...novo[0], freqAtual: 3 };
    const r = mesclar(ex, novo, { arquivo: 'b.xls', dataPlanilha: '2026-11-01' });
    const a = r.clientes.find((c) => c.codigo === 'B14996')!;
    expect(a.freqAtual).toBe(3);
    expect(a.notas).toBe('falar com Ribamar');
    expect(a.local?.precisao).toBe('confirmado');
    expect(a.endereco?.logradouro).toBe('Rua A');
    expect(r.resumo).toMatchObject({ atualizados: 1, semMudanca: 1 });
  });

  it('refaz sugestão automática quando o CEP muda', () => {
    const ex = primeiraImportacao();
    ex[0].local = { lat: 1, lng: 1, precisao: 'bairro', fonte: 'OSM', atualizadoEm: 'x' };
    ex[0].geoStatus = 'ok';
    const novo = base.map((c) => ({ ...c }));
    novo[0] = { ...novo[0], cep: '11750000' };
    const r = mesclar(ex, novo, { arquivo: 'b.xls', dataPlanilha: null });
    const a = r.clientes.find((c) => c.codigo === 'B14996')!;
    expect(a.local).toBeNull();
    expect(a.geoStatus).toBe('pendente');
    expect(r.resumo.locaisResetados).toBe(1);
  });

  it('mantém localização confirmada mas avisa quando o CEP muda', () => {
    const ex = primeiraImportacao();
    ex[0].local = { lat: 1, lng: 1, precisao: 'confirmado', fonte: 'GPS', atualizadoEm: 'x' };
    const novo = base.map((c) => ({ ...c }));
    novo[0] = { ...novo[0], cep: '11750000' };
    const a = mesclar(ex, novo, { arquivo: 'b.xls', dataPlanilha: '2026-11-01' }).clientes.find((c) => c.codigo === 'B14996')!;
    expect(a.local?.precisao).toBe('confirmado');
    expect(a.avisoCep).toContain('11750000');
  });

  it('quem sai da planilha fica fora da carteira (não é apagado) e pode voltar', () => {
    const ex = primeiraImportacao();
    ex[1].notas = 'importante';
    const r1 = mesclar(ex, [base[0]], { arquivo: 'b.xls', dataPlanilha: null });
    const saiu = r1.clientes.find((c) => c.codigo === 'B37373')!;
    expect(saiu.ativo).toBe(0);
    expect(saiu.notas).toBe('importante');
    expect(r1.resumo.saiuDaCarteira).toBe(1);
    const r2 = mesclar(r1.clientes, base, { arquivo: 'c.xls', dataPlanilha: null });
    expect(r2.resumo.voltaram).toBe(1);
    expect(r2.clientes.find((c) => c.codigo === 'B37373')!.ativo).toBe(1);
  });
});
