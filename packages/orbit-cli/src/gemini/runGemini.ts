/**
 * Gemini CLI Entry Point
 * 
 * This module provides the main entry point for running the Gemini agent
 * through Orbit CLI. It manages the agent lifecycle, session state, and
 * communication with the Orbit server and mobile app.
 */

import { render } from 'ink';
import React from 'react';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { ApiClient } from '@/api/api';
import { logger } from '@/ui/logger';
import { Credentials, readSettings } from '@/persistence';
import { createSessionMetadata } from '@/utils/createSessionMetadata';
import { initialMachineMetadata } from '@/daemon/run';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import { hashObject } from '@/utils/deterministicJson';
import { projectPath } from '@/projectPath';
import { startOrbitMcpServer } from '@/claude/utils/startOrbitMcpServer';
import { MessageBuffer } from '@/ui/ink/messageBuffer';
import { notifyDaemonSessionStarted } from '@/daemon/controlClient';
import { registerKillSessionHandler } from '@/claude/registerKillSessionHandler';
import { stopCaffeinate } from '@/utils/caffeinate';
import { connectionState } from '@/utils/serverConnectionErrors';
import { setupOfflineReconnection } from '@/utils/setupOfflineReconnection';
import { withRemoteControl } from '@/utils/agentState';
import type { ApiSessionClient } from '@/api/apiSession';

import { createGeminiBackend } from '@/agent/factories/gemini';
import type { AgentBackend, AgentMessage } from '@/agent';
import { GeminiDisplay } from '@/ui/ink/GeminiDisplay';
import { GeminiPermissionHandler } from '@/gemini/utils/permissionHandler';
import { GeminiReasoningProcessor } from '@/gemini/utils/reasoningProcessor';
import { GeminiDiffProcessor } from '@/gemini/utils/diffProcessor';
import type { GeminiConfigSelector } from '@/gemini/configSelectors';
import type { GeminiMode, CodexMessagePayload } from '@/gemini/types';
import type { PermissionMode } from '@/api/types';
import { GEMINI_MODEL_ENV, DEFAULT_GEMINI_MODEL, CHANGE_TITLE_INSTRUCTION } from '@/gemini/constants';
import {
  readGeminiLocalConfig,
  saveGeminiModelToConfig,
  getInitialGeminiModel
} from '@/gemini/utils/config';
import {
  parseOptionsFromText,
  hasIncompleteOptions,
  formatOptionsXml,
} from '@/gemini/utils/optionsParser';
import { ConversationHistory } from '@/gemini/utils/conversationHistory';
import {
  buildNativeCliResumeSessionTag,
  getRequestedNativeCliHistoryReplay,
  markNativeCliHistoryImported,
  replayNativeCliHistoryIfRequested,
  shouldReplayNativeCliHistory,
} from '@/history/nativeCliHistoryReplay';
import {
  applyGeminiSessionConfigEvent,
  switchGeminiThoughtLevelIfRequested,
  type GeminiThoughtLevelBackend,
} from '@/gemini/sessionConfigSync';
import { ensureGeminiBackendSession } from '@/gemini/backendLifecycle';
import {
  buildPromptForTurn,
  executeGeminiPromptTurn,
  normalizeGeminiTurnError,
} from '@/gemini/promptExecution';

type ConfigurableGeminiBackend = AgentBackend & GeminiThoughtLevelBackend;


/**
 * Main entry point for the gemini command with ink UI
 */
export async function runGemini(opts: {
  credentials: Credentials;
  startedBy?: 'daemon' | 'terminal';
  resumeSessionId?: string;
}): Promise<void> {
  //
  // Define session
  //

  
  const nativeReplayRequest = getRequestedNativeCliHistoryReplay();
  const sessionTag = nativeReplayRequest
    ? buildNativeCliResumeSessionTag(nativeReplayRequest)
    : randomUUID();

  // Set backend for offline warnings (before any API calls)
  connectionState.setBackend('Gemini');

  const api = await ApiClient.create(opts.credentials);


  //
  // Machine
  //

  const settings = await readSettings();
  const machineId = settings?.machineId;
  const sandboxConfig = settings?.sandboxConfig;
  if (!machineId) {
    console.error(`[START] No machine ID found in settings, which is unexpected since authAndSetupMachineIfNeeded should have created it. Please report this issue on https://github.com/wwq20030329-oss/orbit/issues`);
    process.exit(1);
  }
  logger.debug(`Using machineId: ${machineId}`);
  await api.getOrCreateMachine({
    machineId,
    metadata: initialMachineMetadata
  });

  //
  // Fetch Gemini cloud token (from 'orbit connect gemini')
  //
  let cloudToken: string | undefined = undefined;
  let currentUserEmail: string | undefined = undefined;
  try {
    const vendorToken = await api.getVendorToken('gemini');
    if (vendorToken?.oauth?.access_token) {
      cloudToken = vendorToken.oauth.access_token;
      logger.debug('[Gemini] Using OAuth token from Orbit cloud');
      
      // Extract email from id_token for per-account project matching
      if (vendorToken.oauth.id_token) {
        try {
          const parts = vendorToken.oauth.id_token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
            if (payload.email) {
              currentUserEmail = payload.email;
              logger.debug(`[Gemini] Current user email: ${currentUserEmail}`);
            }
          }
        } catch {
          logger.debug('[Gemini] Failed to decode id_token for email');
        }
      }
    }
  } catch (error) {
    logger.debug('[Gemini] Failed to fetch cloud token:', error);
  }

  //
  // Create session
  //

  const { state, metadata } = createSessionMetadata({
    flavor: 'gemini',
    machineId,
    startedBy: opts.startedBy,
    sandbox: sandboxConfig,
    summaryText: nativeReplayRequest?.summary ?? nativeReplayRequest?.title ?? null,
    nativeHistorySource: nativeReplayRequest
      ? {
        tool: nativeReplayRequest.tool,
        backendId: nativeReplayRequest.backendId,
      }
      : null,
  });
  const response = await api.getOrCreateSession({ tag: sessionTag, metadata, state });
  const shouldImportNativeHistory = response
    ? shouldReplayNativeCliHistory(response.metadata, nativeReplayRequest)
    : false;

  // Handle server unreachable case - create offline stub with hot reconnection
  let session: ApiSessionClient;
  // Permission handler declared here so it can be updated in onSessionSwap callback
  // (assigned later after Orbit server setup)
  let permissionHandler: GeminiPermissionHandler;

  // Session swap synchronization to prevent race conditions during message processing
  // When a swap is requested during processing, it's queued and applied after the current cycle
  let isProcessingMessage = false;
  let pendingSessionSwap: ApiSessionClient | null = null;

  /**
   * Apply a pending session swap. Called between message processing cycles.
   * This ensures session swaps happen at safe points, not during message processing.
   */
  const applyPendingSessionSwap = () => {
    if (pendingSessionSwap) {
      logger.debug('[gemini] Applying pending session swap');
      session = pendingSessionSwap;
      if (permissionHandler) {
        permissionHandler.updateSession(pendingSessionSwap);
      }
      pendingSessionSwap = null;
    }
  };

  const { session: initialSession, reconnectionHandle } = setupOfflineReconnection({
    api,
    sessionTag,
    metadata,
    state,
    response,
    onSessionSwap: (newSession) => {
      // If we're processing a message, queue the swap for later
      // This prevents race conditions where session changes mid-processing
      if (isProcessingMessage) {
        logger.debug('[gemini] Session swap requested during message processing - queueing');
        pendingSessionSwap = newSession;
      } else {
        // Safe to swap immediately
        session = newSession;
        session.updateAgentState((currentState) => withRemoteControl(currentState));
        if (permissionHandler) {
          permissionHandler.updateSession(newSession);
        }
      }
    }
  });
  session = initialSession;
  session.updateAgentState((currentState) => withRemoteControl(currentState));

  // Report to daemon (only if we have a real session)
  if (response) {
    try {
      logger.debug(`[START] Reporting session ${response.id} to daemon`);
      const result = await notifyDaemonSessionStarted(response.id, metadata);
      if (result.error) {
        logger.debug(`[START] Failed to report to daemon (may not be running):`, result.error);
      } else {
        logger.debug(`[START] Reported session ${response.id} to daemon`);
      }
    } catch (error) {
      logger.debug('[START] Failed to report to daemon (may not be running):', error);
    }
  }

  const messageQueue = new MessageQueue2<GeminiMode>((mode) => hashObject({
    permissionMode: mode.permissionMode,
    model: mode.model,
  }));
  let pendingResumeSessionId = opts.resumeSessionId;

  if (nativeReplayRequest && shouldImportNativeHistory) {
    await replayNativeCliHistoryIfRequested(session, 'gemini', process.cwd());
    session.updateMetadata((currentMetadata) => markNativeCliHistoryImported(currentMetadata, nativeReplayRequest));
  }

  // Conversation history for context preservation across model changes
  const conversationHistory = new ConversationHistory({ maxMessages: 20, maxCharacters: 50000 });

  // Track current overrides to apply per message
  let currentPermissionMode: PermissionMode | undefined = undefined;
  let currentModel: string | undefined = undefined;
  let currentEffortLevel: string | undefined = undefined;
  let thoughtLevelSelector: GeminiConfigSelector | null = null;

  session.onUserMessage((message) => {
    // Resolve permission mode (validate) - same as Codex
      let messagePermissionMode = currentPermissionMode;
      if (message.meta?.permissionMode) {
      const validModes: PermissionMode[] = ['default', 'auto_edit', 'plan', 'read-only', 'safe-yolo', 'yolo'];
      if (validModes.includes(message.meta.permissionMode as PermissionMode)) {
        messagePermissionMode = message.meta.permissionMode as PermissionMode;
        currentPermissionMode = messagePermissionMode;
        // Update permission handler with new mode
        updatePermissionMode(messagePermissionMode);
        logger.debug(`[Gemini] Permission mode updated from user message to: ${currentPermissionMode}`);
      } else {
        logger.debug(`[Gemini] Invalid permission mode received: ${message.meta.permissionMode}`);
      }
    } else {
      logger.debug(`[Gemini] User message received with no permission mode override, using current: ${currentPermissionMode ?? 'default (effective)'}`);
    }
    
    // Initialize permission mode if not set yet
    if (currentPermissionMode === undefined) {
      currentPermissionMode = 'default';
      updatePermissionMode('default');
    }

    let messageEffortLevel = currentEffortLevel;
    if (typeof message.meta?.effortLevel === 'string' && message.meta.effortLevel.length > 0) {
      messageEffortLevel = message.meta.effortLevel;
      currentEffortLevel = messageEffortLevel;
      logger.debug(`[Gemini] Effort level updated from user message to: ${currentEffortLevel}`);
    }

    // Resolve model; explicit null resets to default (undefined)
    let messageModel = currentModel;
    if (message.meta?.hasOwnProperty('model')) {
      // If model is explicitly null, reset internal state but don't update displayed model
      // If model is provided, use it and update displayed model
      // Otherwise keep current model
      if (message.meta.model === null) {
        messageModel = undefined; // Explicitly reset - will use default/env/config
        currentModel = undefined;
        // Don't call updateDisplayedModel here - keep current displayed model
        // The backend will use the correct model from env/config/default
      } else if (message.meta.model) {
        const previousModel = currentModel;
        messageModel = message.meta.model;
        currentModel = messageModel;
        // Only update UI and show message if model actually changed
        if (previousModel !== messageModel) {
          // Save model to config file so it persists across sessions
          updateDisplayedModel(messageModel, true); // Update UI and save to config
          // Show model change message in UI (this will trigger UI re-render)
          messageBuffer.addMessage(`Model changed to: ${messageModel}`, 'system');
          logger.debug(`[Gemini] Model changed from ${previousModel} to ${messageModel}`);
        }
      }
      // If message.meta.model is undefined, keep currentModel
    }

    // Build the full prompt with appendSystemPrompt if provided
    // Only include system prompt for the first message to avoid forcing tool usage on every message
    const originalUserMessage = message.content.text;
    let fullPrompt = originalUserMessage;
    if (isFirstMessage && message.meta?.appendSystemPrompt) {
      // Prepend system prompt to user message only for first message
      // Also add change_title instruction (like Codex does)
      // Use EXACT same format as Codex: add instruction AFTER user message
      // This matches Codex's approach exactly - instruction comes after user message
      // Codex format: system prompt + user message + change_title instruction
      fullPrompt = message.meta.appendSystemPrompt + '\n\n' + originalUserMessage + '\n\n' + CHANGE_TITLE_INSTRUCTION;
      isFirstMessage = false;
    }

    const mode: GeminiMode = {
      permissionMode: messagePermissionMode || 'default',
      model: messageModel,
      effortLevel: messageEffortLevel,
      originalUserMessage, // Store original message separately
    };
    messageQueue.push(fullPrompt, mode);
    
    // Record user message in conversation history for context preservation
    conversationHistory.addUserMessage(originalUserMessage);
  });

  let thinking = false;
  session.keepAlive(thinking, 'remote');
  const keepAliveInterval = setInterval(() => {
    session.keepAlive(thinking, 'remote');
  }, 2000);

  // Track if this is the first message to include system prompt only once
  let isFirstMessage = true;

  const sendReady = () => {
    session.sendSessionEvent({ type: 'ready' });
    try {
      api.push().sendSessionNotification({
        kind: 'done',
        metadata: session.getMetadata(),
        data: {
          sessionId: session.sessionId,
          type: 'ready',
          provider: 'gemini',
        }
      });
    } catch (pushError) {
      logger.debug('[Gemini] Failed to send ready push', pushError);
    }
  };

  /**
   * Check if we can emit ready event
   * * Returns true when ready event was emitted
   */
  const emitReadyIfIdle = (): boolean => {
    if (shouldExit) {
      return false;
    }
    if (thinking) {
      return false;
    }
    if (isResponseInProgress) {
      return false;
    }
    if (messageQueue.size() > 0) {
      return false;
    }

    sendReady();
    return true;
  };

  //
  // Abort handling
  //

  let abortController = new AbortController();
  let shouldExit = false;
  let geminiBackend: AgentBackend | null = null;
  let acpSessionId: string | null = null;
  let wasSessionCreated = false;

  async function handleAbort() {
    logger.debug('[Gemini] Abort requested - stopping current task');
    
    // Send turn_aborted event (like Codex) when abort is requested
    session.sendAgentMessage('gemini', {
      type: 'turn_aborted',
      id: randomUUID(),
    });
    
    // Abort reasoning processor and reset diff processor
    reasoningProcessor.abort();
    diffProcessor.reset();
    
    try {
      abortController.abort();
      messageQueue.reset();
      if (geminiBackend && acpSessionId) {
        await geminiBackend.cancel(acpSessionId);
      }
      logger.debug('[Gemini] Abort completed - session remains active');
    } catch (error) {
      logger.debug('[Gemini] Error during abort:', error);
    } finally {
      abortController = new AbortController();
    }
  }

  const handleKillSession = async () => {
    logger.debug('[Gemini] Kill session requested - terminating process');
    await handleAbort();
    logger.debug('[Gemini] Abort completed, proceeding with termination');

    try {
      if (session) {
        session.updateMetadata((currentMetadata) => ({
          ...currentMetadata,
          lifecycleState: 'archived',
          lifecycleStateSince: Date.now(),
          archivedBy: 'cli',
          archiveReason: 'User terminated'
        }));

        session.sendSessionDeath();
        await session.flush();
        await session.close();
      }

      stopCaffeinate();
      orbitServer.stop();

      if (geminiBackend) {
        await geminiBackend.dispose();
      }

      logger.debug('[Gemini] Session termination complete, exiting');
      process.exit(0);
    } catch (error) {
      logger.debug('[Gemini] Error during session termination:', error);
      process.exit(1);
    }
  };

  session.rpcHandlerManager.registerHandler('abort', handleAbort);
  registerKillSessionHandler(session.rpcHandlerManager, handleKillSession);

  //
  // Initialize Ink UI
  //

  const messageBuffer = new MessageBuffer();
  const hasTTY = process.stdout.isTTY && process.stdin.isTTY;
  let inkInstance: ReturnType<typeof render> | null = null;

  // Track current model for UI display
  // Initialize with env var or default to show correct model from start
  let displayedModel: string | undefined = getInitialGeminiModel();
  
  // Log initial values
  const localConfig = readGeminiLocalConfig();
  logger.debug(`[gemini] Initial model setup: env[GEMINI_MODEL_ENV]=${process.env[GEMINI_MODEL_ENV] || 'not set'}, localConfig=${localConfig.model || 'not set'}, displayedModel=${displayedModel}`);

  // Function to update displayed model and notify UI
  const updateDisplayedModel = (model: string | undefined, saveToConfig: boolean = false) => {
    // Only update if model is actually provided (not undefined)
    if (model === undefined) {
      logger.debug(`[gemini] updateDisplayedModel called with undefined, skipping update`);
      return;
    }
    
    const oldModel = displayedModel;
    displayedModel = model;
    logger.debug(`[gemini] updateDisplayedModel called: oldModel=${oldModel}, newModel=${model}, saveToConfig=${saveToConfig}`);
    
    // Save to config file if requested (when user changes model via mobile app)
    if (saveToConfig) {
      saveGeminiModelToConfig(model);
    }
    
    // Trigger UI update by adding a system message with model info
    // The message will be parsed by UI to extract model name
    if (hasTTY && oldModel !== model) {
      // Add a system message that includes model info - UI will parse it
      // Format: [MODEL:gemini-2.5-pro] to make it easy to extract
      logger.debug(`[gemini] Adding model update message to buffer: [MODEL:${model}]`);
      messageBuffer.addMessage(`[MODEL:${model}]`, 'system');
    } else if (hasTTY) {
      logger.debug(`[gemini] Model unchanged, skipping update message`);
    }
  };

  if (hasTTY) {
    console.clear();
    // Create a React component that reads displayedModel from closure
    // Model will update when UI re-renders (on messageBuffer updates)
    // We use a function component that reads displayedModel on each render
    const DisplayComponent = () => {
      // Read displayedModel from closure - it will have latest value on each render
      const currentModelValue = displayedModel || 'gemini-2.5-pro';
      // Don't log on every render to avoid spam - only log when model changes
      return React.createElement(GeminiDisplay, {
        messageBuffer,
        logPath: process.env.DEBUG ? logger.getLogPath() : undefined,
        currentModel: currentModelValue,
        onExit: async () => {
          logger.debug('[gemini]: Exiting agent via Ctrl-C');
          shouldExit = true;
          await handleAbort();
        }
      });
    };
    
    inkInstance = render(React.createElement(DisplayComponent), {
      exitOnCtrlC: false,
      patchConsole: false
    });
    
    // Send initial model to UI so it displays correctly from start
    const initialModelName = displayedModel || 'gemini-2.5-pro';
    logger.debug(`[gemini] Sending initial model to UI: ${initialModelName}`);
    messageBuffer.addMessage(`[MODEL:${initialModelName}]`, 'system');
  }

  if (hasTTY) {
    process.stdin.resume();
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.setEncoding('utf8');
  }

  //
  // Start Orbit MCP server and create Gemini backend
  //

  const orbitServer = await startOrbitMcpServer(session);
  const bridgeCommand = join(projectPath(), 'bin', 'orbit-mcp.mjs');
  const mcpServers = {
    orbit: {
      command: bridgeCommand,
      args: ['--url', orbitServer.url]
    }
  };

  // Create permission handler for tool approval (variable declared earlier for onSessionSwap)
  permissionHandler = new GeminiPermissionHandler(session);
  
  // Create reasoning processor for handling thinking/reasoning chunks
  const reasoningProcessor = new GeminiReasoningProcessor((message) => {
    // Callback to send messages directly from the processor
    session.sendAgentMessage('gemini', message);
  });
  
  // Create diff processor for handling file edit events and diff tracking
  const diffProcessor = new GeminiDiffProcessor((message) => {
    // Callback to send messages directly from the processor
    session.sendAgentMessage('gemini', message);
  });
  
  // Update permission handler when permission mode changes
  const updatePermissionMode = (mode: PermissionMode) => {
    permissionHandler.setPermissionMode(mode);
  };

  // Accumulate Gemini response text for sending complete message to mobile
  let accumulatedResponse = '';
  let isResponseInProgress = false;
  let currentResponseMessageId: string | null = null; // Track the message ID for current response
  let hadToolCallInTurn = false; // Track if any tool calls happened in this turn (for task_complete)
  let pendingChangeTitle = false; // Track if we're waiting for change_title to complete
  let changeTitleCompleted = false; // Track if change_title was completed in this turn
  let taskStartedSent = false; // Track if task_started was sent this turn (prevent duplicates)

  /**
   * Set up message handler for Gemini backend
   * This function is called when backend is created or recreated
   */
  function setupGeminiMessageHandler(backend: AgentBackend): void {
    backend.onMessage((msg: AgentMessage) => {

    switch (msg.type) {
      case 'model-output':
        if (msg.textDelta) {
          // If this is the first delta of a new response, create a new message
          // Otherwise, update the existing message for this response
          if (!isResponseInProgress) {
            // Start of new response - create new assistant message
            // Remove "Thinking..." message if it exists (it will be replaced by actual response)
            messageBuffer.removeLastMessage('system'); // Remove "Thinking..." if present
            messageBuffer.addMessage(msg.textDelta, 'assistant');
            isResponseInProgress = true;
            logger.debug(`[gemini] Started new response, first chunk length: ${msg.textDelta.length}`);
          } else {
            // Continue existing response - update last assistant message
            messageBuffer.updateLastMessage(msg.textDelta, 'assistant');
            logger.debug(`[gemini] Updated response, chunk length: ${msg.textDelta.length}, total accumulated: ${accumulatedResponse.length + msg.textDelta.length}`);
          }
          accumulatedResponse += msg.textDelta;
        }
        break;

      case 'status':
        // Log status changes for debugging - stringify object details
        const statusDetail = msg.detail 
          ? (typeof msg.detail === 'object' ? JSON.stringify(msg.detail) : String(msg.detail))
          : '';
        logger.debug(`[gemini] Status changed: ${msg.status}${statusDetail ? ` - ${statusDetail}` : ''}`);
        
        // Log error status with details
        if (msg.status === 'error') {
          logger.debug(`[gemini] ⚠️ Error status received: ${statusDetail || 'Unknown error'}`);
          
          // Send turn_aborted event (like Codex) when error occurs
          session.sendAgentMessage('gemini', {
            type: 'turn_aborted',
            id: randomUUID(),
          });
        }
        
        if (msg.status === 'running') {
          thinking = true;
          session.keepAlive(thinking, 'remote');
          
          // Send task_started event ONCE per turn (like Codex) when agent starts working
          // Gemini may go running -> idle -> running multiple times during a turn
          if (!taskStartedSent) {
            session.sendAgentMessage('gemini', {
              type: 'task_started',
              id: randomUUID(),
            });
            taskStartedSent = true;
          }
          
          // Show thinking indicator in UI when agent starts working (like Codex)
          // This will be updated with actual thinking text when agent_thought_chunk events arrive
          // Always show thinking indicator when status becomes 'running' to give user feedback
          // Even if response is in progress, we want to show thinking for new operations
          messageBuffer.addMessage('Thinking...', 'system');
          
          // Don't reset accumulator here - tool calls can happen during a response
          // Accumulator will be reset when a new prompt is sent (in the main loop)
        } else if (msg.status === 'idle' || msg.status === 'stopped') {
          // DON'T change thinking state here - Gemini makes pauses between chunks
          // which causes multiple idle events. thinking will be set to false ONCE
          // in the finally block when the turn is complete.
          // This prevents UI status flickering between "working" and "online"
          
          // Complete reasoning processor when status becomes idle (like Codex)
          // Only complete if there's actually reasoning content to complete
          // Skip if this is just the initial idle status after session creation
          reasoningProcessor.complete();
        } else if (msg.status === 'error') {
          thinking = false;
          session.keepAlive(thinking, 'remote');
          accumulatedResponse = '';
          isResponseInProgress = false;
          currentResponseMessageId = null;
          
          // Show error in CLI UI - handle object errors properly
          let errorMessage = 'Unknown error';
          if (msg.detail) {
            if (typeof msg.detail === 'object') {
              // Extract message from error object
              const detailObj = msg.detail as Record<string, unknown>;
              errorMessage = (detailObj.message as string) || 
                           (detailObj.details as string) || 
                           JSON.stringify(detailObj);
            } else {
              errorMessage = String(msg.detail);
            }
          }
          
          // Check for authentication error and provide helpful message
          if (errorMessage.includes('Authentication required')) {
            errorMessage = `Authentication required.\n` +
              `For Google Workspace accounts, run: orbit gemini project set <project-id>\n` +
              `Or use a different Google account: orbit connect gemini\n` +
              `Guide: https://goo.gle/gemini-cli-auth-docs#workspace-gca`;
          }
          
          messageBuffer.addMessage(`Error: ${errorMessage}`, 'status');
          
          // Use sendAgentMessage for consistency with ACP format
          session.sendAgentMessage('gemini', {
            type: 'message',
            message: `Error: ${errorMessage}`,
          });
        }
        break;

      case 'tool-call':
        // Track that we had tool calls in this turn (for task_complete)
        hadToolCallInTurn = true;
        
        // Show tool call in UI like Codex does
        const toolArgs = msg.args ? JSON.stringify(msg.args).substring(0, 100) : '';
        const isInvestigationTool = msg.toolName === 'codebase_investigator' || 
                                    (typeof msg.toolName === 'string' && msg.toolName.includes('investigator'));
        
        logger.debug(`[gemini] 🔧 Tool call received: ${msg.toolName} (${msg.callId})${isInvestigationTool ? ' [INVESTIGATION]' : ''}`);
        if (isInvestigationTool && msg.args && typeof msg.args === 'object' && 'objective' in msg.args) {
          logger.debug(`[gemini] 🔍 Investigation objective: ${String(msg.args.objective).substring(0, 150)}...`);
        }
        
        messageBuffer.addMessage(`Executing: ${msg.toolName}${toolArgs ? ` ${toolArgs}${toolArgs.length >= 100 ? '...' : ''}` : ''}`, 'tool');
        session.sendAgentMessage('gemini', {
          type: 'tool-call',
          name: msg.toolName,
          callId: msg.callId,
          input: msg.args,
          id: randomUUID(),
        });
        break;

      case 'tool-result':
        // Track change_title completion
        if (msg.toolName === 'change_title' ||
            msg.callId?.includes('change_title') ||
            msg.toolName === 'orbit__change_title' ||
            msg.toolName === 'mcp__orbit__change_title') {
          changeTitleCompleted = true;
          logger.debug('[gemini] change_title completed');
        }
        
        // Show tool result in UI like Codex does
        // Check if result contains error information
        const isError = msg.result && typeof msg.result === 'object' && 'error' in msg.result;
        const resultText = typeof msg.result === 'string' 
          ? msg.result.substring(0, 200)
          : JSON.stringify(msg.result).substring(0, 200);
        const truncatedResult = resultText + (typeof msg.result === 'string' && msg.result.length > 200 ? '...' : '');
        
        const resultSize = typeof msg.result === 'string' 
          ? msg.result.length 
          : JSON.stringify(msg.result).length;
        
        logger.debug(`[gemini] ${isError ? '❌' : '✅'} Tool result received: ${msg.toolName} (${msg.callId}) - Size: ${resultSize} bytes${isError ? ' [ERROR]' : ''}`);
        
        // Process tool result through diff processor to check for diff information (like Codex)
        if (!isError) {
          diffProcessor.processToolResult(msg.toolName, msg.result, msg.callId);
        }
        
        if (isError) {
          const errorMsg = (msg.result as any).error || 'Tool call failed';
          logger.debug(`[gemini] ❌ Tool call error: ${errorMsg.substring(0, 300)}`);
          messageBuffer.addMessage(`Error: ${errorMsg}`, 'status');
        } else {
          // Log summary for large results (like investigation tools)
          if (resultSize > 1000) {
            logger.debug(`[gemini] ✅ Large tool result (${resultSize} bytes) - first 200 chars: ${truncatedResult}`);
          }
          messageBuffer.addMessage(`Result: ${truncatedResult}`, 'result');
        }
        
        session.sendAgentMessage('gemini', {
          type: 'tool-result',
          callId: msg.callId,
          output: msg.result,
          id: randomUUID(),
        });
        break;

      case 'fs-edit':
        messageBuffer.addMessage(`File edit: ${msg.description}`, 'tool');
        
        // Process fs-edit through diff processor (like Codex)
        // msg.diff is optional (diff?: string), so it can be undefined
        diffProcessor.processFsEdit(msg.path || '', msg.description, msg.diff);
        
        session.sendAgentMessage('gemini', {
          type: 'file-edit',
          description: msg.description,
          diff: msg.diff,
          filePath: msg.path || 'unknown',
          id: randomUUID(),
        });
        break;

      default:
        // Handle token-count and other potential message types
        if ((msg as any).type === 'token-count') {
          // Forward token count to mobile app (like Codex)
          // Note: Gemini ACP may not provide token_count events directly,
          // but we handle them if they come from the backend
          session.sendAgentMessage('gemini', {
            type: 'token_count',
            ...(msg as any),
            id: randomUUID(),
          });
        }
        break;

      case 'terminal-output':
        messageBuffer.addMessage(msg.data, 'result');
        session.sendAgentMessage('gemini', {
          type: 'terminal-output',
          data: msg.data,
          callId: (msg as any).callId || randomUUID(),
        });
        break;

      case 'permission-request':
        // Forward permission request to mobile app
        // Note: toolName is in msg.payload.toolName (from AcpBackend), 
        // msg.reason also contains the tool name
        const payload = (msg as any).payload || {};
        session.sendAgentMessage('gemini', {
          type: 'permission-request',
          permissionId: msg.id,
          toolName: payload.toolName || (msg as any).reason || 'unknown',
          description: (msg as any).reason || payload.toolName || '',
          options: payload,
        });
        break;

      case 'exec-approval-request':
        // Handle exec approval request (like Codex exec_approval_request)
        // Convert to tool call for mobile app compatibility
        const execApprovalMsg = msg as any;
        const callId = execApprovalMsg.call_id || execApprovalMsg.callId || randomUUID();
        const { call_id, type, ...inputs } = execApprovalMsg;
        
        logger.debug(`[gemini] Exec approval request received: ${callId}`);
        messageBuffer.addMessage(`Exec approval requested: ${callId}`, 'tool');
        
        session.sendAgentMessage('gemini', {
          type: 'tool-call',
          name: 'GeminiBash', // Similar to Codex's CodexBash
          callId: callId,
          input: inputs,
          id: randomUUID(),
        });
        break;

      case 'patch-apply-begin':
        // Handle patch operation begin (like Codex patch_apply_begin)
        const patchBeginMsg = msg as any;
        const patchCallId = patchBeginMsg.call_id || patchBeginMsg.callId || randomUUID();
        const { call_id: patchCallIdVar, type: patchType, auto_approved, changes } = patchBeginMsg;
        
        // Add UI feedback for patch operation
        const changeCount = changes ? Object.keys(changes).length : 0;
        const filesMsg = changeCount === 1 ? '1 file' : `${changeCount} files`;
        messageBuffer.addMessage(`Modifying ${filesMsg}...`, 'tool');
        logger.debug(`[gemini] Patch apply begin: ${patchCallId}, files: ${changeCount}`);
        
        session.sendAgentMessage('gemini', {
          type: 'tool-call',
          name: 'GeminiPatch', // Similar to Codex's CodexPatch
          callId: patchCallId,
          input: {
            auto_approved,
            changes
          },
          id: randomUUID(),
        });
        break;

      case 'patch-apply-end':
        // Handle patch operation end (like Codex patch_apply_end)
        const patchEndMsg = msg as any;
        const patchEndCallId = patchEndMsg.call_id || patchEndMsg.callId || randomUUID();
        const { call_id: patchEndCallIdVar, type: patchEndType, stdout, stderr, success } = patchEndMsg;
        
        // Add UI feedback for completion
        if (success) {
          const message = stdout || 'Files modified successfully';
          messageBuffer.addMessage(message.substring(0, 200), 'result');
        } else {
          const errorMsg = stderr || 'Failed to modify files';
          messageBuffer.addMessage(`Error: ${errorMsg.substring(0, 200)}`, 'result');
        }
        logger.debug(`[gemini] Patch apply end: ${patchEndCallId}, success: ${success}`);
        
        session.sendAgentMessage('gemini', {
          type: 'tool-result',
          callId: patchEndCallId,
          output: {
            stdout,
            stderr,
            success
          },
          id: randomUUID(),
        });
        break;

      case 'event':
        const configEventResult = applyGeminiSessionConfigEvent({
          name: msg.name,
          payload: msg.payload,
          session,
          thoughtLevelSelector,
        });
        thoughtLevelSelector = configEventResult.thoughtLevelSelector;
        if (configEventResult.handled) {
          break;
        }

        // Handle thinking events - process through ReasoningProcessor like Codex
        if (msg.name === 'thinking') {
          const thinkingPayload = msg.payload as { text?: string } | undefined;
          const thinkingText = (thinkingPayload && typeof thinkingPayload === 'object' && 'text' in thinkingPayload)
            ? String(thinkingPayload.text || '')
            : '';
          if (thinkingText) {
            // Process thinking chunk through reasoning processor
            // This will identify titled reasoning sections (**Title**) and convert them to tool calls
            reasoningProcessor.processChunk(thinkingText);
            
            // Log thinking chunks (especially useful for investigation tools)
            logger.debug(`[gemini] 💭 Thinking chunk received: ${thinkingText.length} chars - Preview: ${thinkingText.substring(0, 100)}...`);
            
            // Show thinking message in UI (truncated like Codex)
            // For titled reasoning (starts with **), ReasoningProcessor will show it as tool call
            // But we still show progress for long operations
            if (!thinkingText.startsWith('**')) {
              // Update existing "Thinking..." message or add new one for untitled reasoning
              const thinkingPreview = thinkingText.substring(0, 100);
              messageBuffer.updateLastMessage(`[Thinking] ${thinkingPreview}...`, 'system');
            }
            // For titled reasoning, ReasoningProcessor will send tool call, but we keep "Thinking..." visible
            // This ensures user sees progress during long reasoning operations
          }
          // Also forward to mobile for UI feedback
          session.sendAgentMessage('gemini', {
            type: 'thinking',
            text: thinkingText,
          });
        }
        break;
    }
    });
  }

  // Note: Backend will be created dynamically in the main loop based on model from first message
  // This allows us to support model changes by recreating the backend

  let first = true;

  async function applyThoughtLevelIfRequested(
    requestedThoughtLevel: string | undefined,
    backend: ConfigurableGeminiBackend | null,
  ): Promise<void> {
    const result = await switchGeminiThoughtLevelIfRequested({
      requestedThoughtLevel,
      thoughtLevelSelector,
      backend,
    });
    thoughtLevelSelector = result.thoughtLevelSelector;
    if (result.currentEffortLevel) {
      currentEffortLevel = result.currentEffortLevel;
    }
  }

  try {
    let currentModeHash: string | null = null;
    let pending: { message: string; mode: GeminiMode; isolate: boolean; hash: string } | null = null;

    while (!shouldExit) {
      let message: { message: string; mode: GeminiMode; isolate: boolean; hash: string } | null = pending;
      pending = null;

      if (!message) {
        logger.debug('[gemini] Main loop: waiting for messages from queue...');
        const waitSignal = abortController.signal;
        const batch = await messageQueue.waitForMessagesAndGetAsString(waitSignal);
        if (!batch) {
          if (waitSignal.aborted && !shouldExit) {
            logger.debug('[gemini] Main loop: wait aborted, continuing...');
            continue;
          }
          logger.debug('[gemini] Main loop: no batch received, breaking...');
          break;
        }
        logger.debug(`[gemini] Main loop: received message from queue (length: ${batch.message.length})`);
        message = batch;
      }

      if (!message) {
        break;
      }

      const lifecycleResult = await ensureGeminiBackendSession({
        state: {
          backend: geminiBackend,
          acpSessionId,
          currentModeHash,
          pendingResumeSessionId,
          first,
          wasSessionCreated,
        },
        turn: {
          hash: message.hash,
          mode: message.mode,
        },
        conversationHistory,
        deps: {
          createBackend: (model, resumeSessionId) => createGeminiBackend({
            cwd: process.cwd(),
            mcpServers,
            permissionHandler,
            cloudToken,
            currentUserEmail,
            resumeSessionId,
            model,
          }),
          setupBackend: (backend) => {
            setupGeminiMessageHandler(backend);
          },
          updateDisplayedModel,
          applyPermissionMode: updatePermissionMode,
          applyThoughtLevel: applyThoughtLevelIfRequested,
          notifyModeChange: ({ injectHistoryContext, preservedMessages, historySummary }) => {
            messageBuffer.addMessage('═'.repeat(40), 'status');
            if (injectHistoryContext) {
              messageBuffer.addMessage(`Switching model (preserving ${preservedMessages} messages of context)...`, 'status');
              logger.debug(`[Gemini] Will inject conversation history: ${historySummary}`);
            } else {
              messageBuffer.addMessage('Starting new Gemini session (mode changed)...', 'status');
            }
          },
          resetModeChangeState: () => {
            permissionHandler.reset();
            reasoningProcessor.abort();
          },
        },
      });
      ({
        backend: geminiBackend,
        acpSessionId,
        currentModeHash,
        pendingResumeSessionId,
        first,
        wasSessionCreated,
      } = lifecycleResult.state);
      const { injectHistoryContext } = lifecycleResult;

      currentModeHash = message.hash;
      // Show only original user message in UI, not the full prompt with system prompt
      const userMessageToShow = message.mode?.originalUserMessage || message.message;
      messageBuffer.addMessage(userMessageToShow, 'user');

      // Mark that we're processing a message to synchronize session swaps
      isProcessingMessage = true;

      try {
        if (!acpSessionId) {
          throw new Error('ACP session not started');
        }
         
        // Reset accumulator when sending a new prompt (not when tool calls start)
        // Reset accumulated response for new prompt
        // This ensures a new assistant message will be created (not updating previous one)
        accumulatedResponse = '';
        isResponseInProgress = false;
        hadToolCallInTurn = false;
        taskStartedSent = false; // Reset so new turn can send task_started
        
        // Track if this prompt contains change_title instruction
        // If so, don't send task_complete until change_title is completed
        pendingChangeTitle = message.message.includes('change_title') ||
                             message.message.includes('orbit__change_title') ||
                             message.message.includes('mcp__orbit__change_title');
        changeTitleCompleted = false;
        
        if (!geminiBackend || !acpSessionId) {
          throw new Error('Gemini backend or session not initialized');
        }
        
        const { promptToSend } = buildPromptForTurn({
          basePrompt: message.message,
          injectHistoryContext,
          conversationHistory,
        });
        await executeGeminiPromptTurn({
          backend: geminiBackend as ConfigurableGeminiBackend,
          acpSessionId,
          promptToSend,
          effortLevel: message.mode.effortLevel,
          applyThoughtLevel: applyThoughtLevelIfRequested,
          onRetry: (attempt, maxRetries) => {
            messageBuffer.addMessage(`Gemini returned empty response, retrying (${attempt}/${maxRetries})...`, 'status');
          },
        });
        
        // Mark as not first message after sending prompt
        if (first) {
          first = false;
        }
      } catch (error) {
        logger.debug('[gemini] Error in gemini session:', error);
        const isAbortError = error instanceof Error && error.name === 'AbortError';
        const errorMsg = normalizeGeminiTurnError(error, displayedModel || DEFAULT_GEMINI_MODEL);

        if (isAbortError) {
          messageBuffer.addMessage(errorMsg, 'status');
          session.sendSessionEvent({ type: 'message', message: errorMsg });
        } else {
          messageBuffer.addMessage(errorMsg, 'status');
          // Use sendAgentMessage for consistency with ACP format
          session.sendAgentMessage('gemini', {
            type: 'message',
            message: errorMsg,
          });
        }
      } finally {
        // Reset permission handler, reasoning processor, and diff processor after turn (like Codex)
        permissionHandler.reset();
        reasoningProcessor.abort(); // Use abort to properly finish any in-progress tool calls
        diffProcessor.reset(); // Reset diff processor on turn completion
        
        // Send accumulated response to mobile app ONLY when turn is complete
        // This prevents message fragmentation from Gemini's chunked responses
        if (accumulatedResponse.trim()) {
          const { text: messageText, options } = parseOptionsFromText(accumulatedResponse);
          
          // Record assistant response in conversation history for context preservation
          conversationHistory.addAssistantMessage(messageText);
          
          // Mobile app parses options from text via parseMarkdown
          let finalMessageText = messageText;
          if (options.length > 0) {
            const optionsXml = formatOptionsXml(options);
            finalMessageText = messageText + optionsXml;
            logger.debug(`[gemini] Found ${options.length} options in response:`, options);
          } else if (hasIncompleteOptions(accumulatedResponse)) {
            logger.debug(`[gemini] Warning: Incomplete options block detected`);
          }
          
          const messagePayload: CodexMessagePayload = {
            type: 'message',
            message: finalMessageText,
            id: randomUUID(),
            ...(options.length > 0 && { options }),
          };
          
          logger.debug(`[gemini] Sending complete message to mobile (length: ${finalMessageText.length}): ${finalMessageText.substring(0, 100)}...`);
          session.sendAgentMessage('gemini', messagePayload);
          accumulatedResponse = '';
          isResponseInProgress = false;
        }
        
        // Send task_complete ONCE at the end of turn (not on every idle)
        // This signals to the UI that the agent has finished processing
        session.sendAgentMessage('gemini', {
          type: 'task_complete',
          id: randomUUID(),
        });
        
        // Reset tracking flags
        hadToolCallInTurn = false;
        pendingChangeTitle = false;
        changeTitleCompleted = false;
        taskStartedSent = false;
        
        thinking = false;
        session.keepAlive(thinking, 'remote');
        
        // Use same logic as Codex - emit ready if idle (no pending operations, no queue)
        emitReadyIfIdle();

        // Message processing complete - safe to apply any pending session swap
        isProcessingMessage = false;
        applyPendingSessionSwap();

        logger.debug(`[gemini] Main loop: turn completed, continuing to next iteration (queue size: ${messageQueue.size()})`);
      }
    }

  } finally {
    // Clean up resources
    logger.debug('[gemini]: Final cleanup start');

    // Cancel offline reconnection if still running
    if (reconnectionHandle) {
      logger.debug('[gemini]: Cancelling offline reconnection');
      reconnectionHandle.cancel();
    }

    try {
      session.sendSessionDeath();
      await session.flush();
      await session.close();
    } catch (e) {
      logger.debug('[gemini]: Error while closing session', e);
    }

    if (geminiBackend) {
      await geminiBackend.dispose();
    }

    orbitServer.stop();

    if (process.stdin.isTTY) {
      try { process.stdin.setRawMode(false); } catch { /* ignore */ }
    }
    if (hasTTY) {
      try { process.stdin.pause(); } catch { /* ignore */ }
    }

    clearInterval(keepAliveInterval);
    if (inkInstance) {
      inkInstance.unmount();
    }
    messageBuffer.clear();

    logger.debug('[gemini]: Final cleanup completed');
  }
}
