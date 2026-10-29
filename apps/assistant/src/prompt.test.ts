import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "./prompt.js";

describe("prompt del asistente", () => {
  const p = buildSystemPrompt("2026-10-29T10:00:00-06:00");

  it("lleva la hora de Costa Rica con offset", () => {
    expect(p).toContain("2026-10-29T10:00:00-06:00");
  });

  it("no filtra nada personal del dueño ni mecanismos de OpenClaw (hay otros usuarios)", () => {
    for (const forbidden of ["José", "Jose", "+506", "Meylin", "Quickwash", "QuickWash", "memorias.md", "cron", "OpenClaw", "allowlist", "recordatorio_general"]) {
      expect(p).not.toContain(forbidden);
    }
  });

  it("conserva las reglas de honestidad y de fechas", () => {
    expect(p).toContain("NUNCA inventes");
    expect(p).toContain("-06:00");
    expect(p).toContain("_costa_rica");
  });
});
