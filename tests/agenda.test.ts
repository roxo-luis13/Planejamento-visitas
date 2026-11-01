import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Cliente } from '../src/types';

const mem = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k)
};
let agenda: typeof import('../src/lib/agenda');
beforeAll(async () => { agenda = await import('../src/lib/agenda'); });

const c = { codigo: 'B31594', fantasia: 'Ótica Sol', razao: 'Sol LTDA', bairro: 'CENTRO', cidade: 'TAUBATE', endereco: null } as unknown as Cliente;

describe('lembretes de retorno na Agenda Google', () => {
  it('ID do evento fixo e só com caracteres aceitos pelo Google (0-9, a-v)', () => {
    const id = agenda.idEvento('B31594', '2026-12-02');
    expect(id).toMatch(/^[0-9a-v]{5,1024}$/);
    expect(agenda.idEvento('B31594', '2026-12-02')).toBe(id);
    expect(agenda.idEvento('B31594', '2026-12-03')).not.toBe(id);
  });
  it('evento às 08:00 com aviso 2 dias antes e na hora', () => {
    const ev = agenda.eventoRetorno(c, '2026-12-02', { id: 'x', codigo: 'B31594', data: '2026-11-02', resultado: 'sem_pedido', nota: 'ligar antes', em: '', contato: 'Ana' }, 'America/Sao_Paulo');
    expect(ev.start).toEqual({ dateTime: '2026-12-02T08:00:00', timeZone: 'America/Sao_Paulo' });
    expect(ev.end.dateTime).toBe('2026-12-02T08:30:00');
    expect(ev.reminders.overrides.map((r) => r.minutes).sort((a, b) => a - b)).toEqual([0, 2880]);
    expect(ev.summary).toContain('Ótica Sol');
    expect(ev.description).toContain('Falar com: Ana');
    expect(ev.description).toContain('02/11/2026');
    expect(ev.location).toBe('Centro, Taubate');
  });
});
