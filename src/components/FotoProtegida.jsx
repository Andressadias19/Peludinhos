import { useEffect, useState } from 'react';
import { apiBlob } from '../api';

const placeholder = '/assets/icons/peludinhos.svg';

// Foto que exige login (perfil e fotos antigas de desaparecimentos): busca com o token, exibe por URL blob
// e libera a URL ao sair ou trocar de foto. chave: muda quando a foto muda (ex.: o nome do arquivo).
// alternativa: o que mostrar enquanto não há foto carregada (padrão: o logo do Peludinhos).
export default function FotoProtegida({ caminho, ativo = true, chave, alt, className, alternativa }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    setSrc('');
    if (!ativo || !caminho) return;
    const controller = new AbortController();
    let url;
    // no-store: depois de trocar ou remover a foto, nunca reaproveitar a imagem antiga do cache.
    apiBlob(caminho, { signal: controller.signal, cache: 'no-store' })
      .then(blob => {
        if (controller.signal.aborted || !blob.type.startsWith('image/')) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => {}); // Sem foto disponível: a alternativa continua visível.
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [caminho, ativo, chave]);
  if (src) return <img src={src} alt={alt} className={className} />;
  // O placeholder é decorativo: o texto alternativo só descreve a imagem quando a foto real carregou.
  return alternativa ?? <img src={placeholder} alt="" className={className} />;
}
