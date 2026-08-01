# Despliegue en el VPS de Natural Beauty (`169.58.62.116`)

Mismo servidor donde vive OpenClaw/Quicks (nativo, `openclaw.service` vía systemd) — así el
servidor MCP llama a la API por loopback (`127.0.0.1:3001`), sin salir a internet.

Caddy **no** vive en el mismo host de forma nativa: corre dentro del docker-compose de
**Natural Beauty** (`/opt/naturalbeautycr/Caddyfile`). Por eso el `reverse_proxy` de la API
apunta a `host.docker.internal:3001`, no a `localhost:3001` — y hace falta una regla de `ufw`
para las redes de Docker (ver paso 4).

## 1. Clonar y preparar

```bash
ssh root@169.58.62.116
mkdir -p /opt/brainfocus && cd /opt/brainfocus
git clone https://github.com/josecar1992-code/brainfocus.git .
```

## 2. API

```bash
cd /opt/brainfocus/api
cp .env.example .env   # completar con credenciales reales de Supabase
npm install
npm run build
cp ../../infra/brainfocus-api.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now brainfocus-api
systemctl status brainfocus-api
```

## 3. Web (build estático servido por Caddy)

```bash
cd /opt/brainfocus/web
cp .env.example .env   # URL de Supabase (pública) + URL de la API
npm install
npm run build   # genera dist/
```

## 4. Caddy

Agregar el contenido de `infra/Caddyfile.brainfocus` al Caddyfile compartido
(`/opt/naturalbeautycr/Caddyfile`) — ya usa `host.docker.internal:3001` para llegar a la API nativa
desde el contenedor de Caddy. Confirmar que `ufw` permite las redes de Docker
(`172.17.0.0/16` y `172.18.0.0/16`, mismo ajuste que ya existe para OpenClaw), luego:

```bash
caddy reload --config /opt/naturalbeautycr/Caddyfile
```

Antes de esto, apuntar los DNS de `api.brainfocuscr.com` y `app.brainfocuscr.com` a la IP del VPS.

## 5. Servidor MCP (`apps/mcp`)

Esto es lo que le permite a Quicks (agente `main` de OpenClaw) usar la API — OpenClaw habla el
protocolo MCP (JSON-RPC sobre stdio), no REST directo, así que no basta con la API sola.

```bash
cd /opt/brainfocus/mcp
npm install
npm run build   # genera dist/index.js
```

Expone 5 tools de grano grueso a propósito (`listar_tareas`, `crear_tarea`, `completar_tarea`,
`crear_recordatorio`, `crear_nota`) — cada tool registrado se inyecta en el prompt del agente en
cada turno, así que el set se mantiene chico y crece solo con uso real, no por especulación.

## 6. Conectar Quicks (OpenClaw) a la API — trabajo del lado de la sesión de OpenClaw

Documentado aquí para que quede como referencia, pero lo ejecuta y verifica la sesión de OpenClaw
(tiene el contexto completo del `SOUL.md` y de la allowlist real del agente).

1. Generar una API key desde la propia API (ver README, sección "Generar una API key para el agente"),
   con scopes acotados: `["tasks:read","tasks:write","reminders:read","reminders:write","notes:read","notes:write"]`.
2. Registrar el servidor MCP con un binario ya instalado (**no** `npx` — falla con
   `did not complete initialize within 5s` porque tiene que descargar el paquete primero):
   ```bash
   openclaw mcp add brainfocus-api \
     --command /usr/bin/node --arg /opt/brainfocus/mcp/dist/index.js \
     --env BRAINFOCUS_API_URL=http://127.0.0.1:3001 \
     --env BRAINFOCUS_API_KEY=<la key generada en el paso 1> \
     --connect-timeout 30
   ```
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
   - **`tareas.md`**: si BrainFocus pasa a ser la fuente de verdad de tareas, retirar el archivo
     de forma explícita (migrar pendientes, actualizar `SOUL.md`, ajustar los cron jobs que hoy leen
     el archivo) — no dejar que convivan los dos, o Quicks va a tener dos lugares donde anotar.
   - **Recordatorios vs. `cron`**: `crear_recordatorio` de este MCP solo guarda el dato para que se
     vea en la app — no dispara ningún aviso. El aviso real por WhatsApp/Telegram lo sigue haciendo
     `cron`. Convención acordada: Quicks crea el recordatorio en la API **y** el cron job en el mismo
     turno, incluyendo el id de la API en el nombre del job para poder cancelarlo si la tarea se
     completa antes. Todo cron de recordatorio debe usar `isolated` + `agentTurn` + `delivery` con
     `channel`/`to` explícitos (no `sessionTarget: "main"` + `systemEvent`, que depende del
     heartbeat desactivado).
