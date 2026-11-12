// Detección de avisos/instrucciones del módulo Asistente que se parecen (ej. cuatro "devocional bíblico" a distintas horas).
// Es determinista: Quicks solo recibe los grupos ya calculados y se los cuenta a la persona; no decide qué se parece.

export interface AvisoLike {
  id: string;
  title: string;
  active?: boolean;
  schedule_type?: string;
  frequency?: string | null;
  time_of_day?: string | null;
  scheduled_at?: string | null;
}

// Palabras de relleno que no distinguen un aviso de otro ("quiero que me des un recordatorio cada día para…").
const STOP = new Set([
  "quiero", "que", "me", "des", "dame", "damela", "dar", "cada", "dia", "dias", "diario", "diaria", "para", "hacer", "haz", "hazme",
  "recordatorio", "recordame", "recordarme", "aviso", "avisame", "un", "una", "uno", "el", "la", "los", "las", "de", "del", "en",
  "con", "por", "mi", "mis", "tu", "mas", "nuevo", "nueva", "todos", "todas", "tiene", "ser", "sea", "puedes", "puede", "favor",
]);

function tokens(title: string): Set<string> {
  const norm = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9ñ\s]/g, " ");
  return new Set(norm.split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
}

function similar(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  // Casi iguales (Jaccard) o uno contenido en el otro con al menos 2 palabras en común.
  return inter / union >= 0.6 || (inter >= 2 && inter === Math.min(a.size, b.size));
}

/** Grupos de avisos parecidos entre sí (cada grupo tiene 2 o más). Solo compara avisos activos del mismo tipo. */
export function findSimilarAvisos<T extends AvisoLike>(avisos: T[]): T[][] {
  const live = avisos.filter((a) => a.active !== false);
  const toks = new Map(live.map((a) => [a.id, tokens(a.title)] as const));
  const seen = new Set<string>();
  const groups: T[][] = [];
  for (const a of live) {
    if (seen.has(a.id)) continue;
    const group = [a];
    for (const b of live) {
      if (b.id === a.id || seen.has(b.id) || b.schedule_type !== a.schedule_type) continue;
      if (similar(toks.get(a.id)!, toks.get(b.id)!)) group.push(b);
    }
    if (group.length > 1) {
      for (const g of group) seen.add(g.id);
      groups.push(group);
    }
  }
  return groups;
}

/** Avisos existentes que se parecen a un título nuevo (para avisar antes/después de crearlo). */
export function similarTo<T extends AvisoLike>(title: string, scheduleType: string, existing: T[]): T[] {
  const t = tokens(title);
  return existing.filter((e) => e.active !== false && e.schedule_type === scheduleType && similar(t, tokens(e.title)));
}
