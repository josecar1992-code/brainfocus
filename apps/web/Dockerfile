FROM node:22-slim AS build
WORKDIR /app

# Paquete compartido de fecha/hora Costa Rica — ver apps/api/Dockerfile para
# el porqué de este primer bloque (misma razón acá; api.ts lo usa).
COPY packages/shared-time ./packages/shared-time
RUN npm --prefix packages/shared-time install && npm --prefix packages/shared-time run build

COPY apps/web/package.json ./apps/web/package.json
RUN npm --prefix apps/web install
COPY apps/web ./apps/web
# Vite hornea las VITE_* en build time, no en runtime — por eso van como build args.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_API_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_API_URL=$VITE_API_URL
RUN npm --prefix apps/web run build

FROM nginx:alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
