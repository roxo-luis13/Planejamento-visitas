import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, lerConfig, obterRota } from '../db';
import type { Cliente, Parada, Resultado } from '../types';
import { RESULTADOS } from '../types';
import { alternarNaRota, moverParada, otimizarRota, registrarResultado } from '../lib/acoes';
import { estimar } from '../lib/rota';
import { decodificarPolyline, horarios } from '../lib/google';
import { linksRotaGoogle } from '../lib/navegar';
import { hojeISO, nomeDia, somarDias, titulo } from '../lib/texto';
import Mapa, { type Marcador } from '../components/Mapa';
import Folha from '../components/Folha';
import Saida from '../components/Saida';
import BotaoNavegar from '../components/Navegar';
import { PRECISOES, SeloFinanceiro, SeloLocal, SeloPrioridade } from '../components/Selos';

function duracao(min: number) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
}
const hora = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export default function Hoje({ data, setData, abrirCliente, irCarteira, irAjustes }: {
  data: string; setData: (d: string) => void; abrirCliente: (c: string) => void; irCarteira: () => void; irAjustes: () => void;
}) {
  const rota = useLiveQuery(() => obterRota(data), [data]);
  const cfg = useLiveQuery(() => lerConfig(), []);
  const codigos = rota?.paradas.map((p) => p.codigo) ?? [];
  const clientesArr = useLiveQuery(() => db.clientes.bulkGet(codigos), [codigos.join(',')]) ?? [];
  const clientes = useMemo(() => new Map(clientesArr.filter((c): c is Cliente => !!c).map((c) => [c.codigo, c])), [clientesArr]);
  const [msg, setMsg] = useState('');
  const [erro, setErro] = useState('');
  const [registrando, setRegistrando] = useState<Parada | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const paradas = rota?.paradas ?? [];
  const partida = rota?.partida ?? null;
  const retornar = rota?.retornar ?? true;
  const calculo = rota?.calculo ?? null;
  const temGoogle = !!cfg?.googleKey;
  const comLocal = paradas.map((p) => clientes.get(p.codigo)).filter((c): c is Cliente => !!c?.local);
  const est = cfg ? estimar(comLocal.map((c) => c.local!), partida, retornar, cfg.velocidadeMedia, cfg.minutosPorVisita) : null;
  const aproximados = comLocal.filter((c) => PRECISOES[c.local!.precisao].alerta).length;
  const semLocal = paradas.length - comLocal.length;
  const feitas = paradas.filter((p) => p.resultado).length;

  // Horários previstos (Google)
  const prev = useMemo(() => {
    if (!calculo || !cfg) return null;
    const h = horarios(new Date(calculo.saidaEm), calculo.pernas, calculo.codigos.length, cfg.minutosPorVisita);
    const porCodigo = new Map(calculo.codigos.map((c, i) => [c, { chegada: h.chegadas[i], perna: calculo.pernas[i] }]));
    return { fim: h.fim, porCodigo };
  }, [calculo, cfg]);

  const marcadores: Marcador[] = useMemo(() => {
    const m: Marcador[] = [];
    paradas.forEach((p, i) => {
      const c = clientes.get(p.codigo);
      if (!c?.local) return;
      m.push({ id: c.codigo, lat: c.local.lat, lng: c.local.lng, rotulo: String(i + 1), titulo: c.fantasia,
        cor: p.resultado ? '#80868b' : '#0b5cad', aproximado: PRECISOES[c.local.precisao].alerta });
    });
    if (partida) m.push({ id: '_partida', lat: partida.lat, lng: partida.lng, rotulo: '🏁', cor: '#1e8e3e', titulo: partida.rotulo });
    return m;
  }, [paradas, clientes, partida]);
  const tracado = useMemo(() => (calculo?.polyline ? decodificarPolyline(calculo.polyline) : undefined), [calculo?.polyline]);
  const linha = useMemo(() => {
    if (tracado) return undefined;
    const pts = paradas.map((p) => clientes.get(p.codigo)?.local).filter((l): l is NonNullable<typeof l> => !!l);
    return [...(partida ? [partida] : []), ...pts, ...(partida && retornar ? [partida] : [])];
  }, [tracado, paradas, clientes, partida, retornar]);

  async function calcular(otimizar: boolean) {
    setOcupado(true); setMsg(''); setErro('');
    try {
      const r = await otimizarRota(data, otimizar);
      const partes = [r.google ? (otimizar ? 'Rota otimizada pelo Google com o trânsito ✓' : 'Tempos atualizados com o trânsito ✓') : 'Ordem otimizada (estimativa) ✓'];
      if (r.semLocal) partes.push(`${r.semLocal} cliente(s) sem localização ficaram no fim.`);
      setMsg(partes.join(' '));
    } catch (e) { setErro((e as Error).message); } finally { setOcupado(false); }
  }

  const linksGoogle = linksRotaGoogle(paradas.filter((p) => !p.resultado).map((p) => clientes.get(p.codigo)?.local).filter((l): l is NonNullable<typeof l> => !!l), partida, retornar);
  const transitoMin = calculo ? Math.round((calculo.durS - calculo.semTransitoS) / 60) : 0;

  if (!rota || !cfg) return null;
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

      <div className="cartao">
        <Saida rota={rota} cfg={cfg} />
      </div>

      {!paradas.length ? (
        <div className="vazio">
          <p>Nenhuma visita planejada para {nomeDia(data)}.</p>
          <button className="btn" onClick={irCarteira}>Escolher clientes na Carteira</button>
        </div>
      ) : (
        <>
          <div className="cartao">
            {calculo ? (
              <>
                <div className="resumo-rota">
                  <div><b>{paradas.length}</b><span>visitas</span></div>
                  <div><b>{(calculo.distM / 1000).toFixed(0)}</b><span>km</span></div>
                  <div><b>{duracao(calculo.durS / 60)}</b><span>dirigindo</span></div>
                  <div><b>{prev ? hora(prev.fim) : '—'}</b><span>fim previsto</span></div>
                </div>
                <div className="nota-peq">
                  🚦 Google, com trânsito{transitoMin > 0 ? <> · <b className="transito">+{transitoMin} min de trânsito</b></> : ' · trânsito livre'} · saída {hora(new Date(calculo.saidaEm))} ·
                  calculado às {hora(new Date(calculo.em))} · {cfg.minutosPorVisita} min por visita
                </div>
                {rota.horaSaida && hora(new Date(calculo.saidaEm)) !== rota.horaSaida && !feitas && (
                  <div className="nota-peq">ℹ️ {rota.horaSaida} já tinha passado, então o cálculo considera a saída <b>agora</b>.</div>
                )}
              </>
            ) : (
              <>
                <div className="resumo-rota">
                  <div><b>{paradas.length}</b><span>visitas</span></div>
                  <div><b>{feitas}</b><span>feitas</span></div>
                  <div><b>{est ? `~${Math.round(est.km)}` : '—'}</b><span>km</span></div>
                  <div><b>{est ? duracao(est.minutosTotal) : '—'}</b><span>dia total</span></div>
                </div>
                <div className="nota-peq">⚠️ Estimativa em linha reta. {temGoogle ? 'Toque em "Otimizar com trânsito" para a rota real.' : ''}</div>
              </>
            )}
            {!temGoogle && (
              <div className="alerta">
                Para calcular a rota <b>pelas ruas com o trânsito do momento</b>, cadastre a chave do Google.
                <button className="btn btn-sec btn-peq" style={{ marginTop: 8 }} onClick={irAjustes}>Configurar Google</button>
              </div>
            )}
            {(aproximados > 0 || semLocal > 0) && (
              <div className="alerta">
                ⚠️ {aproximados > 0 && <>{aproximados} parada(s) com endereço <b>sugerido/aproximado</b>. </>}
                {semLocal > 0 && <>{semLocal} sem localização ainda. </>}
                Confirme na visita para a rota ficar precisa.
              </div>
            )}
            {!partida && temGoogle && <div className="alerta">Escolha a <b>saída</b> acima para calcular a rota.</div>}
            <div className="botoes">
              <button className="btn" onClick={() => calcular(true)} disabled={ocupado || (temGoogle && !partida && !feitas)}>
                {ocupado ? 'Calculando…' : temGoogle ? '⚡ Otimizar com trânsito' : '⚡ Otimizar ordem'}
              </button>
              {temGoogle && (
                <button className="btn btn-sec" onClick={() => calcular(false)} disabled={ocupado || (!partida && !feitas)}>🔄 Atualizar trânsito</button>
              )}
              {linksGoogle.map((l, i) => (
                <a key={l} className="btn btn-sec" href={l} target="_blank" rel="noreferrer">🗺️ Abrir no Google Maps{linksGoogle.length > 1 ? ` (parte ${i + 1})` : ''}</a>
              ))}
            </div>
            {feitas > 0 && temGoogle && <div className="nota-peq">Com visitas já feitas, o cálculo parte da última visita registrada, no horário atual.</div>}
            {msg && <div className="msg">{msg}</div>}
            {erro && <div className="alerta erro">{erro}</div>}
          </div>

          <Mapa marcadores={marcadores} linha={linha} tracado={tracado} aoTocar={(id) => id !== '_partida' && abrirCliente(id)} />

          <ol className="lista paradas">
            {paradas.map((p, i) => {
              const c = clientes.get(p.codigo);
              if (!c) return null;
              const res = RESULTADOS.find((r) => r.id === p.resultado);
              const pv = prev?.porCodigo.get(c.codigo);
              return (
                <li key={p.codigo} className={`item parada ${p.resultado ? 'feita' : ''}`}>
                  <div className="num">{i + 1}</div>
                  <div className="item-corpo">
                    <div onClick={() => abrirCliente(c.codigo)}>
                      <div className="item-titulo">{c.fantasia} <span className="cod">{c.codigo}</span></div>
                      <div className="item-sub">
                        {c.endereco?.logradouro ? `${c.endereco.logradouro}${c.endereco.numero ? ', ' + c.endereco.numero : ''} · ` : ''}
                        {titulo(c.bairro)} · {titulo(c.cidade)}
                      </div>
                      {pv && !p.resultado && (
                        <div className="eta">🕘 chega ~<b>{hora(pv.chegada)}</b> · {(pv.perna.distM / 1000).toFixed(1)} km · {Math.round(pv.perna.durS / 60)} min
                          {pv.perna.durS - pv.perna.semTransitoS > 120 ? <span className="transito"> (+{Math.round((pv.perna.durS - pv.perna.semTransitoS) / 60)} trânsito)</span> : null}
                        </div>
                      )}
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
          {calculo?.voltar && prev && partida && <div className="nota-peq centro">🏁 Volta para {partida.rotulo} ~{hora(prev.fim)}</div>}
          <button className="btn btn-sec btn-bloco" onClick={irCarteira}>＋ Adicionar clientes</button>
        </>
      )}

      {registrando && (
        <RegistrarVisita parada={registrando} nome={clientes.get(registrando.codigo)?.fantasia ?? ''} data={data} aoFechar={() => setRegistrando(null)} />
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
