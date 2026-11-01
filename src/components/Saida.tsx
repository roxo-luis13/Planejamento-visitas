import { useState } from 'react';
import type { Config, Rota } from '../types';
import Folha from './Folha';
import { buscarLugares, definirHoraSaida, definirLocalPadrao, definirPartida, definirRetorno, obterGps, removerLocal, salvarLocal } from '../lib/acoes';

type Achado = { lat: number; lng: number; rotulo: string; endereco: string };

/** Cartão de saída na tela Rota: de onde sai, a que horas e se volta. */
export default function Saida({ rota, cfg }: { rota: Rota; cfg: Config }) {
  const [aberta, setAberta] = useState(false);
  const p = rota.partida;
  const ehPadrao = (lat: number, lng: number) => cfg.partidaPadrao?.lat === lat && cfg.partidaPadrao?.lng === lng;

  return (
    <div className="saida">
      <button className="saida-linha" onClick={() => setAberta(true)}>
        <span className="saida-icone">🏁</span>
        <span className="saida-texto">
          <small>Saída</small>
          <b>{p ? p.rotulo : 'Escolher ponto de saída'}</b>
        </span>
        <span className="saida-alterar">Alterar ›</span>
      </button>
      <div className="saida-opcoes">
        <label>Sair às <input type="time" value={rota.horaSaida ?? cfg.horaSaidaPadrao} onChange={(e) => e.target.value && definirHoraSaida(rota.data, e.target.value)} /></label>
        {p && <label className="check"><input type="checkbox" checked={rota.retornar} onChange={(e) => definirRetorno(rota.data, e.target.checked)} /> Voltar à saída no fim</label>}
      </div>
      {aberta && <EscolherSaida rota={rota} cfg={cfg} ehPadrao={ehPadrao} aoFechar={() => setAberta(false)} />}
    </div>
  );
}

function EscolherSaida({ rota, cfg, ehPadrao, aoFechar }: { rota: Rota; cfg: Config; ehPadrao: (lat: number, lng: number) => boolean; aoFechar: () => void }) {
  const [texto, setTexto] = useState('');
  const [achados, setAchados] = useState<Achado[] | null>(null);
  const [msg, setMsg] = useState('');
  const [guardar, setGuardar] = useState<Achado | null>(null);
  const [nome, setNome] = useState('');
  const [padrao, setPadrao] = useState(false);

  async function usarGps() {
    setMsg('Obtendo localização…');
    try {
      const g = await obterGps();
      await definirPartida(rota.data, { tipo: 'atual', lat: g.lat, lng: g.lng, rotulo: 'Minha localização' });
      aoFechar();
    } catch (e) { setMsg((e as Error).message); }
  }
  async function buscar() {
    setMsg('Buscando…'); setAchados(null);
    try {
      const r = await buscarLugares(texto);
      setAchados(r); setMsg(r.length ? '' : 'Não encontrei. Inclua cidade e UF (ex: "Rua X, 100, Taubaté SP").');
    } catch { setMsg('Sem internet agora.'); }
  }
  async function escolher(a: Achado) {
    await definirPartida(rota.data, { tipo: 'busca', lat: a.lat, lng: a.lng, rotulo: a.rotulo });
    aoFechar();
  }
  async function guardarEUsar() {
    if (!guardar) return;
    const l = await salvarLocal({ nome: nome.trim() || guardar.rotulo, lat: guardar.lat, lng: guardar.lng, endereco: guardar.endereco }, padrao);
    await definirPartida(rota.data, { tipo: 'local', lat: l.lat, lng: l.lng, rotulo: l.nome });
    aoFechar();
  }

  return (
    <Folha aberta aoFechar={aoFechar} titulo="De onde você sai?">
      <button className="btn btn-bloco" onClick={usarGps}>📍 Minha localização agora</button>

      {cfg.locais.length > 0 && <h3 className="sub-titulo">Meus locais</h3>}
      <ul className="lista-locais">
        {cfg.locais.map((l) => (
          <li key={l.id}>
            <button className="local-escolher" onClick={async () => { await definirPartida(rota.data, { tipo: 'local', lat: l.lat, lng: l.lng, rotulo: l.nome }); aoFechar(); }}>
              <b>{l.nome}</b><small>{l.endereco}</small>
            </button>
            <button className={`btn-icone peq ${ehPadrao(l.lat, l.lng) ? 'estrela' : ''}`} title="Usar como padrão nos próximos dias"
              onClick={() => definirLocalPadrao(ehPadrao(l.lat, l.lng) ? null : l)}>{ehPadrao(l.lat, l.lng) ? '★' : '☆'}</button>
            <button className="btn-icone peq" onClick={() => confirm(`Apagar "${l.nome}"?`) && removerLocal(l.id)}>✕</button>
          </li>
        ))}
      </ul>
      {cfg.locais.length > 0 && <p className="nota-peq">★ = saída padrão dos próximos dias.</p>}

      <h3 className="sub-titulo">Buscar endereço</h3>
      <div className="busca-linha">
        <input placeholder="Rua, número, cidade…" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && texto.trim() && buscar()} />
        <button className="btn" onClick={buscar} disabled={!texto.trim()}>Buscar</button>
      </div>
      {msg && <div className="msg">{msg}</div>}
      {achados?.map((a) => (
        <div key={`${a.lat},${a.lng}`} className="achado">
          <div><b>{a.rotulo}</b><small>{a.endereco}</small></div>
          <div className="botoes">
            <button className="btn btn-peq" onClick={() => escolher(a)}>Usar hoje</button>
            <button className="btn btn-sec btn-peq" onClick={() => { setGuardar(a); setNome(''); }}>Salvar local</button>
          </div>
        </div>
      ))}
      {guardar && (
        <div className="cartao destaque">
          <div className="linha-form"><label>Nome do local</label><input placeholder="Ex: Casa, Escritório" value={nome} onChange={(e) => setNome(e.target.value)} /></div>
          <label className="check"><input type="checkbox" checked={padrao} onChange={(e) => setPadrao(e.target.checked)} /> Usar como saída padrão nos próximos dias</label>
          <button className="btn btn-bloco" onClick={guardarEUsar}>Salvar e usar</button>
        </div>
      )}
      {rota.partida && <button className="btn-link" onClick={async () => { await definirPartida(rota.data, null); aoFechar(); }}>Sem ponto de saída</button>}
    </Folha>
  );
}
