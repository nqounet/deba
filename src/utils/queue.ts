import * as fs from 'fs/promises';
import * as path from 'path';
import { getRepoStorageRoot } from './git.js';

/**
 * キューの状態を表すディレクトリ名の定義
 */
export type QueueStatus = 'todo' | 'doing' | 'done' | 'failed';

const QUEUE_ROOT = path.join(getRepoStorageRoot(), 'brain', 'queue');

/**
 * キューに必要なディレクトリ構造を初期化する
 */
export async function initQueueDirs(): Promise<void> {
  const statuses: QueueStatus[] = ['todo', 'doing', 'done', 'failed'];
  
  for (const status of statuses) {
    const dirPath = path.join(QUEUE_ROOT, status);
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error: any) {
      console.error(`キューディレクトリの作成に失敗しました: ${dirPath} - ${error.message}`);
      throw error;
    }
  }
}

/**
 * 指定したステータスのディレクトリパスを取得する
 */
export function getQueueDirPath(status: QueueStatus): string {
  return path.join(QUEUE_ROOT, status);
}

/**
 * タスクファイルをあるステータスから別のステータスへ移動する（アトミックな操作）
 */
export async function moveTask(filename: string, from: QueueStatus, to: QueueStatus): Promise<void> {
  const oldPath = path.join(getQueueDirPath(from), filename);
  const newPath = path.join(getQueueDirPath(to), filename);
  
  try {
    await fs.rename(oldPath, newPath);
  } catch (error: any) {
    throw new Error(`タスクの移動に失敗しました (${from} -> ${to}): ${filename} - ${error.message}`);
  }
}

/**
 * 実行計画のステップを todo キューに投入する
 */
export async function enqueueStep(taskId: string, step: any): Promise<string> {
  const filename = `${taskId}_step_${step.id}.json`;
  const filePath = path.join(getQueueDirPath('todo'), filename);
  
  // ステップ情報に taskId を付与して保存
  const taskData = {
    taskId,
    ...step,
    enqueuedAt: new Date().toISOString()
  };
  
  try {
    await fs.writeFile(filePath, JSON.stringify(taskData, null, 2), 'utf-8');
  } catch (error: any) {
    throw new Error(`タスクのエンキューに失敗しました: ${filename} - ${error.message}`);
  }
  return filename;
}

/**
 * 特定の taskId に関連するすべてのステップを指定したステータスへ移動する
 */
export async function moveAllSteps(taskId: string, from: QueueStatus, to: QueueStatus): Promise<void> {
  const fromDir = getQueueDirPath(from);
  try {
    const files = await fs.readdir(fromDir);
    const taskFiles = files.filter(f => f.startsWith(taskId));
    
    for (const file of taskFiles) {
      await moveTask(file, from, to);
    }
  } catch (error: any) {
    console.warn(`キューの移動中にエラーが発生しました (${from} -> ${to}): ${error.message}`);
  }
}
