import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { friendlyError } from '../../components/PerdidoForm';
import { ageLabels, labelFor, situationLabels } from '../../components/animalData';
import { AdminHeader, Notice, StatusBadge, formatCount, formatDate } from '../../components/admin/AdminUI';

const STATUSES = ['', 'Pendente', 'Validado', 'Recusado'];
const SPECIES = ['', 'Cachorro', 'Gato', 'Outro'];

export default function AdminAnimais() {
  const location = useLocation();
  const navigate = useNavigate();
  // Filtros na URL: o botão voltar do navegador e os links dos detalhes devolvem à mesma página da lista.
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const status = STATUSES.includes(params.get('status')) ? params.get('status') : '';
  const especie = SPECIES.includes(params.get('especie')) ? params.get('especie') : '';
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
    const query = new URLSearchParams({ q, status, especie, offset: String((page - 1) * 20) });
    api(`/admin/animais?${query}`).then(data => { if (active) setState({ loading: false, error: '', data }); })
      .catch(err => { if (active && err.status !== 401) setState({ loading: false, error: friendlyError(err), data: null }); });
    return () => { active = false; };
  }, [q, status, especie, page, retry]);

  const data = state.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limite)) : 1;
  const filtered = Boolean(q || status || especie);
  return <>
    <AdminHeader icon="ri-bear-smile-line" title="Animais" description="Consulte, cadastre e mantenha os cadastros de animais feitos no Peludinhos.">
      <Link to="/admin/animais/novo" className="flex items-center gap-2 rounded-xl bg-brand-orange px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-orange-500"><i aria-hidden="true" className="ri-add-line text-lg" />Cadastrar animal</Link>
    </AdminHeader>
    {notice && <Notice>{notice}</Notice>}

    <section aria-label="Filtros" className="rounded-3xl border border-gray-100 bg-white p-4 sm:p-5 shadow-sm mb-6 grid gap-4 lg:grid-cols-[1fr_auto_auto] lg:items-end">
      <label className="text-sm font-semibold text-gray-700">Buscar
        <span className="relative mt-2 block"><i aria-hidden="true" className="ri-search-line absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="search" value={search} maxLength={100} onChange={event => setSearch(event.target.value)} placeholder="Nome, identificação, raça, cor, características ou cadastrador" className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-11 pr-4 font-normal focus:outline-none focus:ring-2 focus:ring-teal-700" /></span>
      </label>
      <div role="group" aria-label="Status de validação" className="flex flex-wrap gap-2">
        {STATUSES.map(value => <button key={value} type="button" aria-pressed={status === value} onClick={() => update({ status: value })}
          className={`rounded-full px-4 py-2 text-sm font-semibold ${status === value ? 'bg-brand-teal text-white' : 'bg-gray-50 text-gray-600 border border-gray-200 hover:border-teal-700'}`}>{value || 'Todos'}</button>)}
      </div>
      <label className="text-sm font-semibold text-gray-700">Espécie
        <select value={especie} onChange={event => update({ especie: event.target.value })} className="mt-2 block w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 font-normal lg:w-40">
          {SPECIES.map(value => <option key={value} value={value}>{value || 'Todas'}</option>)}
        </select>
      </label>
    </section>

    <div className="flex items-center justify-between mb-4">
      <p role="status" className="text-sm text-gray-500">{data ? `${formatCount(data.total)} ${data.total === 1 ? 'animal encontrado' : 'animais encontrados'}` : ' '}</p>
      {filtered && <button type="button" onClick={() => { setSearch(''); setParams({}, { replace: true }); }} className="text-sm font-bold text-teal-700 hover:underline">Limpar filtros</button>}
    </div>

    {state.error && <div role="alert" className="rounded-3xl border border-red-100 bg-red-50 p-6 text-red-700">
      <p className="font-bold">Não foi possível carregar os animais.</p><p className="text-sm mt-1">{state.error}</p>
      <button type="button" onClick={() => setRetry(value => value + 1)} className="mt-4 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-bold">Tentar novamente</button>
    </div>}
    {state.loading && !data && <div aria-label="Carregando animais" className="grid gap-3">{[0, 1, 2, 3].map(key => <div key={key} className="h-28 rounded-3xl border border-gray-100 bg-white animate-pulse" />)}</div>}
    {data && !data.animais.length && <div className="rounded-3xl border-2 border-dashed border-gray-200 bg-white p-10 text-center">
      <i aria-hidden="true" className="ri-bear-smile-line text-5xl text-gray-300" />
      <p className="mt-3 font-bold text-gray-800">{filtered ? 'Nenhum animal corresponde aos filtros.' : 'Nenhum animal cadastrado ainda.'}</p>
      <p className="text-sm text-gray-500 mt-1">{filtered ? 'Tente outra busca ou limpe os filtros.' : 'Use “Cadastrar animal” para criar o primeiro cadastro.'}</p>
    </div>}
    {data && data.animais.length > 0 && <ul className={`grid gap-3 ${state.loading ? 'opacity-60' : ''}`}>{data.animais.map(animal => <li key={animal.id_animal}>
      <Link to={`/admin/animais/${animal.id_animal}`} state={{ from: location.pathname + location.search }} className="group flex gap-4 rounded-3xl border border-gray-100 bg-white p-4 shadow-sm transition hover:border-teal-700/30 hover:shadow-md">
        <img src={animal.foto || '/assets/icons/peludinhos.svg'} alt="" className="h-20 w-20 shrink-0 rounded-2xl bg-teal-50 object-cover sm:h-24 sm:w-24" />
        <div className="min-w-0 flex-1 grid gap-2 md:grid-cols-[1fr_auto] md:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-gray-900 break-words">{animal.nome || 'Sem nome'} <span className="font-medium text-gray-400">#{animal.id_animal}</span></h2><StatusBadge status={animal.status_validacao} /></div>
            <p className="text-sm text-gray-600 mt-1">{[animal.especie, animal.raca, animal.cor].filter(Boolean).join(' · ')} · {labelFor(ageLabels, animal.idade_aproximada)} · {labelFor(situationLabels, animal.situacao)}</p>
            {animal.caracteristicas && <p className="text-sm text-gray-500 mt-1 line-clamp-1 break-words">{animal.caracteristicas}</p>}
          </div>
          <div className="text-xs text-gray-500 md:text-right">
            <p><i aria-hidden="true" className="ri-user-line mr-1" />{animal.cadastrador_nome}</p>
            <p className="mt-1"><i aria-hidden="true" className="ri-calendar-line mr-1" />{formatDate(animal.data_cadastro)}</p>
            <p className="mt-1"><i aria-hidden="true" className="ri-map-pin-2-line mr-1" />{formatCount(animal.total_avistamentos)} avistamento(s)</p>
          </div>
        </div>
        <i aria-hidden="true" className="ri-arrow-right-s-line self-center text-2xl text-gray-300 group-hover:text-teal-700" />
      </Link>
    </li>)}</ul>}

    {data && data.total > data.limite && <nav aria-label="Paginação" className="mt-6 flex items-center justify-between gap-3">
      <button type="button" disabled={page <= 1 || state.loading} onClick={() => update({ q, status, especie, pagina: String(page - 1) })} className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-teal-700 disabled:opacity-40"><i aria-hidden="true" className="ri-arrow-left-s-line" />Anterior</button>
      <span className="text-sm text-gray-600">Página {page} de {pages}</span>
      <button type="button" disabled={page >= pages || state.loading} onClick={() => update({ q, status, especie, pagina: String(page + 1) })} className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-teal-700 disabled:opacity-40">Próxima<i aria-hidden="true" className="ri-arrow-right-s-line" /></button>
    </nav>}
  </>;
}
