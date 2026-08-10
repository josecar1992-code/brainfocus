import { z } from "zod";
import { createResourceRouter } from "./resourceRouter.js";

const createSchema = z.object({
  name: z.string().min(1),
  color: z.string().optional(),
});

export const listsRouter = createResourceRouter({
  table: "lists",
  resourceName: "lists",
  createSchema,
  updateSchema: createSchema.partial(),
  orderBy: { column: "name", ascending: true },
  trackCreatedBy: true,
});
