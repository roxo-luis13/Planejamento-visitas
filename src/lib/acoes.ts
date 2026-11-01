import { db, lerConfig, obterRota, salvarConfig } from '../db';
import type { Cliente, Endereco, Partida, Resultado, Rota } from '../types';
import { mesclar } from './mesclar';
import { otimizarOrdem } from './rota';
import { localizarEndereco } from './geocodificar';
import { iniciarFila } from './filaGeo';

// ---------- Importação ----------
export async function importarArquivo(arquivo: File) {
  const { lerPlanilha } = await import('./planilha'); // carregado só na importação (biblioteca grande)
  const lida = lerPlanilha(new Uint8Array(await arquivo.arrayBuffer()));
  if (!lida.clientes.length) throw new Error('A planilha não tem nenhum cliente com código.');
  const existentes = await db.clientes.toArray();
  const { clientes, resumo } = mesclar(existentes, lida.clientes, { arquivo: arquivo.name, dataPlanilha: lida.dataPlanilha });
  await db.transaction('rw', db.clientes, db.config, async () => {
    await db.clientes.bulkPut(clientes);
    await salvarConfig({ ultimaImportacao: resumo });
  });
  void iniciarFila();
  return { resumo, avisos: lida.avisos };
}

// ---------- Rota ----------
async function salvarRota(r: Rota) { await db.rotas.put(r); }

export async function alternarNaRota(data: string, codigo: string) {
  const r = await obterRota(data);
  const i = r.paradas.findIndex((p) => p.codigo === codigo);
  if (i >= 0) r.paradas.splice(i, 1);
  else r.paradas.push({ codigo, resultado: null, nota: '', checkinEm: null });
  r.otimizadaEm = null;
  await salvarRota(r);
  if (i < 0) void iniciarFila(); // garante sugestão de endereço para quem entrou na rota
}

export async function moverParada(data: string, codigo: string, delta: number) {
  const r = await obterRota(data);
  const i = r.paradas.findIndex((p) => p.codigo === codigo);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= r.paradas.length) return;
  [r.paradas[i], r.paradas[j]] = [r.paradas[j], r.paradas[i]];
  r.otimizadaEm = null;
  await salvarRota(r);
}

export async function definirPartida(data: string, partida: Partida | null, retornar?: boolean) {
  const r = await obterRota(data);
  r.partida = partida;
  if (retornar !== undefined) r.retornar = retornar;
  r.otimizadaEm = null;
  await salvarRota(r);
}

export async function definirRetorno(data: string, retornar: boolean) {
  const r = await obterRota(data);
  r.retornar = retornar;
  r.otimizadaEm = null;
  await salvarRota(r);
}

/** Otimiza apenas as visitas ainda não feitas; as já registradas ficam no topo. */
export async function otimizarRota(data: string) {
  const r = await obterRota(data);
  const clientes = new Map((await db.clientes.bulkGet(r.paradas.map((p) => p.codigo))).filter(Boolean).map((c) => [c!.codigo, c!]));
  const feitas = r.paradas.filter((p) => p.resultado);
  const abertas = r.paradas.filter((p) => !p.resultado);
  const comLocal = abertas.filter((p) => clientes.get(p.codigo)?.local);
  const semLocal = abertas.filter((p) => !clientes.get(p.codigo)?.local);
  const ultimaFeita = [...feitas].reverse().map((p) => clientes.get(p.codigo)?.local).find(Boolean);
  const origem = ultimaFeita ?? r.partida;
  const ordem = otimizarOrdem(comLocal.map((p) => clientes.get(p.codigo)!.local!), origem ?? null, r.retornar && !!r.partida);
  r.paradas = [...feitas, ...ordem.map((i) => comLocal[i]), ...semLocal];
  r.otimizadaEm = new Date().toISOString();
  await salvarRota(r);
  return { semLocal: semLocal.length };
}

export async function registrarResultado(data: string, codigo: string, resultado: Resultado | null, nota: string, reagendarPara?: string) {
  const r = await obterRota(data);
  const p = r.paradas.find((x) => x.codigo === codigo);
  if (!p) return;
  const agora = new Date().toISOString();
  p.resultado = resultado;
  p.nota = nota;
  p.checkinEm = resultado ? p.checkinEm ?? agora : null;
  await db.transaction('rw', db.rotas, db.visitas, async () => {
    await salvarRota(r);
    await db.visitas.where({ codigo, data }).delete();
    if (resultado) await db.visitas.add({ codigo, data, resultado, nota, em: agora });
  });
  if (resultado === 'reagendar' && reagendarPara) {
    const outra = await obterRota(reagendarPara);
    if (!outra.paradas.some((x) => x.codigo === codigo)) {
      outra.paradas.push({ codigo, resultado: null, nota: nota ? `Reagendado de ${data}: ${nota}` : `Reagendado de ${data}`, checkinEm: null });
      outra.otimizadaEm = null;
      await salvarRota(outra);
    }
  }
}

// ---------- Localização do cliente ----------
export async function confirmarLocal(codigo: string, lat: number, lng: number, fonte: string) {
  await db.clientes.update(codigo, {
    local: { lat, lng, precisao: 'confirmado', fonte, atualizadoEm: new Date().toISOString() },
    geoStatus: 'ok', avisoCep: null
  });
}

export async function salvarEndereco(c: Cliente, e: Endereco): Promise<boolean> {
  const p = await localizarEndereco(e);
  const manterGps = c.local?.precisao === 'confirmado';
  await db.clientes.update(c.codigo, {
    endereco: e,
    avisoCep: null,
    ...(p && !manterGps
      ? { local: { ...p, precisao: 'informado' as const, fonte: 'Endereço informado pelo Alexandre', atualizadoEm: new Date().toISOString() }, geoStatus: 'ok' as const }
      : {})
  });
  return !!p;
}

export async function refazerSugestao(codigo: string) {
  await db.clientes.update(codigo, { local: null, endereco: null, geoStatus: 'pendente', avisoCep: null });
  void iniciarFila();
}

export function obterGps(): Promise<{ lat: number; lng: number; precisaoM: number }> {
  return new Promise((ok, falha) => {
    if (!('geolocation' in navigator)) return falha(new Error('Este aparelho não oferece localização.'));
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude, precisaoM: p.coords.accuracy }),
      (e) => falha(new Error(e.code === 1 ? 'Permissão de localização negada. Ative em Ajustes > Privacidade > Serviços de Localização.' : 'Não consegui obter a localização.')),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  });
}

// ---------- Backup ----------
export async function exportarBackup(): Promise<Blob> {
  const dados = {
    app: 'planejamento-visitas', versao: 1, em: new Date().toISOString(),
    clientes: await db.clientes.toArray(), rotas: await db.rotas.toArray(),
    visitas: await db.visitas.toArray(), config: await db.config.toArray()
  };
  return new Blob([JSON.stringify(dados)], { type: 'application/json' });
}

export async function restaurarBackup(arquivo: File) {
  const d = JSON.parse(await arquivo.text());
  if (d.app !== 'planejamento-visitas') throw new Error('Este arquivo não é um backup do app.');
  await db.transaction('rw', [db.clientes, db.rotas, db.visitas, db.config], async () => {
    await Promise.all([db.clientes.clear(), db.rotas.clear(), db.visitas.clear(), db.config.clear()]);
    await db.clientes.bulkPut(d.clientes); await db.rotas.bulkPut(d.rotas);
    await db.visitas.bulkPut(d.visitas); await db.config.bulkPut(d.config);
  });
}

export { lerConfig };
