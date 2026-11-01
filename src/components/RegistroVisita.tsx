import { useEffect, useMemo, useState } from 'react';
import { db } from '../db';
import type { Cliente, Pedido, Resultado, Visita } from '../types';
import { ASSUNTOS, MARCAS_PADRAO, MOTIVOS_NAO_ATENDIDO, MOTIVOS_SEM_PEDIDO, RESULTADOS } from '../types';
import { confirmarLocal, obterGps, registrarVisita, ultimaVisita } from '../lib/acoes';
import { calcularPrioridade } from '../lib/prioridade';
import { distanciaKm } from '../lib/rota';
import { formatarData, hojeISO, somarDias, titulo } from '../lib/texto';
import Folha from './Folha';

const hora = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');

/** "1.234,56" -> 1234.56 */
export function lerValor(txt: string): number | null {
  const limpo = txt.replace(/[^\d,.-]/g, '');
  if (!limpo) return null;
  const n = limpo.includes(',') ? Number(limpo.replace(/\./g, '').replace(',', '.')) : Number(limpo);
  return Number.isFinite(n) ? n : null;
}
const mostrarValor = (n: number | null | undefined) => (n == null ? '' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/**
 * Registro da visita: resultado, pedido (peças por marca, valor, nº), motivo, contato,
 * assuntos, retorno e observação. NADA é obrigatório.
 */
export default function RegistroVisita({ data, cliente, checkinEm, saidaEm, aoFechar }: {
  data: string; cliente: Cliente; checkinEm: string | null; saidaEm?: string | null; aoFechar: () => void;
}) {
  const [carregado, setCarregado] = useState(false);
  const [existente, setExistente] = useState<Visita | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [pecas, setPecas] = useState<Record<string, string>>({});
  const [valor, setValor] = useState('');
  const [numero, setNumero] = useState('');
  const [contato, setContato] = useState('');
  const [contatoSugerido, setContatoSugerido] = useState('');
  const [assuntos, setAssuntos] = useState<string[]>([]);
  const [retorno, setRetorno] = useState('');
  const [lancar, setLancar] = useState(true);
  const [nota, setNota] = useState('');
  const [gps, setGps] = useState<Visita['gps']>(null);
  const [msgGps, setMsgGps] = useState('');
  const [salvando, setSalvando] = useState(false);

  const marcas = useMemo(() => {
    const daPlanilha = cliente.marcas.filter((m) => m.ultFat || m.pecas.length).map((m) => m.nome);
    return [...new Set([...daPlanilha, ...MARCAS_PADRAO])];
  }, [cliente]);
  const ciclo = calcularPrioridade(cliente, hojeISO()).intervaloEsperado;

  // Carrega o que já foi registrado neste dia (edição) e o último contato
  useEffect(() => {
    (async () => {
      const v = await db.historico.get(`${cliente.codigo}|${data}`);
      const ult = await ultimaVisita(cliente.codigo);
      if (ult?.contato) setContatoSugerido(ult.contato);
      if (v && !v.removido) {
        setExistente(v);
        setResultado(v.resultado === 'visitado' ? null : v.resultado);
        setMotivo(v.motivo ?? null);
        setPecas(Object.fromEntries(Object.entries(v.pedido?.pecas ?? {}).map(([k, n]) => [k, String(n)])));
        setValor(mostrarValor(v.pedido?.valor));
        setNumero(v.pedido?.numero ?? '');
        setContato(v.contato ?? '');
        setAssuntos(v.assuntos ?? []);
        setRetorno(v.retorno ?? '');
        setNota(v.nota ?? '');
        setGps(v.gps ?? null);
      }
      setCarregado(true);
    })();
  }, [cliente.codigo, data]);

  // Posição do GPS: só se a permissão já foi dada (não incomoda com pedidos)
  useEffect(() => {
    if (existente?.gps || data !== hojeISO()) return;
    (async () => {
      try {
        const perm = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
        if (perm?.state !== 'granted') return;
        const g = await obterGps();
        const distanciaM = cliente.local ? Math.round(distanciaKm(g, cliente.local) * 1000) : null;
        setGps({ lat: g.lat, lng: g.lng, precisaoM: Math.round(g.precisaoM), distanciaM });
      } catch { /* sem GPS: tudo bem */ }
    })();
  }, [existente, data, cliente.local]);

  function escolherResultado(r: Resultado) {
    const novo = resultado === r ? null : r; // tocar de novo desmarca
    setResultado(novo);
    setMotivo(null);
    if (novo === 'reagendado' && !retorno) { setRetorno(somarDias(data, 7)); setLancar(true); }
  }
  const alternarAssunto = (id: string) => setAssuntos((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  const mudarPecas = (m: string, delta: number) => setPecas((p) => ({ ...p, [m]: String(Math.max(0, (Number(p[m]) || 0) + delta)) }));

  async function salvar() {
    setSalvando(true);
    const pecasNum = Object.fromEntries(Object.entries(pecas).map(([k, v]) => [k, Number(v) || 0]).filter(([, n]) => (n as number) > 0));
    const v = lerValor(valor);
    const temPedido = Object.keys(pecasNum).length > 0 || v != null || numero.trim() !== '';
    const pedido: Pedido | null = temPedido ? { pecas: pecasNum, valor: v, numero: numero.trim() } : null;
    await registrarVisita(data, cliente.codigo, {
      resultado: resultado ?? (pedido ? 'pedido' : 'visitado'),
      motivo, contato: contato.trim(), assuntos, pedido,
      retorno: retorno || null, lancarRetornoNaRota: lancar,
      nota: nota.trim(), gps, chegadaEm: checkinEm, saidaEm: existente?.saidaEm ?? saidaEm ?? new Date().toISOString()
    });
    aoFechar();
  }

  async function desfazer() {
    if (!confirm('Apagar o registro desta visita?')) return;
    await registrarVisita(data, cliente.codigo, null);
    aoFechar();
  }

  const atendido = resultado !== 'nao_atendido';
  const motivos = resultado === 'sem_pedido' ? MOTIVOS_SEM_PEDIDO : resultado === 'nao_atendido' ? MOTIVOS_NAO_ATENDIDO : null;
  const totalPecas = Object.values(pecas).reduce((s, x) => s + (Number(x) || 0), 0);
  const podeGravarLocal = gps && gps.precisaoM <= 80 && cliente.local?.precisao !== 'confirmado';

  return (
    <Folha aberta aoFechar={aoFechar} titulo={cliente.fantasia}>
      {!carregado ? <p className="nota-peq">Carregando…</p> : (
        <div className="registro">
          <p className="nota-peq registro-sub">
            {formatarData(data)}{checkinEm ? ` · chegou ${hora(checkinEm)}` : ''} · {titulo(cliente.bairro)}, {titulo(cliente.cidade)}
            <br />Preencha só o que quiser. Nada é obrigatório.
          </p>

          <h3 className="sub-titulo">Resultado</h3>
          <div className="opcoes">
            {RESULTADOS.map((r) => (
              <button key={r.id} className={`opcao ${resultado === r.id ? 'ativo' : ''}`} onClick={() => escolherResultado(r.id)}>{r.emoji} {r.rotulo}</button>
            ))}
          </div>

          {motivos && (
            <>
              <h3 className="sub-titulo">Motivo</h3>
              <div className="chips quebra">
                {motivos.map((m) => (
                  <button key={m.id} className={`chip ${motivo === m.id ? 'ativo' : ''}`} onClick={() => setMotivo(motivo === m.id ? null : m.id)}>{m.rotulo}</button>
                ))}
              </div>
            </>
          )}

          {(resultado === 'pedido' || resultado === null) && (
            <>
              <h3 className="sub-titulo">Pedido {totalPecas > 0 && <span className="contagem">{totalPecas} peças</span>}</h3>
              <div className="pecas">
                {marcas.map((m) => (
                  <div key={m} className="pecas-linha">
                    <span>{titulo(m)}</span>
                    <button className="btn-icone peq" aria-label={`Menos ${m}`} onClick={() => mudarPecas(m, -1)}>−</button>
                    <input inputMode="numeric" pattern="[0-9]*" placeholder="0" value={pecas[m] ?? ''} aria-label={`Peças ${m}`}
                      onChange={(e) => setPecas({ ...pecas, [m]: e.target.value.replace(/\D/g, '') })} />
                    <button className="btn-icone peq" aria-label={`Mais ${m}`} onClick={() => mudarPecas(m, 1)}>+</button>
                  </div>
                ))}
              </div>
              <div className="grade-campos">
                <div className="linha-form"><label htmlFor="rv-valor">Valor (R$)</label>
                  <input id="rv-valor" inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} onBlur={() => setValor(mostrarValor(lerValor(valor)))} /></div>
                <div className="linha-form"><label htmlFor="rv-num">Nº do pedido</label>
                  <input id="rv-num" value={numero} onChange={(e) => setNumero(e.target.value)} /></div>
              </div>
            </>
          )}

          {atendido && (
            <>
              <h3 className="sub-titulo">Com quem falou</h3>
              <input placeholder="Nome do contato" value={contato} onChange={(e) => setContato(e.target.value)} autoCapitalize="words" />
              {contatoSugerido && !contato && (
                <button className="chip sugestao" onClick={() => setContato(contatoSugerido)}>↺ {contatoSugerido} (última visita)</button>
              )}

              <h3 className="sub-titulo">Assuntos tratados</h3>
              <div className="chips quebra">
                {ASSUNTOS.map((a) => (
                  <button key={a.id} className={`chip ${assuntos.includes(a.id) ? 'ativo' : ''}`} onClick={() => alternarAssunto(a.id)}>{a.rotulo}</button>
                ))}
              </div>
            </>
          )}

          <h3 className="sub-titulo">{resultado === 'reagendado' ? 'Nova data' : 'Próximo retorno'}</h3>
          <div className="chips quebra">
            {[7, 15, 30].map((d) => (
              <button key={d} className={`chip ${retorno === somarDias(data, d) ? 'ativo' : ''}`} onClick={() => setRetorno(somarDias(data, d))}>+{d} dias</button>
            ))}
            {ciclo && ciclo > 30 && (
              <button className={`chip ${retorno === somarDias(data, ciclo) ? 'ativo' : ''}`} onClick={() => setRetorno(somarDias(data, ciclo))}>Ciclo (~{ciclo} dias)</button>
            )}
          </div>
          <div className="retorno-linha">
            <input type="date" value={retorno} onChange={(e) => setRetorno(e.target.value)} aria-label="Data de retorno" />
            {retorno && <button className="btn-link" onClick={() => setRetorno('')}>Limpar</button>}
          </div>
          {retorno && <label className="check"><input type="checkbox" checked={lancar} onChange={(e) => setLancar(e.target.checked)} /> Colocar na rota de {formatarData(retorno)}</label>}
          {retorno && (localStorage.getItem('agenda-ativa')
            ? <p className="nota-peq">📅 Vai para a sua Agenda Google, com aviso 2 dias antes e no dia às 08:00.</p>
            : <p className="nota-peq">Quer ser avisado? Ative os <b>lembretes de retorno</b> em Ajustes.</p>)}

          <h3 className="sub-titulo">Observação</h3>
          <textarea rows={3} placeholder="Ex: pediu catálogo da coleção de verão" value={nota} onChange={(e) => setNota(e.target.value)} />

          {gps && (
            <div className="gps-info">
              📍 {gps.distanciaM != null ? `Você está a ~${gps.distanciaM < 1000 ? `${gps.distanciaM} m` : `${(gps.distanciaM / 1000).toFixed(1)} km`} do endereço do cliente.` : 'Posição registrada.'}
              {podeGravarLocal && (
                <button className="btn btn-sec btn-peq" onClick={async () => { await confirmarLocal(cliente.codigo, gps.lat, gps.lng, `GPS na visita (±${gps.precisaoM} m)`); setMsgGps('Local da loja gravado ✓'); }}>
                  Gravar como local da loja
                </button>
              )}
              {msgGps && <span className="msg">{msgGps}</span>}
            </div>
          )}

          <div className="botoes registro-acoes">
            <button className="btn" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar visita'}</button>
            {existente && <button className="btn-link perigo" onClick={desfazer}>Apagar registro</button>}
          </div>
        </div>
      )}
    </Folha>
  );
}
