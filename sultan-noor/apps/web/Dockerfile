# Build context must be the monorepo root (pnpm workspace), e.g.:
#   docker build -f apps/web/Dockerfile -t sultan-noor-web .

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}

COPY apps/web apps/web
RUN pnpm --filter @sultan-noor/web run build

# next.config.ts has output:"standalone" — .next/standalone already contains
# a minimal, self-contained server.js + only the deps actually used, no need
# for `pnpm deploy` here. Static assets and public/ are copied in separately
# per Next.js's documented standalone layout.
RUN cp -r apps/web/public apps/web/.next/standalone/apps/web/public && \
    cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app/apps/web/.next/standalone ./
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
