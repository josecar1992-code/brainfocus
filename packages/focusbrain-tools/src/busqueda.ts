// Búsqueda por texto sin importar mayúsculas, tildes ni orden de palabras ("escribirle al de yale" ~ "Yale: escribirle").
// Se filtra acá (no con ILIKE en la API) justamente porque ILIKE no ignora tildes.

export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** true si TODAS las palabras de `consulta` aparecen (como prefijo/parte de palabra) en alguno de los `campos`. */
export function coincide(consulta: string, ...campos: (string | null | undefined)[]): boolean {
  const palabras = normalizar(consulta).split(" ").filter(Boolean);
  if (palabras.length === 0) return true;
  const pajar = normalizar(campos.filter(Boolean).join(" "));
  return palabras.every((p) => pajar.includes(p));
}
