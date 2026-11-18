import { mediaUrl } from '../api';
import FotoProtegida from './FotoProtegida';

const placeholder = '/assets/icons/peludinhos.svg';

// Fotos de desaparecimentos são públicas (foto = "/uploads/<nome>"), como as de animais e avistamentos.
// Publicações antigas, de quando essas fotos eram privadas, não trazem foto, só tem_foto: carregam pela API, com login.
export default function FotoPerdido({ id, foto, temFoto, alt, className }) {
  if (foto) return <img src={mediaUrl(foto)} alt={alt} className={className} />;
  if (!temFoto) return <img src={placeholder} alt="" className={className} />;
  return <FotoProtegida caminho={`/perdidos/${id}/foto`} alt={alt} className={className} />;
}
