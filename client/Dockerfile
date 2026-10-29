# Build stage: compile the React app to static files
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Vite bakes this into the bundle at build time, so it must be passed as a build arg
ARG VITE_SERVER_URL
ENV VITE_SERVER_URL=$VITE_SERVER_URL
RUN npm run build

# Runtime stage: Caddy serves the files and proxies Socket.IO to the server (see Caddyfile)
FROM caddy:2
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
