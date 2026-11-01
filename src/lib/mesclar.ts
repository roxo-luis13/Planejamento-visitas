import type { Cliente, DadosPlanilha, ResumoImportacao } from '../types';

const PRECISAO_DO_ALEXANDRE = new Set(['confirmado', 'informado']);

function mesmosDados(a: DadosPlanilha, b: DadosPlanilha): boolean {
  const chaves: (keyof DadosPlanilha)[] = [
    'uf', 'meso', 'micro', 'cidade', 'bairro', 'cep', 'razao', 'fantasia', 'grupo', 'rede',
    'marcas', 'freqMedia', 'freqAtual', 'fin'
  ];
  return chaves.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));
}

/**
 * Junta a planilha nova com o que já existe.
 * - Dados da planilha: atualizados.
 * - Dados do Alexandre (endereço, localização, notas, visitas): mantidos.
 * - Se o CEP/cidade mudou e a localização era só sugestão: refaz a sugestão.
 * - Se o CEP mudou e a localização foi confirmada: mantém, mas avisa.
 * - Quem saiu da planilha não é apagado: fica "fora da carteira".
 */
export function mesclar(
  existentes: Cliente[],
  novos: DadosPlanilha[],
  meta: { arquivo: string; dataPlanilha: string | null; agora?: string }
): { clientes: Cliente[]; resumo: ResumoImportacao } {
  const agora = meta.agora ?? new Date().toISOString();
  const porCodigo = new Map(existentes.map((c) => [c.codigo, c]));
  const resumo: ResumoImportacao = {
    arquivo: meta.arquivo, em: agora, dataPlanilha: meta.dataPlanilha, total: novos.length,
    novos: 0, atualizados: 0, semMudanca: 0, saiuDaCarteira: 0, voltaram: 0, locaisResetados: 0
  };
  const saida: Cliente[] = [];
  const codigosNovos = new Set<string>();

  for (const n of novos) {
    codigosNovos.add(n.codigo);
    const antigo = porCodigo.get(n.codigo);
    if (!antigo) {
      resumo.novos++;
      saida.push({ ...n, ativo: 1, importadoEm: agora, endereco: null, local: null, geoStatus: 'pendente', avisoCep: null, notas: '' });
      continue;
    }
    if (!antigo.ativo) resumo.voltaram++;
    else if (mesmosDados(antigo, n)) resumo.semMudanca++;
    else resumo.atualizados++;

    const mudouLugar = antigo.cep !== n.cep || antigo.cidade !== n.cidade || antigo.bairro !== n.bairro;
    let { local, endereco, geoStatus, avisoCep } = antigo;
    if (mudouLugar) {
      if (local && PRECISAO_DO_ALEXANDRE.has(local.precisao)) {
        avisoCep = `Na planilha de ${meta.dataPlanilha ?? 'hoje'} o endereço mudou (CEP ${antigo.cep} → ${n.cep}, ${n.bairro}). Confira se a localização salva continua certa.`;
      } else {
        if (local) resumo.locaisResetados++;
        local = null;
        endereco = null;
        geoStatus = 'pendente';
      }
    }
    saida.push({ ...antigo, ...n, ativo: 1, importadoEm: agora, local, endereco, geoStatus, avisoCep });
  }

  for (const antigo of existentes) {
    if (codigosNovos.has(antigo.codigo)) continue;
    if (antigo.ativo) resumo.saiuDaCarteira++;
    saida.push({ ...antigo, ativo: 0 });
  }
  return { clientes: saida, resumo };
}
