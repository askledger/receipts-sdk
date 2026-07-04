FROM node:26-bookworm-slim AS base
ENV NODE_ENV=production PNPM_HOME=/pnpm PATH=/pnpm:$PATH
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY console/package.json console/
RUN --mount=type=cache,target=/root/.npm npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm --prefix console ci --legacy-peer-deps && npm --prefix console run build

FROM gcr.io/distroless/nodejs20-debian12 AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/console/.next ./console/.next
COPY --from=build /app/console/public ./console/public
COPY --from=build /app/console/package.json ./console/package.json
COPY --from=build /app/console/node_modules ./console/node_modules
COPY --from=build /app/package.json ./package.json
USER nonroot:nonroot
EXPOSE 3000
CMD ["console/node_modules/next/dist/bin/next", "start", "console", "-p", "3000"]
