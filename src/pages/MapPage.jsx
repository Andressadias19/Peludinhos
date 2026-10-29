import { Link, useLocation, useSearchParams } from 'react-router-dom';
import Navigation from '../components/Navigation';
import MapCanvas from '../components/MapCanvas';
import SightingCard from '../components/SightingCard';
import useSightings from '../hooks/useSightings';

export default function MapPage() {
  const { sightings, loading, error, reload } = useSightings();
  const [params] = useSearchParams();
  const location = useLocation();
  return <div className="min-h-screen flex flex-col bg-gray-100 text-gray-800"><div className="w-full sm:max-w-sm mx-auto min-h-screen flex flex-col bg-surface sm:shadow-2xl overflow-hidden">
    <header className="bg-brand-teal text-white z-20 px-5 pt-4 pb-5 rounded-b-3xl shadow-md">
      <div className="flex items-center justify-between"><div className="flex items-center gap-2"><img src="/assets/icons/peludinhos.svg" alt="" className="h-6 brightness-0 invert" /><h1 className="text-xl font-bold">Peludinhos</h1></div><button onClick={reload} aria-label="Atualizar avistamentos" className="p-2 text-xl"><i className="ri-refresh-line" /></button></div>
      <p className="text-sm mt-3 text-white/90">Avistamentos da nossa comunidade</p>
    </header>
    {location.state?.created && <p role="status" className="bg-teal-50 text-teal-800 text-sm px-5 py-3">Avistamento publicado! O novo ponto está destacado no mapa.</p>}
    <main className="flex-1 relative min-h-[600px]">
      <div className="absolute inset-x-0 top-0 bottom-64"><MapCanvas sightings={sightings} selectedId={params.get('avistamento')} /></div>
      <div className="absolute bottom-[275px] left-1/2 -translate-x-1/2 z-[500] w-full px-6 pointer-events-none"><Link to="/novo-avistamento" className="bg-brand-teal text-white py-4 rounded-2xl flex items-center justify-center gap-2 font-bold shadow-lg pointer-events-auto"><i className="ri-add-line text-2xl" />Novo avistamento</Link></div>
      <section aria-label="Avistamentos recentes" className="absolute bottom-0 w-full bg-white rounded-t-3xl shadow-lg z-[600] pb-20 pt-5 px-5 h-64 overflow-y-auto">
        <div className="flex justify-between items-center mb-4"><h2 className="text-lg font-bold">Avistamentos recentes</h2><Link to="/avistamentos" className="text-teal-700 text-sm font-semibold">Ver todos</Link></div>
        {loading && <p role="status" className="text-sm text-gray-500">Carregando avistamentos...</p>}
        {error && <div role="alert" className="text-sm text-red-600"><p>{error}</p><button onClick={reload} className="underline mt-2">Tentar novamente</button></div>}
        {!loading && !error && !sightings.length && <p className="text-sm text-gray-500">Nenhum avistamento registrado ainda. Seja a primeira pessoa a publicar.</p>}
        <div className="flex flex-col gap-3">{sightings.slice(0, 8).map(item => <SightingCard key={item.id_avistamento} sighting={item} />)}</div>
      </section>
    </main>
  </div><Navigation /></div>;
}
