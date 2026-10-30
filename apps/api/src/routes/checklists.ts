import { z } from "zod";
import { createResourceRouter } from "./resourceRouter.js";

const createSchema = z.object({ title: z.string().min(1).max(120) });

// Las listas (ej. "Compras") del módulo Listas. Sus ítems viven en checklist_items y se borran en cascada.
export const checklistsRouter = createResourceRouter({
  table: "checklists",
  resourceName: "checklists",
  createSchema,
  updateSchema: createSchema.partial(),
  searchFields: ["title"],
  trackCreatedBy: true,
});
