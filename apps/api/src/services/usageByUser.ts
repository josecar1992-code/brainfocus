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
