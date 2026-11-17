import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Mapa só de leitura: diferente do LocationPicker, clicar ou arrastar não muda o ponto.
export default function LocationPreview({ latitude, longitude, label }) {
  const container = useRef(null);
  useEffect(() => {
    const point = [latitude, longitude];
    const map = L.map(container.current, { scrollWheelZoom: false }).setView(point, 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    const icon = L.divIcon({ className: 'location-pin', html: '<span aria-hidden="true">●</span>', iconSize: [28, 28], iconAnchor: [14, 14] });
    L.marker(point, { icon, keyboard: false }).addTo(map);
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container.current);
    return () => { observer.disconnect(); map.remove(); };
  }, [latitude, longitude]);
  return <div ref={container} role="img" aria-label={label} className="rounded-2xl border border-gray-200" style={{ height: 260, width: '100%', zIndex: 0 }} />;
}
