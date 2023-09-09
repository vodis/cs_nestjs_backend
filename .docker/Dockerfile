FROM nginx:latest AS runner

WORKDIR "/code"
COPY . .

RUN apk update && apk add openrc busybox-openrc busybox-extras-openrc busybox-mdev-openrc supervisor --no-cache
RUN mkdir /run/openrc/ && touch /run/openrc/softlevel

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/

EXPOSE 3030

FROM base AS dependencies
RUN npm ci --only=production
RUN cp -R node_modules prod_node_modules
RUN npm i

FROM base as develop
COPY --from=dependencies code/node_modules ./node_modules
COPY --from=build code/dist ./dist
CMD ["npm", "run", "start:prod"]
