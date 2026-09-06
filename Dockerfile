# syntax=docker/dockerfile:1
# Production image for orchestrator (GHCR :production tag).

FROM node:20-alpine AS toolchain
ENV COREPACK_HOME=/opt/corepack
WORKDIR /toolchain
COPY package.json ./
RUN corepack enable \
  && package_manager="$(node -p "require('./package.json').packageManager")" \
  && case "${package_manager}" in pnpm@*) ;; *) exit 1 ;; esac \
  && corepack prepare "${package_manager}" --activate \
  && test "pnpm@$(pnpm --version)" = "${package_manager}" \
  && chmod -R a+rX "${COREPACK_HOME}"

FROM toolchain AS deps
WORKDIR /code
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM toolchain AS build
WORKDIR /code
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM toolchain AS production
WORKDIR /code
ENV NODE_ENV=production
ENV PORT=3000
ENV COREPACK_ENABLE_NETWORK=0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nestjs

COPY --from=deps --chown=nestjs:nodejs /code/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /code/dist ./dist
COPY --chown=nestjs:nodejs db ./db
COPY --chown=nestjs:nodejs package.json ./
COPY --chown=nestjs:nodejs pnpm-lock.yaml ./

RUN test -f db/migrations/20260619000100-create-auth-onboarding-tables.js \
  && ./node_modules/.bin/sequelize-cli --version

USER nestjs
RUN test "pnpm@$(pnpm --version)" = "$(node -p "require('./package.json').packageManager")"
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/health',(r)=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/main.js"]
