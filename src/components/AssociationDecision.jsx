// Decisão do último pedido de associação feito pela própria pessoa (a API só envia para quem pediu).
export default function AssociationDecision({ decision }) {
  if (!decision || decision.status_solicitacao !== 'RECUSADA') return null;
  return <div role="status" className="text-sm bg-red-50 text-red-800 rounded-xl p-4 mt-3">
    <p className="font-bold">Seu pedido de associação ao cadastro #{decision.id_animal_proposto} foi recusado{decision.data_decisao ? ` em ${new Date(decision.data_decisao).toLocaleDateString('pt-BR')}` : ''}.</p>
    {decision.observacao_decisao && <p className="mt-1 whitespace-pre-wrap break-words">Justificativa: {decision.observacao_decisao}</p>}
    <p className="mt-2 text-red-700">Se tiver novas informações, você pode enviar outro pedido.</p>
  </div>;
}
