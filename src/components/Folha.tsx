import type { ReactNode } from 'react';

/** Painel que sobe da parte de baixo da tela (estilo iOS). */
export default function Folha({ aberta, aoFechar, titulo, children }: { aberta: boolean; aoFechar: () => void; titulo: string; children: ReactNode }) {
  if (!aberta) return null;
  return (
    <div className="folha-fundo" onClick={aoFechar}>
      <div className="folha" onClick={(e) => e.stopPropagation()}>
        <div className="folha-alca" />
        <div className="folha-topo">
          <strong>{titulo}</strong>
          <button className="btn-link" onClick={aoFechar}>Fechar</button>
        </div>
        <div className="folha-corpo">{children}</div>
      </div>
    </div>
  );
}
