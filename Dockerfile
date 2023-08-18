FROM nginx:latest AS runner

RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/

EXPOSE 3030

CMD ["npm", "run", "start:prod;"]