FROM alpine:latest
EXPOSE 3000

ARG DOCKER_USER
ARG DOCKER_UID
ARG DOCKER_GID
ARG DOCKER_TZ

WORKDIR /workdir

# Set timezone and create non-root user
RUN ln -snf "/usr/share/zoneinfo/$DOCKER_TZ" /etc/localtime && \
    echo "$DOCKER_TZ" > /etc/timezone && \
    addgroup -g "$DOCKER_GID" "$DOCKER_USER" && \
    adduser -u "$DOCKER_UID" -G "$DOCKER_USER" -D "$DOCKER_USER" && \
    apk add --no-cache --update nodejs npm python3 make g++

COPY package*.json tsconfig.json ./

RUN chown "$DOCKER_UID:$DOCKER_GID" /workdir

USER $DOCKER_UID:$DOCKER_GID

COPY --chown=$DOCKER_UID:$DOCKER_GID app/server ./app/server

RUN npm ci
RUN npm run build:server

CMD ["node", "dist/server/index.js"]
