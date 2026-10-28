import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Navigation from '../components/Navigation';
import PageHeader from '../components/PageHeader';
import { coordinates, sightingDate, sightingName } from '../components/SightingCard';
import { api } from '../api';

export default function AnimalDetails() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setItem(null); setError('');
    if (!id) { setError('Selecione um avistamento na lista ou no mapa.'); return; }
    api(`/avistamentos/${id}`).then(data => { if (active) setItem(data.avistamento); }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [id, retry]);
  return <div className="min-h-screen bg-gray-100"><div className="w-full sm:max-w-sm mx-auto min-h-screen bg-white sm:shadow-2xl"><PageHeader title="Detalhes do avistamento" back="/animais" />
    <main className="pb-28">
      {error && <div role="alert" className="p-6 text-red-600"><p>{error}</p>{id && <button onClick={() => setRetry(value => value + 1)} className="underline mt-3">Tentar novamente</button>}<Link to="/animais" className="block text-teal-700 mt-4">Ver avistamentos</Link></div>}
      {!item && !error && <p role="status" className="p-6">Carregando avistamento...</p>}
      {item && <>
        <img src={item.foto || '/assets/icons/peludinhos.svg'} alt={sightingName(item)} className="w-full h-72 object-cover bg-teal-50" />
        <div className="px-6 pt-6"><h2 className="text-2xl font-bold">{sightingName(item)}</h2><p className="text-gray-500 mt-1">{item.especie}{item.raca ? ` · ${item.raca}` : ''}</p>
          <p className="text-sm text-gray-500 mt-4">Avistado em {sightingDate(item)}</p>
          <h3 className="font-bold mt-6 mb-2">Descrição</h3><p className="text-gray-600 whitespace-pre-wrap break-words">{item.observacao || 'Nenhuma descrição informada.'}</p>
          <h3 className="font-bold mt-6 mb-2">Informações do animal</h3><dl className="grid grid-cols-2 gap-4 text-sm"><div><dt className="text-gray-500">Cor</dt><dd>{item.cor || 'Não informada'}</dd></div><div><dt className="text-gray-500">Sexo</dt><dd>{item.genero || 'Não informado'}</dd></div></dl>
          <h3 className="font-bold mt-6 mb-2">Estado de saúde observado</h3><p className="text-sm text-gray-600 whitespace-pre-wrap break-words">{item.estado_saude || 'Não informado.'}</p>
          <h3 className="font-bold mt-6 mb-2">Localização</h3><p className="text-sm text-gray-500">{coordinates(item)}</p>
          <Link to={`/mapa?avistamento=${item.id_avistamento}`} className="block text-center bg-brand-teal text-white font-bold rounded-xl py-3 mt-4">Ver no mapa</Link>
        </div>
      </>}
    </main>
  </div><Navigation /></div>;
}
