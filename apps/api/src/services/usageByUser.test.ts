import { describe, it, expect } from "vitest";
import { aggregateUsage, crRangeBounds } from "./usageByUser.js";

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
