import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { gerarExcel, intervalo, PERIODOS, type Periodo } from '../lib/relatorio';
import { hojeISO } from '../lib/texto';

/** Exporta as visitas de um período para Excel (compartilhar no iPhone: e-mail, WhatsApp, Arquivos). */
export default function ExportarVisitas() {
  const [periodo, setPeriodo] = useState<Periodo>('este_mes');
  const [msg, setMsg] = useState('');
  const [ini, fim] = intervalo(periodo, hojeISO());
  const visitas = useLiveQuery(() => db.historico.where('data').between(ini, fim, true, true).filter((v) => !v.removido).toArray(), [ini, fim]) ?? [];
  const pedidos = visitas.filter((v) => v.resultado === 'pedido').length;

  async function exportar() {
    setMsg('Gerando planilha…');
    try {
      const clientes = new Map((await db.clientes.toArray()).map((c) => [c.codigo, c]));
      const rotulo = PERIODOS.find((p) => p.id === periodo)!.rotulo;
      const arquivo = await gerarExcel(visitas, clientes, rotulo);
      if (navigator.canShare?.({ files: [arquivo] })) {
        try { await navigator.share({ files: [arquivo], title: arquivo.name }); setMsg(''); return; } catch { /* cancelado */ }
      }
      const url = URL.createObjectURL(arquivo);
      const a = document.createElement('a'); a.href = url; a.download = arquivo.name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setMsg('Planilha gerada ✓');
    } catch (e) { setMsg('Erro ao gerar: ' + (e as Error).message); }
  }

  return (
    <section className="cartao">
      <h2>📊 Relatório de visitas</h2>
      <div className="chips quebra">
        {PERIODOS.map((p) => (
          <button key={p.id} className={`chip ${periodo === p.id ? 'ativo' : ''}`} onClick={() => setPeriodo(p.id)}>{p.rotulo}</button>
        ))}
      </div>
      <p className="nota-peq">{visitas.length} visita(s) no período · {pedidos} com pedido.</p>
      <button className="btn btn-bloco" onClick={exportar} disabled={!visitas.length}>⬇️ Exportar para Excel</button>
      <p className="nota-peq">Uma linha por visita: cliente, cidade, resultado, motivo, contato, assuntos, peças por marca, valor, nº do pedido, retorno e observação.</p>
      {msg && <div className="msg">{msg}</div>}
    </section>
  );
}
