import { describe, expect, it } from 'vitest';

import { buildComposerDisplayText, buildMessageWithAttachments, type ComposerAttachmentPayload } from '@/utils/composerAttachments';

const attachment = (name: string, text: string): ComposerAttachmentPayload => ({
    kind: 'file',
    name,
    text,
});

describe('buildMessageWithAttachments', () => {
    it('returns plain prompt when no attachments are present', () => {
        expect(buildMessageWithAttachments('hello world', [])).toBe('hello world');
    });

    it('appends attachment blocks after the prompt', () => {
        expect(buildMessageWithAttachments('please review', [
            attachment('foo.ts', 'const a = 1;'),
            attachment('bar.md', '# Notes'),
        ])).toBe(
            'please review\n\n<attached_file name="foo.ts">\nconst a = 1;\n</attached_file>\n\n<attached_file name="bar.md">\n# Notes\n</attached_file>',
        );
    });

    it('supports attachment-only sends', () => {
        expect(buildMessageWithAttachments('', [
            attachment('foo.ts', 'const a = 1;'),
        ])).toBe('<attached_file name="foo.ts">\nconst a = 1;\n</attached_file>');
    });

    it('serializes image attachments as image tags', () => {
        expect(buildMessageWithAttachments('look at this', [{
            kind: 'image',
            name: 'photo.png',
            mimeType: 'image/png',
            width: 800,
            height: 600,
        }])).toBe(
            'look at this\n\n<attached_image name="photo.png" mimeType="image/png" width="800" height="600" />',
        );
    });

    it('builds display text with prompt and attachment names', () => {
        expect(buildComposerDisplayText('look at this', [
            attachment('report.md', '# Report'),
            { kind: 'image', name: 'photo.png' },
        ])).toBe('look at this\n\nreport.md · photo.png');
    });
});
