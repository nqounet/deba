import * as fs from 'fs/promises';
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
    return false;
  }
}

export async function writeWorkerPid(): Promise<void> {
  if (await isWorkerRunning()) {
    throw new Error('Another worker is already running.');
  }
  const pidFile = getPidFilePath();
  await fs.mkdir(path.dirname(pidFile), { recursive: true });
  await fs.writeFile(pidFile, process.pid.toString(), 'utf-8');
}

export async function removeWorkerPid(): Promise<void> {
  const pidFile = getPidFilePath();
  try {
    // Only remove if it's our own PID
    const content = await fs.readFile(pidFile, 'utf-8').catch(() => null);
    if (content && content.trim() === process.pid.toString()) {
      await fs.unlink(pidFile);
    }
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      console.warn(`Failed to remove worker PID file: ${err.message}`);
    }
  }
}
