import { homedir } from 'node:os'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import WebSocket from 'ws'

export const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL ?? 'ws://127.0.0.1:18789'

export function readGatewayToken(): string | undefined {
    try {
        const configPath = join(homedir(), '.openclaw', 'openclaw.json')
        const config = JSON.parse(readFileSync(configPath, 'utf-8'))
        return config?.gateway?.auth?.token
    } catch {
        return process.env.OPENCLAW_GATEWAY_TOKEN
    }
}

export async function isGatewayReachable(url: string): Promise<boolean> {
    return new Promise((resolve) => {
        let settled = false
        const ws = new WebSocket(url, { handshakeTimeout: 2000 })
        const finish = (result: boolean) => {
            if (settled) return
            settled = true
            clearTimeout(timeout)
            try {
                ws.close()
            } catch {
                // ignore
            }
            resolve(result)
        }
        const timeout = setTimeout(() => finish(false), 2500)
        ws.on('open', () => finish(true))
        ws.on('error', () => finish(false))
    })
}

export async function shouldRunOpenClawIntegration(): Promise<boolean> {
    if (!(await isGatewayReachable(GATEWAY_URL))) {
        console.log(`[openclaw-test] Skipping: gateway not reachable at ${GATEWAY_URL}`)
        return false
    }

    const token = readGatewayToken()
    if (!token) {
        console.log('[openclaw-test] Skipping: no gateway token (OPENCLAW_GATEWAY_TOKEN or ~/.openclaw/openclaw.json)')
        return false
    }

    return true
}
