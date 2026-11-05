import { useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { hasSession } from './api';
import Auth from './pages/Auth';
import Profile from './pages/Profile';
import Animals from './pages/Animals';
import MapPage from './pages/MapPage';
import AnimaisPerdidos from './pages/AnimaisPerdidos';
import DetalhesPerdido from './pages/DetalhesPerdido';
import NovoPerdido from './pages/NovoPerdido';
import EditarPerdido from './pages/EditarPerdido';
import AnimalDetails from './pages/AnimalDetails';
import NewSighting from './pages/NewSighting';
import AnimalHistory from './pages/AnimalHistory';
import NewAnimal from './pages/NewAnimal';
import SolicitarAssociacao from './pages/SolicitarAssociacao';
import Sightings from './pages/Sightings';

// Guarda a página pedida para o login devolver o usuário a ela (ex.: link de uma publicação).
function Protected() {
  const location = useLocation();
  return hasSession() ? <Outlet /> : <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
}

export default function App() {
  const navigate = useNavigate();
  useEffect(() => {
    // Leva a página atual para o login devolver o usuário a ela (safeRedirect valida o caminho).
    const expired = () => navigate('/login', { replace: true, state: { from: window.location.pathname + window.location.search } });
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
      <Route path="/perdidos" element={<AnimaisPerdidos />} /><Route path="/perfil" element={<Profile />} />
      <Route path="/perdidos/novo" element={<NovoPerdido />} /><Route path="/perdidos/:id" element={<DetalhesPerdido />} />
      <Route path="/perdidos/:id/editar" element={<EditarPerdido />} />
      <Route path="/detalhes-animal" element={<AnimalDetails />} /><Route path="/novo-avistamento" element={<NewSighting />} />
      <Route path="/avistamentos/:id" element={<AnimalDetails />} />
      <Route path="/avistamentos/:id/associar" element={<SolicitarAssociacao />} />
      <Route path="/animais/:id/avistamentos" element={<AnimalHistory />} />
      <Route path="/animais/novo" element={<NewAnimal />} />
      <Route path="/animais/:id/editar" element={<NewAnimal />} />
      <Route path="/avistamentos" element={<Sightings />} />
    </Route>
    {Object.entries(aliases).map(([from, to]) => <Route key={from} path={from} element={<Navigate to={to} replace />} />)}
    <Route path="*" element={<main className="p-8 text-center"><h1>Página não encontrada</h1><button className="text-teal-700 mt-4" onClick={() => navigate('/')}>Voltar ao início</button></main>} />
  </Routes>;
}
