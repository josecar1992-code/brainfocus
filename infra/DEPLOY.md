# Despliegue en el VPS de Natural Beauty (`169.58.62.116`)

Mismo servidor donde vive OpenClaw/Quicks (nativo, `openclaw.service` vía systemd). **Todo lo de
Focusbrain corre en Docker** (`docker-compose.yml` en la raíz del repo) — nada se instala directo
en el host, para no tocar el filesystem raíz que comparte con OpenClaw.

Caddy **no** vive en el mismo host de forma nativa: corre dentro del docker-compose de
**Natural Beauty** (`/opt/naturalbeautycr/Caddyfile`). Por eso el `reverse_proxy` de la API
apunta a `host.docker.internal:3001`, no a `localhost:3001` — y hace falta una regla de `ufw`
para las redes de Docker (ver paso 4). El puerto 3001 lo publica el contenedor `api` en
`127.0.0.1:3001`, así que `host.docker.internal` desde el contenedor de Caddy llega a él igual.

## 1. Clonar y preparar

```bash
ssh root@169.58.62.116
mkdir -p /opt/brainfocus && cd /opt/brainfocus
git clone https://github.com/josecar1992-code/brainfocus.git .
```

## 2. API (contenedor Docker)

```bash
cd /opt/brainfocus/apps/api
cp .env.example .env   # completar con credenciales reales de Supabase
cd /opt/brainfocus
docker compose build api
docker compose up -d api
docker compose logs -f api   # ctrl+c para salir, el contenedor sigue corriendo
```

Queda publicado en `127.0.0.1:3001` (ver `docker-compose.yml`), con `restart: unless-stopped`.

## 3. Web (contenedor propio con nginx, igual patrón que la API)

El Caddy de Natural Beauty **no tiene montado** `/opt/brainfocus` — no puede servir el `dist/`
directo con `file_server`. Por eso `apps/web` se sirve desde su propio contenedor (build de Vite +
nginx), publicado en `127.0.0.1:8081`, y Caddy le hace `reverse_proxy` igual que a la API:

```bash
cd /opt/brainfocus
cp .env.example .env   # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL (build args de Vite)
docker compose build web
docker compose up -d web
curl -s http://127.0.0.1:8081   # debería devolver el index.html
```

## 4. Caddy

Agregar el contenido de `infra/Caddyfile.brainfocus` al Caddyfile compartido
(`/opt/naturalbeautycr/Caddyfile`) — usa `host.docker.internal:3001` (API) y
`host.docker.internal:8081` (web) para llegar a ambos contenedores desde el contenedor de Caddy.
Confirmar que `ufw` permite las redes de Docker (`172.17.0.0/16` y `172.18.0.0/16`, mismo ajuste
que ya existe para OpenClaw), luego:

```bash
caddy reload --config /opt/naturalbeautycr/Caddyfile
```

DNS ya creados (`api.focusbraincr.com` y `app.focusbraincr.com` → IP del VPS).

## 5. Servidor MCP (`apps/mcp`, también en Docker)

Esto es lo que le permite a Quicks (agente `main` de OpenClaw) usar la API — OpenClaw habla el
protocolo MCP (JSON-RPC sobre stdio), no REST directo, así que no basta con la API sola.

No es un servicio de larga duración: OpenClaw lo arranca bajo demanda por stdio, por eso solo se
construye la imagen (vive en el profile `tools` del compose, no se levanta con `up`):

```bash
cd /opt/brainfocus/apps/mcp
cp .env.example .env   # BRAINFOCUS_API_KEY se completa en el paso 6
cd /opt/brainfocus
docker compose build mcp
```

Expone un set de tools de grano grueso a propósito — cada tool registrado se inyecta en el prompt
del agente en cada turno, así que el set se mantiene chico y crece solo con uso real, no por
especulación:

- Tareas/recordatorios/notas: `listar_tareas`, `crear_tarea`, `completar_tarea`,
  `crear_recordatorio`, `crear_evento`, `crear_nota`, `buscar_notas`.
- Ancla de fecha/hora (06-ago-2026): las descripciones de `crear_tarea`, `crear_recordatorio`,
  `crear_evento` y `crear_rutina` incluyen la hora actual real de Costa Rica (`AHORA_CR` en
  `apps/mcp/src/index.ts`, calculada al cargar el módulo) — el agente venía calculando "hoy"/"mañana"
  solo de su propio contexto de conversación y se equivocaba de fecha o de offset con frecuencia
  (confirmado por el usuario: corregía un recordatorio mal puesto por Telegram y el siguiente volvía a
  fallar). Como el servidor MCP se levanta de cero por invocación (`docker compose run --rm`, ver
  paso 5 más abajo), la hora calculada al cargar el módulo es la hora real de cada llamada, no una
  constante vieja de un proceso de larga duración.
- Tool `hora_actual` (06-ago-2026, mismo día): ese ancla solo aparece cuando el agente ya está por
  invocar una de las 4 tools de arriba — si el usuario solo pregunta por una fecha, o pide reagendar
  algo, sin llegar a llamarlas, seguía sin tener ninguna referencia real de "hoy" (confirmado: el
  usuario reportó otra fecha mal calculada en Agenda ese mismo día y el agente le echó la culpa "al
  cron", cuando en realidad ningún tool había fallado — simplemente no tenía cómo saber la hora en
  ese turno). `hora_actual` es una tool de solo lectura, sin argumentos, que devuelve la fecha/hora
  real de Costa Rica — pensada para que el agente la llame antes de razonar sobre cualquier fecha,
  no solo antes de escribir.
- `due_date_costa_rica` (06-ago-2026, mismo día): `listar_tareas` y `crear_tarea` ya devuelven,
  además del `due_date` original en UTC (sin tocar — el resto de la API/la app web siguen usando
  UTC como siempre), un campo `due_date_costa_rica` con la fecha/hora ya convertida a hora local
  (`YYYY-MM-DD HH:MM`, `isoACostaRica()` en `apps/mcp/src/index.ts`) — así el agente no tiene que
  hacer la conversión de zona horaria de memoria para hablarle de una fecha al usuario, solo para
  fechas que él mismo calcula al crear/editar (para eso sigue estando `hora_actual` + `AHORA_CR`).
- Vehículos: `listar_vehiculos`, `crear_vehiculo`, `listar_mantenimientos`, `crear_mantenimiento`.
- Rutinas: `listar_categorias`, `listar_rutinas`, `crear_rutina`.
- Documentos: `guardar_documento`, `buscar_documentos`, `enviar_documento`. Ninguna hace OCR,
  extracción de texto ni descripción de imagen — solo suben/bajan los bytes por nombre, así que el
  contenido del archivo nunca pasa por el contexto del agente (solo viajan `name`/`mime_type`/`size`).
  `enviar_documento` busca por coincidencia parcial (`ILIKE`, sin distinguir mayúsculas/tildes) — si
  hay más de un resultado devuelve la lista de nombres en vez de adivinar, para que el agente le
  pregunte al usuario cuál quiere; `buscar_documentos` lista/filtra por nombre parcial para ese caso
  o para explorar qué hay guardado. `guardar_documento` necesita ver el directorio real donde
  OpenClaw deja los archivos de media (`MediaPath`) — confirmado en este VPS:
  `/root/.openclaw/media`, ya montado como bind mount read-only en el servicio `mcp` de
  `docker-compose.yml`.

## 6. Conectar Quicks (OpenClaw) a la API — trabajo del lado de la sesión de OpenClaw

Documentado aquí para que quede como referencia, pero lo ejecuta y verifica la sesión de OpenClaw
(tiene el contexto completo del `SOUL.md` y de la allowlist real del agente).

1. Generar una API key desde la propia API (ver README, sección "Generar una API key para el agente"),
   con scopes acotados a lo que los tools de arriba realmente usan (mínimo privilegio, sin scopes
   `:write` que ningún tool ejercita): `["tasks:read","tasks:write","reminders:read",
   "reminders:write","notes:read","notes:write","events:read","events:write","vehicles:read",
   "vehicles:write","vehicle_maintenance:read","vehicle_maintenance:write","lists:read",
   "routines:read","routines:write","documents:read","documents:write"]`.
2. Completar esa key en `/opt/brainfocus/apps/mcp/.env` (`BRAINFOCUS_API_KEY=...`) y reconstruir la
   imagen si ya se había construido antes sin ella (`docker compose build mcp`).
3. Registrar el servidor MCP apuntando a `docker compose run` (no a un binario `node` directo, ya
   que todo corre en contenedor). **No usar `npx`** — falla con `did not complete initialize within
   5s` porque tiene que descargar el paquete primero; acá el equivalente a evitar es reconstruir la
   imagen en cada llamada, por eso se usa una imagen ya construida (paso 5) y solo se corre:
   ```bash
   openclaw mcp add brainfocus-api \
     --command /usr/bin/docker \
     --arg compose --arg -f --arg /opt/brainfocus/docker-compose.yml \
     --arg run --arg --rm --arg -T --arg mcp \
     --connect-timeout 30
   ```
   El `docker-compose.yml` ya trae `network_mode: host` para el servicio `mcp`, así que llega a
   `127.0.0.1:3001` (el puerto que publica el contenedor `api`) sin configuración adicional.
3. Agregar el tool al `tools.allow` del agente `main` — **`tools.allow` se reemplaza entero, no se
   agrega**, así que hay que listar todo lo que ya tiene hoy (`cron`, `group:messaging`,
   `group:memory`, `group:web`, `browser`, `group:fs`) más el nuevo:
   ```bash
   openclaw config set agents.entries.main.tools.allow \
     '["cron","group:messaging","group:memory","group:web","browser","group:fs","brainfocus-api__*"]' --strict-json
   ```
4. Negar `brainfocus-api__*` en los demás agentes (`code-reviewer`, `datix`, `quickmarkt`, `nexo`)
   para mantener el aislamiento ya establecido en este VPS, y confirmar en logs, no de memoria:
   `journalctl -u openclaw.service | grep 'tool policy removed'`.
5. **Antes de este paso, decidir**:
   - **`tareas.md`**: si Focusbrain pasa a ser la fuente de verdad de tareas, retirar el archivo
     de forma explícita (migrar pendientes, actualizar `SOUL.md`, ajustar los cron jobs que hoy leen
     el archivo) — no dejar que convivan los dos, o Quicks va a tener dos lugares donde anotar.
   - **Recordatorios vs. `cron` (superado)**: la convención anterior era que Quicks creaba el
     recordatorio en la API **y** el cron job en el mismo turno. Ya no aplica — desde el endpoint
     `/reminders` de `apps/api`, la propia API programa el cron de disparo único en OpenClaw
     automáticamente (`tool cron` sobre `POST /tools/invoke`, ver
     `apps/api/src/services/openclawCron.ts` y el detalle del contrato en
     `HANDOFF_TO_OPENCLAW.md`), tanto si el recordatorio se creó desde la app como desde Quicks.
     **Hecho y verificado en producción**: `OPENCLAW_GATEWAY_URL`/`OPENCLAW_GATEWAY_TOKEN`/
     `OPENCLAW_REMINDER_TO` ya están cargados en `apps/api/.env` del VPS (`host.docker.internal:18789`,
     ya que OpenClaw corre nativo por systemd, no en Docker — ver `extra_hosts` en
     `docker-compose.yml`). Probado de punta a punta: crear evento con recordatorio → cron real
     creado en OpenClaw → borrar evento → cron cancelado (`openclaw cron get <id>` responde
     `cron job not found`, que es el resultado esperado tras cancelar).
   - **Canal de entrega temporal a Telegram (05-ago-2026)**: WhatsApp tiene un "reachout timelock"
     de Meta activo en la cuenta hasta el 13-ago-2026 (`RESTRICT_ALL_COMPANIONS`, disparado tras
     relogueo de la sesión) que bloquea en silencio toda entrega directa por ese canal — confirmado
     en `journalctl -u openclaw.service` (`OutboundDeliveryError: WhatsApp reachout timelock is
     active`). Mientras dure, `scheduleReminderCron` (`apps/api/src/services/openclawCron.ts`) usa
     `"telegram"` como canal default en vez de `"whatsapp"`. A diferencia de WhatsApp, Telegram
     **no acepta un número de teléfono como destinatario** (falla con `Telegram recipient must be
     a numeric chat ID`) — necesita el chat ID numérico real de la conversación con el bot, guardado
     en su propia variable `OPENCLAW_REMINDER_TO_TELEGRAM` (separada de `OPENCLAW_REMINDER_TO`, que
     sigue siendo el teléfono para WhatsApp). Probado de punta a punta con un cron job de prueba
     disparado a mano vía `POST /tools/invoke`: entrega confirmada en logs
     (`[telegram] outbound send ok accountId=default chatId=... messageId=... operation=sendMessage`)
     y confirmada por el usuario, que recibió el mensaje de prueba en Telegram.
     Revertir el canal default a `"whatsapp"` (código y `alter table reminders alter column channel
     set default 'whatsapp'` en Supabase) cuando se levante el bloqueo.
   - **⚠️ Regla fija al tocar el canal default (código o DB)**: cambiar `scheduleReminderCron` o el
     `default` de `reminders.channel` solo afecta recordatorios **nuevos** — nunca reprograma los que
     ya tienen un cron creado en OpenClaw con el canal viejo. Pasó real el 06-ago-2026: tras el
     primer cambio a Telegram, un recordatorio de rutina creado un día antes (`channel = "whatsapp"`
     ya guardado) se disparó a tiempo pero falló en silencio porque, además, la sesión de WhatsApp
     Web se había vuelto a caer — nadie se enteró hasta que el aviso no llegó. Por eso, **cada vez
     que se cambie el canal default (o se corrija un bug de entrega como el de arriba), hay que
     revisar TODOS los cron jobs pendientes, no solo desplegar el fix**:
     1. `select id, title, channel, cron_job_id, remind_at from reminders where sent_at is null and
        remind_at > now() order by remind_at;` (Supabase MCP `execute_sql`) — cualquier fila con el
        canal viejo (o roto) es candidata a migrar.
     2. Para cada una: `POST /tools/invoke` con `{"tool":"cron","args":{"action":"remove","jobId":
        "<cron_job_id viejo>"}}`, después `action":"add"` con el mismo `displayName`
        (`brainfocus:reminder:<id>`), mismo `schedule.at` y el `delivery.channel`/`to` correctos —
        mismo payload que arma `scheduleReminderCron` (ver `openclawCron.ts`).
     3. `update reminders set channel = '<nuevo>', cron_job_id = '<nuevo job id>' where id = '<id>';`
        — si no se actualiza `cron_job_id`, un borrado posterior de esa tarea/evento no va a poder
        cancelar el cron real (queda huérfano en OpenClaw).
     4. Verificar con `openclaw cron get <nuevo job id>` que quedó `enabled: true` y con el
        `delivery` esperado.
