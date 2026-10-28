import { Link } from 'react-router-dom';

export default function PageHeader({ title, back = '/mapa' }) {
  return <header className="bg-brand-teal text-white px-4 py-4 rounded-b-3xl flex items-center gap-3 shadow-sm relative z-20">
    <Link to={back} aria-label="Voltar" className="p-2 text-2xl"><i className="ri-arrow-left-line" /></Link>
    <img src="/assets/icons/peludinhos.svg" alt="" className="w-6 brightness-0 invert" /><h1 className="font-bold text-lg">{title}</h1>
  </header>;
}
