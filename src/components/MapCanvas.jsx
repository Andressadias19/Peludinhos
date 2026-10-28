import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { sightingName } from './SightingCard';

export default function MapCanvas({ sightings = [], selectedId }) {
  const element = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const navigate = useNavigate();
  useEffect(() => {
    const map = L.map(element.current, { zoomControl: false }).setView([-2.443, -54.7083], 14);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    L.control.zoom({ position: 'topright' }).addTo(map);
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(element.current);
    return () => { resize.disconnect(); map.remove(); mapRef.current = null; layerRef.current = null; };
  }, []);
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
    if (selectedMarker) {
      map.setView(selectedMarker.getLatLng(), 16);
      selectedMarker.openPopup();
    } else if (points.length) {
      map.fitBounds(L.latLngBounds(points), { padding: [45, 45], maxZoom: 15 });
    }
    return () => layer.clearLayers();
  }, [sightings, selectedId, navigate]);
  return <div ref={element} id="map" aria-label="Mapa dos avistamentos registrados" style={{ position: 'absolute', inset: 0 }} />;
}
