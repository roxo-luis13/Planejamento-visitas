/**
 * Segunda trava contra cobrança do Google (a primeira é a cota diária no Google Cloud):
 * cada aparelho faz no máximo LIMITE_DIA chamadas por dia de cada tipo.
 * 70/dia × 31 dias × 2 aparelhos = 4.340/mês, abaixo das 5.000 gratuitas por mês de cada serviço.
 */
export type TipoChamada = 'rotas' | 'lugares';
export const LIMITE_DIA: Record<TipoChamada, number> = { rotas: 70, lugares: 70 };

export class ErroLimite extends Error {}

const chaveDia = () => {
  const d = new Date();
  return `google-uso-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
function ler(): Record<TipoChamada, number> {
  try { return { rotas: 0, lugares: 0, ...JSON.parse(globalThis.localStorage?.getItem(chaveDia()) ?? '{}') }; }
  catch { return { rotas: 0, lugares: 0 }; }
}

export const usoHoje = ler;

/** Registra uma chamada; recusa (ErroLimite) se o limite do dia já foi atingido. */
export function gastar(tipo: TipoChamada) {
  const uso = ler();
  if (uso[tipo] >= LIMITE_DIA[tipo]) {
    throw new ErroLimite(`Limite gratuito de hoje atingido (${LIMITE_DIA[tipo]} ${tipo === 'rotas' ? 'cálculos de rota' : 'buscas de endereço'} pelo Google). Amanhã libera de novo.`);
  }
  uso[tipo]++;
  try {
    const ls = globalThis.localStorage;
    if (!ls) return;
    ls.setItem(chaveDia(), JSON.stringify(uso));
    // limpa os dias antigos
    for (let i = ls.length - 1; i >= 0; i--) { const k = ls.key(i); if (k?.startsWith('google-uso-') && k !== chaveDia()) ls.removeItem(k); }
  } catch { /* sem armazenamento: segue só com a cota do Google */ }
}

/** O Google recusou por cota (429 / RESOURCE_EXHAUSTED)? */
export const ehCotaEsgotada = (status: number, msg: string) => status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(msg);
