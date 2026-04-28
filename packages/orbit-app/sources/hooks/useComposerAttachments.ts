import * as React from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';

import { decodeBase64, decodeBase64Text } from '@/encryption/base64';
import { Modal } from '@/modal';
import { t } from '@/text';
import { buildMessageWithAttachments } from '@/utils/composerAttachments';

export interface ComposerAttachment {
    id: string;
    kind: 'file' | 'image';
    name: string;
    size: number;
    mimeType: string | null;
    text?: string;
    width?: number | null;
    height?: number | null;
}

const MAX_ATTACHMENT_BYTES = 200 * 1024;

function createAttachmentId(asset: { name: string; size?: number; lastModified?: number; uri: string }): string {
    return [asset.name, asset.size ?? 0, asset.lastModified ?? 0, asset.uri].join(':');
}

function isProbablyBinary(bytes: Uint8Array): boolean {
    if (bytes.length === 0) {
        return false;
    }

    let suspiciousCount = 0;
    for (const byte of bytes) {
        if (byte === 0) {
            return true;
        }
        if (byte < 7 || (byte > 14 && byte < 32)) {
            suspiciousCount += 1;
        }
    }

    return suspiciousCount / bytes.length > 0.1;
}

async function readAttachmentBase64(asset: DocumentPicker.DocumentPickerAsset): Promise<string> {
    if (asset.base64) {
        return asset.base64;
    }

    return FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
    });
}

export function useComposerAttachments() {
    const [attachments, setAttachments] = React.useState<ComposerAttachment[]>([]);

    const mergeAttachments = React.useCallback((nextAttachments: ComposerAttachment[]) => {
        if (nextAttachments.length === 0) {
            return;
        }

        setAttachments((current) => {
            const merged = [...current];
            for (const attachment of nextAttachments) {
                if (!merged.some((currentAttachment) => currentAttachment.id === attachment.id)) {
                    merged.push(attachment);
                }
            }
            return merged;
        });
    }, []);

    const removeAttachment = React.useCallback((attachmentId: string) => {
        setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
    }, []);

    const clearAttachments = React.useCallback(() => {
        setAttachments([]);
    }, []);

    const pickFileAttachments = React.useCallback(async () => {
        const result = await DocumentPicker.getDocumentAsync({
            multiple: true,
            copyToCacheDirectory: true,
        });

        if (result.canceled || !result.assets?.length) {
            return;
        }

        const nextAttachments: ComposerAttachment[] = [];
        const rejected: string[] = [];

        for (const asset of result.assets) {
            try {
                const size = asset.size ?? 0;
                if (size > MAX_ATTACHMENT_BYTES) {
                    rejected.push(`${asset.name}: file is too large`);
                    continue;
                }

                const base64 = await readAttachmentBase64(asset);
                const bytes = decodeBase64(base64, 'base64');
                if (isProbablyBinary(bytes)) {
                    rejected.push(`${asset.name}: binary files are not supported yet`);
                    continue;
                }

                const text = decodeBase64Text(base64, 'base64');
                nextAttachments.push({
                    id: createAttachmentId(asset),
                    kind: 'file',
                    name: asset.name,
                    size,
                    mimeType: asset.mimeType ?? null,
                    text,
                });
            } catch (error) {
                console.warn('Failed to attach file', asset.name, error);
                rejected.push(`${asset.name}: couldn't read this file`);
            }
        }

        mergeAttachments(nextAttachments);

        if (rejected.length > 0) {
            Modal.alert(t('common.error'), rejected.join('\n'));
        }
    }, [mergeAttachments]);

    const pickImageAttachments = React.useCallback(async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: false,
                allowsMultipleSelection: true,
                quality: 1,
            });

            if (result.canceled || !result.assets?.length) {
                return;
            }

            const nextAttachments = result.assets.map((asset, index) => {
                const name = asset.fileName?.trim()
                    || `image-${Date.now()}-${index + 1}.${asset.mimeType?.split('/')[1] ?? 'jpg'}`;

                return {
                    id: createAttachmentId({
                        name,
                        size: asset.fileSize ?? 0,
                        uri: asset.uri,
                    }),
                    kind: 'image' as const,
                    name,
                    size: asset.fileSize ?? 0,
                    mimeType: asset.mimeType ?? null,
                    width: asset.width ?? null,
                    height: asset.height ?? null,
                } satisfies ComposerAttachment;
            });

            mergeAttachments(nextAttachments);
        } catch (error) {
            console.warn('Failed to attach image', error);
            Modal.alert(t('common.error'), "Couldn't open image library");
        }
    }, [mergeAttachments]);

    return {
        attachments,
        buildMessageWithAttachments,
        clearAttachments,
        pickFileAttachments,
        pickImageAttachments,
        removeAttachment,
    };
}
