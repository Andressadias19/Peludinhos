import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { api } from '../../api';
import ConfirmDialog from '../../components/ConfirmDialog';
import { friendlyError } from '../../components/PerdidoForm';
import { AccountBadges, AdminHeader, Avatar, BackLink, Notice, formatCount, formatDate } from '../../components/admin/AdminUI';

const linked = [
  ['animais_cadastrados', 'Animais cadastrados', 'ri-bear-smile-line'],
  ['avistamentos', 'Avistamentos', 'ri-map-pin-2-line'],
  ['desaparecimentos', 'Desaparecimentos', 'ri-megaphone-line'],
  ['solicitacoes_associacao', 'Solicitações de associação', 'ri-links-line'],
  ['solicitacoes_adocao', 'Solicitações de adoção', 'ri-hand-heart-line'],
  ['noticias', 'Notícias', 'ri-newspaper-line'],
  ['animais_validados', 'Animais validados', 'ri-shield-check-line'],
  ['associacoes_analisadas', 'Associações analisadas', 'ri-git-merge-line'],
  ['adocoes_analisadas', 'Adoções analisadas', 'ri-file-list-3-line'],
];

export default function AdminUsuarioDetalhe() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { resumo } = useOutletContext();
  const [state, setState] = useState({ error: '', notFound: false, data: null });
  const [retry, setRetry] = useState(0);
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  // Volta para a lista com os mesmos filtros e página de onde a pessoa veio.
  const [listUrl] = useState(() => (typeof location.state?.from === 'string' && location.state.from.startsWith('/admin/usuarios') ? location.state.from : '/admin/usuarios'));

  useEffect(() => {
    if (!location.state?.notice) return;
    setNotice(location.state.notice);
    navigate(location.pathname, { replace: true, state: { from: location.state.from } });
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let active = true;
    setState(current => ({ ...current, error: '', notFound: false }));
    api(`/admin/usuarios/${id}`).then(data => { if (active) setState({ error: '', notFound: false, data }); })
      .catch(err => {
        if (!active || err.status === 401) return;
        if (err.status === 404 || err.status === 400) setState({ error: '', notFound: true, data: null });
        else setState({ error: friendlyError(err), notFound: false, data: null });
      });
    return () => { active = false; };
  }, [id, retry]);

  async function confirm() {
    setBusy(true); setActionError('');
    try {
      if (dialog === 'excluir') {
        await api(`/admin/usuarios/${id}`, { method: 'DELETE', body: JSON.stringify({ confirmar: true }) });
        resumo.reload();
        navigate(listUrl, { replace: true, state: { notice: `Conta #${id} excluída.` } });
        return;
      }
      const result = await api(`/admin/usuarios/${id}/situacao`, { method: 'PATCH', body: JSON.stringify({ ativo: dialog === 'reativar' }) });
      resumo.reload();
      setNotice(result.mensagem);
      setDialog(null); setBusy(false);
      setRetry(value => value + 1);
    } catch (err) {
      setDialog(null); setBusy(false);
      setActionError(friendlyError(err));
      setRetry(value => value + 1);
    }
  }

  if (state.notFound) return <><BackLink to={listUrl}>Voltar aos usuários</BackLink><div className="rounded-3xl border-2 border-dashed border-gray-200 bg-white p-10 text-center">
    <i aria-hidden="true" className="ri-user-search-line text-5xl text-gray-300" /><p className="mt-3 font-bold text-gray-800">Conta não encontrada</p>
    <p className="text-sm text-gray-500 mt-1">Ela pode ter sido excluída ou o endereço está incorreto.</p>
  </div></>;
  if (state.error) return <><BackLink to={listUrl}>Voltar aos usuários</BackLink><div role="alert" className="rounded-3xl border border-red-100 bg-red-50 p-6 text-red-700">
    <p className="font-bold">Não foi possível carregar a conta.</p><p className="text-sm mt-1">{state.error}</p>
    <button type="button" onClick={() => setRetry(value => value + 1)} className="mt-4 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-bold">Tentar novamente</button>
  </div></>;
  if (!state.data) return <p role="status" className="flex items-center gap-2 text-teal-700 font-semibold"><i aria-hidden="true" className="ri-loader-4-line animate-spin text-xl" />Carregando conta...</p>;

  const { usuario: user, dependencias: deps, eh_voce: isSelf, pode_alterar_situacao: canToggle, pode_excluir: canDelete, motivo_bloqueio: reason } = state.data;
  const linkedTotal = Object.values(deps).reduce((sum, value) => sum + value, 0);
  const dialogs = {
    desativar: { title: `Desativar a conta de ${user.nome}?`, label: 'Desativar conta', busyLabel: 'Desativando...', destructive: true,
      text: 'A pessoa não conseguirá entrar nem usar o Peludinhos, e as sessões abertas deixam de funcionar. Os registros dela continuam preservados e a conta pode ser reativada depois.' },
    reativar: { title: `Reativar a conta de ${user.nome}?`, label: 'Reativar conta', busyLabel: 'Reativando...', destructive: false,
      text: 'A pessoa voltará a entrar e usar o Peludinhos normalmente.' },
    excluir: { title: `Excluir a conta de ${user.nome}?`, label: 'Excluir definitivamente', busyLabel: 'Excluindo...', destructive: true,
      text: 'A conta e a foto de perfil serão apagadas permanentemente. Esta ação não pode ser desfeita.' },
  };
  const current = dialog && dialogs[dialog];
  return <>
    <BackLink to={listUrl}>Voltar aos usuários</BackLink>
    <AdminHeader icon="ri-user-line" title={`${user.nome} #${user.id_usuario}`} description={`Conta criada em ${formatDate(user.data_cadastro)}`}>
      <Link to={`/admin/usuarios/${id}/editar`} className="flex items-center gap-2 rounded-xl bg-brand-teal px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-800"><i aria-hidden="true" className="ri-edit-2-line text-lg" />Editar</Link>
    </AdminHeader>
    {notice && <Notice>{notice}</Notice>}
    {actionError && <Notice tone="error">{actionError}</Notice>}

    <div className="grid gap-6 lg:grid-cols-[20rem_1fr] lg:items-start">
      <div className="grid gap-6">
        <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm text-center">
          <div className="flex justify-center"><Avatar user={user} size="h-24 w-24" /></div>
          <h2 className="mt-3 font-bold text-gray-900 break-words">{user.nome}</h2>
          <div className="mt-2 flex justify-center"><AccountBadges user={user} /></div>
          {isSelf && <p className="mt-2 text-xs font-semibold text-brand-orange">Esta é a sua conta</p>}
          <dl className="mt-4 grid gap-3 text-left text-sm">
            <Item label="E-mail" value={<span className="break-all">{user.email}</span>} />
            <Item label="Telefone" value={user.telefone || 'Não informado'} />
            <Item label="Cadastro" value={formatDate(user.data_cadastro, true)} />
          </dl>
        </section>

        <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="font-bold text-gray-900">Acesso da conta</h2>
          {canToggle ? <>
            <p className="mt-2 text-sm text-gray-500">{user.ativo ? 'Desativar impede o login e encerra as sessões abertas, sem apagar nenhum registro.' : 'A conta está desativada. Reative para devolver o acesso.'}</p>
            <button type="button" onClick={() => { setActionError(''); setDialog(user.ativo ? 'desativar' : 'reativar'); }}
              className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold ${user.ativo ? 'border border-red-200 bg-white text-red-600 hover:bg-red-50' : 'bg-brand-teal text-white hover:bg-teal-800'}`}>
              <i aria-hidden="true" className={user.ativo ? 'ri-forbid-line' : 'ri-checkbox-circle-line'} />{user.ativo ? 'Desativar conta' : 'Reativar conta'}
            </button>
            <button type="button" disabled={!canDelete} onClick={() => { setActionError(''); setDialog('excluir'); }}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"><i aria-hidden="true" className="ri-delete-bin-line" />Excluir conta</button>
          </> : null}
          {reason && <p className="mt-3 flex gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900"><i aria-hidden="true" className="ri-lock-line text-lg leading-none" />{reason}</p>}
          {user.tipo_usuario === 'administrador' && <p className="mt-3 text-xs text-gray-500">Privilégios de administrador só são concedidos ou removidos diretamente no banco de dados.</p>}
        </section>
      </div>

      <section className="rounded-3xl border border-gray-100 bg-white p-5 sm:p-6 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-bold text-gray-900">Registros vinculados</h2><span className="text-sm text-gray-500">{formatCount(linkedTotal)} no total</span></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {linked.map(([key, label, icon]) => <div key={key} className={`flex items-center gap-3 rounded-2xl p-3 ${deps[key] ? 'bg-teal-50' : 'bg-gray-50'}`}>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-teal-700"><i aria-hidden="true" className={`${icon} text-xl`} /></span>
            <span><strong className="block text-lg text-gray-900">{formatCount(deps[key])}</strong><span className="text-xs text-gray-500">{label}</span></span>
          </div>)}
        </div>
        <p className="mt-4 text-sm text-gray-500">{linkedTotal
          ? 'Registros vinculados nunca são apagados junto com a conta. Por isso, contas com histórico só podem ser desativadas.'
          : 'Nenhum registro vinculado.'}</p>
      </section>
    </div>

    <ConfirmDialog open={Boolean(current)} destructive={current?.destructive} title={current?.title || ''} confirmLabel={current?.label} busyLabel={current?.busyLabel} busy={busy}
      onConfirm={confirm} onCancel={() => setDialog(null)}>
      {current?.text}
    </ConfirmDialog>
  </>;
}

function Item({ label, value }) {
  return <div><dt className="text-gray-500">{label}</dt><dd className="font-medium text-gray-900 break-words">{value}</dd></div>;
}
