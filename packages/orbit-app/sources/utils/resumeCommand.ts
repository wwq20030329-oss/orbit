export type ResumeCommandMetadata = {
    path?: string | null;
    os?: string | null;
    flavor?: string | null;
    claudeSessionId?: string | null;
    codexThreadId?: string | null;
    geminiSessionId?: string | null;
    nativeHistorySourceTool?: 'claude' | 'codex' | 'gemini' | null;
    nativeHistorySourceBackendId?: string | null;
};

export type ResumeCommandBlock = {
    lines: string[];
    copyText: string;
};

function quotePosixPath(path: string): string {
    return `'${path.replace(/'/g, `'\\''`)}'`;
}

function quotePowerShellPath(path: string): string {
    return `'${path.replace(/'/g, `''`)}'`;
}

function isWindows(metadata: ResumeCommandMetadata): boolean {
    return metadata.os?.toLowerCase() === 'win32';
}

function buildResumeInvocation(metadata: ResumeCommandMetadata): string | null {
    if ((metadata.flavor === 'codex' || metadata.flavor === 'openai' || metadata.flavor === 'gpt') && metadata.codexThreadId) {
        return `orbit codex --resume ${metadata.codexThreadId}`;
    }
    if (metadata.claudeSessionId) {
        return `orbit claude --resume ${metadata.claudeSessionId}`;
    }
    if (metadata.geminiSessionId) {
        return `orbit gemini --resume ${metadata.geminiSessionId}`;
    }
    if (metadata.nativeHistorySourceTool === 'codex' && metadata.nativeHistorySourceBackendId) {
        return `orbit codex --resume ${metadata.nativeHistorySourceBackendId}`;
    }
    if (metadata.nativeHistorySourceTool === 'claude' && metadata.nativeHistorySourceBackendId) {
        return `orbit claude --resume ${metadata.nativeHistorySourceBackendId}`;
    }
    if (metadata.nativeHistorySourceTool === 'gemini' && metadata.nativeHistorySourceBackendId) {
        return `orbit gemini --resume ${metadata.nativeHistorySourceBackendId}`;
    }
    return null;
}

function buildChangeDirectoryCommand(metadata: ResumeCommandMetadata): string | null {
    const path = metadata.path?.trim();
    if (!path) {
        return null;
    }

    return isWindows(metadata)
        ? `Set-Location -LiteralPath ${quotePowerShellPath(path)}`
        : `cd ${quotePosixPath(path)}`;
}

export function buildResumeCommandBlock(metadata: ResumeCommandMetadata): ResumeCommandBlock | null {
    const invocation = buildResumeInvocation(metadata);
    if (!invocation) {
        return null;
    }

    const changeDirectoryCommand = buildChangeDirectoryCommand(metadata);
    const lines = changeDirectoryCommand
        ? [changeDirectoryCommand, invocation]
        : [invocation];

    return {
        lines,
        copyText: lines.join('\n'),
    };
}

export function buildResumeCommand(metadata: ResumeCommandMetadata): string | null {
    const commandBlock = buildResumeCommandBlock(metadata);
    if (!commandBlock) {
        return null;
    }
    return commandBlock.lines.join(isWindows(metadata) ? '; ' : ' && ');
}
