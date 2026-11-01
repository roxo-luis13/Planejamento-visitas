import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface Marcador {
  id: string;
  lat: number;
  lng: number;
  rotulo: string;      // texto dentro do círculo (ex: número da parada)
  cor: string;
  titulo?: string;
  aproximado?: boolean;
}

interface Props {
  marcadores: Marcador[];
  linha?: { lat: number; lng: number }[];        // tracejada (estimativa em linha reta)
  tracado?: { lat: number; lng: number }[];      // traçado real pelas ruas (Google)
  arrastavel?: { lat: number; lng: number; aoMover: (lat: number, lng: number) => void } | null;
  aoTocar?: (id: string) => void;
  altura?: number;
}

const CENTRO_SP: L.LatLngExpression = [-23.55, -46.63];

/** Cor do tema atual (linhas do mapa em SVG não aceitam var(--...)). */
const corTema = (nome: string, padrao: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(nome).trim() || padrao;

export default function Mapa({ marcadores, linha, tracado, arrastavel, aoTocar, altura = 260 }: Props) {
  const div = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const camada = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!div.current || mapa.current) return;
    mapa.current = L.map(div.current, { zoomControl: false, attributionControl: true }).setView(CENTRO_SP, 10);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© OpenStreetMap'
    }).addTo(mapa.current);
    camada.current = L.layerGroup().addTo(mapa.current);
    return () => { mapa.current?.remove(); mapa.current = null; };
  }, []);

  useEffect(() => {
    const m = mapa.current, g = camada.current;
    if (!m || !g) return;
    g.clearLayers();
    const limites: L.LatLngExpression[] = [];
    if (linha && linha.length > 1) {
      L.polyline(linha.map((p): L.LatLngTuple => [p.lat, p.lng]), { color: corTema('--azul', '#0b5cad'), weight: 3, opacity: 0.7, dashArray: '6 6' }).addTo(g);
    }
    if (tracado && tracado.length > 1) {
      L.polyline(tracado.map((p): L.LatLngTuple => [p.lat, p.lng]), { color: corTema('--azul', '#0b5cad'), weight: 5, opacity: 0.85 }).addTo(g);
      tracado.forEach((p) => limites.push([p.lat, p.lng]));
    }
    for (const mk of marcadores) {
      const icone = L.divIcon({
        className: '',
        html: `<div class="pino${mk.aproximado ? ' aprox' : ''}" style="background:${mk.cor}">${mk.rotulo}</div>`,
        iconSize: [28, 28], iconAnchor: [14, 14]
      });
      const mark = L.marker([mk.lat, mk.lng], { icon: icone }).addTo(g);
      if (mk.titulo) mark.bindTooltip(mk.titulo);
      if (aoTocar) mark.on('click', () => aoTocar(mk.id));
      limites.push([mk.lat, mk.lng]);
    }
    if (arrastavel) {
      const mark = L.marker([arrastavel.lat, arrastavel.lng], {
        draggable: true,
        icon: L.divIcon({ className: '', html: '<div class="pino arrastar">✥</div>', iconSize: [36, 36], iconAnchor: [18, 18] })
      }).addTo(g);
      mark.on('dragend', () => { const p = mark.getLatLng(); arrastavel.aoMover(p.lat, p.lng); });
      limites.push([arrastavel.lat, arrastavel.lng]);
    }
    if (limites.length === 1) m.setView(limites[0], arrastavel ? 17 : 15, { animate: false });
    else if (limites.length > 1) m.fitBounds(L.latLngBounds(limites), { padding: [30, 30], maxZoom: 16, animate: false });
    // só ajusta se o mapa ainda estiver na tela (evita erro ao trocar de aba)
    setTimeout(() => { if (mapa.current === m) m.invalidateSize({ animate: false }); }, 50);
  }, [marcadores, linha, tracado, arrastavel, aoTocar]);

  return <div ref={div} className="mapa" style={{ height: altura }} />;
}
