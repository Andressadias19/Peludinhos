import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Navigation from '../components/Navigation';
import PageHeader from '../components/PageHeader';
import FotoPerdido from '../components/FotoPerdido';
import PerdidoFields, { friendlyError, perdidoFormData, perdidoToForm, photoFileError, todayLocal, usePhotoPreview, validatePerdido } from '../components/PerdidoForm';
import { api } from '../api';

// O backend também confere o autor; esta tela apenas evita mostrar um formulário que seria recusado.
export async function saveEdit({ id, data, photo, removePhoto, request = api }) {
  await request(`/perdidos/${id}`, { method: 'PUT', body: perdidoFormData(data, { photo, removePhoto }) });
  return `/perdidos/${id}`;
}

export const accessStatus = perdido => perdido.eh_autor === true ? 'ready' : 'forbidden';
// 400 (id inválido na URL) e 404 levam à mesma mensagem de publicação inexistente.
export const loadErrorStatus = err => err.status === 404 || err.status === 400 ? 'notFound' : 'error';

export function Message({ icon, title, text, to, label }) {
  return <div className="p-6 text-center">
    <i aria-hidden="true" className={`${icon} text-5xl text-gray-300`} />
    <h2 className="font-bold text-lg mt-2">{title}</h2>
    <p className="text-sm text-gray-500 mt-2">{text}</p>
    <Link to={to} className="block text-center bg-brand-teal text-white font-bold rounded-xl py-3 mt-6">{label}</Link>
  </div>;
}

export function EditForm({ item, onNotFound, onForbidden }) {
  const navigate = useNavigate();
  const [data, setData] = useState(() => perdidoToForm(item));
  const [errors, setErrors] = useState({});
  const [photo, setPhoto] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const preview = usePhotoPreview(photo);
  const today = todayLocal();
  const showCurrent = item.tem_foto && !removePhoto;
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
    if (problem) return setPhotoError(problem);
    // Escolher uma foto nova cancela um pedido de remoção: as duas coisas nunca vão juntas.
    setPhoto(file); setRemovePhoto(false);
  }
  async function submit(event) {
    event.preventDefault();
    if (sending.current) return;
    setError('');
    const found = validatePerdido(data, today);
    setErrors(found);
    if (Object.keys(found).length) { setError('Revise os campos destacados.'); return; }
    sending.current = true; setBusy(true);
    try {
      const to = await saveEdit({ id: item.id_perda, data, photo, removePhoto });
      navigate(to, { replace: true, state: { updated: true } });
    } catch (err) {
      sending.current = false; setBusy(false);
      if (err.status === 404) onNotFound();
      else if (err.status === 403) onForbidden();
      else setError(friendlyError(err));
    }
  }
  return <form onSubmit={submit} noValidate className="flex flex-col gap-5">
    <div>
      <h2 className="text-xl font-bold">Editar publicação</h2>
      <p className="text-sm text-gray-500 mt-1">Atualize os dados do desaparecimento. Campos com * são obrigatórios.</p>
    </div>
    <div>
      <span className="block text-sm font-semibold text-gray-700 mb-2">Foto do animal (opcional)</span>
      <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-teal-700 rounded-2xl p-4 bg-white cursor-pointer">
        {preview ? <img src={preview} alt="Prévia da nova foto do animal" className="w-full h-40 object-cover rounded-xl" />
          : showCurrent ? <FotoPerdido id={item.id_perda} temFoto alt="Foto atual do animal" className="w-full h-40 object-cover rounded-xl" />
          : <i aria-hidden="true" className="ri-camera-fill text-4xl text-teal-700" />}
        <span className="font-bold text-sm text-teal-700">{photo || showCurrent ? 'Trocar foto' : 'Adicionar foto do animal'}</span>
        <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Foto do animal" onChange={choosePhoto} disabled={busy} className="block max-w-full text-xs" />
        <span className="text-xs text-gray-500">JPG, PNG ou WEBP, até 5 MB</span>
      </label>
      {photo && <button type="button" disabled={busy} className="block mx-auto text-sm text-red-600 mt-2" onClick={() => setPhoto(null)}>Descartar nova foto</button>}
      {!photo && showCurrent && <button type="button" disabled={busy} className="block mx-auto text-sm text-red-600 mt-2" onClick={() => setRemovePhoto(true)}>Remover fotografia atual</button>}
      {removePhoto && <div role="status" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mt-2">
        A fotografia atual será removida ao salvar.
        <button type="button" disabled={busy} className="block font-bold text-teal-700 underline mt-1" onClick={() => setRemovePhoto(false)}>Manter a fotografia atual</button>
      </div>}
      {photoError && <p role="alert" className="text-xs text-red-600 mt-1">{photoError}</p>}
    </div>
    <PerdidoFields data={data} errors={errors} onChange={update} today={today} />
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <button type="submit" disabled={busy} className="w-full bg-brand-orange hover:bg-orange-600 text-white font-bold py-4 rounded-xl disabled:opacity-50">{busy ? 'Salvando...' : 'Salvar alterações'}</button>
    <Link to={`/perdidos/${item.id_perda}`} className="text-center text-teal-700 font-bold py-2">Cancelar</Link>
  </form>;
}

export default function EditarPerdido() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [status, setStatus] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setStatus('loading'); setItem(null);
    api(`/perdidos/${id}`).then(data => {
      if (!active) return;
      setItem(data.perdido); setStatus(accessStatus(data.perdido));
    }).catch(err => {
      if (!active) return;
      setLoadError(friendlyError(err)); setStatus(loadErrorStatus(err));
    });
    return () => { active = false; };
  }, [id, retry]);
  return <div className="min-h-screen bg-gray-100"><div className="w-full sm:max-w-sm mx-auto min-h-screen bg-surface sm:shadow-2xl">
    <PageHeader title="Editar publicação" back={`/perdidos/${id}`} />
    <main className="px-5 pt-6 pb-28">
      {status === 'loading' && <p role="status">Carregando publicação...</p>}
      {status === 'error' && <div role="alert" className="text-red-600"><p>{loadError}</p><button onClick={() => setRetry(value => value + 1)} className="underline mt-3">Tentar novamente</button><Link to={`/perdidos/${id}`} className="block text-teal-700 mt-4">Voltar à publicação</Link></div>}
      {status === 'notFound' && <Message icon="ri-search-eye-line" title="Publicação não encontrada" text="Ela pode ter sido excluída ou o link está incorreto." to="/perdidos" label="Voltar para Perdidos" />}
      {status === 'forbidden' && <Message icon="ri-lock-line" title="Edição não permitida" text="Somente o tutor que criou esta publicação pode editá-la." to={`/perdidos/${id}`} label="Voltar à publicação" />}
      {status === 'ready' && <EditForm key={item.id_perda} item={item} onNotFound={() => setStatus('notFound')} onForbidden={() => setStatus('forbidden')} />}
    </main>
  </div><Navigation /></div>;
}
