import { useState } from 'react';
import { Link } from 'react-router-dom';
import ConfirmDialog from './ConfirmDialog';
import { friendlyError } from './PerdidoForm';
import { api } from '../api';

export const nextStatus = status => status === 'ENCONTRADO' ? 'PERDIDO' : 'ENCONTRADO';

export function updateStatus(item, request = api) {
  return request(`/perdidos/${item.id_perda}/status`, { method: 'PATCH', body: JSON.stringify({ status_perda: nextStatus(item.status_perda) }) });
}

export function deletePerdido(item, request = api) {
  return request(`/perdidos/${item.id_perda}`, { method: 'DELETE' });
}

// Ignora novas chamadas enquanto uma requisição ainda está em andamento.
export function singleFlight() {
  let pending = false;
  return async task => {
    if (pending) return;
    pending = true;
    try { return await task(); } finally { pending = false; }
  };
}

// 401 já é tratado pelo api.js (volta ao login); os demais viram estados da tela.
export function actionError(err) {
  if (err.status === 404) return { kind: 'notFound' };
  if (err.status === 403) return { kind: 'forbidden', message: 'Você não tem permissão para gerenciar esta publicação.' };
  if (err.status === 401) return { kind: 'session' };
  return { kind: 'error', message: friendlyError(err) };
}

// A tela só muda em onSuccess, depois da resposta; em erro, o estado anterior continua.
export async function executeAction(request, { onSuccess, onFailure }) {
  let result;
  try { result = await request(); } catch (err) { onFailure(actionError(err)); return; }
  onSuccess(result);
}

// Só é exibido para o autor; o backend continua conferindo a propriedade em cada requisição.
export default function GerenciarPerdido({ item, onUpdated, onDeleted, onNotFound, onForbidden }) {
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [runOnce] = useState(singleFlight);
  const found = item.status_perda === 'ENCONTRADO';
  const run = (request, onSuccess) => runOnce(async () => {
    setBusy(true); setError(''); setSuccess('');
    await executeAction(request, {
      onSuccess,
      onFailure: state => {
        setDialog(null);
        if (state.kind === 'notFound') onNotFound();
        else if (state.kind === 'forbidden') onForbidden(state.message);
        else if (state.kind === 'error') setError(state.message);
      },
    });
    setBusy(false);
  });
  const confirmStatus = () => run(() => updateStatus(item), result => { setDialog(null); setSuccess(result.mensagem); onUpdated(result.perdido, result.mensagem); });
  const confirmDelete = () => run(() => deletePerdido(item), () => onDeleted());
  const close = () => { if (!busy) setDialog(null); };
  return <section aria-labelledby="gerenciar-perdido" className="mt-6">
    <h3 id="gerenciar-perdido" className="font-bold mb-2">Gerenciar publicação</h3>
    <div className="flex flex-col gap-3">
      <Link to={`/perdidos/${item.id_perda}/editar`} className="flex items-center justify-center gap-2 border border-teal-700 text-teal-700 font-bold rounded-xl py-3"><i aria-hidden="true" className="ri-edit-line text-lg" />Editar publicação</Link>
      {found
        ? <button type="button" disabled={busy} onClick={() => setDialog('status')} className="flex items-center justify-center gap-2 bg-red-50 text-red-600 border border-red-100 font-bold rounded-xl py-3 disabled:opacity-50"><i aria-hidden="true" className="ri-megaphone-line text-lg" />Marcar como perdido novamente</button>
        : <button type="button" disabled={busy} onClick={() => setDialog('status')} className="flex items-center justify-center gap-2 bg-brand-teal text-white font-bold rounded-xl py-3 disabled:opacity-50"><i aria-hidden="true" className="ri-heart-3-line text-lg" />Marcar como encontrado</button>}
      <button type="button" disabled={busy} onClick={() => setDialog('delete')} className="flex items-center justify-center gap-2 border border-red-200 text-red-600 font-bold rounded-xl py-3 disabled:opacity-50"><i aria-hidden="true" className="ri-delete-bin-line text-lg" />Excluir publicação</button>
    </div>
    {error && <p role="alert" className="text-sm text-red-600 mt-3">{error}</p>}
    {/* Região sempre presente: leitores de tela anunciam a confirmação quando o texto aparece. */}
    <div role="status" className="empty:hidden">{success && <p className="bg-teal-50 text-teal-800 text-sm rounded-xl px-4 py-3 mt-3">{success}</p>}</div>
    <ConfirmDialog open={dialog === 'status'} busy={busy} onConfirm={confirmStatus} onCancel={close}
      title={found ? 'Marcar como perdido novamente?' : 'Marcar como encontrado?'}
      confirmLabel={found ? 'Marcar como perdido' : 'Marcar como encontrado'} busyLabel="Salvando...">
      {found
        ? 'A publicação voltará a ser identificada como procurada, com o selo "Procura-se".'
        : 'A publicação continuará visível para outros usuários, mas será identificada como encontrada. Você poderá voltar a marcá-la como perdida se precisar.'}
    </ConfirmDialog>
    <ConfirmDialog open={dialog === 'delete'} busy={busy} destructive onConfirm={confirmDelete} onCancel={close}
      title="Excluir publicação?" confirmLabel="Excluir definitivamente" busyLabel="Excluindo...">
      <ul className="list-disc pl-5 flex flex-col gap-1">
        <li>A publicação será excluída permanentemente.</li>
        <li>A fotografia associada também será removida.</li>
        <li>Esta operação não poderá ser desfeita.</li>
      </ul>
    </ConfirmDialog>
  </section>;
}
