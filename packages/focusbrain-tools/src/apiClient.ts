import { AsyncLocalStorage } from "node:async_hooks";

// Cliente HTTP de la API de Focusbrain para las herramientas. Dos modos:
//  - MCP (OpenClaw): credenciales de entorno (BRAINFOCUS_API_URL / BRAINFOCUS_API_KEY),
//    un proceso por invocación — comportamiento original, sin cambios.
//  - Asistente multiusuario: un solo proceso atiende a muchos usuarios a la vez, así que
//    las credenciales (y el usuario en cuyo nombre se actúa) se fijan POR LLAMADA con
//    runWithApi(); AsyncLocalStorage las aísla entre peticiones concurrentes.
export interface ApiContext {
  baseUrl: string;
  headers: Record<string, string>;
}

const storage = new AsyncLocalStorage<ApiContext>();

export function runWithApi<T>(ctx: ApiContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

function envContext(): ApiContext {
  const baseUrl = process.env.BRAINFOCUS_API_URL;
  const apiKey = process.env.BRAINFOCUS_API_KEY;
  if (!baseUrl) throw new Error("Falta BRAINFOCUS_API_URL");
  if (!apiKey) throw new Error("Falta BRAINFOCUS_API_KEY");
  return { baseUrl, headers: { "X-Api-Key": apiKey } };
}

function resolveContext(): ApiContext {
  return storage.getStore() ?? envContext();
}

/** Para el MCP: falla al arrancar (como antes) si falta la configuración de entorno. */
export function assertApiConfiguredFromEnv(): void {
  envContext();
}

const REQUEST_TIMEOUT_MS = 10_000;
const UPLOAD_TIMEOUT_MS = 30_000; // los PDFs/imágenes pesan más que un JSON, dales más margen

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const ctx = resolveContext();
  const res = await fetch(`${ctx.baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...ctx.headers,
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
  const ctx = resolveContext();
  const res = await fetch(`${ctx.baseUrl}${path}`, {
    method: "POST",
    headers: { ...ctx.headers },
    body: form,
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Focusbrain API ${res.status} en ${path}: ${body}`);
  }
  return res.json() as Promise<T>;
}
