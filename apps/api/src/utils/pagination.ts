// Compartido entre resourceRouter.ts y documents.ts (el único router que no
// usa el genérico, por la subida multipart) — evita mantener el mismo
// parseo/clamp de ?limit= en dos lugares.
export function parseLimit(raw: unknown, { max, defaultValue }: { max: number; defaultValue: number }): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : defaultValue;
}
