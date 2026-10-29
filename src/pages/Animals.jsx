import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Navigation from '../components/Navigation';
import { api } from '../api';

export default function Animals() {
  const [search, setSearch] = useState('');
  const [species, setSpecies] = useState('');
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    const timer = setTimeout(() => {
      api(`/animais?q=${encodeURIComponent(search)}&especie=${encodeURIComponent(species)}&offset=${offset}`)
        .then(data => { if (active) { setItems(data.animais); setMore(data.has_more); } })
        .catch(err => { if (active) setError(err.message); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [search, species, offset, retry]);
  return <div className="min-h-screen bg-gray-100"><div className="w-full sm:max-w-sm mx-auto min-h-screen bg-surface sm:shadow-2xl">
    <PageHeader title="Animais cadastrados" />
    <main className="px-5 pt-6 pb-28">
      <Link to="/animais/novo" className="block bg-brand-teal text-white text-center rounded-xl font-bold px-4 py-3 mb-5">Cadastrar animal</Link>
      <label className="block text-sm font-semibold">Buscar animais<input type="search" maxLength={100} value={search} onChange={e => { setSearch(e.target.value); setOffset(0); }} placeholder="Nome, identificação, raça ou cor" className="block w-full mt-2 p-3 border rounded-xl bg-white" /></label>
      <div role="group" aria-label="Espécie" className="flex gap-2 flex-wrap my-5">{['', 'Cachorro', 'Gato', 'Outro'].map(value => <button key={value} type="button" aria-pressed={species === value} onClick={() => { setSpecies(value); setOffset(0); }} className={`px-4 py-2 rounded-full text-sm ${species === value ? 'bg-brand-teal text-white' : 'bg-white text-gray-600 border'}`}>{value || 'Todos'}</button>)}</div>
      <div className="flex justify-between mb-5"><h2 className="font-bold">Cadastros de animais</h2><button className="text-sm text-teal-700" onClick={() => setRetry(v => v + 1)}>Atualizar</button></div>
      {loading && <p role="status">Carregando animais...</p>}
      {error && <div role="alert"><p>{error}</p><button onClick={() => setRetry(v => v + 1)} className="underline">Tentar novamente</button></div>}
      {!loading && !error && <>
        {!items.length && <div className="text-sm"><p className="text-gray-500">Nenhum animal encontrado.</p><Link to="/novo-avistamento" className="block text-teal-700 underline mt-2">Publicar avistamento de animal não identificado</Link></div>}
        <div className="grid gap-4">{items.map(item => <Link to={`/animais/${item.id_animal}/avistamentos`} key={item.id_animal} className="flex gap-3 border rounded-2xl p-3 bg-white">
          <img src={item.foto || '/assets/icons/peludinhos.svg'} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0" />
          <div className="min-w-0 text-sm"><h3 className="font-bold break-words">{item.nome || 'Sem nome'} · #{item.id_animal}</h3><p>{item.especie} · {item.cor || 'Cor não informada'}</p><p className="text-gray-500">{item.total_avistamentos} avistamento(s)</p><p className="text-amber-800">Validação: {item.status_validacao || 'Pendente'}</p></div>
        </Link>)}</div>
        <div className="flex justify-between my-5"><button disabled={offset === 0} onClick={() => setOffset(v => Math.max(0, v - 50))} className="text-teal-700 disabled:opacity-40">Anterior</button><span className="text-sm">Página {offset / 50 + 1}</span><button disabled={!more} onClick={() => setOffset(v => v + 50)} className="text-teal-700 disabled:opacity-40">Próxima</button></div>
      </>}
      <Link to="/novo-avistamento" className="block text-center text-teal-700 font-bold py-3">Publicar avistamento</Link>
      <Link to="/avistamentos" className="block text-center text-teal-700 underline py-3">Ver todos os avistamentos</Link>
    </main>
  </div><Navigation /></div>;
}
