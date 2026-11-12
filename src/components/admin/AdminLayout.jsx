import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useOutletContext } from 'react-router-dom';
import { api } from '../../api';
import { friendlyError } from '../PerdidoForm';

export const adminSections = [
  { to: '/admin', label: 'Visão geral', icon: 'ri-dashboard-3-line', end: true },
  { to: '/admin/validacoes', label: 'Validações', icon: 'ri-shield-check-line', badge: true },
  { to: '/admin/animais', label: 'Animais', icon: 'ri-bear-smile-line' },
  { to: '/admin/avistamentos', label: 'Avistamentos', icon: 'ri-map-pin-2-line' },
  { to: '/admin/usuarios', label: 'Usuários', icon: 'ri-group-line' },
  { to: '/admin/desaparecimentos', label: 'Desaparecimentos', icon: 'ri-megaphone-line' },
];

// O resumo é buscado uma vez aqui e compartilhado com as páginas, inclusive para o contador de pendências do menu.
function useResumo() {
  const [state, setState] = useState({ data: null, geradoEm: null, loading: true, error: '' });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setState(current => ({ ...current, loading: true, error: '' }));
    api('/admin/resumo').then(result => { if (active) setState({ data: result.resumo, geradoEm: result.gerado_em, loading: false, error: '' }); })
      .catch(err => { if (active && err.status !== 401) setState(current => ({ ...current, loading: false, error: friendlyError(err) })); });
    return () => { active = false; };
  }, [version]);
  const reload = useCallback(() => setVersion(value => value + 1), []);
  return { ...state, reload };
}

export default function AdminLayout() {
  const { admin } = useOutletContext();
  const resumo = useResumo();
  const pendentes = resumo.data ? resumo.data.animais.pendentes + resumo.data.associacoes.pendentes : 0;
  return <div className="min-h-screen bg-surface lg:flex">
    <aside className="hidden lg:flex lg:flex-col fixed inset-y-0 left-0 w-64 bg-brand-teal text-white rounded-r-3xl shadow-xl z-30">
      <Brand />
      <nav aria-label="Seções do painel" className="flex-1 px-4 mt-4 flex flex-col gap-1">
        {adminSections.map(item => <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition ${isActive ? 'bg-white text-teal-800 shadow-sm' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}>
          {({ isActive }) => <>
            <i aria-hidden="true" className={`${item.icon} text-xl ${isActive ? 'text-brand-orange' : ''}`} />
            <span className="flex-1">{item.label}</span>
            {item.badge && pendentes > 0 && <span className="min-w-6 rounded-full bg-brand-orange px-2 py-0.5 text-center text-xs font-bold text-white" aria-label={`${pendentes} pendentes`}>{pendentes}</span>}
          </>}
        </NavLink>)}
      </nav>
      <div className="m-4 rounded-2xl bg-white/10 p-4">
        <p className="text-xs text-white/70">Conectado como</p>
        <p className="font-bold break-words">{admin.nome}</p>
        <Link to="/mapa" className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-white text-teal-800 font-bold py-2.5 text-sm hover:bg-teal-50"><i aria-hidden="true" className="ri-arrow-go-back-line" />Voltar ao Peludinhos</Link>
      </div>
    </aside>

    <header className="lg:hidden sticky top-0 z-30 bg-brand-teal text-white rounded-b-3xl shadow-sm">
      <div className="flex items-center justify-between px-4 pt-4"><Brand compact />
        <Link to="/mapa" aria-label="Voltar ao Peludinhos" className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-2 text-xs font-bold"><i aria-hidden="true" className="ri-arrow-go-back-line text-base" />Peludinhos</Link>
      </div>
      <nav aria-label="Seções do painel" className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3">
        {adminSections.map(item => <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold ${isActive ? 'bg-white text-teal-800' : 'bg-white/15 text-white'}`}>
          <i aria-hidden="true" className={`${item.icon} text-base`} />{item.label}
          {item.badge && pendentes > 0 && <span className="rounded-full bg-brand-orange px-1.5 text-[10px] text-white">{pendentes}</span>}
        </NavLink>)}
      </nav>
    </header>

    <main className="flex-1 lg:ml-64 min-w-0">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10"><Outlet context={{ admin, resumo }} /></div>
    </main>
  </div>;
}

function Brand({ compact = false }) {
  return <div className={`flex items-center gap-3 ${compact ? '' : 'px-6 pt-8'}`}>
    <img src="/assets/icons/peludinhos.svg" alt="" className={`${compact ? 'w-7' : 'w-9'} brightness-0 invert`} />
    <div><p className={`font-bold leading-tight ${compact ? 'text-base' : 'text-lg'}`}>Peludinhos</p>
      <span className="inline-block mt-0.5 rounded-full bg-brand-orange px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">Administração</span></div>
  </div>;
}
