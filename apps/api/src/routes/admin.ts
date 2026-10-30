import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { requireAdmin } from "../middleware/auth.js";
import { supabaseAdmin } from "../supabaseClient.js";
import { invalidateProfileAccess } from "../services/profiles.js";
import { OPTIONAL_MODULES } from "../utils/modules.js";
import { env } from "../env.js";

// Alta y gestión de usuarios: SOLO el administrador, y solo desde la sesión web (no con API keys ni la
// credencial del asistente — un agente nunca debe poder darse o dar acceso). El registro no es público:
// una cuenta nueva queda `pending` hasta que el administrador la activa aquí y le vincula su WhatsApp.
export const adminRouter = Router();

function onlyWebAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.auth?.type !== "user") return res.status(403).json({ error: "Solo desde la sesión web del administrador" });
  next();
}
adminRouter.use(requireAdmin, onlyWebAdmin);

/** "+506 8888-8888" → "+50688888888"; null si no parece un teléfono. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}

export const userPatchSchema = z
  .object({
    status: z.enum(["pending", "active", "blocked"]),
    // null = todos los módulos opcionales; [] = ninguno.
    enabled_modules: z.array(z.enum(OPTIONAL_MODULES)).nullable(),
    // Mensajes por día (día de Costa Rica) que puede mandarle al asistente; null = el límite general.
    daily_message_limit: z.number().int().min(1).max(5000).nullable(),
    whatsapp_phone: z
      .string()
      .nullable()
      .transform((v, ctx) => {
        if (v === null || v.trim() === "") return null;
        const p = normalizePhone(v);
        if (!p) ctx.addIssue({ code: "custom", message: "Teléfono inválido" });
        return p;
      }),
  })
  .partial()
  .strict();

// Valores generales que la pantalla de Usuarios necesita mostrar (hoy, el límite diario por defecto).
adminRouter.get("/config", (_req, res) => {
  res.json({ daily_message_limit_default: env.dailyMessageLimit });
});

adminRouter.get("/users", async (_req, res, next) => {
  try {
    const { data: authUsers, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    if (error) throw error;
    const { data: profiles, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, status, is_admin, enabled_modules, whatsapp_phone, whatsapp_last_inbound_at, daily_message_limit");
    if (pErr) throw pErr;
    const byId = new Map((profiles ?? []).map((p) => [p.id as string, p]));
    res.json(
      authUsers.users.map((u) => {
        const p = byId.get(u.id);
        return {
          id: u.id,
          email: u.email ?? null,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at ?? null,
          // Sin fila de perfil = se registró pero nadie lo ha revisado todavía.
          status: (p?.status as string | undefined) ?? "pending",
          is_admin: Boolean(p?.is_admin),
          enabled_modules: (p?.enabled_modules as string[] | null | undefined) ?? null,
          whatsapp_phone: (p?.whatsapp_phone as string | null | undefined) ?? null,
          whatsapp_last_inbound_at: (p?.whatsapp_last_inbound_at as string | null | undefined) ?? null,
          daily_message_limit: (p?.daily_message_limit as number | null | undefined) ?? null,
        };
      }),
    );
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/users/:id", async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!z.string().uuid().safeParse(id).success) return res.status(400).json({ error: "Id inválido" });
    const parsed = userPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const patch = parsed.data;
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: "Nada que cambiar" });

    // Evita quedarse sin acceso a uno mismo por error.
    if (id === req.auth!.userId && patch.status && patch.status !== "active") {
      return res.status(400).json({ error: "No podés desactivar tu propia cuenta" });
    }

    const { data: target, error: userErr } = await supabaseAdmin.auth.admin.getUserById(id);
    if (userErr || !target?.user) return res.status(404).json({ error: "Usuario no encontrado" });

    // upsert: la fila de perfil puede no existir todavía (no hay trigger que la cree al registrarse).
    const { error } = await supabaseAdmin.from("profiles").upsert({ id, ...patch });
    if (error) {
      if ((error as { code?: string }).code === "23505") return res.status(409).json({ error: "Ese teléfono ya está vinculado a otra cuenta" });
      throw error;
    }
    invalidateProfileAccess(id); // el cambio de estado/módulos aplica de inmediato, sin esperar al caché de 60 s
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
