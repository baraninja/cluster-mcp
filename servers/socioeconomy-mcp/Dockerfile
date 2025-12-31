# Dockerfile for socioeconomy-mcp
# Build: docker build -f servers/socioeconomy-mcp/Dockerfile -t socioeconomy-mcp .
# Run:   docker run -p 8005:8005 socioeconomy-mcp

FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace files
COPY package*.json ./
COPY packages/core/package*.json ./packages/core/
COPY servers/socioeconomy-mcp/package*.json ./servers/socioeconomy-mcp/

# Install dependencies
RUN npm ci --workspace=@cluster-mcp/core --workspace=socioeconomy-mcp

# Copy source code
COPY packages/core/ ./packages/core/
COPY servers/socioeconomy-mcp/ ./servers/socioeconomy-mcp/

# Build core first, then the server
RUN npm run build --workspace=@cluster-mcp/core && \
    npm run build --workspace=socioeconomy-mcp

# Production stage
FROM node:22-alpine AS production

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
COPY packages/core/package*.json ./packages/core/
COPY servers/socioeconomy-mcp/package*.json ./servers/socioeconomy-mcp/

RUN npm ci --workspace=@cluster-mcp/core --workspace=socioeconomy-mcp --omit=dev

# Copy built files
COPY --from=builder /app/packages/core/dist/ ./packages/core/dist/
COPY --from=builder /app/packages/core/data/ ./packages/core/data/
COPY --from=builder /app/servers/socioeconomy-mcp/dist/ ./servers/socioeconomy-mcp/dist/

# Set environment variables
ENV NODE_ENV=production
ENV TRANSPORT=http
ENV PORT=8005
ENV HOST=0.0.0.0

EXPOSE 8005

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -q -O- http://localhost:8005/health || exit 1

CMD ["node", "servers/socioeconomy-mcp/dist/server.js"]
