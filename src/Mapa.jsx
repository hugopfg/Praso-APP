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
const glifoTipo = (tipo, cor) => {
  const t = (tipo || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const estilo = `fill="none" stroke="${cor}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"`;
  if (t.includes('padaria')) return `<path ${estilo} d="M14 20v-3a2 2 0 0 1 2-2h1v-2h3v2h2v-2h3v2h1a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H16a2 2 0 0 1-2-2Z"/><path ${estilo} d="M18 16v2m4-2v2"/>`;
  if (t.includes('pizz')) return `<path ${estilo} d="m13 13 16 3-12 12-4-15Z"/><path ${estilo} d="m13 13 16 3M18 20h.01m4-1h.01m-2 5h.01"/><circle cx="18" cy="20" r="1" fill="${cor}"/><circle cx="22" cy="19" r="1" fill="${cor}"/>`;
  if (t.includes('cafeter') || t.includes('cafe')) return `<path ${estilo} d="M14 16h12v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4v-5Zm12 2h2a2 2 0 0 1 0 4h-2M17 12c-1 1 1 1 0 2m5-2c-1 1 1 1 0 2"/>`;
  if (t.includes('bar')) return `<path ${estilo} d="M15 13h14l-2 8a4 4 0 0 1-4 3h-2a4 4 0 0 1-4-3l-2-8Zm7 11v3m-4 0h8m-1-11h.01"/>`;
  if (t.includes('hamburg')) return `<path ${estilo} d="M14 17a8 8 0 0 1 16 0H14Zm1 2h14m-13 3h12l-1 3H16l-1-3Zm4-8h.01m4-1h.01m3 2h.01"/>`;
  // Restaurante e lanchonete usam o símbolo universal de refeição.
  return `<path ${estilo} d="M16 12v7m-3-7v4a3 3 0 0 0 6 0v-4m-3 7v9m9-16v16m0-16c-2 2-3 5-3 8h3"/>`;
};
const svgPino = (cor, tipo, rotulo = '') => `<svg class="pin-svg" viewBox="0 0 44 54" aria-hidden="true" focusable="false"><path d="M22 2C10.95 2 2 10.95 2 22c0 14.2 20 30 20 30s20-15.8 20-30C42 10.95 33.05 2 22 2Z" style="fill:${cor};stroke:#fff;stroke-width:2;stroke-linejoin:round"/><circle cx="22" cy="21" r="10.5" style="fill:#fff"/>${rotulo ? `<circle cx="36" cy="8" r="7" fill="#fff"/><circle cx="36" cy="8" r="5.5" fill="${cor}"/><text x="36" y="10.5" text-anchor="middle" style="fill:#fff;font:800 7px sans-serif">${rotulo}</text>` : ''}<g>${glifoTipo(tipo, cor)}</g></svg>`;

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
  el.className = `pin${it.rotulo ? ' pin-rotulado' : ''}`;
  Object.assign(el.style, {
    '--pin-color': it.cor,
    width: '44px',
    height: '54px',
    cursor: 'pointer',
  });
  el.innerHTML = svgPino(it.cor, it.tipo, it.rotulo);
  return el;
}

function MapaGoogle({ itens, rota = false, routePath = [], aoTocar, onLocation, viewportKey = '', classe = '', localizar = false, chave, falhou, selectionMode = false, onMapClick }) {
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
          center: { lat: -3.689, lng: -40.349 },
          zoom: 13,
          mapId: MAP_ID,
          backgroundColor: '#ffffff',
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          // No mapa embutido na lista, um dedo rola a página; no mapa de tela cheia, move o mapa
          gestureHandling: localizar ? 'greedy' : 'cooperative',
          colorScheme: 'LIGHT',
        });
        setPronto(true);
      })
      .catch((e) => falhou(e.message));
    return () => { vivo = false; };
  }, [chave, falhou, localizar]);

  useEffect(() => {
    if (!pronto || !selectionMode || !mapa.current) return undefined;
    const listener = mapa.current.addListener('click', (event) => {
      if (event.latLng) onMapClick?.({ lat: event.latLng.lat(), lng: event.latLng.lng() });
    });
    return () => listener.remove();
  }, [pronto, selectionMode, onMapClick]);

  // Redesenha pinos e rota quando a lista muda
  useEffect(() => {
    if (!pronto) return;
    const g = window.google.maps;
    const m = mapa.current;
    marcadores.current.forEach((mk) => { mk.map = null; });
    marcadores.current = [];
    if (linha.current) { linha.current.setMap(null); linha.current = null; }
    if (!itens.length) return;

    itens.forEach((it) => {
      const pos = { lat: it.lat, lng: it.lng };
      const mk = new Marcador.current({
        map: m,
        position: pos,
        content: elementoPino(it),
        title: `${it.nome} — toque para ver detalhes`,
        gmpClickable: true,
      });
      mk.addEventListener('gmp-click', () => selectionMode ? onMapClick?.(pos) : aoTocar?.(it.id));
      marcadores.current.push(mk);
    });

    if (routePath.length > 1) {
      linha.current = new g.Polyline({
        map: m,
        path: routePath.map(({ lat, lng }) => ({ lat, lng })),
        strokeColor: '#2053CE',
        strokeOpacity: 0.95,
        strokeWeight: 5,
      });
    } else if (rota && itens.length > 1) {
      linha.current = new g.Polyline({
        map: m,
        path: itens.map((it) => ({ lat: it.lat, lng: it.lng })),
        strokeOpacity: 0,
        icons: [{
          icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, strokeColor: '#87a3d4', scale: 3 },
          offset: '0',
          repeat: '14px',
        }],
      });
    }

  }, [pronto, itens, rota, routePath, aoTocar, selectionMode, onMapClick]);

  // Enquadra somente na primeira carga e quando busca/filtros mudam.
  // Selecionar um pin atualiza o painel sem alterar o zoom escolhido pela pessoa.
  useEffect(() => {
    if (!pronto || !itens.length) return;
    const limites = new window.google.maps.LatLngBounds();
    itens.forEach((it) => limites.extend({ lat: it.lat, lng: it.lng }));
    if (itens.length === 1) {
      mapa.current.setCenter({ lat: itens[0].lat, lng: itens[0].lng });
      mapa.current.setZoom(Math.max(mapa.current.getZoom() || 0, 16));
    } else {
      mapa.current.fitBounds(limites, 40);
    }
  }, [pronto, viewportKey, itens]);

  function minhaLocalizacao() {
    if (!navigator.geolocation || !pronto) {
      setAviso('Localização indisponível neste aparelho.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const pos = { lat: coords.latitude, lng: coords.longitude };
        onLocation?.(pos);
        if (eu.current) eu.current.position = pos;
        else {
          const ponto = document.createElement('span');
          ponto.className = 'pin-eu';
          eu.current = new Marcador.current({ map: mapa.current, position: pos, content: ponto, title: 'Você está aqui' });
        }
        mapa.current.setCenter(pos);
        mapa.current.setZoom(Math.max(mapa.current.getZoom() || 0, 15));
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
        <button className="btn-local" aria-label="Centralizar na minha localização" onClick={minhaLocalizacao}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></svg>
        </button>
      )}
      {aviso && <p className="mapa-aviso">{aviso}</p>}
    </div>
  );
}

/* ---------- Mapa alternativo (Leaflet + OpenStreetMap) ---------- */

function MapaLeaflet({ itens, rota = false, routePath = [], aoTocar, onLocation, viewportKey = '', classe = '', localizar = false, selectionMode = false, onMapClick }) {
  const caixa = useRef(null);
  const mapa = useRef(null);
  const camada = useRef(null);
  const eu = useRef(null);
  const [aviso, setAviso] = useState('');

  // Cria o mapa uma vez
  useEffect(() => {
    const m = L.map(caixa.current, { zoomControl: false, attributionControl: true });
    L.tileLayer(TILES.claro, { attribution: ATRIB, maxZoom: 19 }).addTo(m);
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    camada.current = L.layerGroup().addTo(m);
    mapa.current = m;
    return () => m.remove();
  }, []);

  useEffect(() => {
    const m = mapa.current;
    if (!m || !selectionMode) return undefined;
    const onClick = (event) => onMapClick?.({ lat: event.latlng.lat, lng: event.latlng.lng });
    m.on('click', onClick);
    return () => m.off('click', onClick);
  }, [selectionMode, onMapClick]);

  // Redesenha pinos quando a lista muda
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    camada.current.clearLayers();
    if (!itens.length) {
      m.setView([-3.689, -40.349], 13);
      return;
    }
    const pontos = itens.map((it) => [it.lat, it.lng]);
    if (routePath.length > 1) {
      L.polyline(routePath.map(({ lat, lng }) => [lat, lng]), { color: '#2053CE', weight: 5, opacity: 0.95 }).addTo(camada.current);
    } else if (rota && pontos.length > 1) {
      L.polyline(pontos, { color: '#2053CE', weight: 5, opacity: 0.95 }).addTo(camada.current);
    }
    itens.forEach((it) => {
      const icone = L.divIcon({
        className: '',
        html: `<span class="pin${it.rotulo ? ' pin-rotulado' : ''}" style="--pin-color:${it.cor}">${svgPino(it.cor, it.tipo, it.rotulo)}</span>`,
        iconSize: [44, 54],
        iconAnchor: [22, 52],
      });
      L.marker([it.lat, it.lng], { icon: icone, keyboard: true, title: it.nome })
        .on('click', () => selectionMode ? onMapClick?.({ lat: it.lat, lng: it.lng }) : aoTocar?.(it.id))
        .addTo(camada.current);
    });
    // O mapa pode nascer num contêiner que ainda está ganhando tamanho.
    const t = setTimeout(() => m.invalidateSize(), 80);
    return () => clearTimeout(t);
  }, [itens, rota, routePath, aoTocar, selectionMode, onMapClick]);

  useEffect(() => {
    const m = mapa.current;
    if (!m || !itens.length) return;
    const pontos = itens.map((it) => [it.lat, it.lng]);
    m.fitBounds(L.latLngBounds(pontos), { padding: [28, 28], maxZoom: 16 });
  }, [itens, viewportKey]);

  function minhaLocalizacao() {
    if (!navigator.geolocation) {
      setAviso('Localização indisponível neste aparelho.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const pos = [coords.latitude, coords.longitude];
        onLocation?.({ lat: coords.latitude, lng: coords.longitude });
        if (eu.current) eu.current.setLatLng(pos);
        else
          eu.current = L.circleMarker(pos, {
            radius: 8, color: '#ffffff', weight: 3, fillColor: '#6386c8', fillOpacity: 1,
          }).addTo(mapa.current);
        mapa.current.setView(pos, Math.max(mapa.current.getZoom(), 15));
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
        <button className="btn-local" aria-label="Centralizar na minha localização" onClick={minhaLocalizacao}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></svg>
        </button>
      )}
      {aviso && <p className="mapa-aviso">{aviso}</p>}
    </div>
  );
}
