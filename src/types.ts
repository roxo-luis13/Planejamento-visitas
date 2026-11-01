export type Precisao = 'confirmado' | 'informado' | 'loja' | 'rua' | 'bairro' | 'cidade';

export interface Local {
  lat: number;
  lng: number;
  precisao: Precisao;
  fonte: string;          // de onde veio (GPS, mapa, OpenStreetMap, Google...)
  atualizadoEm: string;   // ISO
}

export interface Endereco {
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
}

export interface MarcaDados {
  nome: string;                         // MORMAII, COLCCI, YOUY...
  ultFat: string | null;                // ISO yyyy-mm-dd
  pecas: { ano: number; qtd: number }[];
}

export interface Financeiro {
  vencidos: string | null;
  protestados: string | null;
  inadimplencia: string | null;
}

/** Campos que vêm da planilha (sobrescritos a cada importação). */
export interface DadosPlanilha {
  codigo: string;
  uf: string;
  meso: string;
  micro: string;
  cidade: string;
  bairro: string;
  cep: string;
  razao: string;
  fantasia: string;
  grupo: string;
  rede: string;
  marcas: MarcaDados[];
  freqMedia: number | null;
  freqAtual: number | null;
  fin: Financeiro;
}

export type GeoStatus = 'pendente' | 'ok' | 'falhou';

export interface Cliente extends DadosPlanilha {
  ativo: 0 | 1;                 // 1 = está na planilha mais recente
  importadoEm: string;
  // ---- Campos do Alexandre: nunca sobrescritos pela importação ----
  endereco: Endereco | null;    // endereço sugerido ou informado
  local: Local | null;
  geoStatus: GeoStatus;
  avisoCep: string | null;      // ex: CEP mudou na planilha depois de confirmado
  notas: string;
  // ---- Sincronização (Drive): quando cada parte foi alterada (ms) ----
  _emPlanilha?: number;         // dados da planilha / ativo
  _emUsuario?: number;          // endereço, localização, notas
}

/** Resultado da visita. 'visitado' = registrada sem escolher resultado (nada é obrigatório). */
export type Resultado = 'pedido' | 'sem_pedido' | 'nao_atendido' | 'reagendado' | 'visitado';

export const RESULTADOS: { id: Resultado; rotulo: string; emoji: string }[] = [
  { id: 'pedido', rotulo: 'Pedido feito', emoji: '✅' },
  { id: 'sem_pedido', rotulo: 'Sem pedido', emoji: '➖' },
  { id: 'nao_atendido', rotulo: 'Não atendido', emoji: '🔒' },
  { id: 'reagendado', rotulo: 'Reagendado', emoji: '📅' }
];
export const ROTULO_VISITADO = { rotulo: 'Visita registrada', emoji: '✔️' };
export const rotuloResultado = (r: Resultado | null | undefined) =>
  r === 'visitado' ? ROTULO_VISITADO : RESULTADOS.find((x) => x.id === r) ?? ROTULO_VISITADO;

/** Listas fixas: viram categorias somáveis nos relatórios. */
export const MOTIVOS_SEM_PEDIDO = [
  { id: 'estoque_alto', rotulo: 'Estoque alto' },
  { id: 'sem_verba', rotulo: 'Sem verba / financeiro' },
  { id: 'preco', rotulo: 'Preço' },
  { id: 'concorrente', rotulo: 'Comprou de concorrente' },
  { id: 'vai_pensar', rotulo: 'Vai pensar / retornar' },
  { id: 'nao_trabalha_marca', rotulo: 'Não trabalha mais com a marca' },
  { id: 'outro', rotulo: 'Outro' }
] as const;
export const MOTIVOS_NAO_ATENDIDO = [
  { id: 'fechado', rotulo: 'Loja fechada' },
  { id: 'ausente', rotulo: 'Responsável ausente' },
  { id: 'sem_tempo', rotulo: 'Sem tempo para atender' },
  { id: 'outro', rotulo: 'Outro' }
] as const;
export const ASSUNTOS = [
  { id: 'colecao', rotulo: 'Coleção nova' },
  { id: 'troca', rotulo: 'Troca / garantia' },
  { id: 'financeiro', rotulo: 'Financeiro / cobrança' },
  { id: 'vitrine', rotulo: 'Vitrine / exposição' },
  { id: 'treinamento', rotulo: 'Treinamento' },
  { id: 'reclamacao', rotulo: 'Reclamação' }
] as const;
export const MARCAS_PADRAO = ['MORMAII', 'COLCCI', 'YOUY'];

export interface Pedido {
  pecas: Record<string, number>;   // por marca
  valor: number | null;            // R$
  numero: string;
}

export interface Parada {
  codigo: string;
  resultado: Resultado | null;
  nota: string;
  checkinEm: string | null;
}

export interface Partida {
  tipo: 'padrao' | 'atual' | 'local' | 'busca';
  lat: number;
  lng: number;
  rotulo: string;
}

/** Resultado do cálculo real pelo Google (ruas + trânsito). */
export interface CalculoRota {
  em: string;                 // quando foi calculado
  saidaEm: string;            // horário de saída usado (ISO)
  codigos: string[];          // paradas cobertas, na ordem
  voltar: boolean;
  pernas: { distM: number; durS: number; semTransitoS: number }[];
  distM: number;
  durS: number;
  semTransitoS: number;
  polyline: string;
  origem: { lat: number; lng: number };
}

export interface Rota {
  data: string;               // yyyy-mm-dd (chave)
  paradas: Parada[];
  partida: Partida | null;
  retornar: boolean;
  otimizadaEm: string | null;
  horaSaida?: string;         // "08:00"
  calculo?: CalculoRota | null;
  _em?: number;               // última alteração (sincronização)
}

export interface LocalSalvo { id: string; nome: string; lat: number; lng: number; endereco: string }

/** Histórico de visitas: um registro por cliente por dia (id = "CODIGO|AAAA-MM-DD"). */
export interface Visita {
  id: string;
  codigo: string;
  data: string;
  resultado: Resultado;
  nota: string;
  em: string;                 // quando foi registrada
  // ---- detalhes (todos opcionais) ----
  motivo?: string | null;     // MOTIVOS_SEM_PEDIDO ou MOTIVOS_NAO_ATENDIDO
  contato?: string;
  assuntos?: string[];
  pedido?: Pedido | null;
  retorno?: string | null;    // data de retorno combinada (yyyy-mm-dd)
  chegadaEm?: string | null;  // check-in
  saidaEm?: string | null;
  gps?: { lat: number; lng: number; precisaoM: number; distanciaM: number | null } | null;
  removido?: boolean;         // visita desfeita (mantida para a sincronização saber)
  _em?: number;
}

export interface LinhaConfig { chave: string; valor: unknown; _em?: number }

export interface ResumoImportacao {
  arquivo: string;
  em: string;
  dataPlanilha: string | null;
  total: number;
  novos: number;
  atualizados: number;
  semMudanca: number;
  saiuDaCarteira: number;
  voltaram: number;
  locaisResetados: number;
}

export interface Config {
  partidaPadrao: { lat: number; lng: number; rotulo: string } | null;
  locais: LocalSalvo[];
  horaSaidaPadrao: string;
  minutosPorVisita: number;
  velocidadeMedia: number;   // km/h
  googleKey: string;
  ultimaImportacao: ResumoImportacao | null;
}

export const CONFIG_PADRAO: Config = {
  partidaPadrao: null,
  locais: [],
  horaSaidaPadrao: '08:00',
  minutosPorVisita: 30,
  velocidadeMedia: 30,
  googleKey: '',
  ultimaImportacao: null
};
