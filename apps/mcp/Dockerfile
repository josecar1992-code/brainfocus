FROM node:22-slim AS build
WORKDIR /app

# Paquete compartido de fecha/hora Costa Rica — ver apps/api/Dockerfile para
# el porqué de este primer bloque (misma razón acá).
COPY packages/shared-time ./packages/shared-time
RUN npm --prefix packages/shared-time install && npm --prefix packages/shared-time run build

# Herramientas compartidas (packages/focusbrain-tools): la tabla de tools vive ahí y la
# usan tanto este MCP como apps/assistant. Depende de shared-time (ya construido arriba).
COPY packages/focusbrain-tools ./packages/focusbrain-tools
RUN npm --prefix packages/focusbrain-tools ci && npm --prefix packages/focusbrain-tools run build

COPY apps/mcp/package.json apps/mcp/package-lock.json ./apps/mcp/
RUN npm --prefix apps/mcp ci
COPY apps/mcp ./apps/mcp
RUN npm --prefix apps/mcp run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY packages/shared-time/package.json ./packages/shared-time/package.json
COPY --from=build /app/packages/shared-time/dist ./packages/shared-time/dist
COPY packages/focusbrain-tools/package.json packages/focusbrain-tools/package-lock.json ./packages/focusbrain-tools/
COPY --from=build /app/packages/focusbrain-tools/dist ./packages/focusbrain-tools/dist
RUN npm --prefix packages/focusbrain-tools ci --omit=dev

COPY apps/mcp/package.json apps/mcp/package-lock.json ./apps/mcp/
RUN npm --prefix apps/mcp ci --omit=dev
COPY --from=build /app/apps/mcp/dist ./apps/mcp/dist
WORKDIR /app/apps/mcp
ENTRYPOINT ["node", "dist/index.js"]
