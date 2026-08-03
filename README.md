# BrainFocusCR

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
`crear_recordatorio`, `crear_nota`) — cada tool registrado se inyecta en el prompt del agente en
cada turno, así que crece con uso real, no por especulación. Detalles de registro, allowlists y
aislamiento entre agentes en [infra/DEPLOY.md](infra/DEPLOY.md).

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
  -d '{"name":"quicks-agent","scopes":["tasks:read","tasks:write","notes:read","notes:write","events:read","events:write","reminders:read","reminders:write"]}'
```

Guarda el `key` de la respuesta — solo se muestra una vez. Esa key se registra en OpenClaw como
credencial del tool `brainfocus-api` (ver `infra/`).

## Despliegue en el VPS (Natural Beauty, `169.58.62.116`)

Ver [infra/DEPLOY.md](infra/DEPLOY.md) para la guía paso a paso.

### Estado actual (2026-08-03)

| Componente | Estado |
|---|---|
| Supabase | Proyecto `brainfocuscr` (`qidpxcumibanaqwaxdxt`, us-east-1) activo, con `schema.sql` aplicado |
| API | Corriendo en Docker en `169.58.62.116`, contenedor `brainfocus-api-1`, publicada en `127.0.0.1:3001` (`restart: unless-stopped`) |
| MCP | Imagen `brainfocus-mcp:latest` construida, invocada por OpenClaw vía `docker compose run --rm -T mcp` |
| Registro en OpenClaw | Hecho — MCP registrado, allowlist de Quicks actualizada, `deny` con glob en los demás agentes |
| Caddy / dominios | Pendiente — `apps/web` aún no tiene build de producción ni DNS apuntado; `infra/Caddyfile.brainfocus` listo para cuando se haga |
| Migración de `tareas.md` | Hecha — 14 tareas reales cargadas en `public.tasks` (limpieza, pintura, trámites de Registro Nacional/OIJ, etc.), archivo retirado como fuente de verdad |
| Prueba de punta a punta | Verificada dos veces (BrainFocus y OpenClaw por separado): crear tarea → completar → listar filtrado, con auditoría en `agent_actions` |

Pendiente: build y publicación de `apps/web` detrás de Caddy (`app.brainfocuscr.com` / `api.brainfocuscr.com`).
