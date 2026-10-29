import { useEffect, useState } from 'react';

// Campos, validação e envio compartilhados pelo cadastro e pela edição de animais perdidos.
// Mesmos padrões visuais do formulário de avistamentos (NewSighting.jsx), copiados para não alterá-lo.
export const inputClass = 'w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-700 text-sm';
const errorClass = 'border-red-400';
const limits = { nome_animal: 100, raca: 50, cor: 50, local_desaparecimento: 255, descricao: 1000 };
export const emptyPerdido = { nome_animal: '', especie: 'Cachorro', raca: '', cor: '', genero: '', local_desaparecimento: '', data_desaparecimento: '', descricao: '' };

// Data local (não UTC) no formato do input type="date", para "hoje" não virar amanhã à noite.
export function todayLocal() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// Espelha a validação do backend; o servidor continua sendo a autoridade final.
export function validatePerdido(data, today = todayLocal()) {
  const errors = {};
  if (!['Cachorro', 'Gato', 'Outro'].includes(data.especie)) errors.especie = 'Selecione a espécie.';
  if (!['', 'Macho', 'Fêmea'].includes(data.genero)) errors.genero = 'Selecione uma opção válida.';
  if (!data.local_desaparecimento.trim()) errors.local_desaparecimento = 'Informe onde o animal desapareceu.';
  for (const [key, max] of Object.entries(limits)) {
    if (data[key].trim().length > max) errors[key] = `Use no máximo ${max} caracteres.`;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data.data_desaparecimento);
  const date = match && new Date(Date.UTC(match[1], match[2] - 1, match[3]));
  if (!data.data_desaparecimento) errors.data_desaparecimento = 'Informe a data do desaparecimento.';
  else if (!match || match[1] < 1900 || date.getUTCMonth() !== match[2] - 1 || date.getUTCDate() !== Number(match[3])) errors.data_desaparecimento = 'Informe uma data válida.';
  else if (data.data_desaparecimento > today) errors.data_desaparecimento = 'A data não pode ser futura.';
  return errors;
}

// Converte a publicação da API para o formulário: null vira '' e a data já vem como YYYY-MM-DD.
export function perdidoToForm(item) {
  return Object.fromEntries(Object.keys(emptyPerdido).map(key => [key, item[key] ?? emptyPerdido[key]]));
}

// Envia todos os campos (o PUT substitui tudo). Foto nova e remover_foto nunca vão juntos.
export function perdidoFormData(data, { photo = null, removePhoto = false } = {}) {
  const body = new FormData();
  for (const key of Object.keys(emptyPerdido)) body.append(key, data[key].trim());
  if (photo) body.append('foto', photo);
  else if (removePhoto) body.append('remover_foto', 'true');
  return body;
}

export function photoFileError(file) {
  return !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024
    ? 'Escolha uma foto JPG, PNG ou WEBP de até 5 MB.' : '';
}

// Prévia local da foto escolhida; a URL blob é liberada ao trocar a foto ou sair da página.
export function usePhotoPreview(photo) {
  const [preview, setPreview] = useState('');
  useEffect(() => {
    if (!photo) { setPreview(''); return; }
    const url = URL.createObjectURL(photo); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  return preview;
}

export function friendlyError(err) {
  return err.status ? err.message : 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.';
}

function FieldError({ id, message }) {
  return message ? <span id={id} className="block text-xs text-red-600 mt-1">{message}</span> : null;
}

function Field({ label, name, error, as = 'input', children, ...props }) {
  const Tag = as;
  return <div>
    <label htmlFor={`perdido-${name}`} className="block text-sm font-semibold text-gray-700 mb-2">{label}</label>
    <Tag id={`perdido-${name}`} name={name} aria-invalid={error ? 'true' : undefined} aria-describedby={error ? `perdido-${name}-erro` : undefined}
      className={`${inputClass} ${error ? errorClass : ''}`} {...props}>{children}</Tag>
    <FieldError id={`perdido-${name}-erro`} message={error} />
  </div>;
}

export default function PerdidoFields({ data, errors, onChange, today }) {
  return <>
    <Field label="Nome do animal (opcional)" name="nome_animal" value={data.nome_animal} onChange={onChange} maxLength={100} error={errors.nome_animal} placeholder="Como ele atende?" />
    <Field label="Espécie *" name="especie" as="select" value={data.especie} onChange={onChange} error={errors.especie}>
      <option>Cachorro</option><option>Gato</option><option>Outro</option>
    </Field>
    <Field label="Raça (opcional)" name="raca" value={data.raca} onChange={onChange} maxLength={50} error={errors.raca} />
    <Field label="Cor (opcional)" name="cor" value={data.cor} onChange={onChange} maxLength={50} error={errors.cor} />
    <Field label="Sexo (opcional)" name="genero" as="select" value={data.genero} onChange={onChange} error={errors.genero}>
      <option value="">Não informado</option><option>Macho</option><option>Fêmea</option>
    </Field>
    <Field label="Local do desaparecimento *" name="local_desaparecimento" value={data.local_desaparecimento} onChange={onChange} maxLength={255} required error={errors.local_desaparecimento} placeholder="Bairro, rua ou ponto de referência" />
    <Field label="Data do desaparecimento *" name="data_desaparecimento" type="date" value={data.data_desaparecimento} onChange={onChange} min="1900-01-01" max={today} required error={errors.data_desaparecimento} />
    <div>
      <Field label="Descrição (opcional)" name="descricao" as="textarea" value={data.descricao} onChange={onChange} maxLength={1000} rows={5} error={errors.descricao} placeholder="Coleira, sinais, comportamento e como aconteceu" />
      <span className="block text-right text-xs text-gray-400">{data.descricao.length}/1000</span>
    </div>
  </>;
}
