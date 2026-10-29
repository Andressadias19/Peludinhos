import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import Navigation from '../components/Navigation';
import PageHeader from '../components/PageHeader';
import FotoPerdido from '../components/FotoPerdido';
import GerenciarPerdido from '../components/GerenciarPerdido';
import { perdidoDate, perdidoName, perdidoSince } from '../components/PerdidoCard';
import { friendlyError } from '../components/PerdidoForm';
import { api } from '../api';

// Telefone brasileiro: DDD + celular (9 + 8 dígitos) ou fixo (8 dígitos), com ou sem o 55 na frente.
// Devolve só os dígitos sem o 55, ou null se o número não puder ser interpretado com segurança.
export function localPhone(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  const local = digits.length >= 12 && digits.startsWith('55') ? digits.slice(2) : digits;
  return /^[1-9][1-9](9\d{8}|[2-5]\d{7})$/.test(local) ? local : null;
}

export function formatPhone(local) {
  return `(${local.slice(0, 2)}) ${local.slice(2, -4)}-${local.slice(-4)}`;
}

export function whatsappLink(item) {
  const local = localPhone(item.tutor_telefone);
  if (!local) return null;
  const greeting = item.tutor_nome ? `Olá, ${item.tutor_nome}!` : 'Olá!';
  const message = item.status_perda === 'ENCONTRADO'
    ? `${greeting} Vi no Peludinhos a publicação sobre ${perdidoName(item)}.`
    : `${greeting} Vi no Peludinhos a publicação sobre o desaparecimento de ${perdidoName(item)} e gostaria de ajudar.`;
  return `https://wa.me/55${local}?text=${encodeURIComponent(message)}`;
}

function Info({ label, value, fallback }) {
  return <div><dt className="text-gray-500">{label}</dt><dd className="break-words">{value || fallback}</dd></div>;
}

export default function DetalhesPerdido() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [notice, setNotice] = useState('');
  const [actionAlert, setActionAlert] = useState('');
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setItem(null); setError(''); setNotFound(false); setNotice(''); setActionAlert('');
    api(`/perdidos/${id}`).then(data => { if (active) setItem(data.perdido); })
      .catch(err => {
        if (!active) return;
        // 400 (id inválido na URL) e 404 levam à mesma mensagem de publicação inexistente.
        if (err.status === 404 || err.status === 400) setNotFound(true); else setError(friendlyError(err));
      });
    return () => { active = false; };
  }, [id, retry]);
  // O aviso vindo da edição é copiado para o estado e retirado do histórico, para não voltar ao recarregar.
  useEffect(() => {
    if (!location.state?.updated) return;
    setNotice('Alterações salvas com sucesso.');
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);
  const found = item?.status_perda === 'ENCONTRADO';
  const local = item && localPhone(item.tutor_telefone);
  const whatsapp = item && whatsappLink(item);
  // O PATCH devolve a publicação sem os dados do tutor; por isso os campos novos são mesclados aos atuais.
  // A confirmação do status aparece dentro de "Gerenciar publicação", perto do botão usado.
  const manage = {
    onUpdated: perdido => { setItem(current => ({ ...current, ...perdido })); setNotice(''); },
    onDeleted: () => navigate('/perdidos', { replace: true, state: { deleted: true } }),
    onNotFound: () => { setItem(null); setNotFound(true); },
    onForbidden: message => { setItem(current => ({ ...current, eh_autor: false })); setNotice(''); setActionAlert(message); },
  };
  return <div className="min-h-screen bg-gray-100"><div className="w-full sm:max-w-sm mx-auto min-h-screen bg-white sm:shadow-2xl"><PageHeader title="Animal perdido" back="/perdidos" />
    <main className="pb-28">
      {item && notice && <p role="status" className="bg-teal-50 text-teal-800 text-sm px-5 py-3">{notice}</p>}
      {notFound &&<div className="p-6 text-center">
        <i aria-hidden="true" className="ri-search-eye-line text-5xl text-gray-300" />
        <h2 className="font-bold text-lg mt-2">Publicação não encontrada</h2>
        <p className="text-sm text-gray-500 mt-2">Ela pode ter sido excluída pelo tutor ou o link está incorreto.</p>
        <Link to="/perdidos" className="block text-center bg-brand-teal text-white font-bold rounded-xl py-3 mt-6">Voltar para Perdidos</Link>
      </div>}
      {error && <div role="alert" className="p-6 text-red-600"><p>{error}</p><button onClick={() => setRetry(value => value + 1)} className="underline mt-3">Tentar novamente</button><Link to="/perdidos" className="block text-teal-700 mt-4">Voltar para Perdidos</Link></div>}
      {!item && !error && !notFound && <p role="status" className="p-6">Carregando publicação...</p>}
      {item && <>
        <div className="relative">
          <FotoPerdido id={item.id_perda} temFoto={item.tem_foto} alt={perdidoName(item)} className="w-full h-72 object-cover bg-teal-50" />
          <div className={`absolute top-0 right-0 ${found ? 'bg-brand-teal' : 'bg-red-500'} text-white text-xs font-bold px-4 py-1.5 rounded-bl-xl`}>{found ? 'Encontrado' : 'Procura-se'}</div>
        </div>
        <div className="px-6 pt-6">
          <h2 className="text-2xl font-bold break-words">{perdidoName(item)}</h2>
          <p className="text-gray-500 mt-1">{item.especie}{item.raca ? ` · ${item.raca}` : ''}</p>
          <p className="text-sm text-gray-500 mt-4">{`${perdidoSince(item)} (${perdidoDate(item)})`}</p>
          {found && <p className="bg-teal-50 text-teal-800 text-sm rounded-xl px-4 py-3 mt-4">Este animal já foi encontrado pelo tutor.</p>}
          <h3 className="font-bold mt-6 mb-2">Local do desaparecimento</h3>
          <p className={`text-sm font-medium ${found ? 'text-teal-700' : 'text-red-500'} break-words`}><i aria-hidden="true" className="ri-map-pin-line mr-1" />{item.local_desaparecimento}</p>
          <h3 className="font-bold mt-6 mb-2">Descrição</h3><p className="text-gray-600 whitespace-pre-wrap break-words">{item.descricao || 'Nenhuma descrição informada.'}</p>
          <h3 className="font-bold mt-6 mb-2">Informações do animal</h3>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <Info label="Espécie" value={item.especie} /><Info label="Raça" value={item.raca} fallback="Não informada" />
            <Info label="Cor" value={item.cor} fallback="Não informada" /><Info label="Sexo" value={item.genero} fallback="Não informado" />
          </dl>
          <h3 className="font-bold mt-6 mb-2">Contato do tutor</h3>
          <p className="text-sm text-gray-800 break-words"><i aria-hidden="true" className="ri-user-heart-line mr-1 text-teal-700" />{item.tutor_nome}</p>
          <p className="text-sm text-gray-600 mt-1"><i aria-hidden="true" className="ri-phone-line mr-1 text-teal-700" />
            {local ? <a href={`tel:+55${local}`} className="underline">{formatPhone(local)}</a> : item.tutor_telefone || 'Telefone não informado.'}
          </p>
          {whatsapp
            ? <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={`flex items-center justify-center gap-2 font-bold rounded-xl py-3 mt-4 ${found ? 'border border-teal-700 text-teal-700' : 'bg-red-500 hover:bg-red-600 text-white'}`}>
                <i aria-hidden="true" className="ri-whatsapp-line text-xl" />{found ? 'Falar com o tutor' : 'Tenho pistas: falar no WhatsApp'}
              </a>
            : <p className="text-xs text-gray-500 mt-3">Não foi possível gerar um link de WhatsApp para este telefone.</p>}
          {item.eh_autor && <GerenciarPerdido item={item} {...manage} />}
          {actionAlert && <p role="alert" className="text-sm text-red-600 mt-4">{actionAlert}</p>}
          <Link to="/perdidos" className="block text-center text-teal-700 font-bold py-3 mt-4">Ver todos os perdidos</Link>
        </div>
      </>}
    </main>
  </div><Navigation /></div>;
}
