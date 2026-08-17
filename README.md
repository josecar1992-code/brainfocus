# FocusbrainCR

App personal de organización (tareas, recordatorios, agenda, notas, nutrición y ejercicio),
pensada desde el inicio para escalar a multiusuario. Un agente de IA (OpenClaw, agente `main`/Quicks)
lee y escribe en los mismos datos a través de la misma API que usa el frontend.

## Estructura del monorepo

```
brainfocus/
├── apps/
│   ├── api/      API REST (Node + Express + TypeScript) sobre Supabase
│   ├── web/      Frontend (React + Vite + TypeScript + Tailwind)
│   └── mcp/      Servidor MCP (stdio) que expone la API a OpenClaw/Quicks
├── supabase/
│   └── schema.sql   Esquema completo: tablas, RLS, api_keys, agent_actions
└── infra/
    ├── Caddyfile.brainfocus   Bloque de Caddy para el VPS de Natural Beauty
    └── DEPLOY.md              Guía de despliegue paso a paso
```

## El servidor MCP (`apps/mcp`)

OpenClaw habla el protocolo MCP (JSON-RPC sobre stdio o Streamable HTTP), no REST directo —
`web_fetch` no sirve como alternativa: solo hace GET, no permite mandar el header `X-Api-Key`, y
bloquea hosts internos como `localhost`. Por eso `apps/mcp` es un proceso stdio aparte que arranca
OpenClaw y que traduce tool calls a llamadas HTTP contra `apps/api`.

Expone un set chico y de grano grueso a propósito (`hora_actual`, `listar_tareas`, `crear_tarea`,
`completar_tarea`, `crear_recordatorio`, `crear_evento`, `crear_nota`, `buscar_notas`,
`listar_vehiculos`, `crear_vehiculo`, `listar_mantenimientos`, `crear_mantenimiento`,
`listar_categorias`, `listar_rutinas`, `crear_rutina`, `guardar_documento`, `buscar_documentos`,
`enviar_documento`) — cada tool registrado se inyecta en el prompt del agente en cada turno, así que
crece con uso real, no por especulación. `crear_evento` agenda un evento real (no solo un
recordatorio suelto) y puede crear hasta dos recordatorios independientes y activables por separado:
uno 2 horas antes (`crear_recordatorio`, default true) y otro justo a la hora del evento
(`recordatorio_hora_evento`, default false) — cualquiera que caiga en el pasado (ej. un evento a
menos de 2h) se omite en silencio en vez de fallar la creación del evento.
`buscar_notas` deja que Quicks busque por palabra en título/contenido o traiga las últimas notas
guardadas, usando el `?q=` genérico agregado a `resourceRouter`. `crear_rutina` crea una tarea
repetitiva (diaria, ciertos días de la semana, o cada N semanas) — ver sección "Módulo Rutinas" más
abajo para el detalle de cómo funciona. `hora_actual` (solo lectura, sin argumentos) devuelve la
fecha/hora real de Costa Rica — pensada para que el agente la use al razonar sobre cualquier fecha,
no solo cuando ya va a llamar una tool de escritura; esas 4 tools (`crear_tarea`, `crear_recordatorio`,
`crear_evento`, `crear_mantenimiento`) además incluyen la hora actual directo en su propia descripción
y le piden explícitamente construir la fecha a partir de ahí, nunca de memoria — el propio `listar_tareas`
y `crear_tarea` devuelven un `due_date_costa_rica` ya convertido a hora local (junto al `due_date`
original en UTC, sin reemplazarlo) para que tampoco haga falta convertir a mano al leer. Documentos
(`guardar_documento`, `buscar_documentos`, `enviar_documento`) ver "Módulo Documentos" más abajo.
Detalles de registro, allowlists y aislamiento entre agentes en [infra/DEPLOY.md](infra/DEPLOY.md).

Los recordatorios (creados desde la app o por Quicks) programan automáticamente un aviso real de
WhatsApp/Telegram como cron job de disparo único en OpenClaw (`apps/api/src/services/openclawCron.ts`)
— no depende de que Quicks recuerde crear el cron en el chat. Completar/borrar la tarea o evento
asociado, o borrar el recordatorio directamente, cancela ese cron automáticamente (ver hooks en
`apps/api/src/routes/{tasks,events,reminders}.ts` y `apps/api/src/services/reminderCascade.ts`). La
API rechaza con 400 cualquier `remind_at` que ya haya pasado (antes llegaba hasta OpenClaw y volvía
como 500 genérico). El texto del mensaje (`reminders.title`) siempre incluye la hora real del evento
y su descripción — necesario porque el aviso no se entrega literal: OpenClaw lo pasa como instrucción
a un turno de agente (`payload.kind: "agentTurn"`), que puede redactarlo con sus palabras pero tiene
la instrucción explícita de nunca omitir la hora.

## Módulo Rutinas (tareas repetitivas)

Rutinas resuelve el caso "sacar la basura los martes y viernes a las 7pm": en vez de crear todos los
eventos/tareas futuros de una vez, `apps/api/src/services/routines.ts` genera **una sola ocurrencia
pendiente a la vez** (tarea + evento + recordatorio opcional). Cuando esa tarea se marca como hecha,
el hook `afterUpdate` de `apps/api/src/routes/tasks.ts` llama a `advanceRoutine()`, que:

1. Registra la ocurrencia cumplida en `routine_completions` (día programado + hora exacta real en
   que se marcó hecha) — es el historial por rutina que se ve en el detalle de cada una.
2. Calcula la siguiente fecha según la regla de recurrencia (`apps/api/src/services/
   routineSchedule.ts`: diaria, ciertos días de la semana, o cada N semanas con una fecha ancla que
   el usuario elige a mano para la paridad).
3. Si esa fecha ya quedó en el pasado (la ocurrencia anterior se completó tarde, saltándose una o
   más), sigue avanzando hasta la próxima ocurrencia igual o posterior a hoy — la cadena "se rompe",
   no se recuperan los días saltados.

**Un solo check de "hecho" para Tareas y Agenda**: `events.task_id` vincula cada evento con su
tarea, así que el mismo checkbox (mismo `PATCH /tasks/:id`, ver `apps/web/src/useCompleteTask.ts`)
aparece en ambos módulos — marcarla en uno la refleja en el otro, y si la tarea es de una rutina
dispara el avance automático igual (Rutinas no tiene el checkbox, por decisión explícita: se
completa desde Tareas o Agenda). Pide confirmación (`ConfirmDialog`, verde vía `variant="success"`)
solo al marcar como hecha, no al desmarcar, para no frenar el "deshacer" ante un click accidental.

## Modelo de acceso

Dos formas de autenticarse contra la API, ambas resuelven a un `user_id`:

- **JWT de Supabase** (`Authorization: Bearer <jwt>`) — usado por el frontend React, es el dueño de los datos.
- **API key de agente** (`X-Api-Key: <key>`) — usada por OpenClaw (Quicks), con *scopes* acotados
  (`tasks:read`, `tasks:write`, `notes:write`, etc.). Cada escritura de un agente queda registrada
  en `agent_actions` para auditoría.

## Puesta en marcha

### 1. Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Corre `supabase/schema.sql` en el SQL Editor del proyecto.
3. Copia `URL`, `anon key` y `service_role key` del proyecto.

### 2. API

```bash
cd apps/api
cp .env.example .env   # completa con tus credenciales de Supabase
npm install
npm run dev
npm test                # vitest -- hoy solo cubre routineSchedule.ts (calculo puro de fechas de rutinas)
```

### 3. Web

```bash
cd apps/web
cp .env.example .env   # URL de Supabase + anon key + URL de la API
npm install
npm run dev
```

### 4. Generar una API key para el agente (Quicks)

```bash
curl -X POST http://localhost:3001/internal/api-keys \
  -H "Authorization: Bearer <tu-jwt-de-supabase>" \
  -H "Content-Type: application/json" \
  -d '{"name":"quicks-agent","scopes":["tasks:read","tasks:write","notes:read","notes:write","events:read","events:write","reminders:read","reminders:write","documents:read","documents:write"]}'
```

Guarda el `key` de la respuesta — solo se muestra una vez. Esa key se registra en OpenClaw como
credencial del tool `brainfocus-api` (ver `infra/`).

## Despliegue en el VPS (Natural Beauty, `169.58.62.116`)

Ver [infra/DEPLOY.md](infra/DEPLOY.md) para la guía paso a paso.

### Estado actual (2026-08-04)

| Componente | Estado |
|---|---|
| Supabase | Proyecto `brainfocuscr` (`qidpxcumibanaqwaxdxt`, us-east-1) activo, con `schema.sql` aplicado |
| API | Docker en `169.58.62.116` (`brainfocus-api-1`), publicada en `https://api.focusbraincr.com` |
| Web | Docker (nginx + build de Vite, `brainfocus-web-1`), publicada en `https://app.focusbraincr.com` |
| MCP | Imagen `brainfocus-mcp:latest` construida, invocada por OpenClaw vía `docker compose run --rm -T mcp` |
| Registro en OpenClaw | Hecho — MCP registrado, allowlist de Quicks actualizada, `deny` con glob en los demás agentes |
| Caddy / dominios | Hecho — bloque agregado al Caddyfile compartido de Natural Beauty, TLS automático (Let's Encrypt), reglas de `ufw` para los puertos 3001/8081 desde las redes de Docker |
| Migración de `tareas.md` | Hecha — 14 tareas reales cargadas en `public.tasks` (limpieza, pintura, trámites de Registro Nacional/OIJ, etc.), archivo retirado como fuente de verdad |
| Prueba de punta a punta | Verificada dos veces (Focusbrain y OpenClaw por separado): crear tarea → completar → listar filtrado, con auditoría en `agent_actions` |
| Login | Completo y verificado en producción: contraseña, magic link y Google OAuth, los tres probados de punta a punta |
| Módulo Agenda | Eventos con recordatorio automático, filtro Pendientes/Hechas (default "Pendientes", según el status de la tarea vinculada) + filtros de fecha (Hoy / Esta semana / Próxima semana / Este mes / Rango — default "Hoy"), lista ordenada por proximidad, checkbox de "hecho" (desktop y móvil, en móvil el badge de recordatorio muestra solo el ícono para dejar espacio al título), etiqueta "Rutina" cuando el evento viene de una rutina, y cada fila abre un detalle con editar/borrar. Toda categoría es obligatoria al crear un evento (crea su tarea espejo automáticamente, con prioridad seleccionable) |
| Recordatorios duales en eventos | Dos checkboxes independientes al crear/editar un evento (Agenda, Tareas, `crear_evento` del MCP): "2 horas antes" (default on) y "a la hora del evento" (default on) — el de 2h se oculta solo si el evento queda a menos de 2h de distancia, para no ofrecer una opción que la API va a rechazar por caer en el pasado |
| Selector de hora (`TimePicker.tsx`) | Reloj analógico propio (arrastrar/tocar hora y minuto, AM/PM) en los 5 lugares donde se elige una hora (Agenda, Tareas, Rutinas), en vez del `<input type="time">` nativo — mismo look en móvil y escritorio, y sin el bug del botón "Establecer" saliéndose de pantalla en algunos Android |
| Módulo Notas | Nombre + contenido desde la app, editable inline (ícono de lápiz, aparece al hover) con `PATCH /notes/:id`; Quicks puede escribir (`crear_nota`) y leer/buscar (`buscar_notas`), pero no editar (sin tool `editar_nota` todavía) |
| Recordatorios ↔ cron de OpenClaw | Automático de punta a punta y verificado en producción (crear, reprogramar si cambia la fecha, cancelar al completar/borrar tarea o evento). Canal default **`whatsapp`** (07-ago-2026, vía integración Kapso — API oficial de Meta, sin las desconexiones de sesión de la integración anterior con Baileys; confirmado con test de entrega en vivo). `reminders.channel` sigue guardando `"whatsapp"`/`"telegram"`/`"email"` como siempre; `scheduleReminderCron` (`apps/api/src/services/openclawCron.ts`) es la única capa que traduce `"whatsapp"` → `"kapso-whatsapp"`, el identificador que espera el gateway de OpenClaw tras esa migración. Telegram sigue disponible como canal alterno (usa un chat ID numérico dedicado, `OPENCLAW_REMINDER_TO_TELEGRAM`). **Regla fija al tocar el canal default**: desplegar primero el código, migrar la DB después (nunca al revés — un desfase entre ambos causó un 500 real en `crear_recordatorio` el mismo 07-ago, ver el historial en [infra/DEPLOY.md](infra/DEPLOY.md)), y revisar todos los cron jobs pendientes con el canal viejo. **Guarda anti-duplicado** (08-ago-2026): `POST /reminders` rechaza (409) un recordatorio con mismo título+hora si ya existe uno creado hace menos de 2 minutos — el modelo de Quicks a veces llama la misma tool dos veces en el mismo turno (confirmado: "Tomar la proteína" x2 con 11s de diferencia, dos POST reales, no un retry de red), ver `beforeCreate` en `apps/api/src/routes/reminders.ts`. **Fallback a Telegram por falla de WhatsApp** (10-ago-2026, pedido explícito del usuario): WhatsApp/Kapso falla en silencio si el usuario no interactúa con Quicks dentro de una ventana de 24h (no se puede reabrir la conversación sin la plantilla correspondiente). Todo `cron.add` de recordatorios ahora manda `payload.message` con instrucción explícita de reintentar por Telegram si falla WhatsApp, y agrega `failureAlert: {channel: "telegram", to: "7843485332", accountId: "default"}` a nivel de job (el propio gateway de OpenClaw avisa por Telegram si la entrega falla, sin depender de que el agente razone sobre el fallo) — ver `withTelegramFallback`/`buildFailureAlert` en `openclawCron.ts`. |
| Diseño visual | Rediseñado con la estética del portal de clientes de QuickWash (sidebar, header, cards, badges), respetando la paleta de marca de Focusbrain |
| Logo | Logo oficial recortado (sin el fondo gris del canvas original) en sidebar, login, favicon e íconos PWA |
| Sidebar | Orden (15-ago-2026): Hoy, Agenda, Tareas, Asistente, Proyectos, Rutinas, Notas y memorias, Documentos, Vehículos, Consumos, Configuración — Hoy es el módulo por defecto al iniciar (antes era Agenda). En móvil, el drawer se abre desde la izquierda, junto al botón de hamburguesa |
| Vista Hoy | `TodayPage.tsx` (09-ago-2026): consolida eventos de hoy + tareas que vencen hoy + la ocurrencia de rutina de hoy en una sola pantalla, con el mismo checkbox de completar (`useCompleteTask`) que Tareas/Agenda/Rutinas — no agrega datos nuevos, solo une lo que ya existía en tres módulos distintos |
| Módulo de Proyectos | `ProjectsPage.tsx` (09-ago-2026): agrupa tareas/eventos/notas/documentos bajo un proyecto (`project_id` nullable en esas 4 tablas), a diferencia de `lists`/categorías que solo aplica a tareas. Progreso agregado (verde) calculado en el cliente a partir de las tareas ligadas, mismo patrón que subtareas. Crear/archivar/reactivar/borrar (borrar no borra lo ligado, solo lo deja sin proyecto). Selector de proyecto wireado en los formularios de Tareas/Agenda/Notas/Documentos. Quicks: `crear_proyecto`, `listar_proyectos`, `proyecto_id` opcional en crear_tarea/crear_evento/crear_nota/guardar_documento |
| Indicador de recordatorio sin aviso | `ReminderBadge.tsx` (09-ago-2026, extraído de `AgendaPage.tsx` a componente compartido): muestra si un recordatorio está enviado/programado/"sin aviso" (cron falló o no se programó). Antes solo visible en Agenda; ahora también en `TaskDetail` (Tareas) y como ícono en la vista compacta de lista |
| Módulo Asistente | `AsistentePage.tsx` (10-ago-2026, backend `recurring_reminders` — mismo table del antiguo "Avisos recurrentes" de Configuración, promovido a módulo propio del sidebar). Cubre 3 casos: (1) aviso recurrente, "recordame tomar agua cada 2 horas" / "todos los días a las 8pm" / "los lunes a las 9am", sin rutina completa; (2) aviso único, "recordame X a las 6pm hoy" pero de este módulo (no de Agenda/Tareas), queda visible con badge "Enviado" una vez pasada su hora (sin confirmación real de OpenClaw, solo se infiere comparando `scheduled_at` contra ahora); (3) checkbox **"Es una instrucción para Quicks"** — el texto no se relaya tal cual, se le manda a Quicks como una orden a ejecutar (ej. "dame el tipo de cambio del bitcoin actual") y el resultado se lo contesta al usuario. Reusa el mismo cron **recurrente** real de OpenClaw que el aviso mensual de kilometraje (`scheduleRecurringCron`) para el caso recurrente, y uno **único** nuevo (`scheduleOnceCron`) para el caso "una vez". Quicks: `crear_aviso_asistente`, `listar_avisos_asistente`, `pausar_aviso_asistente`, `borrar_aviso_asistente` (mismos scopes `recurring_reminders:*` ya otorgados, no hizo falta SQL nuevo). Editable desde la UI (lápiz por ítem, reprograma el cron solo al guardar). Fechas/horas siempre con offset -06:00 de Costa Rica explícito, nunca la zona horaria del navegador — ver [CLAUDE.md](CLAUDE.md) |
| Paquete compartido `packages/shared-time` | (09-ago-2026) `CR_OFFSET`, `TWO_HOURS_MS`, `formatReminderTitle`, `isFutureReminder`, `horaActualCR`, `isoACostaRica`, `canRemindTwoHoursBefore` — antes duplicados casi idénticos entre `apps/web/src/api.ts` y `apps/mcp/src/index.ts`, ya habían empezado a divergir. Dependencia local (`file:../../packages/shared-time`, npm crea un symlink real) consumida también por `apps/api/src/services/routines.ts`. Requirió cambiar el build context de Docker de `./apps/<app>` a la raíz del repo en los tres `Dockerfile` + `docker-compose.yml`, para que el paquete sea visible al construir cada imagen — cada Dockerfile compila primero `packages/shared-time` (su propio `tsc`) y después la app |
| PWA | Instalable — manifest + service worker (`vite-plugin-pwa`, `apps/web/vite.config.ts`), cachea el shell de la app para carga offline; los datos siempre se piden en vivo a la API |
| Ruteo por módulo | (10-ago-2026) `useModuleRoute.ts`: cada módulo tiene su propia URL real (`/tareas`, `/agenda`, `/asistente`, etc. — el `ModuleKey` ya es el slug) sincronizada con `window.history` (`pushState`/`popstate`), sin `react-router-dom` — la app es de un solo usuario y 10 pantallas fijas, no justifica la librería completa. Antes todo era un solo `useState` sin tocar la URL, así que refrescar la página (o guardar/compartir un link a un módulo) siempre volvía a "Hoy". Requiere que el server sirva `index.html` para cualquier ruta (SPA fallback) — ya configurado en `apps/web/nginx.conf` (`try_files $uri $uri/ /index.html`) |
| Módulo Tareas | Vista de tarjetas de categorías con drill-down (click abre el listado de esa categoría); formulario con nombre/detalle/categoría (obligatoria)/prioridad, checkbox de crear evento + los dos recordatorios independientes; filtro Pendientes/Hechas (default "Pendientes") + filtro de prioridad, fecha de creación, fecha de entrega (opcional, independiente de crear evento) con badge "Atrasada", % de subtareas completadas y etiqueta "Rutina" visibles por tarea; botón "+ Crear tarea" dentro de cada categoría (con esa categoría precargada); click en cada tarea abre detalle editable, donde también se le puede agregar un evento a una tarea ya creada sin evento |
| Filtro Pendientes/Hechas (`StatusFilterTabs.tsx`) | Toggle compartido entre Tareas y Agenda, default "Pendientes" — en Agenda filtra eventos por el status de la tarea vinculada (sin tarea vinculada cuenta como pendiente) y, aparte, filtra la sección "Recordatorios sin evento" por si su `remind_at` ya pasó o no (independiente de si `sent_at` quedó registrado); no aplica a Rutinas (siempre muestra una sola ocurrencia activa por rutina, no una lista completable) |
| Badge "Quicks" (`QuickBadge.tsx`) | Ícono/etiqueta amarilla de robot en tareas, eventos, recordatorios y notas cuando `created_by = "agent"` — columna nueva en esas 4 tablas, la llena sola `resourceRouter.ts` según si la request llegó con API key de agente o con el JWT del dueño (`trackCreatedBy: true` en cada router) |
| Reordenar tareas (drag & drop) | Dentro de cada categoría, arrastrar por el ícono de agarre (mouse o táctil, vía Pointer Events + `elementFromPoint`, sin librería externa) reordena la lista libremente — reemplaza el orden fijo por prioridad. `tasks.sort_order` (float nuevo en la tabla) se reparte por promedio entre los dos vecinos al soltar, así nunca hace falta renumerar toda la lista; update optimista igual que el toggle de subtareas |
| Subtareas | Checklist dentro de cada tarea (`public.subtasks`, tabla nueva) — agregar, marcar individual y borrar; la tarea principal muestra el % completado (barra de progreso + "n/m") tanto en su detalle como en la lista de la categoría, calculado en el cliente, no guardado |
| Categorías | Gestión inline desde el propio desplegable de tareas/rutinas (`CategorySelect`, "+ Nueva categoría"), sin módulo aparte de configuración |
| Módulo Vehículos | Vehículos personales + historial de mantenimientos por vehículo; Quicks puede leer y crear ambos (`listar_vehiculos`, `crear_vehiculo`, `listar_mantenimientos`, `crear_mantenimiento`) |
| Alertas de mantenimiento vehicular | `vehicles.next_maintenance_date`/`next_maintenance_mileage` (09-ago-2026). La fecha programa un recordatorio real (mismo mecanismo que tasks/events — `reminders.vehicle_id`, se recrea solo si la fecha cambia, se cancela si se borra el vehículo). El kilometraje es solo indicador visual: no hay lectura de odómetro en vivo, se compara contra el mayor `mileage` ya registrado en el historial. Quicks puede fijarlo con `fijar_proximo_mantenimiento` |
| Kilometraje mensual | `vehicle_mileage_logs` (09-ago-2026): lecturas de odómetro sueltas, separadas de `vehicle_maintenance` (no implican un servicio hecho) — alimentan el control de uso mensual (Δ entre lecturas) y la alerta de mantenimiento por km. El aviso mensual se activa desde Configuración (`profiles.mileage_reminder_enabled`): a diferencia de todos los demás recordatorios de la app (one-shot, `schedule.at`), este es el único cron **recurrente** real (`schedule.kind:"cron"` + `expr` + `tz`, confirmado en vivo el 09-ago-2026 con `openclaw cron add --cron ... --tz ... --json`, no está documentado en ningún lado). Quicks lo recibe como una instrucción mensual: listar vehículos, preguntar el km de cada uno, guardarlo con `registrar_kilometraje` |
| Módulo Rutinas | Tareas repetitivas (diaria / ciertos días / cada N semanas) que generan una ocurrencia a la vez y avanzan solas al completarse, con historial por rutina; Quicks puede leer y crear (`listar_categorias`, `listar_rutinas`, `crear_rutina`) — ver sección arriba |
| Confirmación de acciones | `ConfirmDialog` reemplazó el `confirm()` nativo en **todo** borrado de la app (tareas, eventos, notas, categorías, vehículos, mantenimientos, rutinas, documentos) — regla fija para cualquier módulo nuevo. Acepta `variant` (`"danger"` rojo por defecto, `"success"` verde) y deriva el texto de "procesando" del `confirmLabel`, para no repetir el texto de borrar en confirmaciones de otro tipo (ej. "Marcar hecha...") |
| Check de "hecho" unificado | Tareas y Agenda comparten el mismo checkbox (`events.task_id` + `useCompleteTask`), con confirmación (verde, `variant="success"`) solo al marcar como hecha; se quitó del módulo Rutinas por decisión explícita, aunque completar la tarea de una rutina desde Tareas/Agenda sigue avanzando la rutina y quedando en su historial igual |
| Rediseño visual | Toda la app (no solo login) con la estética "red neuronal": glass cards, botones con gradiente, `NeuronBackground` de fondo. En móvil (15-ago-2026) corre más liviana en vez de apagada: menos nodos (22 vs. 70 en escritorio), menos opacidad (factor 0.55) y framerate limitado a ~20fps; `prefers-reduced-motion` sigue apagándola por completo (preferencia de accesibilidad, no de rendimiento) |
| Módulo Documentos | PDFs/imágenes en un bucket privado de Supabase Storage (`documentos`), acceso solo vía URL firmada de 5 min; Quicks guarda por nombre (`guardar_documento`, sube los bytes del `MediaPath` tal cual, sin OCR ni descripción), lista/filtra (`buscar_documentos`) y recupera (`enviar_documento`, búsqueda por coincidencia parcial case-insensitive — si hay más de un match devuelve la lista de nombres en vez de adivinar, para que el agente le pregunte al usuario cuál quiere) — verificado de punta a punta con un PDF real por WhatsApp y Telegram |
| Módulo Consumos | (15-ago-2026) `ConsumosPage.tsx` — gasto real por proveedor (esquema abierto: `categoria` `ia`/`mensajeria`/`hosting`/`otro`, `detalle` jsonb libre), pensado para que un cron externo alimente el dato, no la UI. `GET/POST/DELETE /consumos` (router a medida, no el `createResourceRouter` genérico, por el contrato de query `?desde=&hasta=&proveedor=`), scopes `consumos:read`/`consumos:write`. `fecha` es el día calendario de Costa Rica (mismo corte 06:00Z-06:00Z que OpenClaw) — quien alimenta el endpoint lo calcula, la API no hace conversión de zona horaria. `origen` (`openclaw-export`/`kapso-api`/`manual`) queda visible en la UI para no aparentar un dato en vivo cuando no lo es. En producción alimentado por dos crons de OpenClaw (fuera de este repo): gasto estimado de Qwen (tokens) diario, y gasto real de Meta/WhatsApp vía el campo `pricing_analytics` del Graph API de Meta sobre la WABA (parámetro real es `dimensions=["PRICING_TYPE","COUNTRY"]`, no `category` como sugiere la doc) — no quedó como carga manual. Quicks puede leer con `consultar_consumos` |

Sin pendientes de infraestructura por ahora — lo que sigue es UX/producto sobre `apps/web`. Ver
[PENDIENTES.md](PENDIENTES.md) para el barrido de bugs, mejoras y funciones nuevas propuestas
(08-ago-2026).

### Auth — notas de configuración (Supabase Dashboard, no vía MCP)

Estos ajustes viven en la plataforma de Supabase (Authentication), no en Postgres, así que no hay
manera de aplicarlos con las tools de MCP disponibles — quedan documentados acá para no perderlos:

- **Site URL / Redirect URLs** (`Authentication > URL Configuration`): `https://app.focusbraincr.com`.
  Sin esto, el magic link redirige a `localhost:3000` (el default) en vez de la app real — ya
  corregido y probado.
- **Google OAuth** (`Authentication > Providers > Google`): habilitado con Client ID/Secret de
  Google Cloud Console (redirect URI `https://qidpxcumibanaqwaxdxt.supabase.co/auth/v1/callback`).
  Si el OAuth consent screen de Google sigue en modo "Testing", solo los correos en **Test users**
  pueden loguearse — revisar ahí antes de dar acceso a alguien más.
- El código (`apps/web/src/Login.tsx`) manda `emailRedirectTo`/`redirectTo` explícito
  (`window.location.origin`) en vez de depender del default de Supabase.
