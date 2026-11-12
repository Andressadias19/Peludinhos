import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { api } from '../../api';
import ConfirmDialog from '../../components/ConfirmDialog';
import FotoPerdido from '../../components/FotoPerdido';
import { perdidoDate, perdidoName, perdidoSince } from '../../components/PerdidoCard';
import { friendlyError } from '../../components/PerdidoForm';
import { formatPhone, localPhone } from '../DetalhesPerdido';
import { AdminHeader, BackLink, LostStatusBadge, Notice, formatDate } from '../../components/admin/AdminUI';

export default function AdminDesaparecimentoDetalhe() {
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
  const [listUrl] = useState(() => (typeof location.state?.from === 'string' && location.state.from.startsWith('/admin/desaparecimentos') ? location.state.from : '/admin/desaparecimentos'));

  useEffect(() => {
    if (!location.state?.notice) return;
    setNotice(location.state.notice);
    navigate(location.pathname, { replace: true, state: { from: location.state.from } });
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let active = true;
    setState(current => ({ ...current, error: '', notFound: false }));
    api(`/admin/desaparecimentos/${id}`).then(data => { if (active) setState({ error: '', notFound: false, data: data.desaparecimento }); })
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
      await api(`/admin/desaparecimentos/${id}`, { method: 'DELETE', body: JSON.stringify({ confirmar: true }) });
      resumo.reload();
      navigate(listUrl, { replace: true, state: { notice: `Publicação #${id} excluída.` } });
    } catch (err) {
      setDeleting(false); setConfirming(false);
      setDeleteError(friendlyError(err));
      if (err.status === 404) setRetry(value => value + 1);
    }
  }

  if (state.notFound) return <><BackLink to={listUrl}>Voltar aos desaparecimentos</BackLink><div className="rounded-3xl border-2 border-dashed border-gray-200 bg-white p-10 text-center">
    <i aria-hidden="true" className="ri-search-eye-line text-5xl text-gray-300" /><p className="mt-3 font-bold text-gray-800">Publicação não encontrada</p>
    <p className="text-sm text-gray-500 mt-1">Ela pode ter sido excluída ou o endereço está incorreto.</p>
  </div></>;
  if (state.error) return <><BackLink to={listUrl}>Voltar aos desaparecimentos</BackLink><div role="alert" className="rounded-3xl border border-red-100 bg-red-50 p-6 text-red-700">
    <p className="font-bold">Não foi possível carregar a publicação.</p><p className="text-sm mt-1">{state.error}</p>
    <button type="button" onClick={() => setRetry(value => value + 1)} className="mt-4 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-bold">Tentar novamente</button>
  </div></>;
  if (!state.data) return <p role="status" className="flex items-center gap-2 text-teal-700 font-semibold"><i aria-hidden="true" className="ri-loader-4-line animate-spin text-xl" />Carregando publicação...</p>;

  const item = state.data;
  const name = perdidoName(item);
  const phone = localPhone(item.tutor_telefone);
  return <>
    <BackLink to={listUrl}>Voltar aos desaparecimentos</BackLink>
    <AdminHeader icon="ri-megaphone-line" title={`${name} #${item.id_perda}`} description={`${perdidoSince(item)} (${perdidoDate(item)})`}>
      <Link to={`/admin/desaparecimentos/${id}/editar`} className="flex items-center gap-2 rounded-xl bg-brand-teal px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-800"><i aria-hidden="true" className="ri-edit-2-line text-lg" />Editar</Link>
      <button type="button" onClick={() => { setDeleteError(''); setConfirming(true); }} className="flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50"><i aria-hidden="true" className="ri-delete-bin-line text-lg" />Excluir</button>
    </AdminHeader>
    {notice && <Notice>{notice}</Notice>}
    {deleteError && <Notice tone="error">{deleteError}</Notice>}

    <div className="grid gap-6 lg:grid-cols-[20rem_1fr] lg:items-start">
      <div className="grid gap-6">
        <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
          <FotoPerdido id={item.id_perda} temFoto={item.tem_foto} alt={name} className="aspect-square w-full bg-teal-50 object-cover" />
          <div className="p-5"><LostStatusBadge status={item.status_perda} />
            <dl className="mt-4 grid gap-3 text-sm">
              <Item label="Publicado em" value={formatDate(item.data_publicacao, true)} />
              <Item label="Data do desaparecimento" value={perdidoDate(item)} />
            </dl>
          </div>
        </section>
        <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="font-bold text-gray-900">Tutor responsável</h2>
          <dl className="mt-3 grid gap-3 text-sm">
            <Item label="Nome" value={item.tutor_nome} />
            <Item label="E-mail" value={<span className="break-all">{item.tutor_email}</span>} />
            <Item label="Telefone" value={phone ? <a href={`tel:+55${phone}`} className="text-teal-700 underline">{formatPhone(phone)}</a> : item.tutor_telefone || 'Não informado'} />
          </dl>
          <p className="mt-3 text-xs text-gray-500">O tutor não muda pela edição no painel.</p>
        </section>
      </div>

      <div className="grid gap-6">
        <section className="rounded-3xl border border-gray-100 bg-white p-5 sm:p-6 shadow-sm">
          <h2 className="font-bold text-gray-900">Informações do animal</h2>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
            <Item label="Espécie" value={item.especie} />
            <Item label="Raça" value={item.raca || 'Não informada'} />
            <Item label="Cor" value={item.cor || 'Não informada'} />
            <Item label="Sexo" value={item.genero || 'Não informado'} />
          </dl>
          <h3 className="mt-6 text-sm font-semibold text-gray-500">Local do desaparecimento</h3>
          <p className="mt-1 text-sm text-gray-800 break-words"><i aria-hidden="true" className="ri-map-pin-line mr-1 text-teal-700" />{item.local_desaparecimento}</p>
          <h3 className="mt-4 text-sm font-semibold text-gray-500">Descrição</h3>
          <p className="mt-1 text-sm text-gray-800 whitespace-pre-wrap break-words">{item.descricao || 'Nenhuma descrição informada.'}</p>
          <Link to={`/perdidos/${item.id_perda}`} className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-teal-700 hover:underline"><i aria-hidden="true" className="ri-external-link-line" />Ver publicação no Peludinhos</Link>
        </section>
        <section className="rounded-3xl border border-gray-100 bg-white p-5 sm:p-6 shadow-sm">
          <h2 className="font-bold text-gray-900">Registros relacionados</h2>
          <p className="mt-2 text-sm text-gray-500">Nenhum outro registro do banco depende desta publicação. Ela não tem vínculo com o cadastro de animais.</p>
        </section>
      </div>
    </div>

    <ConfirmDialog open={confirming} destructive title={`Excluir a publicação #${item.id_perda}?`} confirmLabel="Excluir definitivamente" busyLabel="Excluindo..." busy={deleting}
      onConfirm={remove} onCancel={() => setConfirming(false)}>
      A publicação de {name} e a foto serão apagadas permanentemente. A conta do tutor não é afetada. Esta ação não pode ser desfeita.
    </ConfirmDialog>
  </>;
}

function Item({ label, value }) {
  return <div><dt className="text-gray-500">{label}</dt><dd className="font-medium text-gray-900 break-words">{value}</dd></div>;
}
