import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Cliente } from '../types';
import { calcularPrioridade, NIVEIS, type NivelPrioridade } from '../lib/prioridade';
import { chaveBairro, FILTROS_VAZIOS, filtrosAtivos, passaFiltros, passaLugar, podarLugar, type FiltroFin, type Filtros } from '../lib/filtros';
import { hojeISO, nomeDia, titulo } from '../lib/texto';
import { alternarNaRota, desmarcarTodos } from '../lib/acoes';
import Folha from '../components/Folha';
import { SeloFinanceiro, SeloLocal, SeloPrioridade } from '../components/Selos';
import Escolha, { type Opcao } from '../components/Escolha';

type Ordem = 'prioridade' | 'nome' | 'cidade';

export default function Carteira({ data, abrirCliente, irRota }: { data: string; abrirCliente: (codigo: string) => void; irRota: () => void }) {
  const todos = useLiveQuery(() => db.clientes.toArray(), []) ?? [];
  const rota = useLiveQuery(() => db.rotas.get(data), [data]);
  const naRota = useMemo(() => new Set(rota?.paradas.map((p) => p.codigo) ?? []), [rota]);

  const [f, setF] = useState<Filtros>(FILTROS_VAZIOS);
  const [ordem, setOrdem] = useState<Ordem>('prioridade');
  const [foraCarteira, setForaCarteira] = useState(false);
  const [limite, setLimite] = useState(80);
  const [soSelecionados, setSoSelecionados] = useState(false);
  const [verSelecionados, setVerSelecionados] = useState(false);

  const hoje = hojeISO();
  const base = useMemo(() => todos.filter((c) => (foraCarteira ? !c.ativo : c.ativo)), [todos, foraCarteira]);
  const prio = useMemo(() => new Map(base.map((c) => [c.codigo, calcularPrioridade(c, hoje)])), [base, hoje]);

  // Opções em cascata, com a quantidade de clientes em cada uma
  const contar = (lista: Cliente[], chave: (c: Cliente) => string, rotulo: (c: Cliente) => string): Opcao[] => {
    const m = new Map<string, Opcao>();
    for (const c of lista) {
      const k = chave(c);
      const o = m.get(k);
      if (o) o.qtd!++; else m.set(k, { valor: k, rotulo: rotulo(c), qtd: 1 });
    }
    return [...m.values()].sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
  };
  const micros = useMemo(() => contar(base, (c) => c.micro, (c) => titulo(c.micro)), [base]);
  const cidades = useMemo(() => contar(base.filter((c) => passaLugar(c, f, 'micro')), (c) => c.cidade, (c) => titulo(c.cidade)), [base, f]);
  const bairros = useMemo(() => {
    const lista = base.filter((c) => passaLugar(c, f, 'cidade'));
    const variasCidades = new Set(lista.map((c) => c.cidade)).size > 1;
    return contar(lista, chaveBairro, (c) => (variasCidades ? `${titulo(c.bairro)} · ${titulo(c.cidade)}` : titulo(c.bairro)));
  }, [base, f]);

  const contagem = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of base) if (passaLugar(c, f)) { const n = prio.get(c.codigo)!.nivel; m[n] = (m[n] ?? 0) + 1; }
    return m;
  }, [base, prio, f]);

  const lista = useMemo(() => {
    const r = base.filter((c) => (soSelecionados ? naRota.has(c.codigo) : passaFiltros(c, f, prio.get(c.codigo)!)));
    const porNome = (a: Cliente, b: Cliente) => a.fantasia.localeCompare(b.fantasia);
    r.sort(ordem === 'prioridade' ? (a, b) => prio.get(a.codigo)!.ordem - prio.get(b.codigo)!.ordem || porNome(a, b)
      : ordem === 'cidade' ? (a, b) => a.cidade.localeCompare(b.cidade) || a.bairro.localeCompare(b.bairro) || porNome(a, b)
      : porNome);
    return r;
  }, [base, f, ordem, prio, soSelecionados, naRota]);

  const mudar = (p: Partial<Filtros>) => { setSoSelecionados(false); setLimite(80); setF((atual) => podarLugar(base, { ...atual, ...p })); };
  const alternarEm = <T,>(lista: T[], v: T) => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);
  const qtdFiltros = filtrosAtivos(f);
  const FIN: { id: FiltroFin; rotulo: string }[] = [
    { id: 'ok', rotulo: '✅ Sem pendência' }, { id: 'cliente', rotulo: '🔴 Do cliente' }, { id: 'grupo', rotulo: '🟠 Do grupo' }
  ];

  const porCodigo = useMemo(() => new Map(todos.map((c) => [c.codigo, c])), [todos]);
  const selecionados = (rota?.paradas ?? []).map((p) => ({ p, c: porCodigo.get(p.codigo) })).filter((x): x is { p: typeof x.p; c: Cliente } => !!x.c);

  if (!todos.length) {
    return <div className="vazio"><p>Nenhum cliente ainda.</p><p>Vá em <b>Ajustes → Importar planilha</b> para carregar a carteira.</p></div>;
  }

  return (
    <div>
      <div className="faixa-plano">Toque em <b>＋</b> para adicionar à rota de <b>{nomeDia(data)}</b> · {naRota.size} na rota</div>
      <input className="busca" type="search" placeholder="Buscar nome, código, rede, bairro…" value={f.busca} onChange={(e) => mudar({ busca: e.target.value })} />

      <div className="chips">
        {naRota.size > 0 && (
          <button className={`chip chip-sel ${soSelecionados ? 'ativo' : ''}`} onClick={() => setSoSelecionados(!soSelecionados)}>✓ Só selecionados ({naRota.size})</button>
        )}
        <button className={`chip ${!f.niveis.length && !soSelecionados ? 'ativo' : ''}`} onClick={() => mudar({ niveis: [] })}>Todos</button>
        {(Object.keys(NIVEIS) as NivelPrioridade[]).map((n) => (
          <button key={n} className={`chip ${f.niveis.includes(n) && !soSelecionados ? 'ativo' : ''}`} onClick={() => mudar({ niveis: alternarEm(f.niveis, n) })}>
            {NIVEIS[n].emoji} {NIVEIS[n].rotulo} {contagem[n] ? `(${contagem[n]})` : ''}
          </button>
        ))}
      </div>

      <div className="filtros">
        <Escolha rotuloCampo="Microrregião" vazio="Todas" valores={f.micros} opcoes={micros} aoMudar={(v) => mudar({ micros: v })} />
        <Escolha rotuloCampo="Cidade" vazio="Todas" valores={f.cidades} opcoes={cidades} aoMudar={(v) => mudar({ cidades: v })} />
        <Escolha rotuloCampo="Bairro" vazio="Todos" valores={f.bairros} opcoes={bairros} aoMudar={(v) => mudar({ bairros: v })} />
        <div className="chips quebra" style={{ gridColumn: "1 / -1" }}>
          <span className="chips-rotulo">💲 Financeiro:</span>
          {FIN.map((x) => (
            <button key={x.id} className={`chip ${f.fin.includes(x.id) ? 'ativo' : ''}`} onClick={() => mudar({ fin: alternarEm(f.fin, x.id) })}>{x.rotulo}</button>
          ))}
        </div>
        <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)}>
          <option value="prioridade">Ordenar: prioridade</option>
          <option value="cidade">Ordenar: cidade/bairro</option>
          <option value="nome">Ordenar: nome</option>
        </select>
        <label className="check"><input type="checkbox" checked={foraCarteira} onChange={(e) => setForaCarteira(e.target.checked)} /> Mostrar quem saiu da carteira</label>
      </div>

      <div className="limpar-filtros">
        <span>{lista.length} cliente(s){qtdFiltros ? ` · ${qtdFiltros} filtro(s)` : ''}</span>
        {qtdFiltros > 0 && <button className="btn-link" onClick={() => { setF(FILTROS_VAZIOS); setSoSelecionados(false); }}>Limpar filtros</button>}
      </div>
      <ul className="lista">
        {lista.slice(0, limite).map((c) => (
          <li key={c.codigo} className="item">
            <div className="item-corpo" onClick={() => abrirCliente(c.codigo)}>
              <div className="item-titulo">{c.fantasia} <span className="cod">{c.codigo}</span></div>
              <div className="item-sub">{titulo(c.bairro)} · {titulo(c.cidade)}{c.rede ? ` · ${c.rede.replace(/^\S+\s/, '')}` : ''}</div>
              <div className="selos"><SeloPrioridade c={c} /><SeloFinanceiro c={c} /><SeloLocal c={c} /></div>
            </div>
            {c.ativo ? (
              <button className={`btn-add ${naRota.has(c.codigo) ? 'na-rota' : ''}`} onClick={() => alternarNaRota(data, c.codigo)} aria-label="Adicionar à rota">
                {naRota.has(c.codigo) ? '✓' : '＋'}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {lista.length > limite && <button className="btn btn-sec btn-bloco" onClick={() => setLimite(limite + 100)}>Mostrar mais ({lista.length - limite})</button>}
      {soSelecionados && !lista.length && <div className="vazio">Nenhum cliente selecionado.</div>}

      {naRota.size > 0 && (
        <div className="barra-selecionados">
          <button className="barra-sel-info" onClick={() => setVerSelecionados(true)}>
            <b>✓ {naRota.size} na rota</b><small>{nomeDia(data)} · tocar para ver/desmarcar</small>
          </button>
          <button className="btn btn-peq" onClick={irRota}>Ver rota ›</button>
        </div>
      )}

      <Folha aberta={verSelecionados} aoFechar={() => setVerSelecionados(false)} titulo={`Na rota de ${nomeDia(data)} (${naRota.size})`}>
        <ul className="lista-sel">
          {selecionados.map(({ p, c }) => (
            <li key={c.codigo}>
              <div className="lista-sel-nome" onClick={() => { setVerSelecionados(false); abrirCliente(c.codigo); }}>
                <b>{c.fantasia}</b><small>{titulo(c.bairro)} · {titulo(c.cidade)}{p.resultado ? ' · já visitado' : ''}</small>
              </div>
              <button className="btn-desmarcar" aria-label={`Desmarcar ${c.fantasia}`}
                onClick={() => (!p.resultado || confirm(`${c.fantasia} já tem visita registrada. Tirar da rota mesmo assim?`)) && alternarNaRota(data, c.codigo)}>✕</button>
            </li>
          ))}
        </ul>
        {!selecionados.length && <p className="nota-peq">Nenhum cliente na rota.</p>}
        <div className="botoes">
          <button className="btn" onClick={() => { setVerSelecionados(false); irRota(); }}>Ver rota ›</button>
          {selecionados.some((x) => !x.p.resultado) && (
            <button className="btn btn-sec" onClick={async () => {
              if (!confirm('Desmarcar todos os clientes ainda não visitados deste dia?')) return;
              await desmarcarTodos(data); setSoSelecionados(false); setVerSelecionados(false);
            }}>Desmarcar todos</button>
          )}
        </div>
      </Folha>
    </div>
  );
}
