FROM node:22-slim AS build
WORKDIR /app

# Paquete compartido de fecha/hora Costa Rica (packages/shared-time) — se
# construye antes que la app porque apps/api/package.json lo referencia como
# dependencia local (file:../../packages/shared-time). El build de docker
# compose usa el repo entero como contexto (ver docker-compose.yml) para que
# este directorio sea visible acá.
COPY packages/shared-time ./packages/shared-time
RUN npm --prefix packages/shared-time install && npm --prefix packages/shared-time run build

COPY apps/api/package.json apps/api/package-lock.json ./apps/api/
# npm ci instala EXACTAMENTE lo que fija package-lock.json (antes: install solo con
# package.json, que resolvia versiones distintas segun la fecha del build y dejaba
# los parches de seguridad al azar de la cache de Docker; ver PENDIENTES.md).
# --legacy-peer-deps se mantiene: el bug de arborist con los peers opcionales de
# vitest (@vitejs/devtools-*, detectado 10-sep-2026) es de npm 10.x.
RUN npm --prefix apps/api ci --legacy-peer-deps
COPY apps/api ./apps/api
RUN npm --prefix apps/api run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY packages/shared-time/package.json ./packages/shared-time/package.json
COPY --from=build /app/packages/shared-time/dist ./packages/shared-time/dist
COPY apps/api/package.json apps/api/package-lock.json ./apps/api/
RUN npm --prefix apps/api ci --omit=dev --legacy-peer-deps
COPY --from=build /app/apps/api/dist ./apps/api/dist
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/index.js"]
