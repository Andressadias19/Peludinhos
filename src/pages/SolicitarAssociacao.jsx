import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Navigation from '../components/Navigation';
import PageHeader from '../components/PageHeader';
import AnimalSelector from '../components/AnimalSelector';
import { api } from '../api';
import { sightingDate, sightingName } from '../components/SightingCard';

export default function SolicitarAssociacao() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sighting, setSighting] = useState(null);
  const [animal, setAnimal] = useState(null);
  const [justificativa, setJustificativa] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api(`/avistamentos/${id}`).then(({ avistamento }) => { if (active) setSighting(avistamento); })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (!animal) return setError('Selecione o cadastro que pode corresponder a este avistamento.');
    if (justificativa.trim().length < 20) return setError('Explique a associação com pelo menos 20 caracteres.');
    setBusy(true); setError('');
    try {
      await api(`/avistamentos/${id}/solicitacoes-associacao`, {
        method: 'POST', body: JSON.stringify({ id_animal: animal.id_animal, justificativa: justificativa.trim() }),
      });
      navigate(`/avistamentos/${id}`, { replace: true });
    } catch (err) { setError(err.message); setBusy(false); }
  }

  const alreadyHandled = sighting?.id_animal || sighting?.associacao_pendente;
  return <div className="min-h-screen bg-gray-100"><div className="w-full sm:max-w-sm mx-auto min-h-screen bg-white sm:shadow-2xl">
    <PageHeader title="Solicitar associação" back={`/avistamentos/${id}`} />
    <main className="p-5 pb-28">
      {loading && <p role="status">Carregando avistamento...</p>}
      {!sighting && error && <p role="alert" className="text-red-600 mb-4">{error}</p>}
      {sighting && <>
        <section className="rounded-2xl border bg-white p-4 mb-5">
          {sighting.foto && <img src={sighting.foto} alt={sightingName(sighting)} className="w-full h-40 object-cover rounded-xl mb-3" />}
          <h2 className="font-bold">{sightingName(sighting)}</h2>
          <p className="text-sm text-gray-600">{sighting.especie} · {sightingDate(sighting)}</p>
        </section>
        <p className="text-sm text-gray-600 mb-5">Indique qual cadastro pode corresponder ao animal e explique o motivo. O pedido ficará Pendente para análise municipal futura.</p>
        {sighting.id_animal && <p role="status" className="rounded-xl bg-teal-50 p-4">Este avistamento já está associado ao cadastro #{sighting.id_animal}.</p>}
        {sighting.associacao_pendente && <p role="status" className="rounded-xl bg-amber-50 text-amber-900 p-4">Já existe uma solicitação Pendente. O avistamento continua sem vínculo até a análise da prefeitura, cujo painel ainda será implementado.</p>}
        {!alreadyHandled && !loading && <form onSubmit={submit} className="grid gap-5">
          <AnimalSelector value={animal} onChange={setAnimal} />
          <label className="text-sm font-semibold">Por que acredita que é o mesmo animal?
            <textarea value={justificativa} onChange={event => setJustificativa(event.target.value)} maxLength={1000} minLength={20} rows={5} required placeholder="Descreva características que coincidem ou outras informações que ajudem na análise." className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white mt-2" />
            <span className="block text-xs text-gray-500 font-normal mt-1">De 20 a 1000 caracteres.</span>
          </label>
          {error && <p role="alert" className="text-red-600">{error}</p>}
          <button disabled={busy} className="bg-brand-teal text-white rounded-xl py-4 font-bold disabled:opacity-50">{busy ? 'Enviando...' : 'Enviar para análise da prefeitura'}</button>
        </form>}
        <Link to={`/avistamentos/${id}`} className="block text-center text-teal-700 font-bold py-3 mt-3">Voltar aos detalhes</Link>
      </>}
    </main>
  </div><Navigation /></div>;
}
