import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type List, type NewTask, type Task } from "./api";
import { CornerBrackets } from "./CornerBrackets";
import { IconTrash } from "./icons";

const PRIORITY_ORDER: Record<Task["priority"], number> = { high: 0, normal: 1, low: 2 };

const PRIORITIES: { value: Task["priority"]; label: string; className: string }[] = [
  { value: "low", label: "Baja", className: "text-white/50 bg-white/5" },
  { value: "normal", label: "Normal", className: "text-electric-cyan bg-electric-cyan/10" },
  { value: "high", label: "Alta", className: "text-red-400 bg-red-400/10" },
];

const CATEGORY_COLORS = ["#00D2FF", "#4A6FA5", "#148F53", "#B54A4A", "#B58E2E", "#7B4AB5"];
const NEW_CATEGORY = "__new__";

// El navegador dibuja el desplegable nativo con sus propios colores de sistema —
// sin fondo/texto explícitos en <select> y <option> queda gris sobre blanco
// (bajo contraste) en vez de seguir la paleta oscura del resto de la app.
const SELECT_CLASS =
  "border border-deep-blue/40 bg-night-blue text-white rounded-lg px-3 py-2 focus:outline-none focus:border-electric-cyan/70 [color-scheme:dark]";
const OPTION_STYLE = { backgroundColor: "#0b1420", color: "#ffffff" };

function CategorySelect({
  lists,
  value,
  onChange,
}: {
  lists: List[];
  value: string;
  onChange: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(CATEGORY_COLORS[0]);
  const [error, setError] = useState<string | null>(null);

  const createList = useMutation({
    mutationFn: api.createList,
    onSuccess: (list) => {
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      onChange(list.id);
      setCreating(false);
      setNewName("");
    },
    onError: (err) => setError(err instanceof Error ? err.message : "No se pudo crear la categoría"),
  });

  if (creating) {
    return (
      <div className="flex flex-col gap-2 bg-black/20 rounded-lg p-3 border border-white/10">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nombre de la categoría"
          autoFocus
          className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 text-sm placeholder:text-white/30 focus:outline-none focus:border-electric-cyan/70"
        />
        <div className="flex items-center gap-1.5">
          {CATEGORY_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setNewColor(c)}
              aria-label={`Color ${c}`}
              className={`w-5 h-5 rounded-full flex-shrink-0 transition ${
                newColor === c ? "ring-2 ring-offset-2 ring-offset-night-blue ring-white/70" : ""
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setCreating(false);
              setError(null);
            }}
            className="flex-1 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white/70 hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              if (!newName.trim()) {
                setError("Ponele un nombre a la categoría.");
                return;
              }
              setError(null);
              createList.mutate({ name: newName.trim(), color: newColor });
            }}
            disabled={createList.isPending}
            className="flex-1 bg-gradient-to-br from-deep-blue via-electric-cyan to-electric-cyan text-night-blue font-semibold rounded-lg shadow-[0_0_18px_-4px_rgba(0,210,255,0.55)] px-3 py-1.5 text-sm disabled:opacity-50 hover:brightness-110 transition"
          >
            {createList.isPending ? "Creando..." : "Crear"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => (e.target.value === NEW_CATEGORY ? setCreating(true) : onChange(e.target.value))}
      className={SELECT_CLASS}
    >
      <option value="" disabled style={OPTION_STYLE}>
        Elegí una categoría
      </option>
      {lists.map((l) => (
        <option key={l.id} value={l.id} style={OPTION_STYLE}>
          {l.name}
        </option>
      ))}
      <option value={NEW_CATEGORY} style={OPTION_STYLE}>
        + Nueva categoría…
      </option>
    </select>
  );
}

function StatCard({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  return (
    <div className="bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] px-3 py-4 text-center">
      <p className="text-2xl font-bold text-white leading-none">{valor}</p>
      <p className="text-[11px] text-white/40 mt-1.5 leading-tight">{etiqueta}</p>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: Task["priority"] }) {
  const p = PRIORITIES.find((x) => x.value === priority) ?? PRIORITIES[1];
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${p.className}`}>
      {p.label}
    </span>
  );
}

function NewTaskModal({ lists, onClose }: { lists: List[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [listId, setListId] = useState("");
  const [priority, setPriority] = useState<Task["priority"]>("normal");
  const [crearEvento, setCrearEvento] = useState(false);
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [crearRecordatorio, setCrearRecordatorio] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const createTask = useMutation({
    mutationFn: api.createTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "No se pudo crear la tarea"),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Ponele un nombre a la tarea.");
      return;
    }
    if (!listId) {
      setError("Elegí una categoría (o creá una nueva).");
      return;
    }
    if (crearEvento && (!fecha || !hora)) {
      setError("Si vas a crear un evento, completa fecha y hora.");
      return;
    }
    const input: NewTask = {
      title: title.trim(),
      notes: notes.trim() || undefined,
      list_id: listId,
      priority,
      crearEvento,
      fecha: crearEvento ? fecha : undefined,
      hora: crearEvento ? hora : undefined,
      crearRecordatorio: crearEvento ? crearRecordatorio : undefined,
    };
    createTask.mutate(input);
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-20 overflow-y-auto py-8">
      <div className="relative w-full max-w-sm border border-electric-cyan/20 bg-night-blue rounded-2xl p-6 shadow-[0_0_60px_-15px_rgba(0,210,255,0.25)]">
      <CornerBrackets />
      <h2 className="text-lg font-medium mb-3">Nueva tarea</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-white/50">Nombre</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ej. Llamar al banco"
            className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 placeholder:text-white/30 focus:outline-none focus:border-electric-cyan/70 transition"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-white/50">Detalle</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Opcional"
            rows={2}
            className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 placeholder:text-white/30 focus:outline-none focus:border-electric-cyan/70 resize-none transition"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:gap-2">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-white/50">Categoría</label>
            <CategorySelect lists={lists} value={listId} onChange={setListId} />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-white/50">Prioridad</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Task["priority"])}
              className={SELECT_CLASS}
            >
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value} style={OPTION_STYLE}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-white/70">
          <input
            type="checkbox"
            checked={crearEvento}
            onChange={(e) => setCrearEvento(e.target.checked)}
            className="accent-electric-cyan"
          />
          Crear evento en Agenda
        </label>

        {crearEvento && (
          <div className="flex flex-col gap-3 bg-black/20 rounded-xl p-3 border border-white/10">
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-2">
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-xs text-white/50">Fecha</label>
                <input
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 focus:outline-none focus:border-electric-cyan/70 [color-scheme:dark]"
                />
              </div>
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-xs text-white/50">Hora</label>
                <input
                  type="time"
                  value={hora}
                  onChange={(e) => setHora(e.target.value)}
                  className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 focus:outline-none focus:border-electric-cyan/70 [color-scheme:dark]"
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
              Crear recordatorio (Quicks avisa 2 horas antes)
            </label>
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-2 mt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-white/10 rounded-lg px-3 py-2 text-white/70 hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={createTask.isPending}
            className="flex-1 bg-gradient-to-br from-deep-blue via-electric-cyan to-electric-cyan text-night-blue font-semibold rounded-lg shadow-[0_0_18px_-4px_rgba(0,210,255,0.55)] px-3 py-2 disabled:opacity-50 hover:brightness-110 transition"
          >
            {createTask.isPending ? "Creando..." : "Crear tarea"}
          </button>
        </div>
      </form>
      </div>
    </div>
  );
}

function TaskDetail({ task, lists, onClose }: { task: Task; lists: List[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [listId, setListId] = useState(task.list_id ?? "");
  const [priority, setPriority] = useState<Task["priority"]>(task.priority);
  const [error, setError] = useState<string | null>(null);

  const updateTask = useMutation({
    mutationFn: () =>
      api.updateTask(task.id, { title: title.trim(), notes: notes.trim(), list_id: listId, priority }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "No se pudo actualizar la tarea"),
  });

  const deleteTask = useMutation({
    mutationFn: () => api.deleteTask(task.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "No se pudo borrar la tarea"),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Ponele un nombre a la tarea.");
      return;
    }
    updateTask.mutate();
  }

  const list = task.list_id ? lists.find((l) => l.id === task.list_id) : undefined;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-20">
      <div className="relative w-full max-w-sm border border-electric-cyan/20 bg-night-blue rounded-2xl p-6 flex flex-col gap-3 shadow-[0_0_60px_-15px_rgba(0,210,255,0.25)]">
        <CornerBrackets />
        {editing ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <h2 className="text-lg font-medium mb-1">Editar tarea</h2>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/50">Nombre</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 focus:outline-none focus:border-electric-cyan/70"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/50">Detalle</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 focus:outline-none focus:border-electric-cyan/70 resize-none"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-2">
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-xs text-white/50">Categoría</label>
                <CategorySelect lists={lists} value={listId} onChange={setListId} />
              </div>
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-xs text-white/50">Prioridad</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Task["priority"])}
                  className={SELECT_CLASS}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value} style={OPTION_STYLE}>
                      {p.label}
                    </option>
                  ))}
                </select>
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
                disabled={updateTask.isPending}
                className="flex-1 bg-gradient-to-br from-deep-blue via-electric-cyan to-electric-cyan text-night-blue font-semibold rounded-lg shadow-[0_0_18px_-4px_rgba(0,210,255,0.55)] px-3 py-2 disabled:opacity-50 hover:brightness-110 transition"
              >
                {updateTask.isPending ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <h2 className="text-lg font-medium mb-1 text-white">{task.title}</h2>
            <div className="flex items-center gap-2 flex-wrap">
              {list && (
                <span
                  className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: `${list.color ?? "#5B6B82"}22`, color: list.color ?? "#8FA3BF" }}
                >
                  {list.name}
                </span>
              )}
              <PriorityBadge priority={task.priority} />
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/5 text-white/50">
                {task.status === "done" ? "Completada" : task.status === "in_progress" ? "En curso" : "Pendiente"}
              </span>
            </div>
            {task.notes && <p className="text-sm text-white/60 whitespace-pre-wrap">{task.notes}</p>}
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="grid grid-cols-3 gap-2 mt-2">
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
                onClick={() => {
                  if (confirm(`¿Borrar "${task.title}"?`)) deleteTask.mutate();
                }}
                disabled={deleteTask.isPending}
                className="border border-red-400/40 text-red-400 rounded-lg px-2 py-2 text-sm hover:bg-red-400/10 transition disabled:opacity-50"
              >
                {deleteTask.isPending ? "..." : "Borrar"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function TasksPage() {
  const queryClient = useQueryClient();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [categoriaFilter, setCategoriaFilter] = useState("");
  const [prioridadFilter, setPrioridadFilter] = useState<Task["priority"] | "">("");
  const { data: tasks, isLoading } = useQuery({ queryKey: ["tasks"], queryFn: api.listTasks });
  const { data: lists } = useQuery({ queryKey: ["lists"], queryFn: api.listLists });

  const toggleTask = useMutation({
    mutationFn: api.toggleTask,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const deleteTask = useMutation({
    mutationFn: api.deleteTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
    },
  });

  const listsById = new Map((lists ?? []).map((l) => [l.id, l]));

  const pendientes = tasks?.filter((t) => t.status !== "done").length ?? 0;
  const completadas = tasks?.filter((t) => t.status === "done").length ?? 0;

  const visibleTasks = (tasks ?? [])
    .filter((t) => !categoriaFilter || t.list_id === categoriaFilter)
    .filter((t) => !prioridadFilter || t.priority === prioridadFilter)
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-white">Tareas</h1>
          <p className="text-sm text-white/40">Lo que tenés pendiente, en un solo lugar</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="bg-gradient-to-br from-deep-blue via-electric-cyan to-electric-cyan text-night-blue font-semibold rounded-lg shadow-[0_0_18px_-4px_rgba(0,210,255,0.55)] px-3 py-2 text-sm hover:brightness-110 transition flex-shrink-0"
        >
          + Crear tarea
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard valor={pendientes} etiqueta="Pendientes" />
        <StatCard valor={completadas} etiqueta="Completadas" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={categoriaFilter}
          onChange={(e) => setCategoriaFilter(e.target.value)}
          className={`${SELECT_CLASS} py-1.5 text-sm`}
        >
          <option value="" style={OPTION_STYLE}>
            Todas las categorías
          </option>
          {(lists ?? []).map((l) => (
            <option key={l.id} value={l.id} style={OPTION_STYLE}>
              {l.name}
            </option>
          ))}
        </select>
        <select
          value={prioridadFilter}
          onChange={(e) => setPrioridadFilter(e.target.value as Task["priority"] | "")}
          className={`${SELECT_CLASS} py-1.5 text-sm`}
        >
          <option value="" style={OPTION_STYLE}>
            Toda prioridad
          </option>
          {PRIORITIES.map((p) => (
            <option key={p.value} value={p.value} style={OPTION_STYLE}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] overflow-hidden">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/40 px-5 pt-5 pb-2">Lista</p>

        {isLoading && <p className="text-white/40 text-sm px-5 pb-5">Cargando...</p>}

        {visibleTasks.length === 0 && !isLoading && (
          <p className="text-white/40 text-sm px-5 pb-5">No hay tareas para este filtro.</p>
        )}

        {visibleTasks.length > 0 && (
          <ul>
            {visibleTasks.map((task: Task) => {
              const list = task.list_id ? listsById.get(task.list_id) : undefined;
              return (
                <li
                  key={task.id}
                  className="flex items-center gap-3 px-5 py-3 border-t border-white/8 first:border-t-0 hover:bg-white/5 transition-colors group cursor-pointer"
                  onClick={() => setSelectedTask(task)}
                >
                  <input
                    type="checkbox"
                    checked={task.status === "done"}
                    onChange={() => toggleTask.mutate(task)}
                    onClick={(e) => e.stopPropagation()}
                    className="accent-electric-cyan w-4 h-4 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-sm ${task.status === "done" ? "line-through text-white/30" : "text-white/90"}`}
                      >
                        {task.title}
                      </span>
                      {list && (
                        <span
                          className="text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: `${list.color ?? "#5B6B82"}22`, color: list.color ?? "#8FA3BF" }}
                        >
                          {list.name}
                        </span>
                      )}
                      <PriorityBadge priority={task.priority} />
                    </div>
                    {task.notes && <p className="text-xs text-white/40 mt-0.5 truncate">{task.notes}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteTask.mutate(task.id);
                    }}
                    aria-label="Borrar tarea"
                    className="text-white/20 hover:text-red-400 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                  >
                    <IconTrash className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {showForm && <NewTaskModal lists={lists ?? []} onClose={() => setShowForm(false)} />}
      {selectedTask && <TaskDetail task={selectedTask} lists={lists ?? []} onClose={() => setSelectedTask(null)} />}
    </div>
  );
}
