# Pendientes

Barrido general de la app (08-ago-2026): bugs, mejoras y funciones nuevas propuestas.
No implementado todavía — este documento es la lista de trabajo, no un changelog.

## 1. Bugs / correcciones

- ~~**[ALTO] Borrar una tarea deja el evento asociado huérfano.**~~ ✅ Resuelto — `tasks.ts` `beforeDelete`
  ahora borra también el/los eventos ligados y cancela sus recordatorios.
- ~~**[ALTO] `crear_evento` del MCP rompe el invariante "todo evento tiene tarea".**~~ ✅ Resuelto —
  `crear_evento` crea primero la tarea, igual que la web.
- ~~**[ALTO] `fields=` en `GET /:resource` acepta sintaxis de embed de Supabase sin validar.**~~ ✅ Resuelto
  — se valida a una lista simple de columnas (regex), si no cumple se ignora y usa `*`.
- ~~**[MEDIO] CORS abierto a cualquier origen si falta `CORS_ORIGINS`.**~~ ✅ Resuelto — ahora falla cerrado
  (sin origins configurados, ningún origen de navegador pasa) y loguea advertencia.
- ~~**[MEDIO] `errorHandler` filtra `err.message` crudo de Postgres al cliente.**~~ ✅ Resuelto — errores con
  `code` (PostgrestError) devuelven "Error interno" genérico; los `Error` de aplicación (mensajes pensados
  para el caller) se dejan pasar igual.
- **[MEDIO] Anti-duplicado de recordatorios es frágil ante variaciones de texto.**
  `apps/api/src/routes/reminders.ts` compara título exacto; una reformulación mínima del LLM se cuela como
  duplicado real. _(pendiente)_
- ~~**[BAJO] `routine_completions` expone escritura completa.**~~ ✅ Resuelto — nuevo flag `readOnly` en
  `createResourceRouter`, aplicado a `routine_completions` (solo GET).

## 2. Mejoras a funciones existentes

- **[MEDIO]** Editar una rutina no reprograma la ocurrencia pendiente actual
  (`apps/web/src/RoutinesPage.tsx`) — falta opción "aplicar también a hoy". _(pendiente — es un cambio de
  UX/flujo que merece su propio diseño, no un fix mecánico)_
- ~~**[MEDIO] Fallo de `scheduleReminderCron` se maneja distinto en `reminders.ts` vs `routines.ts`.**~~ ✅
  Resuelto — `routines.ts` ahora borra el recordatorio si falla programar el cron (antes quedaba una fila
  fantasma con `cron_job_id` null, visible en la UI pero que nunca iba a sonar). La tarea/evento de la
  ocurrencia sí se conservan aunque falle el aviso — eso sigue siendo intencional.
- ~~**[MEDIO] `GET /:resource` no soporta filtros por rango de fecha.**~~ ✅ Resuelto parcialmente —
  `resourceRouter.ts` ahora soporta `<columna>_gte`/`<columna>_lte` como query params. Además se encontró
  un bug real de mayor impacto en el camino: `listEvents`/`listTasks`/`listReminders` (`apps/web/src/api.ts`)
  no pasaban `limit`, así que usaban el default de 50 con orden **ascendente** — traían las 50 filas más
  **viejas**, no las próximas. Con más de 50 eventos/tareas históricos (las rutinas generan uno por
  ocurrencia) Agenda dejaba de mostrar lo pendiente real. Se subió a `limit=200` (el máximo) como fix
  inmediato; migrar Agenda a usar el nuevo filtro de rango server-side en vez de traer todo y filtrar en
  cliente queda como mejora futura (ver ítem de paginación abajo).
- **[BAJO]** ~~`documents.ts` no valida tipo de archivo, solo tamaño (25MB).~~ ✅ Resuelto — whitelist de
  mimetypes (PDF + imágenes comunes) vía `fileFilter` de multer, responde 400 si no matchea.
- **[BAJO]** Sin paginación real (cursor) en ningún endpoint — límite fijo de 200. _(pendiente)_
- ~~**[BAJO] `AHORA_CR` en `apps/mcp/src/index.ts` se calcula una sola vez al cargar el módulo.**~~
  Descartado tras investigar — no es un bug: `docker-compose.yml` confirma que OpenClaw invoca el MCP con
  `docker compose run --rm` por cada tool call, un proceso nuevo cada vez, así que calcularlo una vez al
  cargar el módulo es correcto en este diseño.

## 3. Funciones nuevas sugeridas

- ~~**Módulo de proyectos**~~ ✅ Completo — tabla `projects` (name, description, status active/archived,
  created_by) + `project_id` nullable en tasks/events/notes/documents. API (`projectsRouter` + `project_id`
  wireado en tasks/events/notes/documents), MCP (`crear_proyecto`, `listar_proyectos`, `proyecto_id`
  opcional en crear_tarea/crear_evento/crear_nota/guardar_documento) y web (`ProjectsPage.tsx` con progreso
  agregado en verde, `ProjectSelect.tsx` wireado en Tareas/Agenda/Notas/Documentos — crear y editar). Scopes
  `projects:read`/`projects:write` otorgados a `quicks-agent`.
- Recordatorios recurrentes independientes de rutinas ("cada 2 horas", sin crear una rutina completa).
- Indicador en la UI cuando un recordatorio quedó "sin aviso real" por fallo silencioso del cron.
- Vista "Hoy" consolidada (tareas vencen hoy + eventos hoy + próxima ocurrencia de rutina) — el dato ya
  existe, falta la vista.
- Búsqueda global (Ctrl+K) — hoy `q` solo existe en notas/documentos.
- Alertas de mantenimiento vehicular por km/fecha (ya existe historial, falta el aviso proactivo).
- Multiusuario/compartido — `supabase/schema.sql` ya insinúa "single-user hoy, multi-tenant mañana".

## 4. Deuda técnica / limpieza

- **[MEDIO]** Lógica de fecha/hora CR duplicada casi idéntica entre `apps/web/src/api.ts` y
  `apps/mcp/src/index.ts` — ya empezó a divergir; candidato a paquete compartido en el monorepo.
- ~~**[BAJO] `trackCreatedBy` inconsistente.**~~ ✅ Resuelto — `created_by` agregado a vehicles,
  vehicle_maintenance, lists, subtasks, nutrition_logs, exercise_logs (migración + `trackCreatedBy: true`
  en sus routers). Badge visible en `VehiclesPage.tsx` (representativo — lists/subtasks no tienen UI de
  badges hoy, nutrition/exercise son solo-MCP sin página web). `routine_completions` queda afuera a
  propósito: es `readOnly`, nada externo escribe ahí.
- **[BAJO]** Sin tests automatizados en ninguna app — `routineSchedule.ts` está escrito como función pura
  pensada para testear, pero nada la ejerce. _(pendiente)_
- ~~**[BAJO] Parseo de `limit` duplicado.**~~ ✅ Resuelto — `parseLimit()` nuevo en
  `apps/api/src/utils/pagination.ts`, usado por `resourceRouter.ts` y `documents.ts`.
