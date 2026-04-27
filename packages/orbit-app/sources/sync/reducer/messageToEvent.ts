/**
 * Message to Event Parser
 * 
 * This module provides functionality to parse certain messages and convert them
 * to events. Messages that match specific patterns can be transformed into events
 * which will skip normal message processing phases and be handled as events instead.
 */

import { NormalizedMessage } from "../typesRaw";
import { AgentEvent } from "../typesRaw";

/**
 * Parses a normalized message to determine if it should be converted to an event.
 * 
 * @param msg - The normalized message to parse
 * @returns An AgentEvent if the message should be converted, null otherwise
 * 
 * Examples of messages that could be converted to events:
 * - User messages with special commands (e.g., "/switch mode")
 * - Agent messages with specific tool results
 * - Messages with certain metadata flags
 */
export function parseMessageAsEvent(msg: NormalizedMessage): AgentEvent | null {
    // Skip sidechain messages
    if (msg.isSidechain) {
        return null;
    }

    // Check for agent messages that should become events
    if (msg.role === 'agent') {
        for (const content of msg.content) {
            // Check for Claude AI usage limit messages
            if (content.type === 'text') {
                const usageLimitEvent = parseUsageLimitText(content.text, msg.createdAt);
                if (usageLimitEvent) {
                    return usageLimitEvent;
                }
            }
            
            // Check for Orbit title-change tool calls.
            if (
                content.type === 'tool-call'
                && content.name === 'mcp__orbit__change_title'
            ) {
                const title = content.input?.title;
                if (typeof title === 'string') {
                    return {
                        type: 'message',
                        message: `Title changed to "${title}"`,
                    } as AgentEvent;
                }
            }

            // Check for EnterPlanMode tool calls
            if (content.type === 'tool-call' && (content.name === 'EnterPlanMode' || content.name === 'enter_plan_mode')) {
                return {
                    type: 'message',
                    message: 'Entering plan mode',
                } as AgentEvent;
            }
        }
    }

    // Additional parsing logic can be added here
    // For example, checking specific metadata patterns or other message types

    // No event conversion needed
    return null;
}

/**
 * Checks if a message should be excluded from normal processing
 * after being converted to an event.
 * 
 * @param msg - The normalized message to check
 * @returns true if the message should skip normal processing
 */
export function shouldSkipNormalProcessing(msg: NormalizedMessage): boolean {
    // If a message converts to an event, it should skip normal processing
    return parseMessageAsEvent(msg) !== null;
}

function parseUsageLimitText(text: string, messageCreatedAt: number): AgentEvent | null {
    const claudeLimitMatch = text.match(/^Claude AI usage limit reached\|(\d+)$/);
    if (claudeLimitMatch) {
        const timestamp = parseInt(claudeLimitMatch[1], 10);
        if (!Number.isNaN(timestamp)) {
            return {
                type: 'limit-reached',
                endsAt: timestamp,
            };
        }
    }

    if (!/^(You've|You have) hit your usage limit\./i.test(text.trim())) {
        return null;
    }

    const retryAt = parseRetryAtTimestamp(text, messageCreatedAt);
    if (retryAt !== null) {
        return {
            type: 'limit-reached',
            endsAt: retryAt,
        };
    }

    return {
        type: 'message',
        message: 'Usage limit reached. Please try again later.',
    };
}

function parseRetryAtTimestamp(text: string, messageCreatedAt: number): number | null {
    const match = text.match(/try again at\s+(\d{1,2}):(\d{2})\s*([AP]M)/i);
    if (!match) {
        return null;
    }

    const hour12 = parseInt(match[1], 10);
    const minute = parseInt(match[2], 10);
    const meridiem = match[3].toUpperCase();
    if (hour12 < 1 || hour12 > 12 || minute < 0 || minute > 59) {
        return null;
    }

    const createdAtMs = messageCreatedAt > 1_000_000_000_000
        ? messageCreatedAt
        : messageCreatedAt * 1000;
    const retryAt = new Date(createdAtMs);
    const hour24 = (hour12 % 12) + (meridiem === 'PM' ? 12 : 0);
    retryAt.setHours(hour24, minute, 0, 0);

    if (retryAt.getTime() < createdAtMs - 60_000) {
        retryAt.setDate(retryAt.getDate() + 1);
    }

    return Math.floor(retryAt.getTime() / 1000);
}
