import { useState } from 'react';
import Folha from './Folha';
import { linkAppleMaps, linkGoogleMaps, linkWaze } from '../lib/navegar';

export default function BotaoNavegar({ lat, lng, nome, endereco, compacto }: { lat: number; lng: number; nome: string; endereco?: string | null; compacto?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const p = { lat, lng };
  return (
    <>
      <button className={compacto ? 'btn btn-sec btn-peq' : 'btn'} onClick={() => setAberto(true)}>🧭 Navegar</button>
      <Folha aberta={aberto} aoFechar={() => setAberto(false)} titulo={`Ir para ${nome}`}>
        {endereco && <p className="nota-peq">📍 {endereco}</p>}
        <a className="btn btn-bloco" href={linkAppleMaps(p, nome, endereco)} target="_blank" rel="noreferrer">Apple Mapas</a>
        <a className="btn btn-bloco" href={linkGoogleMaps(p, endereco)} target="_blank" rel="noreferrer">Google Maps</a>
        <a className="btn btn-bloco" href={linkWaze(p, endereco)} target="_blank" rel="noreferrer">Waze</a>
      </Folha>
    </>
  );
}
