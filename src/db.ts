import Dexie, { type Table } from 'dexie';
import type { Cliente, Config, Rota, Visita } from './types';
import { CONFIG_PADRAO } from './types';

export class BancoVisitas extends Dexie {
  clientes!: Table<Cliente, string>;
  rotas!: Table<Rota, string>;
  visitas!: Table<Visita, number>;
  config!: Table<{ chave: string; valor: unknown }, string>;
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
  await db.config.bulkPut(Object.entries(parcial).map(([chave, valor]) => ({ chave, valor })));
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
