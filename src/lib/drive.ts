import { db } from '../db';
import { GOOGLE_CLIENT_ID } from '../config';
import { diferencas, mesclarPacotes, mesmoConteudo, type Pacote } from './sincronizar';

/**
 * Login com Google + dados no Google Drive do Alexandre.
 * - Login por redirecionamento (funciona melhor no app instalado do iPhone que janelas pop-up).
 * - Permissão "drive.file": o app só enxerga os arquivos que ele mesmo criou.
 * - Arquivo "visitas-dados.json" na pasta "App Visitas" do Drive.
 */

const ESCOPO = 'https://www.googleapis.com/auth/drive.file openid email';
const NOME_ARQUIVO = 'visitas-dados.json';
const NOME_PASTA = 'App Visitas';
const K_CONTA = 'drive-conta';      // { email, token, expira, arquivoId }
const K_ESTADO = 'drive-estado-oauth';
const K_TENTOU = 'drive-tentou-silencioso';

export interface Conta { email: string; token: string; expira: number; arquivoId?: string }

export type Situacao = 'desligado' | 'sem-config' | 'sincronizando' | 'ok' | 'expirado' | 'erro' | 'offline';
export interface EstadoDrive { situacao: Situacao; email: string | null; ultima: string | null; mensagem: string | null; pendente: boolean }

/** Sem alterações, sincroniza a cada 2 horas; com alterações, 1 minuto depois (ou na hora, pelo botão "Sincronizar agora"). */
export const INTERVALO_AUTOMATICO = 2 * 60 * 60_000;
const K_PENDENTE = 'drive-pendente';

const ouvintes = new Set<(e: EstadoDrive) => void>();
let estado: EstadoDrive = {
  situacao: 'desligado', email: null, ultima: localStorage.getItem('drive-ultima'), mensagem: null, pendente: !!localStorage.getItem(K_PENDENTE)
};
function publicar(p: Partial<EstadoDrive>) { estado = { ...estado, ...p }; ouvintes.forEach((f) => f(estado)); }
export function ouvirDrive(f: (e: EstadoDrive) => void) { ouvintes.add(f); f(estado); return () => { ouvintes.delete(f); }; }

export const driveConfigurado = () => !!GOOGLE_CLIENT_ID;
export function lerConta(): Conta | null {
  try { return JSON.parse(localStorage.getItem(K_CONTA) ?? 'null'); } catch { return null; }
}
function gravarConta(c: Conta | null) { if (c) localStorage.setItem(K_CONTA, JSON.stringify(c)); else localStorage.removeItem(K_CONTA); }
const tokenValido = (c: Conta | null) => !!c && c.expira > Date.now() + 60_000;

function enderecoDoApp() { return location.origin + location.pathname.replace(/index\.html$/, ''); }

/** Vai para a página de login do Google. `silencioso`: sem telas se já autorizou antes. */
export function entrar(silencioso = false) {
  const estadoOauth = crypto.randomUUID();
  localStorage.setItem(K_ESTADO, estadoOauth);
  sessionStorage.setItem('drive-voltar-hash', location.hash);
  const conta = lerConta();
  const p = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID, redirect_uri: enderecoDoApp(), response_type: 'token', scope: ESCOPO,
    include_granted_scopes: 'true', state: estadoOauth, prompt: silencioso ? 'none' : 'select_account'
  });
  if (conta?.email) p.set('login_hint', conta.email);
  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${p}`);
}

/** Na abertura do app: lê a resposta do Google (#access_token=...). Retorna true se tratou um retorno. */
export async function tratarRetornoDoLogin(): Promise<boolean> {
  if (!location.hash.includes('access_token=') && !location.hash.includes('error=')) return false;
  const r = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', enderecoDoApp() + (sessionStorage.getItem('drive-voltar-hash') ?? ''));
  const esperado = localStorage.getItem(K_ESTADO);
  localStorage.removeItem(K_ESTADO);
  if (r.get('state') !== esperado) { publicar({ situacao: 'erro', mensagem: 'Resposta de login inválida. Tente entrar de novo.' }); return true; }
  if (r.get('error')) {
    publicar({ situacao: lerConta() ? 'expirado' : 'desligado', mensagem: r.get('error') === 'access_denied' ? 'Login cancelado.' : null });
    return true;
  }
  const token = r.get('access_token')!;
  const expira = Date.now() + Number(r.get('expires_in') ?? 3600) * 1000;
  let email = lerConta()?.email ?? '';
  try {
    const u = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${token}` } });
    if (u.ok) email = (await u.json()).email ?? email;
  } catch { /* segue */ }
  const anterior = lerConta();
  gravarConta({ email, token, expira, arquivoId: anterior?.email === email ? anterior.arquivoId : undefined });
  sessionStorage.removeItem(K_TENTOU);
  publicar({ email, mensagem: null });
  return true;
}

export function sair() {
  gravarConta(null);
  localStorage.removeItem('drive-ultima');
  publicar({ situacao: 'desligado', email: null, ultima: null, mensagem: null, pendente: false });
}

// ---------------- API do Drive ----------------
class SemToken extends Error {}

async function api(caminho: string, init: RequestInit = {}, upload = false): Promise<Response> {
  const conta = lerConta();
  if (!tokenValido(conta)) throw new SemToken();
  const r = await fetch(`https://www.googleapis.com/${upload ? 'upload/' : ''}drive/v3/${caminho}`, {
    ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${conta!.token}` }
  });
  if (r.status === 401) { gravarConta({ ...conta!, expira: 0 }); throw new SemToken(); }
  if (!r.ok) throw new Error(`Drive respondeu ${r.status}`);
  return r;
}

async function acharOuCriarArquivo(conteudo: string): Promise<{ id: string; criado: boolean }> {
  const conta = lerConta()!;
  if (conta.arquivoId) return { id: conta.arquivoId, criado: false };
  const q = encodeURIComponent(`name='${NOME_ARQUIVO}' and trashed=false`);
  const lista = await (await api(`files?q=${q}&spaces=drive&fields=files(id,modifiedTime)&orderBy=modifiedTime desc`)).json();
  let id: string | undefined = lista.files?.[0]?.id;
  let criado = false;
  if (!id) {
    const pasta = await (await api('files?fields=id', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: NOME_PASTA, mimeType: 'application/vnd.google-apps.folder' })
    })).json();
    const limite = 'limite' + crypto.randomUUID();
    const corpo = `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify({ name: NOME_ARQUIVO, parents: [pasta.id], mimeType: 'application/json' }) +
      `\r\n--${limite}\r\nContent-Type: application/json\r\n\r\n${conteudo}\r\n--${limite}--`;
    id = (await (await api('files?uploadType=multipart&fields=id', {
      method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${limite}` }, body: corpo
    }, true)).json()).id as string;
    criado = true;
  }
  gravarConta({ ...lerConta()!, arquivoId: id });
  return { id, criado };
}

// ---------------- Sincronização ----------------
export async function pacoteLocal(): Promise<Pacote> {
  return {
    app: 'planejamento-visitas', versao: 2, em: new Date().toISOString(),
    clientes: await db.clientes.toArray(), rotas: await db.rotas.toArray(),
    historico: await db.historico.toArray(), config: await db.config.toArray()
  };
}

let aplicandoRemoto = false;
export const estaAplicandoRemoto = () => aplicandoRemoto;

export async function aplicarNoAparelho(atual: Pacote, novo: Pacote) {
  const c = diferencas(atual.clientes, novo.clientes, (x) => x.codigo);
  const r = diferencas(atual.rotas, novo.rotas, (x) => x.data);
  const h = diferencas(atual.historico, novo.historico, (x) => x.id);
  const g = diferencas(atual.config, novo.config, (x) => x.chave);
  if (!c.length && !r.length && !h.length && !g.length) return 0;
  aplicandoRemoto = true;
  try {
    await db.transaction('rw', [db.clientes, db.rotas, db.historico, db.config], async () => {
      if (c.length) await db.clientes.bulkPut(c);
      if (r.length) await db.rotas.bulkPut(r);
      if (h.length) await db.historico.bulkPut(h);
      if (g.length) await db.config.bulkPut(g);
    });
  } finally { setTimeout(() => { aplicandoRemoto = false; }, 0); }
  return c.length + r.length + h.length + g.length;
}

let emAndamento: Promise<void> | null = null;
let deNovo = false;

export function sincronizar(): Promise<void> {
  if (emAndamento) { deNovo = true; return emAndamento; }
  emAndamento = (async () => {
    try {
      do { deNovo = false; await sincronizarUmaVez(); } while (deNovo);
    } finally { emAndamento = null; }
  })();
  return emAndamento;
}

async function sincronizarUmaVez() {
  if (!driveConfigurado()) { publicar({ situacao: 'sem-config' }); return; }
  const conta = lerConta();
  if (!conta) { publicar({ situacao: 'desligado' }); return; }
  publicar({ email: conta.email });
  if (!navigator.onLine) { publicar({ situacao: 'offline' }); return; }
  if (!tokenValido(conta)) { publicar({ situacao: 'expirado' }); return; }
  publicar({ situacao: 'sincronizando', mensagem: null });
  // alterações feitas durante o envio marcam "pendente" de novo
  localStorage.removeItem(K_PENDENTE);
  try {
    const local = await pacoteLocal();
    const { id, criado } = await acharOuCriarArquivo(JSON.stringify(local));
    let remoto: Pacote | null = null;
    if (!criado) {
      const txt = await (await api(`files/${id}?alt=media`)).text();
      try { remoto = txt ? JSON.parse(txt) : null; } catch { remoto = null; }
      if (remoto && remoto.app !== 'planejamento-visitas') remoto = null;
    }
    const juntado = remoto ? mesclarPacotes(local, remoto) : local;
    await aplicarNoAparelho(local, juntado);
    if (!criado && !mesmoConteudo(remoto, juntado)) {
      await api(`files/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(juntado) }, true);
    }
    const ultima = new Date().toISOString();
    localStorage.setItem('drive-ultima', ultima);
    publicar({ situacao: 'ok', ultima, mensagem: null, pendente: !!localStorage.getItem(K_PENDENTE) });
  } catch (e) {
    if (estado.pendente) localStorage.setItem(K_PENDENTE, '1');
    if (e instanceof SemToken) publicar({ situacao: 'expirado' });
    else if (!navigator.onLine) publicar({ situacao: 'offline' });
    else {
      // arquivo apagado no Drive: esquece o id e cria de novo na próxima vez
      if (/404/.test((e as Error).message)) gravarConta({ ...lerConta()!, arquivoId: undefined });
      publicar({ situacao: 'erro', mensagem: (e as Error).message });
    }
  }
}

/** Já passou o intervalo automático desde a última sincronização? */
export function sincronizacaoVencida(agora = Date.now()): boolean {
  const u = localStorage.getItem('drive-ultima');
  return !u || agora - Date.parse(u) >= INTERVALO_AUTOMATICO;
}

/** Sincroniza se já passaram 2 horas ou se ficou alteração sem enviar; senão apenas mostra a situação da conta. */
export function sincronizarSeVencida(): Promise<void> {
  if (sincronizacaoVencida() || (localStorage.getItem(K_PENDENTE) && !timer && lerConta())) return sincronizar();
  const conta = lerConta();
  if (!driveConfigurado()) publicar({ situacao: 'sem-config' });
  else if (!conta) publicar({ situacao: 'desligado' });
  else if (estado.situacao === 'desligado') publicar({ situacao: navigator.onLine ? 'ok' : 'offline', email: conta.email });
  return Promise.resolve();
}

/** Botão "Sincronizar agora": se o acesso venceu, reconecta (volta sozinho) e sincroniza. */
export function sincronizarAgora(): Promise<void> {
  const c = lerConta();
  if (c && !tokenValido(c) && navigator.onLine) { sessionStorage.setItem(K_TENTOU, '1'); entrar(true); return Promise.resolve(); }
  return sincronizar();
}

/** Espera depois de uma alteração, juntando as que vierem nesse tempo num envio só. */
export const ESPERA_APOS_MUDANCA = 60_000;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Marca que há alterações locais e agenda o envio para daqui a 1 minuto. */
export function marcarPendente() {
  if (!lerConta()) return;
  localStorage.setItem(K_PENDENTE, '1');
  if (!estado.pendente) publicar({ pendente: true });
  if (!timer) timer = setTimeout(() => { timer = null; void sincronizar(); }, ESPERA_APOS_MUDANCA);
}

/** Reconecta sem telas (se o Google permitir) quando há algo a enviar ou a sincronização está vencida — uma vez por sessão. */
export function reconectarSeExpirado(): boolean {
  const c = lerConta();
  if (!driveConfigurado() || !c || tokenValido(c) || !navigator.onLine) return false;
  if (!sincronizacaoVencida() && !localStorage.getItem(K_PENDENTE)) return false;
  if (sessionStorage.getItem(K_TENTOU)) return false;
  sessionStorage.setItem(K_TENTOU, '1');
  entrar(true);
  return true;
}
