import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';

export function Field({ label, name, type = 'text', ...props }) {
  const [visible, setVisible] = useState(false);
  return <label className="block text-sm font-medium text-gray-700"><span>{label}</span>
    <div className="relative mt-1"><input name={name} type={type === 'password' && visible ? 'text' : type} className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-xl bg-gray-50 focus:ring-2 focus:ring-teal-700 outline-none" {...props} />
      {type === 'password' && <button type="button" aria-label={visible ? `Ocultar ${label}` : `Mostrar ${label}`} onClick={() => setVisible(!visible)} className="absolute right-4 top-3"><i className={visible ? 'ri-eye-off-line' : 'ri-eye-line'} /></button>}
    </div></label>;
}
export const buttonClass = 'w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3.5 px-4 rounded-xl disabled:opacity-50';

export default function Auth({ signup = false }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  async function submit(event) {
    event.preventDefault(); setError(''); setSuccess('');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const telefone = data.telefone?.replace(/\D/g, '');
    if (signup && data.senha !== data.confirmacao) return setError('As senhas não conferem.');
    if (signup && (telefone.length < 10 || telefone.length > 11)) return setError('Informe um celular válido com DDD.');
    setBusy(true);
    try {
      if (signup) {
        await api('/usuarios', { method: 'POST', body: JSON.stringify({ nome: data.nome.trim(), email: data.email.trim(), senha: data.senha, telefone }) });
        setSuccess('Cadastro realizado! Faça login para continuar.');
      } else {
        const result = await api('/login', { method: 'POST', body: JSON.stringify({ email: data.email.trim(), senha: data.senha }) });
        localStorage.setItem('token', result.token); navigate('/mapa', { replace: true });
      }
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <div className="auth-page min-h-screen flex justify-center p-6"><main className="w-full max-w-sm my-auto py-6">
    <img src="/assets/images/logo.png" alt="Peludinhos" className="w-80 mx-auto mb-10" />
    <h1 className="text-2xl text-center font-bold text-teal-700 mb-2">{signup ? 'Crie sua conta' : 'Bem-vindo de volta!'}</h1>
    <p className="text-center text-gray-500 mb-8">{signup ? 'Faça parte dessa rede de cuidado.' : 'Entre para ajudar nossos peludinhos.'}</p>
    <form onSubmit={submit} className="flex flex-col gap-4">
      {signup && <Field label="Nome completo" name="nome" required minLength={3} maxLength={255} autoComplete="name" />}
      <Field label="E-mail" name="email" type="email" required autoComplete="email" />
      {signup && <Field label="Celular com DDD" name="telefone" type="tel" required maxLength={15} autoComplete="tel" />}
      <Field label="Senha" name="senha" type="password" required minLength={signup ? 6 : undefined} autoComplete={signup ? 'new-password' : 'current-password'} />
      {signup && <Field label="Confirmar senha" name="confirmacao" type="password" required minLength={6} autoComplete="new-password" />}
      {error && <p role="alert" className="text-red-600 text-sm">{error}</p>}
      {success && <p role="status" className="text-teal-700">{success} <Link to="/login" className="underline">Entrar</Link></p>}
      <button disabled={busy || !!success} className={buttonClass}>{busy ? 'Aguarde...' : signup ? 'Criar conta' : 'Entrar'}</button>
    </form>
    <div className="text-center text-gray-400 my-6">ou</div>
    <Link to={signup ? '/login' : '/cadastro'} className="block text-center border-2 border-teal-700 text-teal-700 font-bold py-3 rounded-xl">{signup ? 'Já tenho conta' : 'Criar conta'}</Link>
  </main></div>;
}
