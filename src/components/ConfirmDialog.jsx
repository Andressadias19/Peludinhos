import { useEffect, useId, useRef } from 'react';

// Diálogo nativo (<dialog> + showModal): modal, prende o foco e fecha com Esc, sem bibliotecas.
// Abrir não executa nada; a ação só acontece no botão de confirmar.
export default function ConfirmDialog({ open, title, children, confirmLabel, busyLabel, busy = false, destructive = false, onConfirm, onCancel }) {
  const dialog = useRef(null);
  const cancelButton = useRef(null);
  const titleId = useId();
  const textId = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      // Foco inicial em "Cancelar": um Enter acidental não confirma a ação.
      cancelButton.current?.focus();
    } else if (!open && element.open) element.close();
  }, [open]);
  function handleCancel(event) {
    // Esc dispara "cancel": o estado do React decide se fecha (não fecha durante o envio).
    event.preventDefault();
    if (!busy) onCancel();
  }
  return <dialog ref={dialog} onCancel={handleCancel} aria-labelledby={titleId} aria-describedby={textId}
    className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl bg-white p-6 shadow-xl backdrop:bg-black/40">
    <h2 id={titleId} className="text-lg font-bold text-gray-800">{title}</h2>
    <div id={textId} className="text-sm text-gray-600 mt-3">{children}</div>
    <div className="flex flex-col gap-2 mt-6">
      <button type="button" onClick={onConfirm} disabled={busy}
        className={`w-full font-bold py-3 rounded-xl text-white disabled:opacity-50 ${destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-teal'}`}>{busy ? busyLabel : confirmLabel}</button>
      <button ref={cancelButton} type="button" onClick={onCancel} disabled={busy} className="w-full py-3 rounded-xl text-teal-700 font-bold border border-gray-200 disabled:opacity-50">Cancelar</button>
    </div>
  </dialog>;
}
