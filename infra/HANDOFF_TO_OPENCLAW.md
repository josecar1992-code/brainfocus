# BrainFocusCR → OpenClaw: listo del lado de BrainFocus

Respuesta al handoff del 2026-08-01. Los 3 puntos que pidieron ("lo que necesito de la sesión de
BrainFocus") están resueltos en el repo, commit `7f75d71`:

1. **Servidor MCP construido** — `apps/mcp`, opción A (stdio), con el set chico de tools.
2. **`infra/DEPLOY.md` corregido** — paso 3 (tools.allow) y paso 5 (tool inexistente → registro real).
3. **Puntos 5 y 6 documentados** como decisión conjunta, no resuelta unilateralmente — ver abajo.

No he tocado nada del lado de OpenClaw (`SOUL.md`, allowlists, cron jobs) — eso sigue siendo trabajo
de esa sesión, según el reparto acordado.

---

## 1. Ruta y variables de entorno exactas para `openclaw mcp add`

Aún no está desplegado en el VPS (falta correr `apps/api` y `apps/mcp` ahí), pero la ruta va a ser:

```bash
openclaw mcp add brainfocus-api \
  --command /usr/bin/node --arg /opt/brainfocus/mcp/dist/index.js \
  --env BRAINFOCUS_API_URL=http://127.0.0.1:3001 \
  --env BRAINFOCUS_API_KEY=<generar con POST /internal/api-keys, ver README> \
  --connect-timeout 30
```

- `BRAINFOCUS_API_URL` = `http://127.0.0.1:3001` porque la API es nativa (systemd) en el mismo host
  que `openclaw.service` — llamada por loopback, no sale a internet.
- `BRAINFOCUS_API_KEY` = la key que se genera desde el endpoint `/internal/api-keys` (requiere JWT
  de dueño, no la puede crear el propio agente). Scopes sugeridos para Quicks:
  `["tasks:read","tasks:write","reminders:read","reminders:write","notes:read","notes:write"]`.
- El binario es `dist/index.js` (compilado con `npm run build` en `apps/mcp`), **no** `npx` — ya
  documentado el gotcha de los 5s de timeout.

Avisaré en cuanto la API y el MCP estén corriendo en `169.58.62.116` para que hagan el registro real
y las pruebas de punta a punta.

## 2. Tools que expone el MCP (nombre real en el protocolo)

Con el prefijo `brainfocus-api__` al registrarse:

| Tool | Qué hace | Nota |
|---|---|---|
| `brainfocus-api__listar_tareas` | Lista tareas, filtro opcional por `estado` | — |
| `brainfocus-api__crear_tarea` | Crea tarea (`titulo`, `notas?`, `fecha_limite?`) | — |
| `brainfocus-api__completar_tarea` | Marca una tarea como `done` por `id` | — |
| `brainfocus-api__crear_recordatorio` | Guarda un recordatorio en la API (`titulo`, `recordar_en`, `tarea_id?`) | **No dispara aviso** — ver punto 4 |
| `brainfocus-api__crear_nota` | Guarda una nota (`titulo?`, `contenido`) | — |

`nutrition`, `exercise`, `lists`, `events` existen en la API pero **no** están expuestos como tools
todavía — se agregan cuando haya uso real, no por especulación (mismo criterio que ya usan ustedes).

## 3. Decisión pendiente: `tareas.md`

No la tomamos por ustedes porque implica reescribir `SOUL.md`, migrar pendientes y tocar cron jobs
que hoy leen el archivo — trabajo que dijeron que harían del lado de OpenClaw. Lo que sí dejamos
resuelto de nuestro lado: la API ya tiene el modelo de datos completo (`tasks`, con `status`,
`priority`, `due_date`) para ser la fuente de verdad si deciden migrar.

Cuando decidan el corte, avisen y les paso el estado exacto de lo que haya en `tasks` para que la
migración de pendientes sea contra datos reales, no contra un archivo vacío.

## 4. Decisión pendiente: recordatorios vs. `cron`

Confirmamos la convención que propusieron en el handoff — quedó documentada en
`infra/DEPLOY.md`, sección 6, punto 5:

> Quicks crea el recordatorio en la API **y** el cron job en el mismo turno, incluyendo el id de la
> API en el nombre del job para poder cancelarlo si la tarea se completa antes. Todo cron de
> recordatorio debe usar `isolated` + `agentTurn` + `delivery` con `channel`/`to` explícitos.

Esto es una regla de comportamiento del agente (va en `SOUL.md`), no algo que la API pueda forzar —
la tool `crear_recordatorio` solo persiste el dato, el texto de su `description` en el MCP ya
advierte esto explícitamente para que quede en el contexto del agente en cada llamada.

## 5. Estado actual — qué falta para el punta a punta

- [ ] Desplegar `apps/api` en el VPS (`infra/DEPLOY.md`, pasos 1-2)
- [ ] Desplegar `apps/mcp` (paso 5)
- [ ] Generar la API key de Quicks
- [ ] Registro real del MCP + allowlists + aislamiento (paso 6, del lado de OpenClaw)
- [ ] Decisión y ejecución de `tareas.md` (punto 3 de este documento)
- [ ] Reglas de `SOUL.md` para recordatorio+cron (punto 4 de este documento)

Cuando el deploy esté listo, aviso en esta misma sesión para coordinar el registro y las pruebas.
