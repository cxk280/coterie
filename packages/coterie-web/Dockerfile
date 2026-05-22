# syntax=docker/dockerfile:1.7
# Multi-stage Next.js production build. Final image runs `node server.js`
# under a non-root user.

# ---------- deps ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY packages/coterie-web/package.json packages/coterie-web/package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then npm ci; else npm install; fi

# ---------- builder ----------
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY packages/coterie-web/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------- runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app

RUN addgroup -S coterie && adduser -S coterie -G coterie

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# next.config.ts must set `output: "standalone"` for this slim copy to work.
COPY --from=builder --chown=coterie:coterie /app/.next/standalone ./
COPY --from=builder --chown=coterie:coterie /app/.next/static ./.next/static
COPY --from=builder --chown=coterie:coterie /app/public ./public

USER coterie
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
    CMD wget --quiet --spider http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
