import { useEffect, useState } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { api, hasSession } from '../../api';
import { friendlyError } from '../PerdidoForm';

// A tela só decide o que mostrar; quem garante o acesso é o backend, que confere o papel no banco a cada requisição.
export default function AdminRoute() {
  const location = useLocation();
  const session = hasSession();
  const [state, setState] = useState({ status: 'loading' });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!session) return;
    let active = true; setState({ status: 'loading' });
    api('/admin/me').then(data => { if (active) setState({ status: 'ok', admin: data.administrador }); })
      .catch(err => {
        // 401: o api.js já dispara session-expired e o App leva ao login.
        if (!active || err.status === 401) return;
        setState(err.status === 403 ? { status: 'denied' } : { status: 'error', message: friendlyError(err) });
      });
    return () => { active = false; };
  }, [session, retry]);

  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (state.status === 'ok') return <Outlet context={{ admin: state.admin }} />;
  return <div className="min-h-screen bg-surface flex items-center justify-center p-6">
    {state.status === 'loading' && <p role="status" className="flex items-center gap-3 text-teal-700 font-semibold"><i aria-hidden="true" className="ri-loader-4-line text-2xl animate-spin" />Verificando acesso ao painel...</p>}
    {state.status === 'denied' && <AccessMessage icon="ri-lock-2-line" title="Acesso negado" text="Esta área é exclusiva para administradores do Peludinhos. Se você deveria ter acesso, procure a equipe responsável." />}
    {state.status === 'error' && <AccessMessage icon="ri-wifi-off-line" title="Não foi possível abrir o painel" text={state.message}>
      <button type="button" onClick={() => setRetry(value => value + 1)} className="w-full bg-brand-teal text-white font-bold rounded-xl py-3">Tentar novamente</button>
    </AccessMessage>}
  </div>;
}

function AccessMessage({ icon, title, text, children }) {
  return <main role="alert" className="w-full max-w-sm bg-white rounded-3xl shadow-lg p-8 text-center">
    <span className="mx-auto mb-4 flex w-16 h-16 items-center justify-center rounded-full bg-orange-50 text-brand-orange"><i aria-hidden="true" className={`${icon} text-3xl`} /></span>
    <h1 className="text-xl font-bold text-gray-900">{title}</h1>
    <p className="text-sm text-gray-500 mt-2 mb-6">{text}</p>
    <div className="flex flex-col gap-3">{children}<Link to="/mapa" className="text-teal-700 font-bold py-2">Voltar ao Peludinhos</Link></div>
  </main>;
}
