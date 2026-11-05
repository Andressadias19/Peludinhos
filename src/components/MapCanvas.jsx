import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { sightingName } from './SightingCard';

function heatColor(count) {
  if (count >= 11) return '#dc2626';
  if (count >= 6) return '#f97316';
  if (count >= 3) return '#eab308';
  return '#22c55e';
}

export default function MapCanvas({ sightings = [], selectedId, showHeatmap = false, heatmapCells = [], cellSizeMeters = '500' }) {
  const element = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const heatLayerRef = useRef(null);
  const navigate = useNavigate();
  const [userLocation, setUserLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState('loading');
  const [locationMessage, setLocationMessage] = useState('');
  const locateUser = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus('error');
      setLocationMessage('Este navegador não oferece localização.');
      return;
    }
    setLocationStatus('loading'); setLocationMessage('');
    navigator.geolocation.getCurrentPosition(position => {
      const point = [position.coords.latitude, position.coords.longitude];
      setUserLocation(point); setLocationStatus('ready'); setLocationMessage('');
    }, () => {
      setUserLocation(null);
      setLocationStatus('error');
      setLocationMessage('Localização indisponível. O mapa continua mostrando os avistamentos.');
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }, []);
  useEffect(() => {
    const map = L.map(element.current, { zoomControl: false }).setView([-2.443, -54.7083], 14);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    heatLayerRef.current = L.layerGroup().addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    L.control.zoom({ position: 'topright' }).addTo(map);
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(element.current);
    return () => { resize.disconnect(); map.remove(); mapRef.current = null; layerRef.current = null; heatLayerRef.current = null; };
  }, []);
  useEffect(() => { locateUser(); }, [locateUser]);
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const points = [];
    let selectedMarker;
    for (const item of sightings) {
      const point = [item.latitude, item.longitude];
      points.push(point);
      const markerElement = document.createElement('div');
      markerElement.className = 'live-map-pin';
      const logo = document.createElement('img');
      logo.className = 'live-map-pin-logo';
      logo.src = '/assets/icons/peludinhos.svg'; logo.alt = '';
      markerElement.append(logo);
      if (item.foto) {
        const photo = document.createElement('img');
        photo.className = 'live-map-pin-photo';
        photo.src = item.foto; photo.alt = '';
        photo.addEventListener('error', () => photo.remove(), { once: true });
        markerElement.append(photo);
      }
      const icon = L.divIcon({ html: markerElement, className: '', iconSize: [56, 84], iconAnchor: [28, 84], popupAnchor: [0, -76] });
      const content = document.createElement('div');
      content.className = 'live-map-popup';
      if (item.foto) { const img = document.createElement('img'); img.src = item.foto; img.alt = sightingName(item); content.append(img); }
      const title = document.createElement('strong'); title.textContent = sightingName(item);
      const description = document.createElement('p'); description.textContent = item.observacao || item.especie;
      const button = document.createElement('button'); button.textContent = 'Ver detalhes'; button.onclick = () => navigate(`/avistamentos/${item.id_avistamento}`);
      content.append(title, description, button);
      const marker = L.marker(point, { icon, title: `Avistamento: ${sightingName(item)}`, alt: `Avistamento: ${sightingName(item)}` }).bindPopup(content, { maxWidth: 220 }).addTo(layer);
      if (String(item.id_avistamento) === selectedId) selectedMarker = marker;
    }
    if (userLocation) {
      const userIcon = L.divIcon({
        className: 'user-location-pin',
        html: '<svg aria-hidden="true" width="22" height="30" viewBox="0 0 24 34" xmlns="http://www.w3.org/2000/svg"><path d="M12 1C5.9 1 1 5.8 1 11.8c0 8.1 11 21 11 21s11-12.9 11-21C23 5.8 18.1 1 12 1Z" fill="#2563eb" stroke="white" stroke-width="2"/><circle cx="12" cy="12" r="3.5" fill="white"/></svg>',
        iconSize: [22, 30], iconAnchor: [11, 29], tooltipAnchor: [0, -27],
      });
      L.marker(userLocation, { icon: userIcon, zIndexOffset: 1000 }).addTo(layer);
    }
    if (selectedMarker) {
      map.setView(selectedMarker.getLatLng(), 16);
      selectedMarker.openPopup();
    } else if (userLocation) {
      map.setView(userLocation, 14);
    } else if (points.length) {
      map.fitBounds(L.latLngBounds(points), { padding: [45, 45], maxZoom: 15 });
    } else {
      map.setView([-2.443, -54.7083], 14);
    }
    return () => layer.clearLayers();
  }, [sightings, selectedId, navigate, userLocation]);
  useEffect(() => {
    const heatLayer = heatLayerRef.current;
    if (!heatLayer) return;
    heatLayer.clearLayers();
    if (!showHeatmap) return;
    for (const cell of heatmapCells) {
      const color = heatColor(cell.total_avistamentos);
      L.rectangle([[cell.sul, cell.oeste], [cell.norte, cell.leste]], {
        color, weight: 1, opacity: 0.75, fillColor: color, fillOpacity: 0.38,
      }).bindTooltip(`${cell.total_avistamentos} avistamento(s) nesta área`).addTo(heatLayer);
    }
  }, [showHeatmap, heatmapCells]);
  function centerOnUser() {
    mapRef.current?.closePopup();
    locateUser();
  }
  return <div className="absolute inset-0">
    <div ref={element} id="map" aria-label="Mapa dos avistamentos registrados" style={{ position: 'absolute', inset: 0 }} />
    <button type="button" onClick={centerOnUser} disabled={locationStatus === 'loading'} aria-label={locationStatus === 'loading' ? 'Obtendo sua localização' : 'Minha localização'} title={locationStatus === 'loading' ? 'Obtendo sua localização' : 'Minha localização'} className="absolute left-3 top-3 z-[700] flex h-10 w-10 items-center justify-center rounded-xl bg-white text-blue-600 shadow-md disabled:opacity-60">
      <svg aria-hidden="true" width="21" height="27" viewBox="0 0 24 34" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 1C5.9 1 1 5.8 1 11.8c0 8.1 11 21 11 21s11-12.9 11-21C23 5.8 18.1 1 12 1Z" fill="currentColor"/><circle cx="12" cy="12" r="3.5" fill="white"/></svg>
    </button>
    {locationMessage && <p role="status" className="absolute left-3 top-14 z-[700] max-w-[240px] rounded-lg bg-white/95 px-3 py-2 text-xs text-gray-700 shadow">{locationMessage}</p>}
    {showHeatmap && <div aria-label="Legenda de concentração de avistamentos" className="absolute bottom-5 left-1/2 z-[700] w-[280px] max-w-[90%] -translate-x-1/2 rounded-2xl border border-white/70 bg-white/95 p-3.5 text-xs shadow-xl backdrop-blur-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><i aria-hidden="true" className="ri-bar-chart-grouped-line text-lg" /></span>
          <div><p className="font-bold leading-tight text-gray-900">Avistamentos por área</p><p className="mt-0.5 text-[11px] text-gray-500">Quadrículas de ~{Number(cellSizeMeters) >= 1000 ? `${Number(cellSizeMeters) / 1000} km` : `${cellSizeMeters} m`}</p></div>
        </div>
        <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-semibold text-gray-600">Relatos</span>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {[['#22c55e', '1–2'], ['#eab308', '3–5'], ['#f97316', '6–10'], ['#dc2626', '11+']].map(([color, label]) => <span key={label} className="flex items-center justify-center gap-1.5 rounded-lg bg-gray-50 px-1.5 py-1.5 font-medium text-gray-700"><i aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />{label}</span>)}
      </div>
      <p className="mt-2 text-[10px] leading-snug text-gray-500">As cores contam relatos, não animais únicos.</p>
    </div>}
  </div>;
}
