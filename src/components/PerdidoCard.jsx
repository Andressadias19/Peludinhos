import { Link } from 'react-router-dom';
import FotoPerdido from './FotoPerdido';

export const perdidoName = item => item.nome_animal
  || `${item.especie === 'Outro' ? 'Animal' : item.especie} ${item.status_perda === 'ENCONTRADO' ? 'encontrado' : 'perdido'}`;

// data_desaparecimento chega como YYYY-MM-DD; é tratada como texto para não sofrer deslocamento de fuso.
export const perdidoDate = item => item.data_desaparecimento.split('-').reverse().join('/');

export function perdidoSince(item) {
  const [year, month, day] = item.data_desaparecimento.split('-').map(Number);
  const now = new Date();
  const days = Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(year, month - 1, day)) / 86400000);
  if (days <= 0) return 'Desapareceu hoje';
  if (days === 1) return 'Desapareceu ontem';
  return `Desapareceu há ${days} dias`;
}

// O link do nome se estende pelo card inteiro (after:inset-0); os botões ficam acima dele (z-10), sem links aninhados.
export default function PerdidoCard({ perdido, onShare }) {
  const found = perdido.status_perda === 'ENCONTRADO';
  const to = `/perdidos/${perdido.id_perda}`;
  return <div className={`bg-white rounded-2xl p-4 shadow-sm border ${found ? 'border-teal-100' : 'border-red-100'} relative overflow-hidden`}>
    <div className={`absolute top-0 right-0 ${found ? 'bg-brand-teal' : 'bg-red-500'} text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl`}>{found ? 'Encontrado' : 'Procura-se'}</div>
    <div className="flex gap-4">
      <FotoPerdido id={perdido.id_perda} temFoto={perdido.tem_foto} alt={perdidoName(perdido)} className="w-24 h-24 rounded-xl object-cover shrink-0" />
      <div className="flex-1 min-w-0">
        <h2 className="text-lg font-bold text-gray-800 leading-tight pr-16 break-words"><Link to={to} className="after:absolute after:inset-0">{perdidoName(perdido)}</Link></h2>
        <p className="text-xs text-gray-500 mt-1">{perdido.especie}{perdido.raca ? ` · ${perdido.raca}` : ''}</p>
        <p className={`text-xs ${found ? 'text-teal-700' : 'text-red-500'} font-medium mt-1 break-words`}><i className="ri-map-pin-line mr-1"></i>{`Visto em: ${perdido.local_desaparecimento}`}</p>
        <p className="text-xs text-gray-500 mt-1">{`${perdidoSince(perdido)} (${perdidoDate(perdido)})`}</p>
        {perdido.descricao && <p className="text-xs text-gray-500 mt-1 line-clamp-2 break-words">{perdido.descricao}</p>}
        <div className="flex gap-2 mt-3">
          {found
            ? <Link to={to} className="relative z-10 flex-1 py-2 rounded-xl bg-teal-50 text-teal-700 text-xs font-bold border border-teal-100 hover:bg-teal-100 text-center"><i className="ri-file-list-3-line mr-1"></i>{'Ver detalhes'}</Link>
            : <Link to={to} className="relative z-10 flex-1 py-2 rounded-xl bg-red-50 text-red-600 text-xs font-bold border border-red-100 hover:bg-red-100 text-center"><i className="ri-phone-line mr-1"></i>{'Tenho pistas'}</Link>}
          <button type="button" onClick={() => onShare?.(perdido)} aria-label={`Compartilhar publicação de ${perdidoName(perdido)}`} className="relative z-10 py-2 px-3 rounded-xl bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100"><i className="ri-share-forward-line"></i></button>
        </div>
      </div>
    </div>
  </div>;
}
