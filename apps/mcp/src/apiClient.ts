const BASE_URL = process.env.BRAINFOCUS_API_URL;
const API_KEY = process.env.BRAINFOCUS_API_KEY;

if (!BASE_URL) throw new Error("Falta BRAINFOCUS_API_URL");
if (!API_KEY) throw new Error("Falta BRAINFOCUS_API_KEY");

const REQUEST_TIMEOUT_MS = 10_000;
const UPLOAD_TIMEOUT_MS = 30_000; // los PDFs/imágenes pesan más que un JSON, dales más margen

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": API_KEY as string,
      ...init?.headers,
    },
    // Sin esto, una API colgada cuelga el turno del agente entero: el usuario no
    // recibe respuesta por WhatsApp/Telegram y no hay error que reportar.
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Focusbrain API ${res.status} en ${path}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/**
 * Subida multipart — separada de apiRequest porque esa fuerza
 * Content-Type: application/json siempre. Los bytes del archivo nunca pasan
 * por JSON.stringify ni por el LLM, van tal cual en el FormData.
 */
export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "X-Api-Key": API_KEY as string },
    body: form,
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Focusbrain API ${res.status} en ${path}: ${body}`);
  }
  return res.json() as Promise<T>;
}
