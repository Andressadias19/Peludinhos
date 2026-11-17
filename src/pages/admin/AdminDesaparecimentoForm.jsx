import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { api } from '../../api';
import FotoPerdido from '../../components/FotoPerdido';
import PerdidoFields, { emptyPerdido, friendlyError, perdidoFormData, perdidoToForm, photoFileError, todayLocal, usePhotoPreview, validatePerdido } from '../../components/PerdidoForm';
import { AdminHeader, BackLink, Notice } from '../../components/admin/AdminUI';

const card = 'rounded-3xl border border-gray-100 bg-white p-5 sm:p-6 shadow-sm';

// Reaproveita os campos, a validação e o envio do formulário dos tutores (PerdidoForm).
export default function AdminDesaparecimentoForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const { resumo } = useOutletContext();
  const [current, setCurrent] = useState(null);
  const [data, setData] = useState(emptyPerdido);
  const [status, setStatus] = useState('PERDIDO');
  const [errors, setErrors] = useState({});
  const [photo, setPhoto] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [loading, setLoading] = useState(editing);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [phoneMissing, setPhoneMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const sending = useRef(false);
  const preview = usePhotoPreview(photo);
  const today = todayLocal();
  useEffect(() => {
    if (!editing) return;
    let active = true; setLoading(true); setLoadError('');
    api(`/admin/desaparecimentos/${id}`).then(({ desaparecimento }) => {
      if (!active) return;
      setCurrent(desaparecimento); setData(perdidoToForm(desaparecimento)); setStatus(desaparecimento.status_perda);
    }).catch(err => { if (active && err.status !== 401) setLoadError(friendlyError(err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [editing, id, retry]);
  function update(event) {
    const { name, value } = event.target;
    setData(previous => ({ ...previous, [name]: value }));
    setErrors(previous => ({ ...previous, [name]: undefined }));
  }
  function choosePhoto(event) {
    const file = event.target.files[0]; event.target.value = ''; setError('');
    if (!file) return;
    const problem = photoFileError(file);
    if (problem) setError(problem); else { setPhoto(file); setRemovePhoto(false); }
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
      const body = perdidoFormData(data, { photo, removePhoto: editing && removePhoto });
      if (editing) body.append('status_perda', status);
      const result = await api(editing ? `/admin/desaparecimentos/${id}` : '/admin/desaparecimentos', { method: editing ? 'PUT' : 'POST', body });
      resumo.reload();
      const saved = editing ? result.desaparecimento : result.perdido;
      navigate(`/admin/desaparecimentos/${saved.id_perda}`, { replace: editing, state: { notice: editing ? 'Publicação atualizada.' : 'Desaparecimento publicado. Você consta como tutor responsável.' } });
    } catch (err) {
      sending.current = false; setBusy(false);
      setError(friendlyError(err));
      setPhoneMissing(err.status === 400 && /telefone/i.test(err.message));
    }
  }

  const back = editing ? `/admin/desaparecimentos/${id}` : '/admin/desaparecimentos';
  if (loading) return <p role="status" className="flex items-center gap-2 text-teal-700 font-semibold"><i aria-hidden="true" className="ri-loader-4-line animate-spin text-xl" />Carregando publicação...</p>;
  if (loadError) return <><BackLink to="/admin/desaparecimentos">Voltar aos desaparecimentos</BackLink><div role="alert" className="rounded-3xl border border-red-100 bg-red-50 p-6 text-red-700">
    <p className="font-bold">{loadError}</p><button type="button" onClick={() => setRetry(value => value + 1)} className="mt-4 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-bold">Tentar novamente</button>
  </div></>;
  const hasCurrentPhoto = editing && current.tem_foto && !removePhoto;
  return <>
    <BackLink to={back}>{editing ? 'Voltar aos detalhes' : 'Voltar aos desaparecimentos'}</BackLink>
    <AdminHeader icon={editing ? 'ri-edit-2-line' : 'ri-add-circle-line'} title={editing ? `Editar publicação #${id}` : 'Publicar desaparecimento'}
      description={editing ? `Os campos e validações são os mesmos da publicação feita pelos tutores. O tutor (${current.tutor_nome}) e a data de publicação são mantidos.` : 'Você ficará como tutor responsável, e o telefone do seu perfil será o contato da publicação.'} />
    {!editing && <Notice tone="warning">A publicação exige um telefone cadastrado no seu perfil, como acontece com os tutores.</Notice>}

    <form onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-[18rem_1fr] lg:items-start">
      <section className={card}>
        <h2 className="font-bold text-gray-900">Foto do animal</h2>
        <div className="mt-4 aspect-square overflow-hidden rounded-2xl bg-teal-50 flex items-center justify-center">
          {preview ? <img src={preview} alt="Prévia da nova foto" className="h-full w-full object-cover" />
            : hasCurrentPhoto ? <FotoPerdido id={current.id_perda} temFoto alt="Foto atual da publicação" className="h-full w-full object-cover" />
              : <i aria-hidden="true" className="ri-image-add-line text-5xl text-teal-700/40" />}
        </div>
        <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-teal-700 py-2.5 text-sm font-bold text-teal-700 hover:bg-teal-50">
          <i aria-hidden="true" className="ri-upload-2-line" />{preview || hasCurrentPhoto ? 'Trocar foto' : 'Escolher foto'}
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} className="sr-only" />
        </label>
        {preview && <button type="button" onClick={() => setPhoto(null)} className="mt-2 w-full text-sm font-semibold text-red-600">Descartar nova foto</button>}
        {!preview && hasCurrentPhoto && <button type="button" onClick={() => setRemovePhoto(true)} className="mt-2 w-full text-sm font-semibold text-red-600">Remover foto atual</button>}
        {editing && removePhoto && <button type="button" onClick={() => setRemovePhoto(false)} className="mt-2 w-full text-sm font-semibold text-teal-700">Manter foto atual</button>}
        <p className="mt-3 text-center text-xs text-gray-500">Opcional. JPG, PNG ou WEBP, até 5 MB.</p>
      </section>

      <section className={card}>
        <div className="grid gap-5 sm:grid-cols-2 sm:[&>div:last-child]:col-span-2">
          <PerdidoFields data={data} errors={errors} onChange={update} today={today} />
        </div>
        {editing && <label className="mt-5 block text-sm font-semibold text-gray-700">Situação
          <select value={status} onChange={event => setStatus(event.target.value)} className="mt-2 block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-teal-700 sm:w-64">
            <option value="PERDIDO">Procura-se</option><option value="ENCONTRADO">Encontrado</option>
          </select>
        </label>}
        {error && <div role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"><p>{error}</p>
          {phoneMissing && <Link to="/perfil" className="mt-1 inline-block underline">Cadastrar telefone no perfil</Link>}</div>}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" disabled={busy} onClick={() => navigate(back)} className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-bold text-teal-700 disabled:opacity-50">Cancelar</button>
          <button disabled={busy} className="rounded-xl bg-brand-teal px-6 py-3 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-50">{busy ? 'Salvando...' : editing ? 'Salvar alterações' : 'Publicar desaparecimento'}</button>
        </div>
      </section>
    </form>
  </>;
}
