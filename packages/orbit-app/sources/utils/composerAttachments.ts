export interface ComposerAttachmentPayload {
    kind: 'file' | 'image';
    name: string;
    text?: string;
    mimeType?: string | null;
    width?: number | null;
    height?: number | null;
}

function escapeAttribute(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('"', '&quot;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}

export function buildMessageWithAttachments(
    prompt: string,
    attachments: ComposerAttachmentPayload[],
): string {
    const trimmedPrompt = prompt.trim();
    if (attachments.length === 0) {
        return trimmedPrompt;
    }

    const attachmentBlocks = attachments.map((attachment) => {
        if (attachment.kind === 'image') {
            const attributes = [
                `name="${escapeAttribute(attachment.name)}"`,
                attachment.mimeType ? `mimeType="${escapeAttribute(attachment.mimeType)}"` : null,
                attachment.width ? `width="${attachment.width}"` : null,
                attachment.height ? `height="${attachment.height}"` : null,
            ].filter(Boolean).join(' ');

            return `<attached_image ${attributes} />`;
        }

        return `<attached_file name="${escapeAttribute(attachment.name)}">\n${attachment.text ?? ''}\n</attached_file>`;
    });

    return [trimmedPrompt, ...attachmentBlocks].filter(Boolean).join('\n\n');
}

export function buildComposerDisplayText(
    prompt: string,
    attachments: ComposerAttachmentPayload[],
): string {
    const trimmedPrompt = prompt.trim();
    const attachmentSummary = attachments.map((attachment) => attachment.name).join(' · ');

    if (trimmedPrompt && !attachmentSummary) {
        return trimmedPrompt;
    }

    return [trimmedPrompt, attachmentSummary].filter(Boolean).join('\n\n');
}
