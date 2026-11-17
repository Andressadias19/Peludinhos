import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import { friendlyError } from '../../components/PerdidoForm';
import { AccountBadges, AdminHeader, Avatar, BackLink } from '../../components/admin/AdminUI';

const inputClass = 'mt-2 block w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 font-normal focus:outline-none focus:ring-2 focus:ring-teal-700';

// Só nome e telefone, como no perfil: e-mail, senha, tipo e situação não são editados por aqui.
export default function AdminUsuarioForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setLoadError('');
    api(`/admin/usuarios/${id}`).then(({ usuario }) => {
      if (!active) return;
      setUser(usuario); setNome(usuario.nome); setTelefone(usuario.telefone || '');
    }).catch(err => { if (active && err.status !== 401) setLoadError(friendlyError(err)); });
    return () => { active = false; };
  }, [id, retry]);
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (nome.trim().length < 3) return setError('Informe o nome completo.');
    // Contas antigas podem não ter telefone: nesse caso ele só é enviado se for preenchido.
    const body = { nome };
    if (telefone.trim() || user.telefone) {
      const digits = telefone.replace(/\D/g, '');
      if (digits.length < 10 || digits.length > 11) return setError('Informe um celular válido com DDD.');
      body.telefone = telefone;
    }
    setBusy(true); setError('');
    try {
      await api(`/admin/usuarios/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      navigate(`/admin/usuarios/${id}`, { replace: true, state: { notice: 'Cadastro atualizado.' } });
    } catch (err) { setError(friendlyError(err)); setBusy(false); }
  }

  const back = `/admin/usuarios/${id}`;
  if (loadError) return <><BackLink to="/admin/usuarios">Voltar aos usuários</BackLink><div role="alert" className="rounded-3xl border border-red-100 bg-red-50 p-6 text-red-700">
    <p className="font-bold">{loadError}</p><button type="button" onClick={() => setRetry(value => value + 1)} className="mt-4 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-bold">Tentar novamente</button>
  </div></>;
  if (!user) return <p role="status" className="flex items-center gap-2 text-teal-700 font-semibold"><i aria-hidden="true" className="ri-loader-4-line animate-spin text-xl" />Carregando conta...</p>;
  return <>
    <BackLink to={back}>Voltar aos detalhes</BackLink>
    <AdminHeader icon="ri-edit-2-line" title={`Editar ${user.nome}`} description="Os campos e validações são os mesmos da edição de perfil feita pelo próprio usuário." />
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[18rem_1fr] lg:items-start">
      <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3"><Avatar user={user} /><div className="min-w-0"><p className="font-bold break-words">#{user.id_usuario}</p><AccountBadges user={user} /></div></div>
        <dl className="mt-4 grid gap-3 text-sm">
          <div><dt className="text-gray-500">E-mail</dt><dd className="font-medium break-all">{user.email}</dd></div>
        </dl>
        <p className="mt-4 text-xs text-gray-500">E-mail, senha, tipo e situação da conta não são alterados por este formulário.</p>
      </section>
      <section className="rounded-3xl border border-gray-100 bg-white p-5 sm:p-6 shadow-sm">
        <div className="grid gap-5 text-sm sm:grid-cols-2">
          <label className="font-semibold text-gray-700">Nome completo<input value={nome} onChange={event => setNome(event.target.value)} required minLength={3} maxLength={255} className={inputClass} /></label>
          <label className="font-semibold text-gray-700">Celular com DDD<input type="tel" value={telefone} onChange={event => setTelefone(event.target.value)} required={Boolean(user.telefone)} maxLength={15} placeholder="(93) 99999-9999" className={inputClass} /></label>
        </div>
        {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" disabled={busy} onClick={() => navigate(back)} className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-bold text-teal-700 disabled:opacity-50">Cancelar</button>
          <button disabled={busy} className="rounded-xl bg-brand-teal px-6 py-3 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-50">{busy ? 'Salvando...' : 'Salvar alterações'}</button>
        </div>
      </section>
    </form>
  </>;
}
