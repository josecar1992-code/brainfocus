# BrainFocusCR → OpenClaw: listo del lado de BrainFocus

## Actualización 2026-08-01 (2): respuesta a la revisión de código

Los 5 puntos de la revisión (commit `7f75d71`) están corregidos:

| Punto | Estado |
|---|---|
| 🔴 `z.string().datetime()` rechaza offsets tipo `-06:00` | **Corregido** — `{ offset: true }` en las 10 ocurrencias (2 en `apps/mcp`, 8 en `apps/api`) |
| 🟠 Rutas del `DEPLOY.md` sin `apps/` | **Corregido** — pasos 2, 3, 5 y el `--arg` del paso 6 |
| 🟡 `listar_tareas` trae todo y filtra en memoria | **Corregido** — filtro server-side (`?status=`), `limit` (default 50, máx 200), `fields` para traer solo `id,title,status,due_date` |
| 🟡 Sin timeout en `apiRequest` | **Corregido** — `AbortSignal.timeout(10_000)` |
| ✅ Lo que quedó bien | Sin cambios |

Detalle de cada fix:

### 1. Fix de zona horaria (bloqueante)

`z.string().datetime({ offset: true })` reemplaza a `z.string().datetime()` en:
- `apps/mcp/src/index.ts` — `fecha_limite`, `recordar_en` (además, la `description` de ambos
  campos ahora dice explícitamente *"ISO 8601 con offset de zona horaria; para Costa Rica usar
  -06:00"*, como sugirieron, para que viaje en el prompt del agente)
- `apps/api/src/routes/tasks.ts` — `due_date`, `completed_at`
- `apps/api/src/routes/reminders.ts` — `remind_at`, `sent_at`
- `apps/api/src/routes/events.ts` — `starts_at`, `ends_at`
- `apps/api/src/routes/nutrition.ts` — `logged_at`
- `apps/api/src/routes/exercise.ts` — `logged_at`

Sigue aceptando `Z` (formato de `completar_tarea`, que usa `new Date().toISOString()`), y ahora
también acepta `-06:00`.

### 2. Rutas `apps/` en `DEPLOY.md`

Corregidos los `cd` de los pasos 2, 3 y 5, y el `--arg` del registro del MCP en el paso 6 — todos
apuntan ahora a `/opt/brainfocus/apps/<x>`, consistente con `apps/mcp/tsconfig.json`
(`outDir: dist`, `rootDir: src` → el compilado real queda en `apps/mcp/dist/index.js`).

### 3. `listar_tareas`: filtro server-side + límite + campos mínimos

`apps/api/src/routes/resourceRouter.ts` ahora soporta en el GET de lista:
- Filtro de igualdad por cualquier columna vía query string (ej. `?status=pending`)
- `?limit=` (default 50, tope 200)
- `?fields=` para pedir solo columnas específicas (select de Supabase)

`listar_tareas` en el MCP llama `/tasks?status=pending&limit=50&fields=id,title,status,due_date` —
ya no trae la tabla completa al contexto del agente.

### 4. Timeout en `apiRequest`

`apps/mcp/src/apiClient.ts` ahora pasa `signal: AbortSignal.timeout(10_000)` al `fetch`. Una API
colgada ahora produce un error normal en el turno (que el agente puede reportar), no un turno
colgado sin respuesta.

---

## `tareas.md`: confirmado

Tomaron la decisión de migrar y retirarlo — de acuerdo, es la fuente de ambigüedad correcta a
eliminar. Cuando estén por ejecutar el orden que describieron (leer pendientes → cargar por API →
verificar leyendo de vuelta → reescribir `SOUL.md` → ajustar crons → archivar), avisen y les paso el
conteo real de lo que quede en `tasks` para cruzar contra `tareas.md`.

`memorias.md` queda fuera de alcance por ahora, de acuerdo — `notes` es texto libre, no un modelo de
eventos fechados/categorizados. Si más adelante lo quieren absorber, evaluamos entonces si conviene
`events` o un modelo nuevo.

---

## Checklist actualizado

- [x] Fix de `datetime({ offset: true })` en las 10 ocurrencias
- [x] Rutas `apps/` corregidas en `DEPLOY.md`
- [x] Filtro server-side + `limit` + `fields` en `listar_tareas`
- [x] Timeout en `apiRequest`
- [ ] Desplegar `apps/api` y `apps/mcp` en el VPS
- [ ] Generar la API key de Quicks
- [ ] *(OpenClaw)* Registro del MCP + allowlists + aislamiento + verificación en logs
- [ ] *(OpenClaw)* Migración de `tareas.md` y reglas del `SOUL.md`

Con esto ya no debería haber sorpresas de validación en el primer uso real. Avisen cuando quieran
coordinar el deploy — la ruta y las env vars del punto 1 del handoff anterior siguen siendo las
mismas, solo con el `apps/` corregido.
