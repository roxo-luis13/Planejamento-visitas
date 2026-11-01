import { useState } from 'react';
import { db } from '../db';
import type { Visita } from '../types';
import { gerarExcel } from '../lib/relatorio';

/** Exporta as visitas do período para Excel (compartilhar no iPhone: e-mail, WhatsApp, Arquivos). */
export default function ExportarVisitas({ visitas, nomePeriodo }: { visitas: Visita[]; nomePeriodo: string }) {
  const [msg, setMsg] = useState('');

  async function exportar() {
    setMsg('Gerando planilha…');
    try {
      const clientes = new Map((await db.clientes.toArray()).map((c) => [c.codigo, c]));
      const arquivo = await gerarExcel(visitas, clientes, nomePeriodo);
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
      <h2>⬇️ Exportar para Excel</h2>
      <p className="nota-peq">Uma linha por visita do período ({nomePeriodo.toLowerCase()}): cliente, cidade, resultado, motivo, contato, assuntos,
        peças por marca, valor, nº do pedido, retorno e observação.</p>
      <button className="btn btn-bloco" onClick={exportar} disabled={!visitas.length}>Exportar {visitas.length} visita(s)</button>
      {msg && <div className="msg">{msg}</div>}
    </section>
  );
}
