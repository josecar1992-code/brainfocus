import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Note } from "./api";
import { ConfirmDialog } from "./ConfirmDialog";
import { IconPencil, IconX } from "./icons";
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

export function NotesPage() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<Note | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

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

  const updateNote = useMutation({
    mutationFn: (input: { id: string; title?: string; content: string }) =>
      api.updateNote(input.id, { title: input.title, content: input.content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      setEditingId(null);
    },
    onError: (err) => setEditError(err instanceof Error ? err.message : "No se pudo guardar la nota"),
  });

  const deleteNote = useMutation({
    mutationFn: api.deleteNote,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      setNoteToDelete(null);
    },
  });

  function startEditing(note: Note) {
    setEditingId(note.id);
    setEditTitle(note.title ?? "");
    setEditContent(note.content ?? "");
    setEditError(null);
  }

  function handleEditSubmit(e: React.FormEvent, noteId: string) {
    e.preventDefault();
    setEditError(null);
    if (!editContent.trim()) {
      setEditError("Escribí algo en el contenido.");
      return;
    }
    updateNote.mutate({ id: noteId, title: editTitle.trim() || undefined, content: editContent.trim() });
  }

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
        <h1 className="text-2xl font-bold text-white">Notas y memorias</h1>
        <p className="text-sm text-white/40">Información libre — Quicks también puede leerlas y buscarlas por vos</p>
      </div>

      <div className="bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] p-5">
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
            className="self-end bg-gradient-to-br from-deep-blue via-electric-cyan to-electric-cyan text-night-blue font-semibold rounded-lg shadow-[0_0_18px_-4px_rgba(0,210,255,0.55)] px-4 py-2 disabled:opacity-50 hover:brightness-110 transition"
          >
            {createNote.isPending ? "Guardando..." : "Guardar nota"}
          </button>
        </form>
      </div>

      <div className="bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] overflow-hidden">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/40 px-5 pt-5 pb-2">Guardadas</p>

        {isLoading && <p className="text-white/40 text-sm px-5 pb-5">Cargando...</p>}

        {notes && notes.length === 0 && !isLoading && (
          <p className="text-white/40 text-sm px-5 pb-5">No hay notas todavía.</p>
        )}

        {notes && notes.length > 0 && (
          <ul>
            {notes.map((note: Note) =>
              editingId === note.id ? (
                <li key={note.id} className="px-5 py-4 border-t border-white/8 first:border-t-0">
                  <form onSubmit={(e) => handleEditSubmit(e, note.id)} className="flex flex-col gap-2">
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Nombre (opcional)"
                      className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 text-sm placeholder:text-white/30 focus:outline-none focus:border-electric-cyan/70 transition"
                    />
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={3}
                      autoFocus
                      className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 text-sm placeholder:text-white/30 focus:outline-none focus:border-electric-cyan/70 resize-none transition"
                    />
                    {editError && <p className="text-sm text-red-400">{editError}</p>}
                    <div className="flex gap-2 self-end">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white/70 hover:bg-white/5"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={updateNote.isPending}
                        className="bg-gradient-to-br from-deep-blue via-electric-cyan to-electric-cyan text-night-blue font-semibold rounded-lg shadow-[0_0_18px_-4px_rgba(0,210,255,0.55)] px-3 py-1.5 text-sm disabled:opacity-50 hover:brightness-110 transition"
                      >
                        {updateNote.isPending ? "Guardando..." : "Guardar"}
                      </button>
                    </div>
                  </form>
                </li>
              ) : (
                <li key={note.id} className="px-5 py-4 border-t border-white/8 first:border-t-0 hover:bg-white/5 transition-colors group">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {note.title && <p className="text-sm font-semibold text-white/90">{note.title}</p>}
                        {note.created_by === "agent" && <QuickBadge iconOnly />}
                      </div>
                      <p className="text-sm text-white/60 whitespace-pre-wrap mt-0.5">{note.content}</p>
                      <p className="text-[11px] text-white/30 mt-1.5">{formatDateTime(note.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => startEditing(note)}
                        aria-label="Editar nota"
                        className="text-white/20 hover:text-electric-cyan transition-colors p-1"
                      >
                        <IconPencil className="w-4 h-4" strokeWidth={1.75} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setNoteToDelete(note)}
                        aria-label="Borrar nota"
                        className="text-white/20 hover:text-red-400 transition-colors p-1"
                      >
                        <IconX className="w-4 h-4" strokeWidth={1.75} />
                      </button>
                    </div>
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </div>

      {noteToDelete && (
        <ConfirmDialog
          message={`¿Borrar la nota "${noteToDelete.title || noteToDelete.content?.slice(0, 40) || "sin título"}"?`}
          pending={deleteNote.isPending}
          onCancel={() => setNoteToDelete(null)}
          onConfirm={() => deleteNote.mutate(noteToDelete.id)}
        />
      )}
    </div>
  );
}
