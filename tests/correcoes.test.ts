import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { mesclar } from '../src/lib/mesclar';
import { mesclarCliente } from '../src/lib/sincronizar';
import { corrigir } from '../src/lib/correcoes';
import { lerPlanilha } from '../src/lib/planilha';
import { planilhaExemplo, LINHA_A, LINHA_B } from './planilha.test';
import { db } from '../src/db';
import { editarCliente } from '../src/lib/acoes';
import type { Cliente } from '../src/types';

const base = lerPlanilha(planilhaExemplo([LINHA_A, LINHA_B])).clientes;
const importar = (ex: Cliente[] = []) => mesclar(ex, base, { arquivo: 'a.xls', dataPlanilha: null }).clientes;

describe('edição do cliente (correções)', () => {
  it('diferente da planilha vira correção; igual não', () => {
    const c = importar()[0];
    const r = corrigir(c, { fantasia: 'Ótica Nova', bairro: 'Vila Áurea', cidade: c.cidade.toLowerCase(), cep: '11770-042' });
    expect(r.campos.fantasia).toBe('Ótica Nova');
    expect(r.campos.bairro).toBe('VILA AUREA');
    expect(r.correcoes).toMatchObject({ fantasia: { valor: 'Ótica Nova', planilha: c.fantasia }, bairro: { valor: 'VILA AUREA', planilha: c.bairro } });
    expect(r.correcoes!.cidade).toBeUndefined();
  });

  it('a correção continua valendo depois de importar a planilha de novo; desfazer volta ao da planilha', () => {
    const ex = importar();
    const { campos, correcoes } = corrigir(ex[0], { fantasia: 'Ótica Nova', bairro: 'Vila Aurea' });
    Object.assign(ex[0], campos, { correcoes });
    const depois = importar(ex)[0];
    expect(depois.fantasia).toBe('Ótica Nova');
    expect(depois.bairro).toBe('VILA AUREA');
    // desfazer: digitar o valor da planilha
    const volta = corrigir(depois, { fantasia: base[0].fantasia });
    expect(volta.campos.fantasia).toBe(base[0].fantasia);
    expect(volta.correcoes!.fantasia).toBeUndefined();
    expect(volta.correcoes!.bairro).toBeDefined();
  });

  it('se a planilha nova passar a trazer o mesmo valor, a correção some', () => {
    const ex = importar();
    const { campos, correcoes } = corrigir(ex[0], { bairro: 'Vila Aurea' });
    Object.assign(ex[0], campos, { correcoes });
    const nova = base.map((c, i) => (i === 0 ? { ...c, bairro: 'VILA AUREA' } : c));
    const r = mesclar(ex, nova, { arquivo: 'b.xls', dataPlanilha: null }).clientes[0];
    expect(r.bairro).toBe('VILA AUREA');
    expect(r.correcoes).toBeNull();
  });

  it('sincronização: planilha nova num aparelho + correção no outro = correção vale', () => {
    const a = importar()[0];
    const corrigido: Cliente = { ...a, ...corrigir(a, { fantasia: 'Ótica Nova' }).campos, correcoes: corrigir(a, { fantasia: 'Ótica Nova' }).correcoes, _emUsuario: 200, _emPlanilha: 200 };
    const outroAparelho: Cliente = { ...a, rede: 'REDE X', _emPlanilha: 300, _emUsuario: 100 };
    const m = mesclarCliente(corrigido, outroAparelho);
    expect(m.fantasia).toBe('Ótica Nova');
    expect(m.rede).toBe('REDE X');
  });
});

describe('editarCliente (no aparelho)', () => {
  beforeEach(async () => { await db.clientes.clear(); await db.clientes.bulkPut(importar()); });
  it('grava contato e correções; sem rua não chama o mapa', async () => {
    const c = (await db.clientes.toArray())[0];
    const r = await editarCliente(c.codigo, {
      fantasia: 'Ótica Nova', razao: c.razao, responsavel: ' Ana ', telefone: '(12) 99999-0000',
      endereco: { logradouro: '', numero: '', complemento: '', bairro: c.bairro, cidade: c.cidade, uf: c.uf, cep: c.cep }
    });
    expect(r.localizado).toBeNull();
    const d = (await db.clientes.get(c.codigo))!;
    expect(d).toMatchObject({ fantasia: 'Ótica Nova', responsavel: 'Ana', telefone: '(12) 99999-0000' });
    expect(Object.keys(d.correcoes!)).toEqual(['fantasia']);
    expect(d._emPlanilha).toBe(d._emUsuario);
  });
});
