import * as z from 'zod';
import { sessionEnvelopeSchema } from './sessionProtocol';
import { MessageMetaSchema, type MessageMeta } from './messageMeta';
import { AgentMessageSchema, UserMessageSchema } from './legacyProtocol';

export const SessionMessageContentSchema = z.object({
  c: z.string(),
  t: z.literal('encrypted'),
});
export type SessionMessageContent = z.infer<typeof SessionMessageContentSchema>;

export const SessionMessageSchema = z.object({
  id: z.string(),
  seq: z.number(),
  localId: z.string().nullish(),
  content: SessionMessageContentSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type SessionMessage = z.infer<typeof SessionMessageSchema>;
export { MessageMetaSchema };
export type { MessageMeta };

export const SessionProtocolMessageSchema = z.object({
  role: z.literal('session'),
  content: sessionEnvelopeSchema,
  meta: MessageMetaSchema.optional(),
});
export type SessionProtocolMessage = z.infer<typeof SessionProtocolMessageSchema>;

export const MessageContentSchema = z.discriminatedUnion('role', [
  UserMessageSchema,
  AgentMessageSchema,
  SessionProtocolMessageSchema,
]);
export type MessageContent = z.infer<typeof MessageContentSchema>;

export const VersionedEncryptedValueSchema = z.object({
  version: z.number(),
  value: z.string(),
});
export type VersionedEncryptedValue = z.infer<typeof VersionedEncryptedValueSchema>;

export const VersionedNullableEncryptedValueSchema = z.object({
  version: z.number(),
  value: z.string().nullable(),
});
export type VersionedNullableEncryptedValue = z.infer<typeof VersionedNullableEncryptedValueSchema>;

export const UpdateNewMessageBodySchema = z.object({
  t: z.literal('new-message'),
  sid: z.string(),
  message: SessionMessageSchema,
});
export type UpdateNewMessageBody = z.infer<typeof UpdateNewMessageBodySchema>;

export const UpdateSessionBodySchema = z.object({
  t: z.literal('update-session'),
  id: z.string(),
  metadata: VersionedEncryptedValueSchema.nullish(),
  agentState: VersionedNullableEncryptedValueSchema.nullish(),
});
export type UpdateSessionBody = z.infer<typeof UpdateSessionBodySchema>;

export const UpdateNewSessionBodySchema = z.object({
  t: z.literal('new-session'),
  id: z.string(),
  seq: z.number(),
  metadata: z.string(),
  metadataVersion: z.number(),
  agentState: z.string().nullable(),
  agentStateVersion: z.number(),
  dataEncryptionKey: z.string().nullable(),
  active: z.boolean(),
  activeAt: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type UpdateNewSessionBody = z.infer<typeof UpdateNewSessionBodySchema>;

export const DeleteSessionBodySchema = z.object({
  t: z.literal('delete-session'),
  sid: z.string(),
});
export type DeleteSessionBody = z.infer<typeof DeleteSessionBodySchema>;

export const VersionedMachineEncryptedValueSchema = z.object({
  version: z.number(),
  value: z.string(),
});
export type VersionedMachineEncryptedValue = z.infer<typeof VersionedMachineEncryptedValueSchema>;

export const UpdateMachineBodySchema = z.object({
  t: z.literal('update-machine'),
  machineId: z.string(),
  metadata: VersionedMachineEncryptedValueSchema.nullish(),
  daemonState: VersionedMachineEncryptedValueSchema.nullish(),
  active: z.boolean().optional(),
  activeAt: z.number().optional(),
});
export type UpdateMachineBody = z.infer<typeof UpdateMachineBodySchema>;

export const UpdateNewMachineBodySchema = z.object({
  t: z.literal('new-machine'),
  machineId: z.string(),
  seq: z.number(),
  metadata: z.string(),
  metadataVersion: z.number(),
  daemonState: z.string().nullable(),
  daemonStateVersion: z.number(),
  dataEncryptionKey: z.string().nullable(),
  active: z.boolean(),
  activeAt: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type UpdateNewMachineBody = z.infer<typeof UpdateNewMachineBodySchema>;

export const UpdateAccountBodySchema = z.object({
  t: z.literal('update-account'),
  id: z.string(),
  settings: z.object({
    value: z.string().nullish(),
    version: z.number(),
  }).nullish(),
  firstName: z.string().nullish(),
  lastName: z.string().nullish(),
  username: z.string().nullable().optional(),
  avatar: z.object({
    width: z.number(),
    height: z.number(),
    thumbhash: z.string(),
    path: z.string(),
    url: z.string(),
  }).nullish(),
  github: z.object({
    id: z.number(),
    login: z.string(),
    name: z.string(),
    avatar_url: z.string(),
    email: z.string().optional(),
    bio: z.string().nullable(),
  }).nullish(),
});
export type UpdateAccountBody = z.infer<typeof UpdateAccountBodySchema>;

export const KvBatchUpdateBodySchema = z.object({
  t: z.literal('kv-batch-update'),
  changes: z.array(z.object({
    key: z.string(),
    value: z.string().nullable(),
    version: z.number(),
  })),
});
export type KvBatchUpdateBody = z.infer<typeof KvBatchUpdateBodySchema>;

export const UpdateNewArtifactBodySchema = z.object({
  t: z.literal('new-artifact'),
  artifactId: z.string(),
  header: z.string(),
  headerVersion: z.number(),
  body: z.string().optional(),
  bodyVersion: z.number().optional(),
  dataEncryptionKey: z.string(),
  seq: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type UpdateNewArtifactBody = z.infer<typeof UpdateNewArtifactBodySchema>;

export const UpdateArtifactBodySchema = z.object({
  t: z.literal('update-artifact'),
  artifactId: z.string(),
  header: z.object({
    value: z.string(),
    version: z.number(),
  }).optional(),
  body: z.object({
    value: z.string(),
    version: z.number(),
  }).optional(),
});
export type UpdateArtifactBody = z.infer<typeof UpdateArtifactBodySchema>;

export const DeleteArtifactBodySchema = z.object({
  t: z.literal('delete-artifact'),
  artifactId: z.string(),
});
export type DeleteArtifactBody = z.infer<typeof DeleteArtifactBodySchema>;

export const RelationshipUpdatedBodySchema = z.object({
  t: z.literal('relationship-updated'),
  fromUserId: z.string(),
  toUserId: z.string(),
  status: z.enum(['none', 'requested', 'pending', 'friend', 'rejected']),
  action: z.enum(['created', 'updated', 'deleted']),
  fromUser: z.object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string().nullable(),
    avatar: z.object({
      path: z.string(),
      url: z.string(),
      width: z.number().optional(),
      height: z.number().optional(),
      thumbhash: z.string().optional(),
    }).nullable(),
    username: z.string(),
    bio: z.string().nullable(),
    status: z.enum(['none', 'requested', 'pending', 'friend', 'rejected']),
  }).optional(),
  toUser: z.object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string().nullable(),
    avatar: z.object({
      path: z.string(),
      url: z.string(),
      width: z.number().optional(),
      height: z.number().optional(),
      thumbhash: z.string().optional(),
    }).nullable(),
    username: z.string(),
    bio: z.string().nullable(),
    status: z.enum(['none', 'requested', 'pending', 'friend', 'rejected']),
  }).optional(),
  timestamp: z.number(),
});
export type RelationshipUpdatedBody = z.infer<typeof RelationshipUpdatedBodySchema>;

export const NewFeedPostBodySchema = z.object({
  t: z.literal('new-feed-post'),
  id: z.string(),
  body: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('friend_request'), uid: z.string() }),
    z.object({ kind: z.literal('friend_accepted'), uid: z.string() }),
    z.object({ kind: z.literal('text'), text: z.string() }),
  ]),
  cursor: z.string(),
  createdAt: z.number(),
  repeatKey: z.string().nullable().optional(),
});
export type NewFeedPostBody = z.infer<typeof NewFeedPostBodySchema>;

export const CoreUpdateBodySchema = z.discriminatedUnion('t', [
  UpdateNewMessageBodySchema,
  UpdateNewSessionBodySchema,
  DeleteSessionBodySchema,
  UpdateSessionBodySchema,
  UpdateAccountBodySchema,
  UpdateNewMachineBodySchema,
  UpdateMachineBodySchema,
  KvBatchUpdateBodySchema,
  UpdateNewArtifactBodySchema,
  UpdateArtifactBodySchema,
  DeleteArtifactBodySchema,
  RelationshipUpdatedBodySchema,
  NewFeedPostBodySchema,
]);
export type CoreUpdateBody = z.infer<typeof CoreUpdateBodySchema>;

export const CoreUpdateContainerSchema = z.object({
  id: z.string(),
  seq: z.number(),
  body: CoreUpdateBodySchema,
  createdAt: z.number(),
});
export type CoreUpdateContainer = z.infer<typeof CoreUpdateContainerSchema>;

// Aliases used by existing consumers during migration.
export const ApiMessageSchema = SessionMessageSchema;
export type ApiMessage = SessionMessage;

export const ApiUpdateNewMessageSchema = UpdateNewMessageBodySchema;
export type ApiUpdateNewMessage = UpdateNewMessageBody;

export const ApiUpdateNewSessionSchema = UpdateNewSessionBodySchema;
export type ApiUpdateNewSession = UpdateNewSessionBody;

export const ApiDeleteSessionSchema = DeleteSessionBodySchema;
export type ApiDeleteSession = DeleteSessionBody;

export const ApiUpdateSessionStateSchema = UpdateSessionBodySchema;
export type ApiUpdateSessionState = UpdateSessionBody;

export const ApiUpdateAccountSchema = UpdateAccountBodySchema;
export type ApiUpdateAccount = UpdateAccountBody;

export const ApiUpdateNewMachineSchema = UpdateNewMachineBodySchema;
export type ApiUpdateNewMachine = UpdateNewMachineBody;

export const ApiUpdateMachineStateSchema = UpdateMachineBodySchema;
export type ApiUpdateMachineState = UpdateMachineBody;

export const ApiKvBatchUpdateSchema = KvBatchUpdateBodySchema;
export type ApiKvBatchUpdate = KvBatchUpdateBody;

export const ApiUpdateNewArtifactSchema = UpdateNewArtifactBodySchema;
export type ApiUpdateNewArtifact = UpdateNewArtifactBody;

export const ApiUpdateArtifactSchema = UpdateArtifactBodySchema;
export type ApiUpdateArtifact = UpdateArtifactBody;

export const ApiDeleteArtifactSchema = DeleteArtifactBodySchema;
export type ApiDeleteArtifact = DeleteArtifactBody;

export const ApiRelationshipUpdatedSchema = RelationshipUpdatedBodySchema;
export type ApiRelationshipUpdated = RelationshipUpdatedBody;

export const ApiNewFeedPostSchema = NewFeedPostBodySchema;
export type ApiNewFeedPost = NewFeedPostBody;

export const UpdateBodySchema = UpdateNewMessageBodySchema;
export type UpdateBody = UpdateNewMessageBody;

export const UpdateSchema = CoreUpdateContainerSchema;
export type Update = CoreUpdateContainer;
