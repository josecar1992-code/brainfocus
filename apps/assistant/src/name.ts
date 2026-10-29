// Nombre con el que Quicks llama a la persona. Entra al prompt del sistema, así que se limpia fuerte: una sola
// línea, solo letras/espacios/apóstrofe/guion/punto y largo acotado, para que nadie pueda colar instrucciones.
const MAX_LEN = 40;

export function cleanDisplayName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.normalize("NFC").replace(/[^\p{L}\p{M}' .-]/gu, "").replace(/\s+/g, " ").trim();
  if (name.length === 0 || name.length > MAX_LEN) return null;
  return name;
}
