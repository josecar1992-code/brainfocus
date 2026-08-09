import { z } from "zod";
import { createResourceRouter } from "./resourceRouter.js";

const createSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
  project_id: z.string().uuid().optional().nullable(),
});

export const notesRouter = createResourceRouter({
  table: "notes",
  resourceName: "notes",
  createSchema,
  updateSchema: createSchema.partial(),
  searchFields: ["title", "content"],
  trackCreatedBy: true,
});
