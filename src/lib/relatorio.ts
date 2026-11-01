import type { Cliente, Visita } from '../types';
import { ASSUNTOS, MARCAS_PADRAO, MOTIVOS_NAO_ATENDIDO, MOTIVOS_SEM_PEDIDO, rotuloResultado } from '../types';
import { titulo } from './texto';

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const rotuloMotivo = (id?: string | null) => [...MOTIVOS_SEM_PEDIDO, ...MOTIVOS_NAO_ATENDIDO].find((m) => m.id === id)?.rotulo ?? '';
const horaDe = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
const brData = (iso?: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

/** Resumo curto (lista e histórico): peças, valor, motivo, retorno. */
export function resumoVisita(v: Visita): string {
  const partes: string[] = [];
  const pecas = Object.values(v.pedido?.pecas ?? {}).reduce((a, b) => a + b, 0);
  if (pecas) partes.push(`${pecas} pç`);
  if (v.pedido?.valor != null) partes.push(v.pedido.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  const m = rotuloMotivo(v.motivo);
  if (m) partes.push(m);
  if (v.retorno) partes.push(`retorno ${brData(v.retorno).slice(0, 5)}`);
  return partes.join(' · ');
}

/** Marcas que aparecem nas visitas (as padrão sempre primeiro, para colunas estáveis). */
export function marcasDasVisitas(visitas: Visita[]): string[] {
  const extras = new Set<string>();
  for (const v of visitas) for (const m of Object.keys(v.pedido?.pecas ?? {})) if (!MARCAS_PADRAO.includes(m)) extras.add(m);
  return [...MARCAS_PADRAO, ...[...extras].sort()];
}

/** Uma linha por visita, com uma coluna por informação (pronta para Excel e para os relatórios). */
export function linhasRelatorio(visitas: Visita[], clientes: Map<string, Cliente>): Record<string, string | number>[] {
  const marcas = marcasDasVisitas(visitas);
  return visitas
    .filter((v) => !v.removido)
    .sort((a, b) => (a.data + (a.chegadaEm ?? a.em)).localeCompare(b.data + (b.chegadaEm ?? b.em)))
    .map((v) => {
      const c = clientes.get(v.codigo);
      const [ano, mes, dia] = v.data.split('-').map(Number);
      const dur = v.chegadaEm && v.saidaEm ? Math.max(0, Math.round((Date.parse(v.saidaEm) - Date.parse(v.chegadaEm)) / 60000)) : '';
      const pecas = v.pedido?.pecas ?? {};
      const linha: Record<string, string | number> = {
        'Data': brData(v.data),
        'Dia da semana': DIAS[new Date(ano, mes - 1, dia).getDay()],
        'Chegada': horaDe(v.chegadaEm),
        'Saída': horaDe(v.saidaEm),
        'Duração (min)': dur,
        'Código': v.codigo,
        'Nome fantasia': c?.fantasia ?? '',
        'Razão social': c?.razao ?? '',
        'Cidade': c ? titulo(c.cidade) : '',
        'Bairro': c ? titulo(c.bairro) : '',
        'Microrregião': c ? titulo(c.micro) : '',
        'Grupo econômico': c?.grupo ?? '',
        'Rede': c?.rede ?? '',
        'Resultado': rotuloResultado(v.resultado).rotulo,
        'Motivo': rotuloMotivo(v.motivo),
        'Com quem falou': v.contato ?? '',
        'Assuntos': (v.assuntos ?? []).map((a) => ASSUNTOS.find((x) => x.id === a)?.rotulo ?? a).join(', ')
      };
      for (const m of marcas) linha[`Peças ${titulo(m)}`] = pecas[m] ?? '';
      const total = Object.values(pecas).reduce((a, b) => a + b, 0);
      linha['Total de peças'] = total || '';
      linha['Valor (R$)'] = v.pedido?.valor ?? '';
      linha['Nº do pedido'] = v.pedido?.numero ?? '';
      linha['Retorno combinado'] = brData(v.retorno);
      linha['Observação'] = v.nota ?? '';
      linha['Distância da loja (m)'] = v.gps?.distanciaM ?? '';
      return linha;
    });
}

export type Periodo = 'este_mes' | 'mes_passado' | 'ultimos_30' | 'ultimos_90' | 'tudo';
export const PERIODOS: { id: Periodo; rotulo: string }[] = [
  { id: 'este_mes', rotulo: 'Este mês' },
  { id: 'mes_passado', rotulo: 'Mês passado' },
  { id: 'ultimos_30', rotulo: 'Últimos 30 dias' },
  { id: 'ultimos_90', rotulo: 'Últimos 90 dias' },
  { id: 'tudo', rotulo: 'Tudo' }
];

/** Intervalo [inicio, fim] (yyyy-mm-dd) de um período, a partir de hoje. */
export function intervalo(p: Periodo, hoje: string): [string, string] {
  const [a, m] = hoje.split('-').map(Number);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const [ha, hm, hd] = hoje.split('-').map(Number);
  const menos = (dias: number) => iso(new Date(ha, hm - 1, hd - dias));
  switch (p) {
    case 'este_mes': return [`${a}-${String(m).padStart(2, '0')}-01`, hoje];
    case 'mes_passado': return [iso(new Date(a, m - 2, 1)), iso(new Date(a, m - 1, 0))];
    case 'ultimos_30': return [menos(29), hoje];
    case 'ultimos_90': return [menos(89), hoje];
    default: return ['0000-01-01', '9999-12-31'];
  }
}

/** Gera o arquivo Excel das visitas do período. */
export async function gerarExcel(visitas: Visita[], clientes: Map<string, Cliente>, nomePeriodo: string): Promise<File> {
  const XLSX = await import('xlsx');
  const linhas = linhasRelatorio(visitas, clientes);
  const ws = XLSX.utils.json_to_sheet(linhas.length ? linhas : [{ 'Data': 'Nenhuma visita no período' }]);
  ws['!cols'] = Object.keys(linhas[0] ?? { Data: '' }).map((k) => ({ wch: Math.min(40, Math.max(10, k.length + 2)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Visitas');
  const dados = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const nome = `visitas-${nomePeriodo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/gi, '-')}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new File([dados], nome, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ---------------- Relatórios na tela ----------------
export interface Contagem { id: string; rotulo: string; qtd: number; extra?: number }
export interface ResumoPeriodo {
  visitas: number;
  clientesVisitados: number;
  diasEmCampo: number;
  pedidos: number;
  taxaPedido: number | null;          // pedidos / visitas atendidas (exclui "não atendido")
  pecas: number;
  valor: number;
  ticketMedio: number | null;         // valor / pedidos com valor informado
  minutosMedios: number | null;       // tempo médio na loja (só visitas com chegada e saída)
  resultados: Contagem[];
  marcas: Contagem[];                 // qtd = peças, extra = nº de pedidos com a marca
  motivosSemPedido: Contagem[];
  motivosNaoAtendido: Contagem[];
  assuntos: Contagem[];
  cidades: Contagem[];                // qtd = visitas, extra = pedidos
}

function contar<T>(itens: T[], chave: (x: T) => string | null | undefined, rotulo: (k: string) => string): Contagem[] {
  const m = new Map<string, number>();
  for (const x of itens) { const k = chave(x); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m].map(([id, qtd]) => ({ id, rotulo: rotulo(id), qtd })).sort((a, b) => b.qtd - a.qtd || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
}

export function resumoPeriodo(todas: Visita[], clientes: Map<string, Cliente>): ResumoPeriodo {
  const vs = todas.filter((v) => !v.removido);
  const pedidos = vs.filter((v) => v.resultado === 'pedido');
  const atendidas = vs.filter((v) => v.resultado !== 'nao_atendido').length;
  let pecas = 0, valor = 0, comValor = 0;
  const porMarca = new Map<string, { pecas: number; pedidos: number }>();
  for (const v of vs) {
    for (const [m, n] of Object.entries(v.pedido?.pecas ?? {})) {
      if (!n) continue;
      pecas += n;
      const x = porMarca.get(m) ?? { pecas: 0, pedidos: 0 };
      x.pecas += n; x.pedidos++; porMarca.set(m, x);
    }
    if (v.pedido?.valor != null) { valor += v.pedido.valor; comValor++; }
  }
  const duracoes = vs.filter((v) => v.chegadaEm && v.saidaEm)
    .map((v) => (Date.parse(v.saidaEm!) - Date.parse(v.chegadaEm!)) / 60000).filter((d) => d >= 1 && d < 600);
  const cidades = contar(vs, (v) => clientes.get(v.codigo)?.cidade, titulo)
    .map((c) => ({ ...c, extra: pedidos.filter((v) => clientes.get(v.codigo)?.cidade === c.id).length }));
  return {
    visitas: vs.length,
    clientesVisitados: new Set(vs.map((v) => v.codigo)).size,
    diasEmCampo: new Set(vs.map((v) => v.data)).size,
    pedidos: pedidos.length,
    taxaPedido: atendidas ? pedidos.length / atendidas : null,
    pecas, valor,
    ticketMedio: comValor ? valor / comValor : null,
    minutosMedios: duracoes.length ? Math.round(duracoes.reduce((a, b) => a + b, 0) / duracoes.length) : null,
    resultados: contar(vs, (v) => v.resultado, (k) => rotuloResultado(k as Visita['resultado']).rotulo),
    marcas: marcasDasVisitas(vs).filter((m) => porMarca.has(m))
      .map((m) => ({ id: m, rotulo: titulo(m), qtd: porMarca.get(m)!.pecas, extra: porMarca.get(m)!.pedidos }))
      .sort((a, b) => b.qtd - a.qtd),
    motivosSemPedido: contar(vs.filter((v) => v.resultado === 'sem_pedido'), (v) => v.motivo, (k) => MOTIVOS_SEM_PEDIDO.find((m) => m.id === k)?.rotulo ?? k),
    motivosNaoAtendido: contar(vs.filter((v) => v.resultado === 'nao_atendido'), (v) => v.motivo, (k) => MOTIVOS_NAO_ATENDIDO.find((m) => m.id === k)?.rotulo ?? k),
    assuntos: contar(vs.flatMap((v) => v.assuntos ?? []), (a) => a, (k) => ASSUNTOS.find((x) => x.id === k)?.rotulo ?? k),
    cidades
  };
}

export interface RetornoPendente { codigo: string; retorno: string; combinadoEm: string }

/** Retornos combinados que ainda não aconteceram: a última visita do cliente marcou um retorno e não houve visita depois. */
export function retornosPendentes(todas: Visita[]): RetornoPendente[] {
  const ultima = new Map<string, Visita>();
  for (const v of todas) {
    if (v.removido) continue;
    const u = ultima.get(v.codigo);
    if (!u || v.data > u.data) ultima.set(v.codigo, v);
  }
  return [...ultima.values()].filter((v) => v.retorno && v.retorno > v.data)
    .map((v) => ({ codigo: v.codigo, retorno: v.retorno!, combinadoEm: v.data }))
    .sort((a, b) => a.retorno.localeCompare(b.retorno));
}
