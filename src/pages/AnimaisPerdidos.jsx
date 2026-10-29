import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import PerdidoCard from '../components/PerdidoCard';
import useAnimaisPerdidos from '../hooks/useAnimaisPerdidos';
import { emptyState, filterPerdidos, sharePerdido, statusFilters } from '../components/buscaPerdidos';

export default function AnimaisPerdidos() {
const { perdidos, loading, error, reload } = useAnimaisPerdidos();
const location = useLocation();
const navigate = useNavigate();
// O aviso de exclusão é copiado para o estado e retirado do histórico, para não voltar ao recarregar.
const [deleted] = useState(() => !!location.state?.deleted);
useEffect(() => {
if (location.state?.deleted) navigate(location.pathname, { replace: true, state: null });
}, [location.state, location.pathname, navigate]);
// Busca e filtro trabalham sobre a lista já carregada; atualizar a lista não apaga nenhum dos dois.
const [query, setQuery] = useState('');
const [status, setStatus] = useState('TODOS');
const [filtersOpen, setFiltersOpen] = useState(false);
const filtered = useMemo(() => filterPerdidos(perdidos, { query, status }), [perdidos, query, status]);
const empty = emptyState({ total: perdidos.length, shown: filtered.length, loading, error });
const statusLabel = statusFilters.find(([value]) => value === status)[1];
const [shareMessage, setShareMessage] = useState('');
const shareTimer = useRef(null);
useEffect(() => () => clearTimeout(shareTimer.current), []);
async function share(item) {
const result = await sharePerdido(item);
clearTimeout(shareTimer.current);
// Compartilhamento nativo concluído ou cancelado não precisa de aviso.
setShareMessage(result.message || '');
if (result.message) shareTimer.current = setTimeout(() => setShareMessage(''), result.kind === 'error' ? 10000 : 4000);
}
function clearAll() { setQuery(''); setStatus('TODOS'); }
return <div className="min-h-screen flex flex-col bg-gray-100 text-gray-800">
<div className={"w-full sm:max-w-sm mx-auto min-h-screen flex flex-col font-sans bg-surface relative sm:shadow-2xl"}>
<header className={"bg-brand-teal text-white z-20 relative pt-2 pb-4 px-4 rounded-b-3xl shadow-md flex flex-col gap-4"}>
<div className={"flex items-center justify-center py-1"}>
<div className={"flex items-center gap-2"}>
<img src={"/assets/icons/peludinhos.svg"} alt={"Logo"} className={"h-6 w-auto brightness-0 invert"} />
<h1 className={"text-xl font-bold tracking-tight"}>{"Peludinhos"}</h1>
</div>
</div>
<div className={"flex items-center gap-3"}>
<div className={"relative flex-1"}>
<input value={query} onChange={event => setQuery(event.target.value)} aria-label={"Buscar por nome, espécie, raça, cor ou local"} className={"w-full pl-4 pr-10 py-3 rounded-xl bg-white text-gray-800 placeholder-gray-400 focus:outline-none border-none shadow-sm text-sm"} placeholder={"Buscar animais ou locais"} type={"text"} />
{query
? <button type="button" onClick={() => setQuery('')} aria-label={"Limpar busca"} className={"absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 text-lg"}><i aria-hidden="true" className={"ri-close-line"}></i></button>
: <i aria-hidden="true" className={"ri-search-line absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg"}></i>}
</div>
<button type="button" onClick={() => setFiltersOpen(open => !open)} aria-expanded={filtersOpen} aria-controls={"filtros-perdidos"}
aria-label={status === 'TODOS' ? "Filtrar por status" : `Filtrar por status (filtro atual: ${statusLabel})`} className={"bg-white p-3 rounded-xl text-gray-600 shadow-sm relative"}>
<i aria-hidden="true" className={"ri-list-settings-line text-lg"}></i>
{status !== 'TODOS' && <span aria-hidden="true" className={"absolute -top-1 -right-1 w-3 h-3 rounded-full bg-brand-orange border-2 border-white"}></span>}
</button>
</div>
{filtersOpen && <div id={"filtros-perdidos"} role="group" aria-label={"Filtrar por status"} className={"flex gap-2 flex-wrap"}>
{statusFilters.map(([value, label]) => <button key={value} type="button" aria-pressed={status === value} onClick={() => setStatus(value)}
className={`px-4 py-2 rounded-full text-sm font-medium ${status === value ? 'bg-white text-teal-700' : 'bg-white/15 text-white border border-white/40'}`}>{label}</button>)}
</div>}
</header>
<main className={"flex-1 overflow-y-auto z-10 px-4 pt-6 pb-24"}>
{deleted && <p role="status" className={"bg-teal-50 text-teal-800 text-sm rounded-xl px-4 py-3 mb-4"}>{"Publicação excluída com sucesso."}</p>}
<div className={"flex items-center justify-between mb-4"}>
<p className={"text-sm text-gray-500 font-medium"}>{status === 'TODOS' ? "Animais que precisam voltar para casa:" : `Mostrando: ${statusLabel}`}</p>
<button className={"text-sm text-teal-700"} onClick={reload}>{"Atualizar"}</button>
</div>
{loading && <p role="status" className={"text-sm text-gray-500"}>{"Carregando publicações..."}</p>}
{error && <div role="alert" className={"text-sm text-red-600"}><p>{error}</p><button onClick={reload} className={"underline mt-2"}>{"Tentar novamente"}</button></div>}
{empty === 'noPublications' && <p className={"text-sm text-gray-500"}>{"Nenhum animal perdido publicado até agora."}</p>}
{empty === 'noResults' && <div className={"text-sm text-gray-500"}><p>{"Nenhuma publicação encontrada para a busca ou filtro atual."}</p><button type="button" onClick={clearAll} className={"text-teal-700 font-bold underline mt-2"}>{"Limpar busca e filtro"}</button></div>}
<div className={"flex flex-col gap-4"}>
{filtered.map(item => <PerdidoCard key={item.id_perda} perdido={item} onShare={share} />)}
</div>
</main>

<div className={"fixed bottom-28 left-0 right-0 mx-auto w-full sm:max-w-sm pointer-events-none z-40"}>
<Link to={"/perdidos/novo"} className={"absolute right-4 bg-red-500 text-white px-5 py-3 rounded-full shadow-lg flex items-center justify-center gap-2 hover:bg-red-600 transition-colors pointer-events-auto bottom-0"}>
<i className={"ri-megaphone-fill text-xl"}></i>
<span className={"font-bold text-sm"}>{"Divulgar Fuga"}</span>
</Link>
</div>

{/* Região sempre presente para leitores de tela anunciarem o resultado do compartilhamento. */}
<div role="status" className={"fixed top-3 left-0 right-0 mx-auto w-full sm:max-w-sm px-4 z-50 empty:hidden"}>
{shareMessage && <p className={"bg-teal-50 text-teal-800 border border-teal-100 text-sm rounded-xl px-4 py-3 shadow-md break-words"}>{shareMessage}</p>}
</div>

</div>
<Navigation /></div>; }
