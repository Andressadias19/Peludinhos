import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Navigation from '../components/Navigation';
import SightingCard from '../components/SightingCard';
import useSightings from '../hooks/useSightings';

export default function Sightings() {
  const { sightings, loading, error, reload } = useSightings();
  const [search, setSearch] = useState('');
  const [species, setSpecies] = useState('Todos');
  const filtered = useMemo(() => sightings.filter(item => (species === 'Todos' || item.especie === species) && [item.nome, item.especie, item.raca, item.cor, item.observacao].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))), [sightings, search, species]);
  return <div className="min-h-screen bg-gray-100"><div className="w-full sm:max-w-sm mx-auto min-h-screen bg-surface sm:shadow-2xl">
    <PageHeader title="Avistamentos" />
    <main className="px-5 pt-6 pb-28">
      <label className="block text-sm font-semibold">Buscar avistamentos<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nome, espécie ou descrição" className="block w-full mt-2 p-3 border rounded-xl bg-white" /></label>
      <div role="group" aria-label="Espécie" className="flex gap-2 flex-wrap my-5">{['Todos', 'Cachorro', 'Gato', 'Outro'].map(value => <button key={value} type="button" aria-pressed={species === value} onClick={() => setSpecies(value)} className={`px-4 py-2 rounded-full text-sm ${species === value ? 'bg-brand-teal text-white' : 'bg-white text-gray-600 border'}`}>{value}</button>)}</div>
      <div className="flex items-center justify-between mb-5"><h2 className="font-bold">Avistamentos recentes</h2><button className="text-sm text-teal-700" onClick={reload}>Atualizar</button></div>
      {loading && <p role="status">Carregando avistamentos...</p>}
      {error && <div role="alert" className="text-red-600"><p>{error}</p><button onClick={reload} className="underline">Tentar novamente</button></div>}
      {!loading && !error && !filtered.length && <p className="text-sm text-gray-500">{sightings.length ? 'Nenhum avistamento corresponde à busca.' : 'Nenhum avistamento registrado. Publique o primeiro!'}</p>}
      <div className="flex flex-col gap-4">{filtered.map(item => <SightingCard key={item.id_avistamento} sighting={item} />)}</div>
      <Link to="/novo-avistamento" className="block bg-brand-teal text-white text-center rounded-xl font-bold px-4 py-3 mt-6">Novo avistamento</Link>
    </main>
  </div><Navigation /></div>;
}
