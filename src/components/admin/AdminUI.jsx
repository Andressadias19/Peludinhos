import { Link } from 'react-router-dom';

const number = new Intl.NumberFormat('pt-BR');
export const formatCount = value => number.format(value);

export function AdminHeader({ icon, title, description, children }) {
  return <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-8">
    <div className="flex items-start gap-4">
      <span className="hidden sm:flex w-12 h-12 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><i aria-hidden="true" className={`${icon} text-2xl`} /></span>
      <div><h1 className="text-2xl lg:text-3xl font-bold text-gray-900">{title}</h1>{description && <p className="text-sm text-gray-500 mt-1 max-w-2xl">{description}</p>}</div>
    </div>
    {children && <div className="flex gap-2 shrink-0">{children}</div>}
  </header>;
}

export function RefreshButton({ resumo }) {
  return <button type="button" onClick={resumo.reload} disabled={resumo.loading} className="flex items-center gap-2 rounded-xl border border-teal-700 bg-white px-4 py-2.5 text-sm font-bold text-teal-700 hover:bg-teal-50 disabled:opacity-50">
    <i aria-hidden="true" className={`ri-refresh-line text-lg ${resumo.loading ? 'animate-spin' : ''}`} />{resumo.loading ? 'Atualizando...' : 'Atualizar'}
  </button>;
}

const tones = {
  teal: { icon: 'bg-teal-50 text-teal-700', value: 'text-gray-900' },
  orange: { icon: 'bg-orange-50 text-brand-orange', value: 'text-brand-orange' },
};

export function StatCard({ icon, label, value, detail, to, tone = 'teal' }) {
  const colors = tones[tone];
  const content = <>
    <div className="flex items-center justify-between"><span className={`flex w-11 h-11 items-center justify-center rounded-2xl ${colors.icon}`}><i aria-hidden="true" className={`${icon} text-2xl`} /></span>
      {to && <i aria-hidden="true" className="ri-arrow-right-up-line text-xl text-gray-300 group-hover:text-teal-700" />}</div>
    <p className="text-sm font-semibold text-gray-500 mt-4">{label}</p>
    <p className={`text-3xl font-bold mt-1 ${colors.value}`}>{formatCount(value)}</p>
    {detail && <p className="text-xs text-gray-500 mt-2">{detail}</p>}
  </>;
  const className = 'group block rounded-3xl border border-gray-100 bg-white p-5 shadow-sm';
  return to ? <Link to={to} className={`${className} hover:border-teal-700/30 hover:shadow-md transition`}>{content}</Link> : <div className={className}>{content}</div>;
}

// Barra empilhada com legenda; sem biblioteca de gráficos.
export function DistributionBar({ title, items }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  return <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
    <div className="flex items-baseline justify-between"><h2 className="font-bold text-gray-900">{title}</h2><span className="text-sm text-gray-500">{formatCount(total)} no total</span></div>
    {total === 0 ? <p className="text-sm text-gray-500 mt-4">Nenhum registro ainda.</p> : <>
      <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-gray-100" role="img" aria-label={items.map(item => `${item.label}: ${item.value}`).join(', ')}>
        {items.map(item => item.value > 0 && <span key={item.label} className={item.color} style={{ width: `${(item.value / total) * 100}%` }} />)}
      </div>
      <ul className="mt-4 grid gap-2 text-sm">{items.map(item => <li key={item.label} className="flex items-center gap-2">
        <span aria-hidden="true" className={`w-2.5 h-2.5 rounded-full ${item.color}`} /><span className="flex-1 text-gray-600">{item.label}</span>
        <strong className="text-gray-900">{formatCount(item.value)}</strong><span className="w-12 text-right text-xs text-gray-400">{Math.round((item.value / total) * 100)}%</span>
      </li>)}</ul>
    </>}
  </section>;
}

export function ResumoState({ resumo, children }) {
  if (resumo.error && !resumo.data) return <div role="alert" className="rounded-3xl border border-red-100 bg-red-50 p-6 text-red-700">
    <p className="font-bold">Não foi possível carregar os dados do painel.</p><p className="text-sm mt-1">{resumo.error}</p>
    <button type="button" onClick={resumo.reload} className="mt-4 rounded-xl bg-white px-4 py-2 text-sm font-bold text-red-700 border border-red-200">Tentar novamente</button>
  </div>;
  if (!resumo.data) return <div role="status" aria-label="Carregando dados do painel" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    {[0, 1, 2, 3].map(key => <div key={key} className="h-40 rounded-3xl bg-white border border-gray-100 animate-pulse" />)}
  </div>;
  return <>
    {resumo.error && <p role="alert" className="mb-6 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">Não foi possível atualizar agora: {resumo.error} Os números abaixo são da última consulta.</p>}
    {children(resumo.data)}
  </>;
}

// Aviso das seções que ainda não têm ações; nenhuma lista ou dado fictício é exibido.
export function UpcomingSection({ icon, title, text }) {
  return <section className="rounded-3xl border-2 border-dashed border-teal-700/25 bg-white p-8 text-center mt-8">
    <span className="mx-auto flex w-16 h-16 items-center justify-center rounded-full bg-teal-50 text-teal-700"><i aria-hidden="true" className={`${icon} text-3xl`} /></span>
    <h2 className="font-bold text-lg text-gray-900 mt-4">{title}</h2>
    <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">{text}</p>
    <span className="inline-flex items-center gap-1.5 mt-5 rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-brand-orange"><i aria-hidden="true" className="ri-time-line" />Próxima etapa</span>
  </section>;
}

const statusStyles = {
  Pendente: 'bg-amber-50 text-amber-800 ring-amber-200',
  Validado: 'bg-teal-50 text-teal-800 ring-teal-200',
  Recusado: 'bg-red-50 text-red-700 ring-red-200',
};
const statusIcons = { Pendente: 'ri-time-line', Validado: 'ri-checkbox-circle-line', Recusado: 'ri-close-circle-line' };

export function StatusBadge({ status }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${statusStyles[status] || statusStyles.Pendente}`}>
    <i aria-hidden="true" className={statusIcons[status] || statusIcons.Pendente} />{status}
  </span>;
}

// Situação do avistamento em relação a um cadastro de animal.
export function AssociationBadge({ sighting }) {
  const [styles, icon, text] = sighting.id_animal
    ? ['bg-teal-50 text-teal-800 ring-teal-200', 'ri-link', `Animal #${sighting.id_animal}`]
    : sighting.associacao_pendente
      ? ['bg-amber-50 text-amber-800 ring-amber-200', 'ri-time-line', 'Associação pendente']
      : ['bg-orange-50 text-orange-800 ring-orange-200', 'ri-question-line', 'Sem identificação'];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${styles}`}><i aria-hidden="true" className={icon} />{text}</span>;
}

// Mesmas cores da página pública de perdidos: vermelho para Procura-se, verde para Encontrado.
export function LostStatusBadge({ status }) {
  const found = status === 'ENCONTRADO';
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${found ? 'bg-teal-50 text-teal-800 ring-teal-200' : 'bg-red-50 text-red-700 ring-red-200'}`}>
    <i aria-hidden="true" className={found ? 'ri-heart-line' : 'ri-search-eye-line'} />{found ? 'Encontrado' : 'Procura-se'}
  </span>;
}

export function AccountBadges({ user }) {
  return <span className="inline-flex flex-wrap gap-1.5">
    {user.tipo_usuario === 'administrador'
      ? <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-bold text-orange-800 ring-1 ring-orange-200"><i aria-hidden="true" className="ri-shield-user-line" />Administrador</span>
      : <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2.5 py-1 text-xs font-bold text-gray-700 ring-1 ring-gray-200"><i aria-hidden="true" className="ri-user-line" />Usuário</span>}
    {user.ativo
      ? <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800 ring-1 ring-teal-200"><i aria-hidden="true" className="ri-checkbox-circle-line" />Ativa</span>
      : <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700 ring-1 ring-red-200"><i aria-hidden="true" className="ri-forbid-line" />Desativada</span>}
  </span>;
}

export function Avatar({ user, size = 'h-14 w-14' }) {
  return user.foto_perfil
    ? <img src={user.foto_perfil} alt="" className={`${size} shrink-0 rounded-full bg-teal-50 object-cover`} />
    : <span className={`${size} flex shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700`}><i aria-hidden="true" className="ri-user-heart-line text-2xl" /></span>;
}

export function formatDate(value, withTime = false) {
  if (!value) return 'Não registrada';
  const date = new Date(value);
  return withTime ? date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : date.toLocaleDateString('pt-BR');
}

export function BackLink({ to, children }) {
  return <Link to={to} className="inline-flex items-center gap-1 text-sm font-bold text-teal-700 mb-4 hover:underline"><i aria-hidden="true" className="ri-arrow-left-line" />{children}</Link>;
}

const noticeTones = {
  success: ['bg-teal-50 text-teal-800', 'ri-checkbox-circle-line', 'status'],
  warning: ['bg-amber-50 text-amber-900', 'ri-information-line', 'note'],
  error: ['bg-red-50 text-red-700', 'ri-error-warning-line', 'alert'],
};

export function Notice({ tone = 'success', children }) {
  const [styles, icon, role] = noticeTones[tone];
  return <p role={role} className={`mb-6 flex items-start gap-3 rounded-2xl px-5 py-4 text-sm font-semibold ${styles}`}>
    <i aria-hidden="true" className={`${icon} text-xl leading-none`} /><span>{children}</span>
  </p>;
}

export function updatedAt(geradoEm) {
  return geradoEm ? new Date(geradoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
}
