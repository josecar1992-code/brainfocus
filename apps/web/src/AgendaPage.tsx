import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, canRemindTwoHoursBefore, type Event, type List, type Reminder, type Task } from "./api";
import { CategorySelect } from "./CategorySelect";
import { ConfirmDialog } from "./ConfirmDialog";
import { CornerBrackets } from "./CornerBrackets";
import { IconBell, IconBellOff, IconCheckCircle } from "./icons";
import { RoutineBadge } from "./RoutineBadge";
import { OPTION_STYLE, PRIORITIES, SELECT_CLASS } from "./selectStyles";
import { StatusFilterTabs, type StatusFilter } from "./StatusFilterTabs";
import { TimePicker } from "./TimePicker";
import { useCompleteTask } from "./useCompleteTask";

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
function ReminderBadge({ reminder, iconOnly }: { reminder: Reminder; iconOnly?: boolean }) {
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

function NewEventForm({ lists, onClose }: { lists: List[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [listId, setListId] = useState("");
  const [priority, setPriority] = useState<Task["priority"]>("normal");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [crearRecordatorio, setCrearRecordatorio] = useState(true);
  const [crearRecordatorioHoraEvento, setCrearRecordatorioHoraEvento] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const puedeAvisar2h = canRemindTwoHoursBefore(date, time);

  const createEvent = useMutation({
    mutationFn: api.createEvent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
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
    if (!listId) {
      setError("Elegí una categoría (o creá una nueva).");
      return;
    }
    const starts_at = `${date}T${time}:00${CR_OFFSET}`;
    createEvent.mutate({
      title,
      description: description.trim() || undefined,
      starts_at,
      list_id: listId,
      priority,
      crearRecordatorio: puedeAvisar2h && crearRecordatorio,
      crearRecordatorioHoraEvento,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-20">
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-sm border border-electric-cyan/20 bg-night-blue rounded-2xl p-6 flex flex-col gap-3 shadow-[0_0_60px_-15px_rgba(0,210,255,0.25)]"
      >
        <CornerBrackets />
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

        <div className="flex flex-col sm:flex-row gap-3 sm:gap-2">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-white/50">Categoría</label>
            <CategorySelect lists={lists} value={listId} onChange={setListId} />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-white/50">Prioridad</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as Task["priority"])} className={SELECT_CLASS}>
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value} style={OPTION_STYLE}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
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
            <TimePicker value={time} onChange={setTime} />
          </div>
        </div>

        {puedeAvisar2h && (
          <label className="flex items-center gap-2 text-sm text-white/70 mt-1">
            <input
              type="checkbox"
              checked={crearRecordatorio}
              onChange={(e) => setCrearRecordatorio(e.target.checked)}
              className="accent-electric-cyan"
            />
            Avisar 2 horas antes
          </label>
        )}
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input
            type="checkbox"
            checked={crearRecordatorioHoraEvento}
            onChange={(e) => setCrearRecordatorioHoraEvento(e.target.checked)}
            className="accent-electric-cyan"
          />
          Avisar a la hora del evento
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
            className="flex-1 bg-gradient-to-br from-deep-blue via-electric-cyan to-electric-cyan text-night-blue font-semibold rounded-lg shadow-[0_0_18px_-4px_rgba(0,210,255,0.55)] px-3 py-2 disabled:opacity-50 hover:brightness-110 transition"
          >
            {createEvent.isPending ? "Creando..." : "Crear evento"}
          </button>
        </div>
      </form>
    </div>
  );
}

function EventDetail({
  event,
  reminder,
  task,
  onToggleDone,
  onClose,
}: {
  event: Event;
  reminder?: Reminder;
  task?: Task;
  onToggleDone?: (task: Task) => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const start = new Date(event.starts_at);
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description ?? "");
  const [date, setDate] = useState(start.toISOString().slice(0, 10));
  const [time, setTime] = useState(start.toISOString().slice(11, 16));
  const [error, setError] = useState<string | null>(null);

  const updateEvent = useMutation({
    mutationFn: () =>
      api.updateEvent(event.id, {
        title,
        description: description.trim() || undefined,
        starts_at: `${date}T${time}:00${CR_OFFSET}`,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "No se pudo actualizar el evento"),
  });

  const deleteEvent = useMutation({
    mutationFn: () => api.deleteEvent(event.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "No se pudo borrar el evento"),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim() || !date || !time) {
      setError("Completa nombre, fecha y hora.");
      return;
    }
    updateEvent.mutate();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-20">
      <div className="relative w-full max-w-sm border border-electric-cyan/20 bg-night-blue rounded-2xl p-6 flex flex-col gap-3 shadow-[0_0_60px_-15px_rgba(0,210,255,0.25)]">
        <CornerBrackets />
        {editing ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <h2 className="text-lg font-medium mb-1">Editar evento</h2>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/50">Nombre</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 focus:outline-none focus:border-electric-cyan/70"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/50">Descripción</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 focus:outline-none focus:border-electric-cyan/70 resize-none"
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
                <TimePicker value={time} onChange={setTime} />
              </div>
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="flex-1 border border-white/10 rounded-lg px-3 py-2 text-white/70 hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={updateEvent.isPending}
                className="flex-1 bg-gradient-to-br from-deep-blue via-electric-cyan to-electric-cyan text-night-blue font-semibold rounded-lg shadow-[0_0_18px_-4px_rgba(0,210,255,0.55)] px-3 py-2 disabled:opacity-50 hover:brightness-110 transition"
              >
                {updateEvent.isPending ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <h2 className={`text-lg font-medium mb-1 text-white ${task?.status === "done" ? "line-through text-white/40" : ""}`}>
              {event.title}
            </h2>
            {task?.routine_id && (
              <div className="mb-1">
                <RoutineBadge />
              </div>
            )}
            <p className="text-sm text-electric-cyan">
              {formatDate(event.starts_at)} · {formatTime(event.starts_at)}
            </p>
            {task && onToggleDone && (
              <label className="flex items-center gap-2 text-sm text-white/70">
                <input
                  type="checkbox"
                  checked={task.status === "done"}
                  onChange={() => onToggleDone(task)}
                  className="accent-electric-cyan w-4 h-4"
                />
                {task.status === "done" ? "Marcada como hecha" : "Marcar como hecha"}
              </label>
            )}
            {event.description && <p className="text-sm text-white/60 whitespace-pre-wrap">{event.description}</p>}
            {reminder && (
              <div className="mt-1">
                <ReminderBadge reminder={reminder} />
              </div>
            )}
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="grid grid-cols-3 gap-2 mt-3">
              <button
                type="button"
                onClick={onClose}
                className="border border-white/10 rounded-lg px-2 py-2 text-sm text-white/70 hover:bg-white/5"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="border border-electric-cyan/40 text-electric-cyan rounded-lg px-2 py-2 text-sm hover:bg-electric-cyan/10 transition"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                disabled={deleteEvent.isPending}
                className="border border-red-400/40 text-red-400 rounded-lg px-2 py-2 text-sm hover:bg-red-400/10 transition disabled:opacity-50"
              >
                {deleteEvent.isPending ? "..." : "Borrar"}
              </button>
            </div>
          </>
        )}
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          message={`¿Borrar "${event.title}"? Esto también cancela el recordatorio.`}
          pending={deleteEvent.isPending}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => deleteEvent.mutate()}
        />
      )}
    </div>
  );
}

type DateFilter = "hoy" | "semana" | "proxima_semana" | "mes" | "rango";

function startOfDay(d: Date) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function startOfWeek(d: Date) {
  // Semana empieza lunes.
  const r = startOfDay(d);
  const day = r.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  r.setDate(r.getDate() + diff);
  return r;
}

function toDateInputValue(d: Date) {
  return d.toISOString().slice(0, 10);
}

function DateFilterBar({
  filter,
  onFilter,
  rangeStart,
  rangeEnd,
  onRangeStart,
  onRangeEnd,
}: {
  filter: DateFilter;
  onFilter: (f: DateFilter) => void;
  rangeStart: string;
  rangeEnd: string;
  onRangeStart: (v: string) => void;
  onRangeEnd: (v: string) => void;
}) {
  const options: { key: DateFilter; label: string }[] = [
    { key: "hoy", label: "Hoy" },
    { key: "semana", label: "Esta semana" },
    { key: "proxima_semana", label: "Próxima semana" },
    { key: "mes", label: "Este mes" },
    { key: "rango", label: "Rango de fechas" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onFilter(o.key)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-150 ${
            filter === o.key
              ? "bg-electric-cyan text-night-blue"
              : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10"
          }`}
        >
          {o.label}
        </button>
      ))}
      {filter === "rango" && (
        <div className="flex items-center gap-2 ml-1">
          <input
            type="date"
            value={rangeStart}
            onChange={(e) => onRangeStart(e.target.value)}
            className="border border-deep-blue/40 bg-black/20 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-electric-cyan/70 [color-scheme:dark]"
          />
          <span className="text-white/40 text-sm">a</span>
          <input
            type="date"
            value={rangeEnd}
            onChange={(e) => onRangeEnd(e.target.value)}
            className="border border-deep-blue/40 bg-black/20 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-electric-cyan/70 [color-scheme:dark]"
          />
        </div>
      )}
    </div>
  );
}

export function AgendaPage() {
  const [showForm, setShowForm] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>("hoy");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pendientes");
  const now = new Date();
  const [rangeStart, setRangeStart] = useState(toDateInputValue(startOfWeek(now)));
  const [rangeEnd, setRangeEnd] = useState(
    toDateInputValue(new Date(startOfWeek(now).getTime() + 6 * 24 * 60 * 60 * 1000)),
  );
  const { data: allEvents, isLoading } = useQuery({ queryKey: ["events"], queryFn: api.listEvents });
  const { data: reminders } = useQuery({ queryKey: ["reminders"], queryFn: api.listReminders });
  const { data: tasks } = useQuery({ queryKey: ["tasks"], queryFn: api.listTasks });
  const { data: lists } = useQuery({ queryKey: ["lists"], queryFn: api.listLists });
  const completeTask = useCompleteTask();

  const tasksById = new Map((tasks ?? []).map((t) => [t.id, t]));
  const remindersByEvent = new Map<string, Reminder>();
  const looseReminders: Reminder[] = [];
  for (const reminder of reminders ?? []) {
    if (reminder.event_id) remindersByEvent.set(reminder.event_id, reminder);
    else looseReminders.push(reminder);
  }

  let rangeFrom: Date;
  let rangeTo: Date;
  if (dateFilter === "hoy") {
    rangeFrom = startOfDay(now);
    rangeTo = new Date(rangeFrom.getTime() + 24 * 60 * 60 * 1000);
  } else if (dateFilter === "semana") {
    rangeFrom = startOfWeek(now);
    rangeTo = new Date(rangeFrom.getTime() + 7 * 24 * 60 * 60 * 1000);
  } else if (dateFilter === "proxima_semana") {
    rangeFrom = new Date(startOfWeek(now).getTime() + 7 * 24 * 60 * 60 * 1000);
    rangeTo = new Date(rangeFrom.getTime() + 7 * 24 * 60 * 60 * 1000);
  } else if (dateFilter === "mes") {
    rangeFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    rangeTo = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  } else {
    rangeFrom = rangeStart ? startOfDay(new Date(`${rangeStart}T00:00:00`)) : startOfDay(now);
    rangeTo = rangeEnd
      ? new Date(startOfDay(new Date(`${rangeEnd}T00:00:00`)).getTime() + 24 * 60 * 60 * 1000)
      : new Date(rangeFrom.getTime() + 24 * 60 * 60 * 1000);
  }

  const events = (allEvents ?? [])
    .filter((e) => {
      const t = new Date(e.starts_at).getTime();
      return t >= rangeFrom.getTime() && t < rangeTo.getTime();
    })
    .filter((e) => {
      // Sin tarea vinculada no hay "hecho" que mostrar — se cuenta como pendiente.
      const status = e.task_id ? tasksById.get(e.task_id)?.status : undefined;
      const done = status === "done";
      return statusFilter === "hechas" ? done : !done;
    })
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-white">Agenda</h1>
          <p className="text-sm text-white/40">Tus eventos y recordatorios</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="bg-gradient-to-br from-deep-blue via-electric-cyan to-electric-cyan text-night-blue font-semibold rounded-lg shadow-[0_0_18px_-4px_rgba(0,210,255,0.55)] px-3 py-2 text-sm hover:brightness-110 transition flex-shrink-0"
        >
          + Crear evento
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StatusFilterTabs value={statusFilter} onChange={setStatusFilter} />
        <DateFilterBar
          filter={dateFilter}
          onFilter={setDateFilter}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          onRangeStart={setRangeStart}
          onRangeEnd={setRangeEnd}
        />
      </div>

      <div className="bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] overflow-hidden">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/40 px-5 pt-5 pb-2">Eventos</p>

        {isLoading && <p className="text-white/40 text-sm px-5 pb-5">Cargando...</p>}

        {events.length === 0 && !isLoading && (
          <p className="text-white/40 text-sm px-5 pb-5">No hay eventos en este rango.</p>
        )}

        {events.length > 0 && (
          <>
            {/* Escritorio/tablet: tabla. En móvil amontonaba fecha+hora+evento+recordatorio
                en columnas angostas, así que ahí se usa una lista de filas en su lugar. */}
            <table className="w-full text-sm hidden md:table">
              <thead>
                <tr className="text-white/40 text-left">
                  <th className="px-5 py-2 font-normal">Fecha</th>
                  <th className="px-3 py-2 font-normal">Hora</th>
                  <th className="px-3 py-2 font-normal">Evento</th>
                  <th className="px-3 py-2 font-normal">Recordatorio</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event: Event) => {
                  const reminder = remindersByEvent.get(event.id);
                  const task = event.task_id ? tasksById.get(event.task_id) : undefined;
                  return (
                    <tr
                      key={event.id}
                      onClick={() => setSelectedEvent(event)}
                      className="border-t border-white/8 hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <td className="px-5 py-3 whitespace-nowrap">{formatDate(event.starts_at)}</td>
                      <td className="px-3 py-3 whitespace-nowrap text-electric-cyan">{formatTime(event.starts_at)}</td>
                      <td className="px-3 py-3 text-white/90">
                        <div className="flex items-center gap-2">
                          {task && (
                            <input
                              type="checkbox"
                              checked={task.status === "done"}
                              onChange={() => completeTask.request(task)}
                              onClick={(e) => e.stopPropagation()}
                              className="accent-electric-cyan w-4 h-4 flex-shrink-0"
                            />
                          )}
                          <span className={task?.status === "done" ? "line-through text-white/30" : ""}>
                            {event.title}
                          </span>
                          {task?.routine_id && <RoutineBadge />}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {reminder ? <ReminderBadge reminder={reminder} /> : <span className="text-white/30">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <ul className="md:hidden divide-y divide-white/8">
              {events.map((event: Event) => {
                const reminder = remindersByEvent.get(event.id);
                const task = event.task_id ? tasksById.get(event.task_id) : undefined;
                return (
                  <li key={event.id} className="flex items-center gap-2 px-4 py-3">
                    {task && (
                      <input
                        type="checkbox"
                        checked={task.status === "done"}
                        onChange={() => completeTask.request(task)}
                        className="accent-electric-cyan w-4 h-4 flex-shrink-0"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedEvent(event)}
                      className="flex-1 flex items-center gap-3 text-left active:bg-white/5 min-w-0"
                    >
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="w-12 text-[11px] text-white/40 uppercase text-center">
                          {formatDate(event.starts_at)}
                        </span>
                        <span className="w-11 text-xs font-semibold text-electric-cyan text-center">
                          {formatTime(event.starts_at)}
                        </span>
                      </div>
                      <p
                        className={`flex-1 min-w-0 text-sm truncate ${task?.status === "done" ? "line-through text-white/30" : "text-white/90"}`}
                      >
                        {event.title}
                      </p>
                      {task?.routine_id && <RoutineBadge iconOnly />}
                      {reminder && <ReminderBadge reminder={reminder} iconOnly />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {looseReminders.length > 0 && (
        <div className="bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] overflow-hidden">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/40 px-5 pt-5 pb-2">
            Recordatorios sin evento
          </p>
          <table className="w-full text-sm hidden md:table">
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

          <ul className="md:hidden divide-y divide-white/8">
            {looseReminders.map((reminder) => (
              <li key={reminder.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-[11px] text-white/40">{formatDateTime(reminder.remind_at)}</span>
                  <span className="text-sm text-white/90 truncate">{reminder.title}</span>
                </div>
                <ReminderBadge reminder={reminder} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {showForm && <NewEventForm lists={lists ?? []} onClose={() => setShowForm(false)} />}
      {selectedEvent && (
        <EventDetail
          event={selectedEvent}
          reminder={remindersByEvent.get(selectedEvent.id)}
          task={selectedEvent.task_id ? tasksById.get(selectedEvent.task_id) : undefined}
          onToggleDone={(task) => completeTask.request(task)}
          onClose={() => setSelectedEvent(null)}
        />
      )}
      {completeTask.pendingTask && (
        <ConfirmDialog
          message={`¿Marcar "${completeTask.pendingTask.title}" como hecha?`}
          confirmLabel="Marcar hecha"
          variant="success"
          pending={completeTask.isPending}
          onCancel={completeTask.cancel}
          onConfirm={completeTask.confirm}
        />
      )}
    </div>
  );
}
