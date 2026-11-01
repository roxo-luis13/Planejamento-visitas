export interface Ponto { lat: number; lng: number }

/** Distância em linha reta (km). */
export function distanciaKm(a: Ponto, b: Ponto): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Fator para estimar distância por ruas a partir da linha reta. */
export const FATOR_RUAS = 1.35;

function custoTotal(ordem: number[], d: number[][], inicio: number | null, fim: number | null): number {
  let t = 0;
  if (inicio !== null && ordem.length) t += d[inicio][ordem[0]];
  for (let i = 0; i < ordem.length - 1; i++) t += d[ordem[i]][ordem[i + 1]];
  if (fim !== null && ordem.length) t += d[ordem[ordem.length - 1]][fim];
  return t;
}

/**
 * Ordem de visitas que minimiza a distância: vizinho mais próximo + melhoria 2-opt.
 * Retorna os índices de `paradas` na melhor ordem.
 */
export function otimizarOrdem(paradas: Ponto[], partida: Ponto | null, retornar: boolean): number[] {
  const n = paradas.length;
  if (n <= 1) return paradas.map((_, i) => i);
  const pts = partida ? [...paradas, partida] : paradas;
  const d = pts.map((a) => pts.map((b) => distanciaKm(a, b)));
  const inicio = partida ? n : null;
  const fim = partida && retornar ? n : null;

  // Vizinho mais próximo, testando cada parada como primeira se não há partida
  const candidatosInicio = partida ? [null] : paradas.map((_, i) => i);
  let melhor: number[] = [];
  let melhorCusto = Infinity;
  for (const primeiro of candidatosInicio) {
    const restantes = new Set(paradas.map((_, i) => i));
    const ordem: number[] = [];
    let atual = primeiro === null ? inicio! : primeiro;
    if (primeiro !== null) { ordem.push(primeiro); restantes.delete(primeiro); }
    while (restantes.size) {
      let prox = -1, menor = Infinity;
      for (const j of restantes) if (d[atual][j] < menor) { menor = d[atual][j]; prox = j; }
      ordem.push(prox); restantes.delete(prox); atual = prox;
    }
    const c = custoTotal(ordem, d, inicio, fim);
    if (c < melhorCusto) { melhorCusto = c; melhor = ordem; }
  }

  // 2-opt: inverte trechos enquanto houver ganho
  let melhorou = true;
  while (melhorou) {
    melhorou = false;
    for (let i = 0; i < n - 1; i++) {
      for (let k = i + 1; k < n; k++) {
        const nova = [...melhor.slice(0, i), ...melhor.slice(i, k + 1).reverse(), ...melhor.slice(k + 1)];
        const c = custoTotal(nova, d, inicio, fim);
        if (c < melhorCusto - 1e-9) { melhor = nova; melhorCusto = c; melhorou = true; }
      }
    }
  }
  return melhor;
}

export interface Estimativa { km: number; minutosDirigindo: number; minutosTotal: number; trechosKm: number[] }

export function estimar(pontos: Ponto[], partida: Ponto | null, retornar: boolean, velocidade: number, minutosPorVisita: number): Estimativa {
  const seq = [...(partida ? [partida] : []), ...pontos, ...(partida && retornar ? [partida] : [])];
  const trechosKm: number[] = [];
  for (let i = 0; i < seq.length - 1; i++) trechosKm.push(distanciaKm(seq[i], seq[i + 1]) * FATOR_RUAS);
  const km = trechosKm.reduce((a, b) => a + b, 0);
  const minutosDirigindo = (km / velocidade) * 60;
  return { km, minutosDirigindo, minutosTotal: minutosDirigindo + pontos.length * minutosPorVisita, trechosKm };
}
