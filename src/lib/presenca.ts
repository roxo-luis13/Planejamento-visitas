import { db, obterRota } from '../db';
import type { Cliente } from '../types';
import { marcarChegada, marcarSaida } from './acoes';
import { distanciaKm } from './rota';
import { hojeISO } from './texto';

/**
 * Detecção de chegada/saída pelo GPS — só funciona com o app ABERTO na tela
 * (o iPhone pausa apps da web em segundo plano).
 * - Chegou: ficou a menos de RAIO_CHEGADA de um cliente da rota de hoje por TEMPO_CHEGADA → marca "Cheguei".
 * - Saiu: se afastou mais de RAIO_SAIDA → guarda a saída e pergunta se quer registrar a visita.
 * - Ao abrir o app perto de um cliente ainda sem chegada → pergunta "Você está na loja X?".
 */
export const RAIO_CHEGADA = 120;     // metros
export const RAIO_SAIDA = 250;       // metros
export const TEMPO_CHEGADA = 60_000; // ms
export const PRECISAO_MAX = 150;     // ignora leituras do GPS piores que isso (metros)

export interface ParadaGeo { codigo: string; lat: number; lng: number; chegou: boolean; registrado: boolean }
export interface EstadoPresenca { candidato: { codigo: string; desde: number } | null; presente: string | null; primeira: boolean }
export type Evento = { tipo: 'chegou' | 'saiu' | 'perto'; codigo: string };
export const ESTADO_INICIAL: EstadoPresenca = { candidato: null, presente: null, primeira: true };

const metros = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => distanciaKm(a, b) * 1000;

/** Lógica pura: recebe uma posição e devolve o novo estado e os eventos. */
export function avaliarPosicao(estado: EstadoPresenca, pos: { lat: number; lng: number; precisao: number }, paradas: ParadaGeo[], agora: number):
  { estado: EstadoPresenca; eventos: Evento[] } {
  if (pos.precisao > PRECISAO_MAX) return { estado, eventos: [] };
  const eventos: Evento[] = [];
  let { candidato, presente } = estado;

  if (presente) {
    const p = paradas.find((x) => x.codigo === presente);
    if (!p || metros(pos, p) > RAIO_SAIDA) {
      if (p && !p.registrado) eventos.push({ tipo: 'saiu', codigo: p.codigo });
      presente = null;
    } else return { estado: { candidato: null, presente, primeira: false }, eventos };
  }

  const perto = paradas.filter((p) => !p.registrado).map((p) => ({ p, d: metros(pos, p) }))
    .filter((x) => x.d <= RAIO_CHEGADA).sort((a, b) => a.d - b.d)[0]?.p;
  if (!perto) return { estado: { candidato: null, presente, primeira: false }, eventos };

  if (perto.chegou) {
    // já marcou a chegada (ex: reabriu o app na loja): só acompanha para detectar a saída
    return { estado: { candidato: null, presente: perto.codigo, primeira: false }, eventos };
  }
  if (estado.primeira) eventos.push({ tipo: 'perto', codigo: perto.codigo });
  if (candidato?.codigo === perto.codigo) {
    if (agora - candidato.desde >= TEMPO_CHEGADA) {
      eventos.push({ tipo: 'chegou', codigo: perto.codigo });
      return { estado: { candidato: null, presente: perto.codigo, primeira: false }, eventos };
    }
  } else candidato = { codigo: perto.codigo, desde: agora };
  return { estado: { candidato, presente, primeira: false }, eventos };
}

// ---------------- No aparelho ----------------
const K_ATIVA = 'presenca-ativa';
export const presencaAtiva = () => !!localStorage.getItem(K_ATIVA);

export interface Aviso { id: number; tipo: Evento['tipo']; codigo: string; nome: string; data: string; em: number }
const ouvintes = new Set<(a: Aviso | null) => void>();
let aviso: Aviso | null = null;
function publicar(a: Aviso | null) { aviso = a; ouvintes.forEach((f) => f(a)); }
export function ouvirAvisos(f: (a: Aviso | null) => void) { ouvintes.add(f); f(aviso); return () => { ouvintes.delete(f); }; }
export const fecharAviso = () => publicar(null);

let estado = ESTADO_INICIAL;
let vigia: number | null = null;
const ouvintesLigado = new Set<(l: boolean) => void>();
export function ouvirLigado(f: (l: boolean) => void) { ouvintesLigado.add(f); f(vigia !== null); return () => { ouvintesLigado.delete(f); }; }
const avisarLigado = () => ouvintesLigado.forEach((f) => f(vigia !== null));

async function paradasDeHoje(): Promise<{ data: string; lista: ParadaGeo[]; nomes: Map<string, string> }> {
  const data = hojeISO();
  const r = await obterRota(data);
  const clientes = (await db.clientes.bulkGet(r.paradas.map((p) => p.codigo))).filter((c): c is Cliente => !!c);
  const porCodigo = new Map(clientes.map((c) => [c.codigo, c]));
  const lista: ParadaGeo[] = [];
  for (const p of r.paradas) {
    const c = porCodigo.get(p.codigo);
    // endereço aproximado (só bairro/cidade) não serve para saber se chegou
    if (!c?.local || c.local.precisao === 'bairro' || c.local.precisao === 'cidade') continue;
    lista.push({ codigo: p.codigo, lat: c.local.lat, lng: c.local.lng, chegou: !!p.checkinEm, registrado: !!p.resultado });
  }
  return { data, lista, nomes: new Map(clientes.map((c) => [c.codigo, c.fantasia])) };
}

let processando = false;
async function aoMover(g: GeolocationPosition) {
  if (processando) return;
  processando = true;
  try {
    const { data, lista, nomes } = await paradasDeHoje();
    if (!lista.length) return;
    const r = avaliarPosicao(estado, { lat: g.coords.latitude, lng: g.coords.longitude, precisao: g.coords.accuracy }, lista, Date.now());
    estado = r.estado;
    for (const e of r.eventos) {
      const nome = nomes.get(e.codigo) ?? e.codigo;
      if (e.tipo === 'chegou') await marcarChegada(data, e.codigo);
      if (e.tipo === 'saiu') {
        await marcarSaida(data, e.codigo);
        void notificar(`Saiu da ${nome}`, 'Toque para registrar a visita.', `saiu-${e.codigo}`);
      }
      // "perto" e "chegou" não sobrescrevem uma pergunta de saída ainda aberta
      if (e.tipo === 'saiu' || !aviso || aviso.tipo !== 'saiu') publicar({ id: Date.now(), tipo: e.tipo, codigo: e.codigo, nome, data, em: Date.now() });
    }
  } finally { processando = false; }
}

function ligar() {
  if (vigia !== null || !navigator.geolocation) return;
  estado = { ...estado, primeira: true, candidato: null };
  vigia = navigator.geolocation.watchPosition((g) => void aoMover(g), () => { /* sem sinal: tenta de novo na próxima leitura */ },
    { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 });
  avisarLigado();
}
function desligar() {
  if (vigia !== null) navigator.geolocation.clearWatch(vigia);
  vigia = null;
  avisarLigado();
}

async function permitido(): Promise<boolean> {
  try {
    const p = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    if (p) return p.state !== 'denied';
  } catch { /* Safari antigo */ }
  return true;
}

/** Chamado na abertura do app: liga/desliga conforme o app fica visível. */
export function iniciarPresenca() {
  const atualizar = async () => {
    if (presencaAtiva() && document.visibilityState === 'visible' && await permitido()) ligar(); else desligar();
  };
  document.addEventListener('visibilitychange', () => void atualizar());
  void atualizar();
}

/** Botão "Ativar": pede a localização (e as notificações, se o iPhone permitir). */
export async function ativarPresenca(): Promise<string | null> {
  if (!navigator.geolocation) return 'Este aparelho não informa a localização.';
  const ok = await new Promise<boolean>((res) => navigator.geolocation.getCurrentPosition(() => res(true), () => res(false), { timeout: 20_000 }));
  if (!ok) return 'Sem permissão de localização. No iPhone: Ajustes → Privacidade → Serviços de Localização → Sites do Safari → "Ao Usar o App".';
  localStorage.setItem(K_ATIVA, '1');
  try { if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission(); } catch { /* sem notificações */ }
  ligar();
  return null;
}
export function desativarPresenca() { localStorage.removeItem(K_ATIVA); desligar(); publicar(null); }

async function notificar(titulo: string, corpo: string, tag: string) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(titulo, { body: corpo, tag, icon: 'icon-192.png' });
    else new Notification(titulo, { body: corpo, tag });
  } catch { /* notificação é só um extra */ }
}
