import { useEffect, useState } from 'react';
import { Link, useLocation, useOutletContext, useParams } from 'react-router-dom';
import { api } from '../../api';
import { friendlyError } from '../../components/PerdidoForm';
import { ageLabels, castrationLabels, informationSourceLabels, labelFor, situationLabels, vaccinationLabels } from '../../components/animalData';
import DecisionDialog from '../../components/admin/DecisionDialog';
import { AdminHeader, BackLink, Notice, StatusBadge, formatCount, formatDate } from '../../components/admin/AdminUI';

export default function AdminValidacaoAnimal() {
  const { id } = useParams();
  const location = useLocation();
  const { resumo } = useOutletContext();
  const [state, setState] = useState({ error: '', notFound: false, animal: null });
  const [retry, setRetry] = useState(0);
  const [decision, setDecision] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [listUrl] = useState(() => (typeof location.state?.from === 'string' && location.state.from.startsWith('/admin/validacoes') ? location.state.from : '/admin/validacoes'));
  useEffect(() => {
    let active = true;
    setState(current => ({ ...current, error: '', notFound: false }));
    api(`/admin/validacoes/animais/${id}`).then(data => { if (active) setState({ error: '', notFound: false, animal: data.animal }); })
      .catch(err => {
        if (!active || err.status === 401) return;
        if (err.status === 404 || err.status === 400) setState({ error: '', notFound: true, animal: null });
        else setState({ error: friendlyError(err), notFound: false, animal: null });
      });
    return () => { active = false; };
  }, [id, retry]);

  async function decide(observacao) {
    setBusy(true); setActionError('');
    try {
      // A versão vista na tela vai junto: se o dono editou o cadastro depois, a API recusa a decisão.
      const result = await api(`/admin/validacoes/animais/${id}/${decision}`, { method: 'POST', body: JSON.stringify({ versao: state.animal.versao, observacao }) });
      setNotice(result.mensagem);
      resumo.reload();
    } catch (err) { setActionError(friendlyError(err)); }
    setBusy(false); setDecision(null); setRetry(value => value + 1);
  }

  if (state.notFound) return <><BackLink to={listUrl}>Voltar às validações</BackLink><div className="rounded-3xl border-2 border-dashed border-gray-200 bg-white p-10 text-center">
    <i aria-hidden="true" className="ri-search-eye-line text-5xl text-gray-300" /><p className="mt-3 font-bold text-gray-800">Animal não encontrado</p>
  </div></>;
  if (state.error) return <><BackLink to={listUrl}>Voltar às validações</BackLink><div role="alert" className="rounded-3xl border border-red-100 bg-red-50 p-6 text-red-700">
    <p className="font-bold">Não foi possível carregar o animal.</p><p className="text-sm mt-1">{state.error}</p>
    <button type="button" onClick={() => setRetry(value => value + 1)} className="mt-4 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-bold">Tentar novamente</button>
  </div></>;
  if (!state.animal) return <p role="status" className="flex items-center gap-2 text-teal-700 font-semibold"><i aria-hidden="true" className="ri-loader-4-line animate-spin text-xl" />Carregando animal...</p>;

  const animal = state.animal;
  const name = animal.nome || 'Animal sem nome';
  const pending = animal.status_validacao === 'Pendente';
  return <>
    <BackLink to={listUrl}>Voltar às validações</BackLink>
    <AdminHeader icon="ri-file-shield-2-line" title={`Validar ${name} #${animal.id_animal}`} description={`${animal.especie}${animal.raca ? ` · ${animal.raca}` : ''}${animal.cor ? ` · ${animal.cor}` : ''}`}>
      {pending && <>
        <button type="button" onClick={() => { setActionError(''); setDecision('aprovar'); }} className="flex items-center gap-2 rounded-xl bg-brand-teal px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-800"><i aria-hidden="true" className="ri-checkbox-circle-line text-lg" />Validar</button>
        <button type="button" onClick={() => { setActionError(''); setDecision('recusar'); }} className="flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50"><i aria-hidden="true" className="ri-close-circle-line text-lg" />Recusar</button>
      </>}
    </AdminHeader>
    {notice && <Notice>{notice}</Notice>}
    {actionError && <Notice tone="error">{actionError}</Notice>}

    <div className="grid gap-6 lg:grid-cols-[20rem_1fr] lg:items-start">
      <div className="grid gap-6">
        <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
          <img src={animal.foto || '/assets/icons/peludinhos.svg'} alt={animal.foto ? `Foto de ${name}` : ''} className={`aspect-square w-full bg-teal-50 ${animal.foto ? 'object-cover' : 'object-contain p-16 opacity-40'}`} />
          <div className="p-5"><StatusBadge status={animal.status_validacao} />
            <dl className="mt-4 grid gap-3 text-sm">
              <Item label="Cadastrado por" value={<>{animal.cadastrador_nome}<span className="block text-xs text-gray-500 break-all">{animal.cadastrador_email}</span></>} />
              <Item label="Cadastro" value={formatDate(animal.data_cadastro, true)} />
              <Item label="Última alteração dos dados" value={formatDate(animal.data_atualizacao, true)} />
            </dl>
          </div>
        </section>
        <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="font-bold text-gray-900">Última decisão</h2>
          {animal.data_validacao ? <dl className="mt-3 grid gap-3 text-sm">
            <Item label="Decisão" value={<StatusBadge status={animal.status_validacao} />} />
            <Item label="Administrador" value={animal.validador_nome || 'Conta removida'} />
            <Item label="Data" value={formatDate(animal.data_validacao, true)} />
            <Item label={animal.status_validacao === 'Recusado' ? 'Justificativa' : 'Observação'} value={animal.observacao_validacao || 'Sem observação.'} />
          </dl> : <p className="mt-2 text-sm text-gray-500">{pending ? 'Ainda não há decisão para a versão atual. Uma edição feita pelo cadastrador descarta a decisão anterior e volta o cadastro para Pendente.' : 'Sem registro de decisão.'}</p>}
        </section>
      </div>

      <section className="rounded-3xl border border-gray-100 bg-white p-5 sm:p-6 shadow-sm">
        <h2 className="font-bold text-gray-900">Dados do cadastro</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-3">
          <Item label="Espécie" value={animal.especie} />
          <Item label="Raça" value={animal.raca || 'Não informada'} />
          <Item label="Cor" value={animal.cor || 'Não informada'} />
          <Item label="Sexo" value={animal.genero || 'Não informado'} />
          <Item label="Idade aproximada" value={labelFor(ageLabels, animal.idade_aproximada)} />
          <Item label="Situação atual" value={labelFor(situationLabels, animal.situacao)} />
          <Item label="Castração" value={labelFor(castrationLabels, animal.status_castracao)} />
          <Item label="Vacinação" value={labelFor(vaccinationLabels, animal.status_vacinacao)} />
          <Item label="Origem declarada" value={labelFor(informationSourceLabels, animal.fonte_informacao)} />
        </dl>
        <h3 className="mt-6 text-sm font-semibold text-gray-500">Características para identificação</h3>
        <p className="mt-1 text-sm text-gray-800 whitespace-pre-wrap break-words">{animal.caracteristicas || 'Não informadas.'}</p>
        <p className="mt-6 text-sm text-gray-500">{formatCount(animal.total_avistamentos)} avistamento(s) vinculado(s). <Link to={`/admin/animais/${animal.id_animal}`} className="font-bold text-teal-700 hover:underline">Abrir no gerenciamento de animais</Link></p>
      </section>
    </div>

    <DecisionDialog decision={decision} busy={busy} onConfirm={decide} onCancel={() => setDecision(null)}
      title={decision === 'recusar' ? `Recusar o cadastro de ${name}?` : `Validar o cadastro de ${name}?`} />
  </>;
}

function Item({ label, value }) {
  return <div><dt className="text-gray-500">{label}</dt><dd className="font-medium text-gray-900 break-words">{value}</dd></div>;
}
