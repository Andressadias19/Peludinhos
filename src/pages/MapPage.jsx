import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import Navigation from '../components/Navigation';
import MapCanvas from '../components/MapCanvas';
import SightingCard from '../components/SightingCard';
import useSightings from '../hooks/useSightings';
import { api } from '../api';

export default function MapPage() {
  const { sightings, loading, error, reload } = useSightings();
  const [params] = useSearchParams();
  const location = useLocation();
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [days, setDays] = useState('30');
  const [areaSize, setAreaSize] = useState('500');
  const [customStart, setCustomStart] = useState(() => dateInputValue(-30));
  const [customEnd, setCustomEnd] = useState(() => dateInputValue(0));
  const [heatmapCells, setHeatmapCells] = useState([]);
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const [heatmapError, setHeatmapError] = useState('');
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  useEffect(() => {
    if (!showHeatmap) return;
    const parsedAreaSize = Number(areaSize);
    if (!Number.isInteger(parsedAreaSize) || parsedAreaSize < 50 || parsedAreaSize > 50000) {
      setHeatmapLoading(false);
      setHeatmapCells([]);
      setHeatmapError('Informe um tamanho inteiro entre 50 e 50.000 metros.');
      return;
    }
    if (days === 'custom' && (!customStart || !customEnd || customStart > customEnd)) {
      setHeatmapLoading(false);
      setHeatmapCells([]);
      setHeatmapError('Escolha um intervalo válido: a data inicial deve ser anterior ou igual à final.');
      return;
    }
    let active = true;
    setHeatmapLoading(true); setHeatmapError(''); setHeatmapCells([]);
    const query = days === 'custom'
      ? `inicio=${encodeURIComponent(customStart)}&fim=${encodeURIComponent(customEnd)}&metros=${areaSize}`
      : `dias=${days}&metros=${areaSize}`;
    api(`/avistamentos/heatmap?${query}`)
      .then(data => { if (active) setHeatmapCells(data.celulas); })
      .catch(err => { if (active) setHeatmapError(err.message); })
      .finally(() => { if (active) setHeatmapLoading(false); });
    return () => { active = false; };
  }, [showHeatmap, days, customStart, customEnd, areaSize]);
  return <div className="min-h-screen flex flex-col bg-gray-100 text-gray-800"><div className="w-full sm:max-w-sm mx-auto min-h-screen flex flex-col bg-surface sm:shadow-2xl overflow-hidden">
    <header className="bg-brand-teal text-white z-20 px-5 pt-4 pb-5 rounded-b-3xl shadow-md">
      <div className="flex items-center justify-between"><div className="flex items-center gap-2"><img src="/assets/icons/peludinhos.svg" alt="" className="h-6 brightness-0 invert" /><h1 className="text-xl font-bold">Peludinhos</h1></div><div className="flex items-center"><button onClick={reload} aria-label="Atualizar avistamentos" className="p-2 text-xl"><i className="ri-refresh-line" /></button><button type="button" onClick={() => setAnalyticsOpen(open => !open)} aria-label="Opções do mapa" aria-expanded={analyticsOpen} aria-controls="map-analytics-menu" className="p-2 text-2xl"><i className="ri-more-2-fill" /></button></div></div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-sm text-white/90">Avistamentos da comunidade</p>
        {showHeatmap && <button type="button" onClick={() => setShowHeatmap(false)} aria-label="Desativar mapa de calor" title="Desativar mapa de calor" className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-teal-800 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-teal-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"><i aria-hidden="true" className="ri-eye-off-line" />Desativar mapa de calor</button>}
      </div>
      {analyticsOpen && <div id="map-analytics-menu" className="mt-3 rounded-2xl bg-white p-4 text-gray-800 shadow-lg" role="region" aria-label="Análises do mapa">
        <h2 className="text-sm font-bold">Análises do mapa</h2>
        <p className="mt-1 text-xs text-gray-500">Escolha o que deseja visualizar.</p>
        <button type="button" aria-pressed={showHeatmap} onClick={() => setShowHeatmap(value => !value)} className={`mt-3 flex w-full items-center justify-between rounded-xl border p-3 text-left ${showHeatmap ? 'border-teal-700 bg-teal-50 text-teal-900' : 'border-gray-200'}`}>
          <span><strong className="block text-sm">Concentração de avistamentos</strong><span className="block text-xs text-gray-500">Mapa de calor disponível</span></span>
          <i className={showHeatmap ? 'ri-checkbox-circle-fill text-xl text-teal-700' : 'ri-checkbox-blank-circle-line text-xl text-gray-400'} />
        </button>
        {showHeatmap && <label className="mt-3 block text-xs font-semibold">Período
          <select aria-label="Período do mapa de calor" value={days} onChange={event => setDays(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800">
            <option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="365">Últimos 365 dias</option><option value="0">Todo período</option><option value="custom">Período personalizado</option>
          </select>
        </label>}
        {showHeatmap && <label className="mt-3 block text-xs font-semibold">Tamanho aproximado de cada área
          <div className="mt-1 flex items-center gap-2"><input type="number" aria-label="Tamanho das áreas do mapa de calor em metros" value={areaSize} min="50" max="50000" step="1" onChange={event => setAreaSize(event.target.value)} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800" /><span className="text-sm font-medium text-gray-500">metros</span></div>
          <span className="mt-1 block font-normal text-gray-500">Digite um valor inteiro entre 50 m e 50 km. A dimensão é aproximada e ajustada pela latitude.</span>
        </label>}
        {showHeatmap && days === 'custom' && <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="text-xs font-semibold">Data inicial<input type="date" aria-label="Data inicial do mapa de calor" value={customStart} max={customEnd || undefined} onChange={event => setCustomStart(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-gray-800" /></label>
          <label className="text-xs font-semibold">Data final<input type="date" aria-label="Data final do mapa de calor" value={customEnd} min={customStart || undefined} onChange={event => setCustomEnd(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-gray-800" /></label>
        </div>}
        <div className="mt-3 border-t border-gray-100 pt-3">
          <p className="text-xs font-semibold text-gray-600">Planejadas</p>
          <ul className="mt-2 space-y-2 text-xs text-gray-500">
            <li className="flex items-center gap-2"><i className="ri-map-pin-2-line" />Regiões com maior concentração de animais</li>
            <li className="flex items-center gap-2"><i className="ri-time-line" />Áreas com mais novos registros</li>
            <li className="flex items-center gap-2"><i className="ri-heart-pulse-line" />Incidência de animais não castrados</li>
          </ul>
        </div>
        <button type="button" onClick={() => { setShowHeatmap(true); setAnalyticsOpen(false); }} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-teal px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">
          <i aria-hidden="true" className="ri-map-2-line text-lg" />Visualizar no mapa
        </button>
      </div>}
      {showHeatmap && heatmapLoading && <p role="status" className="text-xs text-white/80 mt-2">Calculando concentração...</p>}
      {showHeatmap && heatmapError && <p role="alert" className="text-xs text-amber-100 mt-2">{heatmapError}</p>}
      {showHeatmap && !heatmapLoading && !heatmapError && heatmapCells.length === 0 && <p role="status" className="text-xs text-white/80 mt-2">Sem avistamentos no período selecionado.</p>}
    </header>
    {location.state?.created && <p role="status" className="bg-teal-50 text-teal-800 text-sm px-5 py-3">Avistamento publicado! O novo ponto está destacado no mapa.</p>}
    <main className="flex-1 relative min-h-[600px]">
      <div className="absolute inset-x-0 top-0 bottom-64"><MapCanvas sightings={sightings} selectedId={params.get('avistamento')} showHeatmap={showHeatmap} heatmapCells={heatmapCells} cellSizeMeters={areaSize} /></div>
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

function dateInputValue(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}
