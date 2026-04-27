/**
 * Orbit MCP STDIO Bridge.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

function parseArgs(argv: string[]): { url: string | null } {
  let url: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--url' && i + 1 < argv.length) {
      url = argv[i + 1];
      i++;
    }
  }
  return { url };
}

async function main() {
  const { url: urlFromArgs } = parseArgs(process.argv.slice(2));
  const baseUrl = urlFromArgs || process.env.ORBIT_HTTP_MCP_URL || '';

  if (!baseUrl) {
    process.stderr.write(
      '[orbit-mcp] Missing target URL. Set ORBIT_HTTP_MCP_URL or pass --url <http://127.0.0.1:PORT>\n'
    );
    process.exit(2);
  }

  let httpClient: Client | null = null;

  async function ensureHttpClient(): Promise<Client> {
    if (httpClient) {
      return httpClient;
    }

    const client = new Client(
      { name: 'orbit-stdio-bridge', version: '1.0.0' },
      { capabilities: {} }
    );

    const transport = new StreamableHTTPClientTransport(new URL(baseUrl));
    await client.connect(transport);
    httpClient = client;
    return client;
  }

  const server = new McpServer({
    name: 'Orbit MCP Bridge',
    version: '1.0.0',
  });

  server.registerTool(
    'change_title',
    {
      description: 'Change the title of the current chat session',
      title: 'Change Chat Title',
      inputSchema: {
        title: z.string().describe('The new title for the chat session'),
      },
    },
    async (args) => {
      try {
        const client = await ensureHttpClient();
        const response = await client.callTool({ name: 'change_title', arguments: args });
        return response as any;
      } catch (error) {
        return {
          content: [
            { type: 'text', text: `Failed to change chat title: ${error instanceof Error ? error.message : String(error)}` },
          ],
          isError: true,
        };
      }
    }
  );

  const stdio = new StdioServerTransport();
  await server.connect(stdio);
}

main().catch((error) => {
  try {
    process.stderr.write(`[orbit-mcp] Fatal: ${error instanceof Error ? error.message : String(error)}\n`);
  } finally {
    process.exit(1);
  }
});
