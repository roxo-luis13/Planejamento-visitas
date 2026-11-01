import type { Cliente } from '../types';
import { alertaFinanceiro, type NivelPrioridade, type Prioridade } from './prioridade';
import { normalizar } from './texto';

export type FiltroFin = 'ok' | 'cliente' | 'grupo';

/** Cada lista vazia = "todos". Dentro de um filtro vale QUALQUER item marcado; entre filtros vale TODOS. */
export interface Filtros {
  micros: string[];
  cidades: string[];
  bairros: string[];        // chave "CIDADE|BAIRRO" (há "Centro" em várias cidades)
  niveis: NivelPrioridade[];
  fin: FiltroFin[];
  busca: string;
}

export const FILTROS_VAZIOS: Filtros = { micros: [], cidades: [], bairros: [], niveis: [], fin: [], busca: '' };

export const chaveBairro = (c: Pick<Cliente, 'cidade' | 'bairro'>) => `${c.cidade}|${c.bairro}`;

/** Filtros de lugar (usados para montar as opções em cascata e as contagens). */
export function passaLugar(c: Cliente, f: Pick<Filtros, 'micros' | 'cidades' | 'bairros'>, ate: 'micro' | 'cidade' | 'bairro' = 'bairro') {
  if (f.micros.length && !f.micros.includes(c.micro)) return false;
  if (ate === 'micro') return true;
  if (f.cidades.length && !f.cidades.includes(c.cidade)) return false;
  if (ate === 'cidade') return true;
  if (f.bairros.length && !f.bairros.includes(chaveBairro(c))) return false;
  return true;
}

export function passaFiltros(c: Cliente, f: Filtros, prio: Prioridade): boolean {
  if (!passaLugar(c, f)) return false;
  if (f.niveis.length && !f.niveis.includes(prio.nivel)) return false;
  if (f.fin.length && !f.fin.includes(alertaFinanceiro(c).nivel)) return false;
  const q = normalizar(f.busca);
  if (q) {
    const alvo = normalizar(`${c.fantasia} ${c.razao} ${c.codigo} ${c.grupo} ${c.rede} ${c.bairro} ${c.cidade}`);
    if (!q.split(' ').every((p) => alvo.includes(p))) return false;
  }
  return true;
}

/** Ao mudar microrregiões/cidades, descarta cidades/bairros que ficaram fora. */
export function podarLugar(clientes: Cliente[], f: Filtros): Filtros {
  const cidadesOk = new Set(clientes.filter((c) => passaLugar(c, f, 'micro')).map((c) => c.cidade));
  const cidades = f.cidades.filter((x) => cidadesOk.has(x));
  const bairrosOk = new Set(clientes.filter((c) => passaLugar(c, { ...f, cidades }, 'cidade')).map(chaveBairro));
  return { ...f, cidades, bairros: f.bairros.filter((x) => bairrosOk.has(x)) };
}

export function filtrosAtivos(f: Filtros): number {
  return f.micros.length + f.cidades.length + f.bairros.length + f.niveis.length + f.fin.length + (f.busca.trim() ? 1 : 0);
}
