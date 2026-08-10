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
  duplicado real. _(decisión del usuario 09-ago-2026: dejar como está — no es un problema confirmado en
  producción todavía, a diferencia del caso real de duplicado exacto que sí pasó)_
- ~~**[BAJO] `routine_completions` expone escritura completa.**~~ ✅ Resuelto — nuevo flag `readOnly` en
  `createResourceRouter`, aplicado a `routine_completions` (solo GET).

## 2. Mejoras a funciones existentes

- **[MEDIO]** Editar una rutina no reprograma la ocurrencia pendiente actual
  (`apps/web/src/RoutinesPage.tsx`) — falta opción "aplicar también a hoy". _(decisión del usuario
  09-ago-2026: mantener el comportamiento actual — si se quiere cambiar la ocurrencia de hoy, se edita esa
  tarea directamente desde Tareas/Agenda, ya se puede)_
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
- ~~**Indicador en la UI cuando un recordatorio quedó "sin aviso real".**~~ ✅ Resuelto — `ReminderBadge.tsx`
  extraído de `AgendaPage.tsx` a componente compartido; ahora también se muestra en `TaskDetail`
  (`TasksPage.tsx`) para el recordatorio propio de la tarea o de su evento ligado, y un ícono en la vista
  compacta de lista cuando aplica el caso "sin aviso". Antes solo era visible desde Agenda.
- ~~**Vista "Hoy" consolidada.**~~ ✅ Resuelto — `TodayPage.tsx` nuevo, primer módulo del nav: eventos de
  hoy + tareas que vencen hoy + ocurrencia de rutina de hoy, con el mismo checkbox de completar
  (`useCompleteTask`) que Tareas/Agenda/Rutinas.
- ~~**Recordatorios recurrentes independientes de rutinas.**~~ ✅ Resuelto (09-ago-2026) — tabla
  `recurring_reminders` nueva (frequency: every_n_hours/daily/weekly, `active` para pausar sin borrar).
  Reusa `scheduleRecurringCron` (mismo mecanismo del aviso mensual de kilometraje) — puro aviso periódico,
  no genera tarea ni queda en ningún historial. API con hooks que programan/reprograman/cancelan el cron
  real cuando cambia algo relevante. MCP: `crear_recordatorio_recurrente`,
  `listar_recordatorios_recurrentes`, `pausar_recordatorio_recurrente`, `borrar_recordatorio_recurrente`
  (scopes ya otorgados a `quicks-agent`). Web: sección "Avisos recurrentes" en Configuración.
- ~~**Alertas de mantenimiento vehicular por km/fecha.**~~ ✅ Resuelto — `vehicles.next_maintenance_date` /
  `next_maintenance_mileage` nuevos. La fecha programa un recordatorio real (`reminders.vehicle_id`, mismo
  mecanismo que tasks/events: se recrea si la fecha cambia, se cancela si se borra el vehículo). El
  kilometraje es solo indicador visual (badge rojo si el mayor `mileage` del historial ya lo alcanzó) —
  no hay forma de disparar un aviso automático sin una lectura de odómetro en vivo. MCP:
  `fijar_proximo_mantenimiento`.
- ~~**Pedido del usuario 09-ago-2026: que Quicks pregunte mensualmente el kilometraje.**~~ ✅ Resuelto —
  `vehicle_mileage_logs` nuevo (lecturas de odómetro sueltas, no implican un servicio hecho), alimenta el
  control de uso mensual (Δ entre lecturas, mostrado en `VehiclesPage.tsx`) y la alerta de mantenimiento
  por km (junto con `vehicle_maintenance`). Toggle en Configuración
  (`profiles.mileage_reminder_enabled`/`mileage_reminder_cron_id`) crea/cancela un cron **recurrente** real
  en OpenClaw (`schedule.kind:"cron"` + `expr` + `tz`) — a diferencia de todo el resto de recordatorios de
  la app, que son one-shot (`schedule.at`). El shape recurrente no está documentado en ningún lado; se
  confirmó en vivo el 09-ago-2026 con `openclaw cron add --cron ... --tz ... --json` y probando el mismo
  payload directo contra `POST /tools/invoke` antes de codificarlo (mismo criterio que la investigación del
  canal WhatsApp/Kapso del 07-ago). MCP: `registrar_kilometraje`, `listar_kilometrajes`. Scopes
  `vehicle_mileage:read`/`vehicle_mileage:write` otorgados a `quicks-agent` (09-ago-2026).
- Búsqueda global (Ctrl+K) — hoy `q` solo existe en notas/documentos.
- Multiusuario/compartido — `supabase/schema.sql` ya insinúa "single-user hoy, multi-tenant mañana".

## 4. Deuda técnica / limpieza

- ~~**[MEDIO] Lógica de fecha/hora CR duplicada entre `apps/web/src/api.ts` y `apps/mcp/src/index.ts`.**~~ ✅
  Resuelto — `packages/shared-time` nuevo (paquete local sin dependencias runtime, `file:` dependency,
  npm crea un symlink real): `CR_OFFSET`, `TWO_HOURS_MS`, `formatReminderTitle`, `isFutureReminder`,
  `horaActualCR`, `isoACostaRica`, `canRemindTwoHoursBefore`. Bonus: `apps/api/src/services/routines.ts`
  también tenía su propio `CR_OFFSET`, ahora usa el compartido. Requirió cambiar el build context de Docker
  de `./apps/<app>` a la raíz del repo en los tres Dockerfile + `docker-compose.yml` (para que
  `packages/shared-time` sea visible al construir cada imagen) — probado con `docker compose build` (sin
  `up -d`) antes de promoverlo, y el contenedor `mcp` verificado en vivo con una llamada `tools/list` real
  tras el deploy.
- ~~**[BAJO] `trackCreatedBy` inconsistente.**~~ ✅ Resuelto — `created_by` agregado a vehicles,
  vehicle_maintenance, lists, subtasks, nutrition_logs, exercise_logs (migración + `trackCreatedBy: true`
  en sus routers). Badge visible en `VehiclesPage.tsx` (representativo — lists/subtasks no tienen UI de
  badges hoy, nutrition/exercise son solo-MCP sin página web). `routine_completions` queda afuera a
  propósito: es `readOnly`, nada externo escribe ahí.
- ~~**[BAJO] Sin tests automatizados.**~~ ✅ Resuelto (parcial, por decisión del usuario 09-ago-2026: empezar
  por `routineSchedule.ts`) — vitest instalado en `apps/api` (`npm test`), 14 tests cubriendo
  `firstOccurrenceDate`/`nextOccurrenceDate`/`describeRecurrence` (diaria, semanal, quincenal con paridad de
  semanas). El resto de la app (rutas, servicios, web) sigue sin tests.
- ~~**[BAJO] Parseo de `limit` duplicado.**~~ ✅ Resuelto — `parseLimit()` nuevo en
  `apps/api/src/utils/pagination.ts`, usado por `resourceRouter.ts` y `documents.ts`.

## 5. Infraestructura / VPS — encontrado en el barrido de documentación (09-ago-2026)

- **Cambio sin commitear en `docker-compose.yml` del VPS.** El volumen del servicio `mcp` está
  ampliado en el filesystem del VPS de `/root/.openclaw/media:/root/.openclaw/media:ro` (lo que
  dice el repo, acotado a la carpeta de media) a `/root/.openclaw:/root/.openclaw:ro` (todo el
  directorio de OpenClaw, de solo lectura). No se tocó ni se commiteó porque no hay contexto de
  por qué se amplió — preservado con `git stash`/`pop` durante los últimos `pull` para no perderlo.
  _(pendiente: preguntarle al usuario el motivo antes de decidir si se documenta como intencional o
  se revierte a la versión acotada)._
- **Archivos `.bak-20260803` sueltos en el VPS**, no parte del repo (untracked): 
  `apps/api/src/services/openclawCron.ts.bak-20260803` y `docker-compose.yml.bak-20260803` —
  confirmado que son snapshots pre-fix del 03-ago-2026, completamente superados por el código
  actual. Parecen residuos de debugging de otra sesión. _(pendiente: limpiarlos si el usuario
  confirma que no hace falta conservarlos)._
