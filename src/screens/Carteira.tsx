import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Cliente } from '../types';
import { alertaFinanceiro, calcularPrioridade, NIVEIS, type NivelPrioridade } from '../lib/prioridade';
import { hojeISO, nomeDia, normalizar, titulo } from '../lib/texto';
import { alternarNaRota } from '../lib/acoes';
import { SeloFinanceiro, SeloLocal, SeloPrioridade } from '../components/Selos';

type Ordem = 'prioridade' | 'nome' | 'cidade';

export default function Carteira({ data, abrirCliente }: { data: string; abrirCliente: (codigo: string) => void }) {
  const todos = useLiveQuery(() => db.clientes.toArray(), []) ?? [];
  const rota = useLiveQuery(() => db.rotas.get(data), [data]);
  const naRota = useMemo(() => new Set(rota?.paradas.map((p) => p.codigo) ?? []), [rota]);

  const [busca, setBusca] = useState('');
  const [nivel, setNivel] = useState<NivelPrioridade | 'todos'>('todos');
  const [soFin, setSoFin] = useState<'todos' | 'com' | 'sem'>('todos');
  const [micro, setMicro] = useState('');
  const [cidade, setCidade] = useState('');
  const [bairro, setBairro] = useState('');
  const [ordem, setOrdem] = useState<Ordem>('prioridade');
  const [foraCarteira, setForaCarteira] = useState(false);
  const [limite, setLimite] = useState(80);

  const hoje = hojeISO();
  const base = useMemo(() => todos.filter((c) => (foraCarteira ? !c.ativo : c.ativo)), [todos, foraCarteira]);
  const prio = useMemo(() => new Map(base.map((c) => [c.codigo, calcularPrioridade(c, hoje)])), [base, hoje]);

  const micros = useMemo(() => [...new Set(base.map((c) => c.micro))].sort(), [base]);
  const cidades = useMemo(() => [...new Set(base.filter((c) => !micro || c.micro === micro).map((c) => c.cidade))].sort(), [base, micro]);
  const bairros = useMemo(() => [...new Set(base.filter((c) => (!micro || c.micro === micro) && (!cidade || c.cidade === cidade)).map((c) => c.bairro))].sort(), [base, micro, cidade]);

  const contagem = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of base) if ((!micro || c.micro === micro) && (!cidade || c.cidade === cidade)) {
      const n = prio.get(c.codigo)!.nivel; m[n] = (m[n] ?? 0) + 1;
    }
    return m;
  }, [base, prio, micro, cidade]);

  const lista = useMemo(() => {
    const q = normalizar(busca);
    const r = base.filter((c) => {
      if (micro && c.micro !== micro) return false;
      if (cidade && c.cidade !== cidade) return false;
      if (bairro && c.bairro !== bairro) return false;
      if (nivel !== 'todos' && prio.get(c.codigo)!.nivel !== nivel) return false;
      if (soFin !== 'todos') {
        const tem = alertaFinanceiro(c).nivel !== 'ok';
        if ((soFin === 'com') !== tem) return false;
      }
      if (q) {
        const alvo = normalizar(`${c.fantasia} ${c.razao} ${c.codigo} ${c.grupo} ${c.rede} ${c.bairro} ${c.cidade}`);
        if (!q.split(' ').every((p) => alvo.includes(p))) return false;
      }
      return true;
    });
    const porNome = (a: Cliente, b: Cliente) => a.fantasia.localeCompare(b.fantasia);
    r.sort(ordem === 'prioridade' ? (a, b) => prio.get(a.codigo)!.ordem - prio.get(b.codigo)!.ordem || porNome(a, b)
      : ordem === 'cidade' ? (a, b) => a.cidade.localeCompare(b.cidade) || a.bairro.localeCompare(b.bairro) || porNome(a, b)
      : porNome);
    return r;
  }, [base, busca, micro, cidade, bairro, nivel, soFin, ordem, prio]);

  if (!todos.length) {
    return <div className="vazio"><p>Nenhum cliente ainda.</p><p>Vá em <b>Ajustes → Importar planilha</b> para carregar a carteira.</p></div>;
  }

  return (
    <div>
      <div className="faixa-plano">Toque em <b>＋</b> para adicionar à rota de <b>{nomeDia(data)}</b> · {naRota.size} na rota</div>
      <input className="busca" type="search" placeholder="Buscar nome, código, rede, bairro…" value={busca} onChange={(e) => { setBusca(e.target.value); setLimite(80); }} />

      <div className="chips">
        <button className={`chip ${nivel === 'todos' ? 'ativo' : ''}`} onClick={() => setNivel('todos')}>Todos</button>
        {(Object.keys(NIVEIS) as NivelPrioridade[]).map((n) => (
          <button key={n} className={`chip ${nivel === n ? 'ativo' : ''}`} onClick={() => setNivel(n)}>
            {NIVEIS[n].emoji} {NIVEIS[n].rotulo} {contagem[n] ? `(${contagem[n]})` : ''}
          </button>
        ))}
      </div>

      <div className="filtros">
        <select value={micro} onChange={(e) => { setMicro(e.target.value); setCidade(''); setBairro(''); }}>
          <option value="">Todas as microrregiões</option>
          {micros.map((m) => <option key={m} value={m}>{titulo(m)}</option>)}
        </select>
        <select value={cidade} onChange={(e) => { setCidade(e.target.value); setBairro(''); }}>
          <option value="">Todas as cidades</option>
          {cidades.map((m) => <option key={m} value={m}>{titulo(m)}</option>)}
        </select>
        <select value={bairro} onChange={(e) => setBairro(e.target.value)}>
          <option value="">Todos os bairros</option>
          {bairros.map((m) => <option key={m} value={m}>{titulo(m)}</option>)}
        </select>
        <select value={soFin} onChange={(e) => setSoFin(e.target.value as typeof soFin)}>
          <option value="todos">Financeiro: todos</option>
          <option value="com">Com alerta financeiro</option>
          <option value="sem">Sem alerta financeiro</option>
        </select>
        <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)}>
          <option value="prioridade">Ordenar: prioridade</option>
          <option value="cidade">Ordenar: cidade/bairro</option>
          <option value="nome">Ordenar: nome</option>
        </select>
        <label className="check"><input type="checkbox" checked={foraCarteira} onChange={(e) => setForaCarteira(e.target.checked)} /> Mostrar quem saiu da carteira</label>
      </div>

      <div className="contador">{lista.length} cliente(s)</div>
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
    </div>
  );
}
