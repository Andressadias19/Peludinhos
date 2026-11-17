import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { friendlyError } from '../../components/PerdidoForm';
import { AccountBadges, AdminHeader, Avatar, Notice, formatCount, formatDate } from '../../components/admin/AdminUI';

const TYPES = [['', 'Todos os tipos'], ['usuario', 'Usuários'], ['administrador', 'Administradores']];
const SITUATIONS = [['', 'Todas'], ['ativo', 'Ativas'], ['inativo', 'Desativadas']];

export default function AdminUsuarios() {
  const location = useLocation();
  const navigate = useNavigate();
  // Filtros na URL: o botão voltar e o link "voltar" dos detalhes devolvem à mesma página da lista.
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const tipo = TYPES.some(([value]) => value === params.get('tipo')) ? params.get('tipo') : '';
  const situacao = SITUATIONS.some(([value]) => value === params.get('situacao')) ? params.get('situacao') : '';
  const page = Math.max(1, Number.parseInt(params.get('pagina'), 10) || 1);
  const [search, setSearch] = useState(q);
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const [retry, setRetry] = useState(0);
  const [notice, setNotice] = useState('');

  function update(changes) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries({ pagina: '', ...changes })) value ? next.set(key, value) : next.delete(key);
    setParams(next, { replace: true });
  }
  useEffect(() => { setSearch(q); }, [q]);
  useEffect(() => {
    if (search === q) return;
    // Sem trim aqui para não apagar o espaço enquanto a pessoa digita; a API ignora espaços nas pontas.
    const timer = setTimeout(() => update({ q: search }), 300);
    return () => clearTimeout(timer);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!location.state?.notice) return;
    setNotice(location.state.notice);
    navigate(location.pathname + location.search, { replace: true, state: null });
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let active = true;
    setState(current => ({ ...current, loading: true, error: '' }));
    const query = new URLSearchParams({ q, tipo, situacao, offset: String((page - 1) * 20) });
    api(`/admin/usuarios?${query}`).then(data => { if (active) setState({ loading: false, error: '', data }); })
      .catch(err => { if (active && err.status !== 401) setState({ loading: false, error: friendlyError(err), data: null }); });
    return () => { active = false; };
  }, [q, tipo, situacao, page, retry]);

  const data = state.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limite)) : 1;
  const filtered = Boolean(q || tipo || situacao);
  const goTo = target => update({ q, tipo, situacao, pagina: String(target) });
  const chip = active => `rounded-full px-4 py-2 text-sm font-semibold ${active ? 'bg-brand-teal text-white' : 'bg-gray-50 text-gray-600 border border-gray-200 hover:border-teal-700'}`;
  return <>
    <AdminHeader icon="ri-group-line" title="Usuários" description="Consulte as contas, corrija dados cadastrais e controle o acesso ao Peludinhos." />
    {notice && <Notice>{notice}</Notice>}

    <section aria-label="Filtros" className="rounded-3xl border border-gray-100 bg-white p-4 sm:p-5 shadow-sm mb-6 grid gap-4">
      <label className="text-sm font-semibold text-gray-700">Buscar
        <span className="relative mt-2 block"><i aria-hidden="true" className="ri-search-line absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="search" value={search} maxLength={100} onChange={event => setSearch(event.target.value)} placeholder="Nome, e-mail, telefone ou número" className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-11 pr-4 font-normal focus:outline-none focus:ring-2 focus:ring-teal-700" /></span>
      </label>
      <div className="flex flex-col gap-3 lg:flex-row lg:gap-6">
        <div role="group" aria-label="Tipo de usuário" className="flex flex-wrap gap-2">{TYPES.map(([value, label]) => <button key={value} type="button" aria-pressed={tipo === value} onClick={() => update({ tipo: value })} className={chip(tipo === value)}>{label}</button>)}</div>
        <div role="group" aria-label="Situação da conta" className="flex flex-wrap gap-2">{SITUATIONS.map(([value, label]) => <button key={value} type="button" aria-pressed={situacao === value} onClick={() => update({ situacao: value })} className={chip(situacao === value)}>{label}</button>)}</div>
      </div>
    </section>

    <div className="flex items-center justify-between mb-4">
      <p role="status" className="text-sm text-gray-500">{data ? `${formatCount(data.total)} ${data.total === 1 ? 'conta encontrada' : 'contas encontradas'}` : ' '}</p>
      {filtered && <button type="button" onClick={() => { setSearch(''); setParams({}, { replace: true }); }} className="text-sm font-bold text-teal-700 hover:underline">Limpar filtros</button>}
    </div>

    {state.error && <div role="alert" className="rounded-3xl border border-red-100 bg-red-50 p-6 text-red-700">
      <p className="font-bold">Não foi possível carregar os usuários.</p><p className="text-sm mt-1">{state.error}</p>
      <button type="button" onClick={() => setRetry(value => value + 1)} className="mt-4 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-bold">Tentar novamente</button>
    </div>}
    {state.loading && !data && <div aria-label="Carregando usuários" className="grid gap-3">{[0, 1, 2, 3].map(key => <div key={key} className="h-24 rounded-3xl border border-gray-100 bg-white animate-pulse" />)}</div>}
    {data && !data.usuarios.length && <div className="rounded-3xl border-2 border-dashed border-gray-200 bg-white p-10 text-center">
      <i aria-hidden="true" className="ri-group-line text-5xl text-gray-300" />
      <p className="mt-3 font-bold text-gray-800">{filtered ? 'Nenhuma conta corresponde aos filtros.' : 'Nenhuma conta cadastrada.'}</p>
      {filtered && <p className="text-sm text-gray-500 mt-1">Tente outra busca ou limpe os filtros.</p>}
    </div>}
    {data && data.usuarios.length > 0 && <ul className={`grid gap-3 ${state.loading ? 'opacity-60' : ''}`}>{data.usuarios.map(user => <li key={user.id_usuario}>
      <Link to={`/admin/usuarios/${user.id_usuario}`} state={{ from: location.pathname + location.search }} className={`group flex items-center gap-4 rounded-3xl border bg-white p-4 shadow-sm transition hover:border-teal-700/30 hover:shadow-md ${user.ativo ? 'border-gray-100' : 'border-red-100'}`}>
        <Avatar user={user} />
        <div className="min-w-0 flex-1 grid gap-2 md:grid-cols-[1fr_auto] md:items-center">
          <div className="min-w-0">
            <h2 className="font-bold text-gray-900 break-words">{user.nome} <span className="font-medium text-gray-400">#{user.id_usuario}</span></h2>
            <p className="text-sm text-gray-600 break-all">{user.email}</p>
            <div className="mt-2"><AccountBadges user={user} /></div>
          </div>
          <div className="text-xs text-gray-500 md:text-right">
            <p><i aria-hidden="true" className="ri-phone-line mr-1" />{user.telefone || 'Sem telefone'}</p>
            <p className="mt-1"><i aria-hidden="true" className="ri-calendar-line mr-1" />Desde {formatDate(user.data_cadastro)}</p>
          </div>
        </div>
        <i aria-hidden="true" className="ri-arrow-right-s-line text-2xl text-gray-300 group-hover:text-teal-700" />
      </Link>
    </li>)}</ul>}

    {data && data.total > data.limite && <nav aria-label="Paginação" className="mt-6 flex items-center justify-between gap-3">
      <button type="button" disabled={page <= 1 || state.loading} onClick={() => goTo(page - 1)} className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-teal-700 disabled:opacity-40"><i aria-hidden="true" className="ri-arrow-left-s-line" />Anterior</button>
      <span className="text-sm text-gray-600">Página {page} de {pages}</span>
      <button type="button" disabled={page >= pages || state.loading} onClick={() => goTo(page + 1)} className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-teal-700 disabled:opacity-40">Próxima<i aria-hidden="true" className="ri-arrow-right-s-line" /></button>
    </nav>}
  </>;
}
