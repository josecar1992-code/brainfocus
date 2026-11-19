import { Router } from "express";
import { z } from "zod";
import { calculateHemodynamics, classifyBloodPressure, evaluateAlerts } from "@brainfocus/focusbrain-health";
import { requireScope } from "../middleware/auth.js";
import { logAgentAction } from "../services/agentActions.js";
import { findForeignRef } from "../utils/ownedRefs.js";
import { supabaseAdmin } from "../supabaseClient.js";
import { parseLimit } from "../utils/pagination.js";

// No usa createResourceRouter (a diferencia de los demás recursos de salud) porque
// map/pulse_pressure/classification se calculan server-side a partir de systolic/diastolic
// (nunca confiados al cliente, igual que documents.ts con su propio router a mano) y porque
// al crear una lectura hay que evaluar alertas clínicas (ver evaluateAlerts) que requieren
// leer el perfil y el historial de 7 días — lógica que no cabe en los hooks genéricos.

const measurementContexts = ["fasting_rest", "pre_dinner", "post_meal", "post_workout", "with_symptoms", "watch_calibration"] as const;

const createSchema = z.object({
  profile_id: z.string().uuid(),
  timestamp: z.string().datetime({ offset: true }).optional(),
  systolic: z.number().min(60).max(260),
  diastolic: z.number().min(30).max(160),
  pulse: z.number().min(30).max(220),
  irregular_heartbeat: z.boolean().optional(),
  arm_movement: z.boolean().optional(),
  context: z.enum(measurementContexts),
  is_averaged_reading: z.boolean().optional(),
  weight_snapshot_kg: z.number().positive().optional().nullable(),
  symptoms: z.array(z.string()).optional(),
  notes: z.string().optional().nullable(),
});
type CreateInput = z.infer<typeof createSchema>;

const updateSchema = createSchema.partial();

function validateDiaLtSys(systolic: number, diastolic: number): string | null {
  return diastolic >= systolic ? "diastolic debe ser menor que systolic" : null;
}

async function fetchProfile(userId: string, profileId: string) {
  const { data, error } = await supabaseAdmin
    .from("health_profiles")
    .select("id, is_medicated")
    .eq("user_id", userId)
    .eq("id", profileId)
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; is_medicated: boolean } | null;
}

async function fetchLast7DaysStats(userId: string, profileId: string, before: string) {
  const sevenDaysAgo = new Date(new Date(before).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("bp_readings")
    .select("systolic, irregular_heartbeat")
    .eq("user_id", userId)
    .eq("profile_id", profileId)
    .gte("timestamp", sevenDaysAgo)
    .lt("timestamp", before);
  if (error) throw error;
  const rows = data ?? [];
  const last7DaysAvgSystolic = rows.length ? rows.reduce((sum, r) => sum + Number(r.systolic), 0) / rows.length : null;
  const irregularHeartbeatCountLast7Days = rows.filter((r) => r.irregular_heartbeat).length;
  return { last7DaysAvgSystolic, irregularHeartbeatCountLast7Days };
}

function buildRow(userId: string, input: CreateInput, createdBy: "user" | "agent") {
  const { map, pulse_pressure } = calculateHemodynamics(input.systolic, input.diastolic);
  const classification = classifyBloodPressure(input.systolic, input.diastolic).status;
  return {
    user_id: userId,
    profile_id: input.profile_id,
    timestamp: input.timestamp ?? new Date().toISOString(),
    systolic: input.systolic,
    diastolic: input.diastolic,
    pulse: input.pulse,
    irregular_heartbeat: input.irregular_heartbeat ?? false,
    arm_movement: input.arm_movement ?? false,
    map,
    pulse_pressure,
    classification,
    context: input.context,
    is_averaged_reading: input.is_averaged_reading ?? false,
    weight_snapshot_kg: input.weight_snapshot_kg ?? null,
    symptoms: input.symptoms ?? null,
    notes: input.notes ?? null,
    created_by: createdBy,
  };
}

export const bpReadingsRouter = Router();

bpReadingsRouter.get("/", requireScope("bp_readings:read"), async (req, res, next) => {
  try {
    const limit = parseLimit(req.query.limit, { max: 1000, defaultValue: 100 });
    let query = supabaseAdmin.from("bp_readings").select("*").eq("user_id", req.auth!.userId);
    if (typeof req.query.profile_id === "string") query = query.eq("profile_id", req.query.profile_id);
    if (typeof req.query.timestamp_gte === "string") query = query.gte("timestamp", req.query.timestamp_gte);
    if (typeof req.query.timestamp_lte === "string") query = query.lte("timestamp", req.query.timestamp_lte);

    const { data, error } = await query.order("timestamp", { ascending: false }).limit(limit);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

bpReadingsRouter.get("/:id", requireScope("bp_readings:read"), async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("bp_readings")
      .select("*")
      .eq("user_id", req.auth!.userId)
      .eq("id", req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "No encontrado" });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

bpReadingsRouter.post("/", requireScope("bp_readings:write"), async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const dlts = validateDiaLtSys(parsed.data.systolic, parsed.data.diastolic);
    if (dlts) return res.status(400).json({ error: dlts });

    const foreignRef = await findForeignRef(req.auth!.userId, parsed.data);
    if (foreignRef) return res.status(400).json({ error: `Referencia inválida: ${foreignRef} no existe` });

    const profile = await fetchProfile(req.auth!.userId, parsed.data.profile_id);
    if (!profile) return res.status(400).json({ error: "Referencia inválida: profile_id no existe" });

    const row = buildRow(req.auth!.userId, parsed.data, req.auth!.type === "agent" ? "agent" : "user");
    const { data, error } = await supabaseAdmin.from("bp_readings").insert(row).select().single();
    if (error) throw error;

    const history = await fetchLast7DaysStats(req.auth!.userId, parsed.data.profile_id, row.timestamp);
    const alerts = evaluateAlerts(
      {
        systolic: row.systolic,
        diastolic: row.diastolic,
        context: row.context,
        irregular_heartbeat: row.irregular_heartbeat,
        classification: row.classification,
      },
      { is_medicated: profile.is_medicated },
      history,
    );

    await logAgentAction(req.auth!, "bp_readings.create", "bp_readings", data.id, parsed.data);
    res.status(201).json({ ...data, alerts });
  } catch (err) {
    next(err);
  }
});

bpReadingsRouter.patch("/:id", requireScope("bp_readings:write"), async (req, res, next) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { data: before, error: beforeError } = await supabaseAdmin
      .from("bp_readings")
      .select("*")
      .eq("user_id", req.auth!.userId)
      .eq("id", req.params.id)
      .maybeSingle();
    if (beforeError) throw beforeError;
    if (!before) return res.status(404).json({ error: "No encontrado" });

    const foreignRef = await findForeignRef(req.auth!.userId, parsed.data);
    if (foreignRef) return res.status(400).json({ error: `Referencia inválida: ${foreignRef} no existe` });

    const systolic = parsed.data.systolic ?? before.systolic;
    const diastolic = parsed.data.diastolic ?? before.diastolic;
    const dlts = validateDiaLtSys(systolic, diastolic);
    if (dlts) return res.status(400).json({ error: dlts });

    const { map, pulse_pressure } = calculateHemodynamics(systolic, diastolic);
    const classification = classifyBloodPressure(systolic, diastolic).status;

    const { data, error } = await supabaseAdmin
      .from("bp_readings")
      .update({ ...parsed.data, systolic, diastolic, map, pulse_pressure, classification })
      .eq("user_id", req.auth!.userId)
      .eq("id", req.params.id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "No encontrado" });

    await logAgentAction(req.auth!, "bp_readings.update", "bp_readings", req.params.id, parsed.data);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

bpReadingsRouter.delete("/:id", requireScope("bp_readings:write"), async (req, res, next) => {
  try {
    const { error } = await supabaseAdmin.from("bp_readings").delete().eq("user_id", req.auth!.userId).eq("id", req.params.id);
    if (error) throw error;
    await logAgentAction(req.auth!, "bp_readings.delete", "bp_readings", req.params.id, null);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
