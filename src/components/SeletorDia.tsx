import type { ReactNode } from 'react';
import { hojeISO, nomeDia, somarDias } from '../lib/texto';

/** "Hoje, 01/11" / "Amanhã, 02/11" / "Terça-feira, 10/11" */
export function rotuloDia(data: string): string {
  const hoje = hojeISO();
  const nome = data === hoje ? 'Hoje' : data === somarDias(hoje, 1) ? 'Amanhã' : data === somarDias(hoje, -1) ? 'Ontem'
    : nomeDia(data).split(',')[0].replace(/^./, (l) => l.toUpperCase());
  return `${nome}, ${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

/** Cartão do dia (Rota e Carteira): setas para trocar o dia e toque no nome para abrir o calendário. */
export default function SeletorDia({ data, setData, legenda, children }: {
  data: string; setData: (d: string) => void; legenda: string; children?: ReactNode;
}) {
  return (
    <div className="plano-dia">
      <div className="plano-dia-nav">
        <button className="btn-icone" aria-label="Dia anterior" onClick={() => setData(somarDias(data, -1))}>‹</button>
        <label className="plano-dia-meio">
          <small>{legenda}</small>
          <b>{rotuloDia(data)} ▾</b>
          <input type="date" value={data} aria-label="Escolher o dia" onChange={(e) => e.target.value && setData(e.target.value)} />
        </label>
        <button className="btn-icone" aria-label="Próximo dia" onClick={() => setData(somarDias(data, 1))}>›</button>
      </div>
      {children && <div className="plano-dia-rodape">{children}</div>}
    </div>
  );
}
