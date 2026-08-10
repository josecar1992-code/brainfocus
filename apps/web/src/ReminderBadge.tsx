import { type Reminder } from "./api";
import { IconBell, IconBellOff, IconCheckCircle } from "./icons";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString("es-CR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Pill de estado del recordatorio: enviado, programado, o guardado pero sin cron
 * ("sin aviso") — compartido entre Agenda y Tareas, para que un recordatorio sin
 * aviso real (cron falló o no se programó) sea visible dondequiera que se muestre,
 * no solo desde Agenda. */
export function ReminderBadge({ reminder, iconOnly }: { reminder: Reminder; iconOnly?: boolean }) {
  if (reminder.sent_at) {
    const title = `Recordatorio ya enviado (${formatDateTime(reminder.sent_at)})`;
    if (iconOnly)
      return (
        <span title={title} className="flex-shrink-0">
          <IconCheckCircle className="w-3.5 h-3.5 text-green-400" strokeWidth={2} />
        </span>
      );
    return (
      <span
        title={title}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full"
      >
        <IconCheckCircle className="w-3 h-3" strokeWidth={2} />
        Enviado
      </span>
    );
  }
  if (reminder.cron_job_id) {
    const title = `Recordatorio programado para ${formatDateTime(reminder.remind_at)}`;
    if (iconOnly)
      return (
        <span title={title} className="flex-shrink-0">
          <IconBell className="w-3.5 h-3.5 text-electric-cyan" strokeWidth={2} />
        </span>
      );
    return (
      <span
        title={title}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-electric-cyan bg-electric-cyan/10 px-2 py-0.5 rounded-full"
      >
        <IconBell className="w-3 h-3" strokeWidth={2} />
        Programado
      </span>
    );
  }
  const title = `Recordatorio guardado para ${formatDateTime(reminder.remind_at)}, pero sin aviso automático (OpenClaw no configurado o falló)`;
  if (iconOnly)
    return (
      <span title={title} className="flex-shrink-0">
        <IconBellOff className="w-3.5 h-3.5 text-white/40" strokeWidth={2} />
      </span>
    );
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/40 bg-white/5 px-2 py-0.5 rounded-full"
    >
      <IconBellOff className="w-3 h-3" strokeWidth={2} />
      Sin aviso
    </span>
  );
}
