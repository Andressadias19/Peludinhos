import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { api } from '../../api';
import { friendlyError } from '../../components/PerdidoForm';
import { ageLabels, castrationLabels, informationSourceLabels, situationLabels, vaccinationLabels } from '../../components/animalData';
import { AdminHeader, BackLink, Notice, StatusBadge } from '../../components/admin/AdminUI';

// Mesmos campos e limites do cadastro comum (NewAnimal); a API aplica as mesmas validações.
const initialData = {
  nome: '', especie: 'Cachorro', raca: '', cor: '', genero: '',
  idade_aproximada: 'DESCONHECIDA', caracteristicas: '', situacao: 'NAO_INFORMADA',
  status_castracao: 'DESCONHECIDO', status_vacinacao: 'DESCONHECIDA', fonte_informacao: 'NAO_INFORMADA',
};
const inputClass = 'mt-2 block w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 font-normal focus:outline-none focus:ring-2 focus:ring-teal-700';

export default function AdminAnimalForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const { resumo } = useOutletContext();
  const [data, setData] = useState(initialData);
  const [current, setCurrent] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [preview, setPreview] = useState('');
  const [loading, setLoading] = useState(editing);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!editing) return;
    let active = true; setLoading(true); setLoadError('');
    api(`/admin/animais/${id}`).then(({ animal }) => {
      if (!active) return;
      setCurrent(animal);
      setData(Object.fromEntries(Object.keys(initialData).map(key => [key, animal[key] ?? initialData[key]])));
    }).catch(err => { if (active && err.status !== 401) setLoadError(friendlyError(err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [editing, id, retry]);
  useEffect(() => {
    if (!photo) { setPreview(''); return; }
    const url = URL.createObjectURL(photo); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  const update = event => setData(value => ({ ...value, [event.target.name]: event.target.value }));
  function choosePhoto(event) {
    const file = event.target.files[0]; event.target.value = ''; setError('');
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) return setError('Escolha uma foto JPG, PNG ou WEBP de até 5 MB.');
    setPhoto(file); setRemovePhoto(false);
  }
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const body = new FormData();
      Object.entries(data).forEach(([key, value]) => body.append(key, value));
      if (photo) body.append('foto', photo);
      if (editing && removePhoto) body.append('remover_foto', 'true');
      const result = await api(editing ? `/admin/animais/${id}` : '/admin/animais', { method: editing ? 'PUT' : 'POST', body });
      resumo.reload();
      const notice = editing ? (result.alterado ? 'Cadastro atualizado. A validação voltou para Pendente.' : 'Nenhuma alteração foi feita no cadastro.') : 'Animal cadastrado. A validação está Pendente.';
      navigate(`/admin/animais/${result.animal.id_animal}`, { replace: editing, state: { notice } });
    } catch (err) { setError(friendlyError(err)); setBusy(false); }
  }

  const back = editing ? `/admin/animais/${id}` : '/admin/animais';
  if (loading) return <p role="status" className="flex items-center gap-2 text-teal-700 font-semibold"><i aria-hidden="true" className="ri-loader-4-line animate-spin text-xl" />Carregando cadastro...</p>;
  if (loadError) return <><BackLink to="/admin/animais">Voltar aos animais</BackLink><div role="alert" className="rounded-3xl border border-red-100 bg-red-50 p-6 text-red-700">
    <p className="font-bold">{loadError}</p><button type="button" onClick={() => setRetry(value => value + 1)} className="mt-4 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-bold">Tentar novamente</button>
  </div></>;
  const shownPhoto = preview || (!removePhoto && current?.foto) || '';
  return <>
    <BackLink to={back}>{editing ? 'Voltar aos detalhes' : 'Voltar aos animais'}</BackLink>
    <AdminHeader icon={editing ? 'ri-edit-2-line' : 'ri-add-circle-line'} title={editing ? `Editar ${current.nome || 'animal'} #${id}` : 'Cadastrar animal'}
      description={editing ? 'Os campos e validações são os mesmos do cadastro feito pelos usuários.' : 'Você ficará registrado como responsável por este cadastro. Ele começa com validação Pendente.'} />
    {editing && <Notice tone="warning">Se algum dado ou a foto mudar, o cadastro volta para Pendente e a validação anterior é descartada. Situação atual: {current.status_validacao}.</Notice>}

    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[18rem_1fr] lg:items-start">
      <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="font-bold text-gray-900">Foto de identificação</h2>
        <div className="mt-4 aspect-square overflow-hidden rounded-2xl bg-teal-50 flex items-center justify-center">
          {shownPhoto ? <img src={shownPhoto} alt={preview ? 'Prévia da nova foto' : 'Foto atual do animal'} className="h-full w-full object-cover" /> : <i aria-hidden="true" className="ri-image-add-line text-5xl text-teal-700/40" />}
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

      <section className="rounded-3xl border border-gray-100 bg-white p-5 sm:p-6 shadow-sm">
        <div className="grid gap-5 text-sm sm:grid-cols-2">
          <label className="font-semibold text-gray-700">Nome (opcional)<input name="nome" value={data.nome} onChange={update} maxLength={100} className={inputClass} /></label>
          <label className="font-semibold text-gray-700">Espécie<select name="especie" value={data.especie} onChange={update} className={inputClass}><option>Cachorro</option><option>Gato</option><option>Outro</option></select></label>
          <label className="font-semibold text-gray-700">Raça (opcional)<input name="raca" value={data.raca} onChange={update} maxLength={50} className={inputClass} /></label>
          <label className="font-semibold text-gray-700">Cor (opcional)<input name="cor" value={data.cor} onChange={update} maxLength={50} className={inputClass} /></label>
          <label className="font-semibold text-gray-700">Sexo<select name="genero" value={data.genero} onChange={update} className={inputClass}><option value="">Não informado</option><option>Macho</option><option>Fêmea</option></select></label>
          <Select label="Idade aproximada" name="idade_aproximada" value={data.idade_aproximada} onChange={update} options={ageLabels} />
          <Select label="Situação atual" name="situacao" value={data.situacao} onChange={update} options={situationLabels} />
          <Select label="Castração" name="status_castracao" value={data.status_castracao} onChange={update} options={castrationLabels} />
          <Select label="Vacinação" name="status_vacinacao" value={data.status_vacinacao} onChange={update} options={vaccinationLabels} />
          <Select label="Origem das informações" name="fonte_informacao" value={data.fonte_informacao} onChange={update} options={informationSourceLabels} />
          <label className="font-semibold text-gray-700 sm:col-span-2">Características para identificação (opcional)
            <textarea name="caracteristicas" value={data.caracteristicas} onChange={update} maxLength={500} rows={3} placeholder="Ex.: mancha branca no peito, ponta da orelha dobrada" className={inputClass} />
            <span className="mt-1 block text-right text-xs font-normal text-gray-400">{data.caracteristicas.length}/500</span>
          </label>
        </div>
        {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" disabled={busy} onClick={() => navigate(back)} className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-bold text-teal-700 disabled:opacity-50">Cancelar</button>
          <button disabled={busy} className="rounded-xl bg-brand-teal px-6 py-3 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-50">{busy ? 'Salvando...' : editing ? 'Salvar alterações' : 'Cadastrar animal'}</button>
        </div>
        {editing && <p className="mt-4 flex items-center gap-2 text-xs text-gray-500">Status atual: <StatusBadge status={current.status_validacao} /></p>}
      </section>
    </form>
  </>;
}

function Select({ label, options, ...props }) {
  return <label className="font-semibold text-gray-700">{label}<select {...props} className={inputClass}>
    {Object.entries(options).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
  </select></label>;
}
