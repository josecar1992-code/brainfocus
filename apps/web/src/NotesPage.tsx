import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Note } from "./api";
import { IconX } from "./icons";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString("es-CR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function NotesPage() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: notes, isLoading } = useQuery({ queryKey: ["notes"], queryFn: api.listNotes });

  const createNote = useMutation({
    mutationFn: api.createNote,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      setTitle("");
      setContent("");
    },
    onError: (err) => setError(err instanceof Error ? err.message : "No se pudo guardar la nota"),
  });

  const deleteNote = useMutation({
    mutationFn: api.deleteNote,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notes"] }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!content.trim()) {
      setError("Escribí algo en el contenido.");
      return;
    }
    createNote.mutate({ title: title.trim() || undefined, content: content.trim() });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Notas</h1>
        <p className="text-sm text-white/40">Información libre — Quicks también puede leerlas y buscarlas por vos</p>
      </div>

      <div className="bg-white/5 rounded-2xl shadow-sm border border-white/10 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/40 mb-3">Nueva nota</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nombre (opcional)"
            className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 placeholder:text-white/30 focus:outline-none focus:border-electric-cyan/70 transition"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Escribí la nota..."
            rows={3}
            className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 placeholder:text-white/30 focus:outline-none focus:border-electric-cyan/70 resize-none transition"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={createNote.isPending}
            className="self-end bg-electric-cyan text-night-blue font-medium rounded-lg px-4 py-2 disabled:opacity-50 hover:brightness-110 transition"
          >
            {createNote.isPending ? "Guardando..." : "Guardar nota"}
          </button>
        </form>
      </div>

      <div className="bg-white/5 rounded-2xl shadow-sm border border-white/10 overflow-hidden">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/40 px-5 pt-5 pb-2">Guardadas</p>

        {isLoading && <p className="text-white/40 text-sm px-5 pb-5">Cargando...</p>}

        {notes && notes.length === 0 && !isLoading && (
          <p className="text-white/40 text-sm px-5 pb-5">No hay notas todavía.</p>
        )}

        {notes && notes.length > 0 && (
          <ul>
            {notes.map((note: Note) => (
              <li key={note.id} className="px-5 py-4 border-t border-white/8 first:border-t-0 hover:bg-white/5 transition-colors group">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {note.title && <p className="text-sm font-semibold text-white/90">{note.title}</p>}
                    <p className="text-sm text-white/60 whitespace-pre-wrap mt-0.5">{note.content}</p>
                    <p className="text-[11px] text-white/30 mt-1.5">{formatDateTime(note.created_at)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteNote.mutate(note.id)}
                    aria-label="Borrar nota"
                    className="text-white/20 hover:text-red-400 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                  >
                    <IconX className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
