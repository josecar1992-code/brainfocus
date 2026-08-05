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

Expone un set chico y de grano grueso a propósito (`listar_tareas`, `crear_tarea`, `completar_tarea`,
`crear_recordatorio`, `crear_evento`, `crear_nota`, `buscar_notas`, `listar_vehiculos`,
`crear_vehiculo`, `listar_mantenimientos`, `crear_mantenimiento`, `listar_categorias`,
`listar_rutinas`, `crear_rutina`) — cada tool registrado se inyecta en el prompt del agente en cada
turno, así que crece con uso real, no por especulación. `crear_evento` agenda un evento real (no
solo un recordatorio suelto) y, por defecto, crea también un recordatorio 2 horas antes.
`buscar_notas` deja que Quicks busque por palabra en título/contenido o traiga las últimas notas
guardadas, usando el `?q=` genérico agregado a `resourceRouter`. `crear_rutina` crea una tarea
repetitiva (diaria, ciertos días de la semana, o cada N semanas) — ver sección "Módulo Rutinas" más
abajo para el detalle de cómo funciona. Detalles de registro, allowlists y aislamiento entre agentes
en [infra/DEPLOY.md](infra/DEPLOY.md).

Los recordatorios (creados desde la app o por Quicks) programan automáticamente un aviso real de
WhatsApp/Telegram como cron job de disparo único en OpenClaw (`apps/api/src/services/openclawCron.ts`)
— no depende de que Quicks recuerde crear el cron en el chat. Completar/borrar la tarea o evento
asociado, o borrar el recordatorio directamente, cancela ese cron automáticamente (ver hooks en
`apps/api/src/routes/{tasks,events,reminders}.ts` y `apps/api/src/services/reminderCascade.ts`).

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

**Un solo check de "hecho" para Tareas, Agenda y Rutinas**: `events.task_id` vincula cada evento con
su tarea, así que el mismo checkbox (mismo `PATCH /tasks/:id`, ver `apps/web/src/
useCompleteTask.ts`) aparece en los tres módulos — marcarla en cualquiera la refleja en los otros
dos, y si es de una rutina dispara el avance automático. Pide confirmación (`ConfirmDialog`) solo al
marcar como hecha, no al desmarcar, para no frenar el "deshacer" ante un click accidental.

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
| Módulo Agenda | Eventos con recordatorio automático, filtros de fecha (Hoy / Esta semana / Este mes / Rango), lista ordenada por proximidad, y cada fila abre un detalle con editar/borrar |
| Módulo Notas | Nombre + contenido desde la app; Quicks puede escribir (`crear_nota`) y leer/buscar (`buscar_notas`) |
| Recordatorios ↔ cron de OpenClaw | Automático de punta a punta y verificado en producción (crear, reprogramar si cambia la fecha, cancelar al completar/borrar tarea o evento) |
| Diseño visual | Rediseñado con la estética del portal de clientes de QuickWash (sidebar, header, cards, badges), respetando la paleta de marca de Focusbrain |
| Logo | Logo oficial recortado (sin el fondo gris del canvas original) en sidebar, login, favicon e íconos PWA |
| PWA | Instalable — manifest + service worker (`vite-plugin-pwa`, `apps/web/vite.config.ts`), cachea el shell de la app para carga offline; los datos siempre se piden en vivo a la API |
| Módulo Tareas | Formulario con nombre/detalle/categoría (obligatoria)/prioridad, checkbox de crear evento+recordatorio; filtros de categoría y prioridad; orden por prioridad; click en cada tarea abre detalle editable |
| Categorías | Gestión inline desde el propio desplegable de tareas/rutinas (`CategorySelect`, "+ Nueva categoría"), sin módulo aparte de configuración |
| Módulo Vehículos | Vehículos personales + historial de mantenimientos por vehículo; Quicks puede leer y crear ambos (`listar_vehiculos`, `crear_vehiculo`, `listar_mantenimientos`, `crear_mantenimiento`) |
| Módulo Rutinas | Tareas repetitivas (diaria / ciertos días / cada N semanas) que generan una ocurrencia a la vez y avanzan solas al completarse, con historial por rutina; Quicks puede leer y crear (`listar_categorias`, `listar_rutinas`, `crear_rutina`) — ver sección arriba |
| Confirmación de borrado | `ConfirmDialog` reemplazó el `confirm()` nativo en **todo** borrado de la app (tareas, eventos, notas, categorías, vehículos, mantenimientos, rutinas) — regla fija para cualquier módulo nuevo |
| Check de "hecho" unificado | Tareas, Agenda y Rutinas comparten el mismo checkbox (`events.task_id` + `useCompleteTask`), con confirmación solo al marcar como hecha |
| Rediseño visual | Toda la app (no solo login) con la estética "red neuronal": glass cards, botones con gradiente, `NeuronBackground` de fondo (desactivado en móvil y con `prefers-reduced-motion` por rendimiento) |
| Módulo Documentos | PDFs/imágenes en un bucket privado de Supabase Storage (`documentos`), acceso solo vía URL firmada de 5 min; Quicks guarda por nombre (`guardar_documento`, sube los bytes del `MediaPath` tal cual, sin OCR ni descripción) y recupera (`enviar_documento`, devuelve la URL para reenviarlo como adjunto real) — tools registradas y verificadas en el catálogo del MCP, bind mount de media (`/root/.openclaw/media`) confirmado en producción |

Sin pendientes de infraestructura por ahora — lo que sigue es UX/producto sobre `apps/web`.

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
