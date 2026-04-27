import { beforeEach, describe, expect, it, vi } from "vitest";

const {
    findAccountMock,
    deleteManyAccessKeyMock,
    deleteManySessionMock,
    deleteManyUsageReportMock,
    deleteManySessionMessageMock,
    deleteManyAccountPushTokenMock,
    deleteManyRelationshipMock,
    deleteManyServiceTokenMock,
    deleteManyMachineMock,
    deleteManyUploadedFileMock,
    deleteManyArtifactMock,
    deleteManyUserKvStoreMock,
    deleteManyVoiceConversationMock,
    deleteManyUserFeedItemMock,
    deleteManyAccountAuthRequestMock,
    deleteManyTerminalAuthRequestMock,
    deleteAccountMock,
    deleteGithubUserMock,
    transactionMock,
    operationOrder,
} = vi.hoisted(() => {
    const operationOrder: string[] = [];

    const findAccountMock = vi.fn(async () => {
        operationOrder.push("account.findUnique");
        return { githubUserId: "github-user-123" };
    });
    const deleteManyAccessKeyMock = vi.fn(async () => {
        operationOrder.push("accessKey.deleteMany");
    });
    const deleteManySessionMock = vi.fn();
    const deleteManyUsageReportMock = vi.fn();
    const deleteManySessionMessageMock = vi.fn(async () => {
        operationOrder.push("sessionMessage.deleteMany");
    });
    const deleteManyAccountPushTokenMock = vi.fn(async () => {
        operationOrder.push("accountPushToken.deleteMany");
    });
    const deleteManyRelationshipMock = vi.fn();
    const deleteManyServiceTokenMock = vi.fn();
    const deleteManyMachineMock = vi.fn();
    const deleteManyUploadedFileMock = vi.fn(async () => {
        operationOrder.push("uploadedFile.deleteMany");
    });
    const deleteManyArtifactMock = vi.fn(async () => {
        operationOrder.push("artifact.deleteMany");
    });
    const deleteManyUserKvStoreMock = vi.fn(async () => {
        operationOrder.push("userKVStore.deleteMany");
    });
    const deleteManyVoiceConversationMock = vi.fn(async () => {
        operationOrder.push("voiceConversation.deleteMany");
    });
    const deleteManyUserFeedItemMock = vi.fn(async () => {
        operationOrder.push("userFeedItem.deleteMany");
    });
    const deleteManyAccountAuthRequestMock = vi.fn(async () => {
        operationOrder.push("accountAuthRequest.deleteMany");
    });
    const deleteManyTerminalAuthRequestMock = vi.fn(async () => {
        operationOrder.push("terminalAuthRequest.deleteMany");
    });
    const deleteAccountMock = vi.fn();
    const deleteGithubUserMock = vi.fn(async () => {
        operationOrder.push("githubUser.delete");
    });

    deleteManySessionMock.mockImplementation(async () => {
        operationOrder.push("session.deleteMany");
    });
    deleteManyUsageReportMock.mockImplementation(async () => {
        operationOrder.push("usageReport.deleteMany");
    });
    deleteManyRelationshipMock.mockImplementation(async () => {
        operationOrder.push("userRelationship.deleteMany");
    });
    deleteManyServiceTokenMock.mockImplementation(async () => {
        operationOrder.push("serviceAccountToken.deleteMany");
    });
    deleteManyMachineMock.mockImplementation(async () => {
        operationOrder.push("machine.deleteMany");
    });
    deleteAccountMock.mockImplementation(async () => {
        operationOrder.push("account.delete");
    });

    const txClient = {
        accessKey: {
            deleteMany: deleteManyAccessKeyMock,
        },
        session: {
            deleteMany: deleteManySessionMock,
        },
        sessionMessage: {
            deleteMany: deleteManySessionMessageMock,
        },
        usageReport: {
            deleteMany: deleteManyUsageReportMock,
        },
        accountPushToken: {
            deleteMany: deleteManyAccountPushTokenMock,
        },
        userRelationship: {
            deleteMany: deleteManyRelationshipMock,
        },
        serviceAccountToken: {
            deleteMany: deleteManyServiceTokenMock,
        },
        machine: {
            deleteMany: deleteManyMachineMock,
        },
        uploadedFile: {
            deleteMany: deleteManyUploadedFileMock,
        },
        artifact: {
            deleteMany: deleteManyArtifactMock,
        },
        userKVStore: {
            deleteMany: deleteManyUserKvStoreMock,
        },
        voiceConversation: {
            deleteMany: deleteManyVoiceConversationMock,
        },
        userFeedItem: {
            deleteMany: deleteManyUserFeedItemMock,
        },
        accountAuthRequest: {
            deleteMany: deleteManyAccountAuthRequestMock,
        },
        terminalAuthRequest: {
            deleteMany: deleteManyTerminalAuthRequestMock,
        },
        githubUser: {
            delete: deleteGithubUserMock,
        },
        account: {
            findUnique: findAccountMock,
            delete: deleteAccountMock,
        },
    };

    const transactionMock = vi.fn(async (callback: (tx: typeof txClient) => Promise<void>) => callback(txClient));

    return {
        findAccountMock,
        deleteManyAccessKeyMock,
        deleteManySessionMock,
        deleteManyUsageReportMock,
        deleteManySessionMessageMock,
        deleteManyAccountPushTokenMock,
        deleteManyRelationshipMock,
        deleteManyServiceTokenMock,
        deleteManyMachineMock,
        deleteManyUploadedFileMock,
        deleteManyArtifactMock,
        deleteManyUserKvStoreMock,
        deleteManyVoiceConversationMock,
        deleteManyUserFeedItemMock,
        deleteManyAccountAuthRequestMock,
        deleteManyTerminalAuthRequestMock,
        deleteAccountMock,
        deleteGithubUserMock,
        transactionMock,
        operationOrder,
    };
});

vi.mock("@/storage/db", () => ({
    db: {
        $transaction: transactionMock,
    },
}));

vi.mock("@/utils/log", () => ({
    log: vi.fn(),
}));

import { Context } from "@/context";
import { userDelete } from "./userDelete";

describe("userDelete", () => {
    beforeEach(() => {
        operationOrder.length = 0;
        findAccountMock.mockClear();
        deleteManyAccessKeyMock.mockClear();
        deleteManySessionMock.mockClear();
        deleteManyUsageReportMock.mockClear();
        deleteManySessionMessageMock.mockClear();
        deleteManyAccountPushTokenMock.mockClear();
        deleteManyRelationshipMock.mockClear();
        deleteManyServiceTokenMock.mockClear();
        deleteManyMachineMock.mockClear();
        deleteManyUploadedFileMock.mockClear();
        deleteManyArtifactMock.mockClear();
        deleteManyUserKvStoreMock.mockClear();
        deleteManyVoiceConversationMock.mockClear();
        deleteManyUserFeedItemMock.mockClear();
        deleteManyAccountAuthRequestMock.mockClear();
        deleteManyTerminalAuthRequestMock.mockClear();
        deleteAccountMock.mockClear();
        deleteGithubUserMock.mockClear();
        transactionMock.mockClear();
    });

    it("deletes all user-owned records using the context uid", async () => {
        await userDelete(Context.create("user-123"));

        expect(transactionMock).toHaveBeenCalledTimes(1);
        expect(findAccountMock).toHaveBeenCalledWith({
            where: { id: "user-123" },
            select: { githubUserId: true },
        });
        expect(deleteManyAccessKeyMock).toHaveBeenCalledWith({
            where: { accountId: "user-123" },
        });
        expect(deleteManySessionMock).toHaveBeenCalledWith({
            where: { accountId: "user-123" },
        });
        expect(deleteManyUsageReportMock).toHaveBeenCalledWith({
            where: { accountId: "user-123" },
        });
        expect(deleteManySessionMessageMock).toHaveBeenCalledWith({
            where: {
                session: {
                    is: {
                        accountId: "user-123",
                    },
                },
            },
        });
        expect(deleteManyAccountPushTokenMock).toHaveBeenCalledWith({
            where: { accountId: "user-123" },
        });
        expect(deleteManyRelationshipMock).toHaveBeenCalledWith({
            where: {
                OR: [
                    { fromUserId: "user-123" },
                    { toUserId: "user-123" },
                ],
            },
        });
        expect(deleteManyServiceTokenMock).toHaveBeenCalledWith({
            where: { accountId: "user-123" },
        });
        expect(deleteManyMachineMock).toHaveBeenCalledWith({
            where: { accountId: "user-123" },
        });
        expect(deleteManyUploadedFileMock).toHaveBeenCalledWith({
            where: { accountId: "user-123" },
        });
        expect(deleteManyArtifactMock).toHaveBeenCalledWith({
            where: { accountId: "user-123" },
        });
        expect(deleteManyUserKvStoreMock).toHaveBeenCalledWith({
            where: { accountId: "user-123" },
        });
        expect(deleteManyVoiceConversationMock).toHaveBeenCalledWith({
            where: { accountId: "user-123" },
        });
        expect(deleteManyUserFeedItemMock).toHaveBeenCalledWith({
            where: { userId: "user-123" },
        });
        expect(deleteManyAccountAuthRequestMock).toHaveBeenCalledWith({
            where: { responseAccountId: "user-123" },
        });
        expect(deleteManyTerminalAuthRequestMock).toHaveBeenCalledWith({
            where: { responseAccountId: "user-123" },
        });
        expect(deleteAccountMock).toHaveBeenCalledWith({
            where: { id: "user-123" },
        });
        expect(deleteGithubUserMock).toHaveBeenCalledWith({
            where: { id: "github-user-123" },
        });
        expect(operationOrder).toEqual([
            "account.findUnique",
            "accessKey.deleteMany",
            "usageReport.deleteMany",
            "sessionMessage.deleteMany",
            "session.deleteMany",
            "accountPushToken.deleteMany",
            "serviceAccountToken.deleteMany",
            "machine.deleteMany",
            "uploadedFile.deleteMany",
            "artifact.deleteMany",
            "userKVStore.deleteMany",
            "voiceConversation.deleteMany",
            "userFeedItem.deleteMany",
            "userRelationship.deleteMany",
            "accountAuthRequest.deleteMany",
            "terminalAuthRequest.deleteMany",
            "account.delete",
            "githubUser.delete",
        ]);
    });
});
