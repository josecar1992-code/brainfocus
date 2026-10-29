import { describe, it, expect } from "vitest";
import { aggregateUsage, crRangeBounds, mergeUsage, ownerUsageFromOpenclaw } from "./usageByUser.js";

const row = (user_id: string, p: number, c: number, calls = 1) => ({ user_id, prompt_tokens: p, completion_tokens: c, llm_calls: calls });

describe("aggregateUsage", () => {
  it("suma por usuario sin mezclar y ordena por tokens", () => {
    const out = aggregateUsage([row("a", 100, 10), row("b", 5000, 500, 3), row("a", 200, 20, 2)], { inputPerMillionUsd: null, outputPerMillionUsd: null });
    expect(out.map((u) => u.user_id)).toEqual(["b", "a"]);
    expect(out[1]).toMatchObject({ turns: 2, llm_calls: 3, prompt_tokens: 300, completion_tokens: 30, estimated_usd: null });
  });
  it("estima el costo solo con precios configurados", () => {
    const [u] = aggregateUsage([row("a", 1_000_000, 500_000)], { inputPerMillionUsd: 0.4, outputPerMillionUsd: 1.2 });
    expect(u.estimated_usd).toBeCloseTo(0.4 + 0.6);
  });
});

describe("crRangeBounds", () => {
  it("usa el día calendario de Costa Rica", () => {
    expect(crRangeBounds("2026-10-01", "2026-10-31")).toEqual({ from: "2026-10-01T00:00:00-06:00", to: "2026-10-31T23:59:59.999-06:00" });
  });
});

describe("consumo del dueño desde OpenClaw", () => {
  const rows = [
    { costo_usd: "0.05", detalle: { llamadas: 10, input_tokens: 100, cache_read_tokens: 900, output_tokens: 50 } },
    { costo_usd: 0.1, detalle: { llamadas: 5, input_tokens: 200, cache_read_tokens: 0, output_tokens: 20 } },
  ];
  it("suma llamadas, tokens (con caché) y el costo real", () => {
    const u = ownerUsageFromOpenclaw("owner", rows)!;
    expect(u).toMatchObject({ user_id: "owner", llm_calls: 15, prompt_tokens: 1200, completion_tokens: 70, source: "openclaw" });
    expect(u.estimated_usd).toBeCloseTo(0.15);
  });
  it("sin filas no hay fila", () => {
    expect(ownerUsageFromOpenclaw("owner", [])).toBeNull();
  });
  it("mergeUsage agrega al dueño y ordena por tokens", () => {
    const a = { user_id: "x", turns: 1, llm_calls: 1, prompt_tokens: 10, completion_tokens: 1, estimated_usd: 0.01 };
    const merged = mergeUsage([a], ownerUsageFromOpenclaw("owner", rows));
    expect(merged.map((m) => m.user_id)).toEqual(["owner", "x"]);
  });
  it("mergeUsage combina si el dueño también está en el asistente", () => {
    const a = { user_id: "owner", turns: 2, llm_calls: 3, prompt_tokens: 100, completion_tokens: 10, estimated_usd: 0.01 };
    const [m] = mergeUsage([a], ownerUsageFromOpenclaw("owner", rows));
    expect(m).toMatchObject({ turns: 2, llm_calls: 18, prompt_tokens: 1300, source: "openclaw" });
  });
});
