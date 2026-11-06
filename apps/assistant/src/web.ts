import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Herramientas de internet SOLO para las instrucciones programadas del módulo Asistente (noticias diarias, lecturas, etc.).
// En el chat directo no se ofrecen: ahí el asistente sigue limitado a la organización personal (ver prompt.ts).

const BRAVE_URL = "https://api.search.brave.com/res/v1/web/search";
const MAX_PAGE_BYTES = 1_000_000;
const MAX_PAGE_CHARS = 6000;
const MAX_REDIRECTS = 3;

export const WEB_TOOL_NAMES = ["buscar_web", "leer_pagina"] as const;

export const WEB_SPECS = [
  {
    type: "function" as const,
    function: {
      name: "buscar_web",
      description:
        "Busca en internet y devuelve hasta 5 resultados (título, url, resumen). Usala para noticias, datos actuales o encontrar una página; después leé la que sirva con leer_pagina.",
      parameters: {
        type: "object",
        properties: { consulta: { type: "string", description: "Qué buscar, en el idioma que dé mejores resultados." } },
        required: ["consulta"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "leer_pagina",
      description: "Descarga una página web (http/https) y devuelve su texto, recortado. Usala con una url de buscar_web o una que dio la persona.",
      parameters: {
        type: "object",
        properties: { url: { type: "string", description: "Dirección completa de la página." } },
        required: ["url"],
      },
    },
  },
];

function privateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    return v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168.");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** Rechaza direcciones internas (SSRF): solo http(s) hacia IPs públicas. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("URL inválida");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Solo se permiten URLs http(s)");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true })).map((r) => r.address);
  if (ips.length === 0 || ips.some(privateIp)) throw new Error("Dirección no permitida");
  return u;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export async function searchWeb(apiKey: string, query: string): Promise<unknown> {
  const url = `${BRAVE_URL}?q=${encodeURIComponent(query)}&count=5&country=cr&search_lang=es`;
  const res = await fetch(url, { headers: { Accept: "application/json", "X-Subscription-Token": apiKey }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`La búsqueda falló (${res.status})`);
  const data = (await res.json()) as { web?: { results?: Array<{ title?: string; url?: string; description?: string; age?: string }> } };
  return (data.web?.results ?? []).slice(0, 5).map((r) => ({ titulo: r.title, url: r.url, resumen: htmlToText(r.description ?? ""), antiguedad: r.age }));
}

export async function readPage(raw: string): Promise<unknown> {
  let url = await assertPublicUrl(raw);
  for (let hop = 0; ; hop++) {
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "User-Agent": "FocusbrainAsistente/1.0", Accept: "text/html,text/plain" },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      if (hop >= MAX_REDIRECTS) throw new Error("Demasiadas redirecciones");
      url = await assertPublicUrl(new URL(res.headers.get("location")!, url).toString());
      continue;
    }
    if (!res.ok) throw new Error(`La página respondió ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/|json|xml/i.test(type)) throw new Error("La página no es texto");
    const buf = Buffer.from(await res.arrayBuffer()).subarray(0, MAX_PAGE_BYTES);
    const text = /html/i.test(type) ? htmlToText(buf.toString("utf8")) : buf.toString("utf8").replace(/\s+/g, " ").trim();
    return { url: url.toString(), texto: text.slice(0, MAX_PAGE_CHARS), recortado: text.length > MAX_PAGE_CHARS };
  }
}
