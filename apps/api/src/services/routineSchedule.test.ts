import { describe, expect, it } from "vitest";
import { describeRecurrence, firstOccurrenceDate, nextOccurrenceDate, type RecurrenceRule } from "./routineSchedule.js";

const daily: RecurrenceRule = {
  frequency: "daily",
  intervalWeeks: 1,
  daysOfWeek: [],
  dayOfMonth: null,
  startDate: "2026-01-01",
};

// martes y viernes, todas las semanas
const weeklyTueFri: RecurrenceRule = {
  frequency: "weekly",
  intervalWeeks: 1,
  daysOfWeek: [2, 5],
  dayOfMonth: null,
  startDate: "2026-01-01", // jueves
};

// domingo, de por medio (cada 2 semanas) — 2026-01-04 es domingo, semana ancla
const biweeklySunday: RecurrenceRule = {
  frequency: "weekly",
  intervalWeeks: 2,
  daysOfWeek: [0],
  dayOfMonth: null,
  startDate: "2026-01-04",
};

// el 15 de cada mes
const monthly15th: RecurrenceRule = {
  frequency: "monthly",
  intervalWeeks: 1,
  daysOfWeek: [],
  dayOfMonth: 15,
  startDate: "2026-01-01",
};

// el 30 de cada mes (30 es el tope permitido — el 31 no se ofrece porque no
// existe en varios meses del año, ver day_of_month en routines.ts) — para
// probar el clamp en el único mes que sí choca: febrero.
const monthly30th: RecurrenceRule = {
  frequency: "monthly",
  intervalWeeks: 1,
  daysOfWeek: [],
  dayOfMonth: 30,
  startDate: "2026-01-01",
};

describe("firstOccurrenceDate", () => {
  it("diaria: hoy mismo si today >= startDate", () => {
    expect(firstOccurrenceDate(daily, "2026-03-10")).toBe("2026-03-10");
  });

  it("diaria: usa startDate si es futuro respecto a today", () => {
    expect(firstOccurrenceDate(daily, "2025-12-01")).toBe("2026-01-01");
  });

  it("semanal (mar/vie): busca el próximo día que matchea desde today", () => {
    // 2026-03-09 es lunes -> el próximo martes es 2026-03-10
    expect(firstOccurrenceDate(weeklyTueFri, "2026-03-09")).toBe("2026-03-10");
  });

  it("semanal (mar/vie): today que ya matchea se devuelve tal cual", () => {
    // 2026-03-10 es martes
    expect(firstOccurrenceDate(weeklyTueFri, "2026-03-10")).toBe("2026-03-10");
  });

  it("quincenal (domingo de por medio): respeta la paridad de semanas desde el ancla", () => {
    // Ancla 2026-01-04 (domingo, semana 0). 2026-01-11 es la semana 1 (impar, no matchea).
    // 2026-01-18 es la semana 2 (par, sí matchea).
    expect(firstOccurrenceDate(biweeklySunday, "2026-01-05")).toBe("2026-01-18");
  });

  it("quincenal: el propio startDate matchea como primera ocurrencia si today <= startDate", () => {
    expect(firstOccurrenceDate(biweeklySunday, "2026-01-01")).toBe("2026-01-04");
  });

  it("mensual (día 15): busca el 15 del mes actual si today <= 15", () => {
    expect(firstOccurrenceDate(monthly15th, "2026-03-01")).toBe("2026-03-15");
  });

  it("mensual (día 15): salta al mes siguiente si today ya pasó el 15", () => {
    expect(firstOccurrenceDate(monthly15th, "2026-03-20")).toBe("2026-04-15");
  });

  it("mensual (día 30): en un mes de 30 días cae justo en el 30, sin clamp", () => {
    expect(firstOccurrenceDate(monthly30th, "2026-04-01")).toBe("2026-04-30");
  });

  it("mensual (día 30): cae el 28 en febrero (2026 no es bisiesto)", () => {
    expect(firstOccurrenceDate(monthly30th, "2026-02-01")).toBe("2026-02-28");
  });
});

describe("nextOccurrenceDate", () => {
  it("diaria: siempre el día siguiente", () => {
    expect(nextOccurrenceDate(daily, "2026-03-10")).toBe("2026-03-11");
  });

  it("semanal (mar/vie): de martes salta al viernes de la misma semana", () => {
    expect(nextOccurrenceDate(weeklyTueFri, "2026-03-10")).toBe("2026-03-13");
  });

  it("semanal (mar/vie): de viernes salta al martes de la semana siguiente", () => {
    expect(nextOccurrenceDate(weeklyTueFri, "2026-03-13")).toBe("2026-03-17");
  });

  it("quincenal: salta la semana intermedia (no la de por medio)", () => {
    // Desde 2026-01-04 (semana 0, matchea), la siguiente es 2026-01-18 (semana 2),
    // no 2026-01-11 (semana 1, no matchea por la paridad).
    expect(nextOccurrenceDate(biweeklySunday, "2026-01-04")).toBe("2026-01-18");
  });

  it("es estrictamente posterior: nunca devuelve la misma fecha de entrada aunque matchee", () => {
    const next = nextOccurrenceDate(weeklyTueFri, "2026-03-10");
    expect(next).not.toBe("2026-03-10");
  });

  it("mensual (día 15): de un 15 salta al 15 del mes siguiente", () => {
    expect(nextOccurrenceDate(monthly15th, "2026-03-15")).toBe("2026-04-15");
  });

  it("mensual (día 30): de un mes corto (28 de feb) salta al 30 de marzo, no se queda repitiendo febrero", () => {
    expect(nextOccurrenceDate(monthly30th, "2026-02-28")).toBe("2026-03-30");
  });
});

describe("describeRecurrence", () => {
  it("diaria", () => {
    expect(describeRecurrence(daily)).toBe("Todos los días");
  });

  it("semanal simple, ordena los días aunque la entrada no venga ordenada", () => {
    const rule: RecurrenceRule = { ...weeklyTueFri, daysOfWeek: [5, 2] };
    expect(describeRecurrence(rule)).toBe("Cada semana: martes, viernes");
  });

  it("cada N semanas", () => {
    expect(describeRecurrence(biweeklySunday)).toBe("Cada 2 semanas: domingo");
  });

  it("mensual", () => {
    expect(describeRecurrence(monthly15th)).toBe("El día 15 de cada mes");
  });
});
