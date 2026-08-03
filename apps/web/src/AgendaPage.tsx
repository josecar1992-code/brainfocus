import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Event, type Reminder } from "./api";

const CR_OFFSET = "-06:00"; // Costa Rica, sin horario de verano — offset fijo

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-CR", { day: "2-digit", month: "short", year: "numeric" });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(iso: string) {
  return `${formatDate(iso)} ${formatTime(iso)}`;
}

/** Pill de estado del recordatorio: pendiente, ya enviado, o guardado pero sin cron. */
function ReminderBadge({ reminder }: { reminder: Reminder }) {
  if (reminder.sent_at) {
    return (
      <span
        title={`Recordatorio ya enviado (${formatDateTime(reminder.sent_at)})`}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full"
      >
        ✅ Enviado
      </span>
    );
  }
  if (reminder.cron_job_id) {
    return (
      <span
        title={`Recordatorio programado para ${formatDateTime(reminder.remind_at)}`}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-electric-cyan bg-electric-cyan/10 px-2 py-0.5 rounded-full"
      >
        🔔 Programado
      </span>
    );
  }
  return (
    <span
      title={`Recordatorio guardado para ${formatDateTime(reminder.remind_at)}, pero sin aviso automático (OpenClaw no configurado o falló)`}
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/40 bg-white/5 px-2 py-0.5 rounded-full"
    >
      🔕 Sin aviso
    </span>
  );
}

function NewEventForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [crearRecordatorio, setCrearRecordatorio] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const createEvent = useMutation({
    mutationFn: api.createEvent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "No se pudo crear el evento"),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim() || !date || !time) {
      setError("Completa nombre, fecha y hora.");
      return;
    }
    const starts_at = `${date}T${time}:00${CR_OFFSET}`;
    createEvent.mutate({ title, description: description.trim() || undefined, starts_at, crearRecordatorio });
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-20">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm border border-electric-cyan/20 bg-night-blue rounded-2xl p-6 flex flex-col gap-3 shadow-[0_0_60px_-15px_rgba(0,210,255,0.25)]"
      >
        <h2 className="text-lg font-medium mb-1">Nuevo evento</h2>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-white/50">Nombre</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ej. Cita dentista"
            className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 placeholder:text-white/30 focus:outline-none focus:border-electric-cyan/70"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-white/50">Descripción</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Opcional"
            rows={2}
            className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 placeholder:text-white/30 focus:outline-none focus:border-electric-cyan/70 resize-none"
          />
        </div>

        <div className="flex gap-2">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-white/50">Fecha</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 focus:outline-none focus:border-electric-cyan/70 [color-scheme:dark]"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-white/50">Hora</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 focus:outline-none focus:border-electric-cyan/70 [color-scheme:dark]"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-white/70 mt-1">
          <input
            type="checkbox"
            checked={crearRecordatorio}
            onChange={(e) => setCrearRecordatorio(e.target.checked)}
            className="accent-electric-cyan"
          />
          Crear recordatorio (Quicks avisa 2 horas antes)
        </label>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-2 mt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-white/10 rounded-lg px-3 py-2 text-white/70 hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={createEvent.isPending}
            className="flex-1 bg-electric-cyan text-night-blue font-medium rounded-lg px-3 py-2 disabled:opacity-50 hover:brightness-110 transition"
          >
            {createEvent.isPending ? "Creando..." : "Crear evento"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function AgendaPage() {
  const [showForm, setShowForm] = useState(false);
  const { data: events, isLoading } = useQuery({ queryKey: ["events"], queryFn: api.listEvents });
  const { data: reminders } = useQuery({ queryKey: ["reminders"], queryFn: api.listReminders });

  const remindersByEvent = new Map<string, Reminder>();
  const looseReminders: Reminder[] = [];
  for (const reminder of reminders ?? []) {
    if (reminder.event_id) remindersByEvent.set(reminder.event_id, reminder);
    else looseReminders.push(reminder);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Agenda</h1>
          <p className="text-sm text-white/40">Tus eventos y recordatorios</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="bg-electric-cyan text-night-blue font-medium rounded-lg px-3 py-2 text-sm hover:brightness-110 transition"
        >
          + Crear evento
        </button>
      </div>

      <div className="bg-white/5 rounded-2xl shadow-sm border border-white/10 overflow-hidden">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/40 px-5 pt-5 pb-2">Eventos</p>

        {isLoading && <p className="text-white/40 text-sm px-5 pb-5">Cargando...</p>}

        {events && events.length === 0 && !isLoading && (
          <p className="text-white/40 text-sm px-5 pb-5">No hay eventos todavía.</p>
        )}

        {events && events.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/40 text-left">
                <th className="px-5 py-2 font-normal">Fecha</th>
                <th className="px-3 py-2 font-normal">Hora</th>
                <th className="px-3 py-2 font-normal">Evento</th>
                <th className="px-3 py-2 font-normal">Descripción</th>
                <th className="px-3 py-2 font-normal">Recordatorio</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event: Event) => {
                const reminder = remindersByEvent.get(event.id);
                return (
                  <tr key={event.id} className="border-t border-white/8 hover:bg-white/5 transition-colors">
                    <td className="px-5 py-3 whitespace-nowrap">{formatDate(event.starts_at)}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-electric-cyan">{formatTime(event.starts_at)}</td>
                    <td className="px-3 py-3 text-white/90">{event.title}</td>
                    <td className="px-3 py-3 text-white/50">{event.description ?? "—"}</td>
                    <td className="px-3 py-3">{reminder ? <ReminderBadge reminder={reminder} /> : <span className="text-white/30">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {looseReminders.length > 0 && (
        <div className="bg-white/5 rounded-2xl shadow-sm border border-white/10 overflow-hidden">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/40 px-5 pt-5 pb-2">
            Recordatorios sin evento
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/40 text-left">
                <th className="px-5 py-2 font-normal">Cuándo</th>
                <th className="px-3 py-2 font-normal">Título</th>
                <th className="px-3 py-2 font-normal">Estado</th>
              </tr>
            </thead>
            <tbody>
              {looseReminders.map((reminder) => (
                <tr key={reminder.id} className="border-t border-white/8 hover:bg-white/5 transition-colors">
                  <td className="px-5 py-3 whitespace-nowrap">{formatDateTime(reminder.remind_at)}</td>
                  <td className="px-3 py-3 text-white/90">{reminder.title}</td>
                  <td className="px-3 py-3">
                    <ReminderBadge reminder={reminder} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && <NewEventForm onClose={() => setShowForm(false)} />}
    </div>
  );
}
