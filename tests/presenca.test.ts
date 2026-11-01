import { describe, expect, it } from 'vitest';
import { avaliarPosicao, ESTADO_INICIAL, TEMPO_CHEGADA, type ParadaGeo } from '../src/lib/presenca';

// ~0,0009° de latitude ≈ 100 m
const loja: ParadaGeo = { codigo: 'A', lat: -23.0, lng: -45.0, chegou: false, registrado: false };
const na = (dLat = 0) => ({ lat: -23.0 + dLat, lng: -45.0, precisao: 20 });

describe('detecção de chegada e saída', () => {
  it('ao abrir perto da loja pergunta; depois de 1 min no lugar marca a chegada', () => {
    let r = avaliarPosicao(ESTADO_INICIAL, na(0.0003), [loja], 0);
    expect(r.eventos).toEqual([{ tipo: 'perto', codigo: 'A' }]);
    r = avaliarPosicao(r.estado, na(0.0002), [loja], 30_000);
    expect(r.eventos).toEqual([]);
    r = avaliarPosicao(r.estado, na(0.0001), [loja], TEMPO_CHEGADA + 1);
    expect(r.eventos).toEqual([{ tipo: 'chegou', codigo: 'A' }]);
    expect(r.estado.presente).toBe('A');
    // circulando dentro da loja não gera nada
    r = avaliarPosicao(r.estado, na(0.0015), [{ ...loja, chegou: true }], TEMPO_CHEGADA + 60_000);
    expect(r.eventos).toEqual([]);
    // se afastou: pergunta se quer registrar
    r = avaliarPosicao(r.estado, na(0.004), [{ ...loja, chegou: true }], TEMPO_CHEGADA + 120_000);
    expect(r.eventos).toEqual([{ tipo: 'saiu', codigo: 'A' }]);
    expect(r.estado.presente).toBeNull();
  });

  it('passar de carro na frente não conta como chegada', () => {
    let r = avaliarPosicao({ ...ESTADO_INICIAL, primeira: false }, na(0.0005), [loja], 0);
    r = avaliarPosicao(r.estado, na(0.003), [loja], 20_000);
    r = avaliarPosicao(r.estado, na(0.0001), [loja], 70_000);
    expect(r.eventos).toEqual([]);
  });

  it('visita já registrada: sem perguntas; GPS impreciso é ignorado', () => {
    const reg = { ...loja, chegou: true, registrado: true };
    let r = avaliarPosicao(ESTADO_INICIAL, na(), [reg], 0);
    expect(r.eventos).toEqual([]);
    r = avaliarPosicao(ESTADO_INICIAL, { ...na(), precisao: 500 }, [loja], 0);
    expect(r.eventos).toEqual([]);
    expect(r.estado).toBe(ESTADO_INICIAL);
  });

  it('reabrir o app na loja com chegada já marcada só acompanha a saída', () => {
    let r = avaliarPosicao(ESTADO_INICIAL, na(), [{ ...loja, chegou: true }], 0);
    expect(r.eventos).toEqual([]);
    r = avaliarPosicao(r.estado, na(0.005), [{ ...loja, chegou: true }], 10_000);
    expect(r.eventos).toEqual([{ tipo: 'saiu', codigo: 'A' }]);
  });
});
