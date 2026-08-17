# Pendientes

Barrido general de la app (08-ago-2026): bugs, mejoras y funciones nuevas propuestas.
No implementado todavía — este documento es la lista de trabajo, no un changelog.

## 1. Bugs / correcciones

- ~~**[ALTO] No se podía marcar una tarea como hecha desde el detalle de un proyecto.**~~ ✅ Resuelto
  (14-ago-2026, reportado por el usuario). Causa: el checkbox de completar en `ProjectsPage.tsx` llamaba a
  `completeTask.request(task)` (el mismo hook `useCompleteTask` de siempre), pero ese hook no marca directo
  — para tareas no hechas guarda un "pendiente" y espera que la pantalla renderice el `ConfirmDialog` de
  confirmación; ese `ConfirmDialog` nunca se agregó a `ProjectsPage.tsx` cuando se armó la vista de detalle,
  así que el click quedaba en un estado pendiente invisible y no pasaba nada. Se agregó el mismo
  `ConfirmDialog` que ya tienen Hoy/Agenda/Tareas al final de `ProjectDetail`.

- ~~**[MEDIO] En "Hoy", una ocurrencia de rutina se veía duplicada: una vez como evento y otra como
  rutina.**~~ ✅ Resuelto (14-ago-2026, reportado por el usuario: "sacar la basura" aparecía dos veces
  hoy — reportado junto con "si marco la tarea como hecha, el evento queda sin marcar"). Investigado
  a fondo el reporte de asimetría marcar-tarea/marcar-evento: los tres puntos de la app que marcan una
  tarea como hecha (`TodayPage.tsx`, `AgendaPage.tsx` — tabla, lista móvil y modal —, `TasksPage.tsx`)
  usan el mismo hook compartido `useCompleteTask`, que llama al mismo `PATCH /tasks/:id` e invalida las
  mismas queries (`tasks`, `events`, `reminders`, `routines`) sin importar por cuál entrada se marque;
  un evento nunca tiene su propio estado "hecho", siempre se deriva de `task.status` de la tarea
  vinculada. Se revisaron 10 pares tarea+evento recientes en producción y todos tenían estados
  consistentes — no se encontró ninguna ruta de código donde marcar la tarea no se reflejara en el
  evento. Lo que sí se confirmó como bug real es la duplicación: toda ocurrencia de rutina
  (`createOccurrence` en `apps/api/src/services/routines.ts`) crea SIEMPRE tarea + evento juntos, igual
  que una tarea-con-evento creada a mano — pero `TodayPage.tsx` mostraba "Eventos de hoy" y "Rutinas de
  hoy" como secciones independientes sin cruzar `task_id`, así que la misma ocurrencia salía dos veces.
  Fix en `TodayPage.tsx`: `routinesToday` ahora excluye una rutina si el `task_id` de su ocurrencia
  actual ya está cubierto por un evento de hoy (mismo patrón `eventTaskIds` que ya usaba `tasksToday`).
  De paso se cerró un hueco relacionado: `tasksOverdue` (la sección "Tareas atrasadas" agregada este
  mismo día) no excluía `eventTaskIds` como sí lo hacía `tasksToday` — una tarea vencida cuyo evento se
  reagendó para hoy también se habría visto duplicada.

- ~~**[MEDIO] Una tarea vencida sin marcar como hecha quedaba invisible en "Hoy" — solo se veía
  entrando a su categoría.**~~ ✅ Resuelto (14-ago-2026, reportado por el usuario) — `TodayPage.tsx`
  solo mostraba tareas con `due_date` de exactamente hoy; una vez pasado el día, la tarea no vencida
  desaparecía de la vista principal sin ningún aviso. Se agregó una sección "Tareas atrasadas" (tono
  ámbar, arriba de "Eventos de hoy") con toda tarea `due_date < hoy` (comparado en fecha calendario de
  Costa Rica, mismo criterio `toCRDate` que el resto de la página) y `status !== "done"`, mostrando la
  fecha en que venció. Ícono nuevo `IconAlertTriangle` en `icons.tsx`.

- ~~**[ALTO] El MCP no tenía forma de editar una tarea ya creada — solo crear y completar.**~~ ✅
  Resuelto (12-ago-2026, encontrado al intentar corregir la categoría de una tarea que Quicks acababa
  de crear sin ella) — `editar_tarea` nueva en `apps/mcp/src/index.ts`, PATCH parcial sobre
  `/tasks/:id` (título, notas, fecha límite, proyecto, categoría, prioridad — todos opcionales, solo
  se manda lo que cambia). El API (`resourceRouter` genérico) ya soportaba `PATCH` para tasks, el gap
  era solo que ninguna tool del MCP lo exponía.

- ~~**[ALTO] `crear_tarea` del MCP no exponía categoría — Quicks le decía al usuario que las tareas no
  tienen categoría, lo cual es falso.**~~ ✅ Resuelto (12-ago-2026, reportado por el usuario vía
  transcript de WhatsApp) — `apps/api/src/routes/tasks.ts` siempre soportó `list_id` (categoría)
  opcional; el gap era que `crear_tarea` en `apps/mcp/src/index.ts` nunca exponía ese parámetro (a
  diferencia de `crear_rutina`, que sí tiene `categoria_id`) — no es algo que "cambió", nunca estuvo.
  Se agregó `categoria_id` a `crear_tarea` (mapea a `list_id`) y se aclaró en la descripción que las
  tareas sí tienen categoría, para que Quicks no vuelva a inventar esa limitación.
- ~~**[ALTO] El aviso de kilometraje inventó lecturas falsas y las guardó solo, sin que el usuario
  respondiera.**~~ ✅ Resuelto (13-ago-2026, detectado por el usuario: Focusbrain mostraba 2 lecturas
  "inventadas" de hoy por vehículo — 17500 km Bajaj Ns200, 85000 km Honda Civic — sin que él le hubiera
  contestado nada a Quicks). Confirmado con una consulta directa a `vehicle_mileage_logs`: 4 filas,
  `created_by: "agent"`, las 4 a las 09:01 CR, 1 minuto después de correr el cron de las 09:00. Causa
  raíz: `MILEAGE_CRON_MESSAGE` (`apps/api/src/routes/settings.ts`) le pedía a Quicks "preguntale... y
  guardalo con `registrar_kilometraje` en cuanto te responda" — instrucción imposible de cumplir bien,
  porque la sesión de cron es `sessionTarget: "isolated"` de un solo turno: no hay forma de esperar la
  respuesta real del usuario dentro de esa misma ejecución. Cuando además falló el envío del mensaje
  (mismo bug de cross-context messaging del punto anterior), Quicks terminó inventando valores redondos
  y guardándolos igual, dos veces, para "completar" la instrucción. Las 4 lecturas falsas se borraron a
  mano desde la UI (Vehículos → historial de kilometraje). Fix: el mensaje ahora solo pide preguntar,
  explícito "no llames `registrar_kilometraje` en este turno bajo ninguna circunstancia, ni inventes un
  valor"; y se sacó `registrar_kilometraje` de `brainfocusTools` para este job — el cron ya ni tiene la
  tool disponible, por diseño, no solo por instrucción. El guardado real queda para cuando el usuario
  responda en una conversación normal (esa sesión sí puede esperar la respuesta).

- ~~**[ALTO] El reintento por Telegram dentro del propio turno de Quicks es estructuralmente
  imposible — el gateway lo bloquea siempre, no era un bug de nombre de parámetro.**~~ ✅ Resuelto
  (13-ago-2026, reportado por el usuario: un recordatorio de "cortarte el pelo" llegó bien por
  WhatsApp pero con una nota final confusa de "no pude enviar por error de permisos de
  cross-context"). Diagnosticado con `journalctl -u openclaw` en el VPS:
  `Cross-context messaging denied: action=send target provider "whatsapp"/"telegram" while bound to
  "kapso-whatsapp"` — el gateway rechaza cualquier uso de la tool `message` hacia un canal distinto
  del que quedó atado (`delivery.channel`) a la sesión del cron, sin excepción, independientemente
  del nombre del parámetro (`target` ya estaba bien desde el fix del 12-ago) o del canal pedido. La
  instrucción "reintentá por Telegram con la tool message si falla WhatsApp" (agregada el 10-ago)
  nunca podía cumplirse: cada disparo generaba dos fallos garantizados (whatsapp y telegram) que
  Quicks terminaba filtrando como advertencia en el texto final del mensaje, aunque la entrega real
  (vía `delivery: {mode:"announce"}`, que maneja el gateway directo y no pasa por la tool `message`
  del agente) ya se había completado bien. `withTelegramFallback()` en
  `apps/api/src/services/openclawCron.ts` ahora es un passthrough — se sacó la instrucción de
  reintento del mensaje. `failureAlert` (campo de `cron.add`, gateway-native, no usa la tool
  `message`) sigue siendo el único fallback real y no se tocó.

- ~~**[ALTO] El reintento por Telegram cuando falla WhatsApp nunca se mandaba — la instrucción usaba
  el parámetro equivocado.**~~ ✅ Resuelto (12-ago-2026) — `withTelegramFallback` (`openclawCron.ts`,
  agregado el 10-ago) le decía a Quicks usar `to: "<numero>"` con la tool `message`, pero el parámetro
  real (confirmado en vivo con `openclaw message send --channel telegram --target <numero>`) es
  `target`, no `to`. Con el nombre equivocado, el reintento terminaba mandándose por el canal por
  defecto (WhatsApp) usando el chat id de Telegram como si fuera un número de teléfono, y fallaba
  también — confirmado con un caso real ("Tender mi ropa", error `Message: \`7843485332\` failed`). El
  `failureAlert` (campo de `cron.add`, no pasa por la tool `message`) sí funcionaba bien todo este
  tiempo, por eso el usuario se enteraba del fallo igual, solo que el reintento automático nunca
  llegaba. Texto de la instrucción corregido para usar `target` explícito.

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
- ~~**Animación de fondo (`NeuronBackground.tsx`) apagada por completo en móvil.**~~ ✅ Resuelto (15-ago-2026,
  pedido del usuario: "devolvé la animación en móvil pero sutil y optimizada"). Antes el breakpoint de
  768px apagaba el `requestAnimationFrame` entero por debajo de esa medida (comentario original: "los
  dispositivos más sensibles a batería/CPU"). Ahora corre en móvil pero bastante más liviana en vez de
  apagada: menos nodos (22 en vez de los 70 de escritorio — el costo real es la doble iteración de
  conexiones por cercanía, O(n²), así que la cantidad de nodos es lo que más pesa), menos opacidad (factor
  0.55 sobre la que ya trae cada pantalla, para que quede sutil detrás del contenido) y framerate
  limitado a ~20fps (en vez de sin límite/~60fps) comparando el timestamp de `requestAnimationFrame` contra
  el del último frame dibujado. `prefers-reduced-motion` sigue apagándola del todo (es preferencia de
  accesibilidad, no de rendimiento, no se toca). Al cruzar el breakpoint en vivo (rotar el celular, achicar
  la ventana) reinicializa los nodos para no arrastrar la cantidad del modo anterior.

## 3. Funciones nuevas sugeridas

- ~~**Módulo de proyectos**~~ ✅ Completo — tabla `projects` (name, description, status active/archived,
  created_by) + `project_id` nullable en tasks/events/notes/documents. API (`projectsRouter` + `project_id`
  wireado en tasks/events/notes/documents), MCP (`crear_proyecto`, `listar_proyectos`, `proyecto_id`
  opcional en crear_tarea/crear_evento/crear_nota/guardar_documento) y web (`ProjectsPage.tsx` con progreso
  agregado en verde, `ProjectSelect.tsx` wireado en Tareas/Agenda/Notas/Documentos — crear y editar). Scopes
  `projects:read`/`projects:write` otorgados a `quicks-agent`.
  **14-ago-2026:** ampliado — reportado por el usuario que "abrir un proyecto no hacía nada" y que hacía
  falta poder crear tareas/eventos agrupados dentro del proyecto. `ProjectsPage.tsx` ahora tiene una vista
  de detalle (click en un proyecto de la lista) que agrupa sus eventos, tareas (sin duplicar las que ya
  tienen evento, mismo criterio `eventTaskIds` que se usó para el fix de Hoy) y notas, con botones "+
  Tarea"/"+ Evento" que abren los mismos formularios de Tareas/Agenda (`NewTaskModal`, `NewEventForm`,
  exportados de sus archivos originales con un `defaultProjectId` nuevo) ya preasignados a ese proyecto —
  no se duplicó el formulario, se reusó el existente. Ícono nuevo `IconArrowLeft` en `icons.tsx` para el
  botón de volver.
  **Mismo día, ampliado:** pedido "que se puedan abrir las tareas editar, etc desde la pantalla de
  proyectos" — antes la lista de tareas/eventos del detalle de proyecto era de solo lectura (aparte del
  checkbox). Ahora hacer click en una tarea o evento abre el mismo modal de detalle/edición/borrado que ya
  existe en Tareas y Agenda (`TaskDetail` de `TasksPage.tsx`, `EventDetail` de `AgendaPage.tsx`, ambos
  exportados — otra vez reusando el componente existente en vez de duplicarlo). El checkbox de completar
  hace `stopPropagation` para no abrir el modal sin querer al tildar.
- ~~**Indicador en la UI cuando un recordatorio quedó "sin aviso real".**~~ ✅ Resuelto — `ReminderBadge.tsx`
  extraído de `AgendaPage.tsx` a componente compartido; ahora también se muestra en `TaskDetail`
  (`TasksPage.tsx`) para el recordatorio propio de la tarea o de su evento ligado, y un ícono en la vista
  compacta de lista cuando aplica el caso "sin aviso". Antes solo era visible desde Agenda.
- ~~**Vista "Hoy" consolidada.**~~ ✅ Resuelto — `TodayPage.tsx` nuevo, primer módulo del nav: eventos de
  hoy + tareas que vencen hoy + ocurrencia de rutina de hoy, con el mismo checkbox de completar
  (`useCompleteTask`) que Tareas/Agenda/Rutinas.
  **14-ago-2026:** pedido por el usuario — las tareas de "Tareas atrasadas" y "Tareas que vencen hoy" ahora
  muestran de qué categoría y de qué proyecto vienen (badges nuevos, junto a la prioridad). `CategoryBadge.tsx`
  se extrajo del pill que ya existía en el detalle de tarea (`TasksPage.tsx`) a componente compartido;
  `ProjectBadge.tsx` es nuevo (ícono `IconFolder` + nombre del proyecto).
  **Mismo día, ampliado:** pedido "agrupa las tareas según su categoría pero siempre visibles" — dentro de
  esas dos secciones las tareas ahora se agrupan por categoría con un subtítulo (punto de color + nombre)
  entre grupos, sin colapsar ni ocultar ninguno (a diferencia de la vista Tareas por categoría, que sí es
  navegación aparte). `groupByCategory` nuevo en `TodayPage.tsx`; el `CategoryBadge` por tarea se quitó de
  estas dos secciones porque quedaba redundante con el subtítulo del grupo — `ProjectBadge` se mantiene por
  tarea porque no se agrupa por proyecto.
  **Mismo día, ampliado otra vez:** pedido "que al darle click a la tarea se pueda ver, y que las tareas con
  subtareas aparezca el badge de proceso y porcentaje". Click en una tarea de "Tareas atrasadas" o "Tareas
  que vencen hoy" ahora abre el mismo `TaskDetail` de Tareas/Proyectos (reusado, no duplicado); el checkbox
  usa `stopPropagation` para no abrir el modal al marcar hecha. Si la tarea tiene subtareas, se muestra el
  mismo pill verde "2/5 · 40%" que ya existía en la vista compacta de Tareas — se extrajo a
  `subtaskProgress.ts` + `SubtaskProgressBadge.tsx` compartidos (antes la función vivía duplicada solo
  dentro de `TasksPage.tsx`) para poder reusarlo acá sin copiar el cálculo.

- ~~**Rutinas con fecha específica del mes ("el 15 de cada mes").**~~ ✅ Resuelto (14-ago-2026, pedido por
  el usuario) — antes `routines` solo soportaba `daily`/`weekly`. Se agregó `frequency: "monthly"` +
  columna nueva `day_of_month` (1..31, nullable, solo aplica a `monthly`). El cálculo de ocurrencias
  (`routineSchedule.ts`) clampea al último día real del mes cuando el día elegido no existe ese mes (ej. el
  31 en febrero cae el 28/29) — mismo criterio que Google/Apple Calendar; tests nuevos para el clamp y para
  que `nextOccurrenceDate` no se quede repitiendo un mes corto. Wireado en la API (`routines.ts`,
  `services/routines.ts`), la web (`RoutinesPage.tsx` — selector de frecuencia nuevo + picker de día 1-31) y
  el MCP (`crear_rutina`, `frecuencia: "mensual"` + `dia_del_mes`).
  **Mismo día, corregido:** pedido "elimina la opción de crear un recordatorio los 31 de cada mes porque se
  puede romper si el mes tiene 30" — el tope de `day_of_month` bajó de 31 a 30 en los tres lugares (web,
  API, MCP): el 31 no existe en abril/junio/septiembre/noviembre ni en febrero, así que en vez de dejar
  elegirlo y clampearlo se saca directo de la opción. Esto es **solo para rutinas recurrentes** — un
  recordatorio puntual para una fecha específica (`crear_recordatorio`/`crear_recordatorio_recurrente` de
  una sola vez) sigue funcionando igual, porque ahí el usuario elige una fecha calendario real (ej.
  "31 de agosto"), no un número de día que se repite cada mes — no se tocó nada ahí, confirmado con el
  usuario. Febrero (que tampoco llega a 30) sigue clampeado al 28/29 como antes.
  **Requiere una migración manual antes de desplegar** — igual que documenta el README para cambios de
  schema, hay que correr esto en el SQL Editor de Supabase (no se pudo aplicar solo, la API no tiene acceso
  a SQL crudo, solo REST vía `supabase-js`):
  ```sql
  alter table public.routines add column if not exists day_of_month integer;
  ```
  Ya está en `supabase/schema.sql` para que quede como referencia permanente del esquema.

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
- ~~**Módulo de Consumos** (gasto real por proveedor: IA, mensajería, hosting, ...).~~ ✅ Completo
  (15-ago-2026) — pedido por el usuario para tener visibilidad de gasto real, empezando por IA (Qwen) y
  Meta/WhatsApp (Kapso), con esquema abierto a más proveedores después sin rediseñar. Tabla nueva
  `consumos` (`supabase/schema.sql`): `fecha` (date, día calendario Costa Rica — quien alimenta el
  endpoint calcula esa fecha explícito, el corte es el mismo 06:00Z-06:00Z que ya usa OpenClaw, ver
  `CLAUDE.md`), `proveedor`, `categoria` (`ia`/`mensajeria`/`hosting`/`otro`), `cantidad`/`unidad` libres
  (tokens, conversaciones, etc.), `costo_usd`, `detalle` jsonb libre, `origen`
  (`openclaw-export`/`kapso-api`/`manual`) — RLS igual al resto de tablas por `user_id`.
  API nueva `apps/api/src/routes/consumos.ts` (no usa el `createResourceRouter` genérico porque el
  contrato de query pedido es `?desde=&hasta=&proveedor=`, no el `_gte/_lte` genérico): `GET /consumos`
  (scope `consumos:read`), `POST /consumos` (scope `consumos:write`, para el cron de reporte de uso),
  `DELETE /consumos/:id`. Scopes nuevos — hay que otorgar `consumos:write` (y `consumos:read` si Quicks
  va a poder consultarlo) a la API key de `quicks-agent`/OpenClaw desde `POST /internal/api-keys` o
  editando la key existente antes de que el cron pueda empezar a mandar datos.
  MCP: tool de solo lectura `consultar_consumos` (`desde`/`hasta`/`proveedor` opcionales) para que Quicks
  pueda responder "cuánto llevamos gastado en X" desde el chat — la descripción de la tool le recuerda
  revisar `origen` antes de presentar el costo como dato definitivo (puede ser estimado o manual).
  Web: módulo nuevo "Consumos" en el sidebar (`ConsumosPage.tsx`, ícono `IconChartBar` nuevo) — gasto
  total del mes (rango calculado con `timeZone: "America/Costa_Rica"` explícito, no la hora del
  navegador), desglose por proveedor, tendencia diaria (barras CSS simples, sin librería de gráficos —
  no había ninguna en el repo y no ameritaba sumar una dependencia para esto) y detalle expandible. La
  UI deja `origen: "manual"` visible con la fecha del último registro cuando aplique, en vez de
  aparentar que el total está actualizado en vivo (previsto para el caso en que Meta/WhatsApp no
  tuviera API confiable — ver corrección más abajo, al final no hizo falta).
  Alertas de gasto anómalo: no implementadas (opcionales, no bloqueantes según lo pedido).
  **15-ago-2026, en producción:** el usuario conectó ambas fuentes vía cron en OpenClaw (fuera de este
  repo, no hay código que tocar acá): `usage-weekly.js` corre diario a las 00:12 CR con el gasto real
  de Qwen (estimado desde logs internos de tokens, `origen: "openclaw-export"`) y un cron nuevo
  `consumos_meta_diario` corre diario a las 00:18 CR contra el `pricing_analytics` del Graph API de
  Meta sobre la WABA (`origen: "kapso-api"`, `categoria: "mensajeria"`) — ambos con reemplazo idempotente
  si corren dos veces. Scopes `consumos:write`/`consumos:read` otorgados a la key `quicks-agent`.
  **Corrección a lo dicho arriba sobre Meta/Kapso:** al investigarlo en vivo sí existe una API de
  billing real — Meta descontinuó el pricing por conversación (24h) el 1-jul-2025 y pasó a cobrar por
  plantilla entregada, con el campo `pricing_analytics` del Graph API sobre el WABA dando el desglose
  exacto por categoría (`marketing`/`utility`/`authentication`/`service`) — el dato es real, no
  estimado. El truco está en el parámetro: la documentación menciona `category` pero no filtra nada,
  hay que usar `dimensions=["PRICING_TYPE","COUNTRY"]`. Kapso en sí no expone esto (son un wrapper para
  enviar/recibir mensajes, no de billing — los cargos de Meta "se pasan por separado"), así que se
  consulta el Graph API de Meta directo. No quedó como carga manual.
- ~~**Módulo de Resumen** (tareas completadas por día, ej. "qué marqué como hecha ayer").~~ ✅ Completo
  (16-ago-2026) — pedido por el usuario. `ResumenPage.tsx` nuevo en el sidebar (ícono `IconCheckCircle`
  reusado, sin ícono nuevo): filtros rápidos Hoy/Ayer/Últimos 7 días + rango manual de fechas, listando
  las tareas con `status: "done"` cuyo `completed_at` cae dentro del día/rango elegido (día calendario
  de Costa Rica, `${fecha}T00:00:00-06:00` a `${fecha}T23:59:59.999-06:00` — offset explícito, nunca la
  hora del navegador, ver [CLAUDE.md](CLAUDE.md)). Cada fila muestra categoría/proyecto/prioridad y la
  hora en que se completó; click abre el mismo `TaskDetail` que Tareas/Agenda/Proyectos (reusado, no
  duplicado). `GET /tasks` ya soportaba `completed_at_gte`/`completed_at_lte` genérico (mismo mecanismo
  `_gte`/`_lte` de `resourceRouter.ts` usado en otros módulos) — no hizo falta endpoint nuevo.
  **Bug de fondo encontrado y corregido en el camino:** `tasks.completed_at` existía en el schema desde
  antes pero **nunca se llenaba** al completar una tarea desde el checkbox compartido de la web
  (`useCompleteTask` → `PATCH /tasks/:id` solo mandaba `status`) — sin este fix, Resumen se hubiera
  quedado vacío para toda tarea completada desde la app, que es el caso normal (solo `completar_tarea`
  del MCP lo mandaba a mano). Se resolvió del lado del servidor, no del cliente, para que valga sin
  importar quién complete la tarea: `resourceRouter.ts` gana un hook nuevo `beforeUpdate` (mezcla un
  patch en la escritura antes de guardar, distinto de `afterUpdate` que corre después) y
  `tasks.ts` lo usa para llenar `completed_at` al pasar a "done" y limpiarlo al despasar, sin pisar un
  valor si el caller ya lo manda explícito. El tool `completar_tarea` del MCP se simplificó para ya no
  mandarlo a mano (lo llena la API sola ahora).

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
