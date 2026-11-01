import 'fake-indexeddb/auto';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { decodificarPolyline, horarios, rotaGoogle, type Buscar } from '../src/lib/google';
import { db, obterRota, salvarConfig } from '../src/db';
import { alternarNaRota, definirPartida, otimizarRota, registrarResultado, definirHoraSaida, salvarLocal } from '../src/lib/acoes';
import type { Cliente } from '../src/types';

const resposta = (j: unknown, status = 200) => new Response(JSON.stringify(j), { status });

describe('rotaGoogle', () => {
  const origem = { lat: -23, lng: -45.5 };
  const paradas = [{ lat: -23.1, lng: -45.6 }, { lat: -23.2, lng: -45.7 }, { lat: -23.3, lng: -45.8 }];

  it('pede rota com trânsito, otimização e volta à saída; aplica a ordem do Google', async () => {
    let corpo: any, headers: any;
    const buscar: Buscar = async (_u, init) => {
      corpo = JSON.parse(init!.body as string); headers = init!.headers;
      return resposta({ routes: [{ distanceMeters: 42000, duration: '3600s', staticDuration: '3000s', polyline: { encodedPolyline: 'abc' },
        optimizedIntermediateWaypointIndex: [2, 0, 1],
        legs: [1, 2, 3, 4].map(() => ({ distanceMeters: 10500, duration: '900s', staticDuration: '750s' })) }] });
    };
    const r = await rotaGoogle({ chave: 'K', origem, paradas, voltar: true, otimizar: true, buscar });
    expect(headers['X-Goog-Api-Key']).toBe('K');
    expect(corpo.routingPreference).toBe('TRAFFIC_AWARE');
    expect(corpo.optimizeWaypointOrder).toBe(true);
    expect(corpo.destination).toEqual(corpo.origin);
    expect(corpo.intermediates).toHaveLength(3);
    expect(corpo.departureTime).toBeUndefined();
    expect(r.ordem).toEqual([2, 0, 1]);
    expect(r).toMatchObject({ distM: 42000, durS: 3600, semTransitoS: 3000, polyline: 'abc' });
    expect(r.pernas[0]).toEqual({ distM: 10500, durS: 900, semTransitoS: 750 });
  });

  it('sem volta: a parada final fica fixa como destino e o resto é otimizado', async () => {
    let corpo: any;
    const buscar: Buscar = async (_u, init) => {
      corpo = JSON.parse(init!.body as string);
      return resposta({ routes: [{ duration: '10s', optimizedIntermediateWaypointIndex: [1, 0], legs: [] }] });
    };
    const futuro = new Date(Date.now() + 86400000);
    const r = await rotaGoogle({ chave: 'K', origem, paradas, voltar: false, otimizar: true, fimFixo: 0, saida: futuro, buscar });
    expect(corpo.destination.location.latLng).toEqual({ latitude: -23.1, longitude: -45.6 });
    expect(corpo.intermediates.map((x: any) => x.location.latLng.latitude)).toEqual([-23.2, -23.3]);
    expect(corpo.departureTime).toBe(futuro.toISOString());
    expect(r.ordem).toEqual([2, 1, 0]);
  });

  it('explica quando o Google recusa a chave', async () => {
    const buscar: Buscar = async () => resposta({ error: { message: 'API key not valid.' } }, 400);
    await expect(rotaGoogle({ chave: 'X', origem, paradas, voltar: true, otimizar: true, buscar })).rejects.toThrow(/recusou a chave/);
  });

  it('decodifica polyline (exemplo oficial do Google)', () => {
    expect(decodificarPolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([
      { lat: 38.5, lng: -120.2 }, { lat: 40.7, lng: -120.95 }, { lat: 43.252, lng: -126.453 }]);
  });

  it('horários: soma direção + tempo de visita', () => {
    const ini = new Date('2026-11-02T08:00:00');
    const h = horarios(ini, [{ distM: 0, durS: 600, semTransitoS: 0 }, { distM: 0, durS: 1200, semTransitoS: 0 }, { distM: 0, durS: 900, semTransitoS: 0 }], 2, 30);
    expect(h.chegadas.map((d) => d.toTimeString().slice(0, 5))).toEqual(['08:10', '09:00']);
    expect(h.fim.toTimeString().slice(0, 5)).toBe('09:45');
  });
});

describe('otimizarRota com Google', () => {
  const cli = (codigo: string, lat: number): Cliente => ({
    codigo, uf: 'SP', meso: '', micro: '', cidade: 'TAUBATE', bairro: 'CENTRO', cep: '12020000', razao: '', fantasia: codigo, grupo: '', rede: '',
    marcas: [], freqMedia: null, freqAtual: null, fin: { vencidos: null, protestados: null, inadimplencia: null },
    ativo: 1, importadoEm: '', endereco: null, geoStatus: 'ok', avisoCep: null, notas: '',
    local: { lat, lng: -45.5, precisao: 'confirmado', fonte: 't', atualizadoEm: '' }
  });

  beforeEach(async () => {
    await Promise.all([db.clientes.clear(), db.rotas.clear(), db.config.clear(), db.historico.clear()]);
    await db.clientes.bulkPut([cli('A', -23.1), cli('B', -23.2), cli('C', -23.3)]);
  });

  it('dia novo já vem com a saída padrão e o horário padrão', async () => {
    await salvarLocal({ nome: 'Casa', lat: -23, lng: -45.5, endereco: 'Rua X' }, true);
    await salvarConfig({ horaSaidaPadrao: '07:30' });
    const r = await obterRota('2030-01-02');
    expect(r.partida).toMatchObject({ rotulo: 'Casa', lat: -23 });
    expect(r.horaSaida).toBe('07:30');
  });

  it('reordena pelo Google, guarda o cálculo e invalida quando a rota muda', async () => {
    await salvarConfig({ googleKey: 'K' });
    const dia = '2030-01-02';
    for (const c of ['A', 'B', 'C']) await alternarNaRota(dia, c);
    await definirPartida(dia, { tipo: 'local', lat: -23, lng: -45.5, rotulo: 'Casa' });
    await definirHoraSaida(dia, '08:00');
    const f = vi.fn(async (_u: string, init?: RequestInit) => {
      const corpo = JSON.parse(init!.body as string);
      expect(corpo.departureTime).toBe(new Date(2030, 0, 2, 8, 0).toISOString());
      return resposta({ routes: [{ distanceMeters: 30000, duration: '2400s', staticDuration: '2000s', polyline: { encodedPolyline: '' },
        optimizedIntermediateWaypointIndex: [2, 1, 0], legs: [1, 2, 3, 4].map(() => ({ distanceMeters: 7500, duration: '600s', staticDuration: '500s' })) }] });
    });
    vi.stubGlobal('fetch', f);
    const r = await otimizarRota(dia, true);
    expect(r.google).toBe(true);
    let rota = await obterRota(dia);
    expect(rota.paradas.map((p) => p.codigo)).toEqual(['C', 'B', 'A']);
    expect(rota.calculo?.codigos).toEqual(['C', 'B', 'A']);
    expect(rota.calculo?.durS).toBe(2400);

    // registrar visita não apaga o cálculo; mexer na rota apaga
    await registrarResultado(dia, 'C', 'pedido', '');
    expect((await obterRota(dia)).calculo).not.toBeNull();
    await alternarNaRota(dia, 'B');
    rota = await obterRota(dia);
    expect(rota.calculo).toBeNull();
    vi.unstubAllGlobals();
  });

  it('sem chave usa a estimativa em linha reta', async () => {
    const dia = '2030-01-03';
    for (const c of ['C', 'A', 'B']) await alternarNaRota(dia, c);
    await definirPartida(dia, { tipo: 'local', lat: -23, lng: -45.5, rotulo: 'Casa' });
    const r = await otimizarRota(dia, true);
    expect(r.google).toBe(false);
    expect((await obterRota(dia)).paradas.map((p) => p.codigo)).toEqual(['A', 'B', 'C']);
  });
});
