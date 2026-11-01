import type { ReactNode } from 'react';
import type { Cliente, Precisao } from '../types';
import { alertaFinanceiro, calcularPrioridade, NIVEIS } from '../lib/prioridade';
import { hojeISO } from '../lib/texto';

export const PRECISOES: Record<Precisao, { rotulo: string; cor: string; alerta: boolean; curto: string }> = {
  confirmado: { rotulo: 'Local confirmado', curto: '📍 Confirmado', cor: 'var(--c-ok)', alerta: false },
  informado: { rotulo: 'Endereço informado', curto: '🏠 Informado', cor: 'var(--c-ok)', alerta: false },
  loja: { rotulo: 'Sugerido: loja encontrada pelo nome', curto: '🔎 Sugerido (loja)', cor: 'var(--c-atencao)', alerta: true },
  rua: { rotulo: 'Sugerido: rua pelo CEP (sem número)', curto: '🔎 Sugerido (rua)', cor: 'var(--c-atencao)', alerta: true },
  bairro: { rotulo: 'Aproximado: centro do bairro', curto: '⚠️ Aprox. (bairro)', cor: 'var(--c-alerta)', alerta: true },
  cidade: { rotulo: 'Aproximado: centro da cidade', curto: '⚠️ Aprox. (cidade)', cor: 'var(--c-alerta)', alerta: true }
};

export function Selo({ cor, children, cheio }: { cor: string; children: ReactNode; cheio?: boolean }) {
  return <span className="selo" style={cheio ? { background: cor, color: 'var(--sobre-cor)', borderColor: cor } : { color: cor, borderColor: cor }}>{children}</span>;
}

export function SeloPrioridade({ c }: { c: Cliente }) {
  const p = calcularPrioridade(c, hojeISO());
  const n = NIVEIS[p.nivel];
  const extra = p.nivel === 'atrasado' && p.atraso ? ` +${p.atraso}d` : '';
  return <Selo cor={n.cor} cheio={p.nivel === 'atrasado'}>{n.rotulo}{extra}</Selo>;
}

export function SeloFinanceiro({ c }: { c: Cliente }) {
  const a = alertaFinanceiro(c);
  if (a.nivel === 'ok') return null;
  return a.nivel === 'cliente'
    ? <Selo cor="var(--c-alerta)" cheio>💲 Financeiro</Selo>
    : <Selo cor="var(--c-atencao)">💲 Grupo</Selo>;
}

export function SeloLocal({ c }: { c: Cliente }) {
  if (!c.local) {
    return <Selo cor="var(--c-cinza)">{c.geoStatus === 'falhou' ? '❓ Sem endereço' : '⏳ Buscando endereço'}</Selo>;
  }
  const p = PRECISOES[c.local.precisao];
  return <Selo cor={p.cor}>{p.curto}</Selo>;
}
