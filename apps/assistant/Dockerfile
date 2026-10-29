FROM node:22-slim AS build
WORKDIR /app

COPY packages/shared-time ./packages/shared-time
RUN npm --prefix packages/shared-time install && npm --prefix packages/shared-time run build

COPY packages/focusbrain-tools ./packages/focusbrain-tools
RUN npm --prefix packages/focusbrain-tools ci && npm --prefix packages/focusbrain-tools run build

COPY apps/assistant/package.json apps/assistant/package-lock.json ./apps/assistant/
RUN npm --prefix apps/assistant ci
COPY apps/assistant ./apps/assistant
RUN npm --prefix apps/assistant run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY packages/shared-time/package.json ./packages/shared-time/package.json
COPY --from=build /app/packages/shared-time/dist ./packages/shared-time/dist
COPY packages/focusbrain-tools/package.json packages/focusbrain-tools/package-lock.json ./packages/focusbrain-tools/
COPY --from=build /app/packages/focusbrain-tools/dist ./packages/focusbrain-tools/dist
RUN npm --prefix packages/focusbrain-tools ci --omit=dev

COPY apps/assistant/package.json apps/assistant/package-lock.json ./apps/assistant/
RUN npm --prefix apps/assistant ci --omit=dev
COPY --from=build /app/apps/assistant/dist ./apps/assistant/dist
WORKDIR /app/apps/assistant
EXPOSE 3002
CMD ["node", "dist/index.js"]
