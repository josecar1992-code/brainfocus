import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { api, type Document } from "./api";
import { ConfirmDialog } from "./ConfirmDialog";
import { IconDownload, IconFile, IconUpload, IconX } from "./icons";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString("es-CR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [docToDelete, setDocToDelete] = useState<Document | null>(null);

  const { data: documents, isLoading } = useQuery({
    queryKey: ["documents", search],
    queryFn: () => api.listDocuments(search || undefined),
  });

  const upload = useMutation({
    mutationFn: () => api.uploadDocument(name.trim(), pendingFile as File),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setPendingFile(null);
      setName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onError: (err) => setError(err instanceof Error ? err.message : "No se pudo subir el documento"),
  });

  const deleteDocument = useMutation({
    mutationFn: api.deleteDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setDocToDelete(null);
    },
  });

  async function handleDownload(doc: Document) {
    const { url } = await api.getDocumentDownloadUrl(doc.id);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setPendingFile(file);
    if (file && !name.trim()) setName(file.name.replace(/\.[^.]+$/, ""));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!pendingFile) {
      setError("Elegí un archivo.");
      return;
    }
    if (!name.trim()) {
      setError("Ponele un nombre.");
      return;
    }
    upload.mutate();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Documentos</h1>
        <p className="text-sm text-white/40">
          PDFs e imágenes — Quicks también puede guardarlos y reenviarlos por vos si le pedís "guardá esto como..." o
          "mandame el documento..."
        </p>
      </div>

      <div className="bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/40 mb-3">Subir documento</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChange}
            className="text-sm text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-electric-cyan/15 file:text-electric-cyan file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-electric-cyan/25 transition"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre para buscarlo después (ej. 'contrato alquiler')"
            className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 placeholder:text-white/30 focus:outline-none focus:border-electric-cyan/70 transition"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={upload.isPending}
            className="self-end flex items-center gap-2 bg-gradient-to-br from-deep-blue via-electric-cyan to-electric-cyan text-night-blue font-semibold rounded-lg shadow-[0_0_18px_-4px_rgba(0,210,255,0.55)] px-4 py-2 disabled:opacity-50 hover:brightness-110 transition"
          >
            <IconUpload className="w-4 h-4" strokeWidth={2} />
            {upload.isPending ? "Subiendo..." : "Subir"}
          </button>
        </form>
      </div>

      <div className="bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/40">Guardados</p>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre..."
            className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-1.5 text-sm placeholder:text-white/30 focus:outline-none focus:border-electric-cyan/70 transition w-40 sm:w-56"
          />
        </div>

        {isLoading && <p className="text-white/40 text-sm px-5 pb-5">Cargando...</p>}

        {documents && documents.length === 0 && !isLoading && (
          <p className="text-white/40 text-sm px-5 pb-5">No hay documentos guardados todavía.</p>
        )}

        {documents && documents.length > 0 && (
          <ul>
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="px-5 py-3 border-t border-white/8 first:border-t-0 hover:bg-white/5 transition-colors group flex items-center gap-3"
              >
                <IconFile className="w-5 h-5 text-electric-cyan/70 flex-shrink-0" strokeWidth={1.75} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white/90 truncate">{doc.name}</p>
                  <p className="text-[11px] text-white/30 mt-0.5">
                    {formatDateTime(doc.created_at)}
                    {doc.size ? ` · ${formatSize(doc.size)}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDownload(doc)}
                  aria-label="Descargar"
                  className="text-white/40 hover:text-electric-cyan transition-colors flex-shrink-0"
                >
                  <IconDownload className="w-4 h-4" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  onClick={() => setDocToDelete(doc)}
                  aria-label="Borrar documento"
                  className="text-white/20 hover:text-red-400 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                >
                  <IconX className="w-4 h-4" strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {docToDelete && (
        <ConfirmDialog
          message={`¿Borrar el documento "${docToDelete.name}"?`}
          pending={deleteDocument.isPending}
          onCancel={() => setDocToDelete(null)}
          onConfirm={() => deleteDocument.mutate(docToDelete.id)}
        />
      )}
    </div>
  );
}
