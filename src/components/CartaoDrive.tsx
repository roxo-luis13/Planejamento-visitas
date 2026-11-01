import { useEffect, useState } from 'react';
import { driveConfigurado, entrar, ouvirDrive, sair, sincronizar, type EstadoDrive } from '../lib/drive';

const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

export default function CartaoDrive() {
  const [e, setE] = useState<EstadoDrive | null>(null);
  useEffect(() => ouvirDrive(setE), []);
  if (!e) return null;

  return (
    <section className="cartao">
      <h2>☁️ Google Drive</h2>
      {!driveConfigurado() ? (
        <p className="nota-peq">A conexão com o Google Drive ainda não foi ativada nesta versão do app.</p>
      ) : !e.email ? (
        <>
          <div className="alerta">⚠️ Sem o Google conectado, seus dados ficam <b>só neste aparelho</b>. Se trocar ou perder o iPhone, perde o que fez.</div>
          <p className="nota-peq">Entre com sua conta Google para guardar tudo no <b>seu Google Drive</b>: clientes, endereços confirmados,
            anotações, rotas e visitas. Assim você abre o app em outro aparelho e continua de onde parou.</p>
          <button className="btn btn-bloco btn-google" onClick={() => entrar(false)}><span className="g">G</span> Entrar com Google</button>
          <p className="nota-peq">O app só acessa os arquivos que ele mesmo cria (pasta "App Visitas"). A senha é digitada na página do Google, nunca no app.</p>
        </>
      ) : (
        <>
          <div className="drive-conta">
            <div><small>Conectado como</small><b>{e.email}</b></div>
            <span className={`drive-status ${e.situacao}`}>
              {e.situacao === 'ok' && '✓ Sincronizado'}
              {e.situacao === 'sincronizando' && '↻ Sincronizando…'}
              {e.situacao === 'offline' && '⏸ Sem internet'}
              {e.situacao === 'expirado' && '! Reconectar'}
              {e.situacao === 'erro' && '! Erro'}
            </span>
          </div>
          <p className="nota-peq">Última sincronização: {hora(e.ultima)}. As alterações vão para o Drive sozinhas, alguns segundos depois.</p>
          {e.situacao === 'expirado' && (
            <div className="alerta">O acesso ao Drive venceu (o Google pede a cada tempo). Toque para reconectar. Normalmente é automático.
              <button className="btn btn-peq" style={{ marginTop: 8 }} onClick={() => entrar(true)}>Reconectar</button></div>
          )}
          {e.mensagem && <div className="msg">{e.mensagem}</div>}
          <div className="botoes">
            <button className="btn btn-sec" disabled={e.situacao === 'sincronizando'} onClick={() => sincronizar()}>↻ Sincronizar agora</button>
            <button className="btn-link" onClick={() => confirm('Desconectar do Google Drive? Os dados continuam neste aparelho e no seu Drive.') && sair()}>Sair</button>
          </div>
        </>
      )}
      {e.mensagem && !e.email && <div className="msg">{e.mensagem}</div>}
    </section>
  );
}
