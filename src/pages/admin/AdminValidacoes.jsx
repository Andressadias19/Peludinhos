import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { friendlyError } from '../../components/PerdidoForm';
import { AdminHeader, Notice, StatusBadge, formatCount, formatDate } from '../../components/admin/AdminUI';

export const requestStatus = {
  PENDENTE: ['Pendente', 'bg-amber-50 text-amber-800 ring-amber-200', 'ri-time-line'],
  APROVADA: ['Aprovada', 'bg-teal-50 text-teal-800 ring-teal-200', 'ri-checkbox-circle-line'],
  RECUSADA: ['Recusada', 'bg-red-50 text-red-700 ring-red-200', 'ri-close-circle-line'],
  CORRECAO_SOLICITADA: ['Correção solicitada', 'bg-gray-50 text-gray-700 ring-gray-200', 'ri-edit-line'],
};
export function RequestBadge({ status }) {
  const [label, styles, icon] = requestStatus[status] || [status, 'bg-gray-50 text-gray-700 ring-gray-200', 'ri-question-line'];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${styles}`}><i aria-hidden="true" className={icon} />{label}</span>;
}

const TABS = {
  animais: { label: 'Validação de animais', icon: 'ri-file-shield-2-line', pending: 'Pendente', statuses: [['Pendente', 'Pendentes'], ['Validado', 'Validados'], ['Recusado', 'Recusados'], ['', 'Todos']],
    placeholder: 'Nome, número, raça, cor, características ou cadastrador' },
  associacoes: { label: 'Solicitações de associação', icon: 'ri-links-line', pending: 'PENDENTE',
    statuses: [['PENDENTE', 'Pendentes'], ['APROVADA', 'Aprovadas'], ['RECUSADA', 'Recusadas'], ['CORRECAO_SOLICITADA', 'Correção solicitada'], ['', 'Todas']],
    placeholder: 'Número, animal, solicitante, justificativa ou descrição do relato' },
};

export default function AdminValidacoes() {
  const location = useLocation();
  const navigate = useNavigate();
  // Aba, filtros e página na URL: voltar dos detalhes reabre a mesma fila.
  const [params, setParams] = useSearchParams();
  const tab = params.get('aba') === 'associacoes' ? 'associacoes' : 'animais';
  const config = TABS[tab];
  const q = params.get('q') || '';
  const rawStatus = params.get('status');
  const status = rawStatus === null ? config.pending : config.statuses.some(([value]) => value === rawStatus) ? rawStatus : config.pending;
  const page = Math.max(1, Number.parseInt(params.get('pagina'), 10) || 1);
  const [search, setSearch] = useState(q);
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const [retry, setRetry] = useState(0);
  const [notice, setNotice] = useState('');
  const [pendingCounts, setPendingCounts] = useState({});

  function update(changes) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries({ pagina: '', ...changes })) {
      // status vazio ("Todos") precisa ficar na URL; sem ele a aba volta para os pendentes.
      if (value || (key === 'status' && value === '')) next.set(key, value); else next.delete(key);
    }
    setParams(next, { replace: true });
  }
  useEffect(() => { setSearch(q); }, [q]);
  useEffect(() => {
    if (search === q) return;
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
    const query = new URLSearchParams({ q, status, offset: String((page - 1) * 20) });
    api(`/admin/validacoes/${tab}?${query}`).then(data => {
      if (!active) return;
      setState({ loading: false, error: '', data });
      setPendingCounts(current => ({ ...current, [tab]: data.contagens[config.pending] || 0 }));
    }).catch(err => { if (active && err.status !== 401) setState({ loading: false, error: friendlyError(err), data: null }); });
    return () => { active = false; };
  }, [tab, q, status, page, retry]); // eslint-disable-line react-hooks/exhaustive-deps
  // O contador da outra aba vem da primeira página dela, sem filtros.
  useEffect(() => {
    const other = tab === 'animais' ? 'associacoes' : 'animais';
    if (pendingCounts[other] !== undefined) return;
    api(`/admin/validacoes/${other}?status=${TABS[other].pending}`).then(data => setPendingCounts(current => ({ ...current, [other]: data.contagens[TABS[other].pending] || 0 }))).catch(() => {});
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const data = state.data;
  const items = data ? (tab === 'animais' ? data.animais : data.solicitacoes) : [];
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limite)) : 1;
  const chip = active => `flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold ${active ? 'bg-brand-teal text-white' : 'bg-gray-50 text-gray-600 border border-gray-200 hover:border-teal-700'}`;
  return <>
    <AdminHeader icon="ri-shield-check-line" title="Validações" description="Analise os cadastros de animais e os pedidos para vincular avistamentos a um cadastro." />
    {notice && <Notice>{notice}</Notice>}

    <div role="tablist" aria-label="Tipo de validação" className="mb-6 grid gap-2 sm:grid-cols-2">
      {Object.entries(TABS).map(([key, item]) => <button key={key} type="button" role="tab" aria-selected={tab === key}
        onClick={() => { setSearch(''); setParams({ aba: key }, { replace: true }); }}
        className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${tab === key ? 'border-teal-700 bg-white shadow-sm' : 'border-gray-100 bg-white/60 hover:bg-white'}`}>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tab === key ? 'bg-teal-50 text-teal-700' : 'bg-gray-50 text-gray-400'}`}><i aria-hidden="true" className={`${item.icon} text-xl`} /></span>
        <span className="flex-1 font-bold text-gray-900">{item.label}</span>
        {pendingCounts[key] > 0 && <span className="rounded-full bg-brand-orange px-2.5 py-0.5 text-xs font-bold text-white" aria-label={`${pendingCounts[key]} pendentes`}>{formatCount(pendingCounts[key])}</span>}
      </button>)}
    </div>

    <section aria-label="Filtros" className="rounded-3xl border border-gray-100 bg-white p-4 sm:p-5 shadow-sm mb-6 grid gap-4">
      <label className="text-sm font-semibold text-gray-700">Buscar
        <span className="relative mt-2 block"><i aria-hidden="true" className="ri-search-line absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="search" value={search} maxLength={100} onChange={event => setSearch(event.target.value)} placeholder={config.placeholder} className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-11 pr-4 font-normal focus:outline-none focus:ring-2 focus:ring-teal-700" /></span>
      </label>
      <div role="group" aria-label="Situação" className="flex flex-wrap gap-2">
        {config.statuses.map(([value, label]) => <button key={value || 'todos'} type="button" aria-pressed={status === value} onClick={() => update({ status: value })} className={chip(status === value)}>
          {label}{value && data?.contagens && <span className={`text-xs ${status === value ? 'text-white/80' : 'text-gray-400'}`}>{formatCount(data.contagens[value] || 0)}</span>}
        </button>)}
      </div>
    </section>

    <p role="status" className="mb-4 text-sm text-gray-500">{data ? `${formatCount(data.total)} ${data.total === 1 ? 'registro' : 'registros'}` : ' '}</p>
    {state.error && <div role="alert" className="rounded-3xl border border-red-100 bg-red-50 p-6 text-red-700">
      <p className="font-bold">Não foi possível carregar as validações.</p><p className="text-sm mt-1">{state.error}</p>
      <button type="button" onClick={() => setRetry(value => value + 1)} className="mt-4 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-bold">Tentar novamente</button>
    </div>}
    {state.loading && !data && <div aria-label="Carregando validações" className="grid gap-3">{[0, 1, 2].map(key => <div key={key} className="h-28 rounded-3xl border border-gray-100 bg-white animate-pulse" />)}</div>}
    {data && !items.length && <div className="rounded-3xl border-2 border-dashed border-gray-200 bg-white p-10 text-center">
      <i aria-hidden="true" className={`${status === config.pending ? 'ri-checkbox-circle-line text-teal-700/50' : 'ri-inbox-line text-gray-300'} text-5xl`} />
      <p className="mt-3 font-bold text-gray-800">{status === config.pending && !q ? 'Nada aguardando análise.' : 'Nenhum registro corresponde aos filtros.'}</p>
    </div>}
    {data && items.length > 0 && <ul className={`grid gap-3 ${state.loading ? 'opacity-60' : ''}`}>
      {tab === 'animais' ? items.map(animal => <li key={animal.id_animal}><Link to={`/admin/validacoes/animais/${animal.id_animal}`} state={{ from: location.pathname + location.search }} className="group flex gap-4 rounded-3xl border border-gray-100 bg-white p-4 shadow-sm transition hover:border-teal-700/30 hover:shadow-md">
        <img src={animal.foto || '/assets/icons/peludinhos.svg'} alt="" className="h-20 w-20 shrink-0 rounded-2xl bg-teal-50 object-cover" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-gray-900 break-words">{animal.nome || 'Sem nome'} <span className="font-medium text-gray-400">#{animal.id_animal}</span></h2><StatusBadge status={animal.status_validacao} /></div>
          <p className="text-sm text-gray-600 mt-1">{[animal.especie, animal.raca, animal.cor].filter(Boolean).join(' · ')}</p>
          <p className="text-xs text-gray-500 mt-1"><i aria-hidden="true" className="ri-user-line mr-1" />{animal.cadastrador_nome} · {animal.status_validacao === 'Pendente' ? `aguardando desde ${formatDate(animal.data_atualizacao || animal.data_cadastro)}` : `decidido por ${animal.validador_nome || 'administrador'} em ${formatDate(animal.data_validacao)}`}</p>
          {animal.observacao_validacao && <p className="text-xs text-gray-500 mt-1 line-clamp-1 break-words">“{animal.observacao_validacao}”</p>}
        </div>
        <i aria-hidden="true" className="ri-arrow-right-s-line self-center text-2xl text-gray-300 group-hover:text-teal-700" />
      </Link></li>)
        : items.map(item => <li key={item.id_solicitacao}><Link to={`/admin/validacoes/associacoes/${item.id_solicitacao}`} state={{ from: location.pathname + location.search }} className="group flex gap-4 rounded-3xl border border-gray-100 bg-white p-4 shadow-sm transition hover:border-teal-700/30 hover:shadow-md">
          <span className="flex shrink-0 items-center gap-1">
            <img src={item.avistamento_foto || '/assets/icons/peludinhos.svg'} alt="" className="h-16 w-16 rounded-2xl bg-teal-50 object-cover" />
            <i aria-hidden="true" className="ri-arrow-right-line text-gray-300" />
            <img src={item.animal_foto || '/assets/icons/peludinhos.svg'} alt="" className="h-16 w-16 rounded-2xl bg-teal-50 object-cover" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-gray-900 break-words">Avistamento #{item.id_avistamento} → {item.animal_nome || 'Sem nome'} #{item.id_animal_proposto}</h2><RequestBadge status={item.status_solicitacao} /></div>
            <p className="text-sm text-gray-500 mt-1 line-clamp-1 break-words">{item.justificativa}</p>
            <p className="text-xs text-gray-500 mt-1"><i aria-hidden="true" className="ri-user-line mr-1" />{item.solicitante_nome} · {item.status_solicitacao === 'PENDENTE' ? `pedido em ${formatDate(item.data_solicitacao)}` : `decidido por ${item.validador_nome || 'administrador'} em ${formatDate(item.data_decisao)}`}</p>
          </div>
          <i aria-hidden="true" className="ri-arrow-right-s-line self-center text-2xl text-gray-300 group-hover:text-teal-700" />
        </Link></li>)}
    </ul>}

    {data && data.total > data.limite && <nav aria-label="Paginação" className="mt-6 flex items-center justify-between gap-3">
      <button type="button" disabled={page <= 1 || state.loading} onClick={() => update({ q, status, pagina: String(page - 1) })} className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-teal-700 disabled:opacity-40"><i aria-hidden="true" className="ri-arrow-left-s-line" />Anterior</button>
      <span className="text-sm text-gray-600">Página {page} de {pages}</span>
      <button type="button" disabled={page >= pages || state.loading} onClick={() => update({ q, status, pagina: String(page + 1) })} className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-teal-700 disabled:opacity-40">Próxima<i aria-hidden="true" className="ri-arrow-right-s-line" /></button>
    </nav>}
  </>;
}
