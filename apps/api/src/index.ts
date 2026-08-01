import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./env.js";
import { authenticate } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { apiKeysRouter } from "./routes/apiKeys.js";
import { eventsRouter } from "./routes/events.js";
import { exerciseRouter } from "./routes/exercise.js";
import { listsRouter } from "./routes/lists.js";
import { notesRouter } from "./routes/notes.js";
import { nutritionRouter } from "./routes/nutrition.js";
import { remindersRouter } from "./routes/reminders.js";
import { tasksRouter } from "./routes/tasks.js";

const app = express();

app.use(helmet());
app.use(morgan("combined"));
app.use(
  cors({
    origin: env.corsOrigins.length > 0 ? env.corsOrigins : true,
  }),
);
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

// Todo lo demás requiere identidad (JWT de usuario o API key de agente)
app.use(authenticate);

app.use("/internal/api-keys", apiKeysRouter);
app.use("/tasks", tasksRouter);
app.use("/lists", listsRouter);
app.use("/reminders", remindersRouter);
app.use("/events", eventsRouter);
app.use("/notes", notesRouter);
app.use("/nutrition", nutritionRouter);
app.use("/exercise", exerciseRouter);

app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`BrainFocusCR API escuchando en :${env.port}`);
});
