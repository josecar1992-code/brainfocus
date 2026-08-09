import { z } from "zod";
import { createResourceRouter } from "./resourceRouter.js";

// Solo lectura desde el frontend (el historial lo escribe advanceRoutine()
// internamente); se define un createSchema igual porque el router genérico
// lo exige, pero nada llama al POST en la práctica.
const createSchema = z.object({
  routine_id: z.string().uuid(),
  occurrence_date: z.string().optional().nullable(),
  completed_at: z.string().datetime({ offset: true }).optional(),
});

export const routineCompletionsRouter = createResourceRouter({
  table: "routine_completions",
  resourceName: "routine_completions",
  createSchema,
  updateSchema: createSchema.partial(),
  orderBy: { column: "completed_at", ascending: false },
  readOnly: true,
});
