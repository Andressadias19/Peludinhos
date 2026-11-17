import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { api } from '../../api';
import AnimalSelector from '../../components/AnimalSelector';
import LocationPicker from '../../components/LocationPicker';
import { friendlyError } from '../../components/PerdidoForm';
import { AdminHeader, BackLink, Notice, StatusBadge } from '../../components/admin/AdminUI';

// Mesmos campos e limites do registro comum (NewSighting); a API aplica as mesmas validações.
const initialData = { nome: '', especie: 'Cachorro', raca: '', cor: '', genero: '', estado_saude: '', observacao: '' };
const inputClass = 'mt-2 block w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 font-normal focus:outline-none focus:ring-2 focus:ring-teal-700';
const card = 'rounded-3xl border border-gray-100 bg-white p-5 sm:p-6 shadow-sm';

export default function AdminAvistamentoForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const { resumo } = useOutletContext();
  const [current, setCurrent] = useState(null);
  const [animalMode, setAnimalMode] = useState('nao-identificado');
  const [animal, setAnimal] = useState(null);
  const [data, setData] = useState(initialData);
  const [location, setLocation] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [preview, setPreview] = useState('');
  const [loading, setLoading] = useState(editing);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [retry, setRetry] = useState(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!editing) return;
    let active = true; setLoading(true); setLoadError('');
    api(`/admin/avistamentos/${id}`).then(({ avistamento }) => {
      if (!active) return;
      setCurrent(avistamento);
      setData(Object.fromEntries(Object.keys(initialData).map(key => [key, avistamento[key] ?? initialData[key]])));
      setLocation({ latitude: avistamento.latitude, longitude: avistamento.longitude });
    }).catch(err => { if (active && err.status !== 401) setLoadError(friendlyError(err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [editing, id, retry]);
  useEffect(() => {
    if (!photo) { setPreview(''); return; }
    const url = URL.createObjectURL(photo); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  // Estável: o LocationPicker recria o mapa quando onChange muda.
  const chooseLocation = useCallback(point => {
    setLocation({ latitude: Number(point.latitude.toFixed(8)), longitude: Number(point.longitude.toFixed(8)) });
  }, []);
  const update = event => setData(value => ({ ...value, [event.target.name]: event.target.value }));
  function choosePhoto(event) {
    const file = event.target.files[0]; event.target.value = ''; setError('');
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) return setError('Escolha uma foto JPG, PNG ou WEBP de até 5 MB.');
    setPhoto(file); setRemovePhoto(false);
  }
  function locate() {
    if (!navigator.geolocation) return setError('Seu navegador não oferece localização. Marque o ponto no mapa.');
    setLocating(true); setError('');
    navigator.geolocation.getCurrentPosition(position => {
      if (!alive.current) return;
      chooseLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude }); setLocating(false);
    }, () => {
      if (!alive.current) return;
      setLocating(false); setError('Não foi possível obter sua localização. Toque no mapa para marcar o local.');
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
  }

  // Avistamento vinculado: as características vêm do cadastro do animal e não são editadas aqui.
  const linked = editing ? Boolean(current?.id_animal) : animalMode === 'existente';
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (!editing && animalMode === 'existente' && !animal) return setError('Selecione o animal ou registre sem identificação.');
    if (!location) return setError('Marque no mapa onde o animal foi visto.');
    setBusy(true); setError('');
    try {
      const body = new FormData();
      for (const key of ['estado_saude', 'observacao']) body.append(key, data[key]);
      if (!editing && linked) body.append('id_animal', animal.id_animal);
      if (!linked) for (const key of ['nome', 'especie', 'raca', 'cor', 'genero']) body.append(key, data[key]);
      body.append('latitude', String(location.latitude)); body.append('longitude', String(location.longitude));
      if (photo) body.append('foto', photo);
      if (editing && removePhoto) body.append('remover_foto', 'true');
      const result = await api(editing ? `/admin/avistamentos/${id}` : '/admin/avistamentos', { method: editing ? 'PUT' : 'POST', body });
      resumo.reload();
      navigate(`/admin/avistamentos/${result.avistamento.id_avistamento}`, { replace: editing, state: { notice: editing ? 'Avistamento atualizado.' : 'Avistamento registrado. Você consta como autor.' } });
    } catch (err) { setError(friendlyError(err)); setBusy(false); }
  }

  const back = editing ? `/admin/avistamentos/${id}` : '/admin/avistamentos';
  if (loading) return <p role="status" className="flex items-center gap-2 text-teal-700 font-semibold"><i aria-hidden="true" className="ri-loader-4-line animate-spin text-xl" />Carregando avistamento...</p>;
  if (loadError) return <><BackLink to="/admin/avistamentos">Voltar aos avistamentos</BackLink><div role="alert" className="rounded-3xl border border-red-100 bg-red-50 p-6 text-red-700">
    <p className="font-bold">{loadError}</p><button type="button" onClick={() => setRetry(value => value + 1)} className="mt-4 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-bold">Tentar novamente</button>
  </div></>;
  const shownPhoto = preview || (!removePhoto && current?.foto) || '';
  return <>
    <BackLink to={back}>{editing ? 'Voltar aos detalhes' : 'Voltar aos avistamentos'}</BackLink>
    <AdminHeader icon={editing ? 'ri-edit-2-line' : 'ri-add-circle-line'} title={editing ? `Editar avistamento #${id}` : 'Registrar avistamento'}
      description={editing ? 'Os campos e validações são os mesmos do registro feito pelos usuários. O autor original é mantido.' : 'Você ficará registrado como autor deste relato.'} />
    {editing && current.associacao_pendente && <Notice tone="warning">Este avistamento tem uma solicitação de associação pendente. Ela é mantida como está.</Notice>}

    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[18rem_1fr] lg:items-start">
      <section className={card}>
        <h2 className="font-bold text-gray-900">Foto do avistamento</h2>
        <div className="mt-4 aspect-square overflow-hidden rounded-2xl bg-teal-50 flex items-center justify-center">
          {shownPhoto ? <img src={shownPhoto} alt={preview ? 'Prévia da nova foto' : 'Foto atual do avistamento'} className="h-full w-full object-cover" /> : <i aria-hidden="true" className="ri-camera-line text-5xl text-teal-700/40" />}
        </div>
        <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-teal-700 py-2.5 text-sm font-bold text-teal-700 hover:bg-teal-50">
          <i aria-hidden="true" className="ri-upload-2-line" />{shownPhoto ? 'Trocar foto' : 'Escolher foto'}
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} className="sr-only" />
        </label>
        {preview && <button type="button" onClick={() => setPhoto(null)} className="mt-2 w-full text-sm font-semibold text-red-600">Descartar nova foto</button>}
        {!preview && current?.foto && !removePhoto && <button type="button" onClick={() => setRemovePhoto(true)} className="mt-2 w-full text-sm font-semibold text-red-600">Remover foto atual</button>}
        {removePhoto && <button type="button" onClick={() => setRemovePhoto(false)} className="mt-2 w-full text-sm font-semibold text-teal-700">Manter foto atual</button>}
        <p className="mt-3 text-center text-xs text-gray-500">Opcional. JPG, PNG ou WEBP, até 5 MB.</p>
      </section>

      <div className="grid gap-6 min-w-0">
        <section className={card}>
          <h2 className="font-bold text-gray-900">Animal</h2>
          {editing ? (linked
            ? <div className="mt-3 rounded-2xl bg-gray-50 p-4 text-sm">
              <p className="flex flex-wrap items-center gap-2 font-bold"><Link to={`/admin/animais/${current.id_animal}`} className="text-teal-700 hover:underline">{current.animal_nome || 'Sem nome'} #{current.id_animal}</Link><StatusBadge status={current.animal_status_validacao} /></p>
              <p className="mt-1 text-gray-600">{[current.especie, current.raca, current.cor, current.genero].filter(Boolean).join(' · ')}</p>
              <p className="mt-2 text-xs text-gray-500">As características foram copiadas do cadastro na data do relato. O vínculo e essas características não são alterados pela edição.</p>
            </div>
            : <p className="mt-2 text-sm text-gray-500">Animal não identificado. O vínculo com um cadastro só muda pela análise de uma solicitação de associação.</p>)
            : <fieldset className="mt-3 grid gap-2 text-sm"><legend className="sr-only">Identificação do animal</legend>
              <label className="flex items-center gap-2"><input type="radio" name="animal-mode" checked={animalMode === 'nao-identificado'} onChange={() => { setAnimalMode('nao-identificado'); setError(''); }} />Sem identificação: descrever o animal visto</label>
              <label className="flex items-center gap-2"><input type="radio" name="animal-mode" checked={animalMode === 'existente'} onChange={() => { setAnimalMode('existente'); setError(''); }} />Vincular a um animal já cadastrado</label>
            </fieldset>}
          {!editing && linked && <div className="mt-4"><AnimalSelector value={animal} onChange={setAnimal} /></div>}
          {!linked && <div className="mt-5 grid gap-5 text-sm sm:grid-cols-2">
            <label className="font-semibold text-gray-700">Nome (opcional)<input name="nome" value={data.nome} onChange={update} maxLength={100} className={inputClass} /></label>
            <label className="font-semibold text-gray-700">Espécie<select name="especie" value={data.especie} onChange={update} className={inputClass}><option>Cachorro</option><option>Gato</option><option>Outro</option></select></label>
            <label className="font-semibold text-gray-700">Raça (opcional)<input name="raca" value={data.raca} onChange={update} maxLength={50} className={inputClass} /></label>
            <label className="font-semibold text-gray-700">Cor (opcional)<input name="cor" value={data.cor} onChange={update} maxLength={50} className={inputClass} /></label>
            <label className="font-semibold text-gray-700">Sexo<select name="genero" value={data.genero} onChange={update} className={inputClass}><option value="">Não informado</option><option>Macho</option><option>Fêmea</option></select></label>
          </div>}
        </section>

        <section className={card}>
          <h2 className="font-bold text-gray-900">Relato</h2>
          <div className="mt-4 grid gap-5 text-sm">
            <label className="font-semibold text-gray-700">Descrição do avistamento (opcional)
              <textarea name="observacao" value={data.observacao} onChange={update} maxLength={300} rows={3} placeholder="Características, comportamento e ponto de referência" className={inputClass} />
              <span className="mt-1 block text-right text-xs font-normal text-gray-400">{data.observacao.length}/300</span>
            </label>
            <label className="font-semibold text-gray-700">Estado de saúde observado (opcional)
              <textarea name="estado_saude" value={data.estado_saude} onChange={update} maxLength={1000} rows={3} placeholder="Ex.: aparenta estar saudável, está mancando..." className={inputClass} />
            </label>
          </div>
        </section>

        <section className={card}>
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold text-gray-900">Localização</h2>
            <button type="button" disabled={locating || busy} onClick={locate} className="flex items-center gap-1 rounded-xl border border-teal-700 px-3 py-2 text-sm font-bold text-teal-700 disabled:opacity-50"><i aria-hidden="true" className="ri-focus-3-line" />{locating ? 'Buscando...' : 'Usar minha localização'}</button></div>
          <p className="mt-2 text-sm text-gray-500">Toque no mapa para marcar o local. Você pode arrastar o ponto para ajustar.</p>
          <div className="mt-4"><LocationPicker value={location} onChange={chooseLocation} /></div>
          <p role="status" className="mt-3 text-sm text-teal-700">{location ? `Local selecionado: ${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}` : 'Nenhum local selecionado.'}</p>
          <details className="mt-3 text-sm text-gray-600"><summary className="cursor-pointer font-semibold">Informar coordenadas manualmente</summary><ManualCoordinates onChoose={chooseLocation} /></details>
        </section>

        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" disabled={busy} onClick={() => navigate(back)} className="rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-bold text-teal-700 disabled:opacity-50">Cancelar</button>
          <button disabled={busy || locating} className="rounded-xl bg-brand-teal px-6 py-3 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-50">{busy ? 'Salvando...' : editing ? 'Salvar alterações' : 'Registrar avistamento'}</button>
        </div>
      </div>
    </form>
  </>;
}

function ManualCoordinates({ onChoose }) {
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const valid = latitude.trim() && longitude.trim() && Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude)) && Math.abs(Number(latitude)) <= 90 && Math.abs(Number(longitude)) <= 180;
  return <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
    <label className="font-semibold text-gray-700">Latitude<input type="number" step="any" min="-90" max="90" value={latitude} onChange={event => setLatitude(event.target.value)} className={inputClass} /></label>
    <label className="font-semibold text-gray-700">Longitude<input type="number" step="any" min="-180" max="180" value={longitude} onChange={event => setLongitude(event.target.value)} className={inputClass} /></label>
    <button type="button" disabled={!valid} onClick={() => onChoose({ latitude: Number(latitude), longitude: Number(longitude) })} className="rounded-xl bg-teal-50 px-4 py-3 font-bold text-teal-700 disabled:opacity-50">Usar coordenadas</button>
  </div>;
}
