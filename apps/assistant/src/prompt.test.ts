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

describe("nombre de la persona", () => {
  it("sin nombre, instruye preguntarlo en la primera respuesta y guardarlo", () => {
    const p = buildSystemPrompt("2026-10-29T10:00:00-06:00", null);
    expect(p).toContain("Todavía no sabés cómo se llama");
    expect(p).toContain("guardar_nombre");
    expect(p).toContain("todo lo que podés hacer");
  });
  it("con nombre, lo usa y no vuelve a preguntarlo", () => {
    const p = buildSystemPrompt("2026-10-29T10:00:00-06:00", "Ana");
    expect(p).toContain('La persona se llama "Ana"');
    expect(p).not.toContain("Todavía no sabés");
  });

  it("indica el formato de WhatsApp (negrita con un solo asterisco)", () => {
    expect(buildSystemPrompt("2026-10-29T10:00:00-06:00")).toContain("UN solo asterisco");
  });

  it("limita el alcance a la organización personal pero tolera charla breve", () => {
    const p = buildSystemPrompt("2026-10-29T10:00:00-06:00");
    expect(p).toContain("No sos un chat de propósito general");
    expect(p).toContain("una o dos frases");
  });
});

describe("modo job (tareas programadas)", () => {
  it("quita el límite de alcance y la negativa de internet, y nunca pregunta el nombre", () => {
    const job = buildSystemPrompt("2026-11-06T00:00:00-06:00", null, "job");
    expect(job).toContain("Tarea programada:");
    expect(job).toContain("buscar_web");
    expect(job).not.toContain("No tenés acceso a internet");
    expect(job).not.toContain("No sos un chat de propósito general");
    expect(job).not.toContain("cómo le gusta que le digas");
  });
  it("el chat directo sigue limitado", () => {
    const chat = buildSystemPrompt("2026-11-06T00:00:00-06:00", "Kim");
    expect(chat).toContain("No sos un chat de propósito general");
    expect(chat).toContain("No tenés acceso a internet");
    expect(chat).not.toContain("buscar_web");
  });
});
