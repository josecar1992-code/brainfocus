import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CR_OFFSET, CR_TIMEZONE } from "@brainfocus/shared-time";
import { api, type Task } from "./api";
import { CategoryBadge } from "./CategoryBadge";
import { ProjectBadge } from "./ProjectBadge";
import { PriorityBadge } from "./PriorityBadge";
import { TaskDetail } from "./TasksPage";

type QuickFilter = "hoy" | "ayer" | "semana" | "rango";

// Mismo día calendario Costa Rica que el resto de la app (00:00 a 24:00 CR,
// corte 06:00Z-06:00Z en UTC) — construido con offset explícito, nunca con
// la hora del navegador (ver CLAUDE.md). `dateStr` es "YYYY-MM-DD".
function dayStartIsoCR(dateStr: string) {
  return `${dateStr}T00:00:00${CR_OFFSET}`;
}
function dayEndIsoCR(dateStr: string) {
  return `${dateStr}T23:59:59.999${CR_OFFSET}`;
}

function todayCR(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CR_TIMEZONE }).format(new Date());
}

function addDaysToDateStr(dateStr: string, days: number): string {
  // "YYYY-MM-DD" no lleva hora, así que sumar/restar días con Date normal (UTC
  // implícito en el parseo "YYYY-MM-DD") no se desfasa por zona horaria —
  // el resultado también se formatea de vuelta como "YYYY-MM-DD" sin tocar hora.
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatCompletedAt(iso: string) {
  return new Date(iso).toLocaleString("es-CR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: CR_TIMEZONE,
  });
}

export function ResumenPage() {
  const today = useMemo(() => todayCR(), []);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("hoy");
  const [rangeDesde, setRangeDesde] = useState(today);
  const [rangeHasta, setRangeHasta] = useState(today);
  const [openTask, setOpenTask] = useState<Task | null>(null);

  const { desde, hasta } = useMemo(() => {
    if (quickFilter === "hoy") return { desde: today, hasta: today };
    if (quickFilter === "ayer") {
      const ayer = addDaysToDateStr(today, -1);
      return { desde: ayer, hasta: ayer };
    }
    if (quickFilter === "semana") return { desde: addDaysToDateStr(today, -6), hasta: today };
    return { desde: rangeDesde || today, hasta: rangeHasta || today };
  }, [quickFilter, today, rangeDesde, rangeHasta]);

  const { data: lists } = useQuery({ queryKey: ["lists"], queryFn: api.listLists });
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });
  const { data: tasks, isLoading } = useQuery({
    queryKey: ["tasks", "completadas", desde, hasta],
    queryFn: () => api.listCompletedTasks({ desdeIso: dayStartIsoCR(desde), hastaIso: dayEndIsoCR(hasta) }),
  });

  const listsById = new Map((lists ?? []).map((l) => [l.id, l]));
  const projectsById = new Map((projects ?? []).map((p) => [p.id, p]));

  const sorted = useMemo(
    () => [...(tasks ?? [])].sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime()),
    [tasks],
  );

  const rangeLabel =
    desde === hasta
      ? new Date(dayStartIsoCR(desde)).toLocaleDateString("es-CR", {
          weekday: "long",
          day: "2-digit",
          month: "long",
          timeZone: CR_TIMEZONE,
        })
      : `${desde} a ${hasta}`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Resumen</h1>
        <p className="text-sm text-white/40 capitalize">Tareas completadas · {rangeLabel}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { key: "hoy", label: "Hoy" },
            { key: "ayer", label: "Ayer" },
            { key: "semana", label: "Últimos 7 días" },
            { key: "rango", label: "Rango de fechas" },
          ] as { key: QuickFilter; label: string }[]
        ).map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => setQuickFilter(o.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-150 ${
              quickFilter === o.key
                ? "bg-electric-cyan text-night-blue"
                : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10"
            }`}
          >
            {o.label}
          </button>
        ))}
        {quickFilter === "rango" && (
          <div className="flex items-center gap-2 ml-1">
            <input
              type="date"
              value={rangeDesde}
              onChange={(e) => setRangeDesde(e.target.value)}
              className="border border-deep-blue/40 bg-black/20 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-electric-cyan/70 [color-scheme:dark]"
            />
            <span className="text-white/40 text-sm">a</span>
            <input
              type="date"
              value={rangeHasta}
              onChange={(e) => setRangeHasta(e.target.value)}
              className="border border-deep-blue/40 bg-black/20 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-electric-cyan/70 [color-scheme:dark]"
            />
          </div>
        )}
      </div>

      {isLoading && <p className="text-white/40 text-sm">Cargando...</p>}

      {!isLoading && sorted.length === 0 && (
        <div className="bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] p-5">
          <p className="text-white/40 text-sm">No marcaste ninguna tarea como hecha en este rango.</p>
        </div>
      )}

      {!isLoading && sorted.length > 0 && (
        <div className="bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] divide-y divide-white/5">
          <p className="px-4 pt-3 pb-1 text-xs text-white/40 font-medium uppercase tracking-wide">
            {sorted.length} {sorted.length === 1 ? "tarea completada" : "tareas completadas"}
          </p>
          {sorted.map((task) => {
            const list = task.list_id ? (listsById.get(task.list_id) ?? null) : null;
            const project = task.project_id ? (projectsById.get(task.project_id) ?? null) : null;
            return (
              <button
                key={task.id}
                type="button"
                onClick={() => setOpenTask(task)}
                className="w-full text-left flex items-start justify-between gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm text-white/90 font-medium line-through decoration-white/30 truncate">
                    {task.title}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    {list && <CategoryBadge list={list} />}
                    {project && <ProjectBadge project={project} />}
                    <PriorityBadge priority={task.priority} />
                  </div>
                </div>
                <span className="text-xs text-white/35 flex-shrink-0 whitespace-nowrap capitalize">
                  {formatCompletedAt(task.completed_at!)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {openTask && (
        <TaskDetail task={openTask} lists={lists ?? []} projects={projects ?? []} onClose={() => setOpenTask(null)} />
      )}
    </div>
  );
}
