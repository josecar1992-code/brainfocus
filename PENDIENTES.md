# Pendientes

Barrido general de la app (08-ago-2026): bugs, mejoras y funciones nuevas propuestas.
No implementado todavía — este documento es la lista de trabajo, no un changelog.

## 1. Bugs / correcciones

- ~~**[MEDIO] En Hoy, los eventos de rutina (ej. "Rutina Gimnasio", "Hacerme la barba") a veces se
  veían sin checkbox de marcar hecho, y hacerles click no abría nada.**~~ ✅ Resuelto (24-sep-2026,
  reportado por el usuario). Dos causas en `TodayPage.tsx`:
  1. **Checkbox ausente**: `api.listTasks()` (`/tasks?limit=200`) trae TODAS las tareas (hechas y
     pendientes) ordenadas ascendente por `due_date`, tope 200. Con 7 semanas de rutinas generando
     tareas cada pocos días, ya hay más de 200 tareas totales — las ~200 más viejas (casi todas ya
     "done") llenaban el cupo completo y las tareas de hoy quedaban afuera del `tasksById` armado en
     el cliente, así que el evento de hoy no encontraba su tarea vinculada y no mostraba checkbox.
     Fix: nuevo `api.listPendingTasks()` (`/tasks?limit=200&status=pending`, usando el filtro genérico
     `?campo=valor` que ya soporta `resourceRouter.ts`) — con las tareas "done" fuera, el conteo real
     baja muy por debajo de 200 (33 al momento del fix). Usado solo en `TodayPage.tsx` (Agenda/Tareas
     siguen con `listTasks()` normal porque sí necesitan ver las hechas). Nota: `Agenda` tiene el mismo
     riesgo de fondo con `listEvents()`/`listTasks()` sin filtrar — no tocado ahora, no reportado
     todavía, pero puede repetirse.
  3. **Seguimiento del mismo día (24-sep-2026, el usuario pidió revisar otras pantallas)**: el mismo
     patrón (`listTasks()`/`listEvents()`/`listReminders()` sin filtro de fecha/estado, tope fijo,
     orden ascendente) se usa también en `AgendaPage.tsx`, `TasksPage.tsx` (lista principal) y
     `ProjectsPage.tsx`. Confirmado con una consulta `count` directa a Supabase: 233 tareas reales
     (191 "done" + solo 33 "pending") contra un tope de 200 — la vista principal de Tareas estaba
     contando y mostrando solo 9 pendientes de las 33 reales, y las categorías con tareas recientes
     quedaban con datos viejos/incompletos. Eventos (115) y recordatorios (58) todavía no habían
     llegado al tope pero iban en la misma trayectoria. Fix aplicado como parche de capacidad (no la
     solución de fondo): `MAX_LIMIT` de `resourceRouter.ts` subido de 200 a 1000, y los `?limit=200`
     de `api.ts` (`listTasks`, `listEvents`, `listReminders`) subidos a 1000 — a ~4-5 tareas/día de
     crecimiento actual, da varios meses de margen.
  4. **Solución de fondo (mismo día, pedida explícitamente: "crea una paginación de 20 y el botón de
     cargar más")**: implementada — ya no depende de subir el tope cada vez que se llena.
     - **Backend** (`resourceRouter.ts`): soporte nuevo de `?offset=` (con `.range()` en vez de
       `.limit()`) para pedir páginas siguientes, y `?campo=null` → `IS NULL` (para "Sin categoría",
       que no se puede filtrar con `.eq()`).
     - **`Tareas` → categoría** (`CategoryTasksView`): ya no recibe todas las tareas de la app por
       prop — pagina 20 en 20 filtrando por `list_id` + `status` (pendientes/hechas, el mismo toggle
       que ya existía en la UI) directo en el servidor, con botón "Cargar más". Las tarjetas de
       categoría (conteo total/pendientes) siguen necesitando el status de TODAS las tareas, pero
       usan `listTaskSummaries()` — mismo endpoint con `?fields=id,list_id,project_id,status`, así
       que el peso real es mínimo aunque sean cientos de filas (no son las tareas completas con
       notas/due_date/etc., que es lo que sí se pagina).
     - **`Proyectos` → detalle de proyecto**: mismo patrón — tareas sin evento vinculado paginadas por
       `project_id`, tarjetas/progreso vía `listTaskSummaries()`.
     - **`Agenda`**: no se le puso "cargar más" — ya está armada alrededor de un rango de fechas
       elegido (hoy/semana/próxima semana/mes/rango manual), así que la solución que corresponde es
       pedirle al servidor solo los eventos de ESE rango (`listEventsInRange`, usando el filtro
       `starts_at_gte`/`starts_at_lte` que ya soportaba el backend) en vez de traer hasta 1000 eventos
       enteros y filtrar en el cliente — mismo objetivo (nada de carga masiva al entrar), pero
       encajando con cómo ya funciona esa pantalla en vez de forzar paginación por cantidad de ítems.
  5. **Efecto secundario del fix del punto 1 (25-sep-2026, reportado por el usuario: "cuando se marca
     una tarea hecha de hoy, queda como inerte sin poder hacer nada más")**: al cambiar `Hoy` a
     `listPendingTasks()` (solo `status=pending`), la tarea vinculada a un evento/rutina de hoy
     desaparece de ese fetch EN CUANTO se marca como hecha — y como `tasksById` se armaba directo de
     `tasks ?? []`, el `linkedTask` de esa fila pasaba a `undefined` de inmediato. El checkbox
     (`{linkedTask && (<input .../>)}`) y el `onClick` (`linkedTask && setOpenTask(linkedTask)`) están
     condicionados a que exista `linkedTask`, así que la fila se quedaba sin checkbox, sin tachado y
     sin poder hacer click — parecía "trabada" para siempre (nunca vuelve a aparecer en
     `listPendingTasks`, así que nunca se recupera sola). Fix en `TodayPage.tsx`: `tasksById` ahora es
     un mapa "pegajoso" (`useRef`) que acumula toda tarea vista en vez de reconstruirse solo con el
     fetch de pendientes, y se actualiza al toque con la tarea recién marcada (nuevo parámetro
     `onToggled` en `useCompleteTask.ts`, alimentado con la respuesta del `PATCH /tasks/:id`) sin
     esperar al refetch — así la fila sigue teniendo su `linkedTask` (ahora en estado "done") y se ve
     tachada normal en vez de desaparecer.
  6. **Seguimiento (07-oct-2026, el usuario mandó captura: "Darle a Quicks los Kilometrajes del mes"
     sin checkbox tras refrescar, y había que marcar dos veces)**: el mapa pegajoso del punto 5 solo
     cubría la sesión — al refrescar arranca vacío, y las tareas de hoy ya hechas no vienen en
     `listPendingTasks`, así que su evento volvía a quedar inerte (sin poder desmarcar, y al
     reintentar el usuario terminaba alternando el estado). Fix real: nueva query `tasksDueToday`
     (`api.listTasksDueBetween`, `due_date_gte/_lte` del día CR con `CR_OFFSET`, cualquier estado) en
     `TodayPage.tsx` que alimenta `tasksById` junto con las pendientes.
     - Nuevo hook compartido `usePaginatedList.ts` (sobre `useInfiniteQuery`) y componente
       `LoadMoreButton.tsx`, reusados entre Tareas y Proyectos.
     - `MAX_LIMIT=1000` del punto anterior queda como red de seguridad general (Resumen,
       exportaciones, etc.), no como la vía principal de estas tres pantallas.
  2. **Click sin efecto**: los `<li>` de "Eventos de hoy" y "Rutinas de hoy" nunca tuvieron `onClick`
     (a diferencia de "Tareas que vencen hoy"/"Tareas atrasadas", que sí abren `TaskDetail`) — no era
     un bug nuevo, nunca se implementó. Agregado: abre `TaskDetail` de la tarea vinculada al hacer click
     en la fila (con `stopPropagation` en el checkbox para no disparar los dos a la vez).
- ~~**[ALTO] Las rutinas semanales (ej. "Rutina Gimnasio", martes/jueves) podían saltarse una
  ocurrencia real — el jueves 10-sep-2026 no se generó.**~~ ✅ Resuelto (10-sep-2026, reportado por el
  usuario: "por qué no se generó la rutina de ejercicio de los jueves"). Causa raíz: `advanceRoutine()`
  y `firstOccurrenceDate()` (`apps/api/src/services/routines.ts`) calculaban "hoy" con
  `new Date().toISOString().slice(0, 10)` — el día calendario en **UTC**, no en Costa Rica — violando
  la regla de este mismo archivo (`CLAUDE.md`, sección de fechas). Entre las 6pm y medianoche hora CR
  (00:00-05:59 UTC del día siguiente), ese "hoy" queda inflado un día respecto al calendario real de
  Costa Rica. El chequeo de `advanceRoutine()` que descarta ocurrencias "ya vencidas"
  (`while (next < today) next = nextOccurrenceDate(...)`) usaba ese "hoy" inflado, así que en un avance
  que corría de noche podía tratar como vencida una ocurrencia que en Costa Rica todavía era hoy (o
  futura), saltándosela — la rutina "Rutina Gimnasio" (martes/jueves) quedó con su próxima ocurrencia en
  martes 15-sep, sin ninguna tarea generada para el jueves 10-sep. Fix: nuevo helper `hoyEnCR()` en
  `packages/shared-time` (`Intl`/`toLocaleDateString` con `timeZone: "America/Costa_Rica"`, formato
  `YYYY-MM-DD`), usado en ambas funciones en vez de `new Date().toISOString()`.
  Nota aparte, sin resolver: se encontró en los logs de producción que hay llamadas `PATCH /tasks/:id`
  con user-agent `"node"` (no navegador) editando directamente el `due_date` de tareas de rutina poco
  después de creadas — probablemente Quicks/MCP reprogramando la tarea a pedido del usuario por
  WhatsApp/Telegram. Esto puede seguir corriendo la fecha visible de una ocurrencia por fuera del
  cálculo determinístico de la rutina; no se tocó, solo se documenta como posible causa adicional de
  drift si vuelve a pasar.
- ~~**[ALTO] El fallback a Telegram por falla de WhatsApp (agregado 10-ago-2026) nunca funcionó — el
  campo que se mandaba al gateway de OpenClaw no era el que dispara la notificación real.**~~ ✅
  Resuelto (01-sep-2026, reportado por el usuario: recordatorio de las 8:30am no llegó, sospechó
  correctamente que era la ventana de WhatsApp cerrada por no haberle escrito a Quicks). Confirmado con
  los logs de producción: el job (`9ec03096-...`) sí corrió a las 8:31am y falló con
  `OutboundDeliveryError: Cannot send non-template messages outside the 24-hour window` — al no haber
  interacción del usuario en 24h, WhatsApp/Kapso no puede reabrir la conversación con un mensaje libre
  (hace falta plantilla aprobada), y el gateway deshabilita el job one-shot tras el primer error
  ("permanent error", no reintenta). Hasta ahí, esperado. El problema real: el fallback a Telegram
  agregado para cubrir exactamente este caso tampoco se disparó — `grep failureAlert` sobre los logs de
  OpenClaw de producción no encontró ninguna aparición, en ningún día desde que se agregó. Causa: se
  mandaba como campo `failureAlert` a nivel de job (sibling de `delivery`), pero revisando el fuente
  real del gateway instalado en el VPS (`/usr/lib/node_modules/openclaw/dist/cron-DOnNmbFN.js` y
  `delivery-plan-DKK9kKBx.js`) son dos campos completamente distintos con rutas de código separadas —
  el propio comentario del código del gateway lo dice explícito: *"failureAlert is a distinct field from
  delivery.failureDestination (its own store columns and delivery path)"*. `job.failureAlert` solo se
  usa para validar el shape al crear el job (pensado para el flag `--failure-alert-channel` del CLI,
  no para `cron.add` vía API); la notificación real de falla en tiempo de ejecución
  (`dispatchCronFailureDestinationNotifications` en `server-cron-CU_Xcc9_.js`) lee únicamente
  `job.delivery.failureDestination` — `failureAlert` a nivel de job nunca se lee ahí. El job se creaba
  sin error (el shape se valida igual, así que nunca hubo ninguna señal de que algo estuviera mal) pero
  el aviso de respaldo jamás se armaba. Fix en `apps/api/src/services/openclawCron.ts`: mover el objeto
  de `job.failureAlert` a `job.delivery.failureDestination` en los tres builders de cron
  (`scheduleReminderCron`, `scheduleRecurringCron`, `scheduleOnceCron`) — mismo shape
  `{channel, to, accountId}`, solo cambia dónde vive.
  **No resuelto en este cambio**: el recordatorio real de hoy (`d763ca0f-...`, "Recordarle a doña Alison
  las armas y el MEP") quedó con `cron_job_id` apuntando a un job ya deshabilitado por el gateway —
  Focusbrain no tiene forma de enterarse de que un cron se deshabilitó (no hay webhook de vuelta), así
  que `ReminderBadge` lo sigue mostrando como "Programado" aunque ya no vaya a sonar. No se tocó porque
  es un problema aparte (falta un mecanismo de notificación de fallo hacia la API) — queda para decidir
  si vale la pena resolverlo o si alcanza con que el usuario reintente creándolo de nuevo cuando pase.
  **02-sep-2026, `delivery.failureDestination` resultó ser una vía muerta también:** un segundo
  recordatorio ("Rutina: Hacerme la barba", 8pm) no llegó por ningún canal, pese al fix de arriba.
  Investigando el fuente del gateway instalado en el VPS más a fondo
  (`isolated-agent-Dq8gcJO1.js`), se confirmó que para jobs `payload.kind:"agentTurn"` (los que usan
  los recordatorios) el gateway **downgradea a propósito** el `status` del job de vuelta a `"ok"` cuando
  la entrega falla pero el turno del agente en sí no falló (`errorKind !== "delivery-target"`, o sea,
  cualquier falla que no sea config inválida del destino — la ventana de WhatsApp cerrada cae acá). Como
  `dispatchCronFailureDestinationNotifications` solo se dispara con `status:"error"`,
  `delivery.failureDestination` **estructuralmente nunca puede activarse** para una falla real de
  entrega en este tipo de job — es una decisión de diseño del gateway, no un bug de configuración
  nuestro, y no se puede arreglar con otro campo. **Fix real:** se abandonó por completo la idea de
  "detectar la falla y avisar" (no existe ninguna señal confiable — tampoco `reminders.sent_at`, que
  nunca se llena en la práctica, confirmado con una consulta directa a producción: cero filas con
  `sent_at` no nulo en toda la tabla, histórico completo). En su lugar, `scheduleReminderBackupCron`
  (nuevo en `openclawCron.ts`) programa un segundo cron, `BACKUP_DELAY_MINUTES = 4` minutos después del
  principal, que manda el mismo recordatorio por Telegram **siempre, incondicional** — mismo patrón que
  ya funciona en la automatización de n8n del Poder Judicial (dos canales en paralelo, no una cadena de
  fallback que dependa de que algo detecte el error). Solo se omite si el canal principal ya es
  Telegram. Nueva columna `reminders.backup_cron_job_id` (migración manual pendiente, ver abajo) para
  poder cancelar/reprogramar el respaldo igual que el principal — wireado en los mismos puntos:
  `reminders.ts` (`afterCreate`/`afterUpdate`/`beforeDelete`) y `reminderCascade.ts`
  (`cancelPendingRemindersFor`/`rescheduleRemindersForEvent`). Migración corrida a mano en el SQL Editor de
  Supabase (`alter table public.reminders add column if not exists backup_cron_job_id text;`) — verificado
  24-sep-2026 que la columna existe en producción.

- ~~**[ALTO] `borrar_recordatorio` (y cualquier tool de borrado con DELETE→204) le devolvía a Quicks un
  "error técnico" aunque el borrado ya hubiera salido bien en la API.**~~ ✅ Resuelto (20-ago-2026,
  reportado por el usuario justo después de agregarse `borrar_recordatorio`). Investigado con los logs
  de producción: el `DELETE /reminders/:id` sí llegaba a la API y respondía `204` normal — el error no
  era del backend. Causa real en `apps/mcp/src/index.ts`: el despachador de tools hacía
  `JSON.stringify(result, null, 2)` sobre lo que devuelve el handler; un `DELETE` con `204` (sin body)
  hace que `apiRequest` devuelva `undefined`, y `JSON.stringify(undefined)` da el valor `undefined` (no
  el string `"undefined"`) — el content block del tool quedaba `{ type: "text", text: undefined }`, que
  rompe el schema de MCP (`text` tiene que ser string) y OpenClaw lo reportaba como error interno. Mismo
  patrón afectaba a `borrar_aviso_asistente` (ya existente) — probablemente el mismo bug latente sin que
  nadie lo hubiera pegado antes. Fix: `JSON.stringify(result ?? { ok: true }, null, 2)`, un solo lugar
  que arregla todos los tools de borrado a la vez.

- ~~**[ALTO] Borrar un evento no borraba su tarea espejo.**~~ ✅ Resuelto (17-ago-2026, reportado por el
  usuario: creó un evento de prueba "cita dentista" el 29 de agosto, lo borró porque lo hizo mal, y la
  tarea espejo se quedó viva en Tareas). Causa: `tasks.ts` ya tenía el cascade correcto en un sentido —
  borrar una tarea borraba su(s) evento(s) ligado(s) (`beforeDelete`, con cancelación de recordatorios) —
  pero `events.ts` nunca tuvo el cascade inverso, borrar un evento dejaba `task_id` intacto y la tarea
  huérfana. Se agregó el mismo patrón a `events.ts`: su `beforeDelete` ahora cancela los recordatorios de
  la tarea ligada (`task_id`) y la borra directo por `supabaseAdmin` (no vía `tasksRouter`, para no
  reintentar borrar este mismo evento a mitad de su propio borrado).
  **Mismo día, resuelto el caso de mover la fecha:** confirmado por el usuario como pedido aparte. Ahora
  `events.ts` gana `afterUpdate`: si cambió `starts_at`, sincroniza `tasks.due_date` de la tarea ligada y
  reprograma (`rescheduleRemindersForEvent`, nuevo en `reminderCascade.ts`) cada recordatorio pendiente de
  ese evento — conservando su offset respecto al horario original (el que estaba "2h antes" sigue 2h antes,
  ahora de la hora nueva; no hay columna que diga qué tipo de recordatorio es cada fila, así que el offset
  se recalcula desde `oldStartsAt`/`remind_at` de cada uno). Simétrico en `tasks.ts`: si cambia `due_date`
  y la tarea tiene un evento ligado, sincroniza `events.starts_at` y reprograma igual (esto último cubre
  sobre todo ediciones vía MCP/`editar_tarea` — la UI web hoy solo deja editar la fecha "sin evento" desde
  `TaskDetail`, para una tarea con evento la fecha se edita desde el evento en Agenda). Si el nuevo horario
  calculado ya quedó en el pasado, no se fuerza (no se puede programar un cron para el pasado): se cancela
  el cron viejo y el recordatorio queda sin cron programado, mismo estado que ya mostraba `ReminderBadge`
  como "sin aviso" en otros casos, en vez de romper el PATCH del evento/tarea por esto.

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

- ~~**[MEDIO] Un fallo transitorio de Supabase en el middleware de auth se reportaba como "API key
  inválida", sin serlo.**~~ ✅ Resuelto (04-sep-2026, reportado por el usuario: Quicks le avisó por
  WhatsApp el 03-sep a las 9am que "la API key de Focusbrain es inválida" al intentar listar vehículos
  para el aviso de kilometraje, pidiéndole revisar/rehabilitarla). Investigando los logs de producción
  (`docker compose logs api`), se encontró la llamada exacta: `GET /vehicles?limit=100` → 401 a las
  15:00:19 UTC — y la llamada inmediatamente siguiente, un segundo después, con la misma API key
  (`GET /tasks?...`) devolvió 200 sin problema. Confirmado además que la key nunca fue revocada
  (`api_keys.revoked_at` sigue `null`, `last_used_at` se sigue actualizando con normalidad). Causa
  real en `apps/api/src/middleware/auth.ts`: `authenticate()` trataba `error` (la consulta a
  `api_keys` en Supabase falló, ej. timeout transitorio de red) y `!data` (la consulta funcionó pero no
  hay fila para esa key — key genuinamente inválida/revocada) como el mismo caso, devolviendo 401 "API
  key inválida" para ambos. Un fallo de consulta no dice nada sobre si la key es válida, así que
  reportarlo como key inválida es engañoso — le hizo creer a Quicks (y de rebote, al usuario) que había
  que rotar/rehabilitar una key que en realidad nunca tuvo ningún problema. Fix: separar los dos casos
  — `error` ahora devuelve 503 ("Error temporal validando la API key, reintentá") y se loguea el detalle
  del error de Supabase para poder diagnosticar si vuelve a pasar; `!data` sin error sigue siendo el 401
  real.

- ~~**[ALTO] La web se quedaba en "Cargando..." eterno (navegador y teléfono).**~~ ✅ Resuelto
  (19-oct-2026, reportado por el usuario). Los logs mostraban ráfagas de peticiones GET sin
  respuesta; midiendo desde el VPS, `supabaseAdmin.auth.getUser(jwt)` tardaba 22 s, 21 s y hasta
  74 s de forma intermitente (el `/auth/v1/health` respondía en 80 ms, y las consultas a tablas en
  ~200 ms — solo ese endpoint de Auth). Causa raíz en `apps/api/src/middleware/auth.ts`:
  `authenticate()` llamaba a `getUser()` en CADA petición con JWT, y la web dispara ~8 en
  paralelo al cargar, así que todas quedaban colgadas esperando a Auth. Fix: `getClaims(jwt)`,
  que verifica la firma localmente contra la clave pública (el proyecto usa ES256, JWKS
  cacheado) sin viaje de red por petición. Trade-off aceptado: ya no se detecta una sesión
  revocada antes de que expire el token (app de un solo usuario con lista de emails permitidos).

- ~~**[ALTO] Llamadas colgadas a Supabase desde el API (timeouts de Quicks, "Cargando..." en la web).**~~
  ✅ Resuelto (20-oct-2026, reportado por el usuario: Quicks por Telegram dijo "la API de Focusbrain
  dio timeout"). Seguimiento del fix de `getClaims` de arriba, que no era toda la causa: midiendo
  desde el contenedor del API, ~10% de las llamadas a Supabase (cualquier tabla, también la ruta con
  API key) se quedaban colgadas entre 7 y 108 s sin dar error, mientras `curl` al mismo host
  siempre respondía en <150 ms. Descartado IPv6/DNS (misma tasa con `--dns-result-order=ipv4first`).
  Fix en `apps/api/src/supabaseClient.ts`: `fetch` propio con timeout (5 s lecturas, 20 s
  escrituras) y hasta 3 intentos solo para GET/HEAD — el reintento abre una conexión nueva y
  responde normal (prueba: 60 consultas, peor caso 4,4 s en vez de ~100 s, 0 errores). Las
  escrituras no se reintentan para no arriesgar duplicados. Causa de fondo (red VPS↔Supabase)
  sin identificar; si los logs `[supabase] ... reintento` se vuelven frecuentes, vale la pena
  investigarla con el proveedor del VPS. Además, en `middleware/auth.ts` el update de
  `last_used_at` de la API key (solo informativo) ya no se espera con `await`: en la prueba post-fix
  una de 20 peticiones tardó 20 s por esa escritura colgada.
  Medición 29-oct-2026: 100 lecturas seguidas a Supabase desde el contenedor de la API → p50 176 ms, p95 416 ms, máx 775 ms, 0 lentas (>1 s) y 0 fallos; los logs del contenedor (solo desde su reinicio de ese día) no muestran ningún `reintento`. Sin evidencia de que los stalls sigan; reevaluar si Quicks o la web vuelven a reportar timeouts.

- ~~**[ALTO] Quicks no podía encontrar ni mover un evento de la Agenda ("escuela doña alison", pedido
  27-oct-2026 por Telegram: "muévelo para mañana").**~~ ✅ Resuelto (27-oct-2026, reportado por el
  usuario). Leyendo la conversación en la sqlite de OpenClaw
  (`/root/.openclaw/agents/main/agent/openclaw-agent.sqlite`, tabla `transcript_events`; ya no hay
  `.jsonl` desde la migración a SQLite) se vio que Quicks intentó `listar_eventos` (no existía:
  "Unknown tool id"), cayó a `listar_tareas` — que sin filtro trae las 50 tareas MÁS VIEJAS por
  `due_date` ascendente, todas de agosto — y concluyó que el evento "no existe". Causas en
  `apps/mcp/src/index.ts`: (1) el MCP nunca tuvo herramientas para listar/editar/borrar eventos
  (solo `crear_evento`), aunque la API (`events.ts`) ya arrastra tarea espejo y recordatorios al
  mover un evento y la API key ya tenía `events:read/write`; (2) `listar_tareas` no filtraba por
  fecha. Fix: tools nuevas `listar_eventos` (default desde hoy, filtro `fecha_inicio`/`fecha_fin`,
  incluye `starts_at_costa_rica`), `editar_evento` (título/descripción/`inicio` — mover = mandar
  `inicio` nuevo) y `borrar_evento`; y `listar_tareas` ahora acepta `fecha_inicio`/`fecha_fin`
  (día CR, con `CR_OFFSET`) y avisa en su descripción que sin filtros trae las más viejas.

## 2. Mejoras a funciones existentes

- ~~**En el detalle de un proyecto (`apps/web/src/ProjectsPage.tsx`), las notas del proyecto solo
  mostraban un preview truncado (2 líneas) sin forma de abrirlas, y los documentos ligados al proyecto
  no se mostraban ahí en absoluto — había que ir al módulo Documentos y buscarlos a mano.**~~ ✅ Resuelto
  (20-ago-2026, pedido por el usuario). Las notas ahora son clickeables: abren un modal nuevo
  (`NoteDetail`, en el mismo archivo, calcado del patrón de `EventDetail` en `AgendaPage.tsx`) con el
  contenido completo y edición/borrado in place — mismo comportamiento que ya existía en el módulo Notas
  standalone, ahora también accesible desde el proyecto. Se agregó además una sección "Documentos" nueva
  al detalle del proyecto (antes no existía ahí para nada), filtrando `api.listDocuments()` por
  `project_id`; cada fila es clickeable y abre el archivo en pestaña nueva vía
  `api.getDocumentDownloadUrl(doc.id)` (mismo mecanismo que el botón de descarga en `DocumentsPage.tsx`).
  **Mismo día, fix de scroll:** el modal `NoteDetail` se armó copiando el wrapper de `EventDetail`
  (`fixed inset-0 ... items-center justify-center`, sin `overflow-y-auto`), que asume que el contenido
  siempre entra en pantalla — una nota larga quedaba cortada arriba/abajo sin forma de hacer scroll para
  leerla completa. Reportado por el usuario apenas probó la función nueva. Fix: mismo patrón que ya usan
  los modales de `TasksPage.tsx` (`NewTaskModal`/`TaskDetail`) para este mismo problema —
  `overflow-y-auto py-8` en el wrapper exterior + `max-h-full overflow-y-auto` en la tarjeta interior.
- ~~**Quicks solo podía crear recordatorios, no editarlos ni borrarlos.**~~ ✅ Resuelto (17-ago-2026,
  pedido por el usuario). Tools nuevas en `apps/mcp/src/index.ts`: `listar_recordatorios` (para obtener
  el `id`), `editar_recordatorio` (título y/o `recordar_en` — si cambia la hora, la API ya reprograma
  sola el cron real vía el `afterUpdate` que existía en `reminders.ts` desde antes, no hizo falta tocar
  el backend), `borrar_recordatorio` (cancela el cron real en OpenClaw vía el `beforeDelete` que ya
  existía). Sin cambios de scope — `quicks-agent` ya tenía `reminders:read`/`reminders:write`.
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
- ~~**[BAJO]** Sin paginación real (cursor) en ningún endpoint — límite fijo de 200.~~ ✅ Resuelto
  (24-sep-2026) — ver ítem de paginación real (20 + "Cargar más") en Tareas/Proyectos arriba, y
  `resourceRouter.ts` que ahora soporta `?offset=`.
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
  **16-ago-2026, orden de secciones:** pedido "que muestre primero lo que vence hoy y después lo
  vencido" — orden anterior era Tareas atrasadas → Eventos de hoy → Tareas que vencen hoy → Rutinas de
  hoy; ahora es Eventos de hoy → Tareas que vencen hoy → Tareas atrasadas → Rutinas de hoy. Solo cambió
  el orden de renderizado en `TodayPage.tsx`, ninguna lógica de qué tareas entran en cada sección.

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
  **04-sep-2026, el estimado de Qwen (`openclaw-export`) se reemplaza por gasto real:** el usuario
  reportó que el módulo de Consumos siempre mostraba un número distinto al gasto real de Qwen. Al
  investigar se encontraron dos problemas: (1) el estimado calculaba costo desde tokens con una tabla
  de precios fija en el script (`/root/.openclaw/usage-to-consumos.js`), que se desactualiza cada vez
  que Alibaba cambia tarifas o el modelo default cambia; (2) más grave — ese script (y también
  `meta-usage-to-consumos.js`) **no tenían ningún cron programándolos** — sin `crontab`, sin timer de
  systemd, sin cron de OpenClaw con ese nombre — así que probablemente ninguno de los dos venía
  corriendo hacía tiempo, pese a lo documentado arriba (15-ago-2026). Fix: Alibaba Cloud (dueño de
  Qwen/DashScope) sí tiene una API de billing real, `BssOpenApi.DescribeInstanceBill` — mismo enfoque
  que ya se usaba para Meta. Requiere un AccessKey RAM separado (no la API key de DashScope que usa
  OpenClaw para llamar al modelo) con la política de solo lectura `AliyunBSSReadOnlyAccess`, y el
  endpoint internacional `business.ap-southeast-1.aliyuncs.com` (el genérico `business.aliyuncs.com` da
  error `NotApplicable` para cuentas internacionales). `ProductCode: "sfm"` = Alibaba Cloud Model
  Studio, confirmado consultando la factura real sin filtro. Cambios en este repo: nuevo valor de
  `origen`, `'aliyun-billing-api'` (`supabase/schema.sql` — migración manual abajo —,
  `apps/api/src/routes/consumos.ts`, `apps/web/src/api.ts`, `apps/web/src/ConsumosPage.tsx`). El script
  nuevo vive fuera de este repo, en `/root/.openclaw/scripts/consumos-qwen-billing/` (VPS), con su
  propio `.env` (AccessKey, no en git) y systemd timer diario — reemplaza a `usage-to-consumos.js`
  (que queda sin usarse, no se borró). El estimado sigue existiendo como valor de `origen` válido
  (`openclaw-export`) por los registros históricos, solo no se sigue generando.
  Migración manual (Supabase SQL Editor):
  ```sql
  alter table public.consumos drop constraint if exists consumos_origen_check;
  alter table public.consumos add constraint consumos_origen_check
    check (origen in ('openclaw-export','kapso-api','manual','aliyun-billing-api'));
  ```
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
- ~~**Archivos `.bak-20260803` sueltos en el VPS.**~~ ✅ Ya no existían (28-oct-2026).
- **Cron de OpenClaw por `admin-http-rpc` (OpenClaw 2026.10.5).** Tras la actualización del 23/24-oct-2026,
  `POST /tools/invoke` dejó de servir para `cron` (exige identidad de run de agente) y los recordatorios
  fallaban con `OpenClaw cron remove falló (500): tool execution failed`. La sesión de OpenClaw lo
  parchó directo en el VPS (sin commitear ni documentar) usando el plugin `admin-http-rpc`:
  `POST /api/v1/admin/rpc` con `{method:"cron.add"|"cron.remove", params}`; `cron.add` exige
  `schedule.kind` (se default a `"at"`). Causa raíz de que quedara solo en el VPS: el cambio no pasó
  por el repo. 28-oct-2026 se trajo a `apps/api/src/services/openclawCron.ts` y se actualizó
  `infra/DEPLOY.md`; `HANDOFF_*_OPENCLAW.md` quedan como histórico del contrato viejo.
  Confirmado por la sesión de OpenClaw (29-oct-2026): el error exacto era `trusted operational run
  instance required for this gateway call` (OpenClaw 2026.10.5 exige identidad de run de agente para
  `cron.*`; el 500 de la API era ese mismo error). Probado en vivo: `cron.add` dispara y llega por
  WhatsApp. Cancelación verificada 29-oct-2026 con el código real de la API en producción: `scheduleReminderCron` creó el job (aparece en `openclaw cron list --all --json`) y `cancelReminderCron` lo eliminó (ya no aparece). **No probado**: que los crons
  recurrentes (ver abajo) se verificaron también. Prueba de punta a punta 29-oct-2026 (API real + key temporal ya borrada): evento + recordatorio (cron principal + backup) + aviso recurrente diario → los 3 crons aparecieron en OpenClaw; DELETE del evento (204) y del aviso (204) → los 3 desaparecieron y el recordatorio cascada quedó en 0. (Nota previa, ya superada: el código pasa `kind:"cron"` explícito en esa ruta, el
  default `"at"` solo aplica a los de un disparo). `admin-http-rpc` no tiene garantía de estabilidad
  entre versiones de OpenClaw: revisarlo en la próxima actualización.
  Revisado 29-oct-2026: los 17 `reminders` pendientes tienen su cron (y backup cuando aplica) en
  `openclaw cron list --all`; sin huérfanos.
- **Los Dockerfiles ignoran los `package-lock.json`.** `apps/api/Dockerfile` y `apps/mcp/Dockerfile`
  copian solo `package.json` y hacen `npm install`, así que el lockfile del repo no fija nada: lo que
  corre en producción depende de la fecha de build y de la capa cacheada (api conserva el árbol del
  10-sep: `body-parser` 1.20.8; mcp se reconstruyó el 27-oct con SDK 1.32.2). Un `npm audit fix`
  sobre el lockfile (como el del 27-oct en el VPS) no cambia lo que corre. ✅ Resuelto 29-oct-2026:
  los dos Dockerfiles ahora hacen `COPY package.json package-lock.json` + `npm ci` (api conserva
  `--legacy-peer-deps`), y los lockfiles del repo se reemplazaron por los del `npm audit fix
  --omit=dev` del VPS (proxy-addr crítica corregida; quedan 3 vulns api / 2 mcp, moderate/high, sin
  críticas). Verificado local: `npm ci`, `tsc`, 21 tests de api y build de mcp. Desde ahora, subir una
  dependencia = `npm update <pkg>` aquí, commitear el lockfile y reconstruir; el VPS ya no debe
  correr `npm install` a mano. Recordatorios del 23–24-oct revisados: los 17 pendientes tienen su
  cron en OpenClaw, sin huérfanos.
- **OpenClaw se queda en 2026.10.5; la actualización a 2026.10.8 falló (29-oct-2026).** Decisión del
  usuario: no volver a intentar hasta que salga una versión nueva. La validación en copia temporal
  pasó, pero la activación falló en `runtime-artifact-publication` ("Cannot replace …"), el mismo
  paso que ya falló el 27-oct; el gateway nunca se reinició (mismo proceso desde el 27-oct 22:51).
  Verificado después: los 48 crons son idénticos al respaldo, `admin-http-rpc` sigue habilitado y
  el contrato `cron.add`/`cron.remove` que usa `openclawCron.ts` no cambió, así que **no hay nada
  que tocar en este repo**. No probado (no tenía sentido sin versión nueva): journal tras reinicio,
  RPC directo, MCP y mensajes de prueba por canales. Para la próxima actualización: leer el
  changelog de seguridad de la versión destino (10.5 no tiene auditoría de CVE), repetir la lista
  de verificación en una copia aislada, averiguar por qué falla `Cannot replace`, avisar antes de
  reiniciar y volver a probar crear/cancelar crons contra la API (ver prueba del 29-oct arriba).
- **Panel de OpenClaw tras Caddy:** `gateway.trustedProxies = ["172.18.0.2"]` (IP de Caddy) en la
  config de OpenClaw, para que `agents.quickwashcr.com` no responda 403. Si se recrea Caddy la IP
  puede cambiar y hay que actualizarla. `/readyz` devuelve 503 por `kapso-whatsapp` ("stopped,
  disconnected"): falso positivo conocido (Kapso va por webhook, sin proceso residente); la API de
  Focusbrain llama al RPC, no a `/readyz`, así que no le afecta.

## 6. Multiusuario (en curso desde 29-oct-2026)

**Objetivo:** abrir la app a más usuarios con ecosistemas totalmente independientes (ni ellos ven mis
datos ni yo los suyos), y que Quicks, hablando por **un solo número de WhatsApp compartido**, responda y
guarde únicamente en el ecosistema de quien escribe. Decisiones tomadas con el usuario: un único número
(no conseguir uno por persona); el servicio nuevo `apps/assistant` será el único dueño del webhook de
Kapso y enrutará por número del remitente (tu Quicks actual quedaría detrás de un reenvío mientras tanto);
recordatorios con aviso de 23 h siempre (como hoy) y, si la ventana de 24 h está cerrada, una plantilla
genérica ("Tienes un recordatorio pendiente, responde para verlo") y entrega completa al responder; ya
existe una plantilla que Quicks usa en recordatorios de QuickWash, evaluar reutilizarla antes de pedir otra;
consumo medido por usuario desde el inicio; primer usuario = persona cercana de confianza.

**Fase 1 (✅ hecha, migrada y desplegada 29-oct-2026, commit `20fa4cc`):**
- Auditoría de aislamiento: las rutas genéricas ya filtraban todo por `user_id`; los puntos que
  actualizaban/borraban solo por `id` (con ids de filas propias) ahora también filtran por `user_id`
  (`reminders`, `recurringReminders`, `routines`, `vehicles`, `documents`, `reminderCascade`,
  `services/routines`). Defensa en profundidad: la service role se salta RLS, así que un `.eq("user_id")`
  olvidado sería una fuga.
- Hueco real encontrado y cerrado: nada validaba que un `task_id`/`event_id`/`project_id`/`list_id`/
  `vehicle_id`/`routine_id` del body perteneciera al mismo usuario (un FK de Postgres solo comprueba que el
  id exista). `utils/ownedRefs.ts` (`findForeignRef`) lo valida en POST/PATCH del router genérico, rutinas y
  documentos → 400.
- Acceso por perfil (`services/profiles.ts`, caché 60 s) en lugar de solo `ALLOWED_EMAILS`: entra quien está
  en `ALLOWED_EMAILS` (dueño original, además administrador) o quien tiene `profiles.status='active'`; un
  perfil `blocked` bloquea incluso a quien esté en la lista. Las API keys dejan de servir si su dueño no está
  activo. Sin fila de perfil (o migración sin correr) se conserva el comportamiento anterior del dueño.
- Módulos por usuario (`profiles.enabled_modules`, null = todos), aplicados en el servidor en
  `requireScope` a usuarios y a sus agentes: `proyectos`, `rutinas`, `notas`, `documentos`, `vehiculos`.
  Núcleo siempre activo: Hoy, Agenda, Tareas, Asistente, Resumen, Configuración. `GET /me` expone
  `{userId,isAdmin,modules}` para que la web oculte módulos (fase 4).
- Consumos queda solo para administradores (`requireAdmin`), usuarios y agentes.
- Tests nuevos (`apps/api/src/multiusuario.test.ts`, 16): referencias cruzadas, módulos, scopes y admin.
  Total 37 en `npm test`.
- Migración: `supabase/migrations/20261029_multiusuario_perfiles.sql` (y `schema.sql` actualizado) agrega
  `status`, `is_admin`, `enabled_modules`, `whatsapp_phone` (único) y `whatsapp_last_inbound_at` a
  `profiles`, y deja a los usuarios que existen hoy como `active` + administrador. **La corre el usuario a
  mano en el SQL Editor de Supabase.** Antes de correrla, el servicio funciona igual (el perfil no se puede
  leer → se usa el comportamiento anterior) y solo deja un aviso `[profiles] no se pudo leer…` en los logs
  por petición.

**Pendiente (siguientes fases):** servicio `apps/assistant` (webhook Kapso con firma, enrutamiento por
número, bucle del modelo con `user_id` fijado por el servidor, historial, consumo por usuario);
recordatorios propios con ventana de 24 h + plantilla; registro desde la web con código de un solo uso para
vincular el WhatsApp; ocultar módulos en la web usando `/me`; prueba de aislamiento en vivo con dos usuarios
reales tras correr la migración; averiguar quiénes son `+50663083397` y `+50660740401` (en el allowlist de
Kapso hoy atendidos por tu Quicks, con tus datos).

- **Verificación en vivo (29-oct-2026):** con la API desplegada y la migración corrida, prueba de aislamiento con
  las dos cuentas reales (dueño y `ramirezjosec00@gmail.com`, esta última sin datos y sin rol de administrador),
  API keys temporales ya borradas y filas desechables ya borradas: **28/28 comprobaciones pasan** — la segunda
  cuenta no ve filas de la primera en ningún listado, recibe 404 al pedir/editar una tarea ajena por id, su
  DELETE sobre una tarea ajena no la borra, `?user_id=<otro>` y embeds en `?fields` no filtran nada, las
  referencias cruzadas (`event_id`, `task_id`, `project_id`) devuelven 400, `/consumos` da 403 al no
  administrador, y `enabled_modules=[notas]` deja `/notes` en 200, `/vehicles` en 403 y las tareas (núcleo) en 200.
  Hallazgo de la migración: el `insert ... select from auth.users` marcó administrador a TODA cuenta existente
  (había una segunda, de Google, creada el 3-ago); se corrigió a mano (`is_admin=false`). Lección: ese SQL asume
  que solo existe el dueño — no reutilizarlo tal cual cuando haya más usuarios.

**Decisiones de la Fase 2 (29-oct-2026, con el usuario):**
- **Plantilla de respaldo (ventana de 24 h cerrada):** `recordatorio_general` (UTILITY, aprobada por Meta,
  idioma `es`, 2 parámetros de cuerpo: `{{1}}` = tarea, `{{2}}` = fecha y hora). Texto: "Hola, este es un
  recordatorio automático de tu agenda personal. Tenés pendiente: {{1}}. Está programado para {{2}}… Si ya lo
  completaste o necesitás reprogramarlo, respondé este mensaje." Ya la usa QuickWash. Regla: se usa **solo**
  con la ventana cerrada y **como máximo una por ventana cerrada** (los recordatorios siguientes quedan
  pendientes y se entregan juntos, en texto libre, cuando la persona responda), para no pagar una plantilla
  por recordatorio. `{{1}}` = título del recordatorio más próximo (+ " y N más" si hay varios), `{{2}}` = su
  fecha y hora en Costa Rica.
- **Cómo se envía hoy:** servicio `whatsapp-template-http` (systemd en este mismo VPS,
  `/root/.openclaw/whatsapp-template-http/server.js`, escucha en `10.10.0.1:18790`, auth por header
  `x-auth-secret`), que llama al proxy de Kapso `POST https://api.kapso.ai/meta/whatsapp/v24.0/
  1273897039142554/messages` con `X-API-Key` (va por el proxy de Kapso a propósito, para que Kapso registre
  el estado real sent/delivered/failed; un envío directo a graph.facebook.com queda "accepted" sin tracking).
  **Es el mismo `phone_number_id` que usa el canal de Quicks: QuickWash y Focusbrain comparten el número.**
  El servicio nuevo hará su propia llamada a Kapso con el mismo payload (necesita `KAPSO_API_KEY` en su env).
- **Números del personal de QuickWash** (`+50663083397`, `+50660740401`): solo reciben plantillas de aviso
  de QuickWash; Quicks no debe responderles. Hoy `+50663083397` tiene 1 conversación (1 mensaje suyo y 1
  respuesta del asistente, 29-oct) y `+50660740401` ninguna. `channels["kapso-whatsapp"].allowFrom` solo
  filtra mensajes **entrantes** (`dist/inbound.js`: "sender is not in kapso allowFrom" → descarte), no los
  envíos; quitarlos de esa lista hace que OpenClaw los ignore. Cambio a cargo de la sesión de OpenClaw
  (prompt entregado al usuario). En el servicio nuevo esos números → descartar sin respuesta.
- **Enrutamiento del webhook:** usuario registrado en Focusbrain → servicio nuevo con su `user_id`; número del
  dueño → reenvío a OpenClaw (transición); personal de QuickWash → descartar; cualquier otro → mensaje de
  registro sin acceso a datos.
- **✅ Quicks ya no responde al personal de QuickWash (29-oct-2026, hecho por la sesión de OpenClaw):** se
  quitaron `+50663083397` y `+50660740401` de `channels["kapso-whatsapp"].allowFrom` (solo queda
  `+50687686207`); con `dmSecurity=allowlist` sus mensajes entrantes se descartan sin respuesta
  (journal: "sender is not in kapso allowFrom"). Aplicado en caliente, sin reiniciar el gateway. Respaldo:
  `/root/backups/kapso-allowfrom-20261029-1242/openclaw.json`. Los avisos/plantillas de QuickWash salen por la
  ruta saliente de Kapso, que no usa `allowFrom`. **Falta verificar con tráfico real:** (a) que el primer
  mensaje entrante del personal aparezca descartado en el journal; (b) que el próximo aviso de QuickWash a esos
  números se entregue. Revertir: `openclaw config set channels.kapso-whatsapp.allowFrom
  '["+50687686207","+50663083397","+50660740401"]' --strict-json`.

**Fase 2 — avance (29-oct-2026, solo en local, sin desplegar):** nuevo `apps/assistant` con las piezas de
entrada ya probadas (12 tests): verificación de firma HMAC-SHA256 y lectura del webhook de Kapso
(`kapso/webhook.ts`, formato tomado de `dist/webhook.js` del plugin de OpenClaw: evento
`whatsapp.message.received`, evento suelto o lote `{data:[…]}`, transcripción de notas de voz),
enrutador por número del remitente (`router.ts`: descartar > reenviar > usuario activo > no registrado) y
cliente de envío por el proxy de Kapso (`kapso/client.ts`: texto libre y plantilla). Modelo: Qwen
(`qwen3.7-plus`, endpoint OpenAI-compatible `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`), igual
que Quicks hoy. **Reenvío a OpenClaw:** el lote se parte y cada evento del dueño se re-firma por separado
(mismo secreto) para no filtrarle a OpenClaw mensajes de otros usuarios. **Pendiente:** bucle del modelo con
herramientas, historial y registro de consumo por usuario, autenticación servicio-a-servicio en la API
(`X-Service-Key` + usuario fijado por el servidor), reutilizar la tabla de herramientas del MCP (35 tools,
independiente del protocolo MCP) extrayéndola a un paquete compartido, Dockerfile/compose, y el cambio de la
URL del webhook en Kapso (acción manual del usuario).
