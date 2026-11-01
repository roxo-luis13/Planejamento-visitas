import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { lerPlanilha, lerData } from '../src/lib/planilha';

/** Monta uma planilha no mesmo formato da exportação "Roteirização". */
export function planilhaExemplo(linhas: (string | number)[][], titulo = 'Roteirização - 14/10/2026') {
  const grupo = ['DADOS CADASTRO', '', '', '', '', '', '', '', '', '', '', '', '', '', 'PEÇAS FATURADAS LIQ.MORMAII', '', '', '', 'PEÇAS FATURADAS LIQ.COLCCI', '', '', '', 'FREQUÊNCIA DE COMPRAS', '', 'FINANCEIRO', '', ''];
  const cab = ['UF', 'MESORREGIÃO', 'MICRORREGIÃO', 'CIDADE', 'BAIRRO', 'CEP', 'CÓDIGO', 'RAZÃO SOCIAL', 'NOME FANTASIA', 'GRUPO ECONOMICO', 'REDE',
    'DATA ULT FAT.(MORMAII)', 'DATA ULT FAT.(COLCCI)', 'DATA ULT FAT.(YOUY)', 2023, 2024, 2025, 2026, 2023, 2024, 2025, 2026,
    'FREQ.MEDIA ANOS ANTERIORES', 'FREQ.ANO ATUAL', 'TITULOS VENCIDOS', 'TITULOS PROTESTADOS', 'TITULOS BX.POR INADIMP.'];
  const ws = XLSX.utils.aoa_to_sheet([[titulo], [], grupo, cab, ...linhas]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'BASE');
  return XLSX.write(wb, { type: 'array', bookType: 'biff8' }) as ArrayBuffer;
}

export const LINHA_A = ['SP', 'LITORAL SUL PAULISTA   ', 'ITANHAEM  ', 'PERUIBE', 'CENTRO', 11770042, 'B14996', 'RIBAMAR OTICA - ME', 'SIX-1 PERUIBE', '002525 RIBAMAR', '',
  '26/02/2026', '', '', 30, 41, 60, 35, '', '', '', '', 1.67, 2, 'Há 1 dias', '', ''];
export const LINHA_B = ['SP', 'VALE DO PARAIBA PAULISTA', 'SAO JOSE DOS CAMPOS', 'TAUBATE', 'CENTRO', 12020000, 'B37373', 'OTICA SHOP LTDA', 'USAR B38565', '002135 RAFAEL', '',
  '14/02/2023', '', '', 5, '', '', '', '', '', '', '', '', '', 'Grupo Econômico com Títulos Vencidos há 0 dias', 'X', ''];

describe('lerPlanilha', () => {
  it('lê cabeçalho, marcas, anos e financeiro no formato da exportação', () => {
    const r = lerPlanilha(planilhaExemplo([LINHA_A, LINHA_B]));
    expect(r.dataPlanilha).toBe('2026-10-14');
    expect(r.clientes).toHaveLength(2);
    const a = r.clientes[0];
    expect(a).toMatchObject({ codigo: 'B14996', uf: 'SP', meso: 'LITORAL SUL PAULISTA', micro: 'ITANHAEM', cidade: 'PERUIBE', cep: '11770042', fantasia: 'SIX-1 PERUIBE', freqMedia: 1.67, freqAtual: 2 });
    expect(a.marcas.map((m) => m.nome)).toEqual(['MORMAII', 'COLCCI', 'YOUY']);
    expect(a.marcas[0]).toEqual({ nome: 'MORMAII', ultFat: '2026-02-26', pecas: [{ ano: 2023, qtd: 30 }, { ano: 2024, qtd: 41 }, { ano: 2025, qtd: 60 }, { ano: 2026, qtd: 35 }] });
    expect(a.marcas[1].pecas).toEqual([]);
    expect(a.fin.vencidos).toBe('Há 1 dias');
    expect(r.clientes[1].fin).toEqual({ vencidos: 'Grupo Econômico com Títulos Vencidos há 0 dias', protestados: 'X', inadimplencia: null });
  });

  it('completa CEP com zeros e ignora linhas sem código', () => {
    const l = [...LINHA_A]; l[5] = 1234567; l[6] = 'B1';
    const vazia = LINHA_A.map(() => '');
    const r = lerPlanilha(planilhaExemplo([l, vazia]));
    expect(r.clientes).toHaveLength(1);
    expect(r.clientes[0].cep).toBe('01234567');
  });

  it('avisa sobre código repetido', () => {
    const r = lerPlanilha(planilhaExemplo([LINHA_A, LINHA_A]));
    expect(r.clientes).toHaveLength(1);
    expect(r.avisos[0]).toContain('B14996');
  });

  it('converte datas em texto e número de série do Excel', () => {
    expect(lerData('30/04/2024')).toBe('2024-04-30');
    expect(lerData(45412)).toBe('2024-04-30');
    expect(lerData('')).toBeNull();
  });

  it('falha com mensagem clara se não houver coluna CÓDIGO', () => {
    const ws = XLSX.utils.aoa_to_sheet([['NOME', 'CIDADE'], ['x', 'y']]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'A');
    expect(() => lerPlanilha(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))).toThrow(/CÓDIGO/);
  });
});
