import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Dexie from 'dexie';
import App from './App';
import './styles.css';
import { agendarSincronizacao, estaAplicandoRemoto, reconectarSeExpirado, sincronizar, tratarRetornoDoLogin } from './lib/drive';
import { ouvirFila } from './lib/filaGeo';

let buscandoEnderecos = false;
ouvirFila((e) => { buscandoEnderecos = e.rodando; });

async function iniciar() {
  // Volta do login do Google (#access_token=...) ou reconexão silenciosa quando o acesso venceu
  const voltouDoLogin = await tratarRetornoDoLogin();
  if (!voltouDoLogin && reconectarSeExpirado()) return; // indo ao Google; volta em instantes

  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

  void sincronizar();
  // Toda alteração local agenda um envio ao Drive (ignora o cache de endereços e o que veio do próprio Drive)
  Dexie.on('storagemutated', (partes: Record<string, unknown>) => {
    if (estaAplicandoRemoto()) return;
    const tabelas = Object.keys(partes).map((k) => k.split('/')[3]);
    if (tabelas.every((t) => t === 'geocache')) return;
    agendarSincronizacao(buscandoEnderecos ? 60_000 : 8_000);
  });
  window.addEventListener('online', () => void sincronizar());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void sincronizar(); });
  setInterval(() => { if (document.visibilityState === 'visible') void sincronizar(); }, 5 * 60_000);
}

void iniciar();
