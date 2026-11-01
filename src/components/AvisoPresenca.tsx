import { useEffect, useState } from 'react';
import { db, obterRota } from '../db';
import type { Cliente, Parada } from '../types';
import { marcarChegada } from '../lib/acoes';
import { fecharAviso, ouvirAvisos, type Aviso } from '../lib/presenca';
import RegistroVisita from './RegistroVisita';

const hora = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Cartão flutuante com o que o GPS detectou (chegada, saída, "você está aqui?"). */
export default function AvisoPresenca() {
  const [a, setA] = useState<Aviso | null>(null);
  const [registro, setRegistro] = useState<{ data: string; cliente: Cliente; parada: Parada | undefined } | null>(null);
  useEffect(() => ouvirAvisos(setA), []);
  // a chegada some sozinha depois de alguns segundos
  useEffect(() => {
    if (a?.tipo !== 'chegou') return;
    const t = setTimeout(fecharAviso, 10_000);
    return () => clearTimeout(t);
  }, [a]);

  async function registrar(x: Aviso) {
    const cliente = await db.clientes.get(x.codigo);
    const parada = (await obterRota(x.data)).paradas.find((p) => p.codigo === x.codigo);
    fecharAviso();
    if (cliente) setRegistro({ data: x.data, cliente, parada });
  }

  return (
    <>
      {a && (
        <div className={`aviso-presenca ${a.tipo}`} role="status">
          {a.tipo === 'chegou' && <p>📍 Chegada na <b>{a.nome}</b> marcada às {hora(a.em)}.</p>}
          {a.tipo === 'perto' && <p>📍 Você está na <b>{a.nome}</b>?</p>}
          {a.tipo === 'saiu' && <p>👋 Saiu da <b>{a.nome}</b>. Registrar a visita?</p>}
          <div className="botoes">
            {a.tipo === 'perto' && <button className="btn btn-peq" onClick={async () => { await marcarChegada(a.data, a.codigo); fecharAviso(); }}>Cheguei</button>}
            {a.tipo !== 'chegou' && <button className={`btn btn-peq ${a.tipo === 'perto' ? 'btn-sec' : ''}`} onClick={() => registrar(a)}>✔️ Registrar visita</button>}
            {a.tipo === 'chegou' && <button className="btn btn-sec btn-peq" onClick={() => registrar(a)}>Registrar agora</button>}
            <button className="btn-link" onClick={fecharAviso}>{a.tipo === 'perto' ? 'Não' : a.tipo === 'saiu' ? 'Depois' : 'OK'}</button>
          </div>
        </div>
      )}
      {registro && (
        <RegistroVisita data={registro.data} cliente={registro.cliente} checkinEm={registro.parada?.checkinEm ?? null}
          saidaEm={registro.parada?.saidaEm} aoFechar={() => setRegistro(null)} />
      )}
    </>
  );
}
