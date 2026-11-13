import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CR_OFFSET, CR_TIMEZONE } from "@brainfocus/shared-time";
import { NewEventForm } from "./AgendaPage";
import { api, type NewRecurringReminder } from "./api";
import { CornerBrackets } from "./CornerBrackets";
import { IconPlus } from "./icons";
import { NewRoutineModal } from "./RoutinesPage";
import { NewTaskModal } from "./TasksPage";

// Todo lo que está programado, junto: eventos de Agenda, tareas con fecha límite, recordatorios sueltos y avisos
// del módulo Asistente (únicos y recurrentes). Las rutinas ya aparecen a través de la tarea/evento de su próxima
// ocurrencia, así que no se expanden aparte. Todas las fechas se calculan en hora de Costa Rica (UTC-6 fijo), nunca
// en la zona horaria del navegador (ver CLAUDE.md).

type Kind = "evento" | "tarea" | "recordatorio" | "aviso" | "recurrente";

interface Item {
  key: string;
  kind: Kind;
  title: string;
  date: string; // YYYY-MM-DD en Costa Rica
  time: string | null; // HH:MM en Costa Rica
  done?: boolean;
  note?: string;
}

const KIND_STYLE: Record<Kind, { label: string; dot: string; chip: string }> = {
  evento: { label: "Evento", dot: "bg-electric-cyan", chip: "bg-electric-cyan/15 text-electric-cyan" },
  tarea: { label: "Tarea", dot: "bg-amber-400", chip: "bg-amber-400/15 text-amber-300" },
  recordatorio: { label: "Recordatorio", dot: "bg-fuchsia-400", chip: "bg-fuchsia-400/15 text-fuchsia-300" },
  aviso: { label: "Aviso Quicks", dot: "bg-emerald-400", chip: "bg-emerald-400/15 text-emerald-300" },
  recurrente: { label: "Recurrente", dot: "bg-sky-400", chip: "bg-sky-400/15 text-sky-300" },
};

const WEEKDAYS_SHORT = ["D", "L", "M", "M", "J", "V", "S"];
const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

function crDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: CR_TIMEZONE });
}
function crTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { timeZone: CR_TIMEZONE, hour: "2-digit", minute: "2-digit" });
}
function todayCR(): string {
  return crDate(new Date().toISOString());
}
// Día de la semana (0 = domingo) de una fecha YYYY-MM-DD, sin depender de la zona horaria del navegador.
function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00${CR_OFFSET}`).getUTCDay();
}
function longDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${WEEKDAYS[weekdayOf(date)]} ${d} de ${MONTHS[m - 1]}${y !== Number(todayCR().slice(0, 4)) ? ` de ${y}` : ""}`;
}

type CreateKind = "evento" | "tarea" | "aviso" | "rutina";

const inputClass =
  "border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 placeholder:text-white/30 focus:outline-none focus:border-electric-cyan/70 transition [color-scheme:dark]";

// Aviso del módulo Asistente (Quicks te escribe por WhatsApp/Telegram): único en una fecha/hora o recurrente.
function NewAvisoModal({ defaultDate, onClose }: { defaultDate: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [isInstruction, setIsInstruction] = useState(false);
  const [scheduleType, setScheduleType] = useState<NewRecurringReminder["schedule_type"]>("once");
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("09:00");
  const [frequency, setFrequency] = useState<NonNullable<NewRecurringReminder["frequency"]>>("daily");
  const [intervalHours, setIntervalHours] = useState("2");
  const [dayOfWeek, setDayOfWeek] = useState(String(weekdayOf(defaultDate)));
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: api.createRecurringReminder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring-reminders"] });
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "No se pudo crear el aviso"),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError(isInstruction ? "Escribe la instrucción para Quicks." : "Ponle un nombre al aviso.");
      return;
    }
    if (scheduleType === "once") {
      if (!date || !time) {
        setError("Elige la fecha y la hora.");
        return;
      }
      create.mutate({
        title: title.trim(),
        is_instruction: isInstruction,
        schedule_type: "once",
        scheduled_at: `${date}T${time}:00${CR_OFFSET}`,
      });
      return;
    }
    create.mutate({
      title: title.trim(),
      is_instruction: isInstruction,
      schedule_type: "recurring",
      frequency,
      interval_hours: frequency === "every_n_hours" ? Number(intervalHours) : undefined,
      time_of_day: frequency !== "every_n_hours" ? time : undefined,
      day_of_week: frequency === "weekly" ? Number(dayOfWeek) : undefined,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-20 overflow-y-auto py-8">
      <form
        onSubmit={submit}
        className="relative w-full max-w-sm border border-electric-cyan/20 bg-night-blue rounded-2xl p-6 flex flex-col gap-3 shadow-[0_0_60px_-15px_rgba(0,210,255,0.25)]"
      >
        <CornerBrackets />
        <h2 className="text-lg font-medium mb-1">Nuevo aviso de Quicks</h2>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={isInstruction ? "ej. Dame el tipo de cambio del bitcoin" : "ej. Tomar agua"}
          className={inputClass}
        />
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={isInstruction}
            onChange={(e) => setIsInstruction(e.target.checked)}
            className="accent-electric-cyan w-4 h-4 flex-shrink-0 mt-0.5"
          />
          <span className="text-sm text-white/80">Es una instrucción para Quicks (la ejecuta y te responde)</span>
        </label>
        <select
          value={scheduleType}
          onChange={(e) => setScheduleType(e.target.value as NewRecurringReminder["schedule_type"])}
          className={inputClass}
        >
          <option value="once">Una vez</option>
          <option value="recurring">Recurrente</option>
        </select>
        {scheduleType === "once" ? (
          <div className="flex gap-2">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputClass} flex-1`} />
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as NonNullable<NewRecurringReminder["frequency"]>)}
              className={inputClass}
            >
              <option value="every_n_hours">Cada N horas</option>
              <option value="daily">Todos los días</option>
              <option value="weekly">Un día de la semana</option>
            </select>
            {frequency === "every_n_hours" && (
              <input type="number" min={1} max={23} value={intervalHours} onChange={(e) => setIntervalHours(e.target.value)} className={inputClass} />
            )}
            {frequency === "weekly" && (
              <select value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)} className={inputClass}>
                {WEEKDAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            )}
            {frequency !== "every_n_hours" && (
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
            )}
          </div>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2 mt-1">
          <button type="button" onClick={onClose} className="text-sm text-white/40 hover:text-white/70 px-3 py-2">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={create.isPending}
            className="bg-gradient-to-br from-deep-blue via-electric-cyan to-electric-cyan text-night-blue font-semibold rounded-lg px-4 py-2 disabled:opacity-50 hover:brightness-110 transition"
          >
            {create.isPending ? "Creando..." : "Crear aviso"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function CalendarioPage() {
  const today = todayCR();
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [month, setMonth] = useState(Number(today.slice(5, 7)) - 1);
  const [selected, setSelected] = useState<string | null>(today);
  const [menuOpen, setMenuOpen] = useState(false);
  const [creating, setCreating] = useState<CreateKind | null>(null);

  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const monthStart = ymd(year, month, 1);
  const monthEnd = ymd(year, month, daysInMonth);
  const fromIso = `${monthStart}T00:00:00${CR_OFFSET}`;
  const toIso = `${monthEnd}T23:59:59${CR_OFFSET}`;

  const { data: events } = useQuery({ queryKey: ["events", "calendario", monthStart], queryFn: () => api.listEventsInRange(fromIso, toIso) });
  const { data: tasks } = useQuery({ queryKey: ["tasks", "calendario", monthStart], queryFn: () => api.listTasksDueBetween(fromIso, toIso) });
  const { data: reminders } = useQuery({ queryKey: ["reminders"], queryFn: api.listReminders });
  const { data: avisos } = useQuery({ queryKey: ["recurring-reminders"], queryFn: api.listRecurringReminders });
  const { data: lists } = useQuery({ queryKey: ["lists"], queryFn: api.listLists });
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });

  const itemsByDay = useMemo(() => {
    const map = new Map<string, Item[]>();
    const add = (item: Item) => {
      if (item.date < monthStart || item.date > monthEnd) return;
      map.set(item.date, [...(map.get(item.date) ?? []), item]);
    };

    for (const e of events ?? []) {
      add({ key: `e-${e.id}`, kind: "evento", title: e.title, date: crDate(e.starts_at), time: e.all_day ? null : crTime(e.starts_at), note: e.location ?? undefined });
    }
    for (const t of tasks ?? []) {
      if (!t.due_date) continue;
      const time = crTime(t.due_date);
      add({ key: `t-${t.id}`, kind: "tarea", title: t.title, date: crDate(t.due_date), time: time === "23:59" ? null : time, done: t.status === "done" });
    }
    // Recordatorios de eventos/tareas ya se ven a través de ellos: solo los sueltos.
    for (const r of reminders ?? []) {
      if (r.event_id || r.task_id) continue;
      add({ key: `r-${r.id}`, kind: "recordatorio", title: r.title, date: crDate(r.remind_at), time: crTime(r.remind_at), done: !!r.sent_at });
    }
    for (const a of avisos ?? []) {
      if (!a.active) continue;
      if (a.schedule_type === "once") {
        if (!a.scheduled_at) continue;
        add({ key: `a-${a.id}`, kind: "aviso", title: a.title, date: crDate(a.scheduled_at), time: crTime(a.scheduled_at), done: new Date(a.scheduled_at) <= new Date() });
        continue;
      }
      for (let d = 1; d <= daysInMonth; d++) {
        const date = ymd(year, month, d);
        if (a.frequency === "weekly" && weekdayOf(date) !== a.day_of_week) continue;
        add({
          key: `a-${a.id}-${date}`,
          kind: "recurrente",
          title: a.title,
          date,
          time: a.frequency === "every_n_hours" ? null : a.time_of_day?.slice(0, 5) ?? null,
          note: a.frequency === "every_n_hours" ? `Cada ${a.interval_hours} h` : undefined,
        });
      }
    }
    for (const list of map.values()) list.sort((x, y) => (x.time ?? "99:99").localeCompare(y.time ?? "99:99"));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, tasks, reminders, avisos, year, month]);

  function shiftMonth(delta: number) {
    const d = new Date(Date.UTC(year, month + delta, 1));
    setYear(d.getUTCFullYear());
    setMonth(d.getUTCMonth());
    setSelected(null);
  }
  function goToday() {
    setYear(Number(today.slice(0, 4)));
    setMonth(Number(today.slice(5, 7)) - 1);
    setSelected(today);
  }

  const firstWeekday = weekdayOf(monthStart);
  const cells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => ymd(year, month, i + 1)),
  ];

  // Sin día elegido: lista de todo el mes; con día elegido: solo ese día.
  const listDays = selected ? [selected] : [...itemsByDay.keys()].sort();
  const createDate = selected ?? (today >= monthStart && today <= monthEnd ? today : monthStart);

  const menu: { kind: CreateKind; label: string; hint: string }[] = [
    { kind: "evento", label: "Evento", hint: "con hora y avisos" },
    { kind: "tarea", label: "Tarea", hint: "con fecha límite" },
    { kind: "aviso", label: "Aviso de Quicks", hint: "una vez o recurrente" },
    { kind: "rutina", label: "Rutina", hint: "se repite sola" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Calendario</h1>
          <p className="text-sm text-white/40">Todo lo que tienes programado, por día.</p>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Agregar"
            className="w-10 h-10 rounded-full bg-gradient-to-br from-deep-blue via-electric-cyan to-electric-cyan text-night-blue flex items-center justify-center shadow-[0_0_18px_-4px_rgba(0,210,255,0.55)] hover:brightness-110 transition"
          >
            <IconPlus className="w-5 h-5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-56 z-10 rounded-xl border border-electric-cyan/20 bg-night-blue shadow-xl overflow-hidden">
              <p className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-white/40">Crear para {longDate(createDate)}</p>
              {menu.map((m) => (
                <button
                  key={m.kind}
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setCreating(m.kind);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-electric-cyan/10 transition-colors"
                >
                  <span className="text-sm text-white block">{m.label}</span>
                  <span className="text-xs text-white/40">{m.hint}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 p-4">
        <div className="flex items-center justify-between mb-3">
          <button type="button" onClick={() => shiftMonth(-1)} className="px-3 py-1 text-white/60 hover:text-white" aria-label="Mes anterior">
            ‹
          </button>
          <div className="text-center">
            <p className="text-sm font-semibold text-white capitalize">
              {MONTHS[month]} {year}
            </p>
            <button type="button" onClick={goToday} className="text-xs text-electric-cyan/80 hover:text-electric-cyan">
              Hoy
            </button>
          </div>
          <button type="button" onClick={() => shiftMonth(1)} className="px-3 py-1 text-white/60 hover:text-white" aria-label="Mes siguiente">
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS_SHORT.map((d, i) => (
            <span key={i} className="text-[11px] text-white/30 py-1">
              {d}
            </span>
          ))}
          {cells.map((date, i) => {
            if (!date) return <span key={`b${i}`} />;
            const items = itemsByDay.get(date) ?? [];
            const kinds = [...new Set(items.map((x) => x.kind))].slice(0, 4);
            const isToday = date === today;
            const isSelected = date === selected;
            return (
              <button
                key={date}
                type="button"
                onClick={() => setSelected(isSelected ? null : date)}
                className={`flex flex-col items-center gap-1 rounded-lg py-1.5 transition-colors ${
                  isSelected ? "bg-electric-cyan/20 ring-1 ring-electric-cyan/60" : "hover:bg-white/5"
                }`}
              >
                <span className={`text-sm ${isToday ? "text-electric-cyan font-bold" : "text-white/80"}`}>{Number(date.slice(8))}</span>
                <span className="flex gap-0.5 h-1.5">
                  {kinds.map((k) => (
                    <span key={k} className={`w-1.5 h-1.5 rounded-full ${KIND_STYLE[k].dot}`} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 justify-center">
          {(Object.keys(KIND_STYLE) as Kind[]).map((k) => (
            <span key={k} className="flex items-center gap-1 text-[11px] text-white/40">
              <span className={`w-1.5 h-1.5 rounded-full ${KIND_STYLE[k].dot}`} />
              {KIND_STYLE[k].label}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white/70">
            {selected ? longDate(selected) : `Todo ${MONTHS[month]} ${year}`}
          </h2>
          {selected && (
            <button type="button" onClick={() => setSelected(null)} className="text-xs text-electric-cyan/80 hover:text-electric-cyan">
              Ver todo el mes
            </button>
          )}
        </div>
        {listDays.length === 0 || (!selected && itemsByDay.size === 0) ? (
          <p className="text-white/40 text-sm">No hay nada programado.</p>
        ) : (
          listDays.map((date) => {
            const items = itemsByDay.get(date) ?? [];
            if (selected && items.length === 0) return <p key={date} className="text-white/40 text-sm">No hay nada programado este día.</p>;
            return (
              <section key={date}>
                {!selected && <h3 className="text-xs font-semibold uppercase tracking-wide text-electric-cyan/80 mb-1.5">{longDate(date)}</h3>}
                <ul className="bg-night-blue/40 rounded-2xl border border-electric-cyan/10 divide-y divide-white/5">
                  {items.map((item) => (
                    <li key={item.key} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="text-xs text-white/50 w-11 flex-shrink-0 tabular-nums">{item.time ?? "—"}</span>
                      <span className={`flex-1 text-sm ${item.done ? "line-through text-white/30" : "text-white/90"}`}>
                        {item.title}
                        {item.note && <span className="block text-xs text-white/40">{item.note}</span>}
                      </span>
                      <span className={`text-[11px] rounded-full px-2 py-0.5 flex-shrink-0 ${KIND_STYLE[item.kind].chip}`}>{KIND_STYLE[item.kind].label}</span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </div>

      {creating === "evento" && <NewEventForm lists={lists ?? []} projects={projects ?? []} defaultDate={createDate} onClose={() => setCreating(null)} />}
      {creating === "tarea" && <NewTaskModal lists={lists ?? []} projects={projects ?? []} defaultDate={createDate} onClose={() => setCreating(null)} />}
      {creating === "aviso" && <NewAvisoModal defaultDate={createDate} onClose={() => setCreating(null)} />}
      {creating === "rutina" && <NewRoutineModal lists={lists ?? []} defaultStartDate={createDate} onClose={() => setCreating(null)} />}
    </div>
  );
}
