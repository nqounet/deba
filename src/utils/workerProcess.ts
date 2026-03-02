import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
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

export async function startWorkerIfNeeded(): Promise<void> {
  if (await isWorkerRunning()) {
    return;
  }
  
  const brainDir = path.join(getRepoStorageRoot(), 'brain');
  await fs.mkdir(brainDir, { recursive: true });

  const execPath = process.execPath; 
  // ビルド済みの cli.js でも src/cli.ts でも動作するように
  const scriptPath = process.argv[1]; 

  const child = spawn(execPath, [scriptPath, 'worker'], {
    detached: true,
    stdio: 'ignore', // バックグラウンドで静かに実行
    env: { ...process.env, DEBA_IS_WORKER: '1' } // 環境変数でWorkerであることを明示
  });

  child.unref(); // 親プロセスから切り離す

  // PIDファイルが書き込まれるのを少し待つ
  await new Promise(resolve => setTimeout(resolve, 500));
}

export async function writeWorkerPid(): Promise<void> {
  const pidFile = getPidFilePath();
  await fs.mkdir(path.dirname(pidFile), { recursive: true });
  await fs.writeFile(pidFile, process.pid.toString(), 'utf-8');
}

export async function removeWorkerPid(): Promise<void> {
  const pidFile = getPidFilePath();
  try {
    await fs.unlink(pidFile);
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      console.warn(`Failed to remove worker PID file: ${err.message}`);
    }
  }
}
