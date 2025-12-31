# Dockerfile for health-mcp
# Build: docker build -f servers/health-mcp/Dockerfile -t health-mcp .
# Run:   docker run -p 8005:8005 health-mcp

FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY packages/core/package*.json ./packages/core/
COPY servers/health-mcp/package*.json ./servers/health-mcp/

RUN npm ci --workspace=@cluster-mcp/core --workspace=health-mcp

COPY packages/core/ ./packages/core/
COPY servers/health-mcp/ ./servers/health-mcp/

RUN npm run build --workspace=@cluster-mcp/core && \
    npm run build --workspace=health-mcp

FROM node:22-alpine AS production

WORKDIR /app

COPY package*.json ./
COPY packages/core/package*.json ./packages/core/
COPY servers/health-mcp/package*.json ./servers/health-mcp/

RUN npm ci --workspace=@cluster-mcp/core --workspace=health-mcp --omit=dev

COPY --from=builder /app/packages/core/dist/ ./packages/core/dist/
COPY --from=builder /app/packages/core/data/ ./packages/core/data/
COPY --from=builder /app/servers/health-mcp/dist/ ./servers/health-mcp/dist/

ENV NODE_ENV=production
ENV TRANSPORT=http
ENV PORT=8005
ENV HOST=0.0.0.0

EXPOSE 8005

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -q -O- http://localhost:8005/health || exit 1

CMD ["node", "servers/health-mcp/dist/server.js"]
