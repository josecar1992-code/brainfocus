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
RUN npm --prefix apps/api install
COPY apps/api ./apps/api
RUN npm --prefix apps/api run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY packages/shared-time/package.json ./packages/shared-time/package.json
COPY --from=build /app/packages/shared-time/dist ./packages/shared-time/dist
COPY apps/api/package.json ./apps/api/package.json
RUN npm --prefix apps/api install --omit=dev
COPY --from=build /app/apps/api/dist ./apps/api/dist
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/index.js"]
