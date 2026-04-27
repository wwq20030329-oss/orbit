import { existsSync } from 'node:fs';

import type { Metadata } from '@/api/types';
import { spawnOrbitCLI } from '@/utils/spawnOrbitCLI';

import { resolveOperationalOrbitSessionById, type ResumableOrbitSession } from './resolveOrbitSession';

export type ResumeLaunch = {
    cwd: string;
    args: string[];
};

export type ResumeLaunchOptions = {
    claudeStartingMode?: 'local' | 'remote';
    startedBy?: 'daemon' | 'terminal';
};

export function parseResumeCommandArgs(args: string[]): { showHelp: boolean; sessionId: string } {
    if (args.includes('-h') || args.includes('--help')) {
        return {
            showHelp: true,
            sessionId: '',
        };
    }

    if (args.length === 0) {
        throw new Error('Orbit session ID is required: orbit resume <session-id>');
    }
    if (args.length > 1) {
        throw new Error(`Unexpected arguments for orbit resume: ${args.slice(1).join(' ')}`);
    }

    return {
        showHelp: false,
        sessionId: args[0],
    };
}

function resolveFlavor(metadata: Metadata): 'codex' | 'claude' | 'gemini' | null {
    if (metadata.flavor === 'codex' || metadata.codexThreadId) {
        return 'codex';
    }
    if (metadata.flavor === 'claude' || metadata.claudeSessionId) {
        return 'claude';
    }
    if (metadata.flavor === 'gemini' || metadata.geminiSessionId) {
        return 'gemini';
    }
    if (metadata.nativeHistorySourceTool === 'codex' || metadata.nativeHistorySourceTool === 'claude' || metadata.nativeHistorySourceTool === 'gemini') {
        return metadata.nativeHistorySourceTool;
    }
    return null;
}

export function buildResumeLaunch(session: ResumableOrbitSession, options: ResumeLaunchOptions = {}): ResumeLaunch {
    const { metadata } = session;
    const flavor = resolveFlavor(metadata);

    if (flavor === 'codex') {
        const codexThreadId = metadata.codexThreadId ?? metadata.nativeHistorySourceBackendId;
        if (!codexThreadId) {
            throw new Error(`Orbit session ${session.id} is missing its Codex thread ID.`);
        }
        const args = ['codex', '--resume', codexThreadId];
        if (options.startedBy) {
            args.push('--started-by', options.startedBy);
        }
        return {
            cwd: metadata.path,
            args,
        };
    }

    if (flavor === 'claude') {
        const claudeSessionId = metadata.claudeSessionId ?? metadata.nativeHistorySourceBackendId;
        if (!claudeSessionId) {
            throw new Error(`Orbit session ${session.id} is missing its Claude session ID.`);
        }
        const args = ['claude'];
        if (options.claudeStartingMode) {
            args.push('--orbit-starting-mode', options.claudeStartingMode);
        }
        if (options.startedBy) {
            args.push('--started-by', options.startedBy);
        }
        args.push('--resume', claudeSessionId);
        return {
            cwd: metadata.path,
            args,
        };
    }

    if (flavor === 'gemini') {
        const geminiSessionId = metadata.geminiSessionId ?? metadata.nativeHistorySourceBackendId;
        if (!geminiSessionId) {
            throw new Error(`Orbit session ${session.id} is missing its Gemini session ID.`);
        }
        const args = ['gemini', '--resume', geminiSessionId];
        if (options.startedBy) {
            args.push('--started-by', options.startedBy);
        }
        return {
            cwd: metadata.path,
            args,
        };
    }

    throw new Error(`Orbit session ${session.id} uses unsupported flavor "${metadata.flavor ?? 'unknown'}".`);
}

export function formatResumeHelp(): string {
    return [
        'orbit resume - Resume a previous Orbit session',
        '',
        'Usage:',
        '  orbit resume <orbit-session-id>',
        '',
        'Examples:',
        '  orbit resume cmmij8olq00dp5jcxr3wtbpau',
        '  orbit resume cmmij8',
        '',
        'This reuses the saved worktree/path and resumes the underlying agent session.',
        'If the requested Orbit wrapper is archived, Orbit will continue the newest active',
        'session that still points at the same native CLI thread when one exists.',
    ].join('\n');
}

function spawnResumeChild(launch: ResumeLaunch): Promise<number | null> {
    return new Promise((resolve, reject) => {
        const child = spawnOrbitCLI(launch.args, {
            cwd: launch.cwd,
            env: process.env,
            stdio: 'inherit',
        });

        child.once('error', reject);
        child.once('exit', (code, signal) => {
            if (signal) {
                reject(new Error(`Resumed session exited via signal ${signal}`));
                return;
            }
            resolve(code);
        });
    });
}

export async function handleResumeCommand(args: string[]): Promise<void> {
    const parsed = parseResumeCommandArgs(args);
    if (parsed.showHelp) {
        console.log(formatResumeHelp());
        return;
    }

    const operation = await resolveOperationalOrbitSessionById(parsed.sessionId);
    const launch = buildResumeLaunch(operation.resolved);

    if (!existsSync(launch.cwd)) {
        throw new Error(`Saved session path does not exist: ${launch.cwd}`);
    }

    const exitCode = await spawnResumeChild(launch);
    if (typeof exitCode === 'number' && exitCode !== 0) {
        process.exit(exitCode);
    }
}
