import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { classifyBloodPressure, type MeasurementContext as MC } from "@brainfocus/focusbrain-health";
import {
  api,
  type BodyCompositionLog,
  type BpReading,
  type HealthProfile,
  type NewBodyCompositionLog,
  type NewBpReading,
  type NewHealthProfile,
  type NewWeightLog,
  type WeightLog,
} from "./api";
import { ConfirmDialog } from "./ConfirmDialog";
import { CornerBrackets } from "./CornerBrackets";
import { IconX } from "./icons";
import { QuickBadge } from "./QuickBadge";

const CONTEXT_LABELS: Record<MC, string> = {
  fasting_rest: "En ayunas / reposo",
  pre_dinner: "Pre-cena / tarde",
  post_meal: "Post-comida",
  post_workout: "Post-entrenamiento",
  with_symptoms: "Con síntomas",
  watch_calibration: "Calibración de reloj",
};
const CONTEXT_OPTIONS = Object.keys(CONTEXT_LABELS) as MC[];

const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function fieldClass() {
  return "border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 placeholder:text-white/30 focus:outline-none focus:border-electric-cyan/70 text-sm";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-CR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Costa_Rica" });
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-CR", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Costa_Rica",
  });
}

function calcAge(birthDate: string): number {
  const b = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

// Hora en Costa Rica a partir de un ISO, sin depender de la zona horaria del
// dispositivo (misma regla del proyecto que formatDate/formatDateTime).
function hourInCR(iso: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Costa_Rica", hour: "2-digit", hour12: false }).formatToParts(
    new Date(iso),
  );
  return Number(parts.find((p) => p.type === "hour")?.value ?? "0");
}

// --- Formulario de perfil (crear/editar) ---------------------------------

function ProfileForm({
  initial,
  onSubmit,
  onCancel,
  pending,
  error,
  submitLabel,
}: {
  initial?: Partial<NewHealthProfile>;
  onSubmit: (input: NewHealthProfile) => void;
  onCancel: () => void;
  pending: boolean;
  error: string | null;
  submitLabel: string;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [birthDate, setBirthDate] = useState(initial?.birth_date ?? "");
  const [isMedicated, setIsMedicated] = useState(initial?.is_medicated ?? false);
  const [targetWeight, setTargetWeight] = useState(initial?.target_weight_kg != null ? String(initial.target_weight_kg) : "");
  const [watchEnabled, setWatchEnabled] = useState(initial?.watch_calibration_enabled ?? false);

  const [weightReminderEnabled, setWeightReminderEnabled] = useState(initial?.weight_reminder_enabled ?? false);
  const [weightReminderDay, setWeightReminderDay] = useState(String(initial?.weight_reminder_day_of_week ?? 0));
  const [weightReminderTime, setWeightReminderTime] = useState(initial?.weight_reminder_time ?? "09:00");

  const [bpReminderEnabled, setBpReminderEnabled] = useState(initial?.bp_reminder_enabled ?? false);
  const [bpReminderFrequency, setBpReminderFrequency] = useState<"daily" | "weekly">(initial?.bp_reminder_frequency ?? "daily");
  const [bpReminderDay, setBpReminderDay] = useState(String(initial?.bp_reminder_day_of_week ?? 0));
  const [bpReminderTime, setBpReminderTime] = useState(initial?.bp_reminder_time ?? "07:00");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !birthDate) return;
    onSubmit({
      name: name.trim(),
      birth_date: birthDate,
      is_medicated: isMedicated,
      target_weight_kg: targetWeight ? Number(targetWeight) : null,
      watch_calibration_enabled: watchEnabled,
      weight_reminder_enabled: weightReminderEnabled,
      weight_reminder_day_of_week: weightReminderEnabled ? Number(weightReminderDay) : null,
      weight_reminder_time: weightReminderEnabled ? weightReminderTime : null,
      bp_reminder_enabled: bpReminderEnabled,
      bp_reminder_frequency: bpReminderEnabled ? bpReminderFrequency : null,
      bp_reminder_day_of_week: bpReminderEnabled && bpReminderFrequency === "weekly" ? Number(bpReminderDay) : null,
      bp_reminder_time: bpReminderEnabled ? bpReminderTime : null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-2">
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs text-white/50">Nombre</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ej. Yo, Mamá" className={fieldClass()} />
        </div>
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs text-white/50">Fecha de nacimiento</label>
          <input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className={`${fieldClass()} [color-scheme:dark]`}
          />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:gap-2">
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs text-white/50">Meta de peso (kg, opcional)</label>
          <input
            type="number"
            value={targetWeight}
            onChange={(e) => setTargetWeight(e.target.value)}
            placeholder="ej. 75"
            className={fieldClass()}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-white/70">
        <input type="checkbox" checked={isMedicated} onChange={(e) => setIsMedicated(e.target.checked)} className="accent-electric-cyan" />
        Perfil medicado (prioriza alertas de hipotensión y bajadas bruscas)
      </label>

      <label className="flex items-center gap-2 text-sm text-white/70">
        <input type="checkbox" checked={watchEnabled} onChange={(e) => setWatchEnabled(e.target.checked)} className="accent-electric-cyan" />
        Calibrar Galaxy Watch cada 28 días
      </label>

      <div className="border-t border-white/8 pt-3">
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input
            type="checkbox"
            checked={weightReminderEnabled}
            onChange={(e) => setWeightReminderEnabled(e.target.checked)}
            className="accent-electric-cyan"
          />
          Recordatorio de peso (semanal)
        </label>
        {weightReminderEnabled && (
          <div className="flex gap-2 mt-2">
            <select value={weightReminderDay} onChange={(e) => setWeightReminderDay(e.target.value)} className={`${fieldClass()} [color-scheme:dark] flex-1`}>
              {DAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
            <input
              type="time"
              value={weightReminderTime}
              onChange={(e) => setWeightReminderTime(e.target.value)}
              className={`${fieldClass()} [color-scheme:dark]`}
            />
          </div>
        )}
      </div>

      <div className="border-t border-white/8 pt-3">
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input
            type="checkbox"
            checked={bpReminderEnabled}
            onChange={(e) => setBpReminderEnabled(e.target.checked)}
            className="accent-electric-cyan"
          />
          Recordatorio de presión arterial
        </label>
        {bpReminderEnabled && (
          <div className="flex gap-2 mt-2">
            <select
              value={bpReminderFrequency}
              onChange={(e) => setBpReminderFrequency(e.target.value as "daily" | "weekly")}
              className={`${fieldClass()} [color-scheme:dark]`}
            >
              <option value="daily">Diario</option>
              <option value="weekly">Semanal</option>
            </select>
            {bpReminderFrequency === "weekly" && (
              <select value={bpReminderDay} onChange={(e) => setBpReminderDay(e.target.value)} className={`${fieldClass()} [color-scheme:dark] flex-1`}>
                {DAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            )}
            <input
              type="time"
              value={bpReminderTime}
              onChange={(e) => setBpReminderTime(e.target.value)}
              className={`${fieldClass()} [color-scheme:dark]`}
            />
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex gap-2 mt-1">
        <button type="button" onClick={onCancel} className="flex-1 border border-white/10 rounded-lg px-3 py-2 text-white/70 hover:bg-white/5">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 bg-gradient-to-br from-deep-blue via-electric-cyan to-electric-cyan text-night-blue font-semibold rounded-lg shadow-[0_0_18px_-4px_rgba(0,210,255,0.55)] px-3 py-2 disabled:opacity-50 hover:brightness-110 transition"
        >
          {pending ? "Guardando..." : submitLabel}
        </button>
      </div>
    </form>
  );
}

function ProfileModal({
  initial,
  profileId,
  onClose,
}: {
  initial?: HealthProfile;
  profileId?: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (input: NewHealthProfile) =>
      profileId ? api.updateHealthProfile(profileId, input) : api.createHealthProfile(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["health-profiles"] });
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "No se pudo guardar el perfil"),
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-20 overflow-y-auto py-8">
      <div className="relative w-full max-w-sm border border-electric-cyan/20 bg-night-blue rounded-2xl p-6 shadow-[0_0_60px_-15px_rgba(0,210,255,0.25)]">
        <CornerBrackets />
        <h2 className="text-lg font-medium mb-3">{profileId ? "Editar perfil" : "Nuevo perfil de salud"}</h2>
        <ProfileForm
          initial={initial}
          onSubmit={(input) => {
            setError(null);
            save.mutate(input);
          }}
          onCancel={onClose}
          pending={save.isPending}
          error={error}
          submitLabel={profileId ? "Guardar" : "Crear perfil"}
        />
      </div>
    </div>
  );
}

// --- Toma de peso -----------------------------------------------------

function WeightQuickForm({ profileId, onDone }: { profileId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [weight, setWeight] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (input: NewWeightLog) => api.createWeightLog(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["weight-logs", profileId] });
      queryClient.invalidateQueries({ queryKey: ["health-profiles"] });
      setWeight("");
      onDone();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "No se pudo guardar el peso"),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!weight) return setError("Poné el peso.");
    create.mutate({ profile_id: profileId, weight_kg: Number(weight) });
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 bg-black/20 rounded-xl p-3 border border-white/10">
      <input
        type="number"
        step="0.1"
        autoFocus
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        placeholder="Peso en kg"
        className={`${fieldClass()} flex-1`}
      />
      {error && <p className="text-xs text-red-400 self-center">{error}</p>}
      <button
        type="submit"
        disabled={create.isPending}
        className="bg-gradient-to-br from-deep-blue via-electric-cyan to-electric-cyan text-night-blue font-semibold rounded-lg shadow-[0_0_18px_-4px_rgba(0,210,255,0.55)] px-3 py-1.5 text-sm disabled:opacity-50 hover:brightness-110 transition flex-shrink-0"
      >
        {create.isPending ? "Guardando..." : "Guardar"}
      </button>
    </form>
  );
}

// --- Toma de presión arterial ------------------------------------------

function BpQuickForm({ profileId, onDone }: { profileId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [guided, setGuided] = useState(false);
  const [sys1, setSys1] = useState("");
  const [dia1, setDia1] = useState("");
  const [pulse1, setPulse1] = useState("");
  const [sys2, setSys2] = useState("");
  const [dia2, setDia2] = useState("");
  const [pulse2, setPulse2] = useState("");
  const [context, setContext] = useState<MC>("fasting_rest");
  const [irregular, setIrregular] = useState(false);
  const [armMovement, setArmMovement] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<{ kind: string; message: string }[]>([]);

  const create = useMutation({
    mutationFn: (input: NewBpReading) => api.createBpReading(input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["bp-readings", profileId] });
      setSys1("");
      setDia1("");
      setPulse1("");
      setSys2("");
      setDia2("");
      setPulse2("");
      setAlerts(data.alerts ?? []);
      if (!data.alerts?.length) onDone();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "No se pudo guardar la lectura"),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!sys1 || !dia1 || !pulse1) return setError("Completá sistólica, diastólica y pulso.");
    if (guided && (!sys2 || !dia2 || !pulse2)) return setError("Completá la segunda toma o desactivá 'Toma guiada'.");

    const systolic = guided ? Math.round((Number(sys1) + Number(sys2)) / 2) : Number(sys1);
    const diastolic = guided ? Math.round((Number(dia1) + Number(dia2)) / 2) : Number(dia1);
    const pulse = guided ? Math.round((Number(pulse1) + Number(pulse2)) / 2) : Number(pulse1);
    if (diastolic >= systolic) return setError("La diastólica debe ser menor que la sistólica.");

    create.mutate({
      profile_id: profileId,
      systolic,
      diastolic,
      pulse,
      context,
      irregular_heartbeat: irregular,
      arm_movement: armMovement,
      is_averaged_reading: guided,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 bg-black/20 rounded-xl p-3 border border-white/10">
      <label className="flex items-center gap-2 text-xs text-white/60">
        <input type="checkbox" checked={guided} onChange={(e) => setGuided(e.target.checked)} className="accent-electric-cyan" />
        Toma guiada (promedio de 2 mediciones, estándar clínico)
      </label>

      <div className="flex gap-2">
        <input type="number" value={sys1} onChange={(e) => setSys1(e.target.value)} placeholder={guided ? "SYS 1" : "SYS"} className={`${fieldClass()} flex-1 min-w-0 w-0`} />
        <input type="number" value={dia1} onChange={(e) => setDia1(e.target.value)} placeholder={guided ? "DIA 1" : "DIA"} className={`${fieldClass()} flex-1 min-w-0 w-0`} />
        <input type="number" value={pulse1} onChange={(e) => setPulse1(e.target.value)} placeholder={guided ? "PUL 1" : "PUL"} className={`${fieldClass()} flex-1 min-w-0 w-0`} />
      </div>

      {guided && (
        <div className="flex gap-2">
          <input type="number" value={sys2} onChange={(e) => setSys2(e.target.value)} placeholder="SYS 2" className={`${fieldClass()} flex-1 min-w-0 w-0`} />
          <input type="number" value={dia2} onChange={(e) => setDia2(e.target.value)} placeholder="DIA 2" className={`${fieldClass()} flex-1 min-w-0 w-0`} />
          <input type="number" value={pulse2} onChange={(e) => setPulse2(e.target.value)} placeholder="PUL 2" className={`${fieldClass()} flex-1 min-w-0 w-0`} />
        </div>
      )}

      <select value={context} onChange={(e) => setContext(e.target.value as MC)} className={`${fieldClass()} [color-scheme:dark]`}>
        {CONTEXT_OPTIONS.map((c) => (
          <option key={c} value={c}>
            {CONTEXT_LABELS[c]}
          </option>
        ))}
      </select>

      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-xs text-white/60">
          <input type="checkbox" checked={irregular} onChange={(e) => setIrregular(e.target.checked)} className="accent-electric-cyan" />
          Ritmo irregular
        </label>
        <label className="flex items-center gap-2 text-xs text-white/60">
          <input type="checkbox" checked={armMovement} onChange={(e) => setArmMovement(e.target.checked)} className="accent-electric-cyan" />
          Movimiento del brazo
        </label>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {alerts.length > 0 && (
        <div className="flex flex-col gap-1">
          {alerts.map((a) => (
            <p key={a.kind} className="text-xs text-amber-300 bg-amber-400/10 border border-amber-400/20 rounded-lg px-2 py-1.5">
              ⚠ {a.message}
            </p>
          ))}
          <button type="button" onClick={onDone} className="self-end text-xs text-electric-cyan hover:brightness-110">
            Entendido
          </button>
        </div>
      )}

      {!alerts.length && (
        <button
          type="submit"
          disabled={create.isPending}
          className="self-end bg-gradient-to-br from-deep-blue via-electric-cyan to-electric-cyan text-night-blue font-semibold rounded-lg shadow-[0_0_18px_-4px_rgba(0,210,255,0.55)] px-3 py-1.5 text-sm disabled:opacity-50 hover:brightness-110 transition"
        >
          {create.isPending ? "Guardando..." : "Guardar lectura"}
        </button>
      )}
    </form>
  );
}

// --- Composición corporal ------------------------------------------------

function BodyCompositionQuickForm({ profileId, onDone }: { profileId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [weight, setWeight] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [muscle, setMuscle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (input: NewBodyCompositionLog) => api.createBodyCompositionLog(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["body-composition-logs", profileId] });
      setWeight("");
      setBodyFat("");
      setMuscle("");
      onDone();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "No se pudo guardar"),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!weight && !bodyFat && !muscle) return setError("Completá al menos un dato.");
    create.mutate({
      profile_id: profileId,
      source: "manual",
      weight_kg: weight ? Number(weight) : undefined,
      body_fat_pct: bodyFat ? Number(bodyFat) : undefined,
      muscle_mass_kg: muscle ? Number(muscle) : undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 bg-black/20 rounded-xl p-3 border border-white/10">
      <div className="flex gap-2">
        <input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Peso kg" className={`${fieldClass()} flex-1 min-w-0 w-0`} />
        <input type="number" step="0.1" value={bodyFat} onChange={(e) => setBodyFat(e.target.value)} placeholder="% grasa" className={`${fieldClass()} flex-1 min-w-0 w-0`} />
        <input type="number" step="0.1" value={muscle} onChange={(e) => setMuscle(e.target.value)} placeholder="Músculo kg" className={`${fieldClass()} flex-1 min-w-0 w-0`} />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={create.isPending}
        className="self-end bg-gradient-to-br from-deep-blue via-electric-cyan to-electric-cyan text-night-blue font-semibold rounded-lg shadow-[0_0_18px_-4px_rgba(0,210,255,0.55)] px-3 py-1.5 text-sm disabled:opacity-50 hover:brightness-110 transition"
      >
        {create.isPending ? "Guardando..." : "Guardar"}
      </button>
    </form>
  );
}

// --- Reporte médico (export PDF / vista imprimible) -----------------------

const REPORT_RANGES = [7, 14, 30] as const;

function MedicalReportModal({
  profile,
  readings,
  onClose,
}: {
  profile: HealthProfile;
  readings: BpReading[];
  onClose: () => void;
}) {
  const [rangeDays, setRangeDays] = useState<(typeof REPORT_RANGES)[number]>(7);

  const filtered = useMemo(() => {
    const since = Date.now() - rangeDays * 24 * 60 * 60 * 1000;
    return readings.filter((r) => new Date(r.timestamp).getTime() >= since).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [readings, rangeDays]);

  const stats = useMemo(() => {
    if (!filtered.length) return null;
    const avg = (rows: BpReading[], key: "systolic" | "diastolic") =>
      rows.length ? Math.round(rows.reduce((sum, r) => sum + r[key], 0) / rows.length) : null;
    const am = filtered.filter((r) => hourInCR(r.timestamp) < 12);
    const pm = filtered.filter((r) => hourInCR(r.timestamp) >= 12);
    const minReading = filtered.reduce((min, r) => (r.systolic < min.systolic ? r : min), filtered[0]);
    const maxReading = filtered.reduce((max, r) => (r.systolic > max.systolic ? r : max), filtered[0]);
    return {
      general: { sys: avg(filtered, "systolic"), dia: avg(filtered, "diastolic") },
      am: { sys: avg(am, "systolic"), dia: avg(am, "diastolic") },
      pm: { sys: avg(pm, "systolic"), dia: avg(pm, "diastolic") },
      min: minReading,
      max: maxReading,
    };
  }, [filtered]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-30 overflow-y-auto py-8">
      <div className="print-area relative w-full max-w-2xl bg-white text-black rounded-2xl p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between print:hidden">
          <h2 className="text-lg font-semibold">Reporte médico — {profile.name}</h2>
          <button type="button" onClick={onClose} className="text-black/50 hover:text-black">
            <IconX />
          </button>
        </div>

        <div className="flex items-center gap-2 print:hidden">
          <span className="text-sm text-black/60">Periodo:</span>
          {REPORT_RANGES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setRangeDays(d)}
              className={`rounded-lg px-3 py-1 text-sm border ${rangeDays === d ? "bg-black text-white border-black" : "border-black/20 text-black/70 hover:bg-black/5"}`}
            >
              {d} días
            </button>
          ))}
          <button
            type="button"
            onClick={() => window.print()}
            className="ml-auto bg-gradient-to-br from-deep-blue via-electric-cyan to-electric-cyan text-night-blue font-semibold rounded-lg px-3 py-1.5 text-sm hover:brightness-110 transition"
          >
            Imprimir / Guardar PDF
          </button>
        </div>

        <div>
          <h1 className="text-xl font-bold">Reporte de presión arterial</h1>
          <p className="text-sm text-black/60">
            {profile.name} · {calcAge(profile.birth_date)} años · {profile.is_medicated ? "Medicado" : "No medicado"}
            {profile.current_weight_kg != null ? ` · ${profile.current_weight_kg} kg` : ""}
          </p>
          <p className="text-xs text-black/40 mt-0.5">
            Periodo: últimos {rangeDays} días · Generado el {formatDateTime(new Date().toISOString())}
          </p>
        </div>

        {!stats && <p className="text-sm text-black/50">Sin lecturas de presión en este periodo.</p>}

        {stats && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
              <div className="border border-black/10 rounded-lg p-2">
                <p className="text-[10px] uppercase text-black/40">Promedio</p>
                <p className="font-semibold">
                  {stats.general.sys}/{stats.general.dia}
                </p>
              </div>
              <div className="border border-black/10 rounded-lg p-2">
                <p className="text-[10px] uppercase text-black/40">Promedio AM</p>
                <p className="font-semibold">{stats.am.sys != null ? `${stats.am.sys}/${stats.am.dia}` : "—"}</p>
              </div>
              <div className="border border-black/10 rounded-lg p-2">
                <p className="text-[10px] uppercase text-black/40">Promedio PM</p>
                <p className="font-semibold">{stats.pm.sys != null ? `${stats.pm.sys}/${stats.pm.dia}` : "—"}</p>
              </div>
              <div className="border border-black/10 rounded-lg p-2">
                <p className="text-[10px] uppercase text-black/40">Mínima</p>
                <p className="font-semibold">
                  {stats.min.systolic}/{stats.min.diastolic}
                </p>
              </div>
              <div className="border border-black/10 rounded-lg p-2">
                <p className="text-[10px] uppercase text-black/40">Máxima</p>
                <p className="font-semibold">
                  {stats.max.systolic}/{stats.max.diastolic}
                </p>
              </div>
            </div>

            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-black/20 text-left text-black/50">
                  <th className="py-1 pr-2">Fecha</th>
                  <th className="py-1 pr-2">Hora</th>
                  <th className="py-1 pr-2">SYS/DIA</th>
                  <th className="py-1 pr-2">PUL</th>
                  <th className="py-1 pr-2">MAP</th>
                  <th className="py-1 pr-2">Contexto</th>
                  <th className="py-1 pr-2">Indicadores</th>
                  <th className="py-1">Notas</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const indicators = [r.irregular_heartbeat && "Arritmia", r.arm_movement && "Movimiento"].filter(Boolean).join(", ");
                  return (
                    <tr key={r.id} className="border-b border-black/10">
                      <td className="py-1 pr-2 whitespace-nowrap">{formatDate(r.timestamp)}</td>
                      <td className="py-1 pr-2 whitespace-nowrap">
                        {new Date(r.timestamp).toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Costa_Rica" })}
                      </td>
                      <td className="py-1 pr-2 whitespace-nowrap">
                        {r.systolic}/{r.diastolic}
                      </td>
                      <td className="py-1 pr-2">{r.pulse}</td>
                      <td className="py-1 pr-2">{r.map}</td>
                      <td className="py-1 pr-2">{CONTEXT_LABELS[r.context]}</td>
                      <td className="py-1 pr-2">{indicators || "—"}</td>
                      <td className="py-1">{[r.symptoms?.join(", "), r.notes].filter(Boolean).join(" · ") || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

// --- Dashboard analítico (KPIs, tendencia, correlación peso-presión) ------

function HealthDashboardModal({
  profile,
  readings,
  weightLogs,
  onClose,
}: {
  profile: HealthProfile;
  readings: BpReading[];
  weightLogs: WeightLog[];
  onClose: () => void;
}) {
  const [rangeDays, setRangeDays] = useState<(typeof REPORT_RANGES)[number]>(7);
  const since = Date.now() - rangeDays * 24 * 60 * 60 * 1000;

  const filtered = useMemo(
    () =>
      readings
        .filter((r) => new Date(r.timestamp).getTime() >= since)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    [readings, since],
  );

  const kpis = useMemo(() => {
    if (!filtered.length) return null;
    const avg = (key: "systolic" | "diastolic" | "map" | "pulse_pressure") =>
      Math.round(filtered.reduce((sum, r) => sum + r[key], 0) / filtered.length);
    const avgOf = (rows: BpReading[], key: "systolic" | "diastolic") =>
      rows.length ? Math.round(rows.reduce((sum, r) => sum + r[key], 0) / rows.length) : null;
    const am = filtered.filter((r) => hourInCR(r.timestamp) < 12);
    const pm = filtered.filter((r) => hourInCR(r.timestamp) >= 12);
    const avgSys = avg("systolic");
    const avgDia = avg("diastolic");
    return {
      avgSys,
      avgDia,
      classification: classifyBloodPressure(avgSys, avgDia),
      am: { sys: avgOf(am, "systolic"), dia: avgOf(am, "diastolic") },
      pm: { sys: avgOf(pm, "systolic"), dia: avgOf(pm, "diastolic") },
      avgMap: avg("map"),
      avgPulsePressure: avg("pulse_pressure"),
      irregularCount: filtered.filter((r) => r.irregular_heartbeat).length,
    };
  }, [filtered]);

  const trendData = useMemo(
    () => filtered.map((r) => ({ label: formatDate(r.timestamp), systolic: r.systolic, diastolic: r.diastolic })),
    [filtered],
  );

  // Correlación peso vs. presión: ambas series se indexan a 100 en su primer
  // valor del periodo y se grafican en un solo eje (% de cambio) en vez de un
  // eje dual — kg y mmHg no son comparables en la misma escala numérica.
  const weeklyCorrelation = useMemo(() => {
    const weightInRange = weightLogs.filter((w) => new Date(w.logged_at).getTime() >= since);
    if (!filtered.length || !weightInRange.length) return null;

    const bucket = (iso: string) => Math.floor((new Date(iso).getTime() - since) / (7 * 24 * 60 * 60 * 1000));
    const sysByWeek = new Map<number, number[]>();
    filtered.forEach((r) => sysByWeek.set(bucket(r.timestamp), [...(sysByWeek.get(bucket(r.timestamp)) ?? []), r.systolic]));
    const weightByWeek = new Map<number, number[]>();
    weightInRange.forEach((w) => weightByWeek.set(bucket(w.logged_at), [...(weightByWeek.get(bucket(w.logged_at)) ?? []), w.weight_kg]));

    const weekKeys = Array.from(new Set([...sysByWeek.keys(), ...weightByWeek.keys()])).sort((a, b) => a - b);
    const avgArr = (arr?: number[]) => (arr && arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : null);
    const firstSys = avgArr(sysByWeek.get(weekKeys[0]));
    const firstWeight = avgArr(weightByWeek.get(weekKeys[0]));
    if (weekKeys.length < 2 || firstSys == null || firstWeight == null) return null;

    return weekKeys.map((w) => {
      const sysAvg = avgArr(sysByWeek.get(w));
      const weightAvg = avgArr(weightByWeek.get(w));
      return {
        label: `Sem ${w + 1}`,
        sistolica: sysAvg != null ? Math.round((sysAvg / firstSys) * 100) : null,
        peso: weightAvg != null ? Math.round((weightAvg / firstWeight) * 100) : null,
      };
    });
  }, [filtered, weightLogs, since]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-30 overflow-y-auto py-8">
      <div className="relative w-full max-w-3xl border border-electric-cyan/20 bg-night-blue rounded-2xl p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto shadow-[0_0_60px_-15px_rgba(0,210,255,0.25)]">
        <CornerBrackets />
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Dashboard — {profile.name}</h2>
          <button type="button" onClick={onClose} className="text-white/50 hover:text-white">
            <IconX />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-white/50">Periodo:</span>
          {REPORT_RANGES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setRangeDays(d)}
              className={`rounded-lg px-3 py-1 text-sm border ${rangeDays === d ? "bg-electric-cyan text-night-blue border-electric-cyan" : "border-white/15 text-white/70 hover:bg-white/5"}`}
            >
              {d} días
            </button>
          ))}
        </div>

        {!kpis && <p className="text-sm text-white/40">Sin lecturas de presión en este periodo.</p>}

        {kpis && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-black/20 border border-white/10 rounded-xl p-3">
                <p className="text-[10px] uppercase tracking-wide text-white/40">Promedio SYS/DIA</p>
                <p className="text-lg font-bold text-white">
                  {kpis.avgSys}/{kpis.avgDia}
                </p>
                <span
                  className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full inline-block mt-0.5"
                  style={{ backgroundColor: `${kpis.classification.color}26`, color: kpis.classification.color }}
                >
                  {kpis.classification.label}
                </span>
              </div>
              <div className="bg-black/20 border border-white/10 rounded-xl p-3">
                <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">AM vs PM</p>
                <p className="text-sm text-white">
                  <span className="text-white/50">AM</span> {kpis.am.sys != null ? `${kpis.am.sys}/${kpis.am.dia}` : "—"}
                </p>
                <p className="text-sm text-white">
                  <span className="text-white/50">PM</span> {kpis.pm.sys != null ? `${kpis.pm.sys}/${kpis.pm.dia}` : "—"}
                </p>
              </div>
              <div className="bg-black/20 border border-white/10 rounded-xl p-3">
                <p className="text-[10px] uppercase tracking-wide text-white/40">MAP · Pulso de presión</p>
                <p className="text-lg font-bold text-white">
                  {kpis.avgMap} · {kpis.avgPulsePressure}
                </p>
              </div>
              <div className="bg-black/20 border border-white/10 rounded-xl p-3">
                <p className="text-[10px] uppercase tracking-wide text-white/40">Pulso irregular</p>
                <p className="text-lg font-bold text-white">
                  {kpis.irregularCount} {kpis.irregularCount === 1 ? "evento" : "eventos"}
                </p>
              </div>
            </div>

            <div className="bg-black/20 border border-white/10 rounded-xl p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/40 mb-2">Tendencia SYS/DIA</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trendData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} minTickGap={24} />
                  <YAxis domain={[40, 200]} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} width={32} />
                  <Tooltip contentStyle={{ background: "#0A2540", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "rgba(255,255,255,0.6)" }} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }} />
                  <ReferenceLine y={120} stroke="#10B981" strokeDasharray="4 4" label={{ value: "120/80 óptimo", fill: "#10B981", fontSize: 10, position: "insideTopLeft" }} />
                  <ReferenceLine y={80} stroke="#10B981" strokeDasharray="4 4" />
                  <ReferenceLine y={90} stroke="#3B82F6" strokeDasharray="4 4" label={{ value: "90/60 hipotensión", fill: "#3B82F6", fontSize: 10, position: "insideBottomLeft" }} />
                  <ReferenceLine y={60} stroke="#3B82F6" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="systolic" name="Sistólica" stroke="#00D2FF" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="diastolic" name="Diastólica" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-black/20 border border-white/10 rounded-xl p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/40 mb-1">Correlación peso vs. presión</p>
              <p className="text-[11px] text-white/40 mb-2">% de cambio semanal respecto al inicio del periodo (misma escala para poder compararlas)</p>
              {!weeklyCorrelation && (
                <p className="text-sm text-white/40">Faltan registros de peso o de presión en este periodo para calcular la correlación.</p>
              )}
              {weeklyCorrelation && (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={weeklyCorrelation} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} />
                    <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} width={32} unit="%" />
                    <Tooltip contentStyle={{ background: "#0A2540", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "rgba(255,255,255,0.6)" }} />
                    <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }} />
                    <ReferenceLine y={100} stroke="rgba(255,255,255,0.25)" strokeDasharray="2 4" />
                    <Line type="monotone" dataKey="peso" name="Peso" stroke="#00D2FF" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="sistolica" name="Sistólica (prom. semanal)" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// --- Vista de detalle del perfil ------------------------------------------

function WatchCalibrationWidget({ profile }: { profile: HealthProfile }) {
  const queryClient = useQueryClient();
  const calibrate = useMutation({
    mutationFn: () => api.updateHealthProfile(profile.id, { last_watch_calibration: new Date().toISOString() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["health-profiles"] }),
  });

  if (!profile.watch_calibration_enabled) return null;

  const daysSince = profile.last_watch_calibration
    ? Math.floor((Date.now() - new Date(profile.last_watch_calibration).getTime()) / (24 * 60 * 60 * 1000))
    : null;
  const daysLeft = daysSince == null ? null : 28 - daysSince;
  const overdue = daysLeft != null && daysLeft <= 0;
  const soon = daysLeft != null && daysLeft > 0 && daysLeft <= 3;
  const pct = daysSince == null ? 0 : Math.min(100, Math.round((daysSince / 28) * 100));

  return (
    <div className="bg-black/20 rounded-xl p-3 border border-white/10">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/40">Calibración Galaxy Watch</p>
        {(overdue || soon || daysLeft == null) && (
          <button type="button" onClick={() => calibrate.mutate()} disabled={calibrate.isPending} className="text-xs text-electric-cyan hover:brightness-110">
            {calibrate.isPending ? "..." : "Calibrar ahora"}
          </button>
        )}
      </div>
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${overdue ? "bg-red-400" : soon ? "bg-amber-400" : "bg-electric-cyan"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[11px] text-white/40 mt-1">
        {daysLeft == null ? "Sin calibrar todavía" : overdue ? "Calibración vencida" : `Faltan ${daysLeft} días`}
      </p>
    </div>
  );
}

function BpHistoryItem({ reading, onDelete }: { reading: BpReading; onDelete: () => void }) {
  const info = classifyBloodPressure(reading.systolic, reading.diastolic);
  return (
    <li className="flex items-start justify-between gap-2 bg-white/5 rounded-lg px-3 py-2 text-sm group">
      <div className="min-w-0">
        <p className="text-white/90 flex items-center gap-2 flex-wrap">
          <span className="font-semibold">
            {reading.systolic}/{reading.diastolic}
          </span>
          <span className="text-white/40 text-xs">{reading.pulse} lpm</span>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${info.color}26`, color: info.color }}>
            {info.label}
          </span>
          {reading.created_by === "agent" && <QuickBadge iconOnly />}
        </p>
        <p className="text-white/40 text-xs mt-0.5">
          {formatDateTime(reading.timestamp)} · {CONTEXT_LABELS[reading.context]}
          {reading.irregular_heartbeat ? " · ritmo irregular" : ""}
          {reading.arm_movement ? " · con movimiento" : ""}
        </p>
      </div>
      <button type="button" onClick={onDelete} aria-label="Borrar lectura" className="text-white/20 hover:text-red-400 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100">
        <IconX className="w-4 h-4" strokeWidth={1.75} />
      </button>
    </li>
  );
}

function ProfileDetail({ profile, onClose }: { profile: HealthProfile; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [showWeightForm, setShowWeightForm] = useState(false);
  const [showBpForm, setShowBpForm] = useState(false);
  const [showBodyForm, setShowBodyForm] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [weightToDelete, setWeightToDelete] = useState<WeightLog | null>(null);
  const [bpToDelete, setBpToDelete] = useState<BpReading | null>(null);
  const [bodyToDelete, setBodyToDelete] = useState<BodyCompositionLog | null>(null);

  const { data: weightLogs } = useQuery({ queryKey: ["weight-logs", profile.id], queryFn: () => api.listWeightLogs(profile.id) });
  const { data: bpReadings } = useQuery({ queryKey: ["bp-readings", profile.id], queryFn: () => api.listBpReadings(profile.id) });
  const { data: bodyLogs } = useQuery({ queryKey: ["body-composition-logs", profile.id], queryFn: () => api.listBodyCompositionLogs(profile.id) });

  const deleteProfile = useMutation({
    mutationFn: () => api.deleteHealthProfile(profile.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["health-profiles"] });
      onClose();
    },
  });
  const deleteWeight = useMutation({
    mutationFn: (id: string) => api.deleteWeightLog(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["weight-logs", profile.id] });
      setWeightToDelete(null);
    },
  });
  const deleteBp = useMutation({
    mutationFn: (id: string) => api.deleteBpReading(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bp-readings", profile.id] });
      setBpToDelete(null);
    },
  });
  const deleteBody = useMutation({
    mutationFn: (id: string) => api.deleteBodyCompositionLog(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["body-composition-logs", profile.id] });
      setBodyToDelete(null);
    },
  });

  const sortedWeight = useMemo(
    () => [...(weightLogs ?? [])].sort((a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime()),
    [weightLogs],
  );
  const sortedBp = useMemo(
    () => [...(bpReadings ?? [])].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [bpReadings],
  );
  const sortedBody = useMemo(
    () => [...(bodyLogs ?? [])].sort((a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime()),
    [bodyLogs],
  );
  const latestBp = sortedBp[0];
  const latestBpInfo = latestBp ? classifyBloodPressure(latestBp.systolic, latestBp.diastolic) : null;

  if (editing) {
    return <ProfileModal initial={profile} profileId={profile.id} onClose={() => setEditing(false)} />;
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-20 overflow-y-auto py-8">
      <div className="relative w-full max-w-lg border border-electric-cyan/20 bg-night-blue rounded-2xl p-6 flex flex-col gap-4 shadow-[0_0_60px_-15px_rgba(0,210,255,0.25)]">
        <CornerBrackets />

        <div>
          <h2 className="text-lg font-semibold text-white">{profile.name}</h2>
          <p className="text-sm text-white/50 mt-0.5">
            {calcAge(profile.birth_date)} años{profile.is_medicated ? " · perfil medicado" : ""}
            {profile.current_weight_kg != null ? ` · ${profile.current_weight_kg} kg` : ""}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={onClose} className="border border-white/10 rounded-lg px-2 py-2 text-sm text-white/70 hover:bg-white/5">
            Cerrar
          </button>
          <button type="button" onClick={() => setEditing(true)} className="border border-electric-cyan/40 text-electric-cyan rounded-lg px-2 py-2 text-sm hover:bg-electric-cyan/10 transition">
            Editar
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            disabled={deleteProfile.isPending}
            className="border border-red-400/40 text-red-400 rounded-lg px-2 py-2 text-sm hover:bg-red-400/10 transition disabled:opacity-50"
          >
            {deleteProfile.isPending ? "..." : "Borrar"}
          </button>
        </div>

        {latestBp && latestBpInfo && (
          <div className="bg-black/20 rounded-xl p-3 border border-white/10">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/40 mb-1">Última presión</p>
            <p className="text-2xl font-bold text-white flex items-center gap-2">
              {latestBp.systolic}/{latestBp.diastolic}
              <span className="text-sm font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${latestBpInfo.color}26`, color: latestBpInfo.color }}>
                {latestBpInfo.label}
              </span>
            </p>
            <p className="text-xs text-white/40 mt-0.5">
              {latestBp.pulse} lpm · MAP {latestBp.map} · PP {latestBp.pulse_pressure} · {formatDateTime(latestBp.timestamp)}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setShowDashboard(true)}
            className="border border-electric-cyan/30 text-electric-cyan rounded-lg px-3 py-2 text-sm hover:bg-electric-cyan/10 transition"
          >
            Ver dashboard
          </button>
          <button
            type="button"
            onClick={() => setShowReport(true)}
            className="border border-electric-cyan/30 text-electric-cyan rounded-lg px-3 py-2 text-sm hover:bg-electric-cyan/10 transition"
          >
            Exportar reporte médico
          </button>
        </div>

        {showReport && <MedicalReportModal profile={profile} readings={sortedBp} onClose={() => setShowReport(false)} />}
        {showDashboard && (
          <HealthDashboardModal profile={profile} readings={sortedBp} weightLogs={sortedWeight} onClose={() => setShowDashboard(false)} />
        )}

        <WatchCalibrationWidget profile={profile} />

        <div className="border-t border-white/8 pt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/40">Presión arterial</p>
            <button type="button" onClick={() => setShowBpForm((v) => !v)} className="text-xs text-electric-cyan hover:brightness-110">
              {showBpForm ? "Cancelar" : "+ Nueva toma"}
            </button>
          </div>
          {showBpForm && (
            <div className="mb-3">
              <BpQuickForm profileId={profile.id} onDone={() => setShowBpForm(false)} />
            </div>
          )}
          {sortedBp.length === 0 && <p className="text-white/40 text-sm">Sin lecturas todavía.</p>}
          {sortedBp.length > 0 && (
            <ul className="flex flex-col gap-2 max-h-52 overflow-y-auto">
              {sortedBp.map((r) => (
                <BpHistoryItem key={r.id} reading={r} onDelete={() => setBpToDelete(r)} />
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-white/8 pt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/40">Peso</p>
            <button type="button" onClick={() => setShowWeightForm((v) => !v)} className="text-xs text-electric-cyan hover:brightness-110">
              {showWeightForm ? "Cancelar" : "+ Agregar"}
            </button>
          </div>
          {showWeightForm && (
            <div className="mb-3">
              <WeightQuickForm profileId={profile.id} onDone={() => setShowWeightForm(false)} />
            </div>
          )}
          {sortedWeight.length === 0 && <p className="text-white/40 text-sm">Sin registros todavía.</p>}
          {sortedWeight.length > 0 && (
            <ul className="flex flex-col gap-2 max-h-52 overflow-y-auto">
              {sortedWeight.map((w, i) => {
                const prev = sortedWeight[i + 1];
                const delta = prev ? +(w.weight_kg - prev.weight_kg).toFixed(1) : null;
                return (
                  <li key={w.id} className="flex items-start justify-between gap-2 bg-white/5 rounded-lg px-3 py-2 text-sm group">
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="text-white/90">{w.weight_kg} kg</span>
                      {w.created_by === "agent" && <QuickBadge iconOnly />}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-white/40 text-xs">
                        {formatDate(w.logged_at)}
                        {delta != null && delta !== 0 ? ` · ${delta > 0 ? "+" : ""}${delta} kg` : ""}
                      </span>
                      <button type="button" onClick={() => setWeightToDelete(w)} aria-label="Borrar lectura" className="text-white/20 hover:text-red-400 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100">
                        <IconX className="w-4 h-4" strokeWidth={1.75} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-white/8 pt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/40">Composición corporal</p>
            <button type="button" onClick={() => setShowBodyForm((v) => !v)} className="text-xs text-electric-cyan hover:brightness-110">
              {showBodyForm ? "Cancelar" : "+ Agregar"}
            </button>
          </div>
          {showBodyForm && (
            <div className="mb-3">
              <BodyCompositionQuickForm profileId={profile.id} onDone={() => setShowBodyForm(false)} />
            </div>
          )}
          {sortedBody.length === 0 && <p className="text-white/40 text-sm">Sin registros todavía.</p>}
          {sortedBody.length > 0 && (
            <ul className="flex flex-col gap-2 max-h-52 overflow-y-auto">
              {sortedBody.map((b) => (
                <li key={b.id} className="flex items-start justify-between gap-2 bg-white/5 rounded-lg px-3 py-2 text-sm group">
                  <div className="min-w-0">
                    <p className="text-white/90">
                      {[
                        b.weight_kg != null ? `${b.weight_kg} kg` : null,
                        b.body_fat_pct != null ? `${b.body_fat_pct}% grasa` : null,
                        b.muscle_mass_kg != null ? `${b.muscle_mass_kg} kg músculo` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Sin datos"}
                    </p>
                    <p className="text-white/40 text-xs mt-0.5">{formatDate(b.logged_at)}</p>
                  </div>
                  <button type="button" onClick={() => setBodyToDelete(b)} aria-label="Borrar registro" className="text-white/20 hover:text-red-400 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100">
                    <IconX className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          message={`¿Borrar el perfil "${profile.name}"? Esto borra también su historial de peso y presión.`}
          pending={deleteProfile.isPending}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => deleteProfile.mutate()}
        />
      )}
      {weightToDelete && (
        <ConfirmDialog
          message={`¿Borrar el registro de ${weightToDelete.weight_kg} kg?`}
          pending={deleteWeight.isPending}
          onCancel={() => setWeightToDelete(null)}
          onConfirm={() => deleteWeight.mutate(weightToDelete.id)}
        />
      )}
      {bpToDelete && (
        <ConfirmDialog
          message={`¿Borrar la lectura ${bpToDelete.systolic}/${bpToDelete.diastolic}?`}
          pending={deleteBp.isPending}
          onCancel={() => setBpToDelete(null)}
          onConfirm={() => deleteBp.mutate(bpToDelete.id)}
        />
      )}
      {bodyToDelete && (
        <ConfirmDialog
          message="¿Borrar este registro de composición corporal?"
          pending={deleteBody.isPending}
          onCancel={() => setBodyToDelete(null)}
          onConfirm={() => deleteBody.mutate(bodyToDelete.id)}
        />
      )}
    </div>
  );
}

export function HealthPage() {
  const [showForm, setShowForm] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<HealthProfile | null>(null);
  const { data: profiles, isLoading } = useQuery({ queryKey: ["health-profiles"], queryFn: api.listHealthProfiles });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-white">Salud</h1>
          <p className="text-sm text-white/40">Peso, presión arterial y composición corporal</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="bg-gradient-to-br from-deep-blue via-electric-cyan to-electric-cyan text-night-blue font-semibold rounded-lg shadow-[0_0_18px_-4px_rgba(0,210,255,0.55)] px-3 py-2 text-sm hover:brightness-110 transition flex-shrink-0"
        >
          + Nuevo perfil
        </button>
      </div>

      {isLoading && <p className="text-white/40 text-sm">Cargando...</p>}
      {profiles && profiles.length === 0 && !isLoading && (
        <div className="bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] p-5">
          <p className="text-white/40 text-sm">No hay perfiles todavía — creá uno para empezar a registrar peso y presión.</p>
        </div>
      )}

      {profiles && profiles.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {profiles.map((p: HealthProfile) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedProfile(p)}
              className="text-left bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] p-4 hover:bg-white/10 transition-colors"
            >
              <p className="text-sm font-semibold text-white/90 flex items-center gap-2">
                {p.name}
                {p.created_by === "agent" && <QuickBadge iconOnly />}
              </p>
              <p className="text-xs text-white/40 mt-1">
                {calcAge(p.birth_date)} años{p.is_medicated ? " · medicado" : ""}
                {p.current_weight_kg != null ? ` · ${p.current_weight_kg} kg` : ""}
              </p>
            </button>
          ))}
        </div>
      )}

      {showForm && <ProfileModal onClose={() => setShowForm(false)} />}
      {selectedProfile && <ProfileDetail profile={selectedProfile} onClose={() => setSelectedProfile(null)} />}
    </div>
  );
}
