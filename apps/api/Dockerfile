FROM node:22-slim AS build
WORKDIR /app

# Paquete compartido de fecha/hora Costa Rica (packages/shared-time) — se
# construye antes que la app porque apps/api/package.json lo referencia como
# dependencia local (file:../../packages/shared-time). El build de docker
# compose usa el repo entero como contexto (ver docker-compose.yml) para que
# este directorio sea visible acá.
COPY packages/shared-time ./packages/shared-time
RUN npm --prefix packages/shared-time install && npm --prefix packages/shared-time run build

COPY apps/api/package.json ./apps/api/package.json
# --legacy-peer-deps: sin lockfile en este paso (solo se copia package.json),
# npm resuelve el árbol de deps ideal desde cero cada vez, y algunas
# devDependencies (vitest y su cadena de peers opcionales @vitejs/devtools-*)
# disparan un bug conocido de npm 10.x en su resolución de peers (arborist
# crashea con "Cannot read properties of null (reading 'edgesOut')") — no
# tiene que ver con el código de la app, solo con cómo se resuelven esos
# peers. Detectado 10-sep-2026: nunca había fallado porque Docker cacheaba
# esta capa (package.json de apps/api no cambiaba); se destapó apenas un
# cambio en packages/shared-time (capa anterior) invalidó la cache. Ver
# PENDIENTES.md.
RUN npm --prefix apps/api install --legacy-peer-deps
COPY apps/api ./apps/api
RUN npm --prefix apps/api run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY packages/shared-time/package.json ./packages/shared-time/package.json
COPY --from=build /app/packages/shared-time/dist ./packages/shared-time/dist
COPY apps/api/package.json ./apps/api/package.json
RUN npm --prefix apps/api install --omit=dev --legacy-peer-deps
COPY --from=build /app/apps/api/dist ./apps/api/dist
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/index.js"]
