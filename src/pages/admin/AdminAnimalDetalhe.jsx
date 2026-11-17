import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { api } from '../../api';
import ConfirmDialog from '../../components/ConfirmDialog';
import { friendlyError } from '../../components/PerdidoForm';
import { ageLabels, castrationLabels, informationSourceLabels, labelFor, situationLabels, vaccinationLabels } from '../../components/animalData';
import { AdminHeader, BackLink, Notice, StatusBadge, formatCount, formatDate } from '../../components/admin/AdminUI';

export default function AdminAnimalDetalhe() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { resumo } = useOutletContext();
  const [state, setState] = useState({ loading: true, error: '', notFound: false, data: null });
  const [retry, setRetry] = useState(0);
  const [notice, setNotice] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  // Volta para a lista com os mesmos filtros e página de onde a pessoa veio.
  const [listUrl] = useState(() => (typeof location.state?.from === 'string' && location.state.from.startsWith('/admin/animais') ? location.state.from : '/admin/animais'));

  useEffect(() => {
    if (!location.state?.notice) return;
    setNotice(location.state.notice);
    navigate(location.pathname, { replace: true, state: { from: location.state.from } });
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let active = true;
    setState(current => ({ ...current, loading: true, error: '', notFound: false }));
    api(`/admin/animais/${id}`).then(data => { if (active) setState({ loading: false, error: '', notFound: false, data }); })
      .catch(err => {
        if (!active || err.status === 401) return;
        if (err.status === 404 || err.status === 400) setState({ loading: false, error: '', notFound: true, data: null });
        else setState({ loading: false, error: friendlyError(err), notFound: false, data: null });
      });
    return () => { active = false; };
  }, [id, retry]);

  async function remove() {
    setDeleting(true); setDeleteError('');
    try {
      await api(`/admin/animais/${id}`, { method: 'DELETE', body: JSON.stringify({ confirmar: true }) });
      resumo.reload();
      navigate(listUrl, { replace: true, state: { notice: `Animal #${id} excluído.` } });
    } catch (err) {
      setDeleting(false); setConfirming(false);
      setDeleteError(friendlyError(err));
      // 409: surgiu um vínculo; recarrega para mostrar as dependências atuais.
      if (err.status === 409) setRetry(value => value + 1);
    }
  }

  if (state.notFound) return <><BackLink to={listUrl}>Voltar aos animais</BackLink><div className="rounded-3xl border-2 border-dashed border-gray-200 bg-white p-10 text-center">
    <i aria-hidden="true" className="ri-search-eye-line text-5xl text-gray-300" /><p className="mt-3 font-bold text-gray-800">Animal não encontrado</p>
    <p className="text-sm text-gray-500 mt-1">O cadastro pode ter sido excluído ou o endereço está incorreto.</p>
  </div></>;
  if (state.error) return <><BackLink to={listUrl}>Voltar aos animais</BackLink><div role="alert" className="rounded-3xl border border-red-100 bg-red-50 p-6 text-red-700">
    <p className="font-bold">Não foi possível carregar o animal.</p><p className="text-sm mt-1">{state.error}</p>
    <button type="button" onClick={() => setRetry(value => value + 1)} className="mt-4 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-bold">Tentar novamente</button>
  </div></>;
  if (!state.data) return <p role="status" className="flex items-center gap-2 text-teal-700 font-semibold"><i aria-hidden="true" className="ri-loader-4-line animate-spin text-xl" />Carregando animal...</p>;

  const { animal, dependencias: deps, pode_excluir: canDelete, avistamentos_recentes: sightings } = state.data;
  const name = animal.nome || 'Animal sem nome';
  return <>
    <BackLink to={listUrl}>Voltar aos animais</BackLink>
    <AdminHeader icon="ri-bear-smile-line" title={`${name} #${animal.id_animal}`} description={`${animal.especie}${animal.raca ? ` · ${animal.raca}` : ''}${animal.cor ? ` · ${animal.cor}` : ''}`}>
      <Link to={`/admin/animais/${id}/editar`} className="flex items-center gap-2 rounded-xl bg-brand-teal px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-800"><i aria-hidden="true" className="ri-edit-2-line text-lg" />Editar</Link>
      <button type="button" disabled={!canDelete} onClick={() => { setDeleteError(''); setConfirming(true); }} title={canDelete ? undefined : 'Este animal tem histórico vinculado'}
        className="flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"><i aria-hidden="true" className="ri-delete-bin-line text-lg" />Excluir</button>
    </AdminHeader>
    {notice && <Notice>{notice}</Notice>}
    {deleteError && <Notice tone="error">{deleteError}</Notice>}

    <div className="grid gap-6 lg:grid-cols-[20rem_1fr] lg:items-start">
      <div className="grid gap-6">
        <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
          <img src={animal.foto || '/assets/icons/peludinhos.svg'} alt={animal.foto ? `Foto de ${name}` : ''} className={`aspect-square w-full bg-teal-50 ${animal.foto ? 'object-cover' : 'object-contain p-16 opacity-40'}`} />
          <div className="p-5"><StatusBadge status={animal.status_validacao} />
            <dl className="mt-4 grid gap-3 text-sm">
              <Item label="Cadastrado por" value={<>{animal.cadastrador_nome}<span className="block text-xs text-gray-500 break-all">{animal.cadastrador_email}</span></>} />
              <Item label="Data do cadastro" value={formatDate(animal.data_cadastro, true)} />
              <Item label="Última atualização" value={formatDate(animal.data_atualizacao, true)} />
            </dl>
          </div>
        </section>
        {(animal.validador_nome || animal.data_validacao || animal.observacao_validacao) && <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="font-bold text-gray-900">Última validação</h2>
          <dl className="mt-3 grid gap-3 text-sm">
            <Item label="Validador" value={animal.validador_nome || 'Não registrado'} />
            <Item label="Data" value={formatDate(animal.data_validacao, true)} />
            {animal.observacao_validacao && <Item label="Observação" value={animal.observacao_validacao} />}
          </dl>
        </section>}
      </div>

      <div className="grid gap-6">
        <section className="rounded-3xl border border-gray-100 bg-white p-5 sm:p-6 shadow-sm">
          <h2 className="font-bold text-gray-900">Informações do animal</h2>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-3">
            <Item label="Espécie" value={animal.especie} />
            <Item label="Raça" value={animal.raca || 'Não informada'} />
            <Item label="Cor" value={animal.cor || 'Não informada'} />
            <Item label="Sexo" value={animal.genero || 'Não informado'} />
            <Item label="Idade aproximada" value={labelFor(ageLabels, animal.idade_aproximada)} />
            <Item label="Situação atual" value={labelFor(situationLabels, animal.situacao)} />
            <Item label="Castração" value={labelFor(castrationLabels, animal.status_castracao)} />
            <Item label="Vacinação" value={labelFor(vaccinationLabels, animal.status_vacinacao)} />
            <Item label="Origem das informações" value={labelFor(informationSourceLabels, animal.fonte_informacao)} />
          </dl>
          <h3 className="mt-6 text-sm font-semibold text-gray-500">Características para identificação</h3>
          <p className="mt-1 text-sm text-gray-800 whitespace-pre-wrap break-words">{animal.caracteristicas || 'Não informadas.'}</p>
        </section>

        <section className="rounded-3xl border border-gray-100 bg-white p-5 sm:p-6 shadow-sm">
          <h2 className="font-bold text-gray-900">Histórico vinculado</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Counter icon="ri-map-pin-2-line" label="Avistamentos" value={deps.avistamentos} />
            <Counter icon="ri-links-line" label="Solicitações de associação" value={deps.solicitacoes_associacao} />
            <Counter icon="ri-hand-heart-line" label="Solicitações de adoção" value={deps.solicitacoes_adocao} />
          </div>
          {canDelete
            ? <p className="mt-4 text-sm text-gray-500">Nenhum histórico vinculado. Este cadastro pode ser excluído.</p>
            : <p className="mt-4 flex gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900"><i aria-hidden="true" className="ri-lock-line text-lg leading-none" />A exclusão está bloqueada para preservar o histórico vinculado a este animal.</p>}
          {sightings.length > 0 && <>
            <h3 className="mt-6 text-sm font-semibold text-gray-500">Avistamentos mais recentes</h3>
            <ul className="mt-2 divide-y divide-gray-100">{sightings.map(item => <li key={item.id_avistamento}>
              <Link to={`/avistamentos/${item.id_avistamento}`} className="flex items-center gap-3 py-3 text-sm hover:text-teal-700">
                <img src={item.foto || '/assets/icons/peludinhos.svg'} alt="" className="h-10 w-10 rounded-xl bg-teal-50 object-cover" />
                <span className="min-w-0 flex-1"><strong className="block">{formatDate(item.data_hora, true)}</strong><span className="block truncate text-gray-500">{item.observacao || 'Sem observação.'}</span></span>
                <i aria-hidden="true" className="ri-arrow-right-s-line text-xl text-gray-300" />
              </Link>
            </li>)}</ul>
          </>}
        </section>
      </div>
    </div>

    <ConfirmDialog open={confirming} destructive title={`Excluir ${name} #${animal.id_animal}?`} confirmLabel="Excluir definitivamente" busyLabel="Excluindo..." busy={deleting}
      onConfirm={remove} onCancel={() => setConfirming(false)}>
      O cadastro e a foto serão apagados permanentemente. Esta ação não pode ser desfeita.
    </ConfirmDialog>
  </>;
}

function Item({ label, value }) {
  return <div><dt className="text-gray-500">{label}</dt><dd className="font-medium text-gray-900 break-words">{value}</dd></div>;
}

function Counter({ icon, label, value }) {
  return <div className="flex items-center gap-3 rounded-2xl bg-gray-50 p-3">
    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-teal-700"><i aria-hidden="true" className={`${icon} text-xl`} /></span>
    <span><strong className="block text-lg text-gray-900">{formatCount(value)}</strong><span className="text-xs text-gray-500">{label}</span></span>
  </div>;
}
