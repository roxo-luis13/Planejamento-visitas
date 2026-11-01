import { CAMPOS_CORRIGIVEIS, type Cliente, type Correcoes, type DadosPlanilha } from '../types';
import { normalizar } from './texto';

/** Formato da planilha: sem acento, maiúsculas (ex: "SAO JOSE DOS CAMPOS"); CEP só números. */
export function formatoPlanilha(campo: string, v: string): string {
  if (campo === 'cep') return v.replace(/\D/g, '');
  if (campo === 'fantasia' || campo === 'razao') return v.trim().replace(/\s+/g, ' ');
  return normalizar(v).toUpperCase().replace(/\s+/g, ' ').trim();
}

/** Aplica as correções sobre os dados que vieram da planilha. */
export function aplicarCorrecoes<T extends DadosPlanilha>(d: T, corr: Correcoes | null | undefined): T {
  if (!corr) return d;
  const r = { ...d };
  for (const k of CAMPOS_CORRIGIVEIS) { const c = corr[k]; if (c) (r as Record<string, unknown>)[k] = c.valor; }
  return r;
}

/**
 * Planilha nova chegou: guarda o valor novo da planilha (para desfazer) e
 * descarta a correção quando a planilha passou a trazer o mesmo valor.
 */
export function atualizarOriginais(corr: Correcoes | null | undefined, n: DadosPlanilha): Correcoes | null {
  if (!corr) return null;
  const r: Correcoes = {};
  for (const k of CAMPOS_CORRIGIVEIS) {
    const c = corr[k];
    if (c && formatoPlanilha(k, c.valor) !== formatoPlanilha(k, n[k])) r[k] = { valor: c.valor, planilha: n[k] };
  }
  return Object.keys(r).length ? r : null;
}

/**
 * Edição: compara cada campo com o valor original da planilha.
 * Igual ao original = sem correção; diferente = correção.
 */
export function corrigir(c: Cliente, novos: Partial<Record<typeof CAMPOS_CORRIGIVEIS[number], string>>): { campos: Partial<Cliente>; correcoes: Correcoes | null } {
  const corr: Correcoes = { ...(c.correcoes ?? {}) };
  const campos: Partial<Cliente> = {};
  for (const k of CAMPOS_CORRIGIVEIS) {
    const bruto = novos[k];
    if (bruto === undefined) continue;
    const original = corr[k]?.planilha ?? c[k];
    const valor = formatoPlanilha(k, bruto);
    if (!valor || valor === formatoPlanilha(k, original)) { delete corr[k]; (campos as Record<string, string>)[k] = original; }
    else { corr[k] = { valor, planilha: original }; (campos as Record<string, string>)[k] = valor; }
  }
  return { campos, correcoes: Object.keys(corr).length ? corr : null };
}
