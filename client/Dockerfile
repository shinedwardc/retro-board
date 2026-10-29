# Build stage: compile the React app to static files
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# No VITE_SERVER_URL here: the bundle connects to whatever origin serves it (see src/socket.ts),
# so the same image works for any DOMAIN
RUN npm run build

# Runtime stage: Caddy serves the files and proxies Socket.IO to the server (see Caddyfile)
FROM caddy:2
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
