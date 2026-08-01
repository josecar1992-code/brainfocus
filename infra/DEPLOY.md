# Despliegue en el VPS de Natural Beauty (`169.58.62.116`)

Mismo servidor donde vive OpenClaw/Quicks — así el agente llama a la API por red interna
(`localhost:3001`), sin salir a internet.

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
(`/opt/naturalbeautycr/Caddyfile`), luego:

```bash
caddy reload --config /opt/naturalbeautycr/Caddyfile
```

Antes de esto, apuntar los DNS de `api.brainfocuscr.com` y `app.brainfocuscr.com` a la IP del VPS.

## 5. Conectar Quicks (OpenClaw) a la API

1. Generar una API key desde la propia API (ver README, sección "Generar una API key para el agente").
2. Registrar la key en OpenClaw como perfil de autenticación del tool HTTP/MCP `brainfocus-api`
   (no en texto plano en `SOUL.md`).
3. Agregar el tool al `tools.allow` del agente `main`:
   ```bash
   openclaw config set agents.entries.main.tools.allow '["cron","group:messaging","group:memory","group:web","brainfocus-api__*"]' --strict-json
   ```
4. Negar `brainfocus-api__*` en los demás agentes (`code-reviewer`, `datix`, `quickmarkt`, `nexo`)
   para mantener el aislamiento ya establecido en este VPS.
