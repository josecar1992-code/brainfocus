import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CR_OFFSET } from "@brainfocus/shared-time";
import { api, type NewRecurringReminder, type RecurringReminder } from "./api";
import { ConfirmDialog } from "./ConfirmDialog";
import { IconPencil, IconTrash } from "./icons";
import { QuickBadge } from "./QuickBadge";

const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function describeReminder(r: RecurringReminder): string {
  if (r.schedule_type === "once") {
    if (!r.scheduled_at) return "Sin fecha";
    // timeZone explícito: sin esto, toLocaleString usa la del navegador/SO —
    // si no está en Costa Rica, muestra una hora distinta a la real
    // programada (el mismo motivo por el que se guarda con CR_OFFSET
    // explícito abajo, no con new Date().toISOString()).
    return new Date(r.scheduled_at).toLocaleString("es-CR", {
      timeZone: "America/Costa_Rica",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (r.frequency === "every_n_hours") return `Cada ${r.interval_hours} horas`;
  if (r.frequency === "daily") return `Todos los días a las ${r.time_of_day}`;
  return `Los ${WEEKDAYS[r.day_of_week ?? 0].toLowerCase()} a las ${r.time_of_day}`;
}

// Sin confirmación de entrega real de OpenClaw (mismo caso que el resto de la
// app, ver ReminderBadge) — para "una vez" se infiere si ya se disparó
// comparando scheduled_at contra la hora actual.
function isSent(r: RecurringReminder): boolean {
  return r.schedule_type === "once" && !!r.scheduled_at && new Date(r.scheduled_at) <= new Date();
}

// Formato que espera <input type="datetime-local"> ("YYYY-MM-DDTHH:MM"), a
// partir de "ahora en Costa Rica + 1h" — calculado a mano con el offset fijo
// -06:00 (no hay DST en CR) en vez de con la zona horaria del navegador/SO,
// que puede no coincidir (el mismo bug que causó que un aviso puesto para
// las 10:51am quedara guardado para las 11:51am: `new Date().toISOString()`
// asume la hora local del dispositivo, no la de Costa Rica).
function defaultLocalDateTime(): string {
  const crNow = new Date(Date.now() + 60 * 60 * 1000 - 6 * 60 * 60 * 1000);
  return crNow.toISOString().slice(0, 16);
}

// Inverso de lo anterior: un scheduled_at guardado (ISO, cualquier offset) a
// "YYYY-MM-DDTHH:MM" en hora de Costa Rica, para precargar el input al
// editar — mismo motivo, no depender de la zona horaria del navegador.
function toCRLocalInput(iso: string): string {
  const crTime = new Date(new Date(iso).getTime() - 6 * 60 * 60 * 1000);
  return crTime.toISOString().slice(0, 16);
}

export function AsistentePage() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [isInstruction, setIsInstruction] = useState(false);
  const [scheduleType, setScheduleType] = useState<NewRecurringReminder["schedule_type"]>("recurring");
  const [scheduledAt, setScheduledAt] = useState(defaultLocalDateTime());
  const [frequency, setFrequency] = useState<NonNullable<NewRecurringReminder["frequency"]>>("daily");
  const [intervalHours, setIntervalHours] = useState("2");
  const [timeOfDay, setTimeOfDay] = useState("09:00");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [reminderToDelete, setReminderToDelete] = useState<RecurringReminder | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "sent">("pending");

  const { data: reminders, isLoading } = useQuery({
    queryKey: ["recurring-reminders"],
    queryFn: api.listRecurringReminders,
  });

  // Los recurrentes no tienen noción de "enviado" (no hay un único disparo
  // que marcar) — siempre caen en Pendientes, sin importar si están
  // activos o pausados. Solo los "una vez" se mueven a Enviados, y solo
  // cuando ya pasó su scheduled_at (ver isSent).
  const filteredReminders = (reminders ?? []).filter((r) => (filter === "sent" ? isSent(r) : !isSent(r)));

  function resetForm() {
    setTitle("");
    setIsInstruction(false);
    setScheduleType("recurring");
    setScheduledAt(defaultLocalDateTime());
    setFrequency("daily");
    setIntervalHours("2");
    setTimeOfDay("09:00");
    setDayOfWeek("1");
    setEditingId(null);
  }

  function startEdit(r: RecurringReminder) {
    setEditingId(r.id);
    setTitle(r.title);
    setIsInstruction(r.is_instruction);
    setScheduleType(r.schedule_type);
    setError(null);
    if (r.schedule_type === "once") {
      setScheduledAt(r.scheduled_at ? toCRLocalInput(r.scheduled_at) : defaultLocalDateTime());
    } else {
      setFrequency(r.frequency ?? "daily");
      setIntervalHours(String(r.interval_hours ?? 2));
      setTimeOfDay(r.time_of_day ?? "09:00");
      setDayOfWeek(String(r.day_of_week ?? 1));
    }
  }

  const createReminder = useMutation({
    mutationFn: api.createRecurringReminder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring-reminders"] });
      resetForm();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "No se pudo crear el aviso"),
  });

  const updateReminder = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<NewRecurringReminder> }) =>
      api.updateRecurringReminder(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring-reminders"] });
      resetForm();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "No se pudo guardar el cambio"),
  });

  const toggleReminder = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.toggleRecurringReminder(id, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recurring-reminders"] }),
  });

  const deleteReminder = useMutation({
    mutationFn: api.deleteRecurringReminder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring-reminders"] });
      setReminderToDelete(null);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError(isInstruction ? "Escribí la instrucción para Quicks." : "Ponele un nombre al aviso.");
      return;
    }
    // scheduledAt viene de <input type="datetime-local"> como
    // "YYYY-MM-DDTHH:MM", sin zona horaria — se interpreta como hora de
    // Costa Rica (así se le muestra al usuario en toda la app) y se le
    // agrega el offset explícito -06:00, en vez de `new Date(...).toISOString()`
    // que asumía la zona horaria del navegador/SO.
    const input: NewRecurringReminder =
      scheduleType === "once"
        ? {
            title: title.trim(),
            is_instruction: isInstruction,
            schedule_type: "once",
            scheduled_at: `${scheduledAt}:00${CR_OFFSET}`,
          }
        : {
            title: title.trim(),
            is_instruction: isInstruction,
            schedule_type: "recurring",
            frequency,
            interval_hours: frequency === "every_n_hours" ? Number(intervalHours) : undefined,
            time_of_day: frequency !== "every_n_hours" ? timeOfDay : undefined,
            day_of_week: frequency === "weekly" ? Number(dayOfWeek) : undefined,
          };

    if (editingId) {
      updateReminder.mutate({ id: editingId, input });
    } else {
      createReminder.mutate(input);
    }
  }

  const isPending = createReminder.isPending || updateReminder.isPending;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Asistente</h1>
        <p className="text-sm text-white/40">
          Avisos que Quicks te manda por WhatsApp/Telegram — una vez o recurrentes — y órdenes para que
          Quicks ejecute solo, como "dame el tipo de cambio del bitcoin".
        </p>
      </div>

      <div className="bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] overflow-hidden">
        <div className="p-5 border-b border-white/8">
          {editingId && (
            <p className="text-xs font-semibold uppercase tracking-wide text-electric-cyan/80 mb-3">
              Editando aviso
            </p>
          )}
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isInstruction ? "ej. Dame el tipo de cambio del bitcoin actual" : "ej. Tomar agua"}
              className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 placeholder:text-white/30 focus:outline-none focus:border-electric-cyan/70 transition"
            />

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isInstruction}
                onChange={(e) => setIsInstruction(e.target.checked)}
                className="accent-electric-cyan w-4 h-4 flex-shrink-0 mt-0.5"
              />
              <span>
                <span className="text-sm text-white/90 block">Es una instrucción para Quicks</span>
                <span className="text-xs text-white/40 block mt-0.5">
                  En vez de avisarte el texto tal cual, Quicks lo ejecuta como una orden (buscar un dato,
                  contestar algo) y te responde con el resultado.
                </span>
              </span>
            </label>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-2">
              <select
                value={scheduleType}
                onChange={(e) => setScheduleType(e.target.value as NewRecurringReminder["schedule_type"])}
                className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 focus:outline-none focus:border-electric-cyan/70 [color-scheme:dark] flex-1"
              >
                <option value="once">Una vez</option>
                <option value="recurring">Recurrente</option>
              </select>

              {scheduleType === "once" && (
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 focus:outline-none focus:border-electric-cyan/70 [color-scheme:dark]"
                />
              )}

              {scheduleType === "recurring" && (
                <>
                  <select
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value as NonNullable<NewRecurringReminder["frequency"]>)}
                    className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 focus:outline-none focus:border-electric-cyan/70 [color-scheme:dark] flex-1"
                  >
                    <option value="every_n_hours">Cada N horas</option>
                    <option value="daily">Todos los días</option>
                    <option value="weekly">Un día de la semana</option>
                  </select>
                  {frequency === "every_n_hours" && (
                    <input
                      type="number"
                      min={1}
                      max={23}
                      value={intervalHours}
                      onChange={(e) => setIntervalHours(e.target.value)}
                      className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 focus:outline-none focus:border-electric-cyan/70 w-24"
                    />
                  )}
                  {frequency !== "every_n_hours" && (
                    <input
                      type="time"
                      value={timeOfDay}
                      onChange={(e) => setTimeOfDay(e.target.value)}
                      className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 focus:outline-none focus:border-electric-cyan/70 [color-scheme:dark]"
                    />
                  )}
                  {frequency === "weekly" && (
                    <select
                      value={dayOfWeek}
                      onChange={(e) => setDayOfWeek(e.target.value)}
                      className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 focus:outline-none focus:border-electric-cyan/70 [color-scheme:dark]"
                    >
                      {WEEKDAYS.map((d, i) => (
                        <option key={d} value={i}>
                          {d}
                        </option>
                      ))}
                    </select>
                  )}
                </>
              )}
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex items-center justify-end gap-2">
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-sm text-white/40 hover:text-white/70 transition-colors px-3 py-2"
                >
                  Cancelar
                </button>
              )}
              <button
                type="submit"
                disabled={isPending}
                className="bg-gradient-to-br from-deep-blue via-electric-cyan to-electric-cyan text-night-blue font-semibold rounded-lg shadow-[0_0_18px_-4px_rgba(0,210,255,0.55)] px-4 py-2 disabled:opacity-50 hover:brightness-110 transition"
              >
                {isPending ? "Guardando..." : editingId ? "Guardar cambios" : "Crear"}
              </button>
            </div>
          </form>
        </div>

        <div className="flex items-center gap-1 px-5 pt-4">
          {(["pending", "sent"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`text-xs font-medium rounded-lg px-3 py-1.5 transition-colors ${
                filter === f ? "bg-electric-cyan/15 text-electric-cyan" : "text-white/40 hover:text-white/70"
              }`}
            >
              {f === "pending" ? "Pendientes" : "Enviados"}
            </button>
          ))}
        </div>

        {isLoading && <p className="text-white/40 text-sm px-5 py-4">Cargando...</p>}
        {reminders && filteredReminders.length === 0 && !isLoading && (
          <p className="text-white/40 text-sm px-5 py-4">
            {filter === "pending" ? "No hay avisos pendientes." : "No hay avisos enviados todavía."}
          </p>
        )}
        {reminders && filteredReminders.length > 0 && (
          <ul>
            {filteredReminders.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 px-5 py-3 border-t border-white/8 hover:bg-white/5 transition-colors group"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-sm ${
                        r.schedule_type === "recurring" && !r.active ? "text-white/40 line-through" : "text-white/90"
                      }`}
                    >
                      {r.title}
                    </span>
                    {r.created_by === "agent" && <QuickBadge iconOnly />}
                    {r.is_instruction && (
                      <span className="text-[10px] uppercase tracking-wide text-electric-cyan/80 bg-electric-cyan/10 rounded px-1.5 py-0.5">
                        Instrucción
                      </span>
                    )}
                    {isSent(r) && (
                      <span className="text-[10px] uppercase tracking-wide text-white/40 bg-white/8 rounded px-1.5 py-0.5">
                        Enviado
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-white/40 mt-0.5">{describeReminder(r)}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {r.schedule_type === "recurring" && (
                    <button
                      type="button"
                      onClick={() => toggleReminder.mutate({ id: r.id, active: !r.active })}
                      className="text-[11px] text-white/40 hover:text-electric-cyan transition-colors px-1.5"
                    >
                      {r.active ? "Pausar" : "Reactivar"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => startEdit(r)}
                    aria-label="Editar aviso"
                    className="text-white/20 hover:text-electric-cyan transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <IconPencil className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setReminderToDelete(r)}
                    aria-label="Borrar aviso"
                    className="text-white/20 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <IconTrash className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {reminderToDelete && (
        <ConfirmDialog
          message={`¿Borrar el aviso "${reminderToDelete.title}"?`}
          pending={deleteReminder.isPending}
          onCancel={() => setReminderToDelete(null)}
          onConfirm={() => deleteReminder.mutate(reminderToDelete.id)}
        />
      )}
    </div>
  );
}
