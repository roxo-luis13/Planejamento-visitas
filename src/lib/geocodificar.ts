import { gastar } from './cotaGoogle';
import type { DadosPlanilha, Endereco, Local, Precisao } from '../types';
import { normalizar, titulo } from './texto';

/**
 * Sugestão automática de endereço/localização a partir do que a planilha tem
 * (nome fantasia, bairro, cidade, UF e CEP). Ordem de tentativa:
 *  1. Google Places (somente se houver chave configurada): procura a loja pelo nome.
 *  2. OpenStreetMap: procura a loja pelo nome na cidade.
 *  3. ViaCEP: se o CEP for de rua (não termina em 000), descobre o logradouro e localiza a rua.
 *  4. OpenStreetMap: centro do bairro; depois centro da cidade.
 * Tudo que vem daqui é SUGESTÃO e aparece com alerta até o Alexandre confirmar.
 */

export interface Sugestao { local: Local; endereco: Endereco }

export type Buscar = (url: string, init?: RequestInit) => Promise<Response>;

export interface Cache {
  ler(chave: string): Promise<unknown | undefined>;
  gravar(chave: string, valor: unknown): Promise<void>;
}

const semCache: Cache = { ler: async () => undefined, gravar: async () => {} };

// OpenStreetMap (Nominatim) permite no máximo 1 consulta por segundo.
let filaNominatim: Promise<unknown> = Promise.resolve();
let intervaloNominatimMs = 1100;
export function definirIntervaloNominatim(ms: number) { intervaloNominatimMs = ms; }

function esperar(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

interface ResultadoOSM {
  lat: string; lon: string; class?: string; type?: string; display_name?: string;
  address?: Record<string, string>;
}

async function nominatim(buscar: Buscar, cache: Cache, params: Record<string, string>): Promise<ResultadoOSM[]> {
  const qs = new URLSearchParams({ format: 'jsonv2', addressdetails: '1', countrycodes: 'br', 'accept-language': 'pt-BR', limit: '5', ...params });
  const chave = 'osm:' + qs.toString();
  const emCache = await cache.ler(chave);
  if (emCache) return emCache as ResultadoOSM[];
  const tarefa = filaNominatim.then(async () => {
    const r = await buscar(`https://nominatim.openstreetmap.org/search?${qs}`);
    await esperar(intervaloNominatimMs);
    if (!r.ok) throw new Error(`OpenStreetMap respondeu ${r.status}`);
    return (await r.json()) as ResultadoOSM[];
  });
  filaNominatim = tarefa.catch(() => undefined);
  const res = await tarefa;
  await cache.gravar(chave, res);
  return res;
}

function cidadeDoResultado(a: Record<string, string> = {}): string {
  return normalizar(a.city ?? a.town ?? a.village ?? a.municipality ?? a.city_district ?? '');
}

function mesmaCidade(r: ResultadoOSM, cidade: string) {
  const c = cidadeDoResultado(r.address);
  return !!c && c === normalizar(cidade);
}

interface ViaCep { logradouro?: string; bairro?: string; localidade?: string; uf?: string; erro?: boolean | string }

async function viaCep(buscar: Buscar, cache: Cache, cep: string): Promise<ViaCep | null> {
  const chave = 'cep:' + cep;
  const emCache = await cache.ler(chave);
  if (emCache) return emCache as ViaCep;
  const r = await buscar(`https://viacep.com.br/ws/${cep}/json/`);
  if (!r.ok) return null;
  const j = (await r.json()) as ViaCep;
  if (j.erro) return null;
  await cache.gravar(chave, j);
  return j;
}

/** Consulta um CEP nos Correios (ViaCEP), para preencher a rua no formulário. */
export async function buscarCep(cep: string): Promise<ViaCep | null> {
  const so = cep.replace(/\D/g, '');
  if (so.length !== 8) return null;
  try { return await viaCep((u, i) => fetch(u, i), semCache, so); } catch { return null; }
}

/** Tira prefixos tipo "SR-08", "GF-16", "JBRASIL-01" que não ajudam a achar a loja. */
export function nomeParaBusca(fantasia: string, cidade: string): string {
  let n = fantasia.replace(/\b[A-Z]{1,4}-?\d{1,3}\b/g, ' ').replace(/[-_/]+/g, ' ');
  // remove o nome da cidade de dentro do nome fantasia (ex: "SOLARIUM-CUIABA")
  n = normalizar(n).replace(normalizar(cidade), ' ');
  return n.replace(/\s+/g, ' ').trim();
}

function enderecoBase(c: DadosPlanilha): Endereco {
  return { logradouro: '', numero: '', complemento: '', bairro: titulo(c.bairro), cidade: titulo(c.cidade), uf: c.uf, cep: c.cep };
}

function montar(c: DadosPlanilha, lat: number, lng: number, precisao: Precisao, fonte: string, end: Partial<Endereco>): Sugestao {
  return {
    local: { lat, lng, precisao, fonte, atualizadoEm: new Date().toISOString() },
    endereco: { ...enderecoBase(c), ...Object.fromEntries(Object.entries(end).filter(([, v]) => v)) }
  };
}

async function googlePlaces(buscar: Buscar, chaveApi: string, c: DadosPlanilha): Promise<Sugestao | null> {
  gastar('lugares'); // passa do limite do dia: cai no gratuito (OpenStreetMap)
  const r = await buscar('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': chaveApi,
      'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.addressComponents'
    },
    body: JSON.stringify({ textQuery: `${c.fantasia}, ${c.bairro}, ${c.cidade} - ${c.uf}`, languageCode: 'pt-BR', regionCode: 'BR', maxResultCount: 3 })
  });
  if (!r.ok) throw new Error(`Google respondeu ${r.status}`);
  const j = await r.json() as { places?: { formattedAddress: string; location: { latitude: number; longitude: number };
    addressComponents?: { longText: string; types: string[] }[] }[] };
  const p = (j.places ?? []).find((x) => normalizar(x.formattedAddress).includes(normalizar(c.cidade)));
  if (!p) return null;
  const comp = (t: string) => p.addressComponents?.find((a) => a.types.includes(t))?.longText ?? '';
  return montar(c, p.location.latitude, p.location.longitude, 'loja', 'Google (loja encontrada pelo nome)', {
    logradouro: comp('route'), numero: comp('street_number'), bairro: comp('sublocality') || comp('sublocality_level_1'),
    cep: comp('postal_code').replace(/\D/g, '')
  });
}

export async function sugerirLocal(
  c: DadosPlanilha,
  opcoes: { buscar?: Buscar; cache?: Cache; googleKey?: string } = {}
): Promise<Sugestao | null> {
  const buscar = opcoes.buscar ?? ((u, i) => fetch(u, i));
  const cache = opcoes.cache ?? semCache;
  const cidade = titulo(c.cidade);

  // 1. Google Places (opcional)
  if (opcoes.googleKey) {
    try {
      const g = await googlePlaces(buscar, opcoes.googleKey, c);
      if (g) return g;
    } catch { /* segue para as opções gratuitas */ }
  }

  // 2. Loja pelo nome no OpenStreetMap
  const nome = nomeParaBusca(c.fantasia, c.cidade);
  if (nome.length >= 3) {
    const r = await nominatim(buscar, cache, { q: `${nome}, ${cidade}, ${c.uf}` });
    const loja = r.find((x) => mesmaCidade(x, c.cidade) && ['shop', 'amenity', 'craft', 'office'].includes(x.class ?? ''));
    if (loja) {
      const a = loja.address ?? {};
      return montar(c, +loja.lat, +loja.lon, 'loja', 'OpenStreetMap (loja encontrada pelo nome)', {
        logradouro: a.road ?? '', numero: a.house_number ?? '', bairro: a.suburb ?? a.neighbourhood ?? ''
      });
    }
  }

  // 3. Rua pelo CEP
  const cepDeRua = /^\d{8}$/.test(c.cep) && !c.cep.endsWith('000');
  if (cepDeRua) {
    const v = await viaCep(buscar, cache, c.cep).catch(() => null);
    if (v?.logradouro) {
      const r = await nominatim(buscar, cache, { street: v.logradouro, city: v.localidade ?? cidade, state: v.uf ?? c.uf, country: 'Brasil' });
      const rua = r.find((x) => mesmaCidade(x, c.cidade)) ?? null;
      if (rua) {
        return montar(c, +rua.lat, +rua.lon, 'rua', 'CEP (ViaCEP) + OpenStreetMap', { logradouro: v.logradouro, bairro: v.bairro ?? '' });
      }
    }
  }

  // 4. Bairro, depois cidade
  if (c.bairro) {
    const r = await nominatim(buscar, cache, { q: `${titulo(c.bairro)}, ${cidade}, ${c.uf}` });
    const b = r.find((x) => mesmaCidade(x, c.cidade));
    if (b) return montar(c, +b.lat, +b.lon, 'bairro', 'OpenStreetMap (centro do bairro)', {});
  }
  const r = await nominatim(buscar, cache, { city: cidade, state: c.uf, country: 'Brasil' });
  const cid = r.find((x) => mesmaCidade(x, c.cidade)) ?? r[0];
  if (cid) return montar(c, +cid.lat, +cid.lon, 'cidade', 'OpenStreetMap (centro da cidade)', {});
  return null;
}

/** Localiza um endereço digitado pelo Alexandre. */
export async function localizarEndereco(e: Endereco, opcoes: { buscar?: Buscar; cache?: Cache } = {}): Promise<{ lat: number; lng: number } | null> {
  const buscar = opcoes.buscar ?? ((u, i) => fetch(u, i));
  const cache = opcoes.cache ?? semCache;
  const street = [e.numero, e.logradouro].filter(Boolean).join(' ');
  const tentativas: Record<string, string>[] = [];
  if (street) tentativas.push({ street, city: e.cidade, state: e.uf, country: 'Brasil' });
  if (e.cep) tentativas.push({ postalcode: e.cep.replace(/\D/g, ''), city: e.cidade, country: 'Brasil' });
  if (e.bairro) tentativas.push({ q: `${e.bairro}, ${e.cidade}, ${e.uf}` });
  for (const t of tentativas) {
    const r = await nominatim(buscar, cache, t);
    const x = r.find((y) => mesmaCidade(y, e.cidade));
    if (x) return { lat: +x.lat, lng: +x.lon };
  }
  return null;
}

/** Busca livre (para o ponto de partida). */
export async function buscarLugar(texto: string, opcoes: { buscar?: Buscar } = {}): Promise<{ lat: number; lng: number; rotulo: string } | null> {
  const r = await nominatim(opcoes.buscar ?? ((u, i) => fetch(u, i)), semCache, { q: texto });
  return r[0] ? { lat: +r[0].lat, lng: +r[0].lon, rotulo: r[0].display_name ?? texto } : null;
}
