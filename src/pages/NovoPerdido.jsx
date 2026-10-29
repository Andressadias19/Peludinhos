import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import PageHeader from '../components/PageHeader';
import PerdidoFields, { emptyPerdido, friendlyError, perdidoFormData, photoFileError, todayLocal, usePhotoPreview, validatePerdido } from '../components/PerdidoForm';
import { api } from '../api';

export default function NovoPerdido() {
  const navigate = useNavigate();
  const [data, setData] = useState(emptyPerdido);
  const [errors, setErrors] = useState({});
  const [photo, setPhoto] = useState(null);
  const [photoError, setPhotoError] = useState('');
  const [error, setError] = useState('');
  const [phoneMissing, setPhoneMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const preview = usePhotoPreview(photo);
  const today = todayLocal();
  function update(event) {
    const { name, value } = event.target;
    setData(current => ({ ...current, [name]: value }));
    setErrors(current => ({ ...current, [name]: undefined }));
  }
  function choosePhoto(event) {
    const file = event.target.files[0]; setPhotoError('');
    if (!file) return;
    const problem = photoFileError(file);
    event.target.value = '';
    if (problem) setPhotoError(problem); else setPhoto(file);
  }
  async function submit(event) {
    event.preventDefault();
    // A ref bloqueia cliques repetidos antes mesmo de o estado "busy" ser renderizado.
    if (sending.current) return;
    setError(''); setPhoneMissing(false);
    const found = validatePerdido(data, today);
    setErrors(found);
    if (Object.keys(found).length) { setError('Revise os campos destacados.'); return; }
    sending.current = true; setBusy(true);
    try {
      const result = await api('/perdidos', { method: 'POST', body: perdidoFormData(data, { photo }) });
      navigate(`/perdidos/${result.perdido.id_perda}`, { replace: true });
    } catch (err) {
      sending.current = false; setBusy(false);
      if (err.status === 400 && /telefone/i.test(err.message)) setPhoneMissing(true);
      else setError(friendlyError(err));
    }
  }
  return <div className="min-h-screen bg-gray-100"><div className="w-full sm:max-w-sm mx-auto min-h-screen bg-surface sm:shadow-2xl">
    <PageHeader title="Divulgar fuga" back="/perdidos" />
    <main className="px-5 pt-6 pb-28">
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <div>
          <h2 className="text-xl font-bold">Seu animal desapareceu?</h2>
          <p className="text-sm text-gray-500 mt-1">Preencha os dados para a comunidade ajudar a encontrá-lo. Campos com * são obrigatórios.</p>
        </div>
        <div>
          <span className="block text-sm font-semibold text-gray-700 mb-2">Foto do animal (opcional)</span>
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-teal-700 rounded-2xl p-4 bg-white cursor-pointer">
            {preview ? <img src={preview} alt="Prévia da foto do animal" className="w-full h-40 object-cover rounded-xl" /> : <i aria-hidden="true" className="ri-camera-fill text-4xl text-teal-700" />}
            <span className="font-bold text-sm text-teal-700">{photo ? 'Trocar foto' : 'Adicionar foto do animal'}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Foto do animal" onChange={choosePhoto} disabled={busy} className="block max-w-full text-xs" />
            <span className="text-xs text-gray-500">JPG, PNG ou WEBP, até 5 MB</span>
          </label>
          {photo && <button type="button" disabled={busy} className="block mx-auto text-sm text-red-600 mt-2" onClick={() => setPhoto(null)}>Remover foto</button>}
          {photoError && <p role="alert" className="text-xs text-red-600 mt-1">{photoError}</p>}
        </div>
        <PerdidoFields data={data} errors={errors} onChange={update} today={today} />
        <p className="bg-teal-50 text-teal-800 text-sm rounded-xl px-4 py-3"><i aria-hidden="true" className="ri-phone-line mr-1" />Seu telefone cadastrado no perfil ficará disponível para outros usuários autenticados que visualizarem esta publicação, para que possam entrar em contato sobre o animal.</p>
        {phoneMissing && <div role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <p>Para publicar, cadastre um telefone no seu perfil. Assim, quem tiver pistas consegue falar com você.</p>
          <Link to="/perfil" target="_blank" rel="noopener" className="inline-block font-bold text-teal-700 underline mt-2">Abrir meu perfil em nova aba</Link>
          <p className="text-xs text-gray-500 mt-1">Os dados preenchidos aqui continuam salvos nesta aba. Depois de cadastrar o telefone, volte e publique.</p>
        </div>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className="w-full bg-brand-orange hover:bg-orange-600 text-white font-bold py-4 rounded-xl disabled:opacity-50">{busy ? 'Publicando...' : 'Publicar desaparecimento'}</button>
        <Link to="/perdidos" className="text-center text-teal-700 font-bold py-2">Cancelar</Link>
      </form>
    </main>
  </div><Navigation /></div>;
}
