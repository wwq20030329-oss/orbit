import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'

import { resolveBuildCommand, runBuildForTests } from './test-setup'

type MockResult = Partial<ReturnType<typeof spawnSync>>

function createSpawnSyncMock(results: MockResult[]): typeof spawnSync {
    let index = 0

    return ((command: string, args?: readonly string[] | undefined) => {
        const next = results[index++]
        if (!next) {
            throw new Error(`Unexpected spawnSync call: ${command} ${args?.join(' ') ?? ''}`)
        }

        return {
            pid: 0,
            output: [],
            stdout: Buffer.from(''),
            stderr: Buffer.from(''),
            status: 0,
            signal: null,
            ...next,
        }
    }) as typeof spawnSync
}

describe('test-setup build command resolution', () => {
    it('uses yarn when it is available', () => {
        const spawnSyncMock = createSpawnSyncMock([
            { status: 0 },
        ])

        expect(resolveBuildCommand(spawnSyncMock)).toEqual({
            command: 'yarn',
            args: ['build'],
        })
    })

    it('falls back to corepack yarn when global yarn is missing', () => {
        const missingYarn = Object.assign(new Error('spawn yarn ENOENT'), { code: 'ENOENT' })
        const spawnSyncMock = createSpawnSyncMock([
            { status: null, error: missingYarn },
            { status: 0 },
        ])

        expect(resolveBuildCommand(spawnSyncMock)).toEqual({
            command: 'corepack',
            args: ['yarn', 'build'],
        })
    })

    it('throws when neither yarn nor corepack yarn is available', () => {
        const missingCommand = Object.assign(new Error('missing'), { code: 'ENOENT' })
        const spawnSyncMock = createSpawnSyncMock([
            { status: null, error: missingCommand },
            { status: null, error: missingCommand },
        ])

        expect(() => resolveBuildCommand(spawnSyncMock)).toThrow(
            'Unable to run Orbit CLI test build: neither `yarn` nor `corepack yarn` is available on PATH.'
        )
    })

    it('surfaces build failures instead of silently continuing', () => {
        const spawnSyncMock = createSpawnSyncMock([
            { status: 0 },
            { status: 2, stderr: Buffer.from('build broke') },
        ])

        expect(() => runBuildForTests(spawnSyncMock)).toThrow('build broke')
    })
})
