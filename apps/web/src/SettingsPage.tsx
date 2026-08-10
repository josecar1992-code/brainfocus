import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type List } from "./api";
import { ConfirmDialog } from "./ConfirmDialog";
import { IconTrash } from "./icons";

function MileageReminderToggle() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["mileage-reminder"], queryFn: api.getMileageReminder });
  const [error, setError] = useState<string | null>(null);

  const toggle = useMutation({
    mutationFn: api.setMileageReminder,
    onSuccess: (result) => {
      queryClient.setQueryData(["mileage-reminder"], result);
      setError(null);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "No se pudo guardar"),
  });

  return (
    <div className="bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/40 mb-3">Vehículos</p>
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={data?.enabled ?? false}
          disabled={isLoading || toggle.isPending}
          onChange={(e) => toggle.mutate(e.target.checked)}
          className="accent-electric-cyan w-4 h-4 flex-shrink-0 mt-0.5"
        />
        <span>
          <span className="text-sm text-white/90 block">Preguntar el kilometraje mensualmente</span>
          <span className="text-xs text-white/40 block mt-0.5">
            El día 1 de cada mes, Quicks te va a preguntar por WhatsApp/Telegram el kilometraje actual de
            cada vehículo registrado — así se lleva control de uso mensual y se sabe cuándo se acerca el
            próximo mantenimiento por km.
          </span>
        </span>
      </label>
      {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
    </div>
  );
}

const SUGGESTED_COLORS = ["#00D2FF", "#4A6FA5", "#148F53", "#B54A4A", "#B58E2E", "#7B4AB5"];

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [color, setColor] = useState(SUGGESTED_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [listToDelete, setListToDelete] = useState<List | null>(null);

  const { data: lists, isLoading } = useQuery({ queryKey: ["lists"], queryFn: api.listLists });

  const createList = useMutation({
    mutationFn: api.createList,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      setName("");
    },
    onError: (err) => setError(err instanceof Error ? err.message : "No se pudo crear la categoría"),
  });

  const deleteList = useMutation({
    mutationFn: api.deleteList,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      setListToDelete(null);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return;
    createList.mutate({ name: name.trim(), color });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Configuración</h1>
        <p className="text-sm text-white/40">Categorías para organizar tus tareas, y preferencias</p>
      </div>

      <MileageReminderToggle />

      <div className="bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/40 mb-3">Nueva categoría</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-2 sm:items-end">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs text-white/50">Nombre</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ej. Personales"
                className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 placeholder:text-white/30 focus:outline-none focus:border-electric-cyan/70 transition"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/50">Color</label>
              <div className="flex items-center gap-1.5 h-[38px]">
                {SUGGESTED_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`Color ${c}`}
                    className={`w-6 h-6 rounded-full flex-shrink-0 transition ${
                      color === c ? "ring-2 ring-offset-2 ring-offset-night-blue ring-white/70" : ""
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <button
              type="submit"
              disabled={createList.isPending}
              className="bg-gradient-to-br from-deep-blue via-electric-cyan to-electric-cyan text-night-blue font-semibold rounded-lg shadow-[0_0_18px_-4px_rgba(0,210,255,0.55)] px-4 py-2 disabled:opacity-50 hover:brightness-110 transition"
            >
              {createList.isPending ? "Creando..." : "Crear"}
            </button>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </form>
      </div>

      <div className="bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] overflow-hidden">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/40 px-5 pt-5 pb-2">Categorías</p>

        {isLoading && <p className="text-white/40 text-sm px-5 pb-5">Cargando...</p>}
        {lists && lists.length === 0 && !isLoading && (
          <p className="text-white/40 text-sm px-5 pb-5">No hay categorías todavía.</p>
        )}

        {lists && lists.length > 0 && (
          <ul>
            {lists.map((list: List) => (
              <li
                key={list.id}
                className="flex items-center justify-between gap-3 px-5 py-3 border-t border-white/8 first:border-t-0 hover:bg-white/5 transition-colors group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: list.color ?? "#5B6B82" }}
                  />
                  <span className="text-sm text-white/90 truncate">{list.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setListToDelete(list)}
                  aria-label="Borrar categoría"
                  className="text-white/20 hover:text-red-400 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                >
                  <IconTrash className="w-4 h-4" strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {listToDelete && (
        <ConfirmDialog
          message={`¿Borrar la categoría "${listToDelete.name}"? Las tareas quedan sin categoría.`}
          pending={deleteList.isPending}
          onCancel={() => setListToDelete(null)}
          onConfirm={() => deleteList.mutate(listToDelete.id)}
        />
      )}
    </div>
  );
}
