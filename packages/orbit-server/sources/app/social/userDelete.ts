import { db } from "@/storage/db";
import { Context } from "@/context";
import { log } from "@/utils/log";

/**
 * Delete a user account and all associated data
 *
 * This function performs a cascading delete of all user data including:
 * - Account record (main user record)
 * - All sessions and usage data
 * - All friend relationships (both directions)
 * - All service account tokens
 * - All machine associations
 *
 * The operation is wrapped in a transaction to ensure data consistency.
 * WARNING: This operation is irreversible!
 */
export async function userDelete(context: Context): Promise<void> {
    const userId = context.uid;

    log({ module: 'userDelete', level: 'info' }, `Starting deletion of user account: ${userId}`);

    await db.$transaction(async (tx) => {
        const account = await tx.account.findUnique({
            where: { id: userId },
            select: { githubUserId: true },
        });

        await tx.accessKey.deleteMany({
            where: { accountId: userId }
        });

        await tx.usageReport.deleteMany({
            where: { accountId: userId }
        });

        await tx.sessionMessage.deleteMany({
            where: {
                session: {
                    is: {
                        accountId: userId,
                    },
                },
            },
        });

        await tx.session.deleteMany({
            where: { accountId: userId }
        });

        await tx.accountPushToken.deleteMany({
            where: { accountId: userId }
        });

        await tx.serviceAccountToken.deleteMany({
            where: { accountId: userId }
        });

        await tx.machine.deleteMany({
            where: { accountId: userId }
        });

        await tx.uploadedFile.deleteMany({
            where: { accountId: userId }
        });

        await tx.artifact.deleteMany({
            where: { accountId: userId }
        });

        await tx.userKVStore.deleteMany({
            where: { accountId: userId }
        });

        await tx.voiceConversation.deleteMany({
            where: { accountId: userId }
        });

        await tx.userFeedItem.deleteMany({
            where: { userId }
        });

        await tx.userRelationship.deleteMany({
            where: {
                OR: [
                    { fromUserId: userId },
                    { toUserId: userId }
                ]
            }
        });

        await tx.accountAuthRequest.deleteMany({
            where: { responseAccountId: userId }
        });

        await tx.terminalAuthRequest.deleteMany({
            where: { responseAccountId: userId }
        });

        await tx.account.delete({
            where: { id: userId }
        });

        if (account?.githubUserId) {
            await tx.githubUser.delete({
                where: { id: account.githubUserId }
            });
        }

        log({ module: 'userDelete', level: 'info' }, `Successfully deleted user account: ${userId}`);
    });
}
