import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Navigation from '../components/Navigation';
import PageHeader from '../components/PageHeader';
import { api } from '../api';
import { situationLabels } from '../components/animalData';

const inputClass = 'w-full px-4 py-3 rounded-xl border border-gray-200 bg-white mt-2';
const initialData = {
  nome: '', especie: 'Cachorro', raca: '', cor: '', genero: '',
  idade_aproximada: 'DESCONHECIDA', caracteristicas: '', situacao: 'NAO_INFORMADA',
  status_castracao: 'DESCONHECIDO', status_vacinacao: 'DESCONHECIDA', fonte_informacao: 'NAO_INFORMADA',
};
export default function NewAnimal() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const [data, setData] = useState(initialData);
  const [photo, setPhoto] = useState(null);
  const [currentPhoto, setCurrentPhoto] = useState('');
  const [removePhoto, setRemovePhoto] = useState(false);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(editing);
  useEffect(() => {
    if (!editing) return;
    let active = true;
    api(`/animais/${id}/editar`).then(({ animal }) => {
      if (!active) return;
      setData({
        ...initialData, nome: animal.nome || '', especie: animal.especie, raca: animal.raca || '', cor: animal.cor || '', genero: animal.genero || '',
        idade_aproximada: animal.idade_aproximada || 'DESCONHECIDA', caracteristicas: animal.caracteristicas || '',
        situacao: animal.situacao || 'NAO_INFORMADA', status_castracao: animal.status_castracao || 'DESCONHECIDO',
        status_vacinacao: animal.status_vacinacao || 'DESCONHECIDA', fonte_informacao: animal.fonte_informacao || 'NAO_INFORMADA',
      });
      setCurrentPhoto(animal.foto || '');
    }).catch(err => { if (active) setError(err.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [editing, id]);
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
    setPhoto(file); setRemovePhoto(false);
  }
  async function submit(e) {
    e.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try {
      const body = new FormData();
      Object.entries(data).forEach(([key, value]) => body.append(key, value));
      if (photo) body.append('foto', photo);
      if (editing && removePhoto) body.append('remover_foto', 'true');
      const result = await api(editing ? `/animais/${id}` : '/animais', { method: editing ? 'PUT' : 'POST', body });
      navigate(`/animais/${result.animal.id_animal}/avistamentos`, { state: editing ? { animalUpdated: true } : { animalCreated: true } });
    } catch (err) { setError(err.message); setBusy(false); }
  }
  return <div className="min-h-screen bg-gray-100"><div className="w-full sm:max-w-sm mx-auto min-h-screen bg-surface sm:shadow-2xl">
    <PageHeader title={editing ? 'Editar cadastro' : 'Cadastrar animal'} back={editing ? `/animais/${id}/avistamentos` : '/animais'} />
    <main className="p-5 pb-28">
      {loading && <p role="status">Carregando cadastro...</p>}
      {!loading && <>
      <p className="text-sm text-gray-600 mb-5">{editing ? 'Atualize as informações e a foto de identificação deste cadastro.' : 'Confira se este animal já está cadastrado. O cadastro recebe uma identificação automática e fica pendente de validação. Ele não comprova tutela.'}</p>
      {!editing && <Link to="/animais" className="block text-teal-700 underline mb-5">Consultar animais existentes</Link>}
      {editing && <p className="text-sm text-amber-800 mb-5">Ao salvar, o cadastro ficará Pendente para nova validação.</p>}
      <form onSubmit={submit} className="grid gap-5 text-sm">
        <label className="font-semibold">Foto de identificação (opcional)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} className="block mt-2 w-full" /></label>
        {!preview && currentPhoto && !removePhoto && <><img src={currentPhoto} alt="Foto atual de identificação do animal" className="w-full h-48 object-cover rounded-xl" /><button type="button" onClick={() => setRemovePhoto(true)} className="text-red-600">Remover foto atual</button></>}
        {preview && <><img src={preview} alt="Prévia da identificação do animal" className="w-full h-48 object-cover rounded-xl" /><button type="button" onClick={() => setPhoto(null)} className="text-red-600">Remover foto</button></>}
        {['nome', 'raca', 'cor'].map(key => <label key={key} className="font-semibold">{{ nome: 'Nome', raca: 'Raça', cor: 'Cor' }[key]} (opcional)<input name={key} value={data[key]} onChange={update} maxLength={key === 'nome' ? 100 : 50} className={inputClass} /></label>)}
        <label className="font-semibold">Espécie<select name="especie" value={data.especie} onChange={update} className={inputClass}><option>Cachorro</option><option>Gato</option><option>Outro</option></select></label>
        <label className="font-semibold">Sexo<select name="genero" value={data.genero} onChange={update} className={inputClass}><option value="">Não sei informar</option><option>Macho</option><option>Fêmea</option></select></label>
        <label className="font-semibold">Idade aproximada<select name="idade_aproximada" value={data.idade_aproximada} onChange={update} className={inputClass}><option value="DESCONHECIDA">Não sei informar</option><option value="FILHOTE">Filhote</option><option value="ADULTO">Adulto</option><option value="IDOSO">Idoso</option></select></label>
        <label className="font-semibold">Características para identificação (opcional)<textarea name="caracteristicas" value={data.caracteristicas} onChange={update} maxLength={500} rows={3} placeholder="Ex.: mancha branca no peito, ponta da orelha dobrada" className={inputClass} /></label>
        <label className="font-semibold">Situação atual<select name="situacao" value={data.situacao} onChange={update} className={inputClass}>{Object.entries(situationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="font-semibold">Castração<select name="status_castracao" value={data.status_castracao} onChange={update} className={inputClass}><option value="DESCONHECIDO">Não sei informar</option><option value="CASTRADO">Castrado</option><option value="NAO_CASTRADO">Não castrado</option></select></label>
        <label className="font-semibold">Vacinação<select name="status_vacinacao" value={data.status_vacinacao} onChange={update} className={inputClass}><option value="DESCONHECIDA">Não sei informar</option><option value="INCOMPLETA">Incompleta</option><option value="ATUALIZADA">Atualizada</option></select></label>
        <label className="font-semibold">Origem declarada das informações<select name="fonte_informacao" value={data.fonte_informacao} onChange={update} className={inputClass}><option value="NAO_INFORMADA">Não informada</option><option value="OBSERVACAO_DIRETA">Observação direta</option><option value="INFORMADO_POR_TERCEIRO">Informada por outra pessoa</option><option value="REGISTRO_VETERINARIO">Registro veterinário</option></select><span className="block font-normal text-xs text-gray-500 mt-1">A origem é declarada por quem preenche o cadastro e ainda não foi confirmada pela prefeitura.</span></label>
        {error && <p role="alert" className="text-red-600">{error}</p>}
        <button disabled={busy} className="bg-brand-teal text-white rounded-xl py-4 font-bold disabled:opacity-50">{busy ? (editing ? 'Salvando...' : 'Cadastrando...') : (editing ? 'Salvar alterações' : 'Cadastrar animal')}</button>
      </form>
      </>}
    </main>
  </div><Navigation /></div>;
}
