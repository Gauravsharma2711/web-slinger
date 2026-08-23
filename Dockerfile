FROM node:22-slim AS builder

WORKDIR /app

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate

# Copy workspace manifests and shared/backend source
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY shared/package.json shared/tsconfig.json ./shared/
COPY shared/src ./shared/src
COPY backend/package.json backend/tsconfig.json ./backend/
COPY backend/src ./backend/src
COPY frontend/package.json ./frontend/

# Install dependencies and build shared and backend
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @web-slinger/shared build
RUN pnpm --filter @web-slinger/backend build

# Production runtime stage
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

RUN corepack enable && corepack prepare pnpm@11.22.0 --activate

# Copy manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Copy built artifacts from builder stage
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/backend/dist ./backend/dist

EXPOSE 8080

CMD ["node", "backend/dist/index.js"]
