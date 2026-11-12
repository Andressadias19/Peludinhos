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
import AdminRoute from './components/admin/AdminRoute';
import AdminLayout from './components/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminValidacoes from './pages/admin/AdminValidacoes';
import AdminValidacaoAnimal from './pages/admin/AdminValidacaoAnimal';
import AdminValidacaoAssociacao from './pages/admin/AdminValidacaoAssociacao';
import AdminAnimais from './pages/admin/AdminAnimais';
import AdminAnimalDetalhe from './pages/admin/AdminAnimalDetalhe';
import AdminAnimalForm from './pages/admin/AdminAnimalForm';
import AdminAvistamentos from './pages/admin/AdminAvistamentos';
import AdminAvistamentoDetalhe from './pages/admin/AdminAvistamentoDetalhe';
import AdminAvistamentoForm from './pages/admin/AdminAvistamentoForm';
import AdminUsuarios from './pages/admin/AdminUsuarios';
import AdminUsuarioDetalhe from './pages/admin/AdminUsuarioDetalhe';
import AdminUsuarioForm from './pages/admin/AdminUsuarioForm';
import AdminDesaparecimentos from './pages/admin/AdminDesaparecimentos';
import AdminDesaparecimentoDetalhe from './pages/admin/AdminDesaparecimentoDetalhe';
import AdminDesaparecimentoForm from './pages/admin/AdminDesaparecimentoForm';

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
    <Route path="/admin" element={<AdminRoute />}>
      <Route element={<AdminLayout />}>
        <Route index element={<AdminDashboard />} />
        <Route path="validacoes" element={<AdminValidacoes />} />
        <Route path="validacoes/animais/:id" element={<AdminValidacaoAnimal />} />
        <Route path="validacoes/associacoes/:id" element={<AdminValidacaoAssociacao />} />
        <Route path="animais" element={<AdminAnimais />} />
        <Route path="animais/novo" element={<AdminAnimalForm />} />
        <Route path="animais/:id" element={<AdminAnimalDetalhe />} />
        <Route path="animais/:id/editar" element={<AdminAnimalForm key="editar" />} />
        <Route path="avistamentos" element={<AdminAvistamentos />} />
        <Route path="avistamentos/novo" element={<AdminAvistamentoForm />} />
        <Route path="avistamentos/:id" element={<AdminAvistamentoDetalhe />} />
        <Route path="avistamentos/:id/editar" element={<AdminAvistamentoForm key="editar" />} />
        <Route path="usuarios" element={<AdminUsuarios />} />
        <Route path="usuarios/:id" element={<AdminUsuarioDetalhe />} />
        <Route path="usuarios/:id/editar" element={<AdminUsuarioForm />} />
        <Route path="desaparecimentos" element={<AdminDesaparecimentos />} />
        <Route path="desaparecimentos/novo" element={<AdminDesaparecimentoForm />} />
        <Route path="desaparecimentos/:id" element={<AdminDesaparecimentoDetalhe />} />
        <Route path="desaparecimentos/:id/editar" element={<AdminDesaparecimentoForm key="editar" />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Route>
    {Object.entries(aliases).map(([from, to]) => <Route key={from} path={from} element={<Navigate to={to} replace />} />)}
    <Route path="*" element={<main className="p-8 text-center"><h1>Página não encontrada</h1><button className="text-teal-700 mt-4" onClick={() => navigate('/')}>Voltar ao início</button></main>} />
  </Routes>;
}
