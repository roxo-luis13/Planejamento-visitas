import type { Ponto } from './rota';

export function linkAppleMaps(p: Ponto, nome?: string) {
  return `https://maps.apple.com/?daddr=${p.lat},${p.lng}&dirflg=d${nome ? `&q=${encodeURIComponent(nome)}` : ''}`;
}
export function linkGoogleMaps(p: Ponto) {
  return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=driving`;
}
export function linkWaze(p: Ponto) {
  return `https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes`;
}

/**
 * Rota completa no Google Maps. O link aceita no máximo 9 paradas intermediárias,
 * então rotas grandes são divididas em partes.
 */
export function linksRotaGoogle(paradas: Ponto[], partida: Ponto | null, retornar: boolean): string[] {
  const seq = [...paradas, ...(partida && retornar ? [partida] : [])];
  const links: string[] = [];
  let origem: Ponto | null = partida;
  let i = 0;
  while (i < seq.length) {
    const bloco = seq.slice(i, i + 10);
    const destino = bloco[bloco.length - 1];
    const meio = bloco.slice(0, -1);
    const params = new URLSearchParams({ api: '1', travelmode: 'driving', destination: `${destino.lat},${destino.lng}` });
    if (origem) params.set('origin', `${origem.lat},${origem.lng}`);
    if (meio.length) params.set('waypoints', meio.map((p) => `${p.lat},${p.lng}`).join('|'));
    links.push(`https://www.google.com/maps/dir/?${params.toString()}`);
    origem = destino;
    i += bloco.length;
  }
  return links;
}
