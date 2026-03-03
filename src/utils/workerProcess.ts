import * as fs from 'fs/promises';
import { readFileSync, unlinkSync } from 'fs';
import * as path from 'path';
import { getRepoStorageRoot } from './git.js';

function getPidFilePath(): string {
  return path.join(getRepoStorageRoot(), 'brain', 'worker.pid');
}

export async function isWorkerRunning(): Promise<boolean> {
  const pidFile = getPidFilePath();
  try {
    const pidStr = await fs.readFile(pidFile, 'utf-8');
    const pid = parseInt(pidStr.trim(), 10);
    if (isNaN(pid)) return false;
    
    // Check if process exists
    process.kill(pid, 0); 
    return true;
  } catch (err: any) {
    // PIDファイルが存在するがプロセスが見つからない場合、staleなPIDファイルを自動削除
    if (err.code === 'ESRCH') {
      try {
        await fs.unlink(pidFile);
        console.log('[WorkerProcess] Cleaned up stale PID file (process no longer exists)');
      } catch {
        // 削除失敗は無視
      }
    }
    return false;
  }
}

export async function getWorkerPid(): Promise<number | null> {
  const pidFile = getPidFilePath();
  try {
    const pidStr = await fs.readFile(pidFile, 'utf-8');
    const pid = parseInt(pidStr.trim(), 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

/**
 * Acquire the worker lock by writing the PID file.
 * Throws an error if another worker is already running.
 */
export async function acquireWorkerLock(): Promise<void> {
  if (await isWorkerRunning()) {
    const pid = await getWorkerPid();
    throw new Error(`Another worker is already running (PID: ${pid}).`);
  }
  const pidFile = getPidFilePath();
  await fs.mkdir(path.dirname(pidFile), { recursive: true });
  await fs.writeFile(pidFile, process.pid.toString(), 'utf-8');
}

/**
 * Release the worker lock by removing the PID file.
 * Only removes the file if it belongs to this process.
 */
export async function releaseWorkerLock(): Promise<void> {
  const pidFile = getPidFilePath();
  try {
    const content = await fs.readFile(pidFile, 'utf-8').catch(() => null);
    if (content && content.trim() === process.pid.toString()) {
      await fs.unlink(pidFile);
    }
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      console.warn(`Failed to release worker lock: ${err.message}`);
    }
  }
}

/**
 * Synchronous version of releaseWorkerLock for process.on('exit')
 */
export function releaseWorkerLockSync(): void {
  const pidFile = getPidFilePath();
  try {
    const content = readFileSync(pidFile, 'utf-8');
    if (content && content.trim() === process.pid.toString()) {
      unlinkSync(pidFile);
    }
  } catch {
    // Silent fail on exit
  }
}
