import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { requireScope } from "../middleware/auth.js";
import { logAgentAction } from "../services/agentActions.js";
import { supabaseAdmin } from "../supabaseClient.js";

// Bucket privado: nunca público, siempre vía URL firmada de vencimiento corto
// generada acá con la service-role key (ver GET /:id/download-url abajo).
const BUCKET = "documentos";
const SIGNED_URL_TTL_SECONDS = 300; // 5 min

// 25MB alcanza de sobra para PDFs/imágenes de WhatsApp (que ya limita a 100MB
// documentos / 16MB imágenes, pero en la práctica son mucho más chicos).
// El bucket es privado (siempre vía URL firmada), así que el riesgo de un
// tipo raro es bajo, pero igual restringimos a lo que el feature promete
// (PDFs/imágenes) en vez de aceptar cualquier mimetype que declare el cliente.
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`));
    }
    cb(null, true);
  },
});

export const documentsRouter = Router();

documentsRouter.get("/", requireScope("documents:read"), async (req, res, next) => {
  try {
    const limitParam = Number(req.query.limit);
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50;

    let query = supabaseAdmin
      .from("documents")
      .select("id, name, mime_type, size, created_at")
      .eq("user_id", req.auth!.userId);

    // Búsqueda exacta por nombre — es como Quicks encuentra un documento
    // (nombre único por usuario), sin necesidad de traer todo y filtrar.
    if (typeof req.query.name === "string" && req.query.name.trim()) {
      query = query.eq("name", req.query.name.trim());
    } else if (typeof req.query.q === "string" && req.query.q.trim()) {
      query = query.ilike("name", `%${req.query.q.trim().replace(/[%,]/g, "")}%`);
    }

    const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

documentsRouter.get("/:id/download-url", requireScope("documents:read"), async (req, res, next) => {
  try {
    const { data: doc, error } = await supabaseAdmin
      .from("documents")
      .select("id, name, storage_path, mime_type, size")
      .eq("user_id", req.auth!.userId)
      .eq("id", req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!doc) return res.status(404).json({ error: "No encontrado" });

    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(doc.storage_path, SIGNED_URL_TTL_SECONDS);
    if (signError) throw signError;

    res.json({ url: signed.signedUrl, name: doc.name, mime_type: doc.mime_type, size: doc.size });
  } catch (err) {
    next(err);
  }
});

const uploadMetaSchema = z.object({ name: z.string().min(1) });

documentsRouter.post(
  "/upload",
  requireScope("documents:write"),
  (req, res, next) => {
    // multer llama a next(err) directo desde fileFilter/límite de tamaño —
    // sin este wrapper cae al errorHandler genérico como 500.
    upload.single("file")(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      next();
    });
  },
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: "Falta el archivo (campo 'file')" });

      const parsed = uploadMetaSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
      const { name } = parsed.data;

      // "Guardalo con este nombre" reemplaza si ya existe — nunca duplica
      // (nombre único por usuario, ver idx_documents_user_name).
      const { data: existing, error: existingError } = await supabaseAdmin
        .from("documents")
        .select("id, storage_path")
        .eq("user_id", req.auth!.userId)
        .eq("name", name)
        .maybeSingle();
      if (existingError) throw existingError;

      const storagePath = existing ? existing.storage_path : `${req.auth!.userId}/${randomUUID()}`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(storagePath, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
      if (uploadError) throw uploadError;

      const row = {
        user_id: req.auth!.userId,
        name,
        storage_path: storagePath,
        mime_type: req.file.mimetype,
        size: req.file.size,
      };

      const { data, error } = existing
        ? await supabaseAdmin
            .from("documents")
            .update({ mime_type: row.mime_type, size: row.size })
            .eq("id", existing.id)
            .select("id, name, mime_type, size, created_at")
            .single()
        : await supabaseAdmin.from("documents").insert(row).select("id, name, mime_type, size, created_at").single();
      if (error) throw error;

      await logAgentAction(req.auth!, "documents.upload", "documents", data.id, { name, mime_type: row.mime_type });
      res.status(201).json(data);
    } catch (err) {
      next(err);
    }
  },
);

documentsRouter.delete("/:id", requireScope("documents:write"), async (req, res, next) => {
  try {
    const { data: doc, error } = await supabaseAdmin
      .from("documents")
      .select("id, storage_path")
      .eq("user_id", req.auth!.userId)
      .eq("id", req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!doc) return res.status(404).json({ error: "No encontrado" });

    const { error: removeError } = await supabaseAdmin.storage.from(BUCKET).remove([doc.storage_path]);
    if (removeError) console.error(`[documents] no se pudo borrar el objeto ${doc.storage_path}:`, removeError);

    const { error: deleteError } = await supabaseAdmin
      .from("documents")
      .delete()
      .eq("user_id", req.auth!.userId)
      .eq("id", req.params.id);
    if (deleteError) throw deleteError;

    await logAgentAction(req.auth!, "documents.delete", "documents", req.params.id, null);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
