import Dexie, { type Table } from 'dexie';
import type { Cliente, Config, LinhaConfig, Rota, Visita } from './types';
import { CONFIG_PADRAO } from './types';

export class BancoVisitas extends Dexie {
  clientes!: Table<Cliente, string>;
  rotas!: Table<Rota, string>;
  historico!: Table<Visita, string>;
  config!: Table<LinhaConfig, string>;
  geocache!: Table<{ chave: string; valor: unknown; em: string }, string>;

  constructor() {
    super('planejamento-visitas');
    this.version(1).stores({
      clientes: 'codigo, ativo, cidade, micro, geoStatus',
      rotas: 'data',
      visitas: '++id, codigo, data',
      config: 'chave',
      geocache: 'chave'
    });
    // v2: histórico com id fixo (cliente|dia) para sincronizar entre aparelhos
    this.version(2).stores({ historico: 'id, codigo, data' }).upgrade(async (tx) => {
      const antigas = await tx.table('visitas').toArray();
      const agora = Date.now();
      await tx.table('historico').bulkPut(antigas.map((v) => ({
        id: `${v.codigo}|${v.data}`, codigo: v.codigo, data: v.data, resultado: v.resultado, nota: v.nota, em: v.em, _em: agora
      })));
    });
    this.version(3).stores({ visitas: null });
  }
}

export const db = new BancoVisitas();

export async function lerConfig(): Promise<Config> {
  const linhas = await db.config.toArray();
  const cfg: Record<string, unknown> = { ...CONFIG_PADRAO };
  for (const l of linhas) cfg[l.chave] = l.valor;
  return cfg as unknown as Config;
}

export async function salvarConfig(parcial: Partial<Config>) {
  const em = Date.now();
  await db.config.bulkPut(Object.entries(parcial).map(([chave, valor]) => ({ chave, valor, _em: em })));
}

/** Alteração feita pelo Alexandre num cliente (endereço, local, notas...). */
export async function atualizarCliente(codigo: string, mudancas: Partial<Cliente>) {
  await db.clientes.update(codigo, { ...mudancas, _emUsuario: Date.now() });
}

/** Rota do dia; um dia novo já começa com a saída e o horário padrão. */
export async function obterRota(data: string): Promise<Rota> {
  const r = await db.rotas.get(data);
  if (r) return r;
  const cfg = await lerConfig();
  return {
    data, paradas: [], retornar: true, otimizadaEm: null, calculo: null,
    partida: cfg.partidaPadrao ? { tipo: 'padrao', ...cfg.partidaPadrao } : null,
    horaSaida: cfg.horaSaidaPadrao
  };
}
