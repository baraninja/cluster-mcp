# Dockerfile for trade-mcp
# Build: docker build -f servers/trade-mcp/Dockerfile -t trade-mcp .
# Run:   docker run -p 8005:8005 -e COMTRADE_API_KEY=your-key trade-mcp

FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY packages/core/package*.json ./packages/core/
COPY servers/trade-mcp/package*.json ./servers/trade-mcp/

RUN npm ci --workspace=@cluster-mcp/core --workspace=trade-mcp

COPY packages/core/ ./packages/core/
COPY servers/trade-mcp/ ./servers/trade-mcp/

RUN npm run build --workspace=@cluster-mcp/core && \
    npm run build --workspace=trade-mcp

FROM node:22-alpine AS production

WORKDIR /app

COPY package*.json ./
COPY packages/core/package*.json ./packages/core/
COPY servers/trade-mcp/package*.json ./servers/trade-mcp/

RUN npm ci --workspace=@cluster-mcp/core --workspace=trade-mcp --omit=dev

COPY --from=builder /app/packages/core/dist/ ./packages/core/dist/
COPY --from=builder /app/packages/core/data/ ./packages/core/data/
COPY --from=builder /app/servers/trade-mcp/dist/ ./servers/trade-mcp/dist/

ENV NODE_ENV=production
ENV TRANSPORT=http
ENV PORT=8005
ENV HOST=0.0.0.0

EXPOSE 8005

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -q -O- http://localhost:8005/health || exit 1

CMD ["node", "servers/trade-mcp/dist/server.js"]
