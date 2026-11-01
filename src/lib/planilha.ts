import * as XLSX from 'xlsx';
import type { DadosPlanilha, MarcaDados } from '../types';
import { normalizar } from './texto';

export interface PlanilhaLida {
  clientes: DadosPlanilha[];
  dataPlanilha: string | null;   // data do título "Roteirização - 14/10/2026"
  avisos: string[];
}

type Celula = string | number | boolean | null | undefined;

/** Aceita "30/04/2024", "2024-04-30" ou número de série do Excel. */
export function lerData(v: Celula): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    if (v < 20000 || v > 90000) return null;
    const ms = Math.round((v - 25569) * 86400000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function lerNumero(v: Celula): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function texto(v: Celula): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim();
}

function lerCep(v: Celula): string {
  const dig = String(v ?? '').replace(/\.0+$/, '').replace(/\D/g, '');
  return dig ? dig.padStart(8, '0') : '';
}

const COLUNAS: Record<string, keyof DadosPlanilha | 'freqMedia' | 'freqAtual'> = {
  UF: 'uf',
  MESORREGIAO: 'meso',
  MICRORREGIAO: 'micro',
  CIDADE: 'cidade',
  BAIRRO: 'bairro',
  CEP: 'cep',
  CODIGO: 'codigo',
  'RAZAO SOCIAL': 'razao',
  'NOME FANTASIA': 'fantasia',
  'GRUPO ECONOMICO': 'grupo',
  REDE: 'rede'
};

/** Lê o arquivo exportado (.xls/.xlsx) e devolve os clientes. */
export function lerPlanilha(dados: ArrayBuffer | Uint8Array): PlanilhaLida {
  const wb = XLSX.read(dados, { type: 'array' });
  const avisos: string[] = [];

  // Usa a primeira aba que tenha a coluna CÓDIGO
  for (const nomeAba of wb.SheetNames) {
    const linhas = XLSX.utils.sheet_to_json<Celula[]>(wb.Sheets[nomeAba], { header: 1, raw: true, defval: '' });
    const iCab = linhas.findIndex((l) => l.some((c) => normalizar(c) === 'CODIGO'));
    if (iCab < 0) continue;

    const cab = linhas[iCab].map(normalizar);
    const grupo = (linhas[iCab - 1] ?? []).map(normalizar);

    // Data da planilha no título
    let dataPlanilha: string | null = null;
    for (const l of linhas.slice(0, iCab)) {
      for (const c of l) {
        const m = String(c).match(/(\d{2}\/\d{2}\/\d{4})/);
        if (m) { dataPlanilha = lerData(m[1]); break; }
      }
      if (dataPlanilha) break;
    }

    const idx: Partial<Record<string, number>> = {};
    cab.forEach((c, i) => {
      if (COLUNAS[c] && idx[COLUNAS[c]] === undefined) idx[COLUNAS[c]] = i;
      if (c.startsWith('FREQ') && c.includes('MEDIA')) idx.freqMedia = i;
      if (c.startsWith('FREQ') && c.includes('ATUAL')) idx.freqAtual = i;
      if (c.startsWith('TITULOS VENCIDOS')) idx.vencidos = i;
      if (c.startsWith('TITULOS PROTESTADOS')) idx.protestados = i;
      if (c.includes('INADIMP')) idx.inadimplencia = i;
    });

    // Marcas: colunas "DATA ULT FAT.(MARCA)" e blocos "PEÇAS FATURADAS LIQ.MARCA" com os anos
    const marcas = new Map<string, { data?: number; anos: { ano: number; col: number }[] }>();
    cab.forEach((c, i) => {
      const m = c.match(/DATA ULT\.? ?FAT\.?\s*\((.+)\)/);
      if (m) {
        const nome = m[1].trim();
        marcas.set(nome, { ...(marcas.get(nome) ?? { anos: [] }), data: i });
      }
    });
    let marcaAtual: string | null = null;
    for (let i = 0; i < cab.length; i++) {
      const g = grupo[i];
      if (g) {
        const m = g.match(/PECAS FATURADAS(?: LIQ\.?)?\s*(.+)$/);
        marcaAtual = m ? m[1].replace(/^\.|\s/g, '').trim() : null;
        if (marcaAtual && !marcas.has(marcaAtual)) marcas.set(marcaAtual, { anos: [] });
      }
      const ano = lerNumero(linhas[iCab][i]);
      if (marcaAtual && ano && ano >= 2000 && ano <= 2100) marcas.get(marcaAtual)!.anos.push({ ano, col: i });
    }

    if (idx.codigo === undefined) continue;
    for (const obrig of ['cidade', 'uf', 'fantasia']) {
      if (idx[obrig] === undefined) avisos.push(`Coluna ${obrig.toUpperCase()} não encontrada.`);
    }

    const clientes: DadosPlanilha[] = [];
    const vistos = new Set<string>();
    for (const l of linhas.slice(iCab + 1)) {
      const codigo = texto(l[idx.codigo]);
      if (!codigo) continue;
      if (vistos.has(codigo)) { avisos.push(`Código repetido ignorado: ${codigo}`); continue; }
      vistos.add(codigo);
      const g = (k: string) => (idx[k] === undefined ? '' : texto(l[idx[k]!]));
      const marcasCli: MarcaDados[] = [...marcas.entries()].map(([nome, m]) => ({
        nome,
        ultFat: m.data === undefined ? null : lerData(l[m.data]),
        pecas: m.anos
          .map(({ ano, col }) => ({ ano, qtd: lerNumero(l[col]) }))
          .filter((p): p is { ano: number; qtd: number } => p.qtd !== null)
      }));
      clientes.push({
        codigo,
        uf: g('uf').toUpperCase(),
        meso: g('meso'),
        micro: g('micro'),
        cidade: g('cidade'),
        bairro: g('bairro'),
        cep: idx.cep === undefined ? '' : lerCep(l[idx.cep]),
        razao: g('razao'),
        fantasia: g('fantasia') || g('razao'),
        grupo: g('grupo'),
        rede: g('rede'),
        marcas: marcasCli,
        freqMedia: idx.freqMedia === undefined ? null : lerNumero(l[idx.freqMedia]),
        freqAtual: idx.freqAtual === undefined ? null : lerNumero(l[idx.freqAtual]),
        fin: {
          vencidos: g('vencidos') || null,
          protestados: g('protestados') || null,
          inadimplencia: g('inadimplencia') || null
        }
      });
    }
    return { clientes, dataPlanilha, avisos };
  }
  throw new Error('Não encontrei a coluna "CÓDIGO" em nenhuma aba da planilha.');
}
