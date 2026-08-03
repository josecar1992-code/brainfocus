import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Event } from "./api";

const CR_OFFSET = "-06:00"; // Costa Rica, sin horario de verano — offset fijo

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-CR", { day: "2-digit", month: "short", year: "numeric" });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" });
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
        className="w-full max-w-sm border border-electric-cyan/20 bg-night-blue rounded-2xl p-6 flex flex-col gap-3"
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
            className="flex-1 bg-electric-cyan text-night-blue font-medium rounded-lg px-3 py-2 disabled:opacity-50"
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

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium">Agenda</h2>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="bg-electric-cyan text-night-blue font-medium rounded-lg px-3 py-2 text-sm"
        >
          + Crear evento
        </button>
      </div>

      {isLoading && <p className="text-white/60">Cargando...</p>}

      {events && events.length === 0 && !isLoading && (
        <p className="text-white/40 text-sm">No hay eventos todavía.</p>
      )}

      {events && events.length > 0 && (
        <div className="border border-deep-blue/30 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/5 text-white/50 text-left">
                <th className="px-3 py-2 font-normal">Fecha</th>
                <th className="px-3 py-2 font-normal">Hora</th>
                <th className="px-3 py-2 font-normal">Evento</th>
                <th className="px-3 py-2 font-normal">Descripción</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event: Event) => (
                <tr key={event.id} className="border-t border-deep-blue/20">
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(event.starts_at)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-electric-cyan">{formatTime(event.starts_at)}</td>
                  <td className="px-3 py-2">{event.title}</td>
                  <td className="px-3 py-2 text-white/50">{event.description ?? "—"}</td>
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
