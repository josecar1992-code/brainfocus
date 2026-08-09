import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./env.js";
import { authenticate } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { apiKeysRouter } from "./routes/apiKeys.js";
import { documentsRouter } from "./routes/documents.js";
import { eventsRouter } from "./routes/events.js";
import { exerciseRouter } from "./routes/exercise.js";
import { listsRouter } from "./routes/lists.js";
import { notesRouter } from "./routes/notes.js";
import { nutritionRouter } from "./routes/nutrition.js";
import { projectsRouter } from "./routes/projects.js";
import { remindersRouter } from "./routes/reminders.js";
import { routineCompletionsRouter } from "./routes/routineCompletions.js";
import { routinesRouter } from "./routes/routines.js";
import { subtasksRouter } from "./routes/subtasks.js";
import { tasksRouter } from "./routes/tasks.js";
import { vehicleMaintenanceRouter } from "./routes/vehicleMaintenance.js";
import { vehiclesRouter } from "./routes/vehicles.js";

const app = express();

app.use(helmet());
app.use(morgan("combined"));
// Fail-closed: sin CORS_ORIGINS configurado, ningún origen del navegador puede
// llamar a la API (antes reflejaba cualquier Origin, un default inseguro fácil
// de dejar pasar por olvido de configuración). Requests sin API key/JWT igual
// no pasan de authenticate(), pero esto cierra la superficie de browser CORS.
if (env.corsOrigins.length === 0) {
  console.warn("[cors] CORS_ORIGINS no está configurado — se rechaza CORS de cualquier origen de navegador");
}
app.use(cors({ origin: env.corsOrigins }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

// Todo lo demás requiere identidad (JWT de usuario o API key de agente)
app.use(authenticate);

app.use("/internal/api-keys", apiKeysRouter);
app.use("/tasks", tasksRouter);
app.use("/subtasks", subtasksRouter);
app.use("/lists", listsRouter);
app.use("/projects", projectsRouter);
app.use("/reminders", remindersRouter);
app.use("/events", eventsRouter);
app.use("/notes", notesRouter);
app.use("/documents", documentsRouter);
app.use("/nutrition", nutritionRouter);
app.use("/exercise", exerciseRouter);
app.use("/vehicles", vehiclesRouter);
app.use("/vehicle-maintenance", vehicleMaintenanceRouter);
app.use("/routines", routinesRouter);
app.use("/routine-completions", routineCompletionsRouter);

app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`FocusbrainCR API escuchando en :${env.port}`);
});
