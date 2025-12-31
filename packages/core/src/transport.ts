/**
 * Dual transport support for MCP servers.
 * Supports both stdio (local) and Streamable HTTP (remote/Docker).
 *
 * Usage:
 *   import { startServer } from '@cluster-mcp/core';
 *   const server = new McpServer({ name: 'my-server', version: '1.0.0' });
 *   // ... register tools ...
 *   await startServer(server);
 *
 * Environment variables:
 *   TRANSPORT: 'stdio' (default) or 'http'
 *   PORT: HTTP port (default: 8005)
 *   HOST: HTTP host (default: '0.0.0.0')
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Express, Request, Response } from 'express';

export interface TransportConfig {
  /** Transport type: 'stdio' or 'http'. Default: process.env.TRANSPORT || 'stdio' */
  transport?: 'stdio' | 'http';
  /** HTTP port. Default: process.env.PORT || 8005 */
  port?: number;
  /** HTTP host. Default: process.env.HOST || '0.0.0.0' */
  host?: string;
  /** Server name for logging */
  serverName?: string;
  /** Custom Express app configuration callback */
  configureApp?: (app: Express) => void;
}

/**
 * Start an MCP server with the configured transport.
 *
 * For stdio: Uses StdioServerTransport for local CLI usage.
 * For HTTP: Creates Express server with Streamable HTTP transport at /mcp endpoint.
 */
export async function startServer(
  server: McpServer,
  config: TransportConfig = {}
): Promise<void> {
  const transport = config.transport || (process.env.TRANSPORT as 'stdio' | 'http') || 'stdio';
  const serverName = config.serverName || 'mcp-server';

  if (transport === 'http') {
    await startHttpServer(server, config, serverName);
  } else {
    await startStdioServer(server, serverName);
  }
}

async function startStdioServer(server: McpServer, serverName: string): Promise<void> {
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${serverName} running on stdio`);
}

async function startHttpServer(
  server: McpServer,
  config: TransportConfig,
  serverName: string
): Promise<void> {
  const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
  const express = (await import('express')).default;

  const port = config.port || parseInt(process.env.PORT || '8005');
  const host = config.host || process.env.HOST || '0.0.0.0';

  const app = express();
  app.use(express.json());

  // Health check endpoint for Docker/Kubernetes
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      server: serverName,
      transport: 'http',
      timestamp: new Date().toISOString()
    });
  });

  // Server info endpoint
  app.get('/', (_req: Request, res: Response) => {
    res.json({
      name: serverName,
      transport: 'streamable-http',
      endpoints: {
        mcp: '/mcp',
        health: '/health'
      }
    });
  });

  // MCP Streamable HTTP endpoint
  app.post('/mcp', async (req: Request, res: Response) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless mode for serverless compatibility
      enableJsonResponse: true
    });

    res.on('close', () => {
      transport.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  // Optional: SSE endpoint for backwards compatibility with older clients
  app.get('/sse', async (req: Request, res: Response) => {
    // Basic SSE fallback - not recommended for production
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write('event: connected\ndata: {"status": "connected"}\n\n');

    req.on('close', () => {
      res.end();
    });
  });

  // Allow custom app configuration
  if (config.configureApp) {
    config.configureApp(app);
  }

  app.listen(port, host, () => {
    console.error(`${serverName} running on http://${host}:${port}`);
    console.error(`  MCP endpoint: http://${host}:${port}/mcp`);
    console.error(`  Health check: http://${host}:${port}/health`);
  });
}

/**
 * Create Express app with MCP transport configured.
 * Use this if you need more control over the Express app.
 */
export async function createMcpApp(
  server: McpServer,
  options: { serverName?: string } = {}
): Promise<Express> {
  const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
  const express = (await import('express')).default;

  const serverName = options.serverName || 'mcp-server';

  const app = express();
  app.use(express.json());

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', server: serverName });
  });

  app.post('/mcp', async (req: Request, res: Response) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    });

    res.on('close', () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  return app;
}
