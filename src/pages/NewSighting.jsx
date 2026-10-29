import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Navigation from '../components/Navigation';
import PageHeader from '../components/PageHeader';
import LocationPicker from '../components/LocationPicker';
import { api } from '../api';
import AnimalSelector from '../components/AnimalSelector';

const inputClass = 'w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-700 text-sm';
function Input({ label, ...props }) { return <label className="block text-sm font-semibold text-gray-700"><span className="block mb-2">{label}</span><input className={inputClass} {...props} /></label>; }

export default function NewSighting() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [animalMode, setAnimalMode] = useState(params.get('animal') ? 'existente' : 'nao-identificado');
  const [animal, setAnimal] = useState(null);
  const [step, setStep] = useState(0);
  const [data, setData] = useState({ nome: '', especie: 'Cachorro', raca: '', cor: '', genero: '', estado_saude: '', observacao: '' });
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [location, setLocation] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    const id = params.get('animal');
    if (!id) return;
    let active = true;
    api(`/animais/${encodeURIComponent(id)}/avistamentos`).then(result => {
      if (active) { setAnimal(result.animal); setAnimalMode('existente'); }
    }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [params]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!photo) { setPreview(''); return; }
    const url = URL.createObjectURL(photo); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  const chooseLocation = useCallback(point => {
    setLocation({ latitude: Number(point.latitude.toFixed(8)), longitude: Number(point.longitude.toFixed(8)) });
    setError('');
  }, []);
  const update = event => setData(current => ({ ...current, [event.target.name]: event.target.value }));
  function choosePhoto(event) {
    const file = event.target.files[0]; setError('');
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError('Escolha uma foto JPG, PNG ou WEBP de até 5 MB.'); event.target.value = ''; return;
    }
    setPhoto(file); event.target.value = '';
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
  async function submit(event) {
    event.preventDefault(); setError('');
    if (busy) return;
    if (step === 1 && animalMode === 'existente' && !animal) return setError('Selecione o animal ou escolha publicar sem identificação.');
    if (step < 3) { setStep(step + 1); return; }
    if (!location) return setError('Marque no mapa onde você viu o animal.');
    setBusy(true);
    try {
      const body = new FormData();
      for (const key of ['estado_saude', 'observacao']) body.append(key, data[key]);
      if (animalMode === 'existente') {
        if (!animal) throw new Error('Selecione um animal cadastrado.');
        body.append('id_animal', animal.id_animal);
      } else {
        for (const key of ['nome', 'especie', 'raca', 'cor', 'genero']) body.append(key, data[key]);
      }
      body.append('latitude', String(location.latitude)); body.append('longitude', String(location.longitude));
      if (photo) body.append('foto', photo);
      const result = await api('/avistamentos', { method: 'POST', body });
      navigate(`/mapa?avistamento=${result.avistamento.id_avistamento}`, { state: { created: true } });
    } catch (err) { setError(err.message); setBusy(false); }
  }
  return <div className="min-h-screen bg-gray-100"><div className="w-full sm:max-w-sm mx-auto min-h-screen bg-surface sm:shadow-2xl">
    <PageHeader title="Novo avistamento" />
    <main className="px-5 pt-6 pb-28">
      <ol aria-label="Etapas do cadastro" className="flex justify-between gap-2 mb-6">
        {['Foto', 'Informações', 'Saúde', 'Localização'].map((name, index) => <li key={name} aria-current={step === index ? 'step' : undefined} className={`flex-1 text-center text-xs ${step >= index ? 'text-teal-700 font-bold' : 'text-gray-400'}`}><span className={`flex mx-auto items-center justify-center rounded-full w-9 h-9 mb-2 ${step >= index ? 'bg-brand-teal text-white' : 'bg-gray-200'}`}>{index + 1}</span>{name}</li>)}
      </ol>
      <form onSubmit={submit} className="flex flex-col gap-5">
        {step === 0 && <>
          <h2 className="text-xl font-bold">Foto do animal</h2>
          <p className="text-sm text-gray-500">Uma foto ajuda a comunidade a reconhecer o animal. Você também pode continuar sem foto.</p>
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-teal-700 rounded-2xl p-4 bg-white cursor-pointer">
            {preview ? <img src={preview} alt="Prévia da foto do animal" className="w-full h-40 object-cover rounded-xl" /> : <i className="ri-camera-fill text-4xl text-teal-700" />}
            <span className="font-bold text-sm text-teal-700">{photo ? 'Trocar foto' : 'Adicionar foto do animal (opcional)'}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Foto do animal" onChange={choosePhoto} className="block max-w-full text-xs" />
            <span className="text-xs text-gray-500">JPG, PNG ou WEBP, até 5 MB</span>
          </label>
          {photo && <button type="button" className="text-sm text-red-600" onClick={() => setPhoto(null)}>Remover foto</button>}
        </>}
        {step === 1 && <>
          <h2 className="text-xl font-bold">Informações do animal</h2>
          <fieldset className="grid gap-3 text-sm"><legend className="font-semibold mb-2">Você já reconhece este animal?</legend>
            <label><input type="radio" name="animal-mode" checked={animalMode === 'existente'} onChange={() => { setAnimalMode('existente'); setError(''); }} /> Selecionar animal cadastrado</label>
            <label><input type="radio" name="animal-mode" checked={animalMode === 'nao-identificado'} onChange={() => { setAnimalMode('nao-identificado'); setError(''); }} /> Não reconheço: publicar sem cadastro de animal</label>
          </fieldset>
          {animalMode === 'existente' ? <AnimalSelector value={animal} onChange={setAnimal} /> : <>
          <p className="text-sm text-gray-500">Descreva o que você viu. Será criado apenas um avistamento, sem cadastro de animal ou vínculo de tutela.</p>
          <Input label="Nome (opcional)" name="nome" value={data.nome} onChange={update} maxLength={100} placeholder="Como podemos identificar?" />
          <div><label htmlFor="sighting-species" className="text-sm font-semibold">Espécie</label><select id="sighting-species" name="especie" className={`${inputClass} mt-2`} value={data.especie} onChange={update}><option>Cachorro</option><option>Gato</option><option>Outro</option></select></div>
          <Input label="Raça (opcional)" name="raca" value={data.raca} onChange={update} maxLength={50} />
          <Input label="Cor (opcional)" name="cor" value={data.cor} onChange={update} maxLength={50} />
          <div><label htmlFor="sighting-gender" className="text-sm font-semibold">Sexo</label><select id="sighting-gender" name="genero" className={`${inputClass} mt-2`} value={data.genero} onChange={update}><option value="">Não sei informar</option><option>Macho</option><option>Fêmea</option></select></div>
          </>}
          <div><label htmlFor="sighting-description" className="text-sm font-semibold">Descrição do avistamento</label><textarea id="sighting-description" name="observacao" value={data.observacao} onChange={update} maxLength={300} rows={4} className={`${inputClass} mt-2`} placeholder="Características, comportamento e ponto de referência" /><span className="block text-right text-xs text-gray-400">{data.observacao.length}/300</span></div>
        </>}
        {step === 2 && <>
          <h2 className="text-xl font-bold">Saúde do animal</h2>
          <p className="text-sm text-gray-500">Descreva a saúde observada neste avistamento. Isso preserva o histórico e não altera o cadastro do animal.</p>
          <label className="text-sm font-semibold">Estado de saúde (opcional)<textarea name="estado_saude" value={data.estado_saude} onChange={update} maxLength={1000} rows={5} className={`${inputClass} mt-2`} placeholder="Ex.: aparenta estar saudável, está mancando, usa identificação de castração..." /></label>
        </>}
        {step === 3 && <>
          <h2 className="text-xl font-bold">Onde você viu o animal?</h2>
          <p className="text-sm text-gray-500">Toque no mapa para marcar o local. Você pode arrastar o ponto para ajustar.</p>
          <button type="button" disabled={locating || busy} onClick={locate} className="border border-teal-700 text-teal-700 font-bold rounded-xl py-3 disabled:opacity-50"><i className="ri-focus-3-line mr-2" />{locating ? 'Buscando localização...' : 'Usar minha localização'}</button>
          <LocationPicker value={location} onChange={chooseLocation} />
          <p role="status" className="text-sm text-teal-700">{location ? `Local selecionado: ${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}` : 'Nenhum local selecionado.'}</p>
          <details className="text-sm text-gray-600"><summary className="cursor-pointer">Informar coordenadas manualmente</summary><ManualCoordinates onChoose={chooseLocation} /></details>
          <p className="text-xs text-gray-500">Ao publicar, este ponto e as informações do avistamento ficam visíveis para os usuários do Peludinhos.</p>
        </>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy || locating} className="w-full bg-brand-orange hover:bg-orange-600 text-white font-bold py-4 rounded-xl disabled:opacity-50">{busy ? 'Publicando...' : step === 3 ? 'Publicar avistamento' : 'Próximo'}</button>
        {step > 0 && <button type="button" disabled={busy} className="text-teal-700 font-bold py-2" onClick={() => { setStep(step - 1); setError(''); }}>Voltar à etapa anterior</button>}
      </form>
    </main>
  </div><Navigation /></div>;
}

function ManualCoordinates({ onChoose }) {
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const valid = latitude.trim() && longitude.trim() && Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude)) && Math.abs(Number(latitude)) <= 90 && Math.abs(Number(longitude)) <= 180;
  return <div className="grid gap-3 mt-3">
    <Input label="Latitude" type="number" step="any" min="-90" max="90" value={latitude} onChange={event => setLatitude(event.target.value)} />
    <Input label="Longitude" type="number" step="any" min="-180" max="180" value={longitude} onChange={event => setLongitude(event.target.value)} />
    <button type="button" disabled={!valid} onClick={() => onChoose({ latitude: Number(latitude), longitude: Number(longitude) })} className="text-teal-700 font-bold disabled:opacity-50">Usar coordenadas</button>
  </div>;
}
