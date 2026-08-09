import { z } from "zod";
import { createResourceRouter } from "./resourceRouter.js";

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  status: z.enum(["active", "archived"]).optional(),
});

export const projectsRouter = createResourceRouter({
  table: "projects",
  resourceName: "projects",
  createSchema,
  updateSchema: createSchema.partial(),
  orderBy: { column: "created_at", ascending: false },
  searchFields: ["name", "description"],
  trackCreatedBy: true,
});
