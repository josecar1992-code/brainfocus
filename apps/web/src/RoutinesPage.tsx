import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type List, type NewRoutine, type Routine, type RoutineCompletion } from "./api";
import { CategorySelect } from "./CategorySelect";
import { ConfirmDialog } from "./ConfirmDialog";
import { CornerBrackets } from "./CornerBrackets";
import { IconRepeat } from "./icons";
import { OPTION_STYLE, SELECT_CLASS } from "./selectStyles";
import { useCompleteTask } from "./useCompleteTask";

const DAYS = [
  { value: 0, short: "D", label: "Domingo" },
  { value: 1, short: "L", label: "Lunes" },
  { value: 2, short: "M", label: "Martes" },
  { value: 3, short: "M", label: "Miércoles" },
  { value: 4, short: "J", label: "Jueves" },
  { value: 5, short: "V", label: "Viernes" },
  { value: 6, short: "S", label: "Sábado" },
];
const DAY_NAMES = DAYS.map((d) => d.label);

function describeRecurrence(r: Pick<Routine, "frequency" | "interval_weeks" | "days_of_week" | "time_of_day">) {
  const time = r.time_of_day.slice(0, 5);
  if (r.frequency === "daily") return `Todos los días, ${time}`;
  const days = [...r.days_of_week].sort().map((d) => DAY_NAMES[d]).join(", ") || "sin días elegidos";
  const cada = r.interval_weeks > 1 ? `Cada ${r.interval_weeks} semanas` : "Cada semana";
  return `${cada} (${days}), ${time}`;
}

function formatDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("es-CR", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString("es-CR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DayPicker({ value, onChange }: { value: number[]; onChange: (days: number[]) => void }) {
  return (
    <div className="flex gap-1.5">
      {DAYS.map((d) => {
        const active = value.includes(d.value);
        return (
          <button
            key={d.value}
            type="button"
            title={d.label}
            onClick={() => onChange(active ? value.filter((v) => v !== d.value) : [...value, d.value].sort())}
            className={`w-8 h-8 rounded-lg text-sm font-semibold transition-all ${
              active
                ? "bg-electric-cyan text-night-blue"
                : "bg-white/5 text-white/50 border border-white/10 hover:bg-white/10"
            }`}
          >
            {d.short}
          </button>
        );
      })}
    </div>
  );
}

function RoutineForm({
  lists,
  initial,
  onSubmit,
  onCancel,
  pending,
  error,
  submitLabel,
  lockStartDate,
}: {
  lists: List[];
  initial?: Partial<NewRoutine>;
  onSubmit: (input: NewRoutine) => void;
  onCancel: () => void;
  pending: boolean;
  error: string | null;
  submitLabel: string;
  /** En edición no tiene sentido tocar el ancla de paridad ya usada. */
  lockStartDate?: boolean;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [listId, setListId] = useState(initial?.list_id ?? "");
  const [frequency, setFrequency] = useState<NewRoutine["frequency"]>(initial?.frequency ?? "weekly");
  const [intervalWeeks, setIntervalWeeks] = useState(initial?.interval_weeks ?? 1);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(initial?.days_of_week ?? []);
  const [timeOfDay, setTimeOfDay] = useState(initial?.time_of_day?.slice(0, 5) ?? "");
  const [startDate, setStartDate] = useState(initial?.start_date ?? new Date().toISOString().slice(0, 10));
  const [crearRecordatorio, setCrearRecordatorio] = useState(initial?.crear_recordatorio ?? true);
  const [localError, setLocalError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (!title.trim()) return setLocalError("Ponele un nombre a la rutina.");
    if (!listId) return setLocalError("Elegí una categoría (o creá una nueva).");
    if (!timeOfDay) return setLocalError("Elegí una hora.");
    if (!startDate) return setLocalError("Elegí una fecha de inicio.");
    if (frequency === "weekly" && daysOfWeek.length === 0) return setLocalError("Elegí al menos un día de la semana.");

    onSubmit({
      title: title.trim(),
      list_id: listId,
      frequency,
      interval_weeks: frequency === "weekly" ? intervalWeeks : undefined,
      days_of_week: frequency === "weekly" ? daysOfWeek : undefined,
      time_of_day: timeOfDay,
      start_date: startDate,
      crear_recordatorio: crearRecordatorio,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-white/50">Nombre</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="ej. Sacar la basura"
          className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 placeholder:text-white/30 focus:outline-none focus:border-electric-cyan/70 transition"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-white/50">Categoría</label>
        <CategorySelect lists={lists} value={listId} onChange={setListId} />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-white/50">Frecuencia</label>
        <select
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as NewRoutine["frequency"])}
          className={SELECT_CLASS}
        >
          <option value="weekly" style={OPTION_STYLE}>
            Ciertos días de la semana
          </option>
          <option value="daily" style={OPTION_STYLE}>
            Todos los días
          </option>
        </select>
      </div>

      {frequency === "weekly" && (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/50">Días</label>
            <DayPicker value={daysOfWeek} onChange={setDaysOfWeek} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/50">Repetir cada</label>
            <select
              value={intervalWeeks}
              onChange={(e) => setIntervalWeeks(Number(e.target.value))}
              className={SELECT_CLASS}
            >
              <option value={1} style={OPTION_STYLE}>
                Toda semana
              </option>
              <option value={2} style={OPTION_STYLE}>
                Semana de por medio
              </option>
              <option value={3} style={OPTION_STYLE}>
                Cada 3 semanas
              </option>
              <option value={4} style={OPTION_STYLE}>
                Cada 4 semanas
              </option>
            </select>
          </div>
        </>
      )}

      <div className="flex flex-col sm:flex-row gap-3 sm:gap-2">
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs text-white/50">Hora</label>
          <input
            type="time"
            value={timeOfDay}
            onChange={(e) => setTimeOfDay(e.target.value)}
            className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 focus:outline-none focus:border-electric-cyan/70 [color-scheme:dark]"
          />
        </div>
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs text-white/50">Fecha de inicio</label>
          <input
            type="date"
            value={startDate}
            disabled={lockStartDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 focus:outline-none focus:border-electric-cyan/70 [color-scheme:dark] disabled:opacity-50"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-white/70">
        <input
          type="checkbox"
          checked={crearRecordatorio}
          onChange={(e) => setCrearRecordatorio(e.target.checked)}
          className="accent-electric-cyan"
        />
        Crear recordatorio (Quicks avisa justo a la hora de la rutina)
      </label>

      {(error || localError) && <p className="text-sm text-red-400">{error || localError}</p>}

      <div className="flex gap-2 mt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 border border-white/10 rounded-lg px-3 py-2 text-white/70 hover:bg-white/5"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 bg-gradient-to-br from-deep-blue via-electric-cyan to-electric-cyan text-night-blue font-semibold rounded-lg shadow-[0_0_18px_-4px_rgba(0,210,255,0.55)] px-3 py-2 disabled:opacity-50 hover:brightness-110 transition"
        >
          {pending ? "Guardando..." : submitLabel}
        </button>
      </div>
    </form>
  );
}

function NewRoutineModal({ lists, onClose }: { lists: List[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const createRoutine = useMutation({
    mutationFn: api.createRoutine,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routines"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "No se pudo crear la rutina"),
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-20 overflow-y-auto py-8">
      <div className="relative w-full max-w-sm border border-electric-cyan/20 bg-night-blue rounded-2xl p-6 shadow-[0_0_60px_-15px_rgba(0,210,255,0.25)]">
        <CornerBrackets />
        <h2 className="text-lg font-medium mb-3">Nueva rutina</h2>
        <RoutineForm
          lists={lists}
          onSubmit={(input) => {
            setError(null);
            createRoutine.mutate(input);
          }}
          onCancel={onClose}
          pending={createRoutine.isPending}
          error={error}
          submitLabel="Crear rutina"
        />
      </div>
    </div>
  );
}

function RoutineDetail({ routine, lists, onClose }: { routine: Routine; lists: List[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: history, isLoading: loadingHistory } = useQuery({
    queryKey: ["routine-completions", routine.id],
    queryFn: () => api.listRoutineCompletions(routine.id),
  });
  const { data: tasks } = useQuery({ queryKey: ["tasks"], queryFn: api.listTasks });
  const completeTask = useCompleteTask();
  const currentTask = routine.current_task_id ? tasks?.find((t) => t.id === routine.current_task_id) : undefined;

  const updateRoutine = useMutation({
    mutationFn: (input: NewRoutine) => api.updateRoutine(routine.id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routines"] });
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "No se pudo actualizar la rutina"),
  });

  const deleteRoutine = useMutation({
    mutationFn: () => api.deleteRoutine(routine.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routines"] });
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "No se pudo borrar la rutina"),
  });

  const list = routine.list_id ? lists.find((l) => l.id === routine.list_id) : undefined;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-20 overflow-y-auto py-8">
      <div className="relative w-full max-w-sm border border-electric-cyan/20 bg-night-blue rounded-2xl p-6 flex flex-col gap-3 shadow-[0_0_60px_-15px_rgba(0,210,255,0.25)]">
        <CornerBrackets />
        {editing ? (
          <>
            <h2 className="text-lg font-medium mb-1">Editar rutina</h2>
            <p className="text-xs text-white/40 -mt-2">
              Los cambios aplican desde la próxima ocurrencia — la tarea/evento ya pendiente no se toca.
            </p>
            <RoutineForm
              lists={lists}
              initial={{
                title: routine.title,
                list_id: routine.list_id ?? undefined,
                frequency: routine.frequency,
                interval_weeks: routine.interval_weeks,
                days_of_week: routine.days_of_week,
                time_of_day: routine.time_of_day,
                start_date: routine.start_date,
                crear_recordatorio: routine.crear_recordatorio,
              }}
              lockStartDate
              onSubmit={(input) => {
                setError(null);
                updateRoutine.mutate(input);
              }}
              onCancel={() => setEditing(false)}
              pending={updateRoutine.isPending}
              error={error}
              submitLabel="Guardar"
            />
          </>
        ) : (
          <>
            <h2 className="text-lg font-medium mb-1 text-white">{routine.title}</h2>
            <div className="flex items-center gap-2 flex-wrap">
              {list && (
                <span
                  className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: `${list.color ?? "#5B6B82"}22`, color: list.color ?? "#8FA3BF" }}
                >
                  {list.name}
                </span>
              )}
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-electric-cyan/10 text-electric-cyan">
                {describeRecurrence(routine)}
              </span>
            </div>
            {routine.current_occurrence_date && (
              <p className="text-sm text-white/60">
                Próxima ocurrencia pendiente: <span className="text-white/90">{formatDate(routine.current_occurrence_date)}</span>
              </p>
            )}
            {currentTask && (
              <label className="flex items-center gap-2 text-sm text-white/70">
                <input
                  type="checkbox"
                  checked={currentTask.status === "done"}
                  onChange={() => completeTask.request(currentTask)}
                  className="accent-electric-cyan w-4 h-4"
                />
                {currentTask.status === "done" ? "Marcada como hecha" : "Marcar como hecha"}
              </label>
            )}

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="grid grid-cols-3 gap-2">
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
                disabled={deleteRoutine.isPending}
                className="border border-red-400/40 text-red-400 rounded-lg px-2 py-2 text-sm hover:bg-red-400/10 transition disabled:opacity-50"
              >
                {deleteRoutine.isPending ? "..." : "Borrar"}
              </button>
            </div>

            <div className="border-t border-white/8 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/40 mb-2">Historial</p>
              {loadingHistory && <p className="text-white/40 text-sm">Cargando...</p>}
              {history && history.length === 0 && !loadingHistory && (
                <p className="text-white/40 text-sm">Todavía no se marcó ninguna ocurrencia como hecha.</p>
              )}
              {history && history.length > 0 && (
                <ul className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                  {history.map((h: RoutineCompletion) => (
                    <li key={h.id} className="text-sm text-white/70 bg-white/5 rounded-lg px-3 py-2">
                      {formatDateTime(h.completed_at)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          message={`¿Borrar la rutina "${routine.title}"? No se crearán más ocurrencias (la ya pendiente se mantiene como tarea suelta).`}
          pending={deleteRoutine.isPending}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => deleteRoutine.mutate()}
        />
      )}
      {completeTask.pendingTask && (
        <ConfirmDialog
          message={`¿Marcar "${completeTask.pendingTask.title}" como hecha? Esto crea la siguiente ocurrencia de la rutina.`}
          confirmLabel="Marcar hecha"
          pending={completeTask.isPending}
          onCancel={completeTask.cancel}
          onConfirm={completeTask.confirm}
        />
      )}
    </div>
  );
}

export function RoutinesPage() {
  const [showForm, setShowForm] = useState(false);
  const [selectedRoutine, setSelectedRoutine] = useState<Routine | null>(null);
  const { data: routines, isLoading } = useQuery({ queryKey: ["routines"], queryFn: api.listRoutines });
  const { data: lists } = useQuery({ queryKey: ["lists"], queryFn: api.listLists });
  const { data: tasks } = useQuery({ queryKey: ["tasks"], queryFn: api.listTasks });
  const completeTask = useCompleteTask();

  const listsById = new Map((lists ?? []).map((l) => [l.id, l]));
  const tasksById = new Map((tasks ?? []).map((t) => [t.id, t]));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-white">Rutinas</h1>
          <p className="text-sm text-white/40">Tareas repetitivas — se crean solas, una ocurrencia a la vez</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="bg-gradient-to-br from-deep-blue via-electric-cyan to-electric-cyan text-night-blue font-semibold rounded-lg shadow-[0_0_18px_-4px_rgba(0,210,255,0.55)] px-3 py-2 text-sm hover:brightness-110 transition flex-shrink-0"
        >
          + Crear rutina
        </button>
      </div>

      {isLoading && <p className="text-white/40 text-sm">Cargando...</p>}
      {routines && routines.length === 0 && !isLoading && (
        <div className="bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] p-5">
          <p className="text-white/40 text-sm">No hay rutinas todavía.</p>
        </div>
      )}

      {routines && routines.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {routines.map((r: Routine) => {
            const list = r.list_id ? listsById.get(r.list_id) : undefined;
            const currentTask = r.current_task_id ? tasksById.get(r.current_task_id) : undefined;
            return (
              <div
                key={r.id}
                className="bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] p-4 hover:bg-white/10 transition-colors flex items-start gap-2"
              >
                {currentTask && (
                  <input
                    type="checkbox"
                    checked={currentTask.status === "done"}
                    onChange={() => completeTask.request(currentTask)}
                    className="accent-electric-cyan w-4 h-4 flex-shrink-0 mt-0.5"
                  />
                )}
                <button type="button" onClick={() => setSelectedRoutine(r)} className="text-left flex items-start gap-2 min-w-0 flex-1">
                  <IconRepeat className="w-4 h-4 text-electric-cyan flex-shrink-0 mt-0.5" strokeWidth={1.75} />
                  <div className="min-w-0">
                    <p
                      className={`text-sm font-semibold ${currentTask?.status === "done" ? "line-through text-white/40" : "text-white/90"}`}
                    >
                      {r.title}
                    </p>
                    <p className="text-xs text-white/40 mt-1">{describeRecurrence(r)}</p>
                    {list && (
                      <span
                        className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-full mt-1.5"
                        style={{ backgroundColor: `${list.color ?? "#5B6B82"}22`, color: list.color ?? "#8FA3BF" }}
                      >
                        {list.name}
                      </span>
                    )}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showForm && <NewRoutineModal lists={lists ?? []} onClose={() => setShowForm(false)} />}
      {selectedRoutine && (
        <RoutineDetail routine={selectedRoutine} lists={lists ?? []} onClose={() => setSelectedRoutine(null)} />
      )}
      {completeTask.pendingTask && (
        <ConfirmDialog
          message={`¿Marcar "${completeTask.pendingTask.title}" como hecha? Esto crea la siguiente ocurrencia de la rutina.`}
          confirmLabel="Marcar hecha"
          pending={completeTask.isPending}
          onCancel={completeTask.cancel}
          onConfirm={completeTask.confirm}
        />
      )}
    </div>
  );
}
