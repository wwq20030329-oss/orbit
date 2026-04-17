import fs from 'fs/promises';
import os from 'os';

import { ApiClient } from '@/api/api';
import { TrackedSession } from './types';
import { MachineMetadata, DaemonState, Metadata } from '@/api/types';
import { SpawnSessionOptions, SpawnSessionResult } from '@/modules/common/registerCommonHandlers';
import { logger } from '@/ui/logger';
import { authAndSetupMachineIfNeeded } from '@/ui/auth';
import { configuration } from '@/configuration';
import { startCaffeinate, stopCaffeinate } from '@/utils/caffeinate';
import packageJson from '../../package.json';
import { getEnvironmentInfo } from '@/ui/doctor';
import { spawnOrbitCLI } from '@/utils/spawnOrbitCLI';
import { writeDaemonState, DaemonLocallyPersistedState, readDaemonState, acquireDaemonLock, releaseDaemonLock } from '@/persistence';

import { cleanupDaemonState, isDaemonRunningCurrentlyInstalledOrbitVersion, stopDaemon } from './controlClient';
import { startDaemonControlServer } from './controlServer';
import { readFileSync } from 'fs';
import { join } from 'path';
import { projectPath } from '@/projectPath';
import { getTmuxUtilities, isTmuxAvailable, parseTmuxSessionIdentifier, formatTmuxSessionIdentifier } from '@/utils/tmux';
import { expandEnvironmentVariables } from '@/utils/expandEnvVars';
import { detectCLIAvailability } from '@/utils/detectCLI';
import { buildResumeLaunch } from '@/resume/handleResumeCommand';
import { detectResumeSupport } from '@/resume/localOrbitAgentAuth';
import { resolveOrbitSession } from '@/resume/resolveOrbitSession';
import {
  buildNativeCliResumeLaunch,
  deleteNativeCliHistoryEntry,
  listNativeCliHistory,
  type NativeCliTool,
} from '@/history/nativeCliHistory';
import {
  buildReplayEnvelopes,
  extractClaudeReplayMessages,
  loadClaudeReplayMessages,
  loadCodexReplayMessages,
  loadGeminiReplayMessages,
  type ReplayTextMessage,
} from '@/history/nativeCliHistoryReplay';
import {
  applyRuntimeLivenessToNativeHistoryEntries,
  buildNativeLiveMirrorMetadata,
  buildNativeLiveMirrorTag,
  buildNativeLiveRuntimeDescriptor,
  buildNativeLiveRuntimeId,
  buildNativeLiveSnapshot,
  formatNativeLiveReplayMessage,
  getNativeLiveMirrorKey,
} from './nativeLiveMirror';
import {
  buildOrbitLiveRuntimeDescriptor,
  buildOrbitLiveRuntimeId,
  buildOrbitLiveSnapshot,
} from './orbitLiveRuntime';
import { createInFlightRequestDeduper } from './inFlightRequestDeduper';
import { killDuplicateDaemonSpawnedSessionProcesses, killOrphanDaemonSpawnedSessionProcesses } from './doctor';
import { LiveRuntimeManager } from './liveRuntimeManager';
import {
  findTrackedSessionsByNativeHistorySource,
  findTrackedSessionsByOrbitSessionId,
  findTrackedSessionsForStopTarget,
  type TrackedSessionEntry,
} from './trackedSessions';
import { createCodexAuthHome } from './codexAuthHome';
import { createShutdownController, type ShutdownRequestSource } from './shutdownController';
import { waitForSessionWebhook } from './webhookAwaiter';

// Prepare initial metadata
export const initialMachineMetadata: MachineMetadata = {
  host: os.hostname(),
  platform: os.platform(),
  orbitCliVersion: packageJson.version,
  homeDir: os.homedir(),
  orbitHomeDir: configuration.orbitHomeDir,
  orbitLibDir: projectPath(),
  cliAvailability: detectCLIAvailability(),
  resumeSupport: detectResumeSupport(),
};

export async function startDaemon(): Promise<void> {
  const shutdownController = createShutdownController({
    forceExitAfterMs: 1_000,
    onForceExit: async () => {
      logger.debug('[DAEMON RUN] Startup malfunctioned, forcing exit with code 1');

      await new Promise(resolve => setTimeout(resolve, 100));
      process.exit(1);
    },
  });

  const requestShutdown = (source: ShutdownRequestSource, errorMessage?: string) => {
    logger.debug(`[DAEMON RUN] Requesting shutdown (source: ${source}, errorMessage: ${errorMessage})`);
    const accepted = shutdownController.requestShutdown({ source, errorMessage });
    if (!accepted) {
      logger.debug('[DAEMON RUN] Shutdown already requested, ignoring duplicate request');
    }
  };

  // Setup signal handlers
  process.on('SIGINT', () => {
    logger.debug('[DAEMON RUN] Received SIGINT');
    requestShutdown('os-signal');
  });

  process.on('SIGTERM', () => {
    logger.debug('[DAEMON RUN] Received SIGTERM');
    requestShutdown('os-signal');
  });

  process.on('uncaughtException', (error) => {
    logger.debug('[DAEMON RUN] FATAL: Uncaught exception', error);
    logger.debug(`[DAEMON RUN] Stack trace: ${error.stack}`);
    requestShutdown('exception', error.message);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.debug('[DAEMON RUN] FATAL: Unhandled promise rejection', reason);
    logger.debug(`[DAEMON RUN] Rejected promise:`, promise);
    const error = reason instanceof Error ? reason : new Error(`Unhandled promise rejection: ${reason}`);
    logger.debug(`[DAEMON RUN] Stack trace: ${error.stack}`);
    requestShutdown('exception', error.message);
  });

  process.on('exit', (code) => {
    logger.debug(`[DAEMON RUN] Process exiting with code: ${code}`);
  });

  process.on('beforeExit', (code) => {
    logger.debug(`[DAEMON RUN] Process about to exit with code: ${code}`);
  });

  logger.debug('[DAEMON RUN] Starting daemon process...');
  logger.debugLargeJson('[DAEMON RUN] Environment', getEnvironmentInfo());

  // Check if already running
  // Check if running daemon version matches current CLI version
  const runningDaemonVersionMatches = await isDaemonRunningCurrentlyInstalledOrbitVersion();
  if (!runningDaemonVersionMatches) {
    // TODO: This hand-rolled self-restart path is awkward to reason about and awkward to test.
    // We should probably migrate this daemon to native system service management
    // (launchd/systemd, similar to OpenClaw's model), so startup/start-at-login and upgrades
    // are owned by the OS instead of by the daemon trying to replace itself in-process.
    logger.debug('[DAEMON RUN] Daemon version mismatch detected, restarting daemon with current CLI version');
    await stopDaemon();
  } else {
    logger.debug('[DAEMON RUN] Daemon version matches, keeping existing daemon');
    console.log('Daemon already running with matching version');
    process.exit(0);
  }

  // Acquire exclusive lock (proves daemon is running)
  const daemonLockHandle = await acquireDaemonLock(5, 200);
  if (!daemonLockHandle) {
    logger.debug('[DAEMON RUN] Daemon lock file already held, another daemon is running');
    process.exit(0);
  }

  // At this point we should be safe to startup the daemon:
  // 1. Not have a stale daemon state
  // 2. Should not have another daemon process running

  try {
    const orphanCleanup = await killOrphanDaemonSpawnedSessionProcesses();
    if (orphanCleanup.killed > 0 || orphanCleanup.errors.length > 0) {
      logger.debug('[DAEMON RUN] Cleaned orphan daemon-spawned sessions', orphanCleanup);
    }

    const duplicateCleanup = await killDuplicateDaemonSpawnedSessionProcesses();
    if (duplicateCleanup.killed > 0 || duplicateCleanup.errors.length > 0) {
      logger.debug('[DAEMON RUN] Cleaned duplicate daemon-spawned resume processes', duplicateCleanup);
    }

    // Start caffeinate
    const caffeinateStarted = startCaffeinate();
    if (caffeinateStarted) {
      logger.debug('[DAEMON RUN] Sleep prevention enabled');
    }

    // Ensure auth and machine registration BEFORE anything else
    const { credentials, machineId } = await authAndSetupMachineIfNeeded();
    logger.debug('[DAEMON RUN] Auth and machine setup complete');

    // Setup state - key by PID
    const pidToTrackedSession = new Map<number, TrackedSession>();
    let liveRuntimeManagerRef: LiveRuntimeManager | null = null;

    // Session spawning awaiter system
    const pidToAwaiter = new Map<number, (session: TrackedSession) => void>();
    const inFlightSpawnRequests = createInFlightRequestDeduper<SpawnSessionResult>();

    // Helper functions
    const getCurrentChildren = () => Array.from(pidToTrackedSession.values());
    const getTrackedSessionEntries = (): TrackedSessionEntry[] => (
      Array.from(pidToTrackedSession.entries()).map(([pid, session]) => ({ pid, session }))
    );

    const cleanupTrackedSessionResources = (pid: number, session: TrackedSession, reason: string) => {
      const cleanup = session.resourceCleanup;
      if (!cleanup) {
        return;
      }

      session.resourceCleanup = undefined;
      void Promise.resolve(cleanup()).catch((error) => {
        logger.debug(`[DAEMON RUN] Failed to clean tracked session resources for PID ${pid} (${reason}):`, error);
      });
    };

    const stopTrackedSession = (pid: number, session: TrackedSession, reason: string) => {
      if (session.startedBy === 'daemon' && session.childProcess) {
        try {
          session.childProcess.kill('SIGTERM');
          logger.debug(`[DAEMON RUN] Sent SIGTERM to tracked daemon session PID ${pid} (${reason})`);
        } catch (error) {
          logger.debug(`[DAEMON RUN] Failed to kill tracked daemon session PID ${pid} (${reason}):`, error);
        }
      } else {
        try {
          process.kill(pid, 'SIGTERM');
          logger.debug(`[DAEMON RUN] Sent SIGTERM to tracked external session PID ${pid} (${reason})`);
        } catch (error) {
          logger.debug(`[DAEMON RUN] Failed to kill tracked external session PID ${pid} (${reason}):`, error);
        }
      }

      pidToTrackedSession.delete(pid);
      pidToAwaiter.delete(pid);
      cleanupTrackedSessionResources(pid, session, reason);
    };

    const cleanupTrackedSessionDuplicates = (matches: TrackedSessionEntry[], reason: string) => {
      if (matches.length < 2) {
        return;
      }

      for (const duplicate of matches.slice(1)) {
        stopTrackedSession(duplicate.pid, duplicate.session, `${reason} duplicate cleanup`);
      }
    };

    // Handle webhook from an Orbit session reporting itself
    const onOrbitSessionWebhook = (sessionId: string, sessionMetadata: Metadata) => {
      logger.debugLargeJson(`[DAEMON RUN] Session reported`, sessionMetadata);

      const pid = sessionMetadata.hostPid;
      if (!pid) {
        logger.debug(`[DAEMON RUN] Session webhook missing hostPid for sessionId: ${sessionId}`);
        return;
      }

      logger.debug(`[DAEMON RUN] Session webhook: ${sessionId}, PID: ${pid}, started by: ${sessionMetadata.startedBy || 'unknown'}`);
      logger.debug(`[DAEMON RUN] Current tracked sessions before webhook: ${Array.from(pidToTrackedSession.keys()).join(', ')}`);

      // Check if we already have this PID (daemon-spawned)
      const existingSession = pidToTrackedSession.get(pid);

      if (existingSession && existingSession.startedBy === 'daemon') {
        // Update daemon-spawned session with reported data
        existingSession.orbitSessionId = sessionId;
        existingSession.orbitSessionMetadataFromLocalWebhook = sessionMetadata;
        logger.debug(`[DAEMON RUN] Updated daemon-spawned session ${sessionId} with metadata`);

        // Resolve any awaiter for this PID
        const awaiter = pidToAwaiter.get(pid);
        if (awaiter) {
          pidToAwaiter.delete(pid);
          awaiter(existingSession);
          logger.debug(`[DAEMON RUN] Resolved session awaiter for PID ${pid}`);
        }
      } else if (!existingSession) {
        // New session started externally
        const trackedSession: TrackedSession = {
          startedBy: 'orbit directly - likely launched from terminal',
          orbitSessionId: sessionId,
          orbitSessionMetadataFromLocalWebhook: sessionMetadata,
          pid
        };
        pidToTrackedSession.set(pid, trackedSession);
        logger.debug(`[DAEMON RUN] Registered externally-started session ${sessionId}`);
      }
    };

    // Spawn a new session (sessionId reserved for future --resume functionality)
    const spawnSession = async (options: SpawnSessionOptions): Promise<SpawnSessionResult> => {
      logger.debugLargeJson('[DAEMON RUN] Spawning session', options);

      const { directory, sessionId, machineId, approvedNewDirectoryCreation = true } = options;
      let directoryCreated = false;

      try {
        await fs.access(directory);
        logger.debug(`[DAEMON RUN] Directory exists: ${directory}`);
      } catch (error) {
        logger.debug(`[DAEMON RUN] Directory doesn't exist, creating: ${directory}`);

        // Check if directory creation is approved
        if (!approvedNewDirectoryCreation) {
          logger.debug(`[DAEMON RUN] Directory creation not approved for: ${directory}`);
          return {
            type: 'requestToApproveDirectoryCreation',
            directory
          };
        }

        try {
          await fs.mkdir(directory, { recursive: true });
          logger.debug(`[DAEMON RUN] Successfully created directory: ${directory}`);
          directoryCreated = true;
        } catch (mkdirError: any) {
          let errorMessage = `Unable to create directory at '${directory}'. `;

          // Provide more helpful error messages based on the error code
          if (mkdirError.code === 'EACCES') {
            errorMessage += `Permission denied. You don't have write access to create a folder at this location. Try using a different path or check your permissions.`;
          } else if (mkdirError.code === 'ENOTDIR') {
            errorMessage += `A file already exists at this path or in the parent path. Cannot create a directory here. Please choose a different location.`;
          } else if (mkdirError.code === 'ENOSPC') {
            errorMessage += `No space left on device. Your disk is full. Please free up some space and try again.`;
          } else if (mkdirError.code === 'EROFS') {
            errorMessage += `The file system is read-only. Cannot create directories here. Please choose a writable location.`;
          } else {
            errorMessage += `System error: ${mkdirError.message || mkdirError}. Please verify the path is valid and you have the necessary permissions.`;
          }

          logger.debug(`[DAEMON RUN] Directory creation failed: ${errorMessage}`);
          return {
            type: 'error',
            errorMessage
          };
        }
      }

      try {

        // Build environment variables for session spawning
        // Authentication tokens are resolved here

        // Resolve authentication token if provided
        const authEnv: Record<string, string> = {};
        let resourceCleanup: (() => Promise<void>) | undefined;
        if (options.token) {
          if (options.agent === 'codex') {
            const codexAuthHome = await createCodexAuthHome(options.token);
            authEnv.CODEX_HOME = codexAuthHome.homeDir;
            resourceCleanup = codexAuthHome.cleanup;
          } else { // Assuming claude
            authEnv.CLAUDE_CODE_OAUTH_TOKEN = options.token;
          }
        }

        let extraEnv = {
          ...authEnv,
          ...(options.environmentVariables ?? {}),
        };
        logger.debug(`[DAEMON RUN] Environment variable keys (before expansion) (${Object.keys(extraEnv).length}): ${Object.keys(extraEnv).join(', ')}`);

        // Expand ${VAR} references from daemon's process.env
        // This ensures variable substitution works in both tmux and non-tmux modes
        // Example: ANTHROPIC_AUTH_TOKEN="${Z_AI_AUTH_TOKEN}" → ANTHROPIC_AUTH_TOKEN="sk-real-key"
        extraEnv = expandEnvironmentVariables(extraEnv, process.env);
        logger.debug(`[DAEMON RUN] After variable expansion: ${Object.keys(extraEnv).join(', ')}`);

        // Fail fast if any passed-through environment variable still contains an
        // unresolved ${VAR} reference after expansion.
        const unresolvedEnvEntries = Object.entries(extraEnv).flatMap(([key, value]) => {
          if (typeof value !== 'string' || !value.includes('${')) {
            return [];
          }

          const unresolvedMatch = value.match(/\$\{([^}]+)\}/);
          if (!unresolvedMatch) {
            return [];
          }

          const expression = unresolvedMatch[1];
          const defaultSeparatorIndex = expression.indexOf(':-');
          const missingVar = defaultSeparatorIndex === -1
            ? expression
            : expression.slice(0, defaultSeparatorIndex);

          return [`${key} references \${${missingVar}} which is not defined`];
        });

        if (unresolvedEnvEntries.length > 0) {
          const errorMessage = `Session environment is invalid - environment variables not found in daemon: ${unresolvedEnvEntries.join('; ')}. ` +
            `Ensure these variables are set in the daemon's environment before starting sessions.`;
          logger.warn(`[DAEMON RUN] ${errorMessage}`);
          return {
            type: 'error',
            errorMessage
          };
        }

        // Check if tmux is available and should be used
        const tmuxAvailable = await isTmuxAvailable();
        let useTmux = tmuxAvailable;

        // Get tmux session name from environment variables (now set by profile system)
        // Empty string means "use current/most recent session" (tmux default behavior)
        let tmuxSessionName: string | undefined = extraEnv.TMUX_SESSION_NAME;

        // If tmux is not available or session name is explicitly undefined, fall back to regular spawning
        // Note: Empty string is valid (means use current/most recent tmux session)
        if (!tmuxAvailable || tmuxSessionName === undefined) {
          useTmux = false;
          if (tmuxSessionName !== undefined) {
            logger.debug(`[DAEMON RUN] tmux session name specified but tmux not available, falling back to regular spawning`);
          }
        }

        if (useTmux && tmuxSessionName !== undefined) {
          // Try to spawn in tmux session
          const sessionDesc = tmuxSessionName || 'current/most recent session';
          logger.debug(`[DAEMON RUN] Attempting to spawn session in tmux: ${sessionDesc}`);

          const tmux = getTmuxUtilities(tmuxSessionName);

          // Construct command for the CLI
          const cliPath = join(projectPath(), 'dist', 'index.mjs');
          // Determine agent command - support claude, codex, and gemini
          const agent = options.agent === 'gemini' ? 'gemini' : (options.agent === 'codex' ? 'codex' : (options.agent === 'openclaw' ? 'openclaw' : 'claude'));
          const fullCommand = `node --no-warnings --no-deprecation ${cliPath} ${agent} --orbit-starting-mode remote --started-by daemon`;

          // Spawn in tmux with environment variables
          // IMPORTANT: Pass complete environment (process.env + extraEnv) because:
          // 1. tmux sessions need daemon's expanded auth variables (e.g., ANTHROPIC_AUTH_TOKEN)
          // 2. Regular spawn uses env: { ...process.env, ...extraEnv }
          // 3. tmux needs explicit environment via -e flags to ensure all variables are available
          const windowName = `orbit-${Date.now()}-${agent}`;
          const tmuxEnv: Record<string, string> = {};

          // Add all daemon environment variables (filtering out undefined)
          for (const [key, value] of Object.entries(process.env)) {
            if (value !== undefined) {
              tmuxEnv[key] = value;
            }
          }

          // Add extra environment variables (these should already be filtered)
          Object.assign(tmuxEnv, extraEnv);

          const tmuxResult = await tmux.spawnInTmux([fullCommand], {
            sessionName: tmuxSessionName,
            windowName: windowName,
            cwd: directory
          }, tmuxEnv);  // Pass complete environment for tmux session

          if (tmuxResult.success) {
            logger.debug(`[DAEMON RUN] Successfully spawned in tmux session: ${tmuxResult.sessionId}, PID: ${tmuxResult.pid}`);

            // Validate we got a PID from tmux
            if (!tmuxResult.pid) {
              throw new Error('Tmux window created but no PID returned');
            }

            // Create a tracked session for tmux windows - now we have the real PID!
            const trackedSession: TrackedSession = {
              startedBy: 'daemon',
              pid: tmuxResult.pid, // Real PID from tmux -P flag
              tmuxSessionId: tmuxResult.sessionId,
              resourceCleanup,
              directoryCreated,
              message: directoryCreated
                ? `The path '${directory}' did not exist. We created a new folder and spawned a new session in tmux session '${tmuxSessionName}'. Use 'tmux attach -t ${tmuxSessionName}' to view the session.`
                : `Spawned new session in tmux session '${tmuxSessionName}'. Use 'tmux attach -t ${tmuxSessionName}' to view the session.`
            };

            // Add to tracking map so webhook can find it later
            pidToTrackedSession.set(tmuxResult.pid, trackedSession);

            // Wait for webhook to populate session with orbitSessionId (exact same as regular flow)
            logger.debug(`[DAEMON RUN] Waiting for session webhook for PID ${tmuxResult.pid} (tmux)`);

            return waitForSessionWebhook({
              pid: tmuxResult.pid,
              pidToAwaiter,
              timeoutMs: 15_000,
              timeoutLabel: `PID ${tmuxResult.pid} (tmux)`,
              onTimeout: () => {
                logger.debug(`[DAEMON RUN] Session webhook timeout for PID ${tmuxResult.pid} (tmux)`);
                const trackedSession = pidToTrackedSession.get(tmuxResult.pid!);
                if (trackedSession) {
                  stopTrackedSession(tmuxResult.pid!, trackedSession, `webhook-timeout:${tmuxResult.pid}`);
                }
              },
            });
          } else {
            logger.debug(`[DAEMON RUN] Failed to spawn in tmux: ${tmuxResult.error}, falling back to regular spawning`);
            useTmux = false;
          }
        }

        // Regular process spawning (fallback or if tmux not available)
        if (!useTmux) {
          logger.debug(`[DAEMON RUN] Using regular process spawning`);

          // Construct arguments for the CLI - support claude, codex, and gemini
          let agentCommand: string;
          switch (options.agent) {
            case 'claude':
            case undefined:
              agentCommand = 'claude';
              break;
            case 'codex':
              agentCommand = 'codex';
              break;
            case 'gemini':
              agentCommand = 'gemini';
              break;
            case 'openclaw':
              agentCommand = 'openclaw';
              break;
            default:
              return {
                type: 'error',
                errorMessage: `Unsupported agent type: '${options.agent}'. Please update your CLI to the latest version.`
              };
          }
          const args = [
            agentCommand,
            '--orbit-starting-mode', 'remote',
            '--started-by', 'daemon'
          ];

          // TODO: In future, sessionId could be used with --resume to continue existing sessions
          // For now, we ignore it - each spawn creates a new session
          return spawnTrackedOrbitProcess({
            args,
            cwd: directory,
            env: {
              ...process.env,
              ...extraEnv
            },
            directoryCreated,
            message: directoryCreated ? `The path '${directory}' did not exist. We created a new folder and spawned a new session there.` : undefined,
            resourceCleanup,
          });
        }

        // This should never be reached, but TypeScript requires a return statement
        return {
          type: 'error',
          errorMessage: 'Unexpected error in session spawning'
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.debug('[DAEMON RUN] Failed to spawn session:', error);
        return {
          type: 'error',
          errorMessage: `Failed to spawn session: ${errorMessage}`
        };
      }
    };

    const spawnTrackedOrbitProcess = ({
      args,
      cwd,
      env,
      directoryCreated = false,
      message,
      resourceCleanup,
    }: {
      args: string[];
      cwd: string;
      env: NodeJS.ProcessEnv;
      directoryCreated?: boolean;
      message?: string;
      resourceCleanup?: () => Promise<void>;
    }): Promise<SpawnSessionResult> => {
      const orbitProcess = spawnOrbitCLI(args, {
        cwd,
        detached: true,
        stdio: 'ignore',
        env,
      });

      if (!orbitProcess.pid) {
        logger.debug('[DAEMON RUN] Failed to spawn process - no PID returned');
        return Promise.resolve({
          type: 'error',
          errorMessage: 'Failed to spawn Orbit process - no PID returned'
        });
      }

      logger.debug(`[DAEMON RUN] Spawned process with PID ${orbitProcess.pid}`);

      const trackedSession: TrackedSession = {
        startedBy: 'daemon',
        pid: orbitProcess.pid,
        childProcess: orbitProcess,
        resourceCleanup,
        directoryCreated,
        message,
      };

      pidToTrackedSession.set(orbitProcess.pid, trackedSession);

      orbitProcess.on('exit', (code, signal) => {
        logger.debug(`[DAEMON RUN] Child PID ${orbitProcess.pid} exited with code ${code}, signal ${signal}`);
        if (orbitProcess.pid) {
          onChildExited(orbitProcess.pid);
        }
      });

      orbitProcess.on('error', (error) => {
        logger.debug(`[DAEMON RUN] Child process error:`, error);
        if (orbitProcess.pid) {
          onChildExited(orbitProcess.pid);
        }
      });

      logger.debug(`[DAEMON RUN] Waiting for session webhook for PID ${orbitProcess.pid}`);

      return waitForSessionWebhook({
        pid: orbitProcess.pid,
        pidToAwaiter,
        timeoutMs: 15_000,
        timeoutLabel: `PID ${orbitProcess.pid}`,
        onTimeout: () => {
          logger.debug(`[DAEMON RUN] Session webhook timeout for PID ${orbitProcess.pid}`);
          const timedOutSession = pidToTrackedSession.get(orbitProcess.pid!);
          if (timedOutSession) {
            stopTrackedSession(orbitProcess.pid!, timedOutSession, `webhook-timeout:${orbitProcess.pid}`);
          }
        },
      });
    };

    const resumeSession = async (orbitSessionId: string): Promise<SpawnSessionResult> => {
      return inFlightSpawnRequests.run(`resume-orbit:${orbitSessionId}`, async () => {
        try {
          const existingMatches = findTrackedSessionsByOrbitSessionId(getTrackedSessionEntries(), orbitSessionId);
          const existingTrackedSession = existingMatches[0];
          if (existingTrackedSession?.session.orbitSessionId) {
            cleanupTrackedSessionDuplicates(existingMatches, `resume-orbit:${orbitSessionId}`);
            logger.debug(`[DAEMON RUN] Reusing tracked Orbit session ${orbitSessionId} on PID ${existingTrackedSession.pid}`);
            return {
              type: 'success',
              sessionId: existingTrackedSession.session.orbitSessionId,
            };
          }

          const previousSession = await resolveOrbitSession(orbitSessionId);
          const launch = buildResumeLaunch(previousSession, {
            startedBy: 'daemon',
            claudeStartingMode: 'remote',
          });

          await fs.access(launch.cwd);

          return spawnTrackedOrbitProcess({
            args: launch.args,
            cwd: launch.cwd,
            env: { ...process.env },
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.debug('[DAEMON RUN] Failed to resume session:', error);
          return {
            type: 'error',
            errorMessage: `Failed to resume session: ${errorMessage}`,
          };
        }
      });
    };

    const listNativeCliHistoryForMachine = async (limit?: number) => {
      const entries = await listNativeCliHistory({ limit });
      return applyRuntimeLivenessToNativeHistoryEntries(
        entries,
        liveRuntimeManagerRef?.listRuntimes() ?? [],
      );
    };

    const deleteNativeCliHistoryEntryForMachine = async (params: {
      tool: NativeCliTool;
      backendId: string;
      workingDirectory?: string;
    }) => {
      return await deleteNativeCliHistoryEntry({
        tool: params.tool,
        backendId: params.backendId,
        workingDirectory: params.workingDirectory,
      });
    };

    const resumeNativeCliHistorySession = async (params: {
      tool: NativeCliTool;
      backendId: string;
      workingDirectory: string;
      title: string;
      summary?: string | null;
      updatedAt?: number | null;
    }): Promise<SpawnSessionResult> => {
      const dedupeKey = `resume-native:${params.tool}:${params.backendId}:${params.workingDirectory}`;
      return inFlightSpawnRequests.run(dedupeKey, async () => {
        try {
          const existingMatches = findTrackedSessionsByNativeHistorySource(
            getTrackedSessionEntries(),
            params.tool,
            params.backendId,
          );
          const existingTrackedSession = existingMatches[0];
          if (existingTrackedSession?.session.orbitSessionId) {
            cleanupTrackedSessionDuplicates(existingMatches, dedupeKey);
            logger.debug(
              `[DAEMON RUN] Reusing tracked native history session ${params.tool}:${params.backendId} on PID ${existingTrackedSession.pid}`,
            );
            return {
              type: 'success',
              sessionId: existingTrackedSession.session.orbitSessionId,
            };
          }

          await fs.access(params.workingDirectory);

          const launch = buildNativeCliResumeLaunch({
            id: `${params.tool}:${params.backendId}`,
            tool: params.tool,
            backendId: params.backendId,
            workingDirectory: params.workingDirectory,
            title: params.title,
            summary: params.summary ?? null,
            updatedAt: params.updatedAt ?? Date.now(),
          }, {
            startedBy: 'daemon',
            claudeStartingMode: 'remote',
          });

          return spawnTrackedOrbitProcess({
            args: launch.args,
            cwd: launch.cwd,
            env: {
              ...process.env,
              ORBIT_IMPORT_NATIVE_HISTORY: '1',
              ORBIT_NATIVE_HISTORY_TOOL: params.tool,
              ORBIT_NATIVE_HISTORY_BACKEND_ID: params.backendId,
              ORBIT_NATIVE_HISTORY_TITLE: params.title,
              ORBIT_NATIVE_HISTORY_SUMMARY: params.summary ?? '',
              ORBIT_NATIVE_HISTORY_UPDATED_AT: String(params.updatedAt ?? Date.now()),
            },
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.debug('[DAEMON RUN] Failed to resume native CLI history session:', error);
          return {
            type: 'error',
            errorMessage: `Failed to resume native CLI history session: ${errorMessage}`,
          };
        }
      });
    };

    // Stop a session by sessionId or PID fallback
    const stopSession = (sessionId: string): boolean => {
      logger.debug(`[DAEMON RUN] Attempting to stop session ${sessionId}`);

      const matches = findTrackedSessionsForStopTarget(getTrackedSessionEntries(), sessionId);
      if (matches.length === 0) {
        logger.debug(`[DAEMON RUN] Session ${sessionId} not found`);
        return false;
      }

      for (const match of matches) {
        stopTrackedSession(match.pid, match.session, `stop-session:${sessionId}`);
      }

      logger.debug(`[DAEMON RUN] Removed ${matches.length} tracked session(s) for ${sessionId}`);
      return true;
    };

    // Handle child process exit
    const onChildExited = (pid: number) => {
      logger.debug(`[DAEMON RUN] Removing exited process PID ${pid} from tracking`);
      const session = pidToTrackedSession.get(pid);
      pidToTrackedSession.delete(pid);
      pidToAwaiter.delete(pid);
      if (session) {
        cleanupTrackedSessionResources(pid, session, 'child-exited');
      }
    };

    // Start control server
    const { port: controlPort, stop: stopControlServer } = await startDaemonControlServer({
      getChildren: getCurrentChildren,
      stopSession,
      spawnSession,
      requestShutdown: () => requestShutdown('orbit-cli'),
      onOrbitSessionWebhook
    });

    // Write initial daemon state (no lock needed for state file)
    const fileState: DaemonLocallyPersistedState = {
      pid: process.pid,
      httpPort: controlPort,
      startTime: new Date().toLocaleString(),
      startedWithCliVersion: packageJson.version,
      daemonLogPath: logger.logFilePath
    };
    writeDaemonState(fileState);
    logger.debug('[DAEMON RUN] Daemon state written');

    // Prepare initial daemon state
    const initialDaemonState: DaemonState = {
      status: 'offline',
      pid: process.pid,
      httpPort: controlPort,
      startedAt: Date.now()
    };

    // Create API client
    const api = await ApiClient.create(credentials);

    // Get or create machine
    const machine = await api.getOrCreateMachine({
      machineId,
      metadata: initialMachineMetadata,
      daemonState: initialDaemonState
    });
    logger.debug(`[DAEMON RUN] Machine registered: ${machine.id}`);

    // Create realtime machine session
    const apiMachine = api.machineSyncClient(machine);
    const nativeLiveMirrorClients = new Map<string, ReturnType<typeof api.sessionSyncClient>>();
    const nativeLiveMirrorCounts = new Map<string, number>();
    const liveRuntimeManager = new LiveRuntimeManager({ bufferSize: 500 });
    liveRuntimeManagerRef = liveRuntimeManager;
    const nativeLiveRuntimeCounts = new Map<string, number>();
    const nativeLiveRuntimeSnapshots = new Map<string, string>();
    const orbitTmuxRuntimeSnapshots = new Map<string, string>();

    const findTrackedTmuxRuntime = (runtimeId: string) => {
      return getCurrentChildren().find((session) => (
        session.orbitSessionId
        && session.tmuxSessionId
        && buildOrbitLiveRuntimeId(session.orbitSessionId) === runtimeId
      )) ?? null;
    };

    liveRuntimeManager.on('frame', (frame) => {
      apiMachine.emitLiveFrame(frame);
    });

    liveRuntimeManager.on('detach', (event) => {
      apiMachine.detachLiveRuntime(event);
    });

    // Set RPC handlers
    apiMachine.setRPCHandlers({
      spawnSession,
      resumeSession,
      listNativeCliHistory: listNativeCliHistoryForMachine,
      deleteNativeCliHistoryEntry: deleteNativeCliHistoryEntryForMachine,
      resumeNativeCliHistorySession,
      stopSession,
      requestShutdown: () => requestShutdown('orbit-app')
    });

    apiMachine.setLiveMirrorHandlers({
      onResize: async (payload) => {
        const trackedRuntime = findTrackedTmuxRuntime(payload.runtimeId);
        if (trackedRuntime?.tmuxSessionId) {
          const tmux = getTmuxUtilities(parseTmuxSessionIdentifier(trackedRuntime.tmuxSessionId).session);
          const resized = await tmux.resizePane(trackedRuntime.tmuxSessionId, payload.cols, payload.rows);
          if (!resized) {
            return;
          }
        }

        const descriptor = liveRuntimeManager.updateRuntimeSize(payload.runtimeId, payload.cols, payload.rows);
        apiMachine.updateLiveRuntime(descriptor);
      },
      onControl: async (payload) => {
        const runtime = liveRuntimeManager.getRuntime(payload.runtimeId);
        if (!runtime) {
          return;
        }
        const descriptor = liveRuntimeManager.upsertRuntimeDescriptor({
          ...runtime,
          controlMode: payload.mode,
          updatedAt: Date.now(),
        });
        apiMachine.updateLiveRuntime(descriptor);
      },
      onInput: async (payload) => {
        const trackedRuntime = findTrackedTmuxRuntime(payload.runtimeId);
        if (!trackedRuntime?.tmuxSessionId) {
          return;
        }

        const tmux = getTmuxUtilities(parseTmuxSessionIdentifier(trackedRuntime.tmuxSessionId).session);
        await tmux.sendInput(trackedRuntime.tmuxSessionId, payload.data);
      },
    });

    // Connect to server
    apiMachine.connect();

    const enableNativeLiveMirrors = process.env.ORBIT_ENABLE_NATIVE_LIVE_MIRRORS === '1';
    const enableLiveRuntimeMirror = process.env.ORBIT_ENABLE_LIVE_RUNTIME_MIRROR !== '0';
    const liveRuntimeMirrorIntervalMs = parseInt(process.env.ORBIT_LIVE_RUNTIME_MIRROR_INTERVAL || '1500');

    const loadReplayMessagesForEntry = async (entry: Awaited<ReturnType<typeof listNativeCliHistory>>[number]): Promise<ReplayTextMessage[]> => {
      if (entry.tool === 'claude') {
        return extractClaudeReplayMessages(
          await loadClaudeReplayMessages(entry.workingDirectory, entry.backendId),
        );
      }

      if (entry.tool === 'codex') {
        return await loadCodexReplayMessages(entry.backendId);
      }

      return await loadGeminiReplayMessages(entry.backendId);
    };

    const syncOrbitTmuxRuntimes = async (): Promise<Set<string>> => {
      const runtimeIds = new Set<string>();

      for (const trackedSession of getCurrentChildren()) {
        const descriptor = buildOrbitLiveRuntimeDescriptor(trackedSession, machineId);
        if (!descriptor) {
          continue;
        }

        runtimeIds.add(descriptor.runtimeId);
        const existingRuntime = liveRuntimeManager.getRuntime(descriptor.runtimeId);
        if (!existingRuntime) {
          const { seq: _seq, updatedAt: _updatedAt, ...registerOptions } = descriptor;
          const registeredRuntime = liveRuntimeManager.registerRuntime(registerOptions);
          apiMachine.registerLiveRuntime(registeredRuntime);
        } else {
          const updatedRuntime = liveRuntimeManager.upsertRuntimeDescriptor({
            ...descriptor,
            seq: existingRuntime.seq,
            cols: existingRuntime.cols,
            rows: existingRuntime.rows,
            controlMode: existingRuntime.controlMode,
          });
          apiMachine.updateLiveRuntime(updatedRuntime);
        }

        const tmux = getTmuxUtilities(parseTmuxSessionIdentifier(trackedSession.tmuxSessionId!).session);
        const paneText = await tmux.capturePaneText(trackedSession.tmuxSessionId!, { scrollbackLines: 300 });
        const snapshot = buildOrbitLiveSnapshot(paneText);
        const previousSnapshot = orbitTmuxRuntimeSnapshots.get(descriptor.runtimeId);
        if (snapshot && snapshot !== previousSnapshot) {
          orbitTmuxRuntimeSnapshots.set(descriptor.runtimeId, snapshot);
          liveRuntimeManager.appendFrame(descriptor.runtimeId, 'snapshot', snapshot, Date.now());
        }
      }

      return runtimeIds;
    };

    const syncLiveRuntimeMirror = async () => {
      const liveRuntimeIds = await syncOrbitTmuxRuntimes();
      const liveEntries = (await listNativeCliHistory({ limit: 100 }))
        .filter((entry) => entry.isLive);

      for (const entry of liveEntries) {
        const runtimeId = buildNativeLiveRuntimeId(entry);
        liveRuntimeIds.add(runtimeId);
        const nextDescriptor = buildNativeLiveRuntimeDescriptor(entry, machineId);
        const existingRuntime = liveRuntimeManager.getRuntime(runtimeId);

        if (!existingRuntime) {
          const { seq: _seq, updatedAt: _updatedAt, ...registerOptions } = nextDescriptor;
          const descriptor = liveRuntimeManager.registerRuntime(registerOptions);
          apiMachine.registerLiveRuntime(descriptor);
        } else {
          const descriptor = liveRuntimeManager.upsertRuntimeDescriptor({
            ...nextDescriptor,
            seq: existingRuntime.seq,
          });
          apiMachine.updateLiveRuntime(descriptor);
        }

        const messages = await loadReplayMessagesForEntry(entry);
        const snapshot = buildNativeLiveSnapshot(messages);
        const previousSnapshot = nativeLiveRuntimeSnapshots.get(runtimeId);
        if (snapshot.length > 0 && snapshot !== previousSnapshot) {
          nativeLiveRuntimeSnapshots.set(runtimeId, snapshot);
          liveRuntimeManager.appendFrame(runtimeId, 'snapshot', snapshot, entry.updatedAt);
        }

        const previousCount = nativeLiveRuntimeCounts.get(runtimeId) ?? 0;
        const startIndex = previousCount > messages.length ? 0 : previousCount;
        for (const message of messages.slice(startIndex)) {
          liveRuntimeManager.appendFrame(
            runtimeId,
            'output',
            formatNativeLiveReplayMessage(message),
            message.timestamp,
          );
        }
        nativeLiveRuntimeCounts.set(runtimeId, messages.length);
      }

      for (const runtime of liveRuntimeManager.listRuntimes()) {
        if (liveRuntimeIds.has(runtime.runtimeId)) {
          continue;
        }

        liveRuntimeManager.detachRuntime(runtime.runtimeId, 'runtime-ended', 'Live runtime ended');
        nativeLiveRuntimeCounts.delete(runtime.runtimeId);
        nativeLiveRuntimeSnapshots.delete(runtime.runtimeId);
        orbitTmuxRuntimeSnapshots.delete(runtime.runtimeId);
      }
    };

    const syncNativeLiveMirrors = async () => {
      const liveEntries = (await listNativeCliHistory({ limit: 100 }))
        .filter((entry) => entry.isLive);
      const liveKeys = new Set(liveEntries.map((entry) => getNativeLiveMirrorKey(entry)));

      for (const entry of liveEntries) {
        const key = getNativeLiveMirrorKey(entry);
        let client = nativeLiveMirrorClients.get(key);

        if (!client) {
          const sessionRecord = await api.getOrCreateSession({
            tag: buildNativeLiveMirrorTag(entry),
            metadata: buildNativeLiveMirrorMetadata(entry, machineId),
            state: { controlledByUser: false },
            suppressNetworkFailure: true,
          });

          if (!sessionRecord) {
            continue;
          }

          client = api.sessionSyncClient(sessionRecord);
          nativeLiveMirrorClients.set(key, client);
        }

        if (entry.tool === 'claude') {
          const messages = await loadClaudeReplayMessages(entry.workingDirectory, entry.backendId);
          const previousCount = nativeLiveMirrorCounts.get(key) ?? 0;
          const startIndex = previousCount > messages.length ? 0 : previousCount;
          for (const message of messages.slice(startIndex)) {
            client.sendClaudeSessionMessage(message);
          }
          nativeLiveMirrorCounts.set(key, messages.length);
        } else if (entry.tool === 'codex') {
          const messages = await loadCodexReplayMessages(entry.backendId);
          const envelopes = buildReplayEnvelopes(entry.backendId, messages);
          const previousCount = nativeLiveMirrorCounts.get(key) ?? 0;
          const startIndex = previousCount > envelopes.length ? 0 : previousCount;
          for (const envelope of envelopes.slice(startIndex)) {
            client.sendSessionProtocolMessage(envelope);
          }
          nativeLiveMirrorCounts.set(key, envelopes.length);
        } else {
          const messages = await loadGeminiReplayMessages(entry.backendId);
          const envelopes = buildReplayEnvelopes(entry.backendId, messages);
          const previousCount = nativeLiveMirrorCounts.get(key) ?? 0;
          const startIndex = previousCount > envelopes.length ? 0 : previousCount;
          for (const envelope of envelopes.slice(startIndex)) {
            client.sendSessionProtocolMessage(envelope);
          }
          nativeLiveMirrorCounts.set(key, envelopes.length);
        }

        client.keepAlive(false, 'local');
        await client.flush();
      }

      for (const [key, client] of nativeLiveMirrorClients.entries()) {
        if (liveKeys.has(key)) {
          continue;
        }
        client.sendSessionDeath();
        await client.flush();
        await client.close();
        nativeLiveMirrorClients.delete(key);
      }
    };

    let nativeLiveMirrorRunning = false;
    const runNativeLiveMirrors = async () => {
      if (nativeLiveMirrorRunning) {
        return;
      }
      nativeLiveMirrorRunning = true;
      try {
        await syncNativeLiveMirrors();
      } catch (error) {
        logger.debug('[DAEMON RUN] Native live mirror sync failed:', error);
      } finally {
        nativeLiveMirrorRunning = false;
      }
    };

    let liveRuntimeMirrorRunning = false;
    const runLiveRuntimeMirror = async () => {
      if (liveRuntimeMirrorRunning) {
        return;
      }
      liveRuntimeMirrorRunning = true;
      try {
        await syncLiveRuntimeMirror();
      } catch (error) {
        logger.debug('[DAEMON RUN] Live runtime mirror sync failed:', error);
      } finally {
        liveRuntimeMirrorRunning = false;
      }
    };

    let nativeLiveMirrorInterval: ReturnType<typeof setInterval> | null = null;
    let liveRuntimeMirrorInterval: ReturnType<typeof setInterval> | null = null;
    if (enableNativeLiveMirrors) {
      await runNativeLiveMirrors();
      nativeLiveMirrorInterval = setInterval(() => {
        void runNativeLiveMirrors();
      }, 5000);
    } else {
      logger.debug('[DAEMON RUN] Native live mirror sync disabled; relying on on-demand history resume');
    }

    if (enableLiveRuntimeMirror) {
      await runLiveRuntimeMirror();
      liveRuntimeMirrorInterval = setInterval(() => {
        void runLiveRuntimeMirror();
      }, liveRuntimeMirrorIntervalMs);
    } else {
      logger.debug('[DAEMON RUN] Live runtime mirror disabled');
    }

    // Every 60 seconds:
    // 1. Prune stale sessions
    // 2. Check if daemon needs update
    // 3. If outdated, restart with latest version
    // 4. Write heartbeat
    const heartbeatIntervalMs = parseInt(process.env.ORBIT_DAEMON_HEARTBEAT_INTERVAL || '60000');
    let heartbeatRunning = false
    const restartOnStaleVersionAndHeartbeat = setInterval(async () => {
      if (heartbeatRunning) {
        return;
      }
      heartbeatRunning = true;

      if (process.env.DEBUG) {
        logger.debug(`[DAEMON RUN] Health check started at ${new Date().toLocaleString()}`);
      }

      // Prune stale sessions
      for (const [pid, _] of pidToTrackedSession.entries()) {
        try {
          // Check if process is still alive (signal 0 doesn't kill, just checks)
          process.kill(pid, 0);
        } catch (error) {
          // Process is dead, remove from tracking
          logger.debug(`[DAEMON RUN] Removing stale session with PID ${pid} (process no longer exists)`);
          const staleSession = pidToTrackedSession.get(pid);
          pidToTrackedSession.delete(pid);
          pidToAwaiter.delete(pid);
          if (staleSession) {
            cleanupTrackedSessionResources(pid, staleSession, 'heartbeat-stale-prune');
          }
        }
      }

      // Check if daemon needs update
      // If version on disk is different from the one in package.json - we need to restart
      // BIG if - does this get updated from underneath us on npm upgrade?
      const projectVersion = JSON.parse(readFileSync(join(projectPath(), 'package.json'), 'utf-8')).version;
      if (projectVersion !== configuration.currentCliVersion) {
        // TODO: We probably do not want to keep this in-process self-restart logic long-term.
        // A native service manager would make startup and upgrades much simpler: the CLI would
        // ask the OS to start the latest daemon instead of hand-rolling respawn/kill behavior here.
        logger.debug('[DAEMON RUN] Daemon is outdated, triggering self-restart with latest version, clearing heartbeat interval');

        clearInterval(restartOnStaleVersionAndHeartbeat);

        // Spawn new daemon through the CLI
        // We do not need to clean ourselves up - we will be killed by
        // the CLI start command.
        // 1. It will first check if daemon is running (yes in this case)
        // 2. If the version is stale (it will read daemon.state.json file and check startedWithCliVersion) & compare it to its own version
        // 3. Next it will start a new daemon with the latest version with daemon-sync :D
        // Done!
        try {
          spawnOrbitCLI(['daemon', 'start'], {
            detached: true,
            stdio: 'ignore'
          });
        } catch (error) {
          logger.debug('[DAEMON RUN] Failed to spawn new daemon, this is quite likely to happen during integration tests as we are cleaning out dist/ directory', error);
        }

        // So we can just hang forever
        logger.debug('[DAEMON RUN] Hanging for a bit - waiting for CLI to kill us because we are running outdated version of the code');
        await new Promise(resolve => setTimeout(resolve, 10_000));
        process.exit(0);
      }

      // Before wrecklessly overriting the daemon state file, we should check if we are the ones who own it
      // Race condition is possible, but thats okay for the time being :D
      const daemonState = await readDaemonState();
      if (daemonState && daemonState.pid !== process.pid) {
        logger.debug('[DAEMON RUN] Somehow a different daemon was started without killing us. We should kill ourselves.')
        requestShutdown('exception', 'A different daemon was started without killing us. We should kill ourselves.')
      }

      // Heartbeat
      try {
        const updatedState: DaemonLocallyPersistedState = {
          pid: process.pid,
          httpPort: controlPort,
          startTime: fileState.startTime,
          startedWithCliVersion: packageJson.version,
          lastHeartbeat: new Date().toLocaleString(),
          daemonLogPath: fileState.daemonLogPath
        };
        writeDaemonState(updatedState);
        if (process.env.DEBUG) {
          logger.debug(`[DAEMON RUN] Health check completed at ${updatedState.lastHeartbeat}`);
        }
      } catch (error) {
        logger.debug('[DAEMON RUN] Failed to write heartbeat', error);
      }

      heartbeatRunning = false;
    }, heartbeatIntervalMs); // Every 60 seconds in production

    // Setup signal handlers
    const cleanupAndShutdown = async (source: 'orbit-app' | 'orbit-cli' | 'os-signal' | 'exception', errorMessage?: string) => {
      logger.debug(`[DAEMON RUN] Starting proper cleanup (source: ${source}, errorMessage: ${errorMessage})...`);
      shutdownController.clearForcedExitTimer();

      // Clear health check interval
      if (restartOnStaleVersionAndHeartbeat) {
        clearInterval(restartOnStaleVersionAndHeartbeat);
        logger.debug('[DAEMON RUN] Health check interval cleared');
      }
      if (nativeLiveMirrorInterval) {
        clearInterval(nativeLiveMirrorInterval);
      }
      if (liveRuntimeMirrorInterval) {
        clearInterval(liveRuntimeMirrorInterval);
      }

      // Update daemon state before shutting down
      await apiMachine.updateDaemonState((state: DaemonState | null) => ({
        ...state,
        status: 'shutting-down',
        shutdownRequestedAt: Date.now(),
        shutdownSource: source
      }));

      // Give time for metadata update to send
      await new Promise(resolve => setTimeout(resolve, 100));

      for (const runtime of liveRuntimeManager.listRuntimes()) {
        liveRuntimeManager.detachRuntime(runtime.runtimeId, 'runtime-ended', 'Daemon shutting down');
      }
      apiMachine.shutdown();
      for (const client of nativeLiveMirrorClients.values()) {
        await client.close();
      }
      await stopControlServer();
      await cleanupDaemonState();
      await stopCaffeinate();
      await releaseDaemonLock(daemonLockHandle);

      logger.debug('[DAEMON RUN] Cleanup completed, exiting process');
      process.exit(0);
    };

    logger.debug('[DAEMON RUN] Daemon started successfully, waiting for shutdown request');

    // Wait for shutdown request
    const shutdownRequest = await shutdownController.whenShutdownRequested;
    await cleanupAndShutdown(shutdownRequest.source, shutdownRequest.errorMessage);
  } catch (error) {
    logger.debug('[DAEMON RUN][FATAL] Failed somewhere unexpectedly - exiting with code 1', error);
    process.exit(1);
  }
}
