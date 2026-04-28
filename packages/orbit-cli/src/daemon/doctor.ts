/**
 * Daemon doctor utilities
 * 
 * Process discovery and cleanup functions for the daemon
 * Helps diagnose and fix issues with hung or orphaned processes
 */

import psList from 'ps-list';
import spawn from 'cross-spawn';

/**
 * Find all Orbit CLI processes (including current process)
 */
export async function findAllOrbitProcesses(): Promise<Array<{ pid: number, ppid: number, command: string, type: string }>> {
  try {
    const processes = await psList();
    const allProcesses: Array<{ pid: number, ppid: number, command: string, type: string }> = [];
    
    for (const proc of processes) {
      const cmd = proc.cmd || '';
      const name = proc.name || '';
      
      // Check if it's an Orbit process
      const isOrbit = name.includes('orbit') || 
                      name === 'node' && (cmd.includes('orbit-cli') || cmd.includes('orbit-cli') || cmd.includes('dist/index.mjs')) ||
                      cmd.includes('orbit.mjs') ||
                      cmd.includes('/orbit/') ||
                      (cmd.includes('tsx') && cmd.includes('src/index.ts') && (cmd.includes('orbit-cli') || cmd.includes('orbit-cli')));
      
      if (!isOrbit) continue;

      // Classify process type
      let type = 'unknown';
      if (proc.pid === process.pid) {
        type = 'current';
      } else if (cmd.includes('--version')) {
        type = cmd.includes('tsx') ? 'dev-daemon-version-check' : 'daemon-version-check';
      } else if (cmd.includes('daemon start-sync') || cmd.includes('daemon start')) {
        type = cmd.includes('tsx') ? 'dev-daemon' : 'daemon';
      } else if (cmd.includes('--started-by daemon')) {
        type = cmd.includes('tsx') ? 'dev-daemon-spawned' : 'daemon-spawned-session';
      } else if (cmd.includes('doctor')) {
        type = cmd.includes('tsx') ? 'dev-doctor' : 'doctor';
      } else if (cmd.includes('--yolo')) {
        type = 'dev-session';
      } else {
        type = cmd.includes('tsx') ? 'dev-related' : 'user-session';
      }

      allProcesses.push({ pid: proc.pid, ppid: proc.ppid ?? 0, command: cmd || name, type });
    }

    return allProcesses;
  } catch (error) {
    return [];
  }
}

/**
 * Find all runaway Orbit CLI processes that should be killed
 */
export async function findRunawayOrbitProcesses(): Promise<Array<{ pid: number, command: string }>> {
  const allProcesses = await findAllOrbitProcesses();
  
  // Filter to just runaway processes (excluding current process)
  return allProcesses
    .filter(p => 
      p.pid !== process.pid && (
        p.type === 'daemon' ||
        p.type === 'dev-daemon' ||
        p.type === 'daemon-spawned-session' ||
        p.type === 'dev-daemon-spawned' ||
        p.type === 'daemon-version-check' ||
        p.type === 'dev-daemon-version-check'
      )
    )
    .map(p => ({ pid: p.pid, command: p.command }));
}

function extractDaemonSpawnedResumeKey(command: string): string | null {
  if (!command.includes('--started-by daemon')) {
    return null;
  }

  const resumeMatch = command.match(/--resume\s+([^\s]+)/);
  if (!resumeMatch) {
    return null;
  }

  const toolMatch = command.match(/\b(claude|codex|gemini|openclaw)\b/);
  if (!toolMatch) {
    return null;
  }

  return `${toolMatch[1]}:${resumeMatch[1]}`;
}

export async function findDuplicateDaemonSpawnedSessionProcesses(): Promise<Array<{ pid: number, ppid: number, command: string }>> {
  const allProcesses = await findAllOrbitProcesses();
  const grouped = new Map<string, Array<{ pid: number, ppid: number, command: string }>>();

  for (const proc of allProcesses) {
    if (proc.type !== 'daemon-spawned-session' && proc.type !== 'dev-daemon-spawned') {
      continue;
    }

    const resumeKey = extractDaemonSpawnedResumeKey(proc.command);
    if (!resumeKey) {
      continue;
    }

    const existing = grouped.get(resumeKey);
    if (existing) {
      existing.push(proc);
      continue;
    }
    grouped.set(resumeKey, [proc]);
  }

  const duplicates: Array<{ pid: number, ppid: number, command: string }> = [];

  for (const processes of grouped.values()) {
    if (processes.length < 2) {
      continue;
    }

    const sorted = [...processes].sort((left, right) => {
      const leftOrphan = left.ppid === 1 || left.ppid === 0;
      const rightOrphan = right.ppid === 1 || right.ppid === 0;
      if (leftOrphan !== rightOrphan) {
        return leftOrphan ? 1 : -1;
      }
      return right.pid - left.pid;
    });

    duplicates.push(...sorted.slice(1).map((process) => ({
      pid: process.pid,
      ppid: process.ppid,
      command: process.command,
    })));
  }

  return duplicates;
}

export async function findOrphanDaemonSpawnedSessionProcesses(): Promise<Array<{ pid: number, ppid: number, command: string }>> {
  const allProcesses = await findAllOrbitProcesses();

  return allProcesses
    .filter((proc) => proc.type === 'daemon-spawned-session' || proc.type === 'dev-daemon-spawned')
    .filter((proc) => proc.ppid === 1 || proc.ppid === 0)
    .map((proc) => ({
      pid: proc.pid,
      ppid: proc.ppid,
      command: proc.command,
    }));
}

export async function killOrphanDaemonSpawnedSessionProcesses(): Promise<{ killed: number, errors: Array<{ pid: number, error: string }> }> {
  const orphans = await findOrphanDaemonSpawnedSessionProcesses();
  const errors: Array<{ pid: number, error: string }> = [];
  let killed = 0;

  for (const { pid } of orphans) {
    try {
      process.kill(pid, 'SIGTERM');
      await new Promise((resolve) => setTimeout(resolve, 500));

      const processes = await psList();
      const stillAlive = processes.find((proc) => proc.pid === pid);
      if (stillAlive) {
        process.kill(pid, 'SIGKILL');
      }

      killed += 1;
    } catch (error) {
      errors.push({
        pid,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { killed, errors };
}

export async function killDuplicateDaemonSpawnedSessionProcesses(): Promise<{ killed: number, errors: Array<{ pid: number, error: string }> }> {
  const duplicates = await findDuplicateDaemonSpawnedSessionProcesses();
  const errors: Array<{ pid: number, error: string }> = [];
  let killed = 0;

  for (const { pid } of duplicates) {
    try {
      process.kill(pid, 'SIGTERM');
      await new Promise((resolve) => setTimeout(resolve, 500));

      const processes = await psList();
      const stillAlive = processes.find((proc) => proc.pid === pid);
      if (stillAlive) {
        process.kill(pid, 'SIGKILL');
      }

      killed += 1;
    } catch (error) {
      errors.push({
        pid,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { killed, errors };
}

/**
 * Kill all runaway Orbit CLI processes
 */
export async function killRunawayOrbitProcesses(): Promise<{ killed: number, errors: Array<{ pid: number, error: string }> }> {
  const runawayProcesses = await findRunawayOrbitProcesses();
  const errors: Array<{ pid: number, error: string }> = [];
  let killed = 0;
  
  for (const { pid, command } of runawayProcesses) {
    try {
      console.log(`Killing runaway process PID ${pid}: ${command}`);
      
      if (process.platform === 'win32') {
        // Windows: use taskkill
        const result = spawn.sync('taskkill', ['/F', '/PID', pid.toString()], { stdio: 'pipe' });
        if (result.error) throw result.error;
        if (result.status !== 0) throw new Error(`taskkill exited with code ${result.status}`);
      } else {
        // Unix: try SIGTERM first
        process.kill(pid, 'SIGTERM');
        
        // Wait a moment
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check if still alive
        const processes = await psList();
        const stillAlive = processes.find(p => p.pid === pid);
        if (stillAlive) {
          console.log(`Process PID ${pid} ignored SIGTERM, using SIGKILL`);
          process.kill(pid, 'SIGKILL');
        }
      }
      
      console.log(`Successfully killed runaway process PID ${pid}`);
      killed++;
    } catch (error) {
      const errorMessage = (error as Error).message;
      errors.push({ pid, error: errorMessage });
      console.log(`Failed to kill process PID ${pid}: ${errorMessage}`);
    }
  }

  return { killed, errors };
}
