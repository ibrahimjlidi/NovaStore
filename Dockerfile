
# ==========================================
# Stage 1: Build frontend and backend
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

# Build React frontend
RUN npm run build

# Compile Express backend
RUN npx tsc -p tsconfig.server.json


# ==========================================
# Stage 2: Production application
# ==========================================
FROM node:22-alpine AS production

WORKDIR /app

ENV NODE_ENV=production
ENV API_PORT=3001

# Install production dependencies only
COPY package*.json ./

RUN npm ci --omit=dev \
    && npm cache clean --force

# Copy compiled frontend
COPY --from=builder /app/dist ./dist

# Copy compiled backend
COPY --from=builder /app/dist-server ./dist-server

# SQL migrations are needed at runtime
COPY --from=builder /app/migrations ./dist-server/migrations

# Application port
EXPOSE 3001

# Run as non-root user
USER node

# Apply migrations, then start Express
CMD ["sh", "-c", "node dist-server/server/migrate.js && node dist-server/server/start.js"]
