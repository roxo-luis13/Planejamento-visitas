import { useMemo, useRef, useState } from 'react';
import { normalizar } from '../lib/texto';

export interface Opcao { valor: string; rotulo: string; qtd?: number }

/**
 * Campo de escolha MÚLTIPLA com busca: toque, digite parte do nome e marque
 * quantas opções quiser. Ignora acentos e maiúsculas.
 */
export default function Escolha({ valores, opcoes, vazio, aoMudar, rotuloCampo }: {
  valores: string[];
  opcoes: Opcao[];
  vazio: string;                       // ex: "Todas"
  aoMudar: (v: string[]) => void;
  rotuloCampo: string;                 // ex: "Cidade"
}) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const campo = useRef<HTMLInputElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const marcados = new Set(valores);
  const rotuloDe = (v: string) => opcoes.find((o) => o.valor === v)?.rotulo ?? v;

  const filtradas = useMemo(() => {
    const partes = normalizar(texto).split(' ').filter(Boolean);
    const lista = partes.length ? opcoes.filter((o) => { const r = normalizar(o.rotulo); return partes.every((p) => r.includes(p)); }) : opcoes;
    // marcados primeiro, para ver e desmarcar fácil
    return [...lista.filter((o) => marcados.has(o.valor)), ...lista.filter((o) => !marcados.has(o.valor))];
  }, [opcoes, texto, valores]); // eslint-disable-line react-hooks/exhaustive-deps
  const LIMITE = 80;

  function alternar(v: string) {
    aoMudar(marcados.has(v) ? valores.filter((x) => x !== v) : [...valores, v]);
  }
  function abrir() {
    setAberto(true);
    setTimeout(() => caixa.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 250);
  }
  function fechar() { setAberto(false); setTexto(''); campo.current?.blur(); }

  return (
    <div ref={caixa} className={`escolha ${valores.length ? 'com-valor' : ''} ${aberto ? 'aberta' : ''}`}>
      <div className="escolha-topo" onClick={() => campo.current?.focus()}>
        <span className="escolha-rotulo">{rotuloCampo}</span>
        <div className="escolha-campo">
          {valores.map((v) => (
            <span key={v} className="etiqueta">
              {rotuloDe(v)}
              <button aria-label={`Tirar ${rotuloDe(v)}`} onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); alternar(v); }}>✕</button>
            </span>
          ))}
          <input
            ref={campo}
            type="search"
            enterKeyHint="done"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={texto}
            placeholder={valores.length ? (aberto ? 'Digite para adicionar…' : '') : aberto ? 'Digite para buscar…' : vazio}
            onFocus={abrir}
            onBlur={() => setTimeout(() => { setAberto(false); setTexto(''); }, 150)}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); if (texto && filtradas[0]) { alternar(filtradas[0].valor); setTexto(''); } else fechar(); }
              if (e.key === 'Escape') fechar();
              if (e.key === 'Backspace' && !texto && valores.length) aoMudar(valores.slice(0, -1));
            }}
          />
        </div>
      </div>
      {aberto && (
        <div className="escolha-lista" onMouseDown={(e) => e.preventDefault()}>
          <div className="escolha-acoes">
            <span>{valores.length ? `${valores.length} marcado(s)` : 'Marque uma ou mais'}</span>
            {valores.length > 0 && <button className="btn-link" onClick={() => aoMudar([])}>Limpar</button>}
            <button className="btn btn-peq" onClick={fechar}>Pronto</button>
          </div>
          <ul>
            {filtradas.slice(0, LIMITE).map((o) => (
              <li key={o.valor}>
                <button className={marcados.has(o.valor) ? 'sel' : ''} onClick={() => alternar(o.valor)}>
                  <span className="caixa-marcar">{marcados.has(o.valor) ? '✓' : ''}</span>
                  <span className="escolha-texto">{o.rotulo}</span>
                  {o.qtd !== undefined && <small>{o.qtd}</small>}
                </button>
              </li>
            ))}
            {!filtradas.length && <li className="escolha-nada">Nada encontrado para “{texto}”</li>}
            {filtradas.length > LIMITE && <li className="escolha-nada">+{filtradas.length - LIMITE}… continue digitando</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
