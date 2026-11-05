import { useEffect, useState } from 'react';
import { api } from '../api';
import { ageLabels, labelFor, situationLabels } from './animalData';

export default function AnimalSelector({ value, onChange }) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    const timer = setTimeout(() => {
      api(`/animais?q=${encodeURIComponent(query)}`).then(data => { if (active) setItems(data.animais); })
        .catch(err => { if (active) setError(err.message); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [query, retry]);
  return <section className="grid gap-3">
    {value && <div className="p-3 rounded-xl bg-teal-50 text-sm" role="status"><strong>Selecionado: {value.nome || 'Sem nome'} · #{value.id_animal}</strong><p>{value.especie} · {value.raca || 'Raça não informada'} · {value.cor || 'Cor não informada'}</p><button type="button" onClick={() => onChange(null)} className="text-teal-700 underline mt-2">Trocar animal</button></div>}
    <label className="text-sm font-semibold">Buscar animal cadastrado<input type="search" maxLength={100} value={query} onChange={e => setQuery(e.target.value)} placeholder="Nome, identificação, espécie, raça ou cor" className="w-full border rounded-xl p-3 mt-2" /></label>
    <p className="text-xs text-gray-500">Até 50 resultados. Refine a busca e confira a identificação antes de selecionar.</p>
    {loading ? <p role="status">Buscando animais...</p> : error ? <div role="alert"><p>{error}</p><button type="button" onClick={() => setRetry(v => v + 1)} className="underline">Tentar novamente</button></div> : <>
      {!items.length && <p className="text-sm">Nenhum animal encontrado. Você pode publicar sem identificação. O cadastro de animais fica na aba Animais.</p>}
      <ul className="grid gap-2 max-h-80 overflow-y-auto">{items.map(item => <li key={item.id_animal}><button type="button" aria-pressed={value?.id_animal === item.id_animal} onClick={() => onChange(item)} className="flex gap-3 text-left w-full p-3 border rounded-xl bg-white hover:bg-teal-50">
        <img src={item.foto || '/assets/icons/peludinhos.svg'} alt="" className="w-14 h-14 rounded-lg object-cover" />
        <span className="text-sm"><strong>{item.nome || 'Sem nome'} · #{item.id_animal}</strong><span className="block">{item.especie} · {item.cor || 'Cor não informada'}</span><span className="block">{labelFor(ageLabels, item.idade_aproximada)} · {labelFor(situationLabels, item.situacao)}</span><span className="block text-gray-500">{item.raca || 'Raça não informada'} · {item.total_avistamentos} avistamento(s)</span>{item.caracteristicas && <span className="block text-gray-500">{item.caracteristicas}</span>}</span>
      </button></li>)}</ul>
    </>}
  </section>;
}
