import { CornerBrackets } from "./CornerBrackets";

// Reemplaza el confirm() nativo del navegador (rompía la estética del resto
// de la app) — usar SIEMPRE antes de cualquier borrado, sin excepción, sea
// cual sea el módulo que se agregue de acá en adelante.
export function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
  pending,
  confirmLabel = "Borrar",
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  pending?: boolean;
  confirmLabel?: string;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-30">
      <div className="relative w-full max-w-xs border border-red-400/30 bg-night-blue rounded-2xl p-5 flex flex-col gap-4 shadow-[0_0_60px_-15px_rgba(255,80,80,0.25)]">
        <CornerBrackets />
        <p className="text-sm text-white/85">{message}</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="border border-white/10 rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="border border-red-400/40 text-red-400 rounded-lg px-3 py-2 text-sm hover:bg-red-400/10 transition disabled:opacity-50"
          >
            {pending ? "Borrando..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
