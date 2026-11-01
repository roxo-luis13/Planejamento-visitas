import type { Cliente, DadosPlanilha } from '../types';
import { diasEntre } from './texto';

export type NivelPrioridade = 'atrasado' | 'proximo' | 'em_dia' | 'inativo' | 'sem_historico';

export interface Prioridade {
  nivel: NivelPrioridade;
  ultimaCompra: string | null;
  diasSemComprar: number | null;
  intervaloEsperado: number | null;   // dias
  atraso: number | null;              // dias (positivo = atrasado)
  explicacao: string;
  ordem: number;                      // menor = mais urgente
}

export const NIVEIS: Record<NivelPrioridade, { rotulo: string; cor: string; emoji: string }> = {
  atrasado: { rotulo: 'Atrasado', cor: '#d93025', emoji: '🔴' },
  proximo: { rotulo: 'Perto do ciclo', cor: '#e8a100', emoji: '🟡' },
  em_dia: { rotulo: 'Em dia', cor: '#1e8e3e', emoji: '🟢' },
  inativo: { rotulo: 'Reativar', cor: '#7b5ea7', emoji: '🟣' },
  sem_historico: { rotulo: 'Sem histórico', cor: '#80868b', emoji: '⚪' }
};

const DIAS_INATIVO = 540; // 18 meses sem comprar = reativação

export function ultimaCompra(c: DadosPlanilha): string | null {
  const datas = c.marcas.map((m) => m.ultFat).filter((d): d is string => !!d).sort();
  return datas.length ? datas[datas.length - 1] : null;
}

export function calcularPrioridade(c: DadosPlanilha, hoje: string): Prioridade {
  const ult = ultimaCompra(c);
  if (!ult) {
    return { nivel: 'sem_historico', ultimaCompra: null, diasSemComprar: null, intervaloEsperado: null, atraso: null,
      explicacao: 'Sem data de faturamento na planilha.', ordem: 4000 };
  }
  const dias = diasEntre(ult, hoje);
  if (dias > DIAS_INATIVO) {
    return { nivel: 'inativo', ultimaCompra: ult, diasSemComprar: dias, intervaloEsperado: null, atraso: null,
      explicacao: `Não compra há ${dias} dias (mais de 18 meses). Oportunidade de reativação.`, ordem: 3000 - Math.min(dias, 2000) / 10 };
  }
  const freq = c.freqMedia && c.freqMedia > 0 ? c.freqMedia : c.freqAtual && c.freqAtual > 0 ? c.freqAtual : null;
  if (!freq) {
    return { nivel: dias > 180 ? 'atrasado' : 'em_dia', ultimaCompra: ult, diasSemComprar: dias, intervaloEsperado: null, atraso: null,
      explicacao: `Sem frequência de compra na planilha. Última compra há ${dias} dias.`, ordem: dias > 180 ? 1000 - dias : 2000 + (365 - dias) };
  }
  const intervalo = Math.round(365 / freq);
  const atraso = dias - intervalo;
  const margem = Math.max(15, Math.round(intervalo * 0.15));
  const base = `Compra ~${freq.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}x por ano (a cada ~${intervalo} dias). Última compra há ${dias} dias`;
  if (atraso > 0) return { nivel: 'atrasado', ultimaCompra: ult, diasSemComprar: dias, intervaloEsperado: intervalo, atraso,
    explicacao: `${base}: ${atraso} dias além do ciclo.`, ordem: 1000 - atraso };
  if (atraso > -margem) return { nivel: 'proximo', ultimaCompra: ult, diasSemComprar: dias, intervaloEsperado: intervalo, atraso,
    explicacao: `${base}: o ciclo vence em ${-atraso} dias.`, ordem: 1500 - atraso };
  return { nivel: 'em_dia', ultimaCompra: ult, diasSemComprar: dias, intervaloEsperado: intervalo, atraso,
    explicacao: `${base}: dentro do ciclo.`, ordem: 2000 - atraso };
}

export type NivelFinanceiro = 'ok' | 'grupo' | 'cliente';

export interface AlertaFinanceiro { nivel: NivelFinanceiro; itens: string[] }

/** "Há N dias" / "X" = o próprio cliente; "Grupo Econômico com ..." = outra loja do grupo. */
export function alertaFinanceiro(c: Cliente | DadosPlanilha): AlertaFinanceiro {
  const itens: string[] = [];
  let nivel: NivelFinanceiro = 'ok';
  const marcar = (v: string | null, nome: string) => {
    if (!v) return;
    const doGrupo = /grupo/i.test(v);
    if (doGrupo) {
      itens.push(v);
      if (nivel === 'ok') nivel = 'grupo';
    } else {
      const dias = v.match(/(\d+)\s*dias?/);
      itens.push(dias ? `${nome} há ${dias[1]} dias` : nome);
      nivel = 'cliente';
    }
  };
  marcar(c.fin.vencidos, 'Títulos vencidos');
  marcar(c.fin.protestados, 'Títulos protestados');
  marcar(c.fin.inadimplencia, 'Baixa por inadimplência');
  return { nivel, itens };
}
