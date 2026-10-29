import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import PageHeader from '../components/PageHeader';
import { api } from '../api';

const inputClass = 'w-full px-4 py-3 rounded-xl border border-gray-200 bg-white mt-2';
export default function NewAnimal() {
  const navigate = useNavigate();
  const [data, setData] = useState({ nome: '', especie: 'Cachorro', raca: '', cor: '', genero: '' });
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!photo) { setPreview(''); return; }
    const url = URL.createObjectURL(photo); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  const update = e => setData(v => ({ ...v, [e.target.name]: e.target.value }));
  function choosePhoto(e) {
    const file = e.target.files[0]; e.target.value = ''; setError('');
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) return setError('Escolha uma foto JPG, PNG ou WEBP de até 5 MB.');
    setPhoto(file);
  }
  async function submit(e) {
    e.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try {
      const body = new FormData();
      Object.entries(data).forEach(([key, value]) => body.append(key, value));
      if (photo) body.append('foto', photo);
      const result = await api('/animais', { method: 'POST', body });
      navigate(`/animais/${result.animal.id_animal}/avistamentos`, { state: { animalCreated: true } });
    } catch (err) { setError(err.message); setBusy(false); }
  }
  return <div className="min-h-screen bg-gray-100"><div className="w-full sm:max-w-sm mx-auto min-h-screen bg-surface sm:shadow-2xl">
    <PageHeader title="Cadastrar animal" back="/animais" />
    <main className="p-5 pb-28">
      <p className="text-sm text-gray-600 mb-5">Confira se este animal já está cadastrado. O cadastro recebe uma identificação automática e fica pendente de validação. Ele não comprova tutela.</p>
      <Link to="/animais" className="block text-teal-700 underline mb-5">Consultar animais existentes</Link>
      <form onSubmit={submit} className="grid gap-5 text-sm">
        <label className="font-semibold">Foto de identificação (opcional)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} className="block mt-2 w-full" /></label>
        {preview && <><img src={preview} alt="Prévia da identificação do animal" className="w-full h-48 object-cover rounded-xl" /><button type="button" onClick={() => setPhoto(null)} className="text-red-600">Remover foto</button></>}
        {['nome', 'raca', 'cor'].map(key => <label key={key} className="font-semibold">{{ nome: 'Nome', raca: 'Raça', cor: 'Cor' }[key]} (opcional)<input name={key} value={data[key]} onChange={update} maxLength={key === 'nome' ? 100 : 50} className={inputClass} /></label>)}
        <label className="font-semibold">Espécie<select name="especie" value={data.especie} onChange={update} className={inputClass}><option>Cachorro</option><option>Gato</option><option>Outro</option></select></label>
        <label className="font-semibold">Sexo<select name="genero" value={data.genero} onChange={update} className={inputClass}><option value="">Não sei informar</option><option>Macho</option><option>Fêmea</option></select></label>
        {error && <p role="alert" className="text-red-600">{error}</p>}
        <button disabled={busy} className="bg-brand-teal text-white rounded-xl py-4 font-bold disabled:opacity-50">{busy ? 'Cadastrando...' : 'Cadastrar animal'}</button>
      </form>
    </main>
  </div><Navigation /></div>;
}
