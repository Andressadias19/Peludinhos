import { useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { hasSession } from './api';
import Auth from './pages/Auth';
import Profile from './pages/Profile';
import Animals from './pages/Animals';
import MapPage from './pages/MapPage';
import Lost from './pages/Lost';
import AnimalDetails from './pages/AnimalDetails';
import NewSighting from './pages/NewSighting';

function Protected() { return hasSession() ? <Outlet /> : <Navigate to="/login" replace />; }

export default function App() {
  const navigate = useNavigate();
  useEffect(() => {
    const expired = () => navigate('/login', { replace: true });
    window.addEventListener('session-expired', expired);
    return () => window.removeEventListener('session-expired', expired);
  }, [navigate]);
  const aliases = { '/index.html': '/login', '/login.html': '/login', '/pages/cadastro.html': '/cadastro', '/pages/mapa.html': '/mapa', '/pages/animais.html': '/animais', '/pages/perdidos.html': '/perdidos', '/pages/perfil.html': '/perfil', '/pages/detalhes_animal.html': '/detalhes-animal', '/pages/novo_avistamento.html': '/novo-avistamento' };
  return <Routes>
    <Route path="/" element={<Navigate to={hasSession() ? '/mapa' : '/login'} replace />} />
    <Route path="/login" element={<Auth key="login" />} />
    <Route path="/cadastro" element={<Auth key="signup" signup />} />
    <Route element={<Protected />}>
      <Route path="/mapa" element={<MapPage />} /><Route path="/animais" element={<Animals />} />
      <Route path="/perdidos" element={<Lost />} /><Route path="/perfil" element={<Profile />} />
      <Route path="/detalhes-animal" element={<AnimalDetails />} /><Route path="/novo-avistamento" element={<NewSighting />} />
      <Route path="/avistamentos/:id" element={<AnimalDetails />} />
    </Route>
    {Object.entries(aliases).map(([from, to]) => <Route key={from} path={from} element={<Navigate to={to} replace />} />)}
    <Route path="*" element={<main className="p-8 text-center"><h1>Página não encontrada</h1><button className="text-teal-700 mt-4" onClick={() => navigate('/')}>Voltar ao início</button></main>} />
  </Routes>;
}
