import { describe, it, expect } from "vitest";
import { dueOccurrence, mileageOccurrence, latestOccurrence, type RecurringRow } from "./occurrence.js";

// Todas las horas están dadas en Costa Rica (-06:00).
const at = (s: string) => Date.parse(s);
const base: RecurringRow = {
  id: "r", title: "t", schedule_type: "recurring", scheduled_at: null, is_instruction: false,
  frequency: null, interval_hours: null, time_of_day: null, day_of_week: null, active: true,
  created_at: "2026-10-01T00:00:00-06:00", last_fired_at: null,
};

describe("recurrentes", () => {
  it("cada N horas cae en múltiplos de N del reloj de Costa Rica", () => {
    const row = { ...base, frequency: "every_n_hours" as const, interval_hours: 4 };
    expect(latestOccurrence(row, at("2026-10-29T10:30:00-06:00"))).toBe(at("2026-10-29T08:00:00-06:00"));
  });

  it("diario: hoy si ya pasó la hora, ayer si no", () => {
    const row = { ...base, frequency: "daily" as const, time_of_day: "09:00" };
    expect(latestOccurrence(row, at("2026-10-29T10:00:00-06:00"))).toBe(at("2026-10-29T09:00:00-06:00"));
    expect(latestOccurrence(row, at("2026-10-29T08:00:00-06:00"))).toBe(at("2026-10-28T09:00:00-06:00"));
  });

  it("semanal: el último día de la semana pedido (jueves = 4; 29-oct-2026 es jueves)", () => {
    const row = { ...base, frequency: "weekly" as const, time_of_day: "18:00", day_of_week: 4 };
    expect(latestOccurrence(row, at("2026-10-29T19:00:00-06:00"))).toBe(at("2026-10-29T18:00:00-06:00"));
    expect(latestOccurrence(row, at("2026-10-29T17:00:00-06:00"))).toBe(at("2026-10-22T18:00:00-06:00"));
  });

  it("no usa la zona del proceso: 23:30 en Costa Rica sigue siendo el mismo día", () => {
    const row = { ...base, frequency: "daily" as const, time_of_day: "23:00" };
    expect(latestOccurrence(row, at("2026-10-29T23:30:00-06:00"))).toBe(at("2026-10-29T23:00:00-06:00"));
  });

  it("no dispara lo anterior a la creación ni lo ya entregado", () => {
    const daily = { ...base, frequency: "daily" as const, time_of_day: "09:00", created_at: "2026-10-29T10:00:00-06:00" };
    expect(dueOccurrence(daily, at("2026-10-29T11:00:00-06:00"))).toBeNull(); // las 9:00 de hoy son previas a crearlo
    const fired = { ...daily, created_at: "2026-10-01T00:00:00-06:00", last_fired_at: "2026-10-29T09:00:00-06:00" };
    expect(dueOccurrence(fired, at("2026-10-29T11:00:00-06:00"))).toBeNull();
    expect(dueOccurrence({ ...fired, last_fired_at: null }, at("2026-10-29T11:00:00-06:00"))).toBe(at("2026-10-29T09:00:00-06:00"));
  });

  it("una sola vez: se entrega una vez, tarde también", () => {
    const once = { ...base, schedule_type: "once" as const, scheduled_at: "2026-10-29T08:00:00-06:00" };
    expect(dueOccurrence(once, at("2026-10-29T07:00:00-06:00"))).toBeNull();
    expect(dueOccurrence(once, at("2026-10-30T07:00:00-06:00"))).toBe(at("2026-10-29T08:00:00-06:00"));
    expect(dueOccurrence({ ...once, last_fired_at: once.scheduled_at }, at("2026-10-30T07:00:00-06:00"))).toBeNull();
  });

  it("pausado no dispara", () => {
    const row = { ...base, frequency: "daily" as const, time_of_day: "09:00", active: false };
    expect(dueOccurrence(row, at("2026-10-29T10:00:00-06:00"))).toBeNull();
  });
});

describe("aviso de kilometraje", () => {
  it("9:00 de los días impares", () => {
    expect(mileageOccurrence(at("2026-10-29T10:00:00-06:00"), null)).toBe(at("2026-10-29T09:00:00-06:00")); // 29 impar
    expect(mileageOccurrence(at("2026-10-30T10:00:00-06:00"), null)).toBe(at("2026-10-29T09:00:00-06:00")); // 30 par → el 29
    expect(mileageOccurrence(at("2026-10-29T08:00:00-06:00"), null)).toBe(at("2026-10-27T09:00:00-06:00")); // antes de las 9
  });
  it("no repite y no manda uno viejo", () => {
    expect(mileageOccurrence(at("2026-10-29T10:00:00-06:00"), "2026-10-29T09:00:00-06:00")).toBeNull();
    expect(mileageOccurrence(at("2026-10-30T10:00:00-06:00"), "2026-10-27T09:00:00-06:00")).toBe(at("2026-10-29T09:00:00-06:00"));
  });
});
