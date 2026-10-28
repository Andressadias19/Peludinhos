import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export default function LocationPicker({ value, onChange }) {
  const container = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  useEffect(() => {
    const map = L.map(container.current).setView([-2.443, -54.7083], 14);
    mapRef.current = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    map.on('click', event => onChange({ latitude: event.latlng.lat, longitude: event.latlng.lng }));
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container.current);
    return () => { observer.disconnect(); map.remove(); mapRef.current = null; markerRef.current = null; };
  }, [onChange]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!value) { markerRef.current?.remove(); markerRef.current = null; return; }
    const point = [value.latitude, value.longitude];
    if (!markerRef.current) {
      const icon = L.divIcon({ className: 'location-pin', html: '<span aria-hidden="true">●</span>', iconSize: [28, 28], iconAnchor: [14, 14] });
      markerRef.current = L.marker(point, { icon, draggable: true, title: 'Local do avistamento: arraste para ajustar' }).addTo(map);
      markerRef.current.on('dragend', () => {
        const p = markerRef.current.getLatLng(); onChange({ latitude: p.lat, longitude: p.lng });
      });
    } else markerRef.current.setLatLng(point);
    if (!map.getBounds().contains(point)) map.setView(point, 15);
  }, [value, onChange]);
  return <div ref={container} aria-label="Escolher local do avistamento no mapa" className="rounded-2xl border border-gray-200" style={{ height: 280, width: '100%', zIndex: 0 }} />;
}
