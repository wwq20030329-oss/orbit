/**
 * Vitest global setup — runs ONCE before all tests.
 *
 * We only build the CLI here. Integration suites now provision their own
 * isolated environments so each suite can get a fresh lab-rat project copy.
 */

import { spawnSync } from 'node:child_process'

type BuildCommand = {
    command: string;
    args: string[];
}

type BuildCommandCandidate = {
    command: string;
    prefixArgs: string[];
}

export function resolveBuildCommand(spawnSyncImpl: typeof spawnSync = spawnSync): BuildCommand {
    const candidates: BuildCommandCandidate[] = [
        { command: 'yarn', prefixArgs: [] },
        { command: 'corepack', prefixArgs: ['yarn'] },
    ]

    for (const candidate of candidates) {
        const result = spawnSyncImpl(candidate.command, [...candidate.prefixArgs, '--version'], { stdio: 'pipe' })
        if (!result.error && result.status === 0) {
            return {
                command: candidate.command,
                args: [...candidate.prefixArgs, 'build'],
            }
        }
    }

    throw new Error('Unable to run Orbit CLI test build: neither `yarn` nor `corepack yarn` is available on PATH.')
}

export function runBuildForTests(spawnSyncImpl: typeof spawnSync = spawnSync): void {
    const buildCommand = resolveBuildCommand(spawnSyncImpl)
    const buildResult = spawnSyncImpl(buildCommand.command, buildCommand.args, { stdio: 'pipe' })

    if (buildResult.error) {
        throw buildResult.error
    }

    if (buildResult.status !== 0) {
        const stderr = buildResult.stderr?.toString().trim() ?? ''
        const stdout = buildResult.stdout?.toString().trim() ?? ''
        throw new Error(stderr || stdout || `Build failed with exit code ${buildResult.status}`)
    }
}

export async function setup() {
    process.env.VITEST_POOL_TIMEOUT = '60000'
    process.env.ORBIT_RUN_SANDBOX_NETWORK_TESTS = '1'

    runBuildForTests()
}

export async function teardown() {
    // Per-suite integration environments clean themselves up.
}
