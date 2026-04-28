import { logger } from "@/ui/logger";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getProjectPath } from "./path";

const RECOVERED_TOOL_USE_NAME = 'UnknownTool';

function repairInvalidToolUseNames(sessionFile: string): number {
    const sessionData = readFileSync(sessionFile, 'utf-8');
    const sessionLines = sessionData.split('\n');
    let repairedCount = 0;

    const repairedLines = sessionLines.map((line) => {
        if (!line.trim()) {
            return line;
        }

        try {
            const parsed = JSON.parse(line) as Record<string, unknown>;
            const message = parsed.message;

            if (!message || typeof message !== 'object') {
                return line;
            }

            const typedMessage = message as Record<string, unknown>;
            const content = typedMessage.content;
            if (!Array.isArray(content)) {
                return line;
            }

            let repairedLine = false;
            const nextContent = content.map((part) => {
                if (!part || typeof part !== 'object') {
                    return part;
                }

                const typedPart = part as Record<string, unknown>;
                if (typedPart.type !== 'tool_use') {
                    return part;
                }

                const name = typedPart.name;
                if (typeof name === 'string' && name.trim().length === 0) {
                    repairedCount += 1;
                    repairedLine = true;
                    return {
                        ...typedPart,
                        name: RECOVERED_TOOL_USE_NAME,
                    };
                }

                return part;
            });

            if (!repairedLine) {
                return line;
            }

            return JSON.stringify({
                ...parsed,
                message: {
                    ...typedMessage,
                    content: nextContent,
                }
            });
        } catch {
            return line;
        }
    });

    if (repairedCount > 0) {
        writeFileSync(sessionFile, repairedLines.join('\n'));
    }

    return repairedCount;
}

export function claudeCheckSession(sessionId: string, path: string) {
    const projectDir = getProjectPath(path);

    // Check if session id is in the project dir
    const sessionFile = join(projectDir, `${sessionId}.jsonl`);
    const sessionExists = existsSync(sessionFile);
    if (!sessionExists) {
        logger.debug(`[claudeCheckSession] Path ${sessionFile} does not exist`);
        return false;
    }

    const repairedCount = repairInvalidToolUseNames(sessionFile);
    if (repairedCount > 0) {
        logger.debug(`[claudeCheckSession] Repaired ${repairedCount} empty tool name(s) in session ${sessionId}`);
    }

    // Check if session contains any messages with valid ID fields
    const sessionData = readFileSync(sessionFile, 'utf-8').split('\n');

    const hasGoodMessage = !!sessionData.find((v, index) => {
        if (!v.trim()) return false;  // Skip empty lines silently (not errors)

        try {
            const parsed = JSON.parse(v);
            // Accept sessions with any of these ID fields (different Claude Code versions)
            // Check for non-empty strings to handle edge cases robustly
            return (typeof parsed.uuid === 'string' && parsed.uuid.length > 0) ||        // Claude Code 2.1.x
                   (typeof parsed.messageId === 'string' && parsed.messageId.length > 0) ||   // Older Claude Code
                   (typeof parsed.leafUuid === 'string' && parsed.leafUuid.length > 0);      // Summary lines
        } catch (e) {
            // Log parse errors for debugging (following project convention)
            logger.debug(`[claudeCheckSession] Malformed JSON at line ${index + 1}:`, e);
            return false;
        }
    });

    // Log final validation result for observability
    logger.debug(`[claudeCheckSession] Session ${sessionId}: ${hasGoodMessage ? 'valid' : 'invalid'}`);

    return hasGoodMessage;
}
