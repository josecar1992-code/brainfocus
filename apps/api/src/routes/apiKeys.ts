import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../supabaseClient.js";
import { hashApiKey } from "../middleware/auth.js";

export const apiKeysRouter = Router();

const createSchema = z.object({
  name: z.string().min(1),
  scopes: z.array(z.string()).min(1),
});

// Solo el dueño (JWT) puede crear/listar/revocar sus propias API keys — nunca un agente.
apiKeysRouter.use((req, res, next) => {
  if (req.auth?.type !== "user") return res.status(403).json({ error: "Solo el dueño puede administrar API keys" });
  next();
});

apiKeysRouter.get("/", async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("api_keys")
      .select("id, name, scopes, last_used_at, revoked_at, created_at")
      .eq("user_id", req.auth!.userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

apiKeysRouter.post("/", async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const rawKey = `bfc_${randomBytes(24).toString("hex")}`;
    const { data, error } = await supabaseAdmin
      .from("api_keys")
      .insert({
        user_id: req.auth!.userId,
        name: parsed.data.name,
        scopes: parsed.data.scopes,
        key_hash: hashApiKey(rawKey),
      })
      .select("id, name, scopes, created_at")
      .single();
    if (error) throw error;

    // única vez que se devuelve la key en claro
    res.status(201).json({ ...data, key: rawKey });
  } catch (err) {
    next(err);
  }
});

apiKeysRouter.delete("/:id", async (req, res, next) => {
  try {
    const { error } = await supabaseAdmin
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", req.auth!.userId)
      .eq("id", req.params.id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
