import { describe, expect, it } from 'vitest';
import { distanciaKm, estimar, otimizarOrdem } from '../src/lib/rota';
import { enderecoParaMapa, linkGoogleMaps, linksRotaGoogle } from '../src/lib/navegar';

describe('rota', () => {
  it('distância Taubaté → São José dos Campos ~ 40 km em linha reta', () => {
    const d = distanciaKm({ lat: -23.0264, lng: -45.5553 }, { lat: -23.1791, lng: -45.8872 });
    expect(d).toBeGreaterThan(35); expect(d).toBeLessThan(42);
  });

  it('ordena pontos em linha na sequência natural a partir da partida', () => {
    const pts = [3, 1, 4, 2].map((x) => ({ lat: -23, lng: -46 + x * 0.05 }));
    const ordem = otimizarOrdem(pts, { lat: -23, lng: -46 }, false);
    expect(ordem.map((i) => pts[i].lng)).toEqual([1, 2, 3, 4].map((x) => -46 + x * 0.05));
  });

  it('nunca piora em relação à ordem original (20 pontos aleatórios)', () => {
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const pts = Array.from({ length: 20 }, () => ({ lat: -23 - rnd() * 0.5, lng: -46 - rnd() * 0.5 }));
    const partida = { lat: -23.2, lng: -46.2 };
    const ordem = otimizarOrdem(pts, partida, true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(pts.map((_, i) => i));
    const km = (o: number[]) => estimar(o.map((i) => pts[i]), partida, true, 30, 0).km;
    expect(km(ordem)).toBeLessThan(km(pts.map((_, i) => i)));
  });

  it('link do Google divide rotas com mais de 9 paradas intermediárias', () => {
    const pts = Array.from({ length: 15 }, (_, i) => ({ lat: -23, lng: -46 + i * 0.01 }));
    const links = linksRotaGoogle(pts, { lat: -23.1, lng: -46 }, { lat: -23.1, lng: -46 });
    expect(links).toHaveLength(2);
    expect(new URL(links[0]).searchParams.get('waypoints')!.split('|')).toHaveLength(9);
    expect(new URL(links[1]).searchParams.get('destination')).toBe('-23.1,-46');
  });

  it('no Maps vai o endereço escrito quando o cliente tem rua; sem rua, a coordenada', () => {
    const base = { bairro: 'CENTRO', cidade: 'TAUBATE', uf: 'SP', cep: '12020000' };
    const comRua = { ...base, endereco: { logradouro: 'Rua Duque de Caxias', numero: '120', complemento: '', bairro: '', cidade: '', uf: '', cep: '' } };
    expect(enderecoParaMapa(comRua)).toBe('Rua Duque de Caxias, 120, Centro, Taubate - SP, 12020-000');
    expect(enderecoParaMapa({ ...base, endereco: null })).toBeNull();
    expect(enderecoParaMapa({ ...base, endereco: { ...comRua.endereco, logradouro: ' ' } })).toBeNull();

    const links = linksRotaGoogle([enderecoParaMapa(comRua)!, { lat: -23.2, lng: -45.9 }], null, 'Rua da Casa, 1, Taubate - SP');
    const u = new URL(links[0]).searchParams;
    expect(u.get('origin')).toBeNull(); // parte de onde o celular está
    expect(u.get('waypoints')).toBe('Rua Duque de Caxias, 120, Centro, Taubate - SP, 12020-000|-23.2,-45.9');
    expect(u.get('destination')).toBe('Rua da Casa, 1, Taubate - SP');
    expect(new URL(linkGoogleMaps({ lat: 1, lng: 2 }, 'Rua X, 1')).searchParams.get('destination')).toBe('Rua X, 1');
  });
});
