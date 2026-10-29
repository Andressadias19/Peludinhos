import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../api';
import Navigation from '../components/Navigation';
import PageHeader from '../components/PageHeader';
import { sightingDate, coordinates } from '../components/SightingCard';

export default function AnimalHistory() {
  const { id } = useParams();
  const location = useLocation();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setData(null); setError('');
    api(`/animais/${id}/avistamentos`).then(result => { if (active) setData(result); })
      .catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [id, retry]);
  return <div className="min-h-screen bg-gray-100"><div className="w-full sm:max-w-sm mx-auto min-h-screen bg-white sm:shadow-2xl">
    <PageHeader title="Cadastro e histórico" back="/animais" />
    <main className="p-5 pb-28">
      {error && <div role="alert"><p>{error}</p><button className="underline" onClick={() => setRetry(v => v + 1)}>Tentar novamente</button></div>}
      {!data && !error && <p role="status">Carregando histórico...</p>}
      {data && <>
        {location.state?.animalCreated && <p role="status" className="bg-teal-50 p-3 rounded-xl mb-4">Animal cadastrado! Agora você pode registrar avistamentos vinculados a ele.</p>}
        <img src={data.animal.foto || '/assets/icons/peludinhos.svg'} alt="Identificação do animal" className="w-full h-48 object-cover rounded-xl mb-4" />
        <h2 className="text-xl font-bold">{data.animal.nome || 'Animal sem nome'} · #{data.animal.id_animal}</h2>
        <p className="text-sm text-gray-500 mt-2">{data.animal.especie} · {data.animal.raca || 'Raça não informada'} · {data.animal.cor || 'Cor não informada'}</p>
        <p className="text-sm mt-2">Sexo: {data.animal.genero || 'Não informado'}</p>
        <p className="text-sm text-amber-800 mt-2">Validação: {data.animal.status_validacao || 'Pendente'}</p>
        <h3 className="font-bold mt-6">Histórico de avistamentos</h3>
        <Link className="block text-center bg-brand-orange text-white font-bold rounded-xl py-3 my-5" to={`/novo-avistamento?animal=${id}`}>Registrar novo avistamento deste animal</Link>
        <p className="text-sm text-gray-500 mb-4">Até 200 avistamentos mais recentes, do mais novo para o mais antigo.</p>
        {!data.avistamentos.length && <p>Este animal ainda não tem avistamentos.</p>}
        <ol className="grid gap-4">{data.avistamentos.map(item => <li key={item.id_avistamento} className="p-4 border rounded-xl">
          <Link to={`/avistamentos/${item.id_avistamento}`} className="font-bold text-teal-700 underline">{sightingDate(item)}</Link>
          {item.foto && <img src={item.foto} alt="Foto neste avistamento" className="w-full h-36 object-cover rounded-lg mt-3" />}
          <p className="text-sm mt-2">{coordinates(item)}</p>
          <p className="text-sm mt-2 whitespace-pre-wrap break-words">{item.observacao || 'Sem observação.'}</p>
          <p className="text-sm mt-2 whitespace-pre-wrap break-words"><strong>Saúde observada: </strong>{item.estado_saude || 'Não informada.'}</p>
        </li>)}</ol>
      </>}
    </main>
  </div><Navigation /></div>;
}
