import { useEffect, useState } from 'react';
import { ativarAgenda, desativarAgenda, ouvirAgenda, sincronizarAgenda, type EstadoAgenda } from '../lib/agenda';
import { driveConfigurado } from '../lib/drive';

const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

export default function CartaoAgenda() {
  const [e, setE] = useState<EstadoAgenda | null>(null);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => ouvirAgenda(setE), []);
  if (!e || !driveConfigurado()) return null;
  const ligada = e.ativa && e.autorizada;

  return (
    <section className="cartao">
      <h2>📅 Lembretes de retorno</h2>
      {!ligada ? (
        <>
          <p className="nota-peq">Cada retorno combinado numa visita vira um evento na sua <b>Agenda Google</b>, às 08:00 do dia,
            com aviso <b>2 dias antes</b> e <b>no dia às 08:00</b>. O iPhone avisa pelo app Google Agenda (ou pelo Calendário, se a conta Google estiver nele).</p>
          <button className="btn btn-bloco" onClick={ativarAgenda}>Ativar lembretes na Agenda</button>
          <p className="nota-peq">Abre a página do Google para você permitir o acesso à agenda. O app só mexe nos eventos de retorno que ele mesmo cria.</p>
        </>
      ) : (
        <>
          <p className="nota-peq">✓ Ligado. Retornos vão para a Agenda com aviso 2 dias antes e no dia às 08:00.
            {e.eventos != null ? ` ${e.eventos} retorno(s) na agenda.` : ''} Última atualização: {hora(e.ultima)}.</p>
          <div className="botoes">
            <button className="btn btn-sec" disabled={ocupado} onClick={async () => { setOcupado(true); await sincronizarAgenda(true); setOcupado(false); }}>↻ Atualizar agora</button>
            <button className="btn-link" onClick={async () => {
              if (!confirm('Desligar os lembretes? Os retornos futuros criados pelo app saem da sua Agenda.')) return;
              setOcupado(true); await desativarAgenda(); setOcupado(false);
            }}>Desligar</button>
          </div>
        </>
      )}
      {e.erro && <div className="msg">{e.erro}</div>}
    </section>
  );
}
