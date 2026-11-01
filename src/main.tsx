import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Dexie from 'dexie';
import App from './App';
import './styles.css';
import { sincronizarAgenda } from './lib/agenda';
import { estaAplicandoRemoto, ouvirDrive, marcarPendente, reconectarSeExpirado, sincronizar, sincronizarSeVencida, tratarRetornoDoLogin } from './lib/drive';

async function iniciar() {
  // Volta do login do Google (#access_token=...) ou reconexão silenciosa quando o acesso venceu
  const voltouDoLogin = await tratarRetornoDoLogin();
  if (!voltouDoLogin && reconectarSeExpirado()) return; // indo ao Google; volta em instantes

  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

  // Depois de cada sincronização com o Drive, deixa a Agenda em dia com os retornos
  let ultimaVista: string | null = null;
  ouvirDrive((e) => { if (e.situacao === 'ok' && e.ultima !== ultimaVista) { ultimaVista = e.ultima; void sincronizarAgenda(); } });
  // Acabou de entrar no Google: sincroniza já. Senão, só se passaram 2 horas desde a última vez.
  void (voltouDoLogin ? sincronizar() : sincronizarSeVencida());
  // Alteração local: marca como pendente e envia 1 minuto depois (juntando as alterações desse minuto)
  Dexie.on('storagemutated', (partes: Record<string, unknown>) => {
    if (estaAplicandoRemoto()) return;
    const tabelas = Object.keys(partes).map((k) => k.split('/')[3]);
    if (tabelas.every((t) => t === 'geocache')) return;
    marcarPendente();
  });
  window.addEventListener('online', () => void sincronizarSeVencida());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void sincronizarSeVencida();
    else if (localStorage.getItem('drive-pendente')) void sincronizar(); // saindo do app: tenta enviar já o que falta
  });
  setInterval(() => { if (document.visibilityState === 'visible') void sincronizarSeVencida(); }, 5 * 60_000);
}

void iniciar();
