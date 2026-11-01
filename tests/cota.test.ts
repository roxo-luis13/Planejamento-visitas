import { describe, expect, it, beforeEach } from 'vitest';
import { ErroLimite, gastar, LIMITE_DIA, usoHoje } from '../src/lib/cotaGoogle';
import { rotaGoogle, type Buscar } from '../src/lib/google';

const mem = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k),
  key: (i: number) => [...mem.keys()][i] ?? null, get length() { return mem.size; }
};

describe('trava de uso gratuito do Google', () => {
  beforeEach(() => mem.clear());

  it('cada aparelho para no limite do dia, e o total do mês fica abaixo do gratuito (5.000)', () => {
    expect(LIMITE_DIA.rotas * 31 * 2).toBeLessThan(5000);
    expect(LIMITE_DIA.lugares * 31 * 2).toBeLessThan(5000);
    for (let i = 0; i < LIMITE_DIA.rotas; i++) gastar('rotas');
    expect(() => gastar('rotas')).toThrow(ErroLimite);
    expect(usoHoje().rotas).toBe(LIMITE_DIA.rotas);
    expect(() => gastar('lugares')).not.toThrow();
  });

  it('passou do limite: nem chega a chamar o Google', async () => {
    for (let i = 0; i < LIMITE_DIA.rotas; i++) gastar('rotas');
    let chamou = false;
    const buscar: Buscar = async () => { chamou = true; return new Response('{}'); };
    await expect(rotaGoogle({ chave: 'K', origem: { lat: 0, lng: 0 }, paradas: [{ lat: 0, lng: 1 }], voltar: false, otimizar: false, buscar })).rejects.toThrow(ErroLimite);
    expect(chamou).toBe(false);
  });

  it('cota do Google Cloud esgotada (429) vira ErroLimite', async () => {
    const buscar: Buscar = async () => new Response(JSON.stringify({ error: { message: 'Quota exceeded', status: 'RESOURCE_EXHAUSTED' } }), { status: 429 });
    await expect(rotaGoogle({ chave: 'K', origem: { lat: 0, lng: 0 }, paradas: [{ lat: 0, lng: 1 }], voltar: false, otimizar: false, buscar })).rejects.toThrow(ErroLimite);
  });
});
