# syntax=docker/dockerfile:1
# Production image for orchestrator (GHCR :production tag).

FROM node:20-alpine AS deps
WORKDIR /code
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS build
WORKDIR /code
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /code
ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nestjs

COPY --from=deps --chown=nestjs:nodejs /code/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /code/dist ./dist
COPY --chown=nestjs:nodejs db ./db
COPY --chown=nestjs:nodejs package.json ./

RUN test -f db/migrations/20260619000100-create-auth-onboarding-tables.js \
  && ./node_modules/.bin/sequelize-cli --version

USER nestjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/health',(r)=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/main.js"]
