import { describe, expect, it, beforeAll } from 'vitest';
import { definirIntervaloNominatim, nomeParaBusca, sugerirLocal, type Buscar } from '../src/lib/geocodificar';
import type { DadosPlanilha } from '../src/types';

beforeAll(() => definirIntervaloNominatim(0));

const cli = (o: Partial<DadosPlanilha>): DadosPlanilha => ({
  codigo: 'X', uf: 'SP', meso: '', micro: '', cidade: 'PERUIBE', bairro: 'CENTRO', cep: '11770042', razao: 'R', fantasia: 'SIX-1 PERUIBE',
  grupo: '', rede: '', marcas: [], freqMedia: null, freqAtual: null, fin: { vencidos: null, protestados: null, inadimplencia: null }, ...o
});
const json = (j: unknown) => new Response(JSON.stringify(j), { status: 200 });
const osm = (lat: number, cidade: string, extra: Record<string, unknown> = {}) => ({ lat: String(lat), lon: '-47', address: { city: cidade }, ...extra });

describe('sugerirLocal', () => {
  it('limpa prefixos de código e o nome da cidade do nome fantasia', () => {
    expect(nomeParaBusca('SR-08 IBIUNA', 'IBIUNA')).toBe('');
    expect(nomeParaBusca('OT. EDNA PERUIBE', 'PERUIBE')).toBe('OT. EDNA');
    expect(nomeParaBusca('SOLARIUM-CUIABA', 'CUIABA')).toBe('SOLARIUM');
  });

  it('usa a loja encontrada pelo nome quando está na mesma cidade', async () => {
    const urls: string[] = [];
    const buscar: Buscar = async (u) => { urls.push(u); return json([osm(-24.31, 'Peruíbe', { class: 'shop', address: { city: 'Peruíbe', road: 'Rua Padre Anchieta', house_number: '200' } })]); };
    const s = await sugerirLocal(cli({ fantasia: 'OTICA DINIZ' }), { buscar });
    expect(s?.local.precisao).toBe('loja');
    expect(s?.endereco).toMatchObject({ logradouro: 'Rua Padre Anchieta', numero: '200', cidade: 'Peruibe' });
    expect(urls).toHaveLength(1);
  });

  it('ignora loja de outra cidade e cai para a rua pelo CEP', async () => {
    const buscar: Buscar = async (u) => {
      if (u.includes('viacep')) return json({ logradouro: 'Avenida Padre Anchieta', bairro: 'Centro', localidade: 'Peruíbe', uf: 'SP' });
      if (u.includes('street=')) return json([osm(-24.32, 'Peruíbe')]);
      return json([osm(-23, 'Santos', { class: 'shop' })]);
    };
    const s = await sugerirLocal(cli({ fantasia: 'OTICA DINIZ' }), { buscar });
    expect(s?.local.precisao).toBe('rua');
    expect(s?.endereco.logradouro).toBe('Avenida Padre Anchieta');
  });

  it('CEP geral (termina em 000) não consulta ViaCEP e usa bairro', async () => {
    const urls: string[] = [];
    const buscar: Buscar = async (u) => { urls.push(u); return u.includes('CENTRO') || u.includes('Centro') ? json([osm(-24.3, 'Peruíbe')]) : json([]); };
    const s = await sugerirLocal(cli({ cep: '11750000' }), { buscar });
    expect(urls.some((u) => u.includes('viacep'))).toBe(false);
    expect(s?.local.precisao).toBe('bairro');
  });

  it('usa centro da cidade como último recurso', async () => {
    const buscar: Buscar = async (u) => (u.includes('city=') ? json([osm(-24.3, 'Peruíbe')]) : json([]));
    const s = await sugerirLocal(cli({ cep: '11750000' }), { buscar });
    expect(s?.local.precisao).toBe('cidade');
  });
});
