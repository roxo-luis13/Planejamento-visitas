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
}

export type Resultado = 'pedido' | 'sem_pedido' | 'fechado' | 'ausente' | 'reagendar';

export const RESULTADOS: { id: Resultado; rotulo: string; emoji: string }[] = [
  { id: 'pedido', rotulo: 'Pedido feito', emoji: '✅' },
  { id: 'sem_pedido', rotulo: 'Sem pedido', emoji: '➖' },
  { id: 'fechado', rotulo: 'Loja fechada', emoji: '🔒' },
  { id: 'ausente', rotulo: 'Responsável ausente', emoji: '👤' },
  { id: 'reagendar', rotulo: 'Reagendar', emoji: '📅' }
];

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
}

export interface LocalSalvo { id: string; nome: string; lat: number; lng: number; endereco: string }

export interface Visita {
  id?: number;
  codigo: string;
  data: string;
  resultado: Resultado;
  nota: string;
  em: string;
}

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
