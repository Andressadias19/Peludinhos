import { NavLink } from 'react-router-dom';

export default function Navigation() {
  const items = [['/animais', 'Animais', 'ri-bear-smile-fill'], ['/mapa', 'Mapa', 'ri-map-pin-2-fill'], ['/perdidos', 'Perdidos', 'ri-megaphone-fill'], ['/perfil', 'Perfil', 'ri-user-fill']];
  return <nav aria-label="Navegação principal" className="fixed bottom-0 left-0 right-0 mx-auto w-full sm:max-w-sm bg-white border-t border-gray-100 flex justify-around items-center py-2 px-4 pb-safe z-[1000] shadow-lg">
    {items.map(([to, label, icon]) => <NavLink key={to} to={to} className={({ isActive }) => `flex flex-col items-center p-2 ${isActive ? 'text-brand-orange' : 'text-gray-400'}`}>
      <i aria-hidden="true" className={`${icon} text-2xl`} /><span className="text-[10px] font-medium mt-1">{label}</span>
    </NavLink>)}
  </nav>;
}
