FROM node:24-alpine3.20 AS build

WORKDIR /workdir

ENV NODE_OPTIONS="--max-old-space-size=2048"

COPY package*.json tsconfig.json ./
COPY app/client ./app/client

RUN npm ci --ignore-scripts
RUN npm run build:client

FROM nginxinc/nginx-unprivileged:alpine3.21-perl AS production

EXPOSE 80

COPY --from=build /workdir/dist/client /usr/share/nginx/html
COPY app/client/nginx.default.conf /etc/nginx/conf.d/default.conf

CMD ["nginx", "-g", "daemon off;"]
