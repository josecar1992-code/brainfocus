import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Note, type Project } from "./api";
import { ConfirmDialog } from "./ConfirmDialog";
import { CornerBrackets } from "./CornerBrackets";
import { ProjectSelect } from "./ProjectSelect";
import { QuickBadge } from "./QuickBadge";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString("es-CR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Ver/editar/borrar una nota completa en un modal — extraído de
 * `ProjectsPage.tsx` (20-ago-2026, donde las notas del proyecto solo
 * mostraban un preview truncado sin forma de abrirlas) para reusarlo también
 * en el módulo Notas standalone (`NotesPage.tsx`), que hasta ahora mostraba
 * el contenido completo siempre en la lista en vez de un resumen clickeable
 * — pedido por el usuario 01-sep-2026.
 */
export function NoteDetail({
  note,
  projects,
  onClose,
}: {
  note: Note;
  projects: Project[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [title, setTitle] = useState(note.title ?? "");
  const [content, setContent] = useState(note.content ?? "");
  const [projectId, setProjectId] = useState(note.project_id ?? "");
  const [error, setError] = useState<string | null>(null);

  const updateNote = useMutation({
    mutationFn: () =>
      api.updateNote(note.id, {
        title: title.trim() || undefined,
        content: content.trim(),
        project_id: projectId || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "No se pudo guardar la nota"),
  });

  const deleteNote = useMutation({
    mutationFn: () => api.deleteNote(note.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      onClose();
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!content.trim()) {
      setError("Escribí algo en el contenido.");
      return;
    }
    updateNote.mutate();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-20 overflow-y-auto py-8">
      <div className="relative w-full max-w-sm max-h-full overflow-y-auto border border-electric-cyan/20 bg-night-blue rounded-2xl p-6 flex flex-col gap-3 shadow-[0_0_60px_-15px_rgba(0,210,255,0.25)]">
        <CornerBrackets />
        {editing ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <h2 className="text-lg font-medium mb-1">Editar nota</h2>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/50">Nombre</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Nombre (opcional)"
                className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 placeholder:text-white/30 focus:outline-none focus:border-electric-cyan/70"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/50">Contenido</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={5}
                autoFocus
                className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 focus:outline-none focus:border-electric-cyan/70 resize-none"
              />
            </div>
            {projects.length > 0 && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-white/50">Proyecto (opcional)</label>
                <ProjectSelect projects={projects} value={projectId} onChange={setProjectId} />
              </div>
            )}
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
                disabled={updateNote.isPending}
                className="flex-1 bg-gradient-to-br from-deep-blue via-electric-cyan to-electric-cyan text-night-blue font-semibold rounded-lg shadow-[0_0_18px_-4px_rgba(0,210,255,0.55)] px-3 py-2 disabled:opacity-50 hover:brightness-110 transition"
              >
                {updateNote.isPending ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
        ) : (
          <>
            {note.title && <h2 className="text-lg font-medium mb-1 text-white">{note.title}</h2>}
            {note.created_by === "agent" && (
              <div className="mb-1">
                <QuickBadge />
              </div>
            )}
            <p className="text-sm text-white/70 whitespace-pre-wrap">{note.content}</p>
            <p className="text-[11px] text-white/30">{formatDateTime(note.created_at)}</p>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="grid grid-cols-3 gap-2 mt-3">
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
                disabled={deleteNote.isPending}
                className="border border-red-400/40 text-red-400 rounded-lg px-2 py-2 text-sm hover:bg-red-400/10 transition disabled:opacity-50"
              >
                {deleteNote.isPending ? "..." : "Borrar"}
              </button>
            </div>
          </>
        )}
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          message={`¿Borrar la nota "${note.title || note.content?.slice(0, 40) || "sin título"}"?`}
          pending={deleteNote.isPending}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => deleteNote.mutate()}
        />
      )}
    </div>
  );
}
