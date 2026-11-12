import { useEffect, useState } from 'react';
import { Link, useLocation, useOutletContext, useParams } from 'react-router-dom';
import { api } from '../../api';
import { friendlyError } from '../../components/PerdidoForm';
import { coordinates } from '../../components/SightingCard';
import { ageLabels, labelFor } from '../../components/animalData';
import DecisionDialog from '../../components/admin/DecisionDialog';
import LocationPreview from '../../components/admin/LocationPreview';
import { AdminHeader, BackLink, Notice, StatusBadge, formatCount, formatDate } from '../../components/admin/AdminUI';
import { RequestBadge } from './AdminValidacoes';

const same = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();

export default function AdminValidacaoAssociacao() {
  const { id } = useParams();
  const location = useLocation();
  const { resumo } = useOutletContext();
  const [state, setState] = useState({ error: '', notFound: false, data: null });
  const [retry, setRetry] = useState(0);
  const [decision, setDecision] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [listUrl] = useState(() => (typeof location.state?.from === 'string' && location.state.from.startsWith('/admin/validacoes') ? location.state.from : '/admin/validacoes?aba=associacoes'));
  useEffect(() => {
    let active = true;
    setState(current => ({ ...current, error: '', notFound: false }));
    api(`/admin/validacoes/associacoes/${id}`).then(data => { if (active) setState({ error: '', notFound: false, data }); })
      .catch(err => {
        if (!active || err.status === 401) return;
        if (err.status === 404 || err.status === 400) setState({ error: '', notFound: true, data: null });
        else setState({ error: friendlyError(err), notFound: false, data: null });
      });
    return () => { active = false; };
  }, [id, retry]);

  async function decide(observacao) {
    setBusy(true); setActionError('');
    try {
      const result = await api(`/admin/validacoes/associacoes/${id}/${decision}`, { method: 'POST', body: JSON.stringify({ observacao }) });
      setNotice(result.mensagem);
      resumo.reload();
    } catch (err) { setActionError(friendlyError(err)); }
    setBusy(false); setDecision(null); setRetry(value => value + 1);
  }

  if (state.notFound) return <><BackLink to={listUrl}>Voltar às validações</BackLink><div className="rounded-3xl border-2 border-dashed border-gray-200 bg-white p-10 text-center">
    <i aria-hidden="true" className="ri-search-eye-line text-5xl text-gray-300" /><p className="mt-3 font-bold text-gray-800">Solicitação não encontrada</p>
  </div></>;
  if (state.error) return <><BackLink to={listUrl}>Voltar às validações</BackLink><div role="alert" className="rounded-3xl border border-red-100 bg-red-50 p-6 text-red-700">
    <p className="font-bold">Não foi possível carregar a solicitação.</p><p className="text-sm mt-1">{state.error}</p>
    <button type="button" onClick={() => setRetry(value => value + 1)} className="mt-4 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-bold">Tentar novamente</button>
  </div></>;
  if (!state.data) return <p role="status" className="flex items-center gap-2 text-teal-700 font-semibold"><i aria-hidden="true" className="ri-loader-4-line animate-spin text-xl" />Carregando solicitação...</p>;

  const { solicitacao: request, avistamento: sighting, animal, outras_solicitacoes: others, pode_aprovar: canApprove, motivo_bloqueio: reason } = state.data;
  const pending = request.status_solicitacao === 'PENDENTE';
  const rows = [
    ['Nome', sighting.nome, animal.nome],
    ['Espécie', sighting.especie, animal.especie],
    ['Raça', sighting.raca, animal.raca],
    ['Cor', sighting.cor, animal.cor],
    ['Sexo', sighting.genero, animal.genero],
  ];
  return <>
    <BackLink to={listUrl}>Voltar às validações</BackLink>
    <AdminHeader icon="ri-links-line" title={`Solicitação #${request.id_solicitacao}`} description={`Vincular o avistamento #${sighting.id_avistamento} ao animal #${animal.id_animal}`}>
      {pending && <>
        <button type="button" disabled={!canApprove} onClick={() => { setActionError(''); setDecision('aprovar'); }} className="flex items-center gap-2 rounded-xl bg-brand-teal px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-40"><i aria-hidden="true" className="ri-checkbox-circle-line text-lg" />Aprovar</button>
        <button type="button" onClick={() => { setActionError(''); setDecision('recusar'); }} className="flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50"><i aria-hidden="true" className="ri-close-circle-line text-lg" />Recusar</button>
      </>}
    </AdminHeader>
    {notice && <Notice>{notice}</Notice>}
    {actionError && <Notice tone="error">{actionError}</Notice>}
    {reason && <Notice tone="warning">{reason}</Notice>}

    <section className="rounded-3xl border border-gray-100 bg-white p-5 sm:p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold text-gray-900">Pedido</h2><RequestBadge status={request.status_solicitacao} /></div>
      <p className="mt-3 text-sm text-gray-800 whitespace-pre-wrap break-words">“{request.justificativa}”</p>
      <p className="mt-2 text-xs text-gray-500">Enviado por <strong>{request.solicitante_nome}</strong> ({request.solicitante_email}) em {formatDate(request.data_solicitacao, true)}</p>
      {!pending && <div className="mt-4 rounded-2xl bg-gray-50 p-4 text-sm">
        <p className="font-semibold text-gray-900">Decisão de {request.validador_nome || 'administrador'} em {formatDate(request.data_decisao, true)}</p>
        <p className="mt-1 text-gray-600 whitespace-pre-wrap break-words">{request.observacao_decisao || 'Sem observação.'}</p>
      </div>}
    </section>

    <section className="mt-6 overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
      <div className="grid grid-cols-2">
        <Side title={`Avistamento #${sighting.id_avistamento}`} photo={sighting.foto} subtitle={`Relatado por ${sighting.autor_nome} em ${formatDate(sighting.data_hora, true)}`}
          link={`/admin/avistamentos/${sighting.id_avistamento}`} />
        <Side title={`${animal.nome || 'Sem nome'} #${animal.id_animal}`} photo={animal.foto} subtitle={`Cadastrado por ${animal.cadastrador_nome} · ${formatCount(animal.total_avistamentos)} avistamento(s)`}
          link={`/admin/animais/${animal.id_animal}`} badge={<StatusBadge status={animal.status_validacao} />} />
      </div>
      <table className="w-full text-sm">
        <caption className="sr-only">Comparação das características do avistamento e do animal</caption>
        <thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th scope="col" className="px-4 py-2 font-semibold">Característica</th><th scope="col" className="px-4 py-2 font-semibold">Observado no relato</th><th scope="col" className="px-4 py-2 font-semibold">No cadastro</th></tr></thead>
        <tbody className="divide-y divide-gray-100">{rows.map(([label, seen, registered]) => {
          const differs = seen && registered && !same(seen, registered);
          return <tr key={label} className={differs ? 'bg-amber-50/60' : ''}>
            <th scope="row" className="px-4 py-3 text-left font-medium text-gray-500">{label}</th>
            <td className="px-4 py-3 text-gray-900 break-words">{seen || '—'}</td>
            <td className="px-4 py-3 text-gray-900 break-words">{registered || '—'}{differs && <span className="ml-2 text-xs font-bold text-amber-800">diferente</span>}</td>
          </tr>;
        })}
          <tr><th scope="row" className="px-4 py-3 text-left font-medium text-gray-500">Mais detalhes</th>
            <td className="px-4 py-3 text-gray-700 whitespace-pre-wrap break-words">{sighting.observacao || 'Sem descrição.'}{sighting.estado_saude && <span className="mt-1 block text-xs text-gray-500">Saúde: {sighting.estado_saude}</span>}</td>
            <td className="px-4 py-3 text-gray-700 whitespace-pre-wrap break-words">{animal.caracteristicas || 'Sem características.'}<span className="mt-1 block text-xs text-gray-500">Idade: {labelFor(ageLabels, animal.idade_aproximada)}</span></td></tr>
        </tbody>
      </table>
    </section>

    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold text-gray-900">Local do avistamento</h2><span className="text-sm text-gray-500">{coordinates(sighting)}</span></div>
        <div className="mt-4"><LocationPreview latitude={sighting.latitude} longitude={sighting.longitude} label={`Mapa do local do avistamento: ${coordinates(sighting)}`} /></div>
      </section>
      <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="font-bold text-gray-900">Outros pedidos para este avistamento</h2>
        {!others.length ? <p className="mt-2 text-sm text-gray-500">Nenhum outro pedido.</p> : <ul className="mt-3 divide-y divide-gray-100">{others.map(item => <li key={item.id_solicitacao} className="py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2"><Link to={`/admin/validacoes/associacoes/${item.id_solicitacao}`} className="font-bold text-teal-700 hover:underline">#{item.id_solicitacao} → {item.animal_nome || 'Sem nome'} #{item.id_animal_proposto}</Link><RequestBadge status={item.status_solicitacao} /></div>
          <p className="mt-1 text-gray-500">{item.solicitante_nome} · {formatDate(item.data_solicitacao)}{item.data_decisao ? ` · decidido por ${item.validador_nome || 'administrador'} em ${formatDate(item.data_decisao)}` : ''}</p>
          {item.observacao_decisao && <p className="mt-1 text-gray-700 break-words">“{item.observacao_decisao}”</p>}
        </li>)}</ul>}
      </section>
    </div>

    <DecisionDialog decision={decision} busy={busy} onConfirm={decide} onCancel={() => setDecision(null)}
      title={decision === 'recusar' ? `Recusar a solicitação #${request.id_solicitacao}?` : `Vincular o avistamento #${sighting.id_avistamento} ao animal #${animal.id_animal}?`} />
  </>;
}

function Side({ title, photo, subtitle, link, badge }) {
  return <div className="border-b border-gray-100 p-4 first:border-r">
    <img src={photo || '/assets/icons/peludinhos.svg'} alt="" className={`aspect-[4/3] w-full rounded-2xl bg-teal-50 ${photo ? 'object-cover' : 'object-contain p-8 opacity-40'}`} />
    <div className="mt-3 flex flex-wrap items-center gap-2"><Link to={link} className="font-bold text-teal-700 hover:underline break-words">{title}</Link>{badge}</div>
    <p className="mt-1 text-xs text-gray-500">{subtitle}</p>
  </div>;
}
