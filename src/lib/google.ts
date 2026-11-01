import type { Ponto } from './rota';

/**
 * Google Routes API: rota real pelas ruas, com trânsito (TRAFFIC_AWARE).
 * A chamada sai direto do iPhone com a chave do Alexandre (guardada só no aparelho).
 */

export interface Perna { distM: number; durS: number; semTransitoS: number }

export interface ResultadoGoogle {
  ordem: number[];            // índices das paradas na ordem escolhida
  pernas: Perna[];            // saída→1, 1→2, ..., (última→saída se voltar)
  distM: number;
  durS: number;               // com trânsito
  semTransitoS: number;       // mesmo trajeto sem trânsito
  polyline: string;
}

export type Buscar = (url: string, init?: RequestInit) => Promise<Response>;

const segundos = (s: string | undefined) => (s ? Number(s.replace('s', '')) || 0 : 0);
const ll = (p: Ponto) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });

export class ErroGoogle extends Error {}

async function chamar(buscar: Buscar, chave: string, url: string, campos: string, corpo: unknown) {
  let r: Response;
  try {
    r = await buscar(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': chave, 'X-Goog-FieldMask': campos },
      body: JSON.stringify(corpo)
    });
  } catch {
    throw new ErroGoogle('Sem conexão com o Google. Verifique a internet.');
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg: string = j?.error?.message ?? `erro ${r.status}`;
    if (r.status === 403 || /API key|PERMISSION|referer|blocked/i.test(msg)) {
      throw new ErroGoogle(`O Google recusou a chave: ${msg}. Confira em Ajustes se a chave está certa, com a "Routes API" ativada e o site liberado.`);
    }
    throw new ErroGoogle(`Google: ${msg}`);
  }
  return j;
}

/**
 * Calcula a rota.
 * - otimizar=true: o Google escolhe a ordem das paradas intermediárias.
 * - Se não voltar à saída, o destino final é `fimFixo` (índice da parada que fecha o dia).
 */
export async function rotaGoogle(opts: {
  chave: string;
  origem: Ponto;
  paradas: Ponto[];
  voltar: boolean;
  retorno?: Ponto;            // para onde voltar (padrão: a origem)
  otimizar: boolean;
  fimFixo?: number;
  saida?: Date | null;
  buscar?: Buscar;
}): Promise<ResultadoGoogle> {
  const { chave, origem, paradas, voltar, otimizar } = opts;
  if (!paradas.length) throw new ErroGoogle('Nenhuma parada com localização.');
  if (paradas.length > 25) throw new ErroGoogle('O Google calcula no máximo 25 paradas por rota. Divida o dia em duas partes.');
  const buscar = opts.buscar ?? ((u, i) => fetch(u, i));

  // Monta destino e intermediárias
  let idxMeio = paradas.map((_, i) => i);
  let destino: Ponto;
  let idxFim: number | null = null;
  if (voltar) destino = opts.retorno ?? origem;
  else {
    idxFim = opts.fimFixo ?? paradas.length - 1;
    destino = paradas[idxFim];
    idxMeio = idxMeio.filter((i) => i !== idxFim);
  }

  const corpo: Record<string, unknown> = {
    origin: ll(origem),
    destination: ll(destino),
    intermediates: idxMeio.map((i) => ll(paradas[i])),
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
    optimizeWaypointOrder: otimizar && idxMeio.length > 1,
    languageCode: 'pt-BR',
    regionCode: 'br',
    units: 'METRIC',
    polylineQuality: 'OVERVIEW'
  };
  // O Google só aceita horário de saída no futuro; senão usa "agora"
  if (opts.saida && opts.saida.getTime() > Date.now() + 60_000) corpo.departureTime = opts.saida.toISOString();

  const j = await chamar(buscar, chave, 'https://routes.googleapis.com/directions/v2:computeRoutes',
    'routes.distanceMeters,routes.duration,routes.staticDuration,routes.polyline.encodedPolyline,routes.legs.distanceMeters,routes.legs.duration,routes.legs.staticDuration,routes.optimizedIntermediateWaypointIndex',
    corpo);
  const rota = j.routes?.[0];
  if (!rota) throw new ErroGoogle('O Google não encontrou rota entre esses pontos.');

  const ordemMeio: number[] = rota.optimizedIntermediateWaypointIndex?.length === idxMeio.length && rota.optimizedIntermediateWaypointIndex[0] !== -1
    ? rota.optimizedIntermediateWaypointIndex.map((k: number) => idxMeio[k])
    : idxMeio;
  const ordem = idxFim === null ? ordemMeio : [...ordemMeio, idxFim];

  return {
    ordem,
    pernas: (rota.legs ?? []).map((l: { distanceMeters?: number; duration?: string; staticDuration?: string }) => ({
      distM: l.distanceMeters ?? 0, durS: segundos(l.duration), semTransitoS: segundos(l.staticDuration)
    })),
    distM: rota.distanceMeters ?? 0,
    durS: segundos(rota.duration),
    semTransitoS: segundos(rota.staticDuration),
    polyline: rota.polyline?.encodedPolyline ?? ''
  };
}

/** Teste rápido da chave (rota curta em Taubaté). */
export async function testarChave(chave: string, buscar?: Buscar): Promise<string> {
  const r = await rotaGoogle({
    chave, buscar, voltar: false, otimizar: false,
    origem: { lat: -23.0262, lng: -45.5553 }, paradas: [{ lat: -23.0206, lng: -45.5560 }]
  });
  return `Chave funcionando ✓ (teste: ${(r.distM / 1000).toFixed(1)} km, ${Math.round(r.durS / 60)} min)`;
}

export interface Lugar { lat: number; lng: number; rotulo: string; endereco: string }

/** Busca de endereço/estabelecimento pelo Google Places (para a saída). */
export async function buscarLugaresGoogle(chave: string, texto: string, buscar?: Buscar): Promise<Lugar[]> {
  const j = await chamar(buscar ?? ((u, i) => fetch(u, i)), chave, 'https://places.googleapis.com/v1/places:searchText',
    'places.displayName,places.formattedAddress,places.location',
    { textQuery: texto, languageCode: 'pt-BR', regionCode: 'BR', maxResultCount: 5 });
  return (j.places ?? []).map((p: { displayName?: { text: string }; formattedAddress: string; location: { latitude: number; longitude: number } }) => ({
    lat: p.location.latitude, lng: p.location.longitude, rotulo: p.displayName?.text ?? p.formattedAddress, endereco: p.formattedAddress
  }));
}

/** Decodifica a "encoded polyline" do Google em pontos. */
export function decodificarPolyline(s: string): Ponto[] {
  const pts: Ponto[] = [];
  let i = 0, lat = 0, lng = 0;
  while (i < s.length) {
    for (const eixo of [0, 1]) {
      let res = 0, shift = 0, b: number;
      do { b = s.charCodeAt(i++) - 63; res |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const d = res & 1 ? ~(res >> 1) : res >> 1;
      if (eixo === 0) lat += d; else lng += d;
    }
    pts.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return pts;
}

/** Horários previstos: chegada em cada parada e fim do dia. */
export function horarios(inicio: Date, pernas: Perna[], qtdParadas: number, minutosPorVisita: number) {
  const chegadas: Date[] = [];
  let t = inicio.getTime();
  for (let k = 0; k < qtdParadas && k < pernas.length; k++) {
    t += pernas[k].durS * 1000;
    chegadas.push(new Date(t));
    t += minutosPorVisita * 60_000;
  }
  if (pernas.length > qtdParadas) t += pernas[qtdParadas].durS * 1000; // volta para a saída
  return { chegadas, fim: new Date(t) };
}
