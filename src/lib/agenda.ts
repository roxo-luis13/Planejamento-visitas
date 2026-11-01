import { db } from '../db';
import type { Cliente, Visita } from '../types';
import { agendaAutorizada, entrar, K_AGENDA, tokenAtual, tokenVencido } from './drive';
import { retornosPendentes } from './relatorio';
import { formatarData, hojeISO, titulo } from './texto';

/**
 * Lembretes de retorno na Agenda Google do Alexandre.
 * Cada retorno combinado vira um evento às 08:00 do dia, com alertas 2 dias antes (08:00) e na hora.
 * O iPhone avisa pelo app Google Agenda (ou pelo Calendário, com a conta Google adicionada).
 * IDs fixos (cliente + data): os dois aparelhos chegam ao mesmo resultado, sem duplicar.
 */
export const HORA_LEMBRETE = '08:00';
export const MINUTOS_ANTES = [0, 2 * 24 * 60];

const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const K_HASH = 'agenda-hash';
const K_QUANDO = 'agenda-quando';

export interface EstadoAgenda { ativa: boolean; autorizada: boolean; ultima: string | null; erro: string | null; eventos: number | null }
const ouvintes = new Set<(e: EstadoAgenda) => void>();
let estado: EstadoAgenda = { ativa: false, autorizada: false, ultima: localStorage.getItem(K_QUANDO), erro: null, eventos: null };
function publicar(p: Partial<EstadoAgenda> = {}) {
  estado = { ...estado, ativa: !!localStorage.getItem(K_AGENDA), autorizada: agendaAutorizada(), ...p };
  ouvintes.forEach((f) => f(estado));
}
export function ouvirAgenda(f: (e: EstadoAgenda) => void) { ouvintes.add(f); publicar(); return () => { ouvintes.delete(f); }; }

/** ID do evento: só pode ter 0-9 e a-v (base32hex). */
export function idEvento(codigo: string, data: string): string {
  const hex = [...new TextEncoder().encode(codigo)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `visitas${hex}d${data.replace(/-/g, '')}`;
}

function somarMinutos(hhmm: string, min: number) {
  const [h, m] = hhmm.split(':').map(Number);
  const t = h * 60 + m + min;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/** Evento de um retorno combinado. */
export function eventoRetorno(c: Cliente, retorno: string, visita: Visita | undefined, fuso: string) {
  const end = c.endereco?.logradouro
    ? `${c.endereco.logradouro}${c.endereco.numero ? ', ' + c.endereco.numero : ''} - ${titulo(c.bairro)}, ${titulo(c.cidade)}`
    : `${titulo(c.bairro)}, ${titulo(c.cidade)}`;
  const linhas = [
    `Retorno combinado${visita ? ` na visita de ${formatarData(visita.data)}` : ''}.`,
    visita?.contato ? `Falar com: ${visita.contato}` : '',
    visita?.nota ? `Observação: ${visita.nota}` : '',
    `Cliente ${c.codigo}${c.razao ? ` · ${c.razao}` : ''}`,
    'Criado pelo app Visitas.'
  ].filter(Boolean);
  return {
    id: idEvento(c.codigo, retorno),
    summary: `📅 Retorno: ${c.fantasia}`,
    description: linhas.join('\n'),
    location: end,
    start: { dateTime: `${retorno}T${HORA_LEMBRETE}:00`, timeZone: fuso },
    end: { dateTime: `${retorno}T${somarMinutos(HORA_LEMBRETE, 30)}:00`, timeZone: fuso },
    transparency: 'transparent',
    reminders: { useDefault: false, overrides: MINUTOS_ANTES.map((minutes) => ({ method: 'popup', minutes })) },
    extendedProperties: { private: { app: 'visitas', codigo: c.codigo } }
  };
}

class Erro403 extends Error {}
async function chamar(token: string, url: string, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  if (r.status === 401) { tokenVencido(); throw new Error('O acesso ao Google venceu.'); }
  if (r.status === 403) {
    const txt = await r.text();
    throw new Erro403(/accessNotConfigured|has not been used|disabled/i.test(txt)
      ? 'A Google Calendar API não está ativada no projeto do Google Cloud.'
      : 'Sem permissão para a Agenda. Toque em "Ativar lembretes" de novo e permita o acesso à agenda.');
  }
  return r;
}

let rodando: Promise<void> | null = null;

/** Deixa a Agenda igual aos retornos pendentes: cria o que falta, corrige o que mudou, apaga o que não vale mais. */
export function sincronizarAgenda(forcar = false): Promise<void> {
  if (!rodando) rodando = (async () => { try { await sincronizarAgendaUmaVez(forcar); } finally { rodando = null; } })();
  return rodando;
}

async function sincronizarAgendaUmaVez(forcar: boolean) {
  publicar();
  if (!estado.ativa || !estado.autorizada || !navigator.onLine) return;
  const token = tokenAtual();
  if (!token) return;
  const hoje = hojeISO();
  const historico = await db.historico.toArray();
  const pend = retornosPendentes(historico).filter((x) => x.retorno >= hoje);
  const clientes = new Map((await db.clientes.bulkGet(pend.map((x) => x.codigo))).filter((c): c is Cliente => !!c).map((c) => [c.codigo, c]));
  const fuso = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
  const desejados = pend.filter((x) => clientes.get(x.codigo)?.ativo).map((x) => {
    const visita = historico.find((v) => v.id === `${x.codigo}|${x.combinadoEm}`);
    return eventoRetorno(clientes.get(x.codigo)!, x.retorno, visita, fuso);
  });

  // nada mudou desde a última vez (e foi há menos de 6 h): não chama o Google
  const hash = JSON.stringify(desejados);
  const quando = Date.parse(localStorage.getItem(K_QUANDO) ?? '') || 0;
  if (!forcar && hash === localStorage.getItem(K_HASH) && Date.now() - quando < 6 * 3600_000) return;

  try {
    const [a, m, d] = hoje.split('-').map(Number);
    const desde = new Date(a, m - 1, d).toISOString();
    const lista = await (await chamar(token, `${API}?privateExtendedProperty=${encodeURIComponent('app=visitas')}&timeMin=${encodeURIComponent(desde)}&maxResults=2500&singleEvents=true&fields=items(id,summary,description,location,start)`)).json();
    const existentes = new Map<string, { summary?: string; description?: string; location?: string; start?: { dateTime?: string } }>(
      (lista.items ?? []).map((e: { id: string }) => [e.id, e]));
    const ids = new Set(desejados.map((e) => e.id));

    for (const ev of desejados) {
      const ex = existentes.get(ev.id);
      if (ex) {
        if (ex.summary !== ev.summary || ex.description !== ev.description || ex.location !== ev.location)
          await chamar(token, `${API}/${ev.id}`, { method: 'PUT', body: JSON.stringify(ev) });
        continue;
      }
      const r = await chamar(token, API, { method: 'POST', body: JSON.stringify(ev) });
      // 409: o ID já existiu (ex: apagado antes) — reativa com PUT
      if (r.status === 409) await chamar(token, `${API}/${ev.id}`, { method: 'PUT', body: JSON.stringify({ ...ev, status: 'confirmed' }) });
      else if (!r.ok) throw new Error(`Agenda respondeu ${r.status}`);
    }
    for (const id of existentes.keys()) {
      if (!ids.has(id)) await chamar(token, `${API}/${id}`, { method: 'DELETE' });
    }
    const agora = new Date().toISOString();
    localStorage.setItem(K_HASH, hash);
    localStorage.setItem(K_QUANDO, agora);
    publicar({ ultima: agora, erro: null, eventos: desejados.length });
  } catch (e) {
    publicar({ erro: (e as Error).message });
  }
}

/** Liga os lembretes: pede ao Google a permissão da Agenda (tela do Google) e volta. */
export function ativarAgenda() {
  localStorage.setItem(K_AGENDA, '1');
  if (agendaAutorizada()) { publicar(); void sincronizarAgenda(true); }
  else entrar(false);
}

/** Desliga e apaga da Agenda os lembretes futuros criados pelo app. */
export async function desativarAgenda() {
  const token = tokenAtual();
  try {
    if (token && agendaAutorizada()) {
      const lista = await (await chamar(token, `${API}?privateExtendedProperty=${encodeURIComponent('app=visitas')}&timeMin=${encodeURIComponent(new Date().toISOString())}&maxResults=2500&fields=items(id)`)).json();
      for (const e of lista.items ?? []) await chamar(token, `${API}/${e.id}`, { method: 'DELETE' });
    }
  } catch { /* desliga mesmo assim */ }
  localStorage.removeItem(K_AGENDA);
  localStorage.removeItem(K_HASH);
  publicar({ erro: null, eventos: null });
}
