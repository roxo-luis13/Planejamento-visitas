import { useMemo, useRef, useState } from 'react';
import { normalizar } from '../lib/texto';

export interface Opcao { valor: string; rotulo: string; qtd?: number }

/**
 * Campo de escolha com busca: toque, digite parte do nome e escolha.
 * Ignora acentos e maiúsculas ("sao jose" acha "São José dos Campos").
 */
export default function Escolha({ valor, opcoes, vazio, aoMudar, rotuloCampo }: {
  valor: string;
  opcoes: Opcao[];
  vazio: string;              // texto quando nada está escolhido (ex: "Todas as cidades")
  aoMudar: (v: string) => void;
  rotuloCampo: string;        // ex: "Cidade"
}) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const campo = useRef<HTMLInputElement>(null);
  const atual = opcoes.find((o) => o.valor === valor);

  const filtradas = useMemo(() => {
    const partes = normalizar(texto).split(' ').filter(Boolean);
    if (!partes.length) return opcoes;
    return opcoes.filter((o) => { const r = normalizar(o.rotulo); return partes.every((p) => r.includes(p)); });
  }, [opcoes, texto]);
  const LIMITE = 60;

  function escolher(v: string) {
    aoMudar(v);
    setAberto(false);
    setTexto('');
    campo.current?.blur();
  }

  return (
    <div className={`escolha ${valor ? 'com-valor' : ''}`}>
      <span className="escolha-rotulo">{rotuloCampo}</span>
      <input
        ref={campo}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={aberto ? texto : atual?.rotulo ?? ''}
        placeholder={aberto ? 'Digite para buscar…' : vazio}
        onFocus={(e) => { setAberto(true); setTexto(''); const caixa = e.target.parentElement; setTimeout(() => caixa?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 250); }}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && filtradas[0]) { e.preventDefault(); escolher(filtradas[0].valor); }
          if (e.key === 'Escape') campo.current?.blur();
        }}
      />
      {valor && !aberto && (
        <button className="escolha-limpar" aria-label={`Limpar ${rotuloCampo}`} onClick={() => aoMudar('')}>✕</button>
      )}
      {aberto && (
        <ul className="escolha-lista" onMouseDown={(e) => e.preventDefault()}>
          {!texto && <li><button onClick={() => escolher('')}><i>{vazio}</i></button></li>}
          {filtradas.slice(0, LIMITE).map((o) => (
            <li key={o.valor}>
              <button className={o.valor === valor ? 'sel' : ''} onClick={() => escolher(o.valor)}>
                <span>{o.rotulo}</span>{o.qtd !== undefined && <small>{o.qtd}</small>}
              </button>
            </li>
          ))}
          {!filtradas.length && <li className="escolha-nada">Nada encontrado para “{texto}”</li>}
          {filtradas.length > LIMITE && <li className="escolha-nada">+{filtradas.length - LIMITE}… continue digitando</li>}
        </ul>
      )}
    </div>
  );
}
