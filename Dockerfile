# Multi-stage Dockerfile for brzl-shortener
# Stage 1: Build TypeScript application
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for better-sqlite3 native compilation
RUN apk add --no-cache python3 make g++

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src/ ./src/
COPY _redirects ./_redirects

RUN npm run build

# Prune dev dependencies for production
RUN npm prune --production

# Stage 2: Minimal runtime image
FROM node:20-alpine AS runner

WORKDIR /app

# Install curl for docker healthcheck and runtime libraries
RUN apk add --no-cache curl sqlite

ENV NODE_ENV=production \
    PORT=3005 \
    HOST=0.0.0.0 \
    BASE_URL=https://brzl.ca \
    DEFAULT_FALLBACK_URL=https://brasileiro.ca \
    DB_PATH=/app/data/shortener.db \
    NODE_OPTIONS=--max-old-space-size=64

# Copy node modules and built files
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/_redirects ./_redirects

# Create persistent data directory with node user ownership
RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 3005

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3005/health || exit 1

CMD ["node", "dist/index.js"]
