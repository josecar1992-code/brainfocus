FROM node:22-slim AS build
WORKDIR /app

# Paquete compartido de fecha/hora Costa Rica — ver apps/api/Dockerfile para
# el porqué de este primer bloque (misma razón acá).
COPY packages/shared-time ./packages/shared-time
RUN npm --prefix packages/shared-time install && npm --prefix packages/shared-time run build

COPY apps/mcp/package.json ./apps/mcp/package.json
RUN npm --prefix apps/mcp install
COPY apps/mcp ./apps/mcp
RUN npm --prefix apps/mcp run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY packages/shared-time/package.json ./packages/shared-time/package.json
COPY --from=build /app/packages/shared-time/dist ./packages/shared-time/dist
COPY apps/mcp/package.json ./apps/mcp/package.json
RUN npm --prefix apps/mcp install --omit=dev
COPY --from=build /app/apps/mcp/dist ./apps/mcp/dist
WORKDIR /app/apps/mcp
ENTRYPOINT ["node", "dist/index.js"]
