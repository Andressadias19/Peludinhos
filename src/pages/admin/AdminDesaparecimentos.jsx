import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import FotoPerdido from '../../components/FotoPerdido';
import { perdidoDate, perdidoName } from '../../components/PerdidoCard';
import { friendlyError } from '../../components/PerdidoForm';
import { AdminHeader, LostStatusBadge, Notice, formatCount, formatDate } from '../../components/admin/AdminUI';

const STATUSES = [['', 'Todas'], ['PERDIDO', 'Procura-se'], ['ENCONTRADO', 'Encontrados']];
const SPECIES = ['', 'Cachorro', 'Gato', 'Outro'];
const isDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '');
const fieldClass = 'mt-2 block w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 font-normal focus:outline-none focus:ring-2 focus:ring-teal-700';

export default function AdminDesaparecimentos() {
  const location = useLocation();
  const navigate = useNavigate();
  // Filtros na URL: o botão voltar e o link "voltar" dos detalhes devolvem à mesma página da lista.
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const status = STATUSES.some(([value]) => value === params.get('status')) ? params.get('status') : '';
  const especie = SPECIES.includes(params.get('especie')) ? params.get('especie') : '';
  const inicio = isDate(params.get('inicio')) ? params.get('inicio') : '';
  const fim = isDate(params.get('fim')) ? params.get('fim') : '';
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
    const query = new URLSearchParams({ q, status, especie, inicio, fim, offset: String((page - 1) * 20) });
    api(`/admin/desaparecimentos?${query}`).then(data => { if (active) setState({ loading: false, error: '', data }); })
      .catch(err => { if (active && err.status !== 401) setState({ loading: false, error: friendlyError(err), data: null }); });
    return () => { active = false; };
  }, [q, status, especie, inicio, fim, page, retry]);

  const data = state.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limite)) : 1;
  const filtered = Boolean(q || status || especie || inicio || fim);
  const goTo = target => update({ q, status, especie, inicio, fim, pagina: String(target) });
  return <>
    <AdminHeader icon="ri-megaphone-line" title="Desaparecimentos" description="Consulte, publique e corrija as publicações de animais perdidos.">
      <Link to="/admin/desaparecimentos/novo" className="flex items-center gap-2 rounded-xl bg-brand-orange px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-orange-500"><i aria-hidden="true" className="ri-add-line text-lg" />Publicar desaparecimento</Link>
    </AdminHeader>
    {notice && <Notice>{notice}</Notice>}

    <section aria-label="Filtros" className="rounded-3xl border border-gray-100 bg-white p-4 sm:p-5 shadow-sm mb-6 grid gap-4">
      <label className="text-sm font-semibold text-gray-700">Buscar
        <span className="relative mt-2 block"><i aria-hidden="true" className="ri-search-line absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="search" value={search} maxLength={100} onChange={event => setSearch(event.target.value)} placeholder="Nome do animal, tutor, raça, cor, local ou descrição" className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-11 pr-4 font-normal focus:outline-none focus:ring-2 focus:ring-teal-700" /></span>
      </label>
      <div role="group" aria-label="Situação" className="flex flex-wrap gap-2">
        {STATUSES.map(([value, label]) => <button key={value} type="button" aria-pressed={status === value} onClick={() => update({ status: value })}
          className={`rounded-full px-4 py-2 text-sm font-semibold ${status === value ? 'bg-brand-teal text-white' : 'bg-gray-50 text-gray-600 border border-gray-200 hover:border-teal-700'}`}>{label}</button>)}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-sm font-semibold text-gray-700">Espécie
          <select value={especie} onChange={event => update({ especie: event.target.value })} className={fieldClass}>{SPECIES.map(value => <option key={value} value={value}>{value || 'Todas'}</option>)}</select>
        </label>
        <label className="text-sm font-semibold text-gray-700">Desapareceu a partir de<input type="date" value={inicio} max={fim || undefined} onChange={event => update({ inicio: event.target.value })} className={fieldClass} /></label>
        <label className="text-sm font-semibold text-gray-700">Até<input type="date" value={fim} min={inicio || undefined} onChange={event => update({ fim: event.target.value })} className={fieldClass} /></label>
      </div>
    </section>

    <div className="flex items-center justify-between mb-4">
      <p role="status" className="text-sm text-gray-500">{data ? `${formatCount(data.total)} ${data.total === 1 ? 'publicação encontrada' : 'publicações encontradas'}` : ' '}</p>
      {filtered && <button type="button" onClick={() => { setSearch(''); setParams({}, { replace: true }); }} className="text-sm font-bold text-teal-700 hover:underline">Limpar filtros</button>}
    </div>

    {state.error && <div role="alert" className="rounded-3xl border border-red-100 bg-red-50 p-6 text-red-700">
      <p className="font-bold">Não foi possível carregar os desaparecimentos.</p><p className="text-sm mt-1">{state.error}</p>
      <button type="button" onClick={() => setRetry(value => value + 1)} className="mt-4 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-bold">Tentar novamente</button>
    </div>}
    {state.loading && !data && <div aria-label="Carregando desaparecimentos" className="grid gap-3">{[0, 1, 2, 3].map(key => <div key={key} className="h-28 rounded-3xl border border-gray-100 bg-white animate-pulse" />)}</div>}
    {data && !data.desaparecimentos.length && <div className="rounded-3xl border-2 border-dashed border-gray-200 bg-white p-10 text-center">
      <i aria-hidden="true" className="ri-megaphone-line text-5xl text-gray-300" />
      <p className="mt-3 font-bold text-gray-800">{filtered ? 'Nenhuma publicação corresponde aos filtros.' : 'Nenhum desaparecimento publicado ainda.'}</p>
      <p className="text-sm text-gray-500 mt-1">{filtered ? 'Tente outra busca, outro período ou limpe os filtros.' : 'Use “Publicar desaparecimento” para criar a primeira publicação.'}</p>
    </div>}
    {data && data.desaparecimentos.length > 0 && <ul className={`grid gap-3 ${state.loading ? 'opacity-60' : ''}`}>{data.desaparecimentos.map(item => <li key={item.id_perda}>
      <Link to={`/admin/desaparecimentos/${item.id_perda}`} state={{ from: location.pathname + location.search }} className="group flex gap-4 rounded-3xl border border-gray-100 bg-white p-4 shadow-sm transition hover:border-teal-700/30 hover:shadow-md">
        <FotoPerdido id={item.id_perda} temFoto={item.tem_foto} alt={perdidoName(item)} className="h-20 w-20 shrink-0 rounded-2xl bg-teal-50 object-cover sm:h-24 sm:w-24" />
        <div className="min-w-0 flex-1 grid gap-2 md:grid-cols-[1fr_auto] md:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-gray-900 break-words">{perdidoName(item)} <span className="font-medium text-gray-400">#{item.id_perda}</span></h2><LostStatusBadge status={item.status_perda} /></div>
            <p className="text-sm text-gray-600 mt-1">{[item.especie, item.raca, item.cor, item.genero].filter(Boolean).join(' · ')}</p>
            <p className="text-sm text-gray-500 mt-1 line-clamp-1 break-words"><i aria-hidden="true" className="ri-map-pin-line mr-1" />{item.local_desaparecimento}</p>
          </div>
          <div className="text-xs text-gray-500 md:text-right">
            <p><i aria-hidden="true" className="ri-user-heart-line mr-1" />{item.tutor_nome}</p>
            <p className="mt-1"><i aria-hidden="true" className="ri-calendar-line mr-1" />Desapareceu em {perdidoDate(item)}</p>
            <p className="mt-1"><i aria-hidden="true" className="ri-time-line mr-1" />Publicado em {formatDate(item.data_publicacao)}</p>
          </div>
        </div>
        <i aria-hidden="true" className="ri-arrow-right-s-line self-center text-2xl text-gray-300 group-hover:text-teal-700" />
      </Link>
    </li>)}</ul>}

    {data && data.total > data.limite && <nav aria-label="Paginação" className="mt-6 flex items-center justify-between gap-3">
      <button type="button" disabled={page <= 1 || state.loading} onClick={() => goTo(page - 1)} className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-teal-700 disabled:opacity-40"><i aria-hidden="true" className="ri-arrow-left-s-line" />Anterior</button>
      <span className="text-sm text-gray-600">Página {page} de {pages}</span>
      <button type="button" disabled={page >= pages || state.loading} onClick={() => goTo(page + 1)} className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-teal-700 disabled:opacity-40">Próxima<i aria-hidden="true" className="ri-arrow-right-s-line" /></button>
    </nav>}
  </>;
}
