import { atualizarCliente, db, lerConfig } from '../db';
import type { Cliente } from '../types';
import { sugerirLocal, type Cache } from './geocodificar';
import { calcularPrioridade } from './prioridade';
import { hojeISO } from './texto';

/** Busca as sugestões de endereço em segundo plano enquanto o app está aberto. */

export interface EstadoFila { rodando: boolean; feitos: number; pendentes: number; atual: string | null; erro: string | null }

let estado: EstadoFila = { rodando: false, feitos: 0, pendentes: 0, atual: null, erro: null };
const ouvintes = new Set<(e: EstadoFila) => void>();
let parar = false;

function publicar(p: Partial<EstadoFila>) {
  estado = { ...estado, ...p };
  ouvintes.forEach((f) => f(estado));
}
export function ouvirFila(f: (e: EstadoFila) => void) {
  ouvintes.add(f); f(estado);
  return () => { ouvintes.delete(f); };
}

const cacheDb: Cache = {
  ler: async (chave) => (await db.geocache.get(chave))?.valor,
  gravar: async (chave, valor) => { await db.geocache.put({ chave, valor, em: new Date().toISOString() }); }
};

async function proximos(): Promise<Cliente[]> {
  const pend = await db.clientes.where('geoStatus').equals('pendente').filter((c) => c.ativo === 1).toArray();
  // Primeiro quem está nas rotas de hoje em diante, depois por prioridade
  const hoje = hojeISO();
  const rotas = await db.rotas.where('data').aboveOrEqual(hoje).toArray();
  const naRota = new Set(rotas.flatMap((r) => r.paradas.map((p) => p.codigo)));
  return pend.sort((a, b) =>
    Number(naRota.has(b.codigo)) - Number(naRota.has(a.codigo)) ||
    calcularPrioridade(a, hoje).ordem - calcularPrioridade(b, hoje).ordem);
}

export async function sugerirUm(c: Cliente, googleKey?: string) {
  const s = await sugerirLocal(c, { cache: cacheDb, googleKey });
  // Recarrega para não sobrescrever algo que o Alexandre confirmou nesse meio tempo
  const atual = await db.clientes.get(c.codigo);
  if (!atual) return;
  if (atual.local && (atual.local.precisao === 'confirmado' || atual.local.precisao === 'informado')) return;
  await atualizarCliente(c.codigo, s ? { local: s.local, endereco: s.endereco, geoStatus: 'ok' } : { geoStatus: 'falhou' });
}

export async function iniciarFila() {
  if (estado.rodando) return;
  parar = false;
  const cfg = await lerConfig();
  const tentados = new Set<string>();
  publicar({ rodando: true, feitos: 0, pendentes: (await proximos()).length, erro: null });
  let errosSeguidos = 0;
  while (!parar) {
    if (!navigator.onLine) { publicar({ erro: 'Sem internet. A busca continua quando voltar.' }); break; }
    // Recalcula a cada passo: quem acabou de entrar numa rota passa na frente
    const lista = (await proximos()).filter((c) => !tentados.has(c.codigo));
    if (!lista.length) break;
    const c = lista[0];
    publicar({ atual: c.fantasia, pendentes: lista.length });
    try {
      await sugerirUm(c, cfg.googleKey);
      tentados.add(c.codigo);
      errosSeguidos = 0;
      publicar({ feitos: estado.feitos + 1, pendentes: lista.length - 1, erro: null });
    } catch (e) {
      errosSeguidos++;
      publicar({ erro: `Falha ao buscar: ${(e as Error).message}` });
      if (errosSeguidos >= 5) break;
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  publicar({ rodando: false, atual: null, pendentes: (await proximos()).length });
}

export function pararFila() { parar = true; }

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void iniciarFila(); });
}
