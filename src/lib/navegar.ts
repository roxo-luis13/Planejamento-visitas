import type { Cliente } from '../types';
import type { Ponto } from './rota';
import { formatarCep, titulo } from './texto';

/** Um ponto da rota no link: endereço escrito (quando há rua) ou coordenadas. */
export type Destino = string | Ponto;
const emTexto = (d: Destino) => (typeof d === 'string' ? d : `${d.lat},${d.lng}`);

/**
 * Endereço escrito do cliente, para o Maps mostrar a rua em vez de "pino marcado".
 * Só quando há rua: com só bairro/cidade o Maps iria para o centro do bairro, então fica a coordenada.
 */
export function enderecoParaMapa(c: Pick<Cliente, 'endereco' | 'bairro' | 'cidade' | 'uf' | 'cep'>): string | null {
  const e = c.endereco;
  if (!e?.logradouro?.trim()) return null;
  const rua = [e.logradouro.trim(), e.numero?.trim()].filter(Boolean).join(', ');
  const bairro = titulo(e.bairro || c.bairro);
  const cidade = [titulo(e.cidade || c.cidade), (e.uf || c.uf || '').toUpperCase()].filter(Boolean).join(' - ');
  const cep = e.cep || c.cep;
  return [rua, bairro, cidade, cep ? formatarCep(cep) : ''].filter(Boolean).join(', ');
}

export function linkAppleMaps(p: Ponto, nome?: string, endereco?: string | null) {
  return `https://maps.apple.com/?daddr=${endereco ? encodeURIComponent(endereco) : `${p.lat},${p.lng}`}&dirflg=d${nome && !endereco ? `&q=${encodeURIComponent(nome)}` : ''}`;
}
export function linkGoogleMaps(p: Ponto, endereco?: string | null) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(endereco ?? `${p.lat},${p.lng}`)}&travelmode=driving`;
}
export function linkWaze(p: Ponto, endereco?: string | null) {
  return endereco ? `https://waze.com/ul?q=${encodeURIComponent(endereco)}&navigate=yes` : `https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes`;
}

/**
 * Rota completa no Google Maps. O link aceita no máximo 9 paradas intermediárias,
 * então rotas grandes são divididas em partes. Sem origem, o Maps parte de onde o celular está.
 */
export function linksRotaGoogle(paradas: Destino[], origem: Destino | null, volta: Destino | null = null): string[] {
  const seq = [...paradas, ...(volta ? [volta] : [])];
  const links: string[] = [];
  let i = 0;
  while (i < seq.length) {
    const bloco = seq.slice(i, i + 10);
    const destino = bloco[bloco.length - 1];
    const meio = bloco.slice(0, -1);
    const params = new URLSearchParams({ api: '1', travelmode: 'driving', destination: emTexto(destino) });
    if (origem) params.set('origin', emTexto(origem));
    if (meio.length) params.set('waypoints', meio.map(emTexto).join('|'));
    links.push(`https://www.google.com/maps/dir/?${params.toString()}`);
    origem = destino;
    i += bloco.length;
  }
  return links;
}
