import { z } from "zod";
import { createResourceRouter } from "./resourceRouter.js";

const createSchema = z.object({
  task_id: z.string().uuid(),
  title: z.string().min(1),
  done: z.boolean().optional(),
});

// El % completado de la tarea principal no se guarda en ningún lado — se
// calcula en el cliente a partir de estas filas (done / total), así que no
// hace falta ningún hook al completarse una subtarea.
export const subtasksRouter = createResourceRouter({
  table: "subtasks",
  resourceName: "subtasks",
  createSchema,
  updateSchema: createSchema.partial(),
  orderBy: { column: "created_at", ascending: true },
});
