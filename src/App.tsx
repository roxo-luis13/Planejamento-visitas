import { useEffect, useState } from 'react';
import Hoje from './screens/Hoje';
import Carteira from './screens/Carteira';
import ClienteTela from './screens/ClienteTela';
import Ajustes from './screens/Ajustes';
import { hojeISO } from './lib/texto';
import { iniciarFila } from './lib/filaGeo';

type Aba = 'hoje' | 'carteira' | 'ajustes';

const ehIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const instalado = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

export default function App() {
  const [aba, setAba] = useState<Aba>('hoje');
  const [data, setData] = useState(hojeISO());
  const [cliente, setCliente] = useState<string | null>(null);
  const [dicaInstalar, setDicaInstalar] = useState(ehIOS && !instalado && !localStorage.getItem('dica-instalar-fechada'));

  useEffect(() => {
    // Pede ao navegador para não apagar os dados do app
    void navigator.storage?.persist?.();
    void iniciarFila();
  }, []);

  // Botão "voltar" do sistema fecha a ficha do cliente
  useEffect(() => {
    const aoVoltar = () => setCliente(null);
    window.addEventListener('popstate', aoVoltar);
    return () => window.removeEventListener('popstate', aoVoltar);
  }, []);
  function abrirCliente(codigo: string) {
    history.pushState({ cliente: codigo }, '');
    setCliente(codigo);
    window.scrollTo(0, 0);
  }
  function fecharCliente() {
    if (history.state?.cliente) history.back(); else setCliente(null);
  }
  function irPara(a: Aba) { setCliente(null); setAba(a); window.scrollTo(0, 0); }

  const titulos: Record<Aba, string> = { hoje: 'Rota do dia', carteira: 'Carteira', ajustes: 'Ajustes' };

  return (
    <div className="app">
      {!cliente && <header className="cabecalho"><h1>{titulos[aba]}</h1></header>}
      {dicaInstalar && (
        <div className="dica-instalar">
          <span>Para usar como app: toque em <b>Compartilhar</b> e depois <b>Adicionar à Tela de Início</b>. Assim seus dados ficam guardados.</span>
          <button className="btn-link" onClick={() => { localStorage.setItem('dica-instalar-fechada', '1'); setDicaInstalar(false); }}>OK</button>
        </div>
      )}
      <main className="conteudo">
        {cliente ? <ClienteTela codigo={cliente} data={data} voltar={fecharCliente} />
          : aba === 'hoje' ? <Hoje data={data} setData={setData} abrirCliente={abrirCliente} irCarteira={() => irPara('carteira')} />
          : aba === 'carteira' ? <Carteira data={data} abrirCliente={abrirCliente} />
          : <Ajustes />}
      </main>
      <nav className="abas">
        {([['hoje', '🗺️', 'Rota'], ['carteira', '👥', 'Carteira'], ['ajustes', '⚙️', 'Ajustes']] as const).map(([id, ic, rot]) => (
          <button key={id} className={aba === id && !cliente ? 'ativa' : ''} onClick={() => irPara(id)}>
            <span className="aba-icone">{ic}</span><span>{rot}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
