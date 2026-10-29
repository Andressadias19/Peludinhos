import { useEffect, useState } from 'react';
import { apiBlob } from '../api';

const placeholder = '/assets/icons/peludinhos.svg';

// A foto é privada: busca com o token, exibe por URL blob e libera a URL ao sair ou trocar de publicação.
export default function FotoPerdido({ id, temFoto, alt, className }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    setSrc('');
    if (!temFoto) return;
    const controller = new AbortController();
    let url;
    // no-store: depois de trocar ou remover a foto, nunca reaproveitar a imagem antiga do cache.
    apiBlob(`/perdidos/${id}/foto`, { signal: controller.signal, cache: 'no-store' })
      .then(blob => {
        if (controller.signal.aborted || !blob.type.startsWith('image/')) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => {}); // Sem foto disponível: o placeholder continua visível.
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [id, temFoto]);
  // O logo de placeholder é decorativo: o nome do animal só descreve a imagem quando a foto real carregou.
  return <img src={src || placeholder} alt={src ? alt : ''} className={className} />;
}
