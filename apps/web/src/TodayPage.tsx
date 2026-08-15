import { useQuery } from "@tanstack/react-query";
import { api, type Routine, type Task } from "./api";
import { ConfirmDialog } from "./ConfirmDialog";
import { IconAlertTriangle, IconCalendar, IconCheckSquare, IconRepeat } from "./icons";
import { PriorityBadge } from "./PriorityBadge";
import { QuickBadge } from "./QuickBadge";
import { useCompleteTask } from "./useCompleteTask";

// Misma idea que toDateInputValue en TasksPage.tsx: convierte un timestamptz
// (UTC) a la fecha calendario de Costa Rica, para comparar contra "hoy" sin
// que el corte de medianoche se corra por la zona horaria del navegador.
function toCRDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" });
}

function formatOverdueDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-CR", { day: "2-digit", month: "short", timeZone: "America/Costa_Rica" });
}

function SectionHeader({
  icon: Icon,
  title,
  count,
  tone = "cyan",
}: {
  icon: typeof IconCalendar;
  title: string;
  count: number;
  tone?: "cyan" | "amber";
}) {
  return (
    <div className="flex items-center gap-2 px-5 pt-5 pb-2">
      <Icon
        className={`w-4 h-4 flex-shrink-0 ${tone === "amber" ? "text-amber-400/80" : "text-electric-cyan/70"}`}
        strokeWidth={1.75}
      />
      <p className="text-xs font-semibold uppercase tracking-wide text-white/40">{title}</p>
      <span className="text-[11px] text-white/30">({count})</span>
    </div>
  );
}

export function TodayPage() {
  const { data: tasks, isLoading: loadingTasks } = useQuery({ queryKey: ["tasks"], queryFn: api.listTasks });
  const { data: events, isLoading: loadingEvents } = useQuery({ queryKey: ["events"], queryFn: api.listEvents });
  const { data: routines, isLoading: loadingRoutines } = useQuery({
    queryKey: ["routines"],
    queryFn: api.listRoutines,
  });
  const completeTask = useCompleteTask();

  const todayCR = new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });

  const eventsToday = (events ?? [])
    .filter((e) => toCRDate(e.starts_at) === todayCR)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  const eventTaskIds = new Set(eventsToday.map((e) => e.task_id).filter(Boolean));

  // Tareas que vencen hoy y NO tienen ya su propio evento hoy (ese caso ya se
  // ve en "Eventos de hoy" — mostrarlo dos veces sería ruido).
  const tasksToday = (tasks ?? [])
    .filter((t) => t.due_date && toCRDate(t.due_date) === todayCR && t.status !== "done" && !eventTaskIds.has(t.id))
    .sort((a, b) => new Date(a.due_date as string).getTime() - new Date(b.due_date as string).getTime());

  // Tareas con fecha límite ya pasada (antes de hoy) y sin marcar como hechas
  // — antes solo se veían entrando a su categoría, quedaban "invisibles" acá.
  // Igual que tasksToday: si la tarea tiene un evento hoy, ya se ve en
  // "Eventos de hoy" — no duplicarla acá aunque su due_date sea de otro día
  // (puede pasar si el evento se reagendó para hoy pero la tarea conserva su
  // due_date original vencido).
  const tasksOverdue = (tasks ?? [])
    .filter((t) => t.due_date && toCRDate(t.due_date) < todayCR && t.status !== "done" && !eventTaskIds.has(t.id))
    .sort((a, b) => new Date(a.due_date as string).getTime() - new Date(b.due_date as string).getTime());

  // Toda ocurrencia de rutina crea SIEMPRE tarea + evento juntos (ver
  // createOccurrence en apps/api/src/services/routines.ts) — si el evento de
  // hoy ya se está mostrando en "Eventos de hoy", no repetir la rutina acá
  // (ese era justo el bug: "sacar la basura" salía duplicado, una vez como
  // evento y otra como rutina, siendo la misma ocurrencia).
  const routinesToday = (routines ?? []).filter(
    (r: Routine) => r.current_occurrence_date === todayCR && !(r.current_task_id && eventTaskIds.has(r.current_task_id)),
  );

  const tasksById = new Map((tasks ?? []).map((t) => [t.id, t]));
  const isLoading = loadingTasks || loadingEvents || loadingRoutines;
  const nothingToday =
    eventsToday.length === 0 && tasksToday.length === 0 && routinesToday.length === 0 && tasksOverdue.length === 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Hoy</h1>
        <p className="text-sm text-white/40">
          {new Date().toLocaleDateString("es-CR", {
            weekday: "long",
            day: "2-digit",
            month: "long",
            timeZone: "America/Costa_Rica",
          })}
        </p>
      </div>

      {isLoading && <p className="text-white/40 text-sm">Cargando...</p>}

      {!isLoading && nothingToday && (
        <div className="bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] p-6 text-center">
          <p className="text-white/50 text-sm">Nada pendiente para hoy.</p>
        </div>
      )}

      {tasksOverdue.length > 0 && (
        <div className="bg-night-blue/40 backdrop-blur-md rounded-2xl border border-amber-400/20 shadow-[0_0_40px_-24px_rgba(251,191,36,0.35)] overflow-hidden">
          <SectionHeader icon={IconAlertTriangle} title="Tareas atrasadas" count={tasksOverdue.length} tone="amber" />
          <ul>
            {tasksOverdue.map((task: Task) => (
              <li key={task.id} className="px-5 py-3 border-t border-white/8 first:border-t-0 flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={task.status === "done"}
                  onChange={() => completeTask.request(task)}
                  className="accent-electric-cyan w-4 h-4 flex-shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-white/90">{task.title}</span>
                    <PriorityBadge priority={task.priority} />
                    {task.created_by === "agent" && <QuickBadge iconOnly />}
                  </div>
                  <p className="text-[11px] text-amber-400/80 mt-0.5">
                    Venció el {formatOverdueDate(task.due_date as string)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {eventsToday.length > 0 && (
        <div className="bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] overflow-hidden">
          <SectionHeader icon={IconCalendar} title="Eventos de hoy" count={eventsToday.length} />
          <ul>
            {eventsToday.map((event) => {
              const linkedTask = event.task_id ? tasksById.get(event.task_id) : undefined;
              return (
                <li
                  key={event.id}
                  className="px-5 py-3 border-t border-white/8 first:border-t-0 flex items-center gap-3"
                >
                  {linkedTask && (
                    <input
                      type="checkbox"
                      checked={linkedTask.status === "done"}
                      onChange={() => completeTask.request(linkedTask)}
                      className="accent-electric-cyan w-4 h-4 flex-shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-sm ${linkedTask?.status === "done" ? "line-through text-white/30" : "text-white/90"}`}
                      >
                        {event.title}
                      </span>
                      {linkedTask && <PriorityBadge priority={linkedTask.priority} />}
                      {event.created_by === "agent" && <QuickBadge iconOnly />}
                    </div>
                    <p className="text-[11px] text-electric-cyan/80 mt-0.5">{formatTime(event.starts_at)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {tasksToday.length > 0 && (
        <div className="bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] overflow-hidden">
          <SectionHeader icon={IconCheckSquare} title="Tareas que vencen hoy" count={tasksToday.length} />
          <ul>
            {tasksToday.map((task: Task) => (
              <li key={task.id} className="px-5 py-3 border-t border-white/8 first:border-t-0 flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={task.status === "done"}
                  onChange={() => completeTask.request(task)}
                  className="accent-electric-cyan w-4 h-4 flex-shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-white/90">{task.title}</span>
                    <PriorityBadge priority={task.priority} />
                    {task.created_by === "agent" && <QuickBadge iconOnly />}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {routinesToday.length > 0 && (
        <div className="bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] overflow-hidden">
          <SectionHeader icon={IconRepeat} title="Rutinas de hoy" count={routinesToday.length} />
          <ul>
            {routinesToday.map((routine) => {
              const linkedTask = routine.current_task_id ? tasksById.get(routine.current_task_id) : undefined;
              return (
                <li
                  key={routine.id}
                  className="px-5 py-3 border-t border-white/8 first:border-t-0 flex items-center gap-3"
                >
                  {linkedTask && (
                    <input
                      type="checkbox"
                      checked={linkedTask.status === "done"}
                      onChange={() => completeTask.request(linkedTask)}
                      className="accent-electric-cyan w-4 h-4 flex-shrink-0"
                    />
                  )}
                  <span
                    className={`text-sm ${linkedTask?.status === "done" ? "line-through text-white/30" : "text-white/90"}`}
                  >
                    {routine.title}
                  </span>
                  <span className="text-[11px] text-white/40">{routine.time_of_day}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {completeTask.pendingTask && (
        <ConfirmDialog
          message={`¿Marcar "${completeTask.pendingTask.title}" como hecha?`}
          variant="success"
          confirmLabel="Marcar hecha"
          pending={completeTask.isPending}
          onCancel={completeTask.cancel}
          onConfirm={completeTask.confirm}
        />
      )}
    </div>
  );
}
