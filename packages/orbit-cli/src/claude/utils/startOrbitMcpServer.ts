/**
 * Orbit MCP server.
 * Provides Orbit CLI specific tools including chat session title management.
 */

import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { ApiSessionClient } from '@/api/apiSession';
import { logger } from '@/ui/logger';

function createMcpServer(handler: (title: string) => Promise<{ success: boolean; error?: string }>): McpServer {
    const mcp = new McpServer({
        name: 'Orbit MCP',
        version: '1.0.0',
    });

    mcp.registerTool('change_title', {
        description: 'Change the title of the current chat session',
        title: 'Change Chat Title',
        inputSchema: {
            title: z.string().describe('The new title for the chat session'),
        },
    }, async (args) => {
        const response = await handler(args.title);
        logger.debug('[orbitMcp] Response:', response);

        if (response.success) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Successfully changed chat title to: "${args.title}"`,
                    },
                ],
                isError: false,
            };
        }

        return {
            content: [
                {
                    type: 'text',
                    text: `Failed to change chat title: ${response.error || 'Unknown error'}`,
                },
            ],
            isError: true,
        };
    });

    return mcp;
}

export async function startOrbitMcpServer(client: ApiSessionClient) {
    logger.debug(`[orbitMcp] server:start sessionId=${client.sessionId}`);

    const handler = async (title: string) => {
        logger.debug('[orbitMcp] Changing title to:', title);
        try {
            client.sendClaudeSessionMessage({
                type: 'summary',
                summary: title,
                leafUuid: randomUUID(),
            });
            return { success: true };
        } catch (error) {
            return { success: false, error: String(error) };
        }
    };

    const server = createServer(async (req, res) => {
        const mcp = createMcpServer(handler);
        try {
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: undefined,
            });
            await mcp.connect(transport);
            await transport.handleRequest(req, res);
            res.on('close', () => {
                transport.close();
                mcp.close();
            });
        } catch (error) {
            logger.debug('Error handling request:', error);
            if (!res.headersSent) {
                res.writeHead(500).end();
            }
            mcp.close();
        }
    });

    const baseUrl = await new Promise<URL>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const addr = server.address() as AddressInfo;
            resolve(new URL(`http://127.0.0.1:${addr.port}`));
        });
    });

    logger.debug(`[orbitMcp] server:ready sessionId=${client.sessionId} url=${baseUrl.toString()}`);

    return {
        url: baseUrl.toString(),
        toolNames: ['change_title'],
        stop: () => {
            logger.debug(`[orbitMcp] server:stop sessionId=${client.sessionId}`);
            server.close();
        },
    };
}
