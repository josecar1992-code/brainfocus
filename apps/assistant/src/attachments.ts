import type { InboundMedia } from "./kapso/webhook.js";

// Adjuntos recién recibidos, en memoria y por usuario. El usuario manda la foto/PDF y recién después dice con qué
// nombre guardarlo, así que el archivo se baja al recibirlo (las URLs de Meta/Kapso caducan) y espera un rato.
// Es solo memoria: si el servicio se reinicia el usuario tiene que reenviarlo. Nunca se mezcla entre usuarios.
export interface Attachment {
  bytes: Uint8Array;
  mimeType: string;
  filename?: string;
  receivedAt: number;
}

export type CaptureResult = { ok: true; attachment: Attachment } | { ok: false; reason: "no-url" | "too-large" | "download-failed" };

export interface AttachmentStore {
  capture(userId: string, media: InboundMedia): Promise<CaptureResult>;
  latest(userId: string): Attachment | null;
}

export interface AttachmentOptions {
  ttlMs?: number;
  maxBytes?: number;
  /** Credencial de Kapso: solo se manda a hosts de kapso.ai, nunca a un dominio arbitrario. */
  kapsoApiKey?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

const KAPSO_HOST = /(^|\.)kapso\.ai$/i;

export function createAttachmentStore(opts: AttachmentOptions = {}): AttachmentStore {
  const ttl = opts.ttlMs ?? 30 * 60_000;
  const maxBytes = opts.maxBytes ?? 20 * 1024 * 1024; // la API acepta hasta 25 MB
  const doFetch = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  const byUser = new Map<string, Attachment>();

  return {
    async capture(userId, media) {
      if (!media.url) return { ok: false, reason: "no-url" };
      try {
        const url = new URL(media.url);
        if (url.protocol !== "https:") return { ok: false, reason: "download-failed" };
        const headers: Record<string, string> = {};
        if (opts.kapsoApiKey && KAPSO_HOST.test(url.hostname)) headers["X-API-Key"] = opts.kapsoApiKey;
        const res = await doFetch(url, { headers, signal: AbortSignal.timeout(30_000) });
        if (!res.ok) return { ok: false, reason: "download-failed" };
        const declared = Number(res.headers.get("content-length"));
        if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: "too-large" };
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (bytes.byteLength > maxBytes) return { ok: false, reason: "too-large" };
        const mimeType = (media.contentType ?? res.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim();
        const attachment: Attachment = { bytes, mimeType, filename: media.filename, receivedAt: now() };
        byUser.set(userId, attachment);
        return { ok: true, attachment };
      } catch {
        return { ok: false, reason: "download-failed" };
      }
    },

    latest(userId) {
      const a = byUser.get(userId);
      if (!a) return null;
      if (now() - a.receivedAt > ttl) {
        byUser.delete(userId);
        return null;
      }
      return a;
    },
  };
}

const EXT: Record<string, string> = { "application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };

/** Nombre de archivo para mandarlo por WhatsApp: el nombre guardado más la extensión que le toca por su tipo. */
export function filenameFor(name: string, mimeType: string | null): string {
  const ext = mimeType ? EXT[mimeType] : undefined;
  return ext && !name.toLowerCase().endsWith(ext) ? name + ext : name;
}
