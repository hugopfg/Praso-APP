import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const TILES = {
  claro: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  escuro: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
};
const ATRIB = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// Chave do Google Maps vem do .env.local (VITE_GOOGLE_KEY ou VITE_GOOGLE_MAPS_API_KEY).
// Sem chave, ou se o Google recusar, o app usa o mapa alternativo (Leaflet + OpenStreetMap).
const CHAVE_GOOGLE = import.meta.env.VITE_GOOGLE_KEY || import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';

// itens: [{ id, lat, lng, cor, rotulo, nome }]
// rota: liga os pinos na ordem com linha tracejada
export default function Mapa(props) {
  const [erro, setErro] = useState('');
  const falhou = useCallback((msg) => {
    console.warn('[Mapa] Google Maps indisponível:', msg);
    setErro(msg);
  }, []);
  if (CHAVE_GOOGLE && !erro) return <MapaGoogle {...props} chave={CHAVE_GOOGLE} falhou={falhou} />;
  return <MapaLeaflet {...props} />;
}

/* ---------- Google Maps ---------- */

let carregando = null;
function carregarGoogle(chave) {
  if (window.google?.maps?.importLibrary) return Promise.resolve();
  if (!carregando) {
    carregando = new Promise((ok, erro) => {
      const cb = '__prasoMapsPronto';
      window[cb] = () => ok();
      const s = document.createElement('script');
      s.src =
        `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(chave)}` +
        `&v=weekly&loading=async&language=pt-BR&region=BR&callback=${cb}`;
      s.async = true;
      s.onerror = () => {
        carregando = null;
        erro(new Error('não foi possível carregar o script do Google Maps'));
      };
      document.head.appendChild(s);
    });
  }
  return carregando;
}

function elementoPino(it) {
  const el = document.createElement('span');
  el.className = `pin${it.rotulo ? ' pin-num' : ''}`;
  const tam = it.rotulo ? 28 : 18;
  Object.assign(el.style, {
    background: it.cor, width: `${tam}px`, height: `${tam}px`, transform: 'translateY(50%)', cursor: 'pointer',
  });
  el.textContent = it.rotulo ?? '';
  return el;
}

function MapaGoogle({ itens, rota = false, aoTocar, classe = '', localizar = false, chave, falhou }) {
  const caixa = useRef(null);
  const mapa = useRef(null);
  const Marcador = useRef(null);
  const marcadores = useRef([]);
  const linha = useRef(null);
  const eu = useRef(null);
  const [pronto, setPronto] = useState(false);
  const [aviso, setAviso] = useState('');

  // Carrega a API e cria o mapa uma vez
  useEffect(() => {
    let vivo = true;
    // O Google chama esta função quando a chave é inválida ou não autorizada para o domínio
    window.gm_authFailure = () => falhou('chave recusada (confira restrições de domínio e API)');
    carregarGoogle(chave)
      .then(async () => {
        const { Map } = await window.google.maps.importLibrary('maps');
        const { AdvancedMarkerElement } = await window.google.maps.importLibrary('marker');
        if (!vivo) return;
        Marcador.current = AdvancedMarkerElement;
        mapa.current = new Map(caixa.current, {
          center: { lat: -8.05, lng: -34.9 },
          zoom: 13,
          mapId: MAP_ID,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          // No mapa embutido na lista, um dedo rola a página; no mapa de tela cheia, move o mapa
          gestureHandling: localizar ? 'greedy' : 'cooperative',
          colorScheme: 'FOLLOW_SYSTEM',
        });
        setPronto(true);
      })
      .catch((e) => falhou(e.message));
    return () => { vivo = false; };
  }, [chave, falhou, localizar]);

  // Redesenha pinos e rota quando a lista muda
  useEffect(() => {
    if (!pronto) return;
    const g = window.google.maps;
    const m = mapa.current;
    marcadores.current.forEach((mk) => { mk.map = null; });
    marcadores.current = [];
    if (linha.current) { linha.current.setMap(null); linha.current = null; }
    if (!itens.length) return;

    const limites = new g.LatLngBounds();
    itens.forEach((it) => {
      const pos = { lat: it.lat, lng: it.lng };
      const mk = new Marcador.current({ map: m, position: pos, content: elementoPino(it), title: it.nome });
      mk.addListener('click', () => aoTocar?.(it.id));
      marcadores.current.push(mk);
      limites.extend(pos);
    });

    if (rota && itens.length > 1) {
      linha.current = new g.Polyline({
        map: m,
        path: itens.map((it) => ({ lat: it.lat, lng: it.lng })),
        strokeOpacity: 0,
        icons: [{
          icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, strokeColor: '#3d6ef0', scale: 3 },
          offset: '0',
          repeat: '14px',
        }],
      });
    }

    if (itens.length === 1) {
      m.setCenter({ lat: itens[0].lat, lng: itens[0].lng });
      m.setZoom(16);
    } else {
      m.fitBounds(limites, 40);
    }
  }, [pronto, itens, rota, aoTocar]);

  function minhaLocalizacao() {
    if (!navigator.geolocation || !pronto) {
      setAviso('Localização indisponível neste aparelho.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const pos = { lat: coords.latitude, lng: coords.longitude };
        if (eu.current) eu.current.position = pos;
        else {
          const ponto = document.createElement('span');
          ponto.className = 'pin-eu';
          eu.current = new Marcador.current({ map: mapa.current, position: pos, content: ponto, title: 'Você está aqui' });
        }
        mapa.current.setCenter(pos);
        mapa.current.setZoom(15);
        setAviso('');
      },
      () => setAviso('Permita a localização para ver onde você está.'),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  return (
    <div className={`mapa ${classe}`}>
      <div ref={caixa} className="mapa-caixa" role="region" aria-label="Mapa dos estabelecimentos" />
      {!pronto && <p className="mapa-carregando">Carregando mapa…</p>}
      {localizar && (
        <button className="btn-local" onClick={minhaLocalizacao}>Minha localização</button>
      )}
      {aviso && <p className="mapa-aviso">{aviso}</p>}
    </div>
  );
}

/* ---------- Mapa alternativo (Leaflet + OpenStreetMap) ---------- */

function MapaLeaflet({ itens, rota = false, aoTocar, classe = '', localizar = false }) {
  const caixa = useRef(null);
  const mapa = useRef(null);
  const camada = useRef(null);
  const eu = useRef(null);
  const [aviso, setAviso] = useState('');

  // Cria o mapa uma vez
  useEffect(() => {
    const escuro = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const m = L.map(caixa.current, { zoomControl: false, attributionControl: true });
    L.tileLayer(escuro ? TILES.escuro : TILES.claro, { attribution: ATRIB, maxZoom: 19 }).addTo(m);
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    camada.current = L.layerGroup().addTo(m);
    mapa.current = m;
    return () => m.remove();
  }, []);

  // Redesenha pinos quando a lista muda
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    camada.current.clearLayers();
    if (!itens.length) {
      m.setView([-8.05, -34.9], 13);
      return;
    }
    const pontos = itens.map((it) => [it.lat, it.lng]);
    if (rota && pontos.length > 1) {
      L.polyline(pontos, { color: '#3d6ef0', weight: 3, dashArray: '6 8', opacity: 0.8 }).addTo(camada.current);
    }
    itens.forEach((it) => {
      const icone = L.divIcon({
        className: '',
        html: `<span class="pin${it.rotulo ? ' pin-num' : ''}" style="background:${it.cor}">${it.rotulo ?? ''}</span>`,
        iconSize: it.rotulo ? [28, 28] : [18, 18],
        iconAnchor: it.rotulo ? [14, 14] : [9, 9],
      });
      L.marker([it.lat, it.lng], { icon: icone, keyboard: true, title: it.nome })
        .on('click', () => aoTocar?.(it.id))
        .addTo(camada.current);
    });
    const enquadrar = () => m.fitBounds(L.latLngBounds(pontos), { padding: [28, 28], maxZoom: 16 });
    enquadrar();
    // O mapa pode nascer num contêiner que ainda está ganhando tamanho: recalcula e reenquadra
    const t = setTimeout(() => { m.invalidateSize(); enquadrar(); }, 80);
    return () => clearTimeout(t);
  }, [itens, rota, aoTocar]);

  function minhaLocalizacao() {
    if (!navigator.geolocation) {
      setAviso('Localização indisponível neste aparelho.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const pos = [coords.latitude, coords.longitude];
        if (eu.current) eu.current.setLatLng(pos);
        else
          eu.current = L.circleMarker(pos, {
            radius: 8, color: '#ffffff', weight: 3, fillColor: '#2563eb', fillOpacity: 1,
          }).addTo(mapa.current);
        mapa.current.setView(pos, 15);
        setAviso('');
      },
      () => setAviso('Permita a localização para ver onde você está.'),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  return (
    <div className={`mapa ${classe}`}>
      <div ref={caixa} className="mapa-caixa" role="region" aria-label="Mapa dos estabelecimentos" />
      {localizar && (
        <button className="btn-local" onClick={minhaLocalizacao}>Minha localização</button>
      )}
      {aviso && <p className="mapa-aviso">{aviso}</p>}
    </div>
  );
}
