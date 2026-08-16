# Build context must be the monorepo root (pnpm workspace), e.g.:
#   docker build -f apps/api/Dockerfile -t sultan-noor-api .

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

COPY apps/api apps/api
RUN pnpm --filter @sultan-noor/api run prisma:generate
RUN pnpm --filter @sultan-noor/api run build
RUN pnpm --filter @sultan-noor/api deploy --prod --legacy /prod/api

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /prod/api ./
EXPOSE 4000
CMD ["node", "dist/src/main.js"]
