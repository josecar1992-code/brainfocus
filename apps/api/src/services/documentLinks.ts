import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env.js";

// Enlaces de descarga de documentos para reenviar por WhatsApp (Kapso -> Meta descarga el archivo desde la URL).
//
// Por qué no se entrega la URL firmada de Supabase tal cual: lleva `?token=...` y OpenClaw tapa ese valor con "***"
// antes de que Quicks lo vea, así que Quicks copiaba una URL con token="***" y Meta fallaba con HTTP 400 (error 131053
// "Media upload error", 17-nov-2026). Acá la firma va en la RUTA (sin parámetros "token") y con un nombre de archivo
// con extensión al final, que además es el que Meta/WhatsApp muestra al destinatario.
export const DOC_LINK_TTL_SECONDS = 600;

const PUBLIC_BASE = (process.env.API_PUBLIC_URL ?? "https://api.focusbraincr.com").replace(/\/+$/, "");

function sign(docId: string, exp: number): string {
  return createHmac("sha256", env.supabaseServiceRoleKey).update(`doc:${docId}:${exp}`).digest("hex").slice(0, 40);
}

function safeName(name: string, mime: string | null): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "documento";
  if (/\.[A-Za-z0-9]{2,5}$/.test(base)) return base;
  const ext = mime === "application/pdf" ? "pdf" : mime?.startsWith("image/") ? mime.slice(6).replace("jpeg", "jpg") : "";
  return ext ? `${base}.${ext}` : base;
}

export function buildDocumentLink(docId: string, name: string, mime: string | null): string {
  const exp = Math.floor(Date.now() / 1000) + DOC_LINK_TTL_SECONDS;
  return `${PUBLIC_BASE}/public/doc/${docId}.${exp}.${sign(docId, exp)}/${safeName(name, mime)}`;
}

/** Devuelve el id del documento si el enlace es válido y no venció; si no, null. */
export function verifyDocumentLink(payload: string): string | null {
  const [docId, expRaw, sig] = payload.split(".");
  const exp = Number(expRaw);
  if (!docId || !sig || !Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;
  const expected = Buffer.from(sign(docId, exp));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  return docId;
}
