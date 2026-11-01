import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Cliente, Endereco } from '../types';
import { RESULTADOS } from '../types';
import { alertaFinanceiro, calcularPrioridade, NIVEIS } from '../lib/prioridade';
import { formatarCep, formatarData, hojeISO, nomeDia, titulo } from '../lib/texto';
import { alternarNaRota, confirmarLocal, obterGps, refazerSugestao, salvarEndereco } from '../lib/acoes';
import Mapa from '../components/Mapa';
import Folha from '../components/Folha';
import BotaoNavegar from '../components/Navegar';
import { PRECISOES, SeloFinanceiro, SeloLocal, SeloPrioridade } from '../components/Selos';

export default function ClienteTela({ codigo, data, voltar }: { codigo: string; data: string; voltar: () => void }) {
  const c = useLiveQuery(() => db.clientes.get(codigo), [codigo]);
  const rota = useLiveQuery(() => db.rotas.get(data), [data]);
  const visitas = useLiveQuery(() => db.visitas.where('codigo').equals(codigo).reverse().sortBy('data'), [codigo]) ?? [];
  const [ajustando, setAjustando] = useState<{ lat: number; lng: number } | null>(null);
  const [editando, setEditando] = useState(false);
  const [msg, setMsg] = useState('');
  const [notas, setNotas] = useState('');
  useEffect(() => { if (c) setNotas(c.notas); }, [c?.codigo]); // eslint-disable-line

  const marcadores = useMemo(() => (c?.local && !ajustando
    ? [{ id: c.codigo, lat: c.local.lat, lng: c.local.lng, rotulo: '★', cor: PRECISOES[c.local.precisao].cor, aproximado: PRECISOES[c.local.precisao].alerta }]
    : []), [c?.local, ajustando]); // eslint-disable-line
  const arrastavel = useMemo(() => (ajustando ? { ...ajustando, aoMover: (lat: number, lng: number) => setAjustando({ lat, lng }) } : null), [ajustando]);

  if (!c) return <div className="vazio">Carregando…</div>;
  const p = calcularPrioridade(c, hojeISO());
  const fin = alertaFinanceiro(c);
  const naRota = rota?.paradas.some((x) => x.codigo === c.codigo);
  const prec = c.local ? PRECISOES[c.local.precisao] : null;
  const e = c.endereco;

  async function usarGps() {
    setMsg('Obtendo localização…');
    try {
      const g = await obterGps();
      if (!confirm(`Gravar sua posição atual (precisão de ~${Math.round(g.precisaoM)} m) como a localização de ${c!.fantasia}? Faça isso estando na loja.`)) { setMsg(''); return; }
      await confirmarLocal(c!.codigo, g.lat, g.lng, `GPS do iPhone (±${Math.round(g.precisaoM)} m)`);
      setMsg('Localização confirmada ✓');
    } catch (err) { setMsg((err as Error).message); }
  }

  return (
    <div className="tela-cliente">
      <div className="topo-cliente">
        <button className="btn-link" onClick={voltar}>‹ Voltar</button>
        <button className={`btn btn-peq ${naRota ? 'btn-sec' : ''}`} onClick={() => alternarNaRota(data, c.codigo)}>
          {naRota ? `✓ Na rota de ${nomeDia(data).split(',')[1]?.trim() ?? data}` : `＋ Rota de ${nomeDia(data).split(',')[1]?.trim() ?? data}`}
        </button>
      </div>

      <h1 className="nome-cliente">{c.fantasia}</h1>
      <div className="item-sub">{c.razao} · <b>{c.codigo}</b></div>
      {!c.ativo && <div className="alerta">Este cliente não estava na última planilha importada (fora da carteira).</div>}
      <div className="selos"><SeloPrioridade c={c} /><SeloFinanceiro c={c} /><SeloLocal c={c} /></div>

      {/* ---------- Endereço ---------- */}
      <section className="cartao">
        <h2>Endereço</h2>
        {c.avisoCep && <div className="alerta">⚠️ {c.avisoCep}</div>}
        {prec?.alerta && (
          <div className="alerta">
            ⚠️ <b>Endereço sugerido automaticamente</b> ({prec.rotulo.toLowerCase()}). A planilha não traz rua e número,
            então pode não ser o local exato. Quando estiver na loja, toque em <b>"Estou na loja"</b> para gravar o ponto certo,
            ou corrija o endereço.
          </div>
        )}
        {!c.local && (
          <div className="alerta">{c.geoStatus === 'falhou' ? '❓ Não encontrei uma sugestão. Informe o endereço ou use o GPS na loja.' : '⏳ Buscando sugestão de endereço (precisa de internet)…'}</div>
        )}
        <p className="endereco">
          {e?.logradouro ? <>{e.logradouro}{e.numero ? `, ${e.numero}` : ', s/nº'}{e.complemento ? ` – ${e.complemento}` : ''}<br /></> : null}
          {titulo(c.bairro)} · {titulo(c.cidade)} – {c.uf}<br />
          CEP {formatarCep(c.cep)}{c.cep.endsWith('000') ? ' (CEP geral da cidade)' : ''}
        </p>
        {c.local && <div className="nota-peq">Fonte: {c.local.fonte} · {formatarData(c.local.atualizadoEm)}</div>}

        <Mapa marcadores={marcadores} arrastavel={arrastavel} altura={220} />

        {ajustando ? (
          <div className="botoes">
            <span className="nota-peq">Arraste o marcador até a porta da loja.</span>
            <button className="btn" onClick={async () => { await confirmarLocal(c.codigo, ajustando.lat, ajustando.lng, 'Ajustado no mapa'); setAjustando(null); setMsg('Localização confirmada ✓'); }}>Salvar posição</button>
            <button className="btn btn-sec" onClick={() => setAjustando(null)}>Cancelar</button>
          </div>
        ) : (
          <div className="botoes">
            {c.local && <BotaoNavegar lat={c.local.lat} lng={c.local.lng} nome={c.fantasia} compacto />}
            <button className="btn btn-sec btn-peq" onClick={usarGps}>📍 Estou na loja</button>
            <button className="btn btn-sec btn-peq" onClick={() => setAjustando(c.local ? { lat: c.local.lat, lng: c.local.lng } : { lat: -23.55, lng: -46.63 })}>✥ Ajustar no mapa</button>
            <button className="btn btn-sec btn-peq" onClick={() => setEditando(true)}>✏️ Corrigir endereço</button>
            {c.local && prec?.alerta && <button className="btn btn-sec btn-peq" onClick={() => refazerSugestao(c.codigo)}>🔄 Buscar sugestão de novo</button>}
          </div>
        )}
        {msg && <div className="msg">{msg}</div>}
      </section>

      {/* ---------- Compras ---------- */}
      <section className="cartao">
        <h2>Compras</h2>
        <div className="alerta-neutro" style={{ borderColor: NIVEIS[p.nivel].cor }}>{NIVEIS[p.nivel].emoji} <b>{NIVEIS[p.nivel].rotulo}.</b> {p.explicacao}</div>
        {c.marcas.filter((m) => m.ultFat || m.pecas.length).map((m) => {
          const max = Math.max(1, ...m.pecas.map((x) => Math.abs(x.qtd)));
          return (
            <div key={m.nome} className="marca">
              <div className="marca-topo"><b>{titulo(m.nome)}</b><span>Último fat.: {formatarData(m.ultFat)}</span></div>
              <div className="barras">
                {m.pecas.map((x) => (
                  <div key={x.ano} className="barra-linha">
                    <span>{x.ano}</span>
                    <div className="barra-fundo"><div className={`barra ${x.qtd < 0 ? 'neg' : ''}`} style={{ width: `${(Math.abs(x.qtd) / max) * 100}%` }} /></div>
                    <span className="qtd">{x.qtd} pç</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {!c.marcas.some((m) => m.ultFat || m.pecas.length) && <p className="nota-peq">Sem faturamento registrado na planilha.</p>}
        <div className="grade">
          <div><span>Freq. média anos anteriores</span><b>{c.freqMedia ?? '—'}</b></div>
          <div><span>Freq. ano atual</span><b>{c.freqAtual ?? '—'}</b></div>
        </div>
      </section>

      {/* ---------- Financeiro ---------- */}
      <section className="cartao">
        <h2>Financeiro</h2>
        {fin.nivel === 'ok' ? <p>✅ Sem pendências na planilha.</p> : (
          <ul className="fin">
            {fin.itens.map((i) => <li key={i} className={/grupo/i.test(i) ? 'grupo' : 'cliente'}>{/grupo/i.test(i) ? '🟠' : '🔴'} {i}</li>)}
          </ul>
        )}
      </section>

      {/* ---------- Grupo ---------- */}
      <section className="cartao">
        <h2>Grupo e rede</h2>
        <div className="grade">
          <div><span>Grupo econômico</span><b>{c.grupo || '—'}</b></div>
          <div><span>Rede</span><b>{c.rede || '—'}</b></div>
          <div><span>Microrregião</span><b>{titulo(c.micro)}</b></div>
          <div><span>Mesorregião</span><b>{titulo(c.meso)}</b></div>
        </div>
      </section>

      {/* ---------- Notas e histórico ---------- */}
      <section className="cartao">
        <h2>Anotações</h2>
        <textarea rows={3} value={notas} placeholder="Ex: falar com a Maria, atende só de manhã…" onChange={(ev) => setNotas(ev.target.value)}
          onBlur={() => db.clientes.update(c.codigo, { notas })} />
        <h2>Histórico de visitas</h2>
        {!visitas.length ? <p className="nota-peq">Nenhuma visita registrada no app.</p> : (
          <ul className="historico">
            {visitas.map((v) => {
              const r = RESULTADOS.find((x) => x.id === v.resultado)!;
              return <li key={v.id}><b>{formatarData(v.data)}</b> {r.emoji} {r.rotulo}{v.nota ? ` — ${v.nota}` : ''}</li>;
            })}
          </ul>
        )}
      </section>

      {editando && <EditarEndereco c={c} aoFechar={() => setEditando(false)} aoSalvar={setMsg} />}
    </div>
  );
}

function EditarEndereco({ c, aoFechar, aoSalvar }: { c: Cliente; aoFechar: () => void; aoSalvar: (m: string) => void }) {
  const [e, setE] = useState<Endereco>(c.endereco ?? { logradouro: '', numero: '', complemento: '', bairro: titulo(c.bairro), cidade: titulo(c.cidade), uf: c.uf, cep: c.cep });
  const [ocupado, setOcupado] = useState(false);
  const campo = (k: keyof Endereco, rotulo: string, extra: Record<string, string> = {}) => (
    <div className="linha-form"><label>{rotulo}</label><input value={e[k]} onChange={(ev) => setE({ ...e, [k]: ev.target.value })} {...extra} /></div>
  );
  async function salvar() {
    setOcupado(true);
    try {
      const achou = await salvarEndereco(c, e);
      aoSalvar(achou ? (c.local?.precisao === 'confirmado' ? 'Endereço salvo (a posição de GPS confirmada foi mantida) ✓' : 'Endereço salvo e localizado no mapa ✓')
        : 'Endereço salvo, mas não consegui localizá-lo no mapa. Use "Estou na loja" ou "Ajustar no mapa".');
      aoFechar();
    } catch {
      aoSalvar('Sem internet para localizar o endereço agora. Tente de novo mais tarde.');
      setOcupado(false);
    }
  }
  return (
    <Folha aberta aoFechar={aoFechar} titulo="Corrigir endereço">
      {campo('logradouro', 'Rua / Av.')}
      {campo('numero', 'Número', { inputMode: 'numeric' })}
      {campo('complemento', 'Complemento')}
      {campo('bairro', 'Bairro')}
      {campo('cidade', 'Cidade')}
      {campo('uf', 'UF')}
      {campo('cep', 'CEP', { inputMode: 'numeric' })}
      <p className="nota-peq">Fica salvo no app e não é apagado quando você importar uma planilha nova.</p>
      <button className="btn btn-bloco" onClick={salvar} disabled={ocupado}>{ocupado ? 'Localizando…' : 'Salvar'}</button>
    </Folha>
  );
}
