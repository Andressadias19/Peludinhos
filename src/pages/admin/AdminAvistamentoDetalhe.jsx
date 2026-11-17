import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { api } from '../../api';
import ConfirmDialog from '../../components/ConfirmDialog';
import { friendlyError } from '../../components/PerdidoForm';
import { coordinates, sightingName } from '../../components/SightingCard';
import LocationPreview from '../../components/admin/LocationPreview';
import { AdminHeader, AssociationBadge, BackLink, Notice, StatusBadge, formatDate } from '../../components/admin/AdminUI';

const requestLabels = { PENDENTE: 'Pendente', APROVADA: 'Aprovada', RECUSADA: 'Recusada', CORRECAO_SOLICITADA: 'Correção solicitada' };

export default function AdminAvistamentoDetalhe() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { resumo } = useOutletContext();
  const [state, setState] = useState({ error: '', notFound: false, data: null });
  const [retry, setRetry] = useState(0);
  const [notice, setNotice] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  // Volta para a lista com os mesmos filtros e página de onde a pessoa veio.
  const [listUrl] = useState(() => (typeof location.state?.from === 'string' && location.state.from.startsWith('/admin/avistamentos') ? location.state.from : '/admin/avistamentos'));

  useEffect(() => {
    if (!location.state?.notice) return;
    setNotice(location.state.notice);
    navigate(location.pathname, { replace: true, state: { from: location.state.from } });
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let active = true;
    setState(current => ({ ...current, error: '', notFound: false }));
    api(`/admin/avistamentos/${id}`).then(data => { if (active) setState({ error: '', notFound: false, data }); })
      .catch(err => {
        if (!active || err.status === 401) return;
        if (err.status === 404 || err.status === 400) setState({ error: '', notFound: true, data: null });
        else setState({ error: friendlyError(err), notFound: false, data: null });
      });
    return () => { active = false; };
  }, [id, retry]);

  async function remove() {
    setDeleting(true); setDeleteError('');
    try {
      await api(`/admin/avistamentos/${id}`, { method: 'DELETE', body: JSON.stringify({ confirmar: true }) });
      resumo.reload();
      navigate(listUrl, { replace: true, state: { notice: `Avistamento #${id} excluído.` } });
    } catch (err) {
      setDeleting(false); setConfirming(false);
      setDeleteError(friendlyError(err));
      // 409: surgiu uma solicitação; recarrega para mostrar o vínculo atual.
      if (err.status === 409) setRetry(value => value + 1);
    }
  }

  if (state.notFound) return <><BackLink to={listUrl}>Voltar aos avistamentos</BackLink><div className="rounded-3xl border-2 border-dashed border-gray-200 bg-white p-10 text-center">
    <i aria-hidden="true" className="ri-search-eye-line text-5xl text-gray-300" /><p className="mt-3 font-bold text-gray-800">Avistamento não encontrado</p>
    <p className="text-sm text-gray-500 mt-1">O relato pode ter sido excluído ou o endereço está incorreto.</p>
  </div></>;
  if (state.error) return <><BackLink to={listUrl}>Voltar aos avistamentos</BackLink><div role="alert" className="rounded-3xl border border-red-100 bg-red-50 p-6 text-red-700">
    <p className="font-bold">Não foi possível carregar o avistamento.</p><p className="text-sm mt-1">{state.error}</p>
    <button type="button" onClick={() => setRetry(value => value + 1)} className="mt-4 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-bold">Tentar novamente</button>
  </div></>;
  if (!state.data) return <p role="status" className="flex items-center gap-2 text-teal-700 font-semibold"><i aria-hidden="true" className="ri-loader-4-line animate-spin text-xl" />Carregando avistamento...</p>;

  const { avistamento: item, solicitacoes: requests, pode_excluir: canDelete } = state.data;
  const name = sightingName(item);
  return <>
    <BackLink to={listUrl}>Voltar aos avistamentos</BackLink>
    <AdminHeader icon="ri-map-pin-2-line" title={`${name} #${item.id_avistamento}`} description={`Avistado em ${formatDate(item.data_hora, true)}`}>
      <Link to={`/admin/avistamentos/${id}/editar`} className="flex items-center gap-2 rounded-xl bg-brand-teal px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-800"><i aria-hidden="true" className="ri-edit-2-line text-lg" />Editar</Link>
      <button type="button" disabled={!canDelete} onClick={() => { setDeleteError(''); setConfirming(true); }} title={canDelete ? undefined : 'Há solicitações de associação para este avistamento'}
        className="flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"><i aria-hidden="true" className="ri-delete-bin-line text-lg" />Excluir</button>
    </AdminHeader>
    {notice && <Notice>{notice}</Notice>}
    {deleteError && <Notice tone="error">{deleteError}</Notice>}

    <div className="grid gap-6 lg:grid-cols-[20rem_1fr] lg:items-start">
      <div className="grid gap-6">
        <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
          <img src={item.foto || '/assets/icons/peludinhos.svg'} alt={item.foto ? `Foto do avistamento de ${name}` : ''} className={`aspect-square w-full bg-teal-50 ${item.foto ? 'object-cover' : 'object-contain p-16 opacity-40'}`} />
          <div className="p-5"><AssociationBadge sighting={item} />
            <dl className="mt-4 grid gap-3 text-sm">
              <Item label="Registrado por" value={<>{item.autor_nome}<span className="block text-xs text-gray-500 break-all">{item.autor_email}</span></>} />
              <Item label="Data e hora" value={formatDate(item.data_hora, true)} />
            </dl>
          </div>
        </section>
        <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="font-bold text-gray-900">Cadastro do animal</h2>
          {item.id_animal ? <Link to={`/admin/animais/${item.id_animal}`} className="mt-3 flex items-center gap-3 rounded-2xl bg-gray-50 p-3 hover:bg-teal-50">
            <img src={item.animal_foto || '/assets/icons/peludinhos.svg'} alt="" className="h-12 w-12 rounded-xl bg-white object-cover" />
            <span className="min-w-0 flex-1 text-sm"><strong className="block break-words">{item.animal_nome || 'Sem nome'} #{item.id_animal}</strong><StatusBadge status={item.animal_status_validacao} /></span>
            <i aria-hidden="true" className="ri-arrow-right-s-line text-xl text-gray-300" />
          </Link> : <p className="mt-2 text-sm text-gray-500">Animal não identificado. O vínculo só é criado pela análise de uma solicitação de associação.</p>}
        </section>
      </div>

      <div className="grid gap-6">
        <section className="rounded-3xl border border-gray-100 bg-white p-5 sm:p-6 shadow-sm">
          <h2 className="font-bold text-gray-900">Características observadas</h2>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
            <Item label="Espécie" value={item.especie} />
            <Item label="Raça" value={item.raca || 'Não informada'} />
            <Item label="Cor" value={item.cor || 'Não informada'} />
            <Item label="Sexo" value={item.genero || 'Não informado'} />
          </dl>
          <h3 className="mt-6 text-sm font-semibold text-gray-500">Descrição</h3>
          <p className="mt-1 text-sm text-gray-800 whitespace-pre-wrap break-words">{item.observacao || 'Nenhuma descrição informada.'}</p>
          <h3 className="mt-4 text-sm font-semibold text-gray-500">Estado de saúde observado</h3>
          <p className="mt-1 text-sm text-gray-800 whitespace-pre-wrap break-words">{item.estado_saude || 'Não informado.'}</p>
        </section>

        <section className="rounded-3xl border border-gray-100 bg-white p-5 sm:p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold text-gray-900">Localização</h2><span className="text-sm text-gray-500">{coordinates(item)}</span></div>
          <div className="mt-4"><LocationPreview latitude={item.latitude} longitude={item.longitude} label={`Mapa do local do avistamento: ${coordinates(item)}`} /></div>
          <Link to={`/mapa?avistamento=${item.id_avistamento}`} className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-teal-700 hover:underline"><i aria-hidden="true" className="ri-map-2-line" />Ver no mapa do Peludinhos</Link>
        </section>

        <section className="rounded-3xl border border-gray-100 bg-white p-5 sm:p-6 shadow-sm">
          <h2 className="font-bold text-gray-900">Solicitações de associação</h2>
          {!requests.length && <p className="mt-2 text-sm text-gray-500">Nenhuma solicitação para este avistamento. Ele pode ser excluído.</p>}
          {requests.length > 0 && <>
            <p className="mt-3 flex gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900"><i aria-hidden="true" className="ri-lock-line text-lg leading-none" />A exclusão está bloqueada para preservar o histórico destas solicitações.</p>
            <ul className="mt-3 divide-y divide-gray-100">{requests.map(request => <li key={request.id_solicitacao} className="py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2"><Link to={`/admin/animais/${request.id_animal_proposto}`} className="font-bold text-teal-700 hover:underline">Propõe {request.animal_proposto_nome || 'animal sem nome'} #{request.id_animal_proposto}</Link>
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-700">{requestLabels[request.status_solicitacao] || request.status_solicitacao}</span></div>
              <p className="mt-1 text-gray-500">{request.solicitante_nome} · {formatDate(request.data_solicitacao, true)}</p>
              <p className="mt-1 text-gray-700 whitespace-pre-wrap break-words">{request.justificativa}</p>
            </li>)}</ul>
          </>}
        </section>
      </div>
    </div>

    <ConfirmDialog open={confirming} destructive title={`Excluir o avistamento #${item.id_avistamento}?`} confirmLabel="Excluir definitivamente" busyLabel="Excluindo..." busy={deleting}
      onConfirm={remove} onCancel={() => setConfirming(false)}>
      O relato e a foto serão apagados permanentemente{item.id_animal ? ` e deixarão de aparecer no histórico do animal #${item.id_animal}` : ''}. Esta ação não pode ser desfeita.
    </ConfirmDialog>
  </>;
}

function Item({ label, value }) {
  return <div><dt className="text-gray-500">{label}</dt><dd className="font-medium text-gray-900 break-words">{value}</dd></div>;
}
