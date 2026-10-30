import { z } from "zod";
import { createResourceRouter } from "./resourceRouter.js";

const createSchema = z.object({
  checklist_id: z.string().uuid(),
  text: z.string().min(1).max(300),
  done: z.boolean().optional(),
});

// Ítems de una lista. checklist_id se valida como propio en resourceRouter (ownedRefs), así nadie agrega ítems
// a la lista de otra persona.
export const checklistItemsRouter = createResourceRouter({
  table: "checklist_items",
  resourceName: "checklist_items",
  createSchema,
  updateSchema: createSchema.partial(),
  orderBy: { column: "created_at", ascending: true },
  trackCreatedBy: true,
});
