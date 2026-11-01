import type { Cliente, LinhaConfig, Rota, Visita } from '../types';

/** Tudo o que vai para o Drive. (O cache de endereços não vai: é refeito se faltar.) */
export interface Pacote {
  app: 'planejamento-visitas';
  versao: 2;
  em: string;
  clientes: Cliente[];
  rotas: Rota[];
  historico: Visita[];
  config: LinhaConfig[];
}

const CAMPOS_USUARIO: (keyof Cliente)[] = ['endereco', 'local', 'geoStatus', 'avisoCep', 'notas', '_emUsuario'];

/** Cliente: os dados da planilha e os do Alexandre são juntados separadamente. */
export function mesclarCliente(a: Cliente, b: Cliente): Cliente {
  const planilha = (a._emPlanilha ?? 0) >= (b._emPlanilha ?? 0) ? a : b;
  const usuario = (a._emUsuario ?? 0) >= (b._emUsuario ?? 0) ? a : b;
  const r: Cliente = { ...planilha };
  for (const k of CAMPOS_USUARIO) (r as unknown as Record<string, unknown>)[k] = usuario[k];
  return r;
}

function porChave<T>(a: T[], b: T[], chave: (x: T) => string, juntar: (x: T, y: T) => T): T[] {
  const m = new Map<string, T>();
  for (const x of a) m.set(chave(x), x);
  for (const y of b) {
    const k = chave(y);
    const x = m.get(k);
    m.set(k, x === undefined ? y : juntar(x, y));
  }
  return [...m.values()];
}

const maisNovo = <T extends { _em?: number }>(x: T, y: T): T => ((x._em ?? 0) >= (y._em ?? 0) ? x : y);

/** Junta dois pacotes (deste aparelho e do Drive). Nada é perdido: vence a alteração mais recente de cada registro. */
export function mesclarPacotes(a: Pacote, b: Pacote): Pacote {
  return {
    app: 'planejamento-visitas',
    versao: 2,
    em: new Date().toISOString(),
    clientes: porChave(a.clientes, b.clientes, (c) => c.codigo, mesclarCliente),
    rotas: porChave(a.rotas, b.rotas, (r) => r.data, maisNovo),
    historico: porChave(a.historico, b.historico, (v) => v.id, maisNovo),
    config: porChave(a.config, b.config, (c) => c.chave, maisNovo)
  };
}

/** Registros de `novo` que são diferentes em `atual` (o que precisa ser gravado). */
export function diferencas<T>(atual: T[], novo: T[], chave: (x: T) => string): T[] {
  const m = new Map(atual.map((x) => [chave(x), JSON.stringify(x)]));
  return novo.filter((x) => m.get(chave(x)) !== JSON.stringify(x));
}

export function mesmoConteudo(a: Pacote | null, b: Pacote): boolean {
  if (!a) return false;
  const tira = (p: Pacote) => JSON.stringify({ ...p, em: '' }, (k, v) => (Array.isArray(v) && k ? [...v].sort((x, y) => JSON.stringify(x) < JSON.stringify(y) ? -1 : 1) : v));
  return tira(a) === tira(b);
}
