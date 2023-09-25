FROM nginx:latest AS base

WORKDIR "/code"
COPY . .

RUN apk update && apk add openrc busybox-openrc busybox-extras-openrc busybox-mdev-openrc supervisor --no-cache
RUN mkdir /run/openrc/ && touch /run/openrc/softlevel

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/

FROM base AS dependencies
RUN npm ci --only=production
RUN cp -R node_modules prod_node_modules
RUN npm i

FROM base AS build
COPY --from=dependencies code/node_modules ./node_modules
RUN npm run build

#FROM base as develop
#COPY --from=dependencies code/node_modules ./node_modules
#COPY --from=build code/dist ./dist
#CMD ["npm", "run", "start:dev"]
#
#FROM base AS release
#COPY --from=dependencies code/prod_node_modules ./node_modules
#COPY --from=build code/dist ./dist
#COPY ./docker_scripts/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
#CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
