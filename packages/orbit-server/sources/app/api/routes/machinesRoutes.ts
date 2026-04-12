import { eventRouter } from "@/app/events/eventRouter";
import { Fastify } from "../types";
import { z } from "zod";
import { db } from "@/storage/db";
import { log } from "@/utils/log";
import { randomKeyNaked } from "@/utils/randomKeyNaked";
import { allocateUserSeq } from "@/storage/seq";
import { buildNewMachineUpdate, buildUpdateMachineUpdate } from "@/app/events/eventRouter";
import {
    backfillMachineForAccount,
    createMachineForAccount,
    findMachineById,
    findMachineForAccount,
    listMachinesForAccount,
    machineRowToApiMachine,
    machineRowToEventMachine,
    reassignMachineToAccount,
    syncMachineRegistrationForAccount
} from "@/app/data/machineStore";

export function machinesRoutes(app: Fastify) {
    app.post('/v1/machines', {
        preHandler: app.authenticate,
        schema: {
            body: z.object({
                id: z.string(),
                metadata: z.string(), // Encrypted metadata
                daemonState: z.string().optional(), // Encrypted daemon state
                dataEncryptionKey: z.string().nullish()
            })
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { id, metadata, daemonState, dataEncryptionKey } = request.body;

        // Check if machine exists (like sessions do)
        const machine = await findMachineForAccount(userId, id);

        if (machine) {
            // Machine exists - always sync the latest registration payload so the
            // mobile client and daemon stay on the same encryption scheme.
            const needsEncryptionBackfill = !machine.dataEncryptionKeyBase64 && !!dataEncryptionKey;
            const resolvedMachine = needsEncryptionBackfill
                ? await backfillMachineForAccount({
                    accountId: userId,
                    machineId: machine.id,
                    metadata,
                    daemonState: daemonState || null,
                    dataEncryptionKeyBase64: dataEncryptionKey ?? null
                }) ?? machine
                : await syncMachineRegistrationForAccount({
                    accountId: userId,
                    machineId: machine.id,
                    metadata,
                    daemonState: daemonState || null,
                    dataEncryptionKeyBase64: dataEncryptionKey ?? null
                }) ?? machine;

            log({ module: 'machines', machineId: id, userId }, 'Updated existing machine registration');

            const updateSeq = await allocateUserSeq(userId);
            const payload = buildNewMachineUpdate(machineRowToEventMachine(resolvedMachine), updateSeq, randomKeyNaked(12));
            eventRouter.emitUpdate({
                userId,
                payload,
                recipientFilter: { type: 'user-scoped-only' }
            });

            return reply.send({
                machine: machineRowToApiMachine(resolvedMachine)
            });
        } else {
            const existingMachine = await findMachineById(id);
            if (existingMachine && existingMachine.accountId !== userId) {
                log(
                    {
                        module: 'machines',
                        machineId: id,
                        fromAccountId: existingMachine.accountId,
                        toAccountId: userId
                    },
                    'Reassigning existing machine to the current account'
                );

                const reassignedMachine = await reassignMachineToAccount({
                    fromAccountId: existingMachine.accountId,
                    toAccountId: userId,
                    machineId: id,
                    metadata,
                    daemonState: daemonState || null,
                    dataEncryptionKeyBase64: dataEncryptionKey ?? null
                });

                if (!reassignedMachine) {
                    return reply.code(409).send({ error: 'Machine reassignment failed' });
                }

                const updateSeq = await allocateUserSeq(userId);
                const payload = buildNewMachineUpdate(machineRowToEventMachine(reassignedMachine), updateSeq, randomKeyNaked(12));
                eventRouter.emitUpdate({
                    userId,
                    payload,
                    recipientFilter: { type: 'user-scoped-only' }
                });

                return reply.send({
                    machine: machineRowToApiMachine(reassignedMachine)
                });
            }

            // Create new machine
            log({ module: 'machines', machineId: id, userId }, 'Creating new machine');

            const newMachine = await createMachineForAccount({
                accountId: userId,
                machineId: id,
                metadata,
                daemonState: daemonState || null,
                dataEncryptionKeyBase64: dataEncryptionKey ?? null
            });

            // Emit both new-machine and update-machine events for backward compatibility
            const updSeq1 = await allocateUserSeq(userId);
            const updSeq2 = await allocateUserSeq(userId);
            
            // Emit new-machine event with all data including dataEncryptionKey
            const newMachinePayload = buildNewMachineUpdate(machineRowToEventMachine(newMachine), updSeq1, randomKeyNaked(12));
            eventRouter.emitUpdate({
                userId,
                payload: newMachinePayload,
                recipientFilter: { type: 'user-scoped-only' }
            });

            // Emit update-machine event for backward compatibility (without dataEncryptionKey)
            const machineMetadata = {
                version: 1,
                value: metadata
            };
            const updatePayload = buildUpdateMachineUpdate(newMachine.id, updSeq2, randomKeyNaked(12), machineMetadata);
            eventRouter.emitUpdate({
                userId,
                payload: updatePayload,
                recipientFilter: { type: 'machine-scoped-only', machineId: newMachine.id }
            });

            return reply.send({
                machine: machineRowToApiMachine(newMachine)
            });
        }
    });


    // Machines API
    app.get('/v1/machines', {
        preHandler: app.authenticate,
    }, async (request, reply) => {
        const userId = request.userId;

        const machines = await listMachinesForAccount(userId);

        return machines.map(machineRowToApiMachine);
    });

    // GET /v1/machines/:id - Get single machine by ID
    app.get('/v1/machines/:id', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({
                id: z.string()
            })
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { id } = request.params;

        const machine = await findMachineForAccount(userId, id);

        if (!machine) {
            return reply.code(404).send({ error: 'Machine not found' });
        }

        return {
            machine: machineRowToApiMachine(machine)
        };
    });

}
