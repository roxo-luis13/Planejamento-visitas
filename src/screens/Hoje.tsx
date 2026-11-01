import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, lerConfig } from '../db';
import type { Cliente, Parada, Resultado } from '../types';
import { RESULTADOS } from '../types';
import { definirPartida, definirRetorno, moverParada, alternarNaRota, obterGps, otimizarRota, registrarResultado } from '../lib/acoes';
import { estimar } from '../lib/rota';
import { linksRotaGoogle } from '../lib/navegar';
import { hojeISO, nomeDia, somarDias, titulo } from '../lib/texto';
import Mapa, { type Marcador } from '../components/Mapa';
import Folha from '../components/Folha';
import BotaoNavegar from '../components/Navegar';
import { PRECISOES, SeloFinanceiro, SeloLocal, SeloPrioridade } from '../components/Selos';

function horas(min: number) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
}

export default function Hoje({ data, setData, abrirCliente, irCarteira }: {
  data: string; setData: (d: string) => void; abrirCliente: (c: string) => void; irCarteira: () => void;
}) {
  const rota = useLiveQuery(() => db.rotas.get(data), [data]);
  const cfg = useLiveQuery(() => lerConfig(), []);
  const codigos = rota?.paradas.map((p) => p.codigo) ?? [];
  const clientesArr = useLiveQuery(() => db.clientes.bulkGet(codigos), [codigos.join(',')]) ?? [];
  const clientes = useMemo(() => new Map(clientesArr.filter((c): c is Cliente => !!c).map((c) => [c.codigo, c])), [clientesArr]);
  const [msg, setMsg] = useState('');
  const [registrando, setRegistrando] = useState<Parada | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const paradas = rota?.paradas ?? [];
  const partida = rota?.partida ?? null;
  const retornar = rota?.retornar ?? true;
  const comLocal = paradas.map((p) => clientes.get(p.codigo)).filter((c): c is Cliente => !!c?.local);
  const est = cfg ? estimar(comLocal.map((c) => c.local!), partida, retornar, cfg.velocidadeMedia, cfg.minutosPorVisita) : null;
  const aproximados = comLocal.filter((c) => PRECISOES[c.local!.precisao].alerta).length;
  const semLocal = paradas.length - comLocal.length;
  const feitas = paradas.filter((p) => p.resultado).length;
  /** km do trecho que chega neste cliente (a partir da parada anterior ou da saída). */
  const kmAte = (c: Cliente): number | null => {
    const k = comLocal.indexOf(c);
    if (!est || k < 0) return null;
    const t = est.trechosKm[partida ? k : k - 1];
    return t === undefined ? null : t;
  };

  const marcadores: Marcador[] = useMemo(() => {
    const m: Marcador[] = [];
    paradas.forEach((p, i) => {
      const c = clientes.get(p.codigo);
      if (!c?.local) return;
      m.push({ id: c.codigo, lat: c.local.lat, lng: c.local.lng, rotulo: String(i + 1), titulo: c.fantasia,
        cor: p.resultado ? '#80868b' : '#0b5cad', aproximado: PRECISOES[c.local.precisao].alerta });
    });
    if (partida) m.push({ id: '_partida', lat: partida.lat, lng: partida.lng, rotulo: 'P', cor: '#1e8e3e', titulo: partida.rotulo });
    return m;
  }, [paradas, clientes, partida]);
  const linha = useMemo(() => {
    const pts = paradas.map((p) => clientes.get(p.codigo)?.local).filter((l): l is NonNullable<typeof l> => !!l);
    return [...(partida ? [partida] : []), ...pts, ...(partida && retornar ? [partida] : [])];
  }, [paradas, clientes, partida, retornar]);

  async function escolherPartida(tipo: string) {
    setMsg('');
    if (tipo === 'nenhuma') return definirPartida(data, null);
    if (tipo === 'padrao') {
      if (!cfg?.partidaPadrao) { setMsg('Cadastre o ponto de partida padrão em Ajustes.'); return; }
      return definirPartida(data, { tipo: 'padrao', ...cfg.partidaPadrao });
    }
    try {
      setOcupado(true);
      const g = await obterGps();
      await definirPartida(data, { tipo: 'atual', lat: g.lat, lng: g.lng, rotulo: 'Minha localização' });
    } catch (e) { setMsg((e as Error).message); } finally { setOcupado(false); }
  }

  async function otimizar() {
    setOcupado(true);
    const r = await otimizarRota(data);
    setOcupado(false);
    setMsg(r.semLocal ? `${r.semLocal} cliente(s) sem localização ficaram no fim da lista.` : 'Ordem otimizada ✓');
  }

  const linksGoogle = linksRotaGoogle(paradas.filter((p) => !p.resultado).map((p) => clientes.get(p.codigo)?.local).filter((l): l is NonNullable<typeof l> => !!l), partida, retornar);

  return (
    <div>
      <div className="nav-dia">
        <button className="btn-icone" onClick={() => setData(somarDias(data, -1))}>‹</button>
        <div className="nav-dia-meio">
          <div className="nav-dia-titulo">{data === hojeISO() ? 'Hoje' : nomeDia(data).split(',')[0]}</div>
          <input type="date" value={data} onChange={(e) => e.target.value && setData(e.target.value)} />
        </div>
        <button className="btn-icone" onClick={() => setData(somarDias(data, 1))}>›</button>
      </div>

      {!paradas.length ? (
        <div className="vazio">
          <p>Nenhuma visita planejada para {nomeDia(data)}.</p>
          <button className="btn" onClick={irCarteira}>Escolher clientes na Carteira</button>
        </div>
      ) : (
        <>
          <div className="cartao">
            <div className="linha-form">
              <label>Saída</label>
              <select value={partida?.tipo ?? 'nenhuma'} onChange={(e) => escolherPartida(e.target.value)} disabled={ocupado}>
                <option value="nenhuma">Sem ponto de partida</option>
                <option value="padrao">{cfg?.partidaPadrao ? `Padrão: ${cfg.partidaPadrao.rotulo.slice(0, 40)}` : 'Ponto padrão (configurar)'}</option>
                <option value="atual">Minha localização agora</option>
              </select>
            </div>
            {partida && (
              <label className="check"><input type="checkbox" checked={retornar} onChange={(e) => definirRetorno(data, e.target.checked)} /> Voltar ao ponto de saída no fim</label>
            )}
            <div className="resumo-rota">
              <div><b>{paradas.length}</b><span>visitas</span></div>
              <div><b>{feitas}</b><span>feitas</span></div>
              <div><b>{est ? `~${Math.round(est.km)}` : '—'}</b><span>km</span></div>
              <div><b>{est ? horas(est.minutosTotal) : '—'}</b><span>dia total</span></div>
            </div>
            <div className="nota-peq">Distância e tempo são estimativas (linha reta × 1,35, {cfg?.velocidadeMedia} km/h, {cfg?.minutosPorVisita} min por visita).</div>
            {(aproximados > 0 || semLocal > 0) && (
              <div className="alerta">
                ⚠️ {aproximados > 0 && <>{aproximados} parada(s) com endereço <b>sugerido/aproximado</b>. </>}
                {semLocal > 0 && <>{semLocal} sem localização ainda. </>}
                Confirme na visita para a rota ficar precisa.
              </div>
            )}
            <div className="botoes">
              <button className="btn" onClick={otimizar} disabled={ocupado}>⚡ Otimizar ordem</button>
              {linksGoogle.map((l, i) => (
                <a key={l} className="btn btn-sec" href={l} target="_blank" rel="noreferrer">🗺️ Rota no Google{linksGoogle.length > 1 ? ` (parte ${i + 1})` : ''}</a>
              ))}
            </div>
            {msg && <div className="msg">{msg}</div>}
          </div>

          <Mapa marcadores={marcadores} linha={linha} aoTocar={(id) => id !== '_partida' && abrirCliente(id)} />

          <ol className="lista paradas">
            {paradas.map((p, i) => {
              const c = clientes.get(p.codigo);
              if (!c) return null;
              const res = RESULTADOS.find((r) => r.id === p.resultado);
              return (
                <li key={p.codigo} className={`item parada ${p.resultado ? 'feita' : ''}`}>
                  <div className="num">{i + 1}</div>
                  <div className="item-corpo">
                    <div onClick={() => abrirCliente(c.codigo)}>
                      <div className="item-titulo">{c.fantasia} <span className="cod">{c.codigo}</span></div>
                      <div className="item-sub">
                        {c.endereco?.logradouro ? `${c.endereco.logradouro}${c.endereco.numero ? ', ' + c.endereco.numero : ''} · ` : ''}
                        {titulo(c.bairro)} · {titulo(c.cidade)}
                        {kmAte(c) !== null ? ` · ~${kmAte(c)!.toFixed(1)} km` : ''}
                      </div>
                      <div className="selos"><SeloPrioridade c={c} /><SeloFinanceiro c={c} /><SeloLocal c={c} /></div>
                      {res && <div className="resultado">{res.emoji} {res.rotulo}{p.nota ? ` — ${p.nota}` : ''}</div>}
                    </div>
                    <div className="botoes">
                      {c.local && <BotaoNavegar lat={c.local.lat} lng={c.local.lng} nome={c.fantasia} compacto />}
                      <button className="btn btn-sec btn-peq" onClick={() => setRegistrando(p)}>{p.resultado ? '✏️ Resultado' : '✔️ Registrar'}</button>
                      <button className="btn-icone peq" onClick={() => moverParada(data, p.codigo, -1)} disabled={i === 0}>↑</button>
                      <button className="btn-icone peq" onClick={() => moverParada(data, p.codigo, 1)} disabled={i === paradas.length - 1}>↓</button>
                      <button className="btn-icone peq" onClick={() => confirm(`Tirar ${c.fantasia} da rota?`) && alternarNaRota(data, p.codigo)}>✕</button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          <button className="btn btn-sec btn-bloco" onClick={irCarteira}>＋ Adicionar clientes</button>
        </>
      )}

      {registrando && (
        <RegistrarVisita
          parada={registrando}
          nome={clientes.get(registrando.codigo)?.fantasia ?? ''}
          data={data}
          aoFechar={() => setRegistrando(null)}
        />
      )}
    </div>
  );
}

function RegistrarVisita({ parada, nome, data, aoFechar }: { parada: Parada; nome: string; data: string; aoFechar: () => void }) {
  const [resultado, setResultado] = useState<Resultado | null>(parada.resultado);
  const [nota, setNota] = useState(parada.nota);
  const [novaData, setNovaData] = useState(somarDias(data, 7));
  async function salvar() {
    await registrarResultado(data, parada.codigo, resultado, nota, resultado === 'reagendar' ? novaData : undefined);
    aoFechar();
  }
  return (
    <Folha aberta aoFechar={aoFechar} titulo={nome}>
      <div className="opcoes">
        {RESULTADOS.map((r) => (
          <button key={r.id} className={`opcao ${resultado === r.id ? 'ativo' : ''}`} onClick={() => setResultado(r.id)}>{r.emoji} {r.rotulo}</button>
        ))}
      </div>
      {resultado === 'reagendar' && (
        <div className="linha-form"><label>Nova data</label><input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} /></div>
      )}
      <textarea placeholder="Anotação (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} rows={3} />
      <div className="botoes">
        <button className="btn" onClick={salvar} disabled={!resultado}>Salvar</button>
        {parada.resultado && <button className="btn btn-sec" onClick={async () => { await registrarResultado(data, parada.codigo, null, ''); aoFechar(); }}>Desfazer</button>}
      </div>
    </Folha>
  );
}
