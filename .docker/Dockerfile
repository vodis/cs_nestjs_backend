FROM nginx:latest AS base

WORKDIR "/code"
COPY . .

RUN apk update && apk add openrc busybox-openrc busybox-extras-openrc busybox-mdev-openrc supervisor --no-cache
RUN mkdir /run/openrc/ && touch /run/openrc/softlevel

RUN mkdir /etc/periodic/2min \
    && mkdir /etc/periodic/4min \
    && mkdir /etc/periodic/5min \
    && mkdir /etc/periodic/6min \
    && mkdir /etc/periodic/60min
RUN echo "*/2     *       *       *       *       run-parts /etc/periodic/2min" >> /etc/crontabs/root \
    && echo "*/4     *       *       *       *       run-parts /etc/periodic/4min" >> /etc/crontabs/root \
    && echo "*/5     *       *       *       *       run-parts /etc/periodic/5min" >> /etc/crontabs/root \
    && echo "*/6     *       *       *       *       run-parts /etc/periodic/6min" >> /etc/crontabs/root \
    && echo "*/60     *       *       *       *       run-parts /etc/periodic/60min" >> /etc/crontabs/root
RUN chmod a+x /code/docker_scripts/run* \
    && cp ./docker_scripts/runCleanerDaemon /etc/periodic/daily/

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/

FROM base AS dependencies
RUN npm ci --only=production
RUN cp -R node_modules prod_node_modules
RUN npm i

#FROM base AS build
#COPY --from=dependencies code/node_modules ./node_modules
#RUN npm run build
#
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
