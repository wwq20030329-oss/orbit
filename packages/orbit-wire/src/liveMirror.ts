import { z } from 'zod';

export const liveMirrorBackendSchema = z.enum(['tmux', 'pty']);
export type LiveMirrorBackend = z.infer<typeof liveMirrorBackendSchema>;

export const liveMirrorToolSchema = z.enum(['codex', 'claude', 'gemini', 'openclaw']);
export type LiveMirrorTool = z.infer<typeof liveMirrorToolSchema>;

export const liveMirrorControlModeSchema = z.enum(['viewer', 'controller']);
export type LiveMirrorControlMode = z.infer<typeof liveMirrorControlModeSchema>;

export const liveMirrorFrameKindSchema = z.enum(['snapshot', 'output', 'status']);
export type LiveMirrorFrameKind = z.infer<typeof liveMirrorFrameKindSchema>;

export const liveMirrorRuntimeStatusSchema = z.enum([
  'starting',
  'running',
  'waiting-approval',
  'idle',
  'stopped',
  'error',
]);
export type LiveMirrorRuntimeStatus = z.infer<typeof liveMirrorRuntimeStatusSchema>;

export const liveMirrorRuntimeRefSchema = z.object({
  runtimeId: z.string().min(1),
  sessionId: z.string().min(1),
  machineId: z.string().min(1),
  tool: liveMirrorToolSchema,
  backendId: z.string().min(1),
  backend: liveMirrorBackendSchema,
});
export type LiveMirrorRuntimeRef = z.infer<typeof liveMirrorRuntimeRefSchema>;

export const liveMirrorRuntimeDescriptorSchema = liveMirrorRuntimeRefSchema.extend({
  cwd: z.string().min(1),
  title: z.string().min(1),
  controlMode: liveMirrorControlModeSchema,
  status: liveMirrorRuntimeStatusSchema,
  seq: z.number().int().nonnegative(),
  cols: z.number().int().positive().optional(),
  rows: z.number().int().positive().optional(),
  updatedAt: z.number().int().nonnegative(),
});
export type LiveMirrorRuntimeDescriptor = z.infer<typeof liveMirrorRuntimeDescriptorSchema>;

export const liveMirrorFrameSchema = liveMirrorRuntimeRefSchema.extend({
  seq: z.number().int().nonnegative(),
  ts: z.number().int().nonnegative(),
  kind: liveMirrorFrameKindSchema,
  data: z.string(),
});
export type LiveMirrorFrame = z.infer<typeof liveMirrorFrameSchema>;

export const liveMirrorAttachRequestSchema = liveMirrorRuntimeRefSchema.pick({
  runtimeId: true,
  sessionId: true,
  machineId: true,
}).extend({
  afterSeq: z.number().int().nonnegative().optional(),
  cols: z.number().int().positive().optional(),
  rows: z.number().int().positive().optional(),
  mode: liveMirrorControlModeSchema.default('viewer'),
});
export type LiveMirrorAttachRequest = z.infer<typeof liveMirrorAttachRequestSchema>;

export const liveMirrorAttachAcceptedSchema = z.object({
  runtime: liveMirrorRuntimeDescriptorSchema,
  snapshot: liveMirrorFrameSchema.nullable(),
  backlog: z.array(liveMirrorFrameSchema),
  requestedAfterSeq: z.number().int().nonnegative().optional(),
  replayFromSeq: z.number().int().nonnegative().optional(),
  oldestAvailableSeq: z.number().int().nonnegative().optional(),
  latestSeq: z.number().int().nonnegative().optional(),
  replayStatus: z.enum(['exact', 'snapshot-rebased', 'truncated']).optional(),
});
export type LiveMirrorAttachAccepted = z.infer<typeof liveMirrorAttachAcceptedSchema>;

export const liveMirrorDetachSchema = z.object({
  runtimeId: z.string().min(1),
  sessionId: z.string().min(1),
  machineId: z.string().min(1),
  reason: z.enum(['client-detached', 'runtime-ended', 'machine-offline', 'permission-lost', 'error']),
  message: z.string().optional(),
});
export type LiveMirrorDetach = z.infer<typeof liveMirrorDetachSchema>;

export const liveMirrorInputSchema = z.object({
  runtimeId: z.string().min(1),
  sessionId: z.string().min(1),
  machineId: z.string().min(1),
  data: z.string().min(1),
  encoding: z.enum(['utf8']).default('utf8'),
});
export type LiveMirrorInput = z.infer<typeof liveMirrorInputSchema>;

export const liveMirrorResizeSchema = z.object({
  runtimeId: z.string().min(1),
  sessionId: z.string().min(1),
  machineId: z.string().min(1),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
});
export type LiveMirrorResize = z.infer<typeof liveMirrorResizeSchema>;

export const liveMirrorControlSchema = z.object({
  runtimeId: z.string().min(1),
  sessionId: z.string().min(1),
  machineId: z.string().min(1),
  mode: liveMirrorControlModeSchema,
});
export type LiveMirrorControl = z.infer<typeof liveMirrorControlSchema>;

export const liveMirrorServerEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('live-attach-accepted'),
    payload: liveMirrorAttachAcceptedSchema,
  }),
  z.object({
    type: z.literal('live-frame'),
    payload: liveMirrorFrameSchema,
  }),
  z.object({
    type: z.literal('live-detach'),
    payload: liveMirrorDetachSchema,
  }),
]);
export type LiveMirrorServerEvent = z.infer<typeof liveMirrorServerEventSchema>;

export const liveMirrorClientEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('live-attach-request'),
    payload: liveMirrorAttachRequestSchema,
  }),
  z.object({
    type: z.literal('live-input'),
    payload: liveMirrorInputSchema,
  }),
  z.object({
    type: z.literal('live-resize'),
    payload: liveMirrorResizeSchema,
  }),
  z.object({
    type: z.literal('live-control'),
    payload: liveMirrorControlSchema,
  }),
  z.object({
    type: z.literal('live-detach'),
    payload: z.object({
      runtimeId: z.string().min(1),
      sessionId: z.string().min(1),
      machineId: z.string().min(1),
    }),
  }),
]);
export type LiveMirrorClientEvent = z.infer<typeof liveMirrorClientEventSchema>;
