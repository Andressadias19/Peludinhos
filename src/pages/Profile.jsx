import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import Navigation from '../components/Navigation';
import { Field, buttonClass } from './Auth';

export default function Profile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [mode, setMode] = useState('view');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    api('/usuarios/me').then(data => { if (active) setUser(data.usuario); }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [attempt]);
  async function submit(event) {
    event.preventDefault(); setError(''); setMessage('');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (mode === 'password' && data.nova_senha !== data.confirmacao) return setError('As senhas não conferem.');
    setBusy(true);
    try {
      if (mode === 'edit') {
        const result = await api('/usuarios/me', { method: 'PATCH', body: JSON.stringify({ nome: data.nome, telefone: data.telefone }) });
        setUser(result.usuario);
      } else {
        await api('/usuarios/me/senha', { method: 'PATCH', body: JSON.stringify({ senha_atual: data.senha_atual, nova_senha: data.nova_senha }) });
      }
      setMode('view'); setMessage('Alterações salvas com sucesso.');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function photo(file) {
    setError(''); setMessage('');
    if (file && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) return setError('Escolha uma imagem JPG, PNG ou WEBP de até 5 MB.');
    setBusy(true);
    try {
      const result = await api('/usuarios/me/foto', file ? { method: 'PUT', headers: { 'Content-Type': file.type }, body: file } : { method: 'DELETE' });
      setUser(result.usuario); setMessage('Foto atualizada.');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <div className="auth-page min-h-screen p-6 pb-28"><main className="max-w-sm mx-auto">
    <h1 className="text-2xl font-bold text-teal-700 mt-6 mb-8">Meu perfil</h1>
    {error && <p role="alert" className="text-red-600 my-4">{error}</p>}
    {message && <p role="status" className="text-teal-700 my-4">{message}</p>}
    {!user ? error ? <button onClick={() => { setError(''); setAttempt(attempt + 1); }}>Tentar novamente</button> : <p role="status">Carregando perfil...</p> : <>
      <div className="text-center mb-8">
        {user.foto_perfil ? <img className="w-24 h-24 rounded-full object-cover mx-auto" src={user.foto_perfil} alt={`Foto de ${user.nome}`} /> : <i className="ri-user-heart-line text-7xl text-teal-700" />}
        <h2 className="text-xl font-bold mt-3">{user.nome}</h2>
        <p className="text-sm text-gray-500">Membro desde {new Date(user.data_cadastro).toLocaleDateString('pt-BR')}</p>
      </div>
      {mode === 'view' ? <div className="flex flex-col gap-4">
        <p><strong>E-mail:</strong> {user.email}</p><p><strong>Telefone:</strong> {user.telefone || 'Não informado'}</p>
        {/* Só esconde o botão; o acesso ao painel é conferido no backend em /api/admin. */}
        {user.tipo_usuario === 'administrador' && <Link to="/admin" className="flex items-center justify-center gap-2 bg-brand-teal hover:bg-teal-800 text-white font-bold py-3.5 rounded-xl"><i aria-hidden="true" className="ri-shield-user-line text-xl" />Painel Administrativo</Link>}
        <button className={buttonClass} disabled={busy} onClick={() => { setMode('edit'); setMessage(''); }}>Editar perfil</button>
        <button className="text-teal-700 py-3 border rounded-xl" disabled={busy} onClick={() => { setMode('password'); setMessage(''); }}>Alterar senha</button>
        <label className="text-teal-700 text-center border rounded-xl py-3 cursor-pointer">Trocar foto<input className="block w-full text-sm mt-2 px-3" aria-label="Escolher foto do perfil" disabled={busy} type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { if (event.target.files[0]) photo(event.target.files[0]); event.target.value = ''; }} /></label>
        {user.foto_perfil && <button disabled={busy} onClick={() => photo(null)}>Remover foto</button>}
        <button className="text-red-600 py-3" onClick={() => { localStorage.removeItem('token'); navigate('/login', { replace: true }); }}>Sair da conta</button>
      </div> : <form onSubmit={submit} className="flex flex-col gap-4" key={mode}>
        {mode === 'edit' ? <><Field label="Nome completo" name="nome" required minLength={3} maxLength={255} defaultValue={user.nome} /><Field label="Celular com DDD" name="telefone" type="tel" required maxLength={15} defaultValue={user.telefone || ''} /></> : <>
          <Field label="Senha atual" name="senha_atual" type="password" required autoComplete="current-password" />
          <Field label="Nova senha" name="nova_senha" type="password" required minLength={6} autoComplete="new-password" />
          <Field label="Confirmar nova senha" name="confirmacao" type="password" required minLength={6} autoComplete="new-password" />
        </>}
        <button disabled={busy} className={buttonClass}>{busy ? 'Salvando...' : 'Salvar alterações'}</button>
        <button type="button" disabled={busy} onClick={() => { setMode('view'); setError(''); }}>Cancelar</button>
      </form>}
    </>}
  </main><Navigation /></div>;
}
