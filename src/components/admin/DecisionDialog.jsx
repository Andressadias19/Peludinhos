import { useEffect, useState } from 'react';
import ConfirmDialog from '../ConfirmDialog';

// Confirmação de aprovação ou recusa com o campo de observação; na recusa a justificativa é obrigatória.
export default function DecisionDialog({ decision, title, busy, onConfirm, onCancel }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { setText(''); setError(''); }, [decision]);
  const refusing = decision === 'recusar';
  function confirm() {
    if (refusing && !text.trim()) return setError('Escreva a justificativa da recusa.');
    onConfirm(text.trim());
  }
  return <ConfirmDialog open={Boolean(decision)} destructive={refusing} title={title} busy={busy} onCancel={onCancel} onConfirm={confirm}
    confirmLabel={refusing ? 'Recusar' : 'Aprovar'} busyLabel="Registrando...">
    <label className="block font-semibold text-gray-700">{refusing ? 'Justificativa (obrigatória)' : 'Observação (opcional)'}
      <textarea value={text} onChange={event => { setText(event.target.value); setError(''); }} maxLength={1000} rows={4}
        placeholder={refusing ? 'Explique o motivo da recusa.' : 'Ex.: fotos e características conferidas.'}
        className="mt-2 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 font-normal focus:outline-none focus:ring-2 focus:ring-teal-700" />
    </label>
    <span className="mt-1 block text-right text-xs text-gray-400">{text.length}/1000</span>
    {error && <p role="alert" className="mt-1 text-sm font-semibold text-red-600">{error}</p>}
  </ConfirmDialog>;
}
