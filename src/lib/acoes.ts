import { atualizarCliente, db, lerConfig, obterRota, salvarConfig } from '../db';
import type { Cliente, Endereco, LocalSalvo, Partida, Rota, Visita } from '../types';
import { mesclar } from './mesclar';
import { otimizarOrdem } from './rota';
import { rotaGoogle } from './google';
import { hojeISO } from './texto';
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
async function salvarRota(r: Rota) { await db.rotas.put({ ...r, _em: Date.now() }); }

/** Qualquer mudança de paradas/saída invalida o cálculo do Google. */
function invalidar(r: Rota) { r.otimizadaEm = null; r.calculo = null; }

export async function alternarNaRota(data: string, codigo: string) {
  const r = await obterRota(data);
  const i = r.paradas.findIndex((p) => p.codigo === codigo);
  if (i >= 0) r.paradas.splice(i, 1);
  else r.paradas.push({ codigo, resultado: null, nota: '', checkinEm: null });
  invalidar(r);
  await salvarRota(r);
  if (i < 0) void iniciarFila(); // garante sugestão de endereço para quem entrou na rota
}

export async function moverParada(data: string, codigo: string, delta: number) {
  const r = await obterRota(data);
  const i = r.paradas.findIndex((p) => p.codigo === codigo);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= r.paradas.length) return;
  [r.paradas[i], r.paradas[j]] = [r.paradas[j], r.paradas[i]];
  invalidar(r);
  await salvarRota(r);
}

export async function definirPartida(data: string, partida: Partida | null, retornar?: boolean) {
  const r = await obterRota(data);
  r.partida = partida;
  if (retornar !== undefined) r.retornar = retornar;
  invalidar(r);
  await salvarRota(r);
}

export async function definirRetorno(data: string, retornar: boolean) {
  const r = await obterRota(data);
  r.retornar = retornar;
  invalidar(r);
  await salvarRota(r);
}

export async function definirHoraSaida(data: string, hora: string) {
  const r = await obterRota(data);
  r.horaSaida = hora;
  invalidar(r);
  await salvarRota(r);
  await salvarConfig({ horaSaidaPadrao: hora }); // próximo dia novo já vem com esse horário
}

// ---------- Locais salvos (saída) ----------
export async function salvarLocal(l: Omit<LocalSalvo, 'id'>, padrao: boolean) {
  const cfg = await lerConfig();
  const novo = { ...l, id: crypto.randomUUID() };
  await salvarConfig({
    locais: [...cfg.locais, novo],
    ...(padrao || !cfg.partidaPadrao ? { partidaPadrao: { lat: l.lat, lng: l.lng, rotulo: l.nome } } : {})
  });
  return novo;
}
export async function removerLocal(id: string) {
  const cfg = await lerConfig();
  await salvarConfig({ locais: cfg.locais.filter((l) => l.id !== id) });
}
export async function definirLocalPadrao(l: { lat: number; lng: number; nome: string } | null) {
  await salvarConfig({ partidaPadrao: l ? { lat: l.lat, lng: l.lng, rotulo: l.nome } : null });
}

function horarioSaida(r: Rota, temFeitas: boolean): Date {
  const agora = new Date();
  if (r.data === hojeISO() && temFeitas) return agora;
  const [h, m] = (r.horaSaida ?? '08:00').split(':').map(Number);
  const [a, mes, d] = r.data.split('-').map(Number);
  const t = new Date(a, mes - 1, d, h, m);
  return t < agora ? agora : t;
}

/**
 * Otimiza (ou só recalcula os tempos de) as visitas ainda não feitas.
 * Com chave do Google: ruas reais + trânsito. Sem chave: estimativa em linha reta.
 * As visitas já registradas ficam no topo; o ponto de partida passa a ser a última visita feita.
 */
export async function otimizarRota(data: string, otimizar = true) {
  const cfg = await lerConfig();
  const r = await obterRota(data);
  const clientes = new Map((await db.clientes.bulkGet(r.paradas.map((p) => p.codigo))).filter(Boolean).map((c) => [c!.codigo, c!]));
  const feitas = r.paradas.filter((p) => p.resultado);
  const abertas = r.paradas.filter((p) => !p.resultado);
  const comLocal = abertas.filter((p) => clientes.get(p.codigo)?.local);
  const semLocal = abertas.filter((p) => !clientes.get(p.codigo)?.local);
  const ultimaFeita = [...feitas].reverse().map((p) => clientes.get(p.codigo)?.local).find(Boolean);
  const origem = ultimaFeita ?? r.partida;
  const voltar = r.retornar && !!r.partida;
  const pts = comLocal.map((p) => clientes.get(p.codigo)!.local!);

  if (cfg.googleKey && origem && pts.length) {
    // Sem volta: escolhe a última parada do dia pela estimativa, o Google ordena o resto
    const fimFixo = voltar ? undefined : otimizar ? otimizarOrdem(pts, origem, false).at(-1) : pts.length - 1;
    const saida = horarioSaida(r, feitas.length > 0);
    const g = await rotaGoogle({ chave: cfg.googleKey, origem, paradas: pts, voltar, retorno: r.partida ?? undefined, otimizar, fimFixo, saida });
    const ordenadas = g.ordem.map((i) => comLocal[i]);
    r.paradas = [...feitas, ...ordenadas, ...semLocal];
    r.calculo = {
      em: new Date().toISOString(), saidaEm: saida.toISOString(), codigos: ordenadas.map((p) => p.codigo), voltar,
      pernas: g.pernas, distM: g.distM, durS: g.durS, semTransitoS: g.semTransitoS, polyline: g.polyline,
      origem: { lat: origem.lat, lng: origem.lng }
    };
    r.otimizadaEm = r.calculo.em;
    await salvarRota(r);
    return { semLocal: semLocal.length, google: true };
  }

  if (otimizar) {
    const ordem = otimizarOrdem(pts, origem ?? null, voltar);
    r.paradas = [...feitas, ...ordem.map((i) => comLocal[i]), ...semLocal];
  }
  r.calculo = null;
  r.otimizadaEm = new Date().toISOString();
  await salvarRota(r);
  return { semLocal: semLocal.length, google: false };
}

/** Dados preenchidos no registro da visita (nenhum é obrigatório). */
export type DadosVisita = Omit<Visita, 'id' | 'codigo' | 'data' | 'em' | 'removido' | '_em'> & { lancarRetornoNaRota?: boolean };

async function colocarNaRota(dia: string, codigo: string, nota: string) {
  const r = await obterRota(dia);
  if (r.paradas.some((x) => x.codigo === codigo)) return;
  r.paradas.push({ codigo, resultado: null, nota, checkinEm: null });
  invalidar(r);
  await salvarRota(r);
}

/** Grava (ou desfaz, com dados = null) a visita de um cliente num dia. */
export async function registrarVisita(data: string, codigo: string, dados: DadosVisita | null) {
  const r = await obterRota(data);
  let p = r.paradas.find((x) => x.codigo === codigo);
  if (!p && dados) { // visita fora da rota (ex: registrada pela ficha do cliente)
    p = { codigo, resultado: null, nota: '', checkinEm: null };
    r.paradas.push(p);
  }
  if (!p) return;
  const agora = new Date().toISOString();
  const id = `${codigo}|${data}`;
  const anterior = await db.historico.get(id);
  p.resultado = dados ? dados.resultado : null;
  p.nota = dados?.nota ?? '';
  if (!dados) p.checkinEm = null;
  else p.checkinEm = p.checkinEm ?? dados.chegadaEm ?? agora;
  await db.transaction('rw', db.rotas, db.historico, async () => {
    await salvarRota(r);
    if (dados) {
      const { lancarRetornoNaRota: _ignorar, ...resto } = dados;
      void _ignorar;
      await db.historico.put({
        ...resto, id, codigo, data,
        chegadaEm: p!.checkinEm, saidaEm: dados.saidaEm ?? anterior?.saidaEm ?? agora,
        em: anterior && !anterior.removido ? anterior.em : agora, removido: false, _em: Date.now()
      });
    } else {
      // desfazer não apaga: marca como removido para os outros aparelhos saberem
      await db.historico.put({ ...(anterior ?? { id, codigo, data, resultado: 'visitado' as const, nota: '', em: agora }), removido: true, _em: Date.now() });
    }
  });
  if (dados?.retorno && dados.lancarRetornoNaRota && dados.retorno !== data) {
    const motivo = dados.resultado === 'reagendado' ? 'Reagendado' : 'Retorno combinado';
    await colocarNaRota(dados.retorno, codigo, `${motivo} em ${data.split('-').reverse().join('/')}${dados.nota ? `: ${dados.nota}` : ''}`);
  }
}

/** "Cheguei": marca a chegada e, se possível, a posição do GPS. */
export async function marcarChegada(data: string, codigo: string) {
  const r = await obterRota(data);
  const p = r.paradas.find((x) => x.codigo === codigo);
  if (!p) return null;
  p.checkinEm = new Date().toISOString();
  await salvarRota(r);
  return p.checkinEm;
}

/** Saída detectada pelo GPS: guarda o horário para a duração da visita ficar certa mesmo registrando depois. */
export async function marcarSaida(data: string, codigo: string) {
  const r = await obterRota(data);
  const p = r.paradas.find((x) => x.codigo === codigo);
  if (!p || p.resultado) return;
  p.saidaEm = new Date().toISOString();
  await salvarRota(r);
}

/** Última visita (não desfeita) de um cliente, para sugerir o contato. */
export async function ultimaVisita(codigo: string): Promise<Visita | undefined> {
  const vs = (await db.historico.where('codigo').equals(codigo).toArray()).filter((v) => !v.removido);
  return vs.sort((a, b) => (a.data < b.data ? 1 : -1))[0];
}

// ---------- Localização do cliente ----------
export async function confirmarLocal(codigo: string, lat: number, lng: number, fonte: string) {
  await atualizarCliente(codigo, {
    local: { lat, lng, precisao: 'confirmado', fonte, atualizadoEm: new Date().toISOString() },
    geoStatus: 'ok', avisoCep: null
  });
}

export async function salvarEndereco(c: Cliente, e: Endereco): Promise<boolean> {
  const p = await localizarEndereco(e);
  const manterGps = c.local?.precisao === 'confirmado';
  await atualizarCliente(c.codigo, {
    endereco: e,
    avisoCep: null,
    ...(p && !manterGps
      ? { local: { ...p, precisao: 'informado' as const, fonte: 'Endereço informado pelo Alexandre', atualizadoEm: new Date().toISOString() }, geoStatus: 'ok' as const }
      : {})
  });
  return !!p;
}

export async function refazerSugestao(codigo: string) {
  await atualizarCliente(codigo, { local: null, endereco: null, geoStatus: 'pendente', avisoCep: null });
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
    historico: await db.historico.toArray(), config: await db.config.toArray()
  };
  return new Blob([JSON.stringify(dados)], { type: 'application/json' });
}

export async function restaurarBackup(arquivo: File) {
  const d = JSON.parse(await arquivo.text());
  if (d.app !== 'planejamento-visitas') throw new Error('Este arquivo não é um backup do app.');
  // backups antigos têm "visitas" com id numérico
  const historico = d.historico ?? (d.visitas ?? []).map((v: Visita) => ({ ...v, id: `${v.codigo}|${v.data}` }));
  const em = Date.now();
  await db.transaction('rw', [db.clientes, db.rotas, db.historico, db.config], async () => {
    await Promise.all([db.clientes.clear(), db.rotas.clear(), db.historico.clear(), db.config.clear()]);
    // restaurar conta como alteração nova (vence na sincronização)
    await db.clientes.bulkPut(d.clientes.map((c: Cliente) => ({ ...c, _emPlanilha: em, _emUsuario: em })));
    await db.rotas.bulkPut(d.rotas.map((r: Rota) => ({ ...r, _em: em })));
    await db.historico.bulkPut(historico.map((v: Visita) => ({ ...v, _em: em })));
    await db.config.bulkPut(d.config.map((c: { chave: string; valor: unknown }) => ({ ...c, _em: em })));
  });
}

export { lerConfig };

// ---------- Busca de endereço para a saída ----------
export async function buscarLugares(texto: string): Promise<{ lat: number; lng: number; rotulo: string; endereco: string }[]> {
  const cfg = await lerConfig();
  if (cfg.googleKey) {
    const { buscarLugaresGoogle } = await import('./google');
    try { return await buscarLugaresGoogle(cfg.googleKey, texto); } catch { /* tenta o gratuito */ }
  }
  const { buscarLugar } = await import('./geocodificar');
  const r = await buscarLugar(texto);
  return r ? [{ lat: r.lat, lng: r.lng, rotulo: texto, endereco: r.rotulo }] : [];
}

/** Tira da rota todos os clientes ainda não visitados (os já registrados ficam). */
export async function desmarcarTodos(data: string) {
  const r = await obterRota(data);
  const antes = r.paradas.length;
  r.paradas = r.paradas.filter((p) => p.resultado);
  invalidar(r);
  await salvarRota(r);
  return antes - r.paradas.length;
}
