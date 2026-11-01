import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { calcularPrioridade } from '../lib/prioridade';
import { intervalo, PERIODOS, resumoPeriodo, retornosPendentes, type Contagem, type Periodo } from '../lib/relatorio';
import { diasEntre, formatarData, hojeISO, titulo } from '../lib/texto';
import ExportarVisitas from '../components/ExportarVisitas';

const reais = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const num = (n: number) => n.toLocaleString('pt-BR');
const pct = (x: number) => (x > 0 && x < 0.01 ? '<1%' : `${Math.round(x * 100)}%`);

function Barras({ itens, detalhe, limite = 8 }: { itens: Contagem[]; detalhe?: (c: Contagem) => string; limite?: number }) {
  const max = Math.max(1, ...itens.map((i) => i.qtd));
  const [todos, setTodos] = useState(false);
  const lista = todos ? itens : itens.slice(0, limite);
  return (
    <>
      <ul className="barras">
        {lista.map((i) => (
          <li key={i.id}>
            <div className="barra-txt"><span>{i.rotulo}</span><b>{detalhe ? detalhe(i) : num(i.qtd)}</b></div>
            <div className="barra-trilho"><div className="barra-valor" style={{ width: `${Math.max(2, (i.qtd / max) * 100)}%` }} /></div>
          </li>
        ))}
      </ul>
      {itens.length > limite && <button className="btn-link" onClick={() => setTodos(!todos)}>{todos ? 'Mostrar menos' : `Ver todos (${itens.length})`}</button>}
    </>
  );
}

function Numero({ rotulo, valor, sub }: { rotulo: string; valor: string; sub?: string }) {
  return <div className="numero"><small>{rotulo}</small><b>{valor}</b>{sub && <span>{sub}</span>}</div>;
}

export default function Relatorios({ abrirCliente }: { abrirCliente: (codigo: string) => void }) {
  const [periodo, setPeriodo] = useState<Periodo>('este_mes');
  const hoje = hojeISO();
  const [ini, fim] = intervalo(periodo, hoje);
  const historico = useLiveQuery(() => db.historico.toArray(), []);
  const clientesArr = useLiveQuery(() => db.clientes.toArray(), []);
  const clientes = useMemo(() => new Map((clientesArr ?? []).map((c) => [c.codigo, c])), [clientesArr]);

  const doPeriodo = useMemo(() => (historico ?? []).filter((v) => !v.removido && v.data >= ini && v.data <= fim), [historico, ini, fim]);
  const r = useMemo(() => resumoPeriodo(doPeriodo, clientes), [doPeriodo, clientes]);
  const retornos = useMemo(() => retornosPendentes(historico ?? []).filter((x) => clientes.get(x.codigo)?.ativo), [historico, clientes]);
  const vencidos = retornos.filter((x) => x.retorno < hoje);
  const proximos = retornos.filter((x) => x.retorno >= hoje && diasEntre(hoje, x.retorno) <= 14);

  // Clientes que pedem visita (atrasados ou perto do ciclo) e não foram visitados no período
  const semVisita = useMemo(() => {
    const visitados = new Set(doPeriodo.map((v) => v.codigo));
    return (clientesArr ?? []).filter((c) => c.ativo && !visitados.has(c.codigo))
      .map((c) => ({ c, p: calcularPrioridade(c, hoje) }))
      .filter((x) => x.p.nivel === 'atrasado' || x.p.nivel === 'proximo')
      .sort((a, b) => a.p.ordem - b.p.ordem);
  }, [clientesArr, doPeriodo, hoje]);
  const ativos = (clientesArr ?? []).filter((c) => c.ativo).length;
  const [verSemVisita, setVerSemVisita] = useState(false);

  if (!historico || !clientesArr) return null;
  const nomePeriodo = PERIODOS.find((p) => p.id === periodo)!.rotulo;
  const nome = (codigo: string) => clientes.get(codigo)?.fantasia ?? codigo;

  return (
    <div>
      <div className="chips quebra">
        {PERIODOS.map((p) => (
          <button key={p.id} className={`chip ${periodo === p.id ? 'ativo' : ''}`} onClick={() => setPeriodo(p.id)}>{p.rotulo}</button>
        ))}
      </div>
      {periodo !== 'tudo' && <p className="nota-peq">{formatarData(ini)} a {formatarData(fim)}</p>}

      {!r.visitas ? (
        <section className="cartao"><p className="nota-peq">Nenhuma visita registrada neste período. Registre as visitas na aba <b>Rota</b> ou na ficha do cliente.</p></section>
      ) : (
        <>
          <div className="numeros">
            <Numero rotulo="Visitas" valor={num(r.visitas)} sub={`${r.clientesVisitados} clientes · ${r.diasEmCampo} dia(s)`} />
            <Numero rotulo="Pedidos" valor={num(r.pedidos)} sub={r.taxaPedido != null ? `${Math.round(r.taxaPedido * 100)}% das visitas atendidas` : undefined} />
            <Numero rotulo="Peças" valor={num(r.pecas)} sub={r.pedidos ? `${num(Math.round(r.pecas / r.pedidos))} por pedido` : undefined} />
            <Numero rotulo="Valor em pedidos" valor={reais(r.valor)} sub={r.ticketMedio != null ? `ticket médio ${reais(r.ticketMedio)}` : 'valor não informado'} />
            {r.minutosMedios != null && <Numero rotulo="Tempo na loja" valor={`${r.minutosMedios} min`} sub="média por visita" />}
            {ativos > 0 && <Numero rotulo="Carteira visitada" valor={pct(r.clientesVisitados / ativos)} sub={`${r.clientesVisitados} de ${ativos} clientes`} />}
          </div>

          <section className="cartao">
            <h2>Resultado das visitas</h2>
            <Barras itens={r.resultados} detalhe={(c) => `${c.qtd} · ${Math.round((c.qtd / r.visitas) * 100)}%`} />
          </section>

          {r.marcas.length > 0 && (
            <section className="cartao">
              <h2>Peças por marca</h2>
              <Barras itens={r.marcas} detalhe={(c) => `${num(c.qtd)} pç · ${c.extra} pedido(s)`} />
            </section>
          )}

          {r.motivosSemPedido.length > 0 && (
            <section className="cartao">
              <h2>Por que não comprou</h2>
              <Barras itens={r.motivosSemPedido} />
            </section>
          )}

          {r.motivosNaoAtendido.length > 0 && (
            <section className="cartao">
              <h2>Por que não foi atendido</h2>
              <Barras itens={r.motivosNaoAtendido} />
            </section>
          )}

          {r.assuntos.length > 0 && (
            <section className="cartao">
              <h2>Assuntos tratados</h2>
              <Barras itens={r.assuntos} />
            </section>
          )}

          <section className="cartao">
            <h2>Por cidade</h2>
            <Barras itens={r.cidades} limite={6} detalhe={(c) => `${c.qtd} visita(s) · ${c.extra} pedido(s)`} />
          </section>
        </>
      )}

      <section className="cartao">
        <h2>📅 Retornos combinados</h2>
        {!vencidos.length && !proximos.length && <p className="nota-peq">Nenhum retorno vencido ou para os próximos 14 dias.</p>}
        {vencidos.length > 0 && <p className="rel-grupo atrasado">⚠️ Passou da data ({vencidos.length})</p>}
        <ul className="rel-lista">
          {vencidos.map((x) => (
            <li key={x.codigo} onClick={() => abrirCliente(x.codigo)}>
              <span>{nome(x.codigo)}</span><small>era {formatarData(x.retorno)} · {diasEntre(x.retorno, hoje)} dia(s) atrás</small>
            </li>
          ))}
        </ul>
        {proximos.length > 0 && <p className="rel-grupo">Próximos 14 dias ({proximos.length})</p>}
        <ul className="rel-lista">
          {proximos.map((x) => (
            <li key={x.codigo} onClick={() => abrirCliente(x.codigo)}>
              <span>{nome(x.codigo)}</span><small>{x.retorno === hoje ? 'hoje' : formatarData(x.retorno)}</small>
            </li>
          ))}
        </ul>
      </section>

      <section className="cartao">
        <h2>🔴 Pedem visita e não foram visitados</h2>
        <p className="nota-peq">Clientes atrasados ou perto do ciclo de compra sem visita no período ({nomePeriodo.toLowerCase()}): <b>{semVisita.length}</b>.</p>
        <ul className="rel-lista">
          {semVisita.slice(0, verSemVisita ? 200 : 8).map(({ c, p }) => (
            <li key={c.codigo} onClick={() => abrirCliente(c.codigo)}>
              <span>{c.fantasia}</span>
              <small>{titulo(c.cidade)} · {p.nivel === 'atrasado' ? (p.atraso ? `${p.atraso} dias além do ciclo` : `${p.diasSemComprar} dias sem comprar`) : 'perto do ciclo'}</small>
            </li>
          ))}
        </ul>
        {semVisita.length > 8 && <button className="btn-link" onClick={() => setVerSemVisita(!verSemVisita)}>{verSemVisita ? 'Mostrar menos' : `Ver todos (${semVisita.length})`}</button>}
      </section>

      <ExportarVisitas visitas={doPeriodo} nomePeriodo={nomePeriodo} />
    </div>
  );
}
