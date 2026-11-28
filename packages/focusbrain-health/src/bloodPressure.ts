// Cálculos y clasificación hemodinámica (estándar AHA/ACC) — funciones puras, sin I/O,
// compartidas entre apps/api (al guardar una lectura) y apps/web (para mostrar badges
// sin esperar al round-trip). Ver especificación del módulo en PENDIENTES.md.

export type BPClassificationStatus =
  | "hypotension"
  | "isolated_low_diastolic"
  | "optimal"
  | "elevated"
  | "isolated_systolic"
  | "stage_1"
  | "stage_2"
  | "crisis";

export type MeasurementContext =
  | "fasting_rest"
  | "pre_dinner"
  | "post_meal"
  | "post_workout"
  | "with_symptoms"
  | "watch_calibration";

export interface BPClassificationResult {
  status: BPClassificationStatus;
  label: string;
  color: string;
  severity: number; // 0 (óptimo) a 4 (crítico)
}

export function calculateHemodynamics(sys: number, dia: number): { map: number; pulse_pressure: number } {
  const map = Math.round(dia + (sys - dia) / 3);
  const pulse_pressure = sys - dia;
  return { map, pulse_pressure };
}

// En medicina siempre predomina el parámetro más alterado entre sistólica y diastólica.
//
// Bug real confirmado el 24-nov-2026 (reportado por el usuario): la regla de stage_2 original
// disparaba con `sys >= 140 || dia >= 90`, así que una lectura como 145/65 (diastólica
// perfectamente normal) se clasificaba como "Hipertensión Grado 2" — alarma de severidad 3 por
// una sola toma con la diastólica sana. Fix: una sistólica elevada con diastólica normal
// (`sys >= 140 && dia < 80`) se separó en su propia categoría — "Sistólica Aislada" — típica en
// edad avanzada por rigidez arterial, con severidad menor (2, igual que Grado 1) en vez de la
// alarma fuerte de Grado 2. Esa excepción se evalúa ANTES de stage_2 para no perderla.
//
// Segundo bug real confirmado el 28-nov-2026 (reportado por el usuario): la regla de hipotensión
// original disparaba con `sys < 90 || dia < 60`, así que una lectura como 137/54 (sistólica
// perfectamente normal/alta, solo la diastólica baja) se marcaba en azul como "Presión Baja
// (Hipotensión)" — un falso positivo, porque con la sistólica en ese rango no hay hipotensión
// real. Fix: hipotensión ahora depende únicamente de la sistólica (`sys < 90`); una diastólica
// baja con sistólica normal (90-129) es su propia categoría leve ("Diastólica Baja Aislada"),
// no hipotensión. Por orden de evaluación, Elevada (120-129) sigue teniendo prioridad sobre esta
// categoría cuando ambas aplicarían.
export function classifyBloodPressure(sys: number, dia: number): BPClassificationResult {
  if (sys >= 180 || dia >= 120) {
    return { status: "crisis", label: "Crisis Hipertensiva", color: "#DC2626", severity: 4 };
  }
  if (sys >= 140 && dia < 80) {
    return { status: "isolated_systolic", label: "Sistólica Elevada (Aislada)", color: "#F59E0B", severity: 2 };
  }
  if (sys >= 140 || dia >= 90) {
    return { status: "stage_2", label: "Hipertensión Grado 2", color: "#EF4444", severity: 3 };
  }
  if ((sys >= 130 && sys <= 139) || (dia >= 80 && dia <= 89)) {
    return { status: "stage_1", label: "Hipertensión Grado 1", color: "#F97316", severity: 2 };
  }
  if (sys >= 120 && sys <= 129 && dia < 80) {
    return { status: "elevated", label: "Elevada (Alerta Temprana)", color: "#EAB308", severity: 1 };
  }
  if (sys < 90) {
    return { status: "hypotension", label: "Presión Baja (Hipotensión)", color: "#3B82F6", severity: 3 };
  }
  if (dia < 60) {
    return { status: "isolated_low_diastolic", label: "Normal (Diastólica Baja Aislada)", color: "#14B8A6", severity: 0 };
  }
  return { status: "optimal", label: "Normal / Óptima", color: "#10B981", severity: 0 };
}

export interface BPAlertInput {
  systolic: number;
  diastolic: number;
  context: MeasurementContext;
  irregular_heartbeat: boolean;
  classification: BPClassificationStatus;
}

export interface BPProfileForAlerts {
  is_medicated: boolean;
}

export interface BPAlert {
  kind: "hypotension_medicated" | "systolic_drop_medicated" | "irregular_heartbeat_streak" | "acute_context_variation";
  message: string;
}

/**
 * Reglas 3.3 de la especificación. `last7DaysAvgSystolic` y
 * `irregularHeartbeatCountLast7Days` los calcula el caller (requieren historial, no
 * es responsabilidad de esta función pura hacer I/O).
 */
export function evaluateAlerts(
  reading: BPAlertInput,
  profile: BPProfileForAlerts,
  history: { last7DaysAvgSystolic: number | null; irregularHeartbeatCountLast7Days: number },
): BPAlert[] {
  const alerts: BPAlert[] = [];

  if (profile.is_medicated) {
    if (reading.classification === "hypotension") {
      alerts.push({
        kind: "hypotension_medicated",
        message: "Hipotensión en perfil medicado — posible sobre-medicación o bajada posprandial, vigilar de cerca.",
      });
    } else if (history.last7DaysAvgSystolic != null && reading.systolic <= history.last7DaysAvgSystolic - 20) {
      alerts.push({
        kind: "systolic_drop_medicated",
        message: `Caída de ${Math.round(history.last7DaysAvgSystolic - reading.systolic)} mmHg en sistólica respecto al promedio de 7 días — revisar con el médico.`,
      });
    }
  }

  if (reading.irregular_heartbeat && history.irregularHeartbeatCountLast7Days + 1 >= 2) {
    alerts.push({
      kind: "irregular_heartbeat_streak",
      message: "Ritmo irregular detectado 2 o más veces en los últimos 7 días — se sugiere valoración médica.",
    });
  }

  if (
    (reading.context === "post_meal" || reading.context === "post_workout") &&
    (reading.classification === "elevated" || reading.classification === "stage_1" || reading.classification === "isolated_systolic")
  ) {
    alerts.push({
      kind: "acute_context_variation",
      message: "Variación fisiológica esperada por digestión/ejercicio — no es necesariamente una alarma.",
    });
  }

  return alerts;
}
