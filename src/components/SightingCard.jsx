import { Link } from 'react-router-dom';

export const sightingName = item => item.nome || `${item.especie} sem nome`;
export const sightingDate = item => new Date(item.data_hora).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
export const coordinates = item => `${Number(item.latitude).toFixed(5)}, ${Number(item.longitude).toFixed(5)}`;

export default function SightingCard({ sighting }) {
  return <Link to={`/avistamentos/${sighting.id_avistamento}`} className="border border-gray-100 rounded-2xl p-3 flex items-center gap-3 bg-white shadow-sm">
    <img src={sighting.foto || '/assets/icons/peludinhos.svg'} alt={sightingName(sighting)} className="w-16 h-16 rounded-xl object-cover shrink-0" />
    <div className="min-w-0 flex-1"><h3 className="font-bold text-gray-800 truncate">{sightingName(sighting)}</h3>
      <p className="text-xs text-gray-500 mt-1">{sighting.especie} · {sightingDate(sighting)}</p>
      <p className="text-xs text-teal-700 mt-1">{sighting.id_animal ? `Animal #${sighting.id_animal}` : 'Animal não identificado'}</p>
      {sighting.observacao && <p className="text-xs text-gray-600 mt-1 line-clamp-2">{sighting.observacao}</p>}
    </div><i aria-hidden="true" className="ri-arrow-right-s-line text-gray-400 text-xl" />
  </Link>;
}
