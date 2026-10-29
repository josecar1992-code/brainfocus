// Consumo del asistente por usuario (tabla assistant_usage, escrita por apps/assistant en cada turno).
export interface UsageRow {
  user_id: string;
  prompt_tokens: number;
  completion_tokens: number;
  llm_calls: number;
}

export interface UserUsage {
  user_id: string;
  turns: number;
  llm_calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  /** null si no hay precios configurados (QWEN_PRICE_*): es una estimación por tokens, no el cobro real. */
  estimated_usd: number | null;
  /** "openclaw" = Quicks del dueño en OpenClaw (costo real exportado, tokens incluyen caché); ausente = asistente compartido. */
  source?: "openclaw";
}

export interface Pricing {
  inputPerMillionUsd: number | null;
  outputPerMillionUsd: number | null;
}

export function aggregateUsage(rows: UsageRow[], pricing: Pricing): UserUsage[] {
  const byUser = new Map<string, UserUsage>();
  for (const r of rows) {
    const u = byUser.get(r.user_id) ?? { user_id: r.user_id, turns: 0, llm_calls: 0, prompt_tokens: 0, completion_tokens: 0, estimated_usd: null };
    u.turns += 1;
    u.llm_calls += r.llm_calls;
    u.prompt_tokens += r.prompt_tokens;
    u.completion_tokens += r.completion_tokens;
    byUser.set(r.user_id, u);
  }
  const priced = pricing.inputPerMillionUsd !== null && pricing.outputPerMillionUsd !== null;
  return [...byUser.values()]
    .map((u) => ({
      ...u,
      estimated_usd: priced
        ? (u.prompt_tokens / 1e6) * pricing.inputPerMillionUsd! + (u.completion_tokens / 1e6) * pricing.outputPerMillionUsd!
        : null,
    }))
    .sort((a, b) => b.prompt_tokens + b.completion_tokens - (a.prompt_tokens + a.completion_tokens));
}

/** Límites del rango en hora de Costa Rica (-06:00 explícito): el día calendario CR, no UTC ni la zona del servidor. */
export function crRangeBounds(desde: string, hasta: string): { from: string; to: string } {
  return { from: `${desde}T00:00:00-06:00`, to: `${hasta}T23:59:59.999-06:00` };
}

/** Una fila de `consumos` (origen openclaw-export) con el detalle diario que exporta OpenClaw. */
export interface OpenclawConsumoRow {
  costo_usd: number | string;
  detalle: { llamadas?: number; input_tokens?: number; output_tokens?: number; cache_read_tokens?: number } | null;
}

/**
 * Consumo de Quicks en OpenClaw (el del dueño) a partir de lo que ya se exporta a `consumos`. El costo es el que
 * calculó OpenClaw (ya considera el caché), no una estimación por tokens. null si no hay filas en el rango.
 */
export function ownerUsageFromOpenclaw(userId: string, rows: OpenclawConsumoRow[]): UserUsage | null {
  if (rows.length === 0) return null;
  const u: UserUsage = { user_id: userId, turns: 0, llm_calls: 0, prompt_tokens: 0, completion_tokens: 0, estimated_usd: 0, source: "openclaw" };
  for (const r of rows) {
    const d = r.detalle ?? {};
    u.llm_calls += d.llamadas ?? 0;
    u.prompt_tokens += (d.input_tokens ?? 0) + (d.cache_read_tokens ?? 0);
    u.completion_tokens += d.output_tokens ?? 0;
    u.estimated_usd = (u.estimated_usd ?? 0) + Number(r.costo_usd);
  }
  return u;
}

/** Une el consumo de OpenClaw con el del asistente si la misma persona tiene de los dos; ordena por tokens. */
export function mergeUsage(assistant: UserUsage[], openclaw: UserUsage | null): UserUsage[] {
  if (!openclaw) return assistant;
  const rest = assistant.filter((a) => a.user_id !== openclaw.user_id);
  const same = assistant.find((a) => a.user_id === openclaw.user_id);
  const merged: UserUsage = same
    ? {
        ...openclaw,
        turns: same.turns,
        llm_calls: openclaw.llm_calls + same.llm_calls,
        prompt_tokens: openclaw.prompt_tokens + same.prompt_tokens,
        completion_tokens: openclaw.completion_tokens + same.completion_tokens,
        estimated_usd: (openclaw.estimated_usd ?? 0) + (same.estimated_usd ?? 0),
      }
    : openclaw;
  return [...rest, merged].sort((a, b) => b.prompt_tokens + b.completion_tokens - (a.prompt_tokens + a.completion_tokens));
}
