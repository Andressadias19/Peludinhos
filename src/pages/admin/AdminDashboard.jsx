import { Link, useOutletContext } from 'react-router-dom';
import { AdminHeader, DistributionBar, RefreshButton, ResumoState, StatCard, formatCount, updatedAt } from '../../components/admin/AdminUI';

export default function AdminDashboard() {
  const { admin, resumo } = useOutletContext();
  const firstName = admin.nome.trim().split(/\s+/)[0];
  return <>
    <AdminHeader icon="ri-dashboard-3-line" title={`Olá, ${firstName}!`}
      description={resumo.geradoEm ? `Visão geral do Peludinhos com dados do banco, consultados às ${updatedAt(resumo.geradoEm)}.` : 'Visão geral do Peludinhos com dados do banco.'}>
      <RefreshButton resumo={resumo} />
    </AdminHeader>
    <ResumoState resumo={resumo}>{data => {
      const pendentes = data.animais.pendentes + data.associacoes.pendentes;
      return <>
        <PendingBanner total={pendentes} />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon="ri-group-line" label="Usuários cadastrados" value={data.usuarios.total} to="/admin/usuarios"
            detail={`${formatCount(data.usuarios.ativos)} ativos · ${formatCount(data.usuarios.administradores)} administrador(es)`} />
          <StatCard icon="ri-bear-smile-line" label="Animais cadastrados" value={data.animais.total} to="/admin/animais"
            detail={`${formatCount(data.animais.validados)} validados`} />
          <StatCard icon="ri-map-pin-2-line" label="Avistamentos" value={data.avistamentos.total} to="/admin/avistamentos"
            detail={`${formatCount(data.avistamentos.ultimos_30_dias)} nos últimos 30 dias`} />
          <StatCard icon="ri-megaphone-line" label="Publicações de desaparecimento" value={data.desaparecimentos.total} to="/admin/desaparecimentos"
            detail={`${formatCount(data.desaparecimentos.perdidos)} ainda procurados`} />
        </div>

        <h2 className="text-lg font-bold text-gray-900 mt-10 mb-4">Fila de validação</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard tone="orange" icon="ri-file-shield-2-line" label="Animais aguardando validação" value={data.animais.pendentes} to="/admin/validacoes"
            detail="Cadastros novos ou editados ficam Pendentes até a análise." />
          <StatCard tone="orange" icon="ri-links-line" label="Solicitações de associação pendentes" value={data.associacoes.pendentes} to="/admin/validacoes"
            detail="Pedidos para vincular um avistamento a um cadastro existente." />
        </div>

        <h2 className="text-lg font-bold text-gray-900 mt-10 mb-4">Distribuição dos registros</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          <DistributionBar title="Validação dos cadastros" items={[
            { label: 'Pendentes', value: data.animais.pendentes, color: 'bg-amber-400' },
            { label: 'Validados', value: data.animais.validados, color: 'bg-brand-teal' },
            { label: 'Recusados', value: data.animais.recusados, color: 'bg-red-400' },
          ]} />
          <DistributionBar title="Avistamentos" items={[
            { label: 'Vinculados a um cadastro', value: data.avistamentos.total - data.avistamentos.sem_cadastro, color: 'bg-brand-teal' },
            { label: 'Sem identificação', value: data.avistamentos.sem_cadastro, color: 'bg-brand-orange' },
          ]} />
          <DistributionBar title="Desaparecimentos" items={[
            { label: 'Procura-se', value: data.desaparecimentos.perdidos, color: 'bg-red-500' },
            { label: 'Encontrados', value: data.desaparecimentos.encontrados, color: 'bg-brand-teal' },
          ]} />
        </div>
      </>;
    }}</ResumoState>
  </>;
}

function PendingBanner({ total }) {
  if (!total) return <p role="status" className="mb-6 flex items-center gap-3 rounded-2xl bg-teal-50 px-5 py-4 text-sm font-semibold text-teal-800">
    <i aria-hidden="true" className="ri-checkbox-circle-line text-2xl" />Nenhuma validação pendente no momento.
  </p>;
  return <Link to="/admin/validacoes" className="mb-6 flex items-center gap-4 rounded-2xl bg-brand-orange px-5 py-4 text-white shadow-sm hover:bg-orange-500 transition">
    <i aria-hidden="true" className="ri-alarm-warning-line text-3xl" />
    <span className="flex-1"><strong className="block text-lg">{formatCount(total)} {total === 1 ? 'item aguarda' : 'itens aguardam'} análise</strong><span className="text-sm text-white/90">Cadastros de animais e solicitações de associação pendentes.</span></span>
    <i aria-hidden="true" className="ri-arrow-right-line text-2xl" />
  </Link>;
}
