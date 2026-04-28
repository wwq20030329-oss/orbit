import { describe, expect, it } from 'vitest';
import {
  ApiDeleteSessionSchema,
  ApiDeleteArtifactSchema,
  ApiKvBatchUpdateSchema,
  ApiNewFeedPostSchema,
  ApiRelationshipUpdatedSchema,
  ApiUpdateArtifactSchema,
  ApiUpdateMachineStateSchema,
  ApiUpdateNewMessageSchema,
  ApiUpdateNewArtifactSchema,
  ApiUpdateNewMachineSchema,
  ApiUpdateNewSessionSchema,
  ApiUpdateAccountSchema,
  ApiUpdateSessionStateSchema,
  CoreUpdateContainerSchema,
  MessageContentSchema,
  SessionProtocolMessageSchema,
} from './messages';
import {
  AgentMessageSchema,
  LegacyMessageContentSchema,
  UserMessageSchema,
} from './legacyProtocol';

describe('shared wire message schemas', () => {
  it('parses a new-message update', () => {
    const parsed = ApiUpdateNewMessageSchema.safeParse({
      t: 'new-message',
      sid: 'session-1',
      message: {
        id: 'msg-1',
        seq: 10,
        localId: null,
        content: {
          t: 'encrypted',
          c: 'ZmFrZS1lbmNyeXB0ZWQ=',
        },
        createdAt: 123,
        updatedAt: 124,
      },
    });

    expect(parsed.success).toBe(true);
  });

  it('parses update-session with nullable agentState value', () => {
    const parsed = ApiUpdateSessionStateSchema.safeParse({
      t: 'update-session',
      id: 'session-1',
      metadata: {
        version: 2,
        value: 'abc',
      },
      agentState: {
        version: 3,
        value: null,
      },
    });

    expect(parsed.success).toBe(true);
  });

  it('parses new-session payloads', () => {
    const parsed = ApiUpdateNewSessionSchema.safeParse({
      t: 'new-session',
      id: 'session-1',
      seq: 4,
      metadata: 'encrypted-meta',
      metadataVersion: 3,
      agentState: null,
      agentStateVersion: 1,
      dataEncryptionKey: null,
      active: true,
      activeAt: 1000,
      createdAt: 900,
      updatedAt: 1000,
    });

    expect(parsed.success).toBe(true);
  });

  it('parses delete-session payloads', () => {
    const parsed = ApiDeleteSessionSchema.safeParse({
      t: 'delete-session',
      sid: 'session-1',
    });

    expect(parsed.success).toBe(true);
  });

  it('parses update-account payloads', () => {
    const parsed = ApiUpdateAccountSchema.safeParse({
      t: 'update-account',
      id: 'user-1',
      settings: {
        value: null,
        version: 2,
      },
      firstName: 'Ada',
      lastName: 'Lovelace',
      username: 'ada',
      avatar: null,
      github: null,
    });

    expect(parsed.success).toBe(true);
  });

  it('parses update-machine with optional activity fields', () => {
    const parsed = ApiUpdateMachineStateSchema.safeParse({
      t: 'update-machine',
      machineId: 'machine-1',
      metadata: {
        version: 1,
        value: 'abc',
      },
      daemonState: {
        version: 2,
        value: 'def',
      },
      active: true,
      activeAt: 12345,
    });

    expect(parsed.success).toBe(true);
  });

  it('parses new-machine payloads', () => {
    const parsed = ApiUpdateNewMachineSchema.safeParse({
      t: 'new-machine',
      machineId: 'machine-1',
      seq: 7,
      metadata: 'encrypted-machine',
      metadataVersion: 2,
      daemonState: null,
      daemonStateVersion: 1,
      dataEncryptionKey: null,
      active: true,
      activeAt: 100,
      createdAt: 90,
      updatedAt: 100,
    });

    expect(parsed.success).toBe(true);
  });

  it('parses kv-batch-update payloads', () => {
    const parsed = ApiKvBatchUpdateSchema.safeParse({
      t: 'kv-batch-update',
      changes: [
        { key: 'foo', value: 'bar', version: 1 },
        { key: 'baz', value: null, version: -1 },
      ],
    });

    expect(parsed.success).toBe(true);
  });

  it('parses artifact lifecycle payloads', () => {
    expect(ApiUpdateNewArtifactSchema.safeParse({
      t: 'new-artifact',
      artifactId: 'artifact-1',
      header: 'header',
      headerVersion: 1,
      body: 'body',
      bodyVersion: 1,
      dataEncryptionKey: 'key',
      seq: 2,
      createdAt: 1,
      updatedAt: 2,
    }).success).toBe(true);

    expect(ApiUpdateArtifactSchema.safeParse({
      t: 'update-artifact',
      artifactId: 'artifact-1',
      header: { value: 'header-2', version: 2 },
    }).success).toBe(true);

    expect(ApiDeleteArtifactSchema.safeParse({
      t: 'delete-artifact',
      artifactId: 'artifact-1',
    }).success).toBe(true);
  });

  it('parses social/feed payloads', () => {
    expect(ApiRelationshipUpdatedSchema.safeParse({
      t: 'relationship-updated',
      fromUserId: 'user-1',
      toUserId: 'user-2',
      status: 'friend',
      action: 'updated',
      timestamp: 10,
    }).success).toBe(true);

    expect(ApiNewFeedPostSchema.safeParse({
      t: 'new-feed-post',
      id: 'feed-1',
      body: { kind: 'text', text: 'hello' },
      cursor: 'cursor-1',
      createdAt: 10,
      repeatKey: null,
    }).success).toBe(true);
  });

  it('parses container updates for the current shared update contract', () => {
    const examples = [
      {
        id: 'upd-1',
        seq: 1,
        body: {
          t: 'new-message',
          sid: 'session-1',
          message: {
            id: 'msg-1',
            seq: 1,
            localId: null,
            content: { t: 'encrypted', c: 'x' },
            createdAt: 1,
            updatedAt: 1,
          },
        },
        createdAt: 1,
      },
      {
        id: 'upd-2',
        seq: 2,
        body: {
          t: 'new-session',
          id: 'session-1',
          seq: 1,
          metadata: 'meta',
          metadataVersion: 1,
          agentState: null,
          agentStateVersion: 0,
          dataEncryptionKey: null,
          active: true,
          activeAt: 2,
          createdAt: 1,
          updatedAt: 2,
        },
        createdAt: 2,
      },
      {
        id: 'upd-3',
        seq: 3,
        body: {
          t: 'update-session',
          id: 'session-1',
          metadata: null,
          agentState: {
            version: 1,
            value: null,
          },
        },
        createdAt: 3,
      },
      {
        id: 'upd-4',
        seq: 4,
        body: {
          t: 'delete-session',
          sid: 'session-1',
        },
        createdAt: 4,
      },
      {
        id: 'upd-5',
        seq: 5,
        body: {
          t: 'update-account',
          id: 'user-1',
          settings: null,
          firstName: null,
          lastName: null,
          avatar: null,
          github: null,
        },
        createdAt: 5,
      },
      {
        id: 'upd-6',
        seq: 6,
        body: {
          t: 'new-machine',
          machineId: 'machine-1',
          seq: 1,
          metadata: 'abc',
          metadataVersion: 1,
          daemonState: null,
          daemonStateVersion: 0,
          dataEncryptionKey: null,
          active: true,
          activeAt: 6,
          createdAt: 5,
          updatedAt: 6,
        },
        createdAt: 6,
      },
      {
        id: 'upd-7',
        seq: 7,
        body: {
          t: 'update-machine',
          machineId: 'machine-1',
          metadata: null,
          daemonState: null,
        },
        createdAt: 7,
      },
      {
        id: 'upd-8',
        seq: 8,
        body: {
          t: 'kv-batch-update',
          changes: [
            { key: 'foo', value: 'bar', version: 1 },
          ],
        },
        createdAt: 8,
      },
      {
        id: 'upd-9',
        seq: 9,
        body: {
          t: 'new-artifact',
          artifactId: 'artifact-1',
          header: 'header',
          headerVersion: 1,
          dataEncryptionKey: 'key',
          seq: 1,
          createdAt: 8,
          updatedAt: 9,
        },
        createdAt: 9,
      },
      {
        id: 'upd-10',
        seq: 10,
        body: {
          t: 'relationship-updated',
          fromUserId: 'user-1',
          toUserId: 'user-2',
          status: 'friend',
          action: 'updated',
          timestamp: 10,
        },
        createdAt: 10,
      },
      {
        id: 'upd-11',
        seq: 11,
        body: {
          t: 'new-feed-post',
          id: 'feed-1',
          body: { kind: 'text', text: 'hello' },
          cursor: 'cursor-1',
          createdAt: 10,
        },
        createdAt: 11,
      },
    ];

    for (const sample of examples) {
      expect(CoreUpdateContainerSchema.safeParse(sample).success).toBe(true);
    }
  });

  it('parses legacy decrypted user message payload', () => {
    const parsed = UserMessageSchema.safeParse({
      role: 'user',
      content: {
        type: 'text',
        text: 'fix this test',
      },
      meta: {
        sentFrom: 'mobile',
      },
    });

    expect(parsed.success).toBe(true);
  });

  it('parses legacy decrypted agent message payload', () => {
    const parsed = AgentMessageSchema.safeParse({
      role: 'agent',
      content: {
        type: 'output',
        data: {
          type: 'message',
          message: 'done',
        },
      },
      meta: {
        sentFrom: 'cli',
      },
    });

    expect(parsed.success).toBe(true);
  });

  it('parses legacy message discriminated union', () => {
    const userParsed = LegacyMessageContentSchema.safeParse({
      role: 'user',
      content: {
        type: 'text',
        text: 'hello',
      },
    });
    const agentParsed = LegacyMessageContentSchema.safeParse({
      role: 'agent',
      content: {
        type: 'event',
        data: { type: 'ready' },
      },
    });

    expect(userParsed.success).toBe(true);
    expect(agentParsed.success).toBe(true);
  });

  it('parses modern session protocol wrapper payload', () => {
    const parsed = SessionProtocolMessageSchema.safeParse({
      role: 'session',
      content: {
        id: 'msg-1',
        time: 1000,
        role: 'agent',
        turn: 'turn-1',
        ev: {
          t: 'text',
          text: 'hello',
        },
      },
      meta: {
        sentFrom: 'cli',
      },
    });

    expect(parsed.success).toBe(true);
  });

  it('parses top-level message discriminated union for legacy and modern roles', () => {
    const userParsed = MessageContentSchema.safeParse({
      role: 'user',
      content: {
        type: 'text',
        text: 'hello from user',
      },
    });
    const agentParsed = MessageContentSchema.safeParse({
      role: 'agent',
      content: {
        type: 'output',
        data: {
          type: 'message',
          message: 'hello from agent',
        },
      },
    });
    const modernParsed = MessageContentSchema.safeParse({
      role: 'session',
      content: {
        id: 'msg-2',
        time: 2000,
        role: 'agent',
        turn: 'turn-2',
        ev: {
          t: 'text',
          text: 'hello from session protocol',
        },
      },
    });

    expect(userParsed.success).toBe(true);
    expect(agentParsed.success).toBe(true);
    expect(modernParsed.success).toBe(true);
  });
});
