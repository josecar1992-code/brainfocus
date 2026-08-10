# OpenClaw → BrainFocus: cron de `crear_evento` ya funciona de punta a punta (2026-08-03)

## Resumen

Probé `crear_evento` con Quicks después del deploy de `api`+`mcp`. No era caché del MCP (nunca
hizo falta `mcp remove`/`add`, el registro siempre leyó bien la tool nueva) — eran **tres bugs
reales en `apps/api/src/services/openclawCron.ts`**, todos corregidos directamente en el servidor
(`/opt/brainfocus`), con contenedor `api` reconstruido y verificados en vivo.

## Los 3 bugs

### 1. Red: `api` no llegaba a OpenClaw (`ECONNREFUSED 127.0.0.1:18789`)

`api` corre en un contenedor Docker normal (bridge propio, puerto mapeado `3001:3001`) — a
diferencia de `mcp`, que usa `network_mode: host`. Dentro de `api`, `127.0.0.1` apunta al propio
contenedor, nunca al host donde vive el gateway de OpenClaw (que corre nativo por systemd, no en
Docker).

**Fix aplicado:**
- `apps/api/.env`: `OPENCLAW_GATEWAY_URL=http://host.docker.internal:18789` (antes `127.0.0.1`).
- `docker-compose.yml`, servicio `api`, agregado:
  ```yaml
  extra_hosts:
    - "host.docker.internal:host-gateway"
  ```
- Regla de `ufw` nueva en el VPS (la subred se confirmó con `docker network inspect
  brainfocus_default`, es `172.20.0.0/16`, propia de este stack):
  ```bash
  ufw allow from 172.20.0.0/16 to any port 18789 comment 'openclaw native gateway - brainfocus network'
  ```

### 2. Shape del body de `/tools/invoke`: `job required`

El código mandaba `tool`, `action`, `job` como tres campos de **primer nivel**. La API real de
OpenClaw espera `action` y `job` anidados dentro de `args`:

```jsonc
// MAL (lo que había):
{ "tool": "cron", "action": "add", "job": { ... } }

// BIEN (contrato real):
{ "tool": "cron", "args": { "action": "add", "job": { ... } } }
```

Corregido en `scheduleReminderCron` (action `add`) y `cancelReminderCron` (action `remove`).

### 3. Extracción del `jobId`: el más engañoso

Este bug hacía que la API reportara error 500 **aunque el cron job se hubiera creado bien** en
OpenClaw — lo confirmé con `openclaw cron list --all` mientras la API decía que había fallado.

`POST /tools/invoke` devuelve el **sobre completo**:
```jsonc
{
  "ok": true,
  "result": {
    "content": [ { "type": "text", "text": "...json del job..." } ],
    "details": { "id": "<jobId real>", "displayName": "...", ... }
  }
}
```

El código leía `result.details.id` (donde `result` = lo que devuelve `invoke()`, o sea el sobre
completo) — pero `details` vive un nivel más adentro, en `result.result.details.id`.

**Fix aplicado:**
```ts
// antes:
const jobId = (result as { details?: { id?: string } } | null)?.details?.id;

// ahora:
const jobId = (result as { result?: { details?: { id?: string } } } | null)?.result?.details?.id;
```

Este fue el más difícil de encontrar porque un `curl` manual desde el host (fuera del contenedor)
daba exactamente la misma respuesta y "parecía" funcionar — el bug solo se confirmó agregando un
log temporal del cuerpo crudo de la respuesta y disparando el flujo real vía `docker exec ... node
-e` **dentro** del contenedor `api`, reproduciendo la ruta de red real.

## Extra: un bloqueo de permisos, no relacionado con el código

Antes de llegar a estos tres bugs, la primera prueba dio `403: Falta el scope requerido:
events:write` — la API key `quicks-agent` en Supabase solo tenía `tasks:*`/`reminders:*`/`notes:*`.
Se agregaron `events:read`/`events:write` directo en la tabla `api_keys` (columna `scopes`), sin
tocar el `key_hash` ni regenerar la key.

## Verificación final

Con los 3 fixes aplicados, probé varias veces con Quicks en sesiones limpias:
- `crear_evento` crea el evento en la Agenda.
- Programa el cron real 2h antes (id verificado en `openclaw cron list --all`).
- Si la ventana de 2h ya pasó, Quicks lo detecta y ofrece una hora alternativa en vez de fallar en
  silencio o inventar que sí se programó.
- `cron remove` (para cuando se cancela un recordatorio) también funciona — probado a mano.

Todos los eventos/recordatorios y cron jobs de prueba fueron borrados después (Supabase + `openclaw
cron remove`), no quedó basura de testing.

## Nota sobre `remind_at` y el offset

`crear_evento` en el MCP calcula `remind_at` con `.toISOString()` (siempre `Z`/UTC), no con offset
`-06:00` explícito. Funciona bien porque OpenClaw acepta `Z` sin problema — no es un bug, solo una
diferencia frente al contrato que se había dado ("siempre con offset"). No hace falta cambiar nada,
es solo para que quede anotado por qué no se ve el offset en los jobs creados por esta vía.

---

**Nota editorial (09-ago-2026):** este documento vivía solo en el VPS (`/opt/brainfocus`), nunca se
había commiteado al repo — se incorpora acá tal cual, sin editar el contenido original, durante un
barrido de "qué quedó sin documentar". Es el mismo episodio que ya cuenta
[HANDOFF_TO_OPENCLAW.md](HANDOFF_TO_OPENCLAW.md) (la versión del lado de BrainFocus, sí commiteada
en su momento) — este es el reporte de investigación del lado de OpenClaw, complementario, no
contradictorio. Los tres bugs que describe ya están reflejados en el código actual de
`apps/api/src/services/openclawCron.ts` (que además evolucionó bastante después de esta fecha — ver
el historial de `infra/DEPLOY.md` para lo de Kapso/WhatsApp del 07-ago en adelante).
