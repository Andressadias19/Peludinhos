import { Link } from 'react-router-dom';
import Navigation from '../components/Navigation';

export default function Lost() { return <div className="min-h-screen flex flex-col bg-gray-100 text-gray-800">
<div className={"w-full sm:max-w-sm mx-auto min-h-screen flex flex-col font-sans bg-surface relative sm:shadow-2xl"}>
<header className={"bg-brand-teal text-white z-20 relative pt-2 pb-4 px-4 rounded-b-3xl shadow-md flex flex-col gap-4"}>
<div className={"flex items-center justify-between"}>
<button aria-label={"Menu"} className={"text-2xl p-1"}>
<i className={"ri-menu-line"}></i>
</button>
<div className={"flex items-center gap-2"}>
<img src={"/assets/icons/peludinhos.svg"} alt={"Logo"} className={"h-6 w-auto brightness-0 invert"} />
<h1 className={"text-xl font-bold tracking-tight"}>{"Peludinhos"}</h1>
</div>
<button aria-label={"Notificações"} className={"text-2xl p-1 relative"}>
<i className={"ri-notification-3-line"}></i>
</button>
</div>
<div className={"flex items-center gap-3"}>
<div className={"relative flex-1"}>
<input className={"w-full pl-4 pr-10 py-3 rounded-xl bg-white text-gray-800 placeholder-gray-400 focus:outline-none border-none shadow-sm text-sm"} placeholder={"Buscar animais ou locais"} type={"text"} />
<i className={"ri-search-line absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg"}></i>
</div>
<button aria-label={"Filtrar"} className={"bg-white p-3 rounded-xl text-gray-600 shadow-sm"}>
<i className={"ri-list-settings-line text-lg"}></i>
</button>
</div>
</header>
<main className={"flex-1 overflow-y-auto z-10 px-4 pt-6 pb-24"}>
<p className={"text-sm text-gray-500 font-medium mb-4"}>{"Animais que precisam voltar para casa:"}</p>
<div className={"flex flex-col gap-4"}>

<div className={"bg-white rounded-2xl p-4 shadow-sm border border-red-100 relative overflow-hidden"}>
<div className={"absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl"}>{"Procura-se"}</div>
<div className={"flex gap-4"}>
<img src={"/assets/icons/peludinhos.svg"} alt={"Bidu"} className={"w-24 h-24 rounded-xl object-cover"} />
<div className={"flex-1"}>
<h2 className={"text-lg font-bold text-gray-800 leading-tight"}>{"Bidu"}</h2>
<p className={"text-xs text-red-500 font-medium mt-1"}><i className={"ri-map-pin-line mr-1"}></i>{"Visto em: Bairro Prainha"}</p>
<p className={"text-xs text-gray-500 mt-1"}>{"Desapareceu há 2 dias. Usava coleira azul."}</p>
<div className={"flex gap-2 mt-3"}>
<button className={"flex-1 py-2 rounded-xl bg-red-50 text-red-600 text-xs font-bold border border-red-100 hover:bg-red-100"}><i className={"ri-phone-line mr-1"}></i>{"Tenho pistas"}</button>
<button className={"py-2 px-3 rounded-xl bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100"}><i className={"ri-share-forward-line"}></i></button>
</div>
</div>
</div>
</div>

<div className={"bg-white rounded-2xl p-4 shadow-sm border border-red-100 relative overflow-hidden"}>
<div className={"absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl"}>{"Procura-se"}</div>
<div className={"flex gap-4"}>
<img src={"/assets/icons/peludinhos.svg"} alt={"Mia"} className={"w-24 h-24 rounded-xl object-cover"} />
<div className={"flex-1"}>
<h2 className={"text-lg font-bold text-gray-800 leading-tight"}>{"Mia"}</h2>
<p className={"text-xs text-red-500 font-medium mt-1"}><i className={"ri-map-pin-line mr-1"}></i>{"Visto em: Centro"}</p>
<p className={"text-xs text-gray-500 mt-1"}>{"Fugiu de casa na última chuva."}</p>
<div className={"flex gap-2 mt-3"}>
<button className={"flex-1 py-2 rounded-xl bg-red-50 text-red-600 text-xs font-bold border border-red-100 hover:bg-red-100"}><i className={"ri-phone-line mr-1"}></i>{"Tenho pistas"}</button>
<button className={"py-2 px-3 rounded-xl bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100"}><i className={"ri-share-forward-line"}></i></button>
</div>
</div>
</div>
</div>
</div>
</main>

<div className={"fixed bottom-28 left-0 right-0 mx-auto w-full sm:max-w-sm pointer-events-none z-40"}>
<a href={"#"} className={"absolute right-4 bg-red-500 text-white px-5 py-3 rounded-full shadow-lg flex items-center justify-center gap-2 hover:bg-red-600 transition-colors pointer-events-auto"}>
<i className={"ri-megaphone-fill text-xl"}></i>
<span className={"font-bold text-sm"}>{"Divulgar Fuga"}</span>
</a>
</div>



</div>
<Navigation /></div>; }
