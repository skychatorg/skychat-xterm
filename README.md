# SkyChat XTerm

Web-based terminal interface for SkyChat using xterm.js with JWT authentication.

## Features

- Full xterm.js terminal experience
- JWT authentication via SkyChat credentials
- Isolated PTY sessions per user
- Docker containerization with Traefik reverse proxy
- TypeScript client and server

## Quick Start

### 1. Configure Environment

Copy and edit `.env`:

```bash
cp .env.example .env
```

Required variables:

```bash
# SkyChat Configuration
SKYCHAT_HOST=skychat-instance.com
SKYCHAT_PROTOCOL=wss

# JWT Secret (generate with: openssl rand -hex 32)
JWT_SECRET=your-secret-here

# Docker Configuration
DOCKER_USER=your-username
DOCKER_UID=1000
DOCKER_GID=1000

# Public URL
PUBLIC_HOST=xterm.skych.at.localhost
PUBLIC_PORT=8081
```

### 2. Build and Run

```bash
# Build containers
docker-compose build

# Start services
docker-compose up -d

# View logs
docker-compose logs -f
```

### 3. Access

Open http://xterm.skych.at.localhost:8081 (or your configured PUBLIC_HOST)

Login with your SkyChat credentials.

## Development

### Local Build

```bash
# Install dependencies
npm install

# Build client and server
npm run build

# Run locally (development)
npm run dev
```

### Docker Commands

```bash
# Rebuild after code changes
docker-compose build

# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f xterm_backend
```

## Environment Variables

| Variable             | Default     | Description                 |
| -------------------- | ----------- | --------------------------- |
| `SKYCHAT_HOST`       | `localhost` | SkyChat server hostname     |
| `SKYCHAT_PROTOCOL`   | `wss`       | WebSocket protocol (ws/wss) |
| `JWT_SECRET`         | required    | JWT signing secret          |
| `SESSION_TIMEOUT_MS` | `7200000`   | Session timeout (2 hours)   |
| `PUBLIC_HOST`        | required    | Public hostname             |
| `PUBLIC_PORT`        | `8081`      | Public port                 |
| `USE_TLS`            | empty       | Enable Let's Encrypt        |
| `ADMIN_EMAIL`        | required    | Email for Let's Encrypt     |
