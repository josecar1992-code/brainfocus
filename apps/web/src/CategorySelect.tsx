import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type List } from "./api";
import { OPTION_STYLE, SELECT_CLASS } from "./selectStyles";

export const CATEGORY_COLORS = ["#00D2FF", "#4A6FA5", "#148F53", "#B54A4A", "#B58E2E", "#7B4AB5"];
const NEW_CATEGORY = "__new__";

/** Select de categoría (lista) con la opción de crear una nueva sin salir del modal actual. */
export function CategorySelect({
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
