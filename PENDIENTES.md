# Pendientes

Barrido general de la app (08-ago-2026): bugs, mejoras y funciones nuevas propuestas.
No implementado todavía — este documento es la lista de trabajo, no un changelog.

## 1. Bugs / correcciones

- ~~**[ALTO] El aviso de kilometraje fallaba en silencio: la sesión de cron no tenía las tools de
  brainfocus-api.**~~ ✅ Resuelto (10-ago-2026, reportado por el propio Quicks al correr el job) —
  `apps/api/src/services/openclawCron.ts` nunca seteaba `payload.toolsAllow` en ningún `cron.add`; sin
  ese campo, una sesión de cron `isolated` cae al set mínimo del gateway (`cron`, `message`,
  `web_search`, `web_fetch`), sin ninguna tool `brainfocus-api__*` — el job de kilometraje necesita
  llamar `listar_vehiculos`/`listar_kilometrajes`/`registrar_kilometraje` de verdad, no solo relayar
  texto, así que no podía avanzar. `scheduleRecurringCron`/`scheduleOnceCron` ahora aceptan
  `brainfocusTools?: string[]` (nombres cortos, se les agrega el prefijo `brainfocus-api__` solo) y
  arman `payload.toolsAllow` con eso + el set base. `settings.ts` (kilometraje) pasa las 3 tools que
  necesita; `recurringReminders.ts` (Asistente) le da acceso de solo-lectura amplio a los avisos con
  `is_instruction=true` (no se sabe de antemano qué va a necesitar una instrucción libre). Los
  recordatorios simples (`scheduleReminderCron`, tarea/evento) solo relayan texto — no necesitaban
  tools nuevas, pero ahora también setean `toolsAllow` explícito en vez de depender del default
  implícito del gateway, para no repetir esta clase de bug.

- ~~**[ALTO] WhatsApp falla en silencio si el usuario no interactúa con Quicks en 24h.**~~ ✅ Resuelto
  (10-ago-2026, pedido explícito del usuario) — Kapso/WhatsApp exige reabrir la conversación con una
  plantilla si pasaron más de 24h desde la última interacción del usuario; sin eso, el envío se pierde
  sin error visible en la app. `apps/api/src/services/openclawCron.ts`: todo `cron.add` de
  recordatorios (`scheduleReminderCron`, `scheduleRecurringCron`, `scheduleOnceCron`) ahora (1) le
  agrega al `payload.message` la instrucción explícita de reintentar por Telegram
  (`channel: "telegram", to: "7843485332"`) si falla WhatsApp, y (2) manda `failureAlert:
  {channel: "telegram", to: "7843485332", accountId: "default"}` a nivel de job — mecanismo del
  gateway mismo (no de Quicks), avisa por Telegram si la entrega falla del todo, sin depender de que
  el agente razone sobre el fallo dentro del turno. Doble capa: instrucción a nivel de agente +
  alerta a nivel de infraestructura.
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
- ~~**[MEDIO] Todos los módulos vivían en la misma URL (`app.focusbraincr.com/`), sin rutas propias.**~~
  ✅ Resuelto (10-ago-2026, reportado por el usuario) — refrescar la página (o guardar/compartir un link a
  un módulo específico) siempre volvía a "Hoy", porque el módulo activo era solo un `useState` en memoria,
  nunca reflejado en la URL. `apps/web/src/useModuleRoute.ts` nuevo: cada módulo tiene su ruta real
  (`/tareas`, `/agenda`, `/asistente`, ...) sincronizada con `window.history` — sin sumar
  `react-router-dom`, un router casero alcanza para 10 pantallas fijas de un solo usuario. Requirió que el
  server sirva `index.html` para cualquier ruta (ya estaba: `apps/web/nginx.conf` tiene
  `try_files $uri $uri/ /index.html`).

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
  **10-ago-2026:** promovido a módulo propio del sidebar, **Asistente** (`AsistentePage.tsx`), mismo
  table (`recurring_reminders`, columnas nuevas `schedule_type`/`scheduled_at`/`is_instruction`). Ahora
  cubre también avisos de una sola vez (`scheduleOnceCron` nuevo en `openclawCron.ts`, análogo al
  recurrente pero con `schedule.at`) y el checkbox "Es una instrucción para Quicks" — cuando está
  marcado, el texto se manda tal cual como orden a ejecutar (no envuelto en "avisale esto"). MCP: tools
  renombradas `crear_aviso_asistente`/`listar_avisos_asistente`/`pausar_aviso_asistente`/
  `borrar_aviso_asistente` (mismo resource/scopes, no hizo falta SQL nuevo).
  **Bug real encontrado el mismo 10-ago-2026** (reportado por el usuario: un aviso puesto para las
  10:51am quedó guardado y sonó a las 11:51am): `AsistentePage.tsx` armaba `scheduled_at` con `new
  Date(valorDelInput).toISOString()`, que interpreta el `datetime-local` con la zona horaria del
  navegador/SO, no con la de Costa Rica — un desfase de 1h si el dispositivo no está en `-06:00`.
  Corregido usando `CR_OFFSET` explícito de `packages/shared-time` (mismo patrón que ya usan
  Tareas/Agenda/Rutinas), tanto al guardar como al mostrar (`toLocaleString` ahora con `timeZone:
  "America/Costa_Rica"` explícito). Se agregó [CLAUDE.md](CLAUDE.md) con la regla general de "nunca
  construir fecha/hora confiando en la zona horaria del entorno, siempre offset/timeZone de Costa
  Rica explícito" para no repetir esta clase de bug. También se agregó **edición** en la UI del
  Asistente (lápiz por ítem, precarga el formulario, usa el `afterUpdate` hook que ya reprogramaba el
  cron solo — antes solo existía crear/pausar/borrar).
  **10-ago-2026 (más tarde el mismo día):** filtro Pendientes/Enviados en la lista, default
  Pendientes. Los recurrentes siempre caen en Pendientes (no tienen noción de "enviado", un solo
  disparo no aplica); solo los "una vez" pasan a Enviados, y solo una vez que `scheduled_at` ya pasó
  (mismo `isSent()` que ya se usaba para el badge).
  **10-ago-2026 (más tarde todavía):** movido en el sidebar a debajo de Tareas (antes iba después de
  Vehículos) — orden nuevo: Hoy, Agenda, Tareas, **Asistente**, Proyectos, Rutinas, Notas y memorias,
  Documentos, Vehículos, Configuración.
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
  **10-ago-2026:** a pedido del usuario, cambia de "una vez al mes" a "cada 2 días hasta que responda" —
  el cron pasó de `0 9 1 * *` a `0 9 */2 * *` (`apps/api/src/routes/settings.ts`) y el mensaje ahora le
  pide a Quicks que antes de preguntar revise con `listar_kilometrajes` si ya hay una lectura de ese
  vehículo en el mes-calendario actual; si ya la hay, no vuelve a preguntar por ese vehículo. No hizo
  falta tocar el mecanismo de cron recurrente en sí, solo el `cronExpr` y el texto del mensaje. Un usuario
  que ya tenía el aviso activado antes de este cambio necesita apagar y prender el toggle en Configuración
  una vez para que se reprograme con el nuevo `cronExpr` (el `toggle` cancela el job viejo y crea uno
  nuevo).
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

- ~~**Cambio sin commitear en `docker-compose.yml` del VPS (volumen de `mcp` ampliado).**~~ ✅
  Resuelto (confirmado por el usuario 10-ago-2026, fix real del 05-ago-2026) — el mount pasó de
  `/root/.openclaw/media:/root/.openclaw/media:ro` a `/root/.openclaw:/root/.openclaw:ro` porque un
  adjunto real de WhatsApp/Telegram no vive solo en `/root/.openclaw/media/inbound/`: OpenClaw deja
  además una copia "staged" en `/root/.openclaw/workspace/media/inbound/openclaw-staged-<uuid>/<nombre>`,
  y es esa ruta la que se expone como `MediaPath` al modelo con un archivo real. El mount acotado no
  cubría `workspace/media`, así que `guardar_documento` daba `ENOENT` con un PDF real (no con un
  archivo de prueba puesto a mano). Se amplió a la raíz completa de solo lectura en vez de listar
  rutas puntuales, para no perseguir cada ruta nueva si el patrón de staging cambia. Ya persistido en
  `docker-compose.yml` (raíz del repo).
- **Archivos `.bak-20260803` sueltos en el VPS**, no parte del repo (untracked): 
  `apps/api/src/services/openclawCron.ts.bak-20260803` y `docker-compose.yml.bak-20260803` —
  confirmado que son snapshots pre-fix del 03-ago-2026, completamente superados por el código
  actual. Parecen residuos de debugging de otra sesión. _(pendiente: limpiarlos si el usuario
  confirma que no hace falta conservarlos)._
