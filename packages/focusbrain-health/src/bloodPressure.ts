// Cálculos y clasificación hemodinámica (estándar AHA/ACC) — funciones puras, sin I/O,
// compartidas entre apps/api (al guardar una lectura) y apps/web (para mostrar badges
// sin esperar al round-trip). Ver especificación del módulo en PENDIENTES.md.

export type BPClassificationStatus = "hypotension" | "optimal" | "elevated" | "stage_1" | "stage_2" | "crisis";

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
export function classifyBloodPressure(sys: number, dia: number): BPClassificationResult {
  if (sys >= 180 || dia >= 120) {
    return { status: "crisis", label: "Crisis Hipertensiva", color: "#DC2626", severity: 4 };
  }
  if (sys < 90 || dia < 60) {
    return { status: "hypotension", label: "Presión Baja (Hipotensión)", color: "#3B82F6", severity: 3 };
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

  if ((reading.context === "post_meal" || reading.context === "post_workout") && (reading.classification === "elevated" || reading.classification === "stage_1")) {
    alerts.push({
      kind: "acute_context_variation",
      message: "Variación fisiológica esperada por digestión/ejercicio — no es necesariamente una alarma.",
    });
  }

  return alerts;
}
